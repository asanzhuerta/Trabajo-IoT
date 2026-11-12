// Sesión de entrenamiento o partido. Solo puede haber una abierta (fin: null) a la vez.
// Mientras está abierta, los resúmenes de 10 s y los eventos se guardan con su sesionId;
// al cerrarla se calcula el resumen de cada jugador a partir de esos resúmenes.

const mongoose = require('mongoose');
const { opcionesJSON } = require('./comun');

const TIPOS = ['partido', 'entrenamiento'];

const resumenJugadorSchema = new mongoose.Schema({
    jugadorId: String,
    minutos: Number,         // minutos con datos (resúmenes de 10 s con alguna lectura)
    distancia: Number,       // m
    distAltaInt: Number,     // m a más de 19,8 km/h (es la carga de la sesión para el ACWR)
    sprints: Number,
    acelAltas: Number,
    decelAltas: Number,
    velMax: Number,          // km/h
    fcMedia: Number,         // lpm
    fcMax: Number            // lpm
}, { _id: false });

const sesionSchema = new mongoose.Schema({
    tipo: {
        type: String, required: [true, 'Falta el tipo (partido o entrenamiento)'],
        enum: { values: TIPOS, message: 'Tipo no válido: {VALUE} (usa partido o entrenamiento)' }
    },
    nombre: {
        type: String, required: [true, 'Falta el nombre de la sesión'], trim: true,
        maxlength: [100, 'El nombre no puede pasar de 100 caracteres']
    },
    inicio: { type: Date, default: Date.now },
    fin: { type: Date, default: null },
    resumen: { type: [resumenJugadorSchema], default: [] }
}, { ...opcionesJSON, collection: 'sesiones' });

sesionSchema.index({ inicio: -1 });

module.exports = mongoose.model('Sesion', sesionSchema);
module.exports.TIPOS = TIPOS;
