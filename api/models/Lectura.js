// Resumen de 10 s de un jugador. Es una colección time-series de MongoDB:
// en un partido llegan unos 356.000 mensajes MQTT, así que solo se guardan resúmenes.

const mongoose = require('mongoose');

const lecturaSchema = new mongoose.Schema({
    ts: { type: Date, required: true },                 // inicio de la ventana de 10 s
    jugadorId: { type: String, required: true },
    sesionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    muestras: Number,        // lecturas que entraron en la ventana
    velMedia: Number,        // km/h
    velMax: Number,          // km/h
    distancia: Number,       // m recorridos en la ventana
    distAltaInt: Number,     // m recorridos a más de 19,8 km/h
    fcMedia: Number,         // lpm
    fcMax: Number,           // lpm
    temp: Number,            // °C (última temperatura recibida en la ventana)
    asimetria: Number,       // media de |izq − der| en la ventana
    sprints: Number,         // sprints que empiezan en la ventana
    acelAltas: Number,
    decelAltas: Number,
    x: Number,               // última posición de la ventana (m)
    y: Number
}, {
    versionKey: false,
    collection: 'lecturas',
    timeseries: { timeField: 'ts', metaField: 'jugadorId', granularity: 'seconds' }
});

module.exports = mongoose.model('Lectura', lecturaSchema);
