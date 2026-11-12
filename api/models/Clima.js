// Condiciones ambientales que manda Node-RED desde Open-Meteo, con el WBGT (medido o estimado por la API).

const mongoose = require('mongoose');
const { opcionesJSON } = require('./comun');

const climaSchema = new mongoose.Schema({
    ts: { type: Date, default: Date.now },
    temp: {
        type: Number, required: [true, 'Falta la temperatura (temp)'],
        min: [-30, 'temp va de -30 a 55 °C'], max: [55, 'temp va de -30 a 55 °C']
    },
    humedad: {
        type: Number, min: [0, 'humedad va de 0 a 100 %'], max: [100, 'humedad va de 0 a 100 %']
    },
    wbgt: {
        type: Number, min: [-30, 'wbgt va de -30 a 50 °C'], max: [50, 'wbgt va de -30 a 50 °C']
    },
    wbgtEstimado: { type: Boolean, default: false },   // true si lo ha calculado la API con temp y humedad
    fuente: { type: String, default: 'open-meteo', maxlength: [50, 'fuente no puede pasar de 50 caracteres'] }
}, { ...opcionesJSON, collection: 'clima' });

climaSchema.index({ ts: -1 });

module.exports = mongoose.model('Clima', climaSchema);
