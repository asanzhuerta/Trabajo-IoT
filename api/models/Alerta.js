// Alerta generada por el motor de reglas (forma en docs/contratos/alertas.md).

const mongoose = require('mongoose');
const { opcionesJSON } = require('./comun');

const CODIGOS = [
    'CALOR_AMBAR', 'CALOR_ROJA', 'FC_ALTA', 'FC_DESACOPLE', 'RECUPERACION_LENTA',
    'INCIDENTE', 'SOBRECARGA', 'ASIMETRIA', 'PAUTA_EXCEDIDA', 'SIN_SENAL'
];

const alertaSchema = new mongoose.Schema({
    jugadorId: { type: String, required: true },
    codigo: { type: String, required: true, enum: CODIGOS },
    severidad: { type: String, required: true, enum: ['aviso', 'critica'] },
    mensaje: { type: String, required: true },
    valor: { type: Number, default: null },
    umbral: { type: Number, default: null },
    ts: { type: Date, required: true },
    estado: { type: String, enum: ['activa', 'confirmada'], default: 'activa' },
    confirmadaPor: { type: String, default: null },
    confirmadaEn: { type: Date, default: null },
    nota: { type: String, default: null }
}, { ...opcionesJSON, collection: 'alertas' });

alertaSchema.index({ estado: 1, jugadorId: 1, ts: -1 });

module.exports = mongoose.model('Alerta', alertaSchema);
