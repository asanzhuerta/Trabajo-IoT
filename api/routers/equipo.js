const express = require('express');
const { requiereClave } = require('../middleware/clave');
const tactica = require('../services/tactica');
const websocket = require('../servers/websocket');
const router = express.Router();

router.get('/estado', function (req, res) {
    res.set('Cache-Control', 'no-store').json(tactica.obtener());
});
router.post('/estado', requiereClave('pasarela'), function (req, res) {
    const equipo = tactica.actualizar(req.body);
    websocket.sendMessage({ tipo: 'tactica', equipo });
    res.status(202).json(equipo);
});
module.exports = router;
