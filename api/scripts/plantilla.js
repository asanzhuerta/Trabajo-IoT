// Los 11 jugadores del equipo, en el 4-2-3-1 del simulador de A (node_red/Informe_simulacion_IoT_jugadores_P1_P11.pdf):
// mismo id (el del topic, p1/sensors/...) y misma posición. Lo usan el seed, el histórico del ACWR y el fake-gateway.
// "zona" es la posición inicial de cada uno en el simulador de A (campo de 105 × 68 m, atacando hacia x = 105);
// el fake-gateway la usa como su posición media.

module.exports = [
    { id: 'p1', dorsal: 1,  posicion: 'POR', fcMax: 186, tempBasal: 36.9, asimetriaBase: 3, zona: { x: 4,  y: 34 } },   // portero
    { id: 'p2', dorsal: 2,  posicion: 'LD',  fcMax: 197, tempBasal: 37.0, asimetriaBase: 4, zona: { x: 26, y: 9 } },    // lateral derecho
    { id: 'p3', dorsal: 3,  posicion: 'LI',  fcMax: 192, tempBasal: 37.1, asimetriaBase: 3, zona: { x: 26, y: 59 } },   // lateral izquierdo
    { id: 'p4', dorsal: 4,  posicion: 'DFC', fcMax: 190, tempBasal: 36.8, asimetriaBase: 2, zona: { x: 22, y: 26 } },   // central derecho
    { id: 'p5', dorsal: 5,  posicion: 'DFC', fcMax: 195, tempBasal: 37.0, asimetriaBase: 6, zona: { x: 22, y: 42 },     // central izquierdo
      enReadaptacion: true },
    { id: 'p6', dorsal: 6,  posicion: 'MC',  fcMax: 193, tempBasal: 37.0, asimetriaBase: 4, zona: { x: 50, y: 20 } },   // centrocampista derecho
    { id: 'p7', dorsal: 8,  posicion: 'MC',  fcMax: 198, tempBasal: 36.9, asimetriaBase: 5, zona: { x: 50, y: 48 } },   // centrocampista izquierdo
    { id: 'p8', dorsal: 10, posicion: 'MCO', fcMax: 196, tempBasal: 37.1, asimetriaBase: 4, zona: { x: 70, y: 34 } },   // mediapunta
    { id: 'p9', dorsal: 9,  posicion: 'DC',  fcMax: 199, tempBasal: 37.0, asimetriaBase: 3, zona: { x: 83, y: 34 } },   // delantero centro
    { id: 'p10', dorsal: 7, posicion: 'ED',  fcMax: 200, tempBasal: 36.8, asimetriaBase: 5, zona: { x: 77, y: 10 } },   // extremo derecho
    { id: 'p11', dorsal: 11, posicion: 'EI', fcMax: 191, tempBasal: 37.2, asimetriaBase: 4, zona: { x: 77, y: 58 } }    // extremo izquierdo
];

// Pauta de readaptación del jugador que vuelve de lesión
module.exports.PAUTAS = [
    {
        jugadorId: 'p5',
        velMax: 22,
        cargaMax: 600,
        asimetriaMax: 8,
        diasVigencia: 10,
        notas: 'Vuelta progresiva tras sobrecarga en isquiotibiales'
    }
];
