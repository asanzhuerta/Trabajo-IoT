// /api/sesiones: empezar y cerrar sesiones de entrenamiento o partido, y consultar su resumen por jugador.

const express = require('express');
const { requiereClave } = require('../middleware/clave');
const sesiones = require('../services/sesiones');

const router = express.Router();

// Pasa los errores conocidos (404, 409) como respuesta; el resto, al manejador general
function conErrores(manejador) {
    return async function (req, res) {
        try {
            await manejador(req, res);
        } catch (err) {
            if (err instanceof sesiones.ErrorSesion) return res.status(err.status).json({ error: err.message });
            throw err;
        }
    };
}

// GET /api/sesiones?estado=abierta|cerrada (filtro opcional), de más reciente a más antigua
router.get('/', async function (req, res) {
    const { estado } = req.query;
    if (estado !== undefined && estado !== 'abierta' && estado !== 'cerrada') {
        return res.status(400).json({ error: 'estado debe ser "abierta" o "cerrada"' });
    }
    res.json(await sesiones.listar({ estado: estado }));
});

// POST /api/sesiones (médico) { tipo: 'partido' | 'entrenamiento', nombre }
router.post('/', requiereClave('medico'), conErrores(async function (req, res) {
    const body = req.body || {};
    res.status(201).json(await sesiones.iniciar({ tipo: body.tipo, nombre: body.nombre }));
}));

// GET /api/sesiones/:id (si está abierta, con el resumen calculado hasta ahora)
router.get('/:id', conErrores(async function (req, res) {
    res.json(await sesiones.obtener(req.params.id));
}));

// POST /api/sesiones/:id/fin (médico): cierra la sesión y guarda el resumen de cada jugador
router.post('/:id/fin', requiereClave('medico'), conErrores(async function (req, res) {
    res.json(await sesiones.finalizar(req.params.id));
}));

module.exports = router;
