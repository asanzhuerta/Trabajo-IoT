// Motor de alertas. Después de cada lectura evalúa las reglas (reglas.js) y, por cada alerta nueva:
//   1. la guarda en Mongo (colección alertas);
//   2. la publica por MQTT en sensors/<equipo>/alertas con QoS 1 (la recibe el Dashboard 2.0 de A);
//   3. la envía por WebSocket a la web: { tipo: 'alerta', alerta }.
//
// Antirrebote (docs/contratos/alertas.md):
//   - no se repite el mismo código para el mismo jugador mientras haya una igual activa;
//   - después de confirmarla hay 60 s de espera antes de poder lanzarla otra vez.

const mongoose = require('mongoose');
const { Alerta } = require('../models');
const reglas = require('./reglas');
const estado = require('./estado');
const perfiles = require('./perfiles');
const websocket = require('../servers/websocket');
const publisher = require('../mqtt/publisher');
const { ErrorHttp } = require('./errores');

const ESPERA_MS = 60000;
const SINCRONIZA_MS = 30000;

// Cuándo se marcó en memoria cada alerta (clave "p8:FC_ALTA"), para no borrarla al sincronizar
// mientras se está guardando
const marcadas = new Map();

// Puro: ¿se puede lanzar ahora este código para este jugador?
function puedeLanzarse(e, codigo, ahora) {
    if (e.alertas.has(codigo)) return false;
    const confirmada = e.confirmadas.get(codigo);
    return !(confirmada && ahora - confirmada < ESPERA_MS);
}

function difundir(alerta) {
    const json = alerta.toJSON();
    publisher.publicarAlerta(json);
    websocket.sendMessage({ tipo: 'alerta', alerta: json });
    console.info('ALERTA %s %s (%s): %s', json.jugadorId, json.codigo, json.severidad, json.mensaje);
}

// Evalúa las reglas de un jugador y lanza las alertas nuevas.
async function evaluarJugador(jugadorId, perfil) {
    const e = estado.obtener(jugadorId);
    if (!e || !e.ts) return;
    const ahora = e.ts.getTime();

    const candidatas = reglas.evaluar({
        e: e,
        perfil: perfil,
        pauta: perfiles.pauta(jugadorId),
        clima: perfiles.clima(),
        ahora: ahora
    });
    const nuevas = candidatas.filter(function (c) { return puedeLanzarse(e, c.codigo, ahora); });
    if (nuevas.length === 0) return;

    // Se marcan antes de guardar para que el siguiente lote no las duplique mientras tanto
    for (const c of nuevas) {
        e.alertas.set(c.codigo, c.severidad);
        marcadas.set(jugadorId + ':' + c.codigo, Date.now());
    }

    try {
        const docs = await Alerta.insertMany(nuevas.map(function (c) {
            return { ...c, jugadorId: jugadorId, ts: new Date(ahora) };
        }));
        docs.forEach(difundir);
    } catch (err) {
        for (const c of nuevas) {   // se reintentará con la siguiente lectura
            e.alertas.delete(c.codigo);
            marcadas.delete(jugadorId + ':' + c.codigo);
        }
        console.error('No se pudieron guardar las alertas de %s: %s', jugadorId, err.message);
    }
}

// POST /api/alertas/:id/confirmar
async function confirmar(id, por, nota) {
    const alerta = await Alerta.findById(id);
    if (!alerta) throw new ErrorHttp(404, 'No existe la alerta ' + id);
    if (alerta.estado === 'confirmada') throw new ErrorHttp(409, 'La alerta ya está confirmada');

    alerta.estado = 'confirmada';
    alerta.confirmadaPor = por;
    alerta.confirmadaEn = new Date();
    alerta.nota = nota || null;
    await alerta.save();

    const e = estado.obtener(alerta.jugadorId);
    if (e) {
        e.alertas.delete(alerta.codigo);
        marcadas.delete(alerta.jugadorId + ':' + alerta.codigo);
        e.confirmadas.set(alerta.codigo, alerta.confirmadaEn.getTime());
    }
    websocket.sendMessage({ tipo: 'alerta_confirmada', alertaId: alerta.id });
    return alerta;
}

// Copia en memoria las alertas activas de Mongo (y las confirmadas hace menos de 60 s).
// Se hace al arrancar, para que el semáforo y el antirrebote sobrevivan a un reinicio,
// y cada 30 s, por si alguien las borra o confirma desde fuera (p. ej. npm run seed -- --limpiar).
async function sincronizar() {
    const [activas, recientes] = await Promise.all([
        Alerta.find({ estado: 'activa' }).lean(),
        Alerta.find({ estado: 'confirmada', confirmadaEn: { $gte: new Date(Date.now() - ESPERA_MS) } }).lean()
    ]);
    const enMongo = new Set(activas.map(function (a) { return a.jugadorId + ':' + a.codigo; }));
    const ahora = Date.now();

    // Quita de memoria las que ya no están activas en Mongo (salvo las recién marcadas, que se están guardando)
    for (const e of estado.todos()) {
        for (const codigo of Array.from(e.alertas.keys())) {
            const clave = e.jugadorId + ':' + codigo;
            const marcada = marcadas.get(clave);
            if (!enMongo.has(clave) && !(marcada && ahora - marcada < SINCRONIZA_MS)) {
                e.alertas.delete(codigo);
                marcadas.delete(clave);
            }
        }
    }
    for (const a of activas) estado.obtenerOCrear(a.jugadorId).alertas.set(a.codigo, a.severidad);
    for (const a of recientes) estado.obtenerOCrear(a.jugadorId).confirmadas.set(a.codigo, a.confirmadaEn.getTime());
    return activas.length;
}

mongoose.connection.on('connected', function () {
    sincronizar()
        .then(function (n) { if (n) console.info('Alertas activas recuperadas: %d', n); })
        .catch(function (err) { console.warn('No se pudieron recuperar las alertas: %s', err.message); });
});

setInterval(function () {
    if (mongoose.connection.readyState !== 1) return;
    sincronizar().catch(function (err) { console.warn('No se pudieron sincronizar las alertas: %s', err.message); });
}, SINCRONIZA_MS).unref();

module.exports = { evaluarJugador, confirmar, puedeLanzarse, ESPERA_MS };
