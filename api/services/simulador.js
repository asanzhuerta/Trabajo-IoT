// Control del simulador de Node-RED desde la API (lo usa el dashboard de simulación de A).
// La API publica la orden por MQTT (QoS 1, sin retain) y el simulador la recibe con un mqtt in:
//   control/fase                    la fase de juego, como texto: "presion_alta"     (motor táctico de A)
//   control/reset                   "true": vuelve a la formación inicial             (motor táctico de A)
//   control/jugadores/<id>/sensores {"pulse": 155, "temperature": 38.2, "durationSeconds": 30, "ts": "…"}
//                                   fuerza el pulso o la temperatura que publica ese jugador; {"reset": true} lo quita
// La API recuerda lo último que mandó para enseñarlo en los dashboards; si se reinicia Node-RED, el simulador
// vuelve a su comportamiento normal aunque aquí siga apuntado.

const publisher = require('../mqtt/publisher');
const websocket = require('../servers/websocket');
const { ErrorHttp } = require('./errores');

const FASES = {
    ataque_organizado: 'Ataque organizado',
    transicion_defensiva: 'Transición defensiva',
    presion_alta: 'Presión alta',
    defensa_organizada: 'Defensa organizada',
    transicion_ofensiva: 'Transición ofensiva'
};

// Los valores forzados tienen que pasar la validación de la telemetría (pulso de 20 a 250 lpm y temperatura
// de 30 a 45 °C) y dejar provocar las alertas: CALOR_ROJA a 40 °C, INCIDENTE con la FC por debajo de 50…
const RANGOS = {
    pulse: { min: 30, max: 220, unidad: 'bpm' },
    temperature: { min: 35, max: 42, unidad: 'C' },
    durationSeconds: { min: 0, max: 3600, unidad: 's', porDefecto: 30 }   // 0 = hasta que se quite
};

const IDS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11'];

const ultimo = { fase: null, ajustes: {} };   // lo último que se mandó, para los dashboards

// ---------------------------------------------------------------- validaciones (test/simulador.test.js)

function validarFase(fase) {
    if (!Object.prototype.hasOwnProperty.call(FASES, fase)) {
        throw new ErrorHttp(400, 'Fase no válida. Las válidas son: ' + Object.keys(FASES).join(', '));
    }
    return fase;
}

function validarJugador(id) {
    if (!IDS.includes(id)) throw new ErrorHttp(404, 'No existe el jugador ' + id + ' (son p1…p11)');
    return id;
}

function enRango(nombre, valor, entero) {
    const r = RANGOS[nombre];
    if (typeof valor !== 'number' || !Number.isFinite(valor) || (entero && !Number.isInteger(valor))) {
        throw new ErrorHttp(400, nombre + ' debe ser un número' + (entero ? ' entero' : ''));
    }
    if (valor < r.min || valor > r.max) {
        throw new ErrorHttp(400, nombre + ' fuera de rango (' + r.min + ' a ' + r.max + ' ' + r.unidad + ')');
    }
    return valor;
}

// { pulse?, temperature?, durationSeconds? } → el ajuste que se publica (durationSeconds siempre va)
function validarAjuste(datos) {
    const { pulse, temperature, durationSeconds } = datos || {};
    if (pulse === undefined && temperature === undefined) {
        throw new ErrorHttp(400, 'Indica pulse, temperature o los dos');
    }
    const ajuste = {};
    if (pulse !== undefined) ajuste.pulse = enRango('pulse', pulse);
    if (temperature !== undefined) ajuste.temperature = enRango('temperature', temperature);
    ajuste.durationSeconds = durationSeconds === undefined
        ? RANGOS.durationSeconds.porDefecto
        : enRango('durationSeconds', durationSeconds, true);
    return ajuste;
}

// ---------------------------------------------------------------- órdenes

async function enviar(topic, mensaje) {
    if (publisher.estado() !== 'connected') throw new ErrorHttp(503, 'Sin conexión con Mosquitto');
    try {
        await publisher.publicar(topic, mensaje);
    } catch (err) {
        throw new ErrorHttp(502, 'No se pudo publicar la orden: ' + err.message);
    }
}

function topicSensores(id) {
    return 'control/jugadores/' + id + '/sensores';
}

// Los ajustes que siguen en vigor (los de duración fija caducan solos también en el simulador)
function ajustesVigentes() {
    const ahora = Date.now();
    for (const [id, a] of Object.entries(ultimo.ajustes)) {
        if (a.hasta && Date.parse(a.hasta) <= ahora) delete ultimo.ajustes[id];
    }
    return ultimo.ajustes;
}

function avisar() {
    websocket.sendMessage({ tipo: 'simulador', fase: ultimo.fase, ajustes: ajustesVigentes() });
}

async function cambiarFase(fase) {
    validarFase(fase);
    await enviar('control/fase', fase);
    ultimo.fase = fase;
    avisar();
    return { mensaje: 'Orden publicada', topic: 'control/fase', fase: fase };
}

async function ajustarSensores(id, datos) {
    validarJugador(id);
    const ajuste = validarAjuste(datos);
    const ts = new Date();
    await enviar(topicSensores(id), { ...ajuste, ts: ts.toISOString() });
    const hasta = ajuste.durationSeconds > 0 ? new Date(ts.getTime() + ajuste.durationSeconds * 1000).toISOString() : null;
    ultimo.ajustes[id] = { ...ajuste, hasta: hasta };
    avisar();
    return { mensaje: 'Orden publicada', topic: topicSensores(id), jugadorId: id, ajuste: ajuste, hasta: hasta };
}

async function quitarAjuste(id) {
    validarJugador(id);
    await enviar(topicSensores(id), { reset: true });
    delete ultimo.ajustes[id];
    avisar();
    return { mensaje: 'Orden publicada', topic: topicSensores(id), jugadorId: id };
}

// Formación inicial y fuera todos los ajustes (a los 11, por si la API no sabe de alguno)
async function reiniciar() {
    await enviar('control/reset', 'true');
    for (const id of IDS) await enviar(topicSensores(id), { reset: true });
    ultimo.fase = null;
    ultimo.ajustes = {};
    avisar();
    return { mensaje: 'Orden publicada', topic: 'control/reset' };
}

function estado() {
    return {
        mqtt: publisher.estado(),
        fase: ultimo.fase,
        ajustes: ajustesVigentes(),
        fases: Object.entries(FASES).map(function ([codigo, nombre]) { return { codigo: codigo, nombre: nombre }; }),
        rangos: RANGOS
    };
}

module.exports = { FASES, validarFase, validarJugador, validarAjuste, cambiarFase, ajustarSensores, quitarAjuste, reiniciar, estado };
