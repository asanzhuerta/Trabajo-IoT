// /api/clima: condiciones ambientales (Open-Meteo → Node-RED → API).

const express = require('express');
const { requiereClave } = require('../middleware/clave');
const clima = require('../services/clima');

const router = express.Router();

// POST /api/clima (pasarela) { ts?, temp, humedad?, wbgt?, fuente? }
router.post('/', requiereClave('pasarela'), async function (req, res) {
    res.status(201).json(await clima.guardar(req.body || {}));
});

// GET /api/clima: el último registro
router.get('/', async function (req, res) {
    const registro = await clima.ultimo();
    if (!registro) return res.status(404).json({ error: 'Todavía no hay datos de clima' });
    res.json(registro);
});

module.exports = router;
