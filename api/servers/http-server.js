// Aplicación Express (patrón de servers/http-server.js de clase).
// Aquí se registran los middlewares y los routers de la API.

const path = require('path');
const express = require('express');
const cors = require('cors');

const healthRoutes = require('../routers/health');

const app = express();

app.use(cors());
app.use(express.json());

// Web propia (ficha del jugador y campo 2D)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Rutas
app.use('/health', healthRoutes);
// Próximos routers: /api/telemetria, /api/jugadores, /api/alertas, /api/sesiones, /api/clima, /fhir

// Ruta no encontrada
app.use(function (req, res) {
    res.status(404).json({ error: 'Ruta no encontrada: ' + req.method + ' ' + req.originalUrl });
});

// Errores (incluye JSON mal formado)
app.use(function (err, req, res, next) {
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'JSON mal formado' });
    }
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Error interno' });
});

module.exports = app;
