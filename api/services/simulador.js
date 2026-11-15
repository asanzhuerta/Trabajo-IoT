// Control del simulador de Node-RED desde la API (lo usa el dashboard de simulación de A).
// La API publica la orden por MQTT y el simulador la recibe con un mqtt in en control/#:
//   control/fase       la fase de juego, como texto: "ataque_organizado"…  (la entiende el motor táctico de A)
//   control/escenario  {"jugadorId": "p8", "escenario": "golpe_calor", "ts": "…"}  ("normal" lo quita)
//   control/reset      "true": vuelve a la formación inicial (también lo entiende el motor táctico)
// La API recuerda lo último que mandó para enseñarlo en el dashboard; si se reinicia Node-RED, el simulador
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

// Cada escenario de salud y la alerta que debería provocar
const ESCENARIOS = {
    normal: { nombre: 'Normal', descripcion: 'Quita el escenario: vuelve al comportamiento normal', alerta: null },
    golpe_calor: { nombre: 'Golpe de calor', descripcion: 'La temperatura interna sube hasta pasar de 40 °C', alerta: 'CALOR_AMBAR y CALOR_ROJA' },
    fc_alta: { nombre: 'FC alta', descripcion: 'FC sostenida por encima del 92 % de su FCmáx', alerta: 'FC_ALTA' },
    desacople: { nombre: 'Desacople', descripcion: 'FC por encima del 85 % de la FCmáx caminando', alerta: 'FC_DESACOPLE' },
    recuperacion_lenta: { nombre: 'Recuperación lenta', descripcion: 'Sprint y después camina, pero la FC apenas baja', alerta: 'RECUPERACION_LENTA' },
    incidente: { nombre: 'Incidente', descripcion: 'Impacto de más de 4 g, se queda inmóvil y la FC cae', alerta: 'INCIDENTE' },
    asimetria: { nombre: 'Asimetría', descripcion: 'Carga cada vez más un pie que el otro', alerta: 'ASIMETRIA' },
    sobrecarga: { nombre: 'Sobrecarga', descripcion: 'Arranca y frena sin parar (más de 3 m/s²)', alerta: 'SOBRECARGA' },
    sin_senal: { nombre: 'Sensor caído', descripcion: 'El wearable deja de publicar', alerta: 'SIN_SENAL' }
};

const ID_JUGADOR = /^p(?:[1-9]|1[01])$/;

const ultimo = { fase: null, escenarios: {} };   // lo último que se mandó, para el dashboard

// Validaciones puras (test/simulador.test.js)
function validarFase(fase) {
    if (!Object.prototype.hasOwnProperty.call(FASES, fase)) {
        throw new ErrorHttp(400, 'Fase no válida. Las válidas son: ' + Object.keys(FASES).join(', '));
    }
    return fase;
}

function validarEscenario(datos) {
    const { jugadorId, escenario } = datos || {};
    if (typeof jugadorId !== 'string' || !ID_JUGADOR.test(jugadorId)) {
        throw new ErrorHttp(400, 'jugadorId debe ser p1…p11');
    }
    if (!Object.prototype.hasOwnProperty.call(ESCENARIOS, escenario)) {
        throw new ErrorHttp(400, 'Escenario no válido. Los válidos son: ' + Object.keys(ESCENARIOS).join(', '));
    }
    return { jugadorId: jugadorId, escenario: escenario };
}

async function enviar(topic, mensaje) {
    if (publisher.estado() !== 'connected') throw new ErrorHttp(503, 'Sin conexión con Mosquitto');
    try {
        await publisher.publicar(topic, mensaje);
    } catch (err) {
        throw new ErrorHttp(502, 'No se pudo publicar la orden: ' + err.message);
    }
}

function avisar() {
    websocket.sendMessage({ tipo: 'simulador', fase: ultimo.fase, escenarios: ultimo.escenarios });
}

async function cambiarFase(fase) {
    validarFase(fase);
    await enviar('control/fase', fase);
    ultimo.fase = fase;
    avisar();
    return { mensaje: 'Orden publicada', topic: 'control/fase', fase: fase };
}

async function cambiarEscenario(datos) {
    const orden = validarEscenario(datos);
    const mensaje = { ...orden, ts: new Date().toISOString() };
    await enviar('control/escenario', mensaje);
    if (orden.escenario === 'normal') delete ultimo.escenarios[orden.jugadorId];
    else ultimo.escenarios[orden.jugadorId] = orden.escenario;
    avisar();
    return { mensaje: 'Orden publicada', topic: 'control/escenario', ...mensaje };
}

async function reiniciar() {
    await enviar('control/reset', 'true');
    ultimo.fase = null;
    ultimo.escenarios = {};
    avisar();
    return { mensaje: 'Orden publicada', topic: 'control/reset' };
}

function estado() {
    return {
        mqtt: publisher.estado(),
        fase: ultimo.fase,
        escenarios: ultimo.escenarios,
        fases: Object.entries(FASES).map(function ([codigo, nombre]) { return { codigo: codigo, nombre: nombre }; }),
        escenariosDisponibles: Object.entries(ESCENARIOS).map(function ([codigo, e]) { return { codigo: codigo, ...e }; })
    };
}

module.exports = { FASES, ESCENARIOS, validarFase, validarEscenario, cambiarFase, cambiarEscenario, reiniciar, estado };
