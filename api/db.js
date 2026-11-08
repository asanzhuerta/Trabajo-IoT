// Conexión con MongoDB mediante Mongoose.
// Si Mongo no está disponible, la API arranca igualmente y reintenta cada 5 s.

const mongoose = require('mongoose');
const config = require('./config');

const ESTADOS = ['disconnected', 'connected', 'connecting', 'disconnecting'];
const REINTENTO_MS = 5000;

async function connect() {
    try {
        await mongoose.connect(config.mongoUrl, { serverSelectionTimeoutMS: 5000 });
        console.info('MongoDB conectado en %s', config.mongoUrl);
    } catch (err) {
        console.warn('MongoDB no disponible (%s). Reintentando en %d s...', err.message, REINTENTO_MS / 1000);
        setTimeout(connect, REINTENTO_MS);
    }
}

function estado() {
    return ESTADOS[mongoose.connection.readyState] || 'unknown';
}

mongoose.connection.on('disconnected', function () {
    console.warn('MongoDB desconectado');
});

module.exports = { connect, estado };
