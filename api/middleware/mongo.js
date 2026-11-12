// Si MongoDB no está conectado, las rutas /api responden 503 al momento
// en lugar de quedarse esperando a que Mongoose consiga conectar.

const mongoose = require('mongoose');

module.exports = function requiereMongo(req, res, next) {
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ error: 'La base de datos no está disponible' });
    }
    next();
};
