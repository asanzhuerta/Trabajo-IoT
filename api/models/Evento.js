// Acción destacada de un jugador: sprint, aceleración o desaceleración alta, cambio de dirección o impacto.

const mongoose = require('mongoose');
const { opcionesJSON } = require('./comun');

const TIPOS = ['sprint', 'aceleracion', 'desaceleracion', 'cambio_direccion', 'impacto'];

const eventoSchema = new mongoose.Schema({
    jugadorId: { type: String, required: true },
    sesionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    ts: { type: Date, required: true },
    tipo: { type: String, required: true, enum: TIPOS },
    valor: Number // km/h, m/s², grados o g según el tipo
}, { ...opcionesJSON, collection: 'eventos' });

eventoSchema.index({ jugadorId: 1, ts: -1 });

module.exports = mongoose.model('Evento', eventoSchema);
