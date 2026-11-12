// Estado en vivo de cada jugador, en memoria:
//   - los últimos sensores, en el formato del simulador de A (sensors.gps.speed.value…), para GET /estado,
//     el WebSocket y las reglas. La temperatura y las plantillas no llegan en todas las lecturas, así que
//     se conserva el último valor de cada sensor;
//   - los valores derivados (%FCmáx, asimetría, zonas);
//   - un historial corto de los últimos segundos (lo usa el motor de alertas);
//   - los acumulados de la sesión (distancia, metros a alta intensidad, sprints y acciones de alta intensidad);
//   - la ventana de 10 s que se está rellenando;
//   - las alertas activas (código → severidad), para pintar el semáforo.

const resumen = require('./resumen');
const metricas = require('./metricas');
const sensores = require('./sensores');
const { semaforo } = require('./semaforo');

const HISTORIAL_SEG = 180;
// La asimetría es la media de las plantillas del último minuto. Con el simulador de A, 10 s no bastan:
// al moverse de lado carga un pie varios segundos seguidos (medido: 10 s pasa del umbral el 23 % del
// tiempo, 60 s nunca). Un desequilibrio por lesión, en cambio, se mantiene durante minutos.
const VENTANA_ASIMETRIA_MS = 60000;
// Y hace falta casi un minuto entero de plantillas: con pocos segundos, la "media" es una pisada o un
// desplazamiento lateral (al arrancar el simulador de A saltaba ASIMETRIA en 10 de 11 jugadores en el
// segundo 0, y con 20 s todavía en alguno). Se pide tiempo cubierto y no un número de lecturas porque
// A manda las plantillas cada segundo y el fake-gateway cada 2 s.
const MIN_TIEMPO_ASIMETRIA_MS = 45000;
const MIN_LECTURAS_ASIMETRIA = 15;
const GRACIA_MS = 5000;   // margen antes de cerrar una ventana a la que ya no llegan lecturas

const jugadores = new Map();
let sesionId = null;

function sesionVacia() {
    return { distancia: 0, distAltaInt: 0, sprints: 0, acelAltas: 0, decelAltas: 0 };
}

function nuevo(jugadorId) {
    return {
        jugadorId: jugadorId,
        ts: null,
        estado: null,          // 'ok' | 'sin_senal'
        sensors: null,         // últimos sensores, formato de A
        derivados: null,       // { pctFcMax, asimetria, zonaVelocidad, zonaFc }
        historial: [],
        ventana: null,
        ultimaDist: null,
        pies: [],              // diferencias izq − der del último minuto, para la asimetría
        sesion: sesionVacia(),
        alertas: new Map(),        // código → severidad de las alertas activas
        confirmadas: new Map()     // código → momento (ms) en que se confirmó la última
    };
}

function obtenerOCrear(id) {
    let e = jugadores.get(id);
    if (!e) {
        e = nuevo(id);
        jugadores.set(id, e);
    }
    return e;
}

function apuntarHistorial(e, punto) {
    e.historial.push(punto);
    if (e.historial.length > HISTORIAL_SEG) e.historial.shift();
}

