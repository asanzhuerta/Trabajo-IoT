// POST /api/telemetria: la pasarela de Node-RED manda un lote por segundo.

const express = require('express');
const config = require('../config');
const { requiereClave } = require('../middleware/clave');
const { validarLote } = require('../services/validacion');
const telemetria = require('../services/telemetria');

const router = express.Router();

router.post('/', requiereClave('pasarela'), async function (req, res) {
    const resultado = validarLote(req.body, config.equipo);
    if (!resultado.ok) {
        return res.status(400).json({ error: resultado.error });
    }
    res.status(202).json(await telemetria.procesarLote(resultado.lote));
});

module.exports = router;
