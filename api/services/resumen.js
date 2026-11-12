// Resúmenes de 10 s. Las lecturas de cada jugador se acumulan en una "ventana" y,
// al cerrarse, se convierten en un documento de la colección lecturas.
// Leen los sensores en el formato de A (sensores.js). Los resúmenes son datos que calcula la API
// (medias, máximos, metros…), no lecturas de un sensor, así que tienen sus propios campos.
// Son funciones puras: no tocan Mongo ni el estado global (se prueban en test/estado.test.js).

const sensores = require('./sensores');

const VENTANA_MS = 10000;
const VEL_ALTA = 19.8;   // km/h: a partir de aquí la carrera cuenta como de alta intensidad

function inicioVentana(ms) {
    return Math.floor(ms / VENTANA_MS) * VENTANA_MS;
}

function nuevaVentana(inicio) {
    return {
        inicio: inicio,
        muestras: 0,
        sumVel: 0, velMax: 0,
        distancia: 0, distAltaInt: 0,
        sumFc: 0, fcMax: 0,
        temp: null,
        sumAsim: 0, nAsim: 0,
        sprints: 0,
        acelAltas: 0, decelAltas: 0,
        x: null, y: null
    };
}

// s: sensores de la lectura (formato de A).
// extra: { delta (m recorridos desde la lectura anterior), altaInt (m de esos a alta intensidad),
//          sprint (true si empieza uno), acelAltas y decelAltas (0 o 1) }
function acumular(v, s, extra) {
    const vel = sensores.velocidad(s);
    const pulso = sensores.pulso(s);
    const temp = sensores.temperatura(s);
    const asimetria = sensores.asimetria(s);
    v.muestras++;
    v.sumVel += vel;
    v.velMax = Math.max(v.velMax, vel);
    v.distancia += extra.delta;
    v.distAltaInt += extra.altaInt;
    v.sumFc += pulso;
    v.fcMax = Math.max(v.fcMax, pulso);
    if (temp !== null) v.temp = temp;
    if (asimetria !== null) {
        v.sumAsim += asimetria;
        v.nAsim++;
    }
    if (extra.sprint) v.sprints++;
    v.acelAltas += extra.acelAltas || 0;
    v.decelAltas += extra.decelAltas || 0;
    v.x = sensores.x(s);
    v.y = sensores.y(s);
}

function r1(n) {
    return Math.round(n * 10) / 10;
}

// Devuelve el documento de Lectura, o null si en la ventana no hubo ninguna lectura válida
// (por ejemplo, si el jugador estuvo todo el rato sin señal).
function cerrar(v, jugadorId, sesionId) {
    if (v.muestras === 0) return null;
    return {
        ts: new Date(v.inicio),
        jugadorId: jugadorId,
        sesionId: sesionId || null,
        muestras: v.muestras,
        velMedia: r1(v.sumVel / v.muestras),
        velMax: r1(v.velMax),
        distancia: r1(v.distancia),
        distAltaInt: r1(v.distAltaInt),
        fcMedia: Math.round(v.sumFc / v.muestras),
        fcMax: v.fcMax,
        temp: v.temp,
        asimetria: v.nAsim ? r1(v.sumAsim / v.nAsim) : null,
        sprints: v.sprints,
        acelAltas: v.acelAltas,
        decelAltas: v.decelAltas,
        x: r1(v.x),
        y: r1(v.y)
    };
}

module.exports = { VENTANA_MS, VEL_ALTA, inicioVentana, nuevaVentana, acumular, cerrar };
