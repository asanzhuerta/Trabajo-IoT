// Histórico de 4 semanas de sesiones (ya cerradas, con su resumen por jugador) para que el ACWR tenga datos.
// Lo usa el seed. Cada bloque de 7 días, contando hacia atrás desde ahora: tres entrenamientos y un partido.
// Se cuenta desde ahora (y no por días de la semana) para que la ventana de 7 días del ACWR tenga siempre
// 4 sesiones, como las demás; si no, el ratio cambia según el día en que se lance el seed.
//
// La carga de las tres primeras semanas es la normal de cada posición; la última cambia en algunos
// jugadores para que se vean las tres franjas del ACWR:
//   p7  pico de carga esta semana (×1,6)       → ACWR alto (≈ 1,4)
//   p5  en readaptación, carga reducida (×0,5)  → ACWR bajo (≈ 0,6)
//   el resto, algo por encima de lo normal      → zona óptima (≈ 1,05)
// Los números aleatorios salen siempre iguales (semilla fija), así que el seed es reproducible.

const plantilla = require('./plantilla');

const DIA_MS = 24 * 60 * 60 * 1000;

// Por posición, en un partido: metros totales, metros a alta intensidad y velocidad máxima típica
const PERFIL_POSICION = {
    POR: { distancia: 5200, altaInt: 70, velMax: 24 },
    LD: { distancia: 10600, altaInt: 680, velMax: 32 },
    LI: { distancia: 10600, altaInt: 680, velMax: 32 },
    DFC: { distancia: 9800, altaInt: 420, velMax: 30 },
    MCD: { distancia: 11200, altaInt: 500, velMax: 30 },
    MC: { distancia: 11600, altaInt: 620, velMax: 31 },
    MCO: { distancia: 11300, altaInt: 640, velMax: 31 },
    ED: { distancia: 10400, altaInt: 780, velMax: 33 },
    EI: { distancia: 10400, altaInt: 780, velMax: 33 },
    DC: { distancia: 10200, altaInt: 720, velMax: 33 }
};
const ULTIMA_SEMANA = { p7: 1.6, p5: 0.5 };
const ULTIMA_SEMANA_RESTO = 1.05;
const SEMANA = [   // días antes del final de cada bloque de 7 días
    { antes: 6, tipo: 'entrenamiento' },
    { antes: 5, tipo: 'entrenamiento' },
    { antes: 3, tipo: 'entrenamiento' },
    { antes: 1, tipo: 'partido' }
];

// Generador pseudoaleatorio con semilla (mulberry32)
function aleatorio(semilla) {
    let a = semilla;
    return function () {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function resumenJugador(j, tipo, factor, azar) {
    const p = PERFIL_POSICION[j.posicion];
    const ruido = function () { return 0.9 + azar() * 0.2; };   // ±10 %
    const escala = (tipo === 'partido' ? 1 : 0.55) * factor;
    const minutos = tipo === 'partido' ? 90 + Math.round(azar() * 5) : 75 + Math.round(azar() * 15);
    const altaInt = Math.round(p.altaInt * escala * ruido());
    const esPortero = j.posicion === 'POR';
    return {
        jugadorId: j.id,
        minutos: minutos,
        distancia: Math.round(p.distancia * (tipo === 'partido' ? 1 : 0.6) * Math.min(factor, 1.2) * ruido()),
        distAltaInt: altaInt,
        sprints: Math.round(altaInt / 45),
        acelAltas: Math.round(minutos * (esPortero ? 0.08 : 0.4) * ruido()),
        decelAltas: Math.round(minutos * (esPortero ? 0.08 : 0.42) * ruido()),
        velMax: Math.round((p.velMax - (tipo === 'partido' ? 0 : 2) + azar() * 2) * 10) / 10,
        fcMedia: Math.round(j.fcMax * (esPortero ? 0.65 : tipo === 'partido' ? 0.82 : 0.75) * ruido()),
        fcMax: Math.round(j.fcMax * (esPortero ? 0.85 : 0.96))
    };
}

// Sesiones de los 28 días anteriores a `ahora` (ms), de la más antigua a la más reciente
function generar(ahora) {
    const azar = aleatorio(20261112);
    const sesiones = [];

    for (let semana = 3; semana >= 0; semana--) {
        for (const plan of SEMANA) {
            const inicio = new Date(ahora - (semana * 7 + plan.antes) * DIA_MS);
            inicio.setUTCMinutes(0, 0, 0);
            const duracion = (plan.tipo === 'partido' ? 105 : 90) * 60 * 1000;
            sesiones.push({
                tipo: plan.tipo,
                nombre: (plan.tipo === 'partido' ? 'Partido ' : 'Entrenamiento ') + inicio.toISOString().slice(0, 10),
                inicio: inicio,
                fin: new Date(inicio.getTime() + duracion),
                simulada: true,
                resumen: plantilla.map(function (j) {
                    const factor = semana === 0 ? (ULTIMA_SEMANA[j.id] || ULTIMA_SEMANA_RESTO) : 1;
                    return resumenJugador(j, plan.tipo, factor, azar);
                })
            });
        }
    }
    return sesiones;
}

module.exports = { generar };
