// GET /health: comprobación rápida de que la API está viva y de si Mongo y el broker MQTT están conectados.

const express = require('express');
const db = require('../db');
const publisher = require('../mqtt/publisher');

const router = express.Router();

router.get('/', function (req, res) {
    res.json({
        status: 'ok',
        mongo: db.estado(),
        mqtt: publisher.estado(),
        uptime: Math.round(process.uptime())
    });
});

module.exports = router;
