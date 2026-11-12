// Sesión de entrenamiento o partido. Al cerrarla se guarda el resumen de cada jugador.

const mongoose = require('mongoose');
const { opcionesJSON } = require('./comun');

const resumenJugadorSchema = new mongoose.Schema({
    jugadorId: String,
    distancia: Number,       // m
    distAltaInt: Number,     // m a más de 19,8 km/h (es la carga de la sesión para el ACWR)
    sprints: Number,
    acelAltas: Number,
    decelAltas: Number,
    fcMedia: Number,
    fcMax: Number
}, { _id: false });

const sesionSchema = new mongoose.Schema({
    tipo: { type: String, required: true, enum: ['partido', 'entrenamiento'] },
    nombre: { type: String, required: true },
    inicio: { type: Date, default: Date.now },
    fin: { type: Date, default: null },
    resumen: { type: [resumenJugadorSchema], default: [] }
}, { ...opcionesJSON, collection: 'sesiones' });

module.exports = mongoose.model('Sesion', sesionSchema);
