// /api/alertas: consulta y confirmación de alertas.

const express = require('express');
const { Alerta } = require('../models');
const { requiereClave } = require('../middleware/clave');
const alertas = require('../services/alertas');
const intervenciones = require('../services/intervenciones');

const router = express.Router();

const MAX_ALERTAS = 200;

// GET /api/alertas?estado=activa&jugadorId=p8 (filtros opcionales), de más reciente a más antigua
router.get('/', async function (req, res) {
    const filtro = {};
    const { estado, jugadorId } = req.query;
    if (estado !== undefined) {
        if (estado !== 'activa' && estado !== 'confirmada') {
            return res.status(400).json({ error: 'estado debe ser "activa" o "confirmada"' });
        }
        filtro.estado = estado;
    }
    if (jugadorId !== undefined) {
        if (typeof jugadorId !== 'string') return res.status(400).json({ error: 'jugadorId no válido' });
        filtro.jugadorId = jugadorId;
    }
    res.json(await Alerta.find(filtro).sort({ ts: -1 }).limit(MAX_ALERTAS));
});

// POST /api/alertas/:id/confirmar (médico) { por, nota }
router.post('/:id/confirmar', requiereClave('medico'), async function (req, res) {
    const body = req.body || {};
    if (typeof body.por !== 'string' || body.por.trim() === '') {
        return res.status(400).json({ error: 'Indica quién confirma la alerta en "por"' });
    }
    if (body.nota !== undefined && typeof body.nota !== 'string') {
        return res.status(400).json({ error: 'nota debe ser un texto' });
    }
    res.json(await alertas.confirmar(req.params.id, body.por.trim(), body.nota));
});

// POST /api/alertas/:id/intervenir (médico) { por }: enfriar o mandar a reposar; el valor baja poco a poco
// y la alerta se cierra sola al llegar al objetivo. Responde 202 en cuanto empieza.
router.post('/:id/intervenir', requiereClave('medico'), async function (req, res) {
    const body = req.body || {};
    if (typeof body.por !== 'string' || body.por.trim() === '') {
        return res.status(400).json({ error: 'Indica quién interviene en "por"' });
    }
    res.status(202).json(await intervenciones.intervenir(req.params.id, body.por.trim()));
});

module.exports = router;
