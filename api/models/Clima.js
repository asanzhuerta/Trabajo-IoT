// Condiciones ambientales que manda Node-RED desde Open-Meteo, con el WBGT estimado.

const mongoose = require('mongoose');
const { opcionesJSON } = require('./comun');

const climaSchema = new mongoose.Schema({
    ts: { type: Date, required: true },
    temp: { type: Number, required: true },       // °C
    humedad: { type: Number, min: 0, max: 100 },  // %
    wbgt: { type: Number },                       // °C
    fuente: { type: String, default: 'open-meteo' }
}, { ...opcionesJSON, collection: 'clima' });

climaSchema.index({ ts: -1 });

module.exports = mongoose.model('Clima', climaSchema);
