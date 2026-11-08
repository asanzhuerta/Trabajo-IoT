// GET /health: comprobación rápida de que la API está viva y de si Mongo está conectado.

const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', function (req, res) {
    res.json({
        status: 'ok',
        mongo: db.estado(),
        uptime: Math.round(process.uptime())
    });
});

module.exports = router;
