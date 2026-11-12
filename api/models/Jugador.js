// Jugador y su perfil médico. El _id es el seudónimo (p1…p11, como en los topics del simulador): nunca se guardan nombres.

const mongoose = require('mongoose');
const { opcionesJSON } = require('./comun');
const { UMBRALES_DEFECTO } = require('../services/umbrales');

const POSICIONES = ['POR', 'LD', 'DFC', 'LI', 'MCD', 'MC', 'MCO', 'ED', 'EI', 'DC'];

// Un campo numérico por umbral, con su valor por defecto
const camposUmbrales = {};
for (const [nombre, valor] of Object.entries(UMBRALES_DEFECTO)) {
    camposUmbrales[nombre] = { type: Number, default: valor, min: 0 };
}
const umbralesSchema = new mongoose.Schema(camposUmbrales, { _id: false });

const jugadorSchema = new mongoose.Schema({
    _id: {
        type: String,
        required: true,
        match: [/^p\d{1,2}$/, 'El id debe tener la forma p1…p99']
    },
    dorsal: {
        type: Number, required: [true, 'Falta el dorsal'], unique: true,
        min: [1, 'El dorsal va de 1 a 99'], max: [99, 'El dorsal va de 1 a 99']
    },
    posicion: {
        type: String, required: [true, 'Falta la posición'],
        enum: { values: POSICIONES, message: 'Posición no válida: {VALUE} (usa ' + POSICIONES.join(', ') + ')' }
    },
    fcMax: {   // lpm
        type: Number, required: [true, 'Falta fcMax'],
        min: [150, 'fcMax va de 150 a 230 lpm'], max: [230, 'fcMax va de 150 a 230 lpm']
    },
    tempBasal: {   // °C
        type: Number, default: 37.0,
        min: [35.5, 'tempBasal va de 35,5 a 38 °C'], max: [38, 'tempBasal va de 35,5 a 38 °C']
    },
    asimetriaBase: {   // puntos de |izq − der|
        type: Number, default: 0,
        min: [0, 'asimetriaBase va de 0 a 30'], max: [30, 'asimetriaBase va de 0 a 30']
    },
    umbrales: { type: umbralesSchema, default: () => ({}) },
    enReadaptacion: { type: Boolean, default: false }
}, { ...opcionesJSON, collection: 'jugadores' });

module.exports = mongoose.model('Jugador', jugadorSchema);
