// Aplicación Express (patrón de servers/http-server.js de clase).
// Aquí se registran los middlewares y los routers de la API.

const path = require('path');
const express = require('express');
const cors = require('cors');

const requiereMongo = require('../middleware/mongo');
const healthRoutes = require('../routers/health');
const telemetriaRoutes = require('../routers/telemetria');
const jugadoresRoutes = require('../routers/jugadores');
const alertasRoutes = require('../routers/alertas');
const sesionesRoutes = require('../routers/sesiones');
const documentacion = require('./documentacion');

const app = express();

app.use(cors());
app.use(express.json());

// Web propia (ficha del jugador y campo 2D)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Rutas
app.use('/health', healthRoutes);
app.use('/api', requiereMongo);
app.use('/api/telemetria', telemetriaRoutes);
app.use('/api/jugadores', jugadoresRoutes);
app.use('/api/alertas', alertasRoutes);
app.use('/api/sesiones', sesionesRoutes);
// Próximos routers: /api/clima, /fhir

// Documentación interactiva (Swagger UI) a partir de openapi.yaml
app.use('/api-docs', documentacion);

// Ruta no encontrada
app.use(function (req, res) {
    res.status(404).json({ error: 'Ruta no encontrada: ' + req.method + ' ' + req.originalUrl });
});

// Errores (JSON mal formado, validación de Mongoose, duplicados…)
app.use(function (err, req, res, next) {
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'JSON mal formado' });
    }
    if (err.name === 'ValidationError') {
        const detalles = Object.values(err.errors).map(function (e) {
            return e.name === 'CastError' ? 'Valor no válido para ' + e.path : e.message;
        });
        return res.status(400).json({ error: detalles.join('; ') });
    }
    if (err.name === 'CastError') {
        return res.status(400).json({ error: 'Valor no válido para ' + err.path });
    }
    if (err.code === 11000) {
        const campo = Object.keys(err.keyValue || {})[0];
        const nombre = campo === '_id' ? 'id' : campo;
        return res.status(409).json({ error: 'Ya existe un registro con ese ' + nombre + ': ' + err.keyValue[campo] });
    }
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Error interno' });
});

module.exports = app;
