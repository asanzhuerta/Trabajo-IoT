// Los 11 jugadores del equipo, en el 4-2-3-1 del simulador de A (node_red/Informe_simulacion_IoT_jugadores_P1_P11.pdf):
// mismo id (el del topic, p1/sensors/...) y misma posición. Lo usan el seed y el histórico del ACWR.

module.exports = [
    { id: 'p1', dorsal: 1,  posicion: 'POR', fcMax: 186, tempBasal: 36.9, asimetriaBase: 3 },   // portero
    { id: 'p2', dorsal: 2,  posicion: 'LD',  fcMax: 197, tempBasal: 37.0, asimetriaBase: 4 },    // lateral derecho
    { id: 'p3', dorsal: 3,  posicion: 'LI',  fcMax: 192, tempBasal: 37.1, asimetriaBase: 3 },   // lateral izquierdo
    { id: 'p4', dorsal: 4,  posicion: 'DFC', fcMax: 190, tempBasal: 36.8, asimetriaBase: 2 },   // central derecho
    { id: 'p5', dorsal: 5,  posicion: 'DFC', fcMax: 195, tempBasal: 37.0, asimetriaBase: 6,     // central izquierdo
      enReadaptacion: true },
    { id: 'p6', dorsal: 6,  posicion: 'MC',  fcMax: 193, tempBasal: 37.0, asimetriaBase: 4 },   // centrocampista derecho
    { id: 'p7', dorsal: 8,  posicion: 'MC',  fcMax: 198, tempBasal: 36.9, asimetriaBase: 5 },   // centrocampista izquierdo
    { id: 'p8', dorsal: 10, posicion: 'MCO', fcMax: 196, tempBasal: 37.1, asimetriaBase: 4 },   // mediapunta
    { id: 'p9', dorsal: 9,  posicion: 'DC',  fcMax: 199, tempBasal: 37.0, asimetriaBase: 3 },   // delantero centro
    { id: 'p10', dorsal: 7, posicion: 'ED',  fcMax: 200, tempBasal: 36.8, asimetriaBase: 5 },   // extremo derecho
    { id: 'p11', dorsal: 11, posicion: 'EI', fcMax: 191, tempBasal: 37.2, asimetriaBase: 4 }    // extremo izquierdo
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
