// Los 11 jugadores del equipo (4-3-3). El id es el del topic del simulador de A (p1/sensors/...). Lo usan el seed y el fake-gateway.
// "zona" es la posición media en el campo (105 × 68 m, atacando hacia x = 105): solo la usa el fake-gateway.

module.exports = [
    { id: 'p1', dorsal: 1,  posicion: 'POR', fcMax: 186, tempBasal: 36.9, asimetriaBase: 3, zona: { x: 6,  y: 34 } },
    { id: 'p2', dorsal: 2,  posicion: 'LD',  fcMax: 197, tempBasal: 37.0, asimetriaBase: 4, zona: { x: 32, y: 60 } },
    { id: 'p3', dorsal: 4,  posicion: 'DFC', fcMax: 192, tempBasal: 37.1, asimetriaBase: 3, zona: { x: 22, y: 42 } },
    { id: 'p4', dorsal: 5,  posicion: 'DFC', fcMax: 190, tempBasal: 36.8, asimetriaBase: 2, zona: { x: 22, y: 26 } },
    { id: 'p5', dorsal: 3,  posicion: 'LI',  fcMax: 195, tempBasal: 37.0, asimetriaBase: 6, zona: { x: 32, y: 8 },
      enReadaptacion: true },
    { id: 'p6', dorsal: 6,  posicion: 'MCD', fcMax: 193, tempBasal: 37.0, asimetriaBase: 4, zona: { x: 40, y: 34 } },
    { id: 'p7', dorsal: 8,  posicion: 'MC',  fcMax: 198, tempBasal: 36.9, asimetriaBase: 5, zona: { x: 52, y: 46 } },
    { id: 'p8', dorsal: 10, posicion: 'MC',  fcMax: 196, tempBasal: 37.1, asimetriaBase: 4, zona: { x: 52, y: 22 } },
    { id: 'p9', dorsal: 7,  posicion: 'ED',  fcMax: 199, tempBasal: 37.0, asimetriaBase: 3, zona: { x: 74, y: 58 } },
    { id: 'p10', dorsal: 11, posicion: 'EI',  fcMax: 200, tempBasal: 36.8, asimetriaBase: 5, zona: { x: 74, y: 10 } },
    { id: 'p11', dorsal: 9,  posicion: 'DC',  fcMax: 191, tempBasal: 37.2, asimetriaBase: 4, zona: { x: 82, y: 34 } }
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
