// Procesa un lote de telemetría ya validado:
//   1. actualiza el estado en vivo de cada jugador y calcula sus eventos (sprints, aceleraciones…);
//   2. guarda en Mongo los resúmenes de 10 s que se hayan cerrado y los eventos;
//   3. evalúa las reglas de alerta de cada jugador;
//   4. difunde la foto del equipo por WebSocket (1 Hz, porque llega un lote por segundo).

const { Lectura, Evento } = require('../models');
const estado = require('./estado');
const perfiles = require('./perfiles');
const alertas = require('./alertas');
const websocket = require('../servers/websocket');

async function guardar(modelo, documentos) {
    if (documentos.length === 0) return;
    try {
        await modelo.insertMany(documentos);
    } catch (err) {
        console.error('No se pudieron guardar %d %s: %s', documentos.length, modelo.collection.name, err.message);
    }
}

async function procesarLote(lote) {
    // Si llega un jugador que no está en la caché (p. ej. recién creado con el seed), se recarga
    if (lote.lecturas.some(function (l) { return !perfiles.obtener(l.jugadorId); })) {
        await perfiles.recargarSiHaceFalta();
    }

    const sesionId = estado.sesionActual();
    const ignoradas = [];
    const resumenes = [];
    const eventos = [];
    const procesados = [];

    for (const lectura of lote.lecturas) {
        const perfil = perfiles.obtener(lectura.jugadorId);
        if (!perfil) {
            ignoradas.push(lectura.jugadorId);
            continue;
        }
        const r = estado.procesar(lectura, perfil);
        if (r.resumen) resumenes.push(r.resumen);
        for (const ev of r.eventos) eventos.push({ ...ev, sesionId: sesionId });
        procesados.push(perfil);
    }

    await Promise.all([
        guardar(Lectura, resumenes),
        guardar(Evento, eventos),
        ...procesados.map(function (perfil) { return alertas.evaluarJugador(perfil._id, perfil); })
    ]);

    websocket.sendMessage({ tipo: 'telemetria', ts: lote.ts.toISOString(), jugadores: estado.vista() });

    const respuesta = { recibidas: lote.lecturas.length - ignoradas.length };
    if (ignoradas.length) respuesta.ignoradas = ignoradas;
    return respuesta;
}

// Cada 10 s se cierran las ventanas de los jugadores que han dejado de mandar datos
setInterval(function () {
    guardar(Lectura, estado.cerrarVencidas(Date.now()));
}, 10000).unref();

module.exports = { procesarLote };
