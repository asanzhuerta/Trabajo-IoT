// /api/simulador: la botonera de simulación cambia el comportamiento del simulador de Node-RED.
// La API publica la orden por MQTT (control/#) y el simulador la recibe con un mqtt in.
// No piden clave: solo mueven el simulador, no tocan datos clínicos.

const express = require('express');
const simulador = require('../services/simulador');

const router = express.Router();

// GET /api/simulador: fases válidas, rangos de los ajustes, lo último que se mandó y el estado de MQTT
router.get('/', function (req, res) {
    res.json(simulador.estado());
});

// POST /api/simulador/fase { fase }
router.post('/fase', async function (req, res) {
    res.status(202).json(await simulador.cambiarFase((req.body || {}).fase));
});

// PUT /api/simulador/jugadores/:id/sensores { pulse?, temperature?, durationSeconds? }
router.put('/jugadores/:id/sensores', async function (req, res) {
    res.status(202).json(await simulador.ajustarSensores(req.params.id, req.body));
});

// DELETE /api/simulador/jugadores/:id/sensores: vuelve a los valores simulados
router.delete('/jugadores/:id/sensores', async function (req, res) {
    res.status(202).json(await simulador.quitarAjuste(req.params.id));
});

// POST /api/simulador/reiniciar: formación inicial y sin ajustes
router.post('/reiniciar', async function (req, res) {
    res.status(202).json(await simulador.reiniciar());
});

module.exports = router;