// Incorpora una lectura ya validada (ver validacion.js). Devuelve:
//   resumen: el resumen de 10 s si esta lectura cierra una ventana, o null;
//   eventos: sprints, aceleraciones, desaceleraciones, cambios de dirección e impactos de esta lectura.
function procesar(lectura, perfil) {
    const e = obtenerOCrear(lectura.jugadorId);
    const t = lectura.ts.getTime();
    const inicio = resumen.inicioVentana(t);

    let cerrado = null;
    if (e.ventana && inicio > e.ventana.inicio) {
        cerrado = resumen.cerrar(e.ventana, e.jugadorId, sesionId);
        e.ventana = null;
    }
    if (!e.ventana) e.ventana = resumen.nuevaVentana(inicio);

    e.ts = lectura.ts;
    e.estado = lectura.estado;

    if (lectura.estado === 'sin_senal') {
        apuntarHistorial(e, { ts: t, estado: 'sin_senal' });
        return { resumen: cerrado, eventos: [] };
    }

    const s = lectura.sensors;
    const vel = sensores.velocidad(s);
    const dist = sensores.distancia(s);

    // Metros desde la lectura anterior. Si la distancia baja, el wearable se ha reiniciado.
    let delta = 0;
    if (e.ultimaDist !== null && dist >= e.ultimaDist) delta = dist - e.ultimaDist;
    e.ultimaDist = dist;
    const altaInt = vel > resumen.VEL_ALTA ? delta : 0;

    const eventos = metricas.eventos(lectura, sensores.velocidad(e.sensors));
    const sprint = eventos.some(function (ev) { return ev.tipo === 'sprint'; });
    const acciones = metricas.accionesAltas(s);

    // Los sensores que no vienen en esta lectura (temperatura, plantillas…) conservan su último valor
    e.sensors = { ...(e.sensors || {}), ...s };

    // Asimetría: media de las plantillas del último minuto (ver sensores.asimetriaMedia)
    const dif = sensores.diferenciaPies(s);
    if (dif !== null) e.pies.push({ ts: t, dif: dif });
    while (e.pies.length && e.pies[0].ts <= t - VENTANA_ASIMETRIA_MS) e.pies.shift();
    const cubierto = e.pies.length ? t - e.pies[0].ts : 0;
    const asimetria = e.pies.length < MIN_LECTURAS_ASIMETRIA || cubierto < MIN_TIEMPO_ASIMETRIA_MS
        ? null
        : sensores.asimetriaMedia(e.pies.map(function (p) { return p.dif; }));

    const pctFcMax = Math.round(sensores.pulso(s) / perfil.fcMax * 100);
    e.derivados = {
        pctFcMax: pctFcMax,
        asimetria: asimetria,
        zonaVelocidad: metricas.zonaVelocidad(vel),
        zonaFc: metricas.zonaFc(pctFcMax)
    };

    e.sesion.distancia += delta;
    e.sesion.distAltaInt += altaInt;
    e.sesion.acelAltas += acciones.acel;
    e.sesion.decelAltas += acciones.decel;
    if (sprint) e.sesion.sprints++;

    resumen.acumular(e.ventana, s, {
        delta: delta, altaInt: altaInt, sprint: sprint,
        acelAltas: acciones.acel, decelAltas: acciones.decel
    });

    apuntarHistorial(e, {
        ts: t, estado: 'ok', sensors: e.sensors,
        pctFcMax: pctFcMax, asimetria: e.derivados.asimetria
    });

    return { resumen: cerrado, eventos: eventos };
}

// Cierra las ventanas que llevan más de 10 s + margen sin recibir lecturas
// (por ejemplo, si la pasarela se ha parado). Devuelve los resúmenes que haya que guardar.
function cerrarVencidas(ahora) {
    const cerrados = [];
    for (const e of jugadores.values()) {
        if (e.ventana && ahora >= e.ventana.inicio + resumen.VENTANA_MS + GRACIA_MS) {
            const r = resumen.cerrar(e.ventana, e.jugadorId, sesionId);
            if (r) cerrados.push(r);
            e.ventana = null;
        }
    }
    return cerrados;
}

// Cierra ya todas las ventanas abiertas, aunque no hayan llegado a 10 s. Se usa al empezar y al terminar una
// sesión, para que cada resumen de 10 s quede entero dentro o fuera de ella. Devuelve los resúmenes a guardar.
function cerrarTodas() {
    const cerrados = [];
    for (const e of jugadores.values()) {
        if (e.ventana) {
            const r = resumen.cerrar(e.ventana, e.jugadorId, sesionId);
            if (r) cerrados.push(r);
            e.ventana = null;
        }
    }
    return cerrados;
}

function obtener(id) {
    return jugadores.get(id) || null;
}

function todos() {
    return Array.from(jugadores.values());
}

function semaforoDe(e) {
    return semaforo(e.alertas.values());
}

// Lo que se manda por WebSocket una vez por segundo: los sensores de cada jugador en el formato de A
function vista() {
    const lista = [];
    for (const e of jugadores.values()) {
        lista.push({
            jugadorId: e.jugadorId,
            ts: e.ts,
            estado: e.estado,
            semaforo: semaforoDe(e),
            sensors: e.sensors,
            derivados: e.derivados
        });
    }
    return lista.sort(function (a, b) { return a.jugadorId.localeCompare(b.jugadorId, 'es', { numeric: true }); });
}

// Al empezar o terminar una sesión se ponen a cero los acumulados (id null = no hay sesión en curso)
function iniciarSesion(id) {
    sesionId = id || null;
    for (const e of jugadores.values()) {
        e.sesion = sesionVacia();
    }
}

function sesionActual() {
    return sesionId;
}

// Solo para los tests
function limpiar() {
    jugadores.clear();
    sesionId = null;
}

module.exports = {
    procesar, cerrarVencidas, cerrarTodas, obtener, obtenerOCrear, todos, vista,
    iniciarSesion, sesionActual, limpiar
};
