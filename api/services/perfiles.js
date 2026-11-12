// Caché en memoria de lo que necesitan la telemetría y las reglas cada segundo:
// el perfil de cada jugador (FCmáx, umbrales…), su pauta de readaptación activa y el último clima.
// Así no se consulta Mongo once veces por segundo.

const mongoose = require('mongoose');
const { Jugador, Pauta, Clima } = require('../models');

const RECARGA_MS = 30000;      // recarga periódica (por si alguien lanza el seed con la API arrancada)
const RECARGA_MIN_MS = 5000;   // como mucho una recarga extra cada 5 s si llega un jugador desconocido

let jugadores = new Map();
let pautas = new Map();
let ultimoClima = null;
let ultimaCarga = 0;

async function cargar() {
    const [listaJugadores, listaPautas, clima] = await Promise.all([
        Jugador.find().lean(),
        Pauta.find({ activa: true, hasta: { $gte: new Date() } }).lean(),
        Clima.findOne().sort({ ts: -1 }).lean()
    ]);
    jugadores = new Map(listaJugadores.map(function (j) { return [j._id, j]; }));
    pautas = new Map(listaPautas.map(function (p) { return [p.jugadorId, p]; }));
    ultimoClima = clima;
    ultimaCarga = Date.now();
    return jugadores.size;
}

function obtener(id) {
    return jugadores.get(id) || null;
}

function pauta(id) {
    return pautas.get(id) || null;
}

function clima() {
    return ultimoClima;
}

function fijarClima(registro) {
    ultimoClima = registro;
}

async function recargarSiHaceFalta() {
    if (Date.now() - ultimaCarga < RECARGA_MIN_MS) return;
    try {
        await cargar();
    } catch (err) {
        console.warn('No se pudieron recargar los perfiles: %s', err.message);
    }
}

mongoose.connection.on('connected', function () {
    cargar()
        .then(function (n) { console.info('Perfiles cargados: %d jugadores, %d pautas activas', n, pautas.size); })
        .catch(function (err) { console.warn('No se pudieron cargar los perfiles: %s', err.message); });
});

setInterval(function () {
    if (mongoose.connection.readyState === 1) cargar().catch(function () {});
}, RECARGA_MS).unref();

module.exports = { cargar, obtener, pauta, clima, fijarClima, recargarSiHaceFalta };
