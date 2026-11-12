// Métricas de rendimiento a partir de cada lectura, leyendo los sensores en el formato de A.
// Son funciones puras (test/metricas.test.js).
//
// Zonas de velocidad (km/h), las habituales en fútbol (STATSports, SciSports):
//   andar < 7 · trote 7–14,4 · carrera 14,4–19,8 · alta intensidad 19,8–25 · sprint > 25
// Zonas de FC (% de la FCmáx): Z1 < 60 · Z2 60–70 · Z3 70–80 · Z4 80–90 · Z5 ≥ 90

const ZONAS_VELOCIDAD = [
    { nombre: 'andar', hasta: 7 },
    { nombre: 'trote', hasta: 14.4 },
    { nombre: 'carrera', hasta: 19.8 },
    { nombre: 'alta', hasta: 25 },
    { nombre: 'sprint', hasta: Infinity }
];

const sensores = require('./sensores');

const VEL_SPRINT = 25;           // km/h
const ACCION_ALTA = 3;           // m/s²: aceleración o desaceleración de alta intensidad
const GIRO_MIN = 45;             // grados para contar un cambio de dirección
const VEL_GIRO_MIN = 10;         // km/h: girar parado no cuenta
const IMPACTO_MIN = 2.5;         // g para guardar un impacto como evento

function zonaVelocidad(vel) {
    for (const z of ZONAS_VELOCIDAD) {
        if (vel < z.hasta) return z.nombre;
    }
    return 'sprint';
}

function zonaFc(pctFcMax) {
    if (pctFcMax < 60) return 'Z1';
    if (pctFcMax < 70) return 'Z2';
    if (pctFcMax < 80) return 'Z3';
    if (pctFcMax < 90) return 'Z4';
    return 'Z5';
}

// Acciones de alta intensidad de una lectura. A 1 Hz, una aceleración de 3 m/s² o más es un cambio
// de velocidad mantenido durante todo el segundo, así que cumple el criterio de ±3 m/s² durante 0,5 s.
function accionesAltas(s) {
    return {
        acel: (sensores.aceleracion(s) || 0) >= ACCION_ALTA ? 1 : 0,
        decel: (sensores.desaceleracion(s) || 0) >= ACCION_ALTA ? 1 : 0
    };
}

// Eventos destacados de una lectura. velAnterior es la velocidad del segundo anterior (o null).
function eventos(lectura, velAnterior) {
    if (lectura.estado !== 'ok') return [];
    const s = lectura.sensors;
    const lista = [];
    const base = { jugadorId: lectura.jugadorId, ts: lectura.ts };
    const vel = sensores.velocidad(s);
    const giro = Math.abs(sensores.giro(s) || 0);
    const impacto = sensores.impacto(s);
    const acciones = accionesAltas(s);

    // Un sprint empieza cuando se cruza el umbral (no se cuenta cada segundo que dura)
    if (vel > VEL_SPRINT && (velAnterior === null || velAnterior <= VEL_SPRINT)) {
        lista.push({ ...base, tipo: 'sprint', valor: vel });
    }
    if (acciones.acel) lista.push({ ...base, tipo: 'aceleracion', valor: sensores.aceleracion(s) });
    if (acciones.decel) lista.push({ ...base, tipo: 'desaceleracion', valor: sensores.desaceleracion(s) });
    if (giro >= GIRO_MIN && vel >= VEL_GIRO_MIN) lista.push({ ...base, tipo: 'cambio_direccion', valor: giro });
    if (impacto !== null && impacto >= IMPACTO_MIN) lista.push({ ...base, tipo: 'impacto', valor: impacto });
    return lista;
}

module.exports = { ZONAS_VELOCIDAD, VEL_SPRINT, ACCION_ALTA, zonaVelocidad, zonaFc, accionesAltas, eventos };
