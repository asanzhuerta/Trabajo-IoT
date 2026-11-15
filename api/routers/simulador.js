// /api/simulador: el dashboard de simulación cambia el comportamiento del simulador de Node-RED.
// La API publica la orden por MQTT (control/#) y el simulador la recibe con un mqtt in.
// No piden clave: solo mueven el simulador, no tocan datos clínicos (ver docs/contratos/api.md).

const express = require('express');
const simulador = require('../services/simulador');

const router = express.Router();

// GET /api/simulador: fases y escenarios válidos, lo último que se mandó y el estado de MQTT
router.get('/', function (req, res) {
    res.json(simulador.estado());
});

// POST /api/simulador/fase { fase }
router.post('/fase', async function (req, res) {
    res.status(202).json(await simulador.cambiarFase((req.body || {}).fase));
});

// POST /api/simulador/escenario { jugadorId, escenario }
router.post('/escenario', async function (req, res) {
    res.status(202).json(await simulador.cambiarEscenario(req.body));
});

// POST /api/simulador/reiniciar
router.post('/reiniciar', async function (req, res) {
    res.status(202).json(await simulador.reiniciar());
});

module.exports = router;
