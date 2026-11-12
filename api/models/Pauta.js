// Pauta de readaptación: límites que fija el médico para un jugador que vuelve de una lesión.
// Solo hay una activa por jugador; al crear una nueva, la anterior se desactiva.

const mongoose = require('mongoose');
const { opcionesJSON } = require('./comun');

const pautaSchema = new mongoose.Schema({
    jugadorId: { type: String, required: true },
    velMax: { type: Number, min: 0, max: 45 },         // km/h
    cargaMax: { type: Number, min: 0 },                // m de alta intensidad por sesión
    asimetriaMax: { type: Number, min: 0, max: 100 },  // puntos de |izq − der|
    hasta: { type: Date, required: true },
    notas: { type: String, default: '' },
    activa: { type: Boolean, default: true },
    creadaEn: { type: Date, default: Date.now }
}, { ...opcionesJSON, collection: 'pautas' });

pautaSchema.index({ jugadorId: 1, activa: 1 });

module.exports = mongoose.model('Pauta', pautaSchema);
