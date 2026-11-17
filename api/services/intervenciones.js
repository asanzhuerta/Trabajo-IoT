// Intervenciones del médico sobre una alerta: en vez de solo confirmarla, el médico actúa
// (enfriar al jugador, mandarlo a reposar) y el valor vuelve a la normalidad poco a poco,
// de forma que se ve en el dashboard y en el campograma. Cuando llega al objetivo, la alerta
// se cierra sola con una nota que dice qué se hizo.
//
// Como los sensores son simulados, la bajada se hace con el mismo canal que la botonera:
// la API publica cada paso en control/jugadores/<id>/sensores (services/simulador.js) y al
// final quita el ajuste para que el simulador vuelva a su comportamiento normal.
//
// En la realidad, ante un golpe de calor por esfuerzo se enfría al jugador en el sitio
// (inmersión en agua fría, ~0,15-0,35 °C/min) hasta unos 38,9 °C antes de trasladarlo
// (NATA, Casa et al. 2015). En la demo se comprime: unos 40 s hasta 37,5 °C.

const { Alerta } = require('../models');
const estado = require('./estado');
const simulador = require('./simulador');
const alertas = require('./alertas');
const websocket = require('../servers/websocket');
const { ErrorHttp } = require('./errores');

const TIPOS = {
    enfriar: {
        nombre: 'Enfriamiento (sombra, hielo y agua fría)',
        sensor: 'temperature', lectura: ['thermometer', 'temperature'], objetivo: 37.5, decimales: 1, unidad: '°C',
        codigos: ['CALOR_AMBAR', 'CALOR_ROJA']
    },
    reposo: {
        nombre: 'Reposo en la banda',
        sensor: 'pulse', lectura: ['pulsemeter', 'pulse'], objetivo: 85, decimales: 0, unidad: 'lpm',
        codigos: ['FC_ALTA', 'FC_DESACOPLE', 'RECUPERACION_LENTA', 'INCIDENTE']
    }
};

const PASOS = 8;
let pasoMs = 5000;          // 8 pasos de 5 s: unos 40 s de bajada
const enCurso = new Map();  // jugadorId → tipo, para no lanzar dos a la vez sobre el mismo jugador

// Puro: qué intervención corresponde a un código de alerta (null si ninguna cambia un sensor)
function tipoPara(codigo) {
    for (const [tipo, t] of Object.entries(TIPOS)) if (t.codigos.includes(codigo)) return tipo;
    return null;
}

// Puro: los valores intermedios de la bajada, sin repetir el de partida y acabando en el objetivo
function pasos(desde, hasta, n, decimales) {
    const f = 10 ** decimales;
    return Array.from({ length: n }, (_, i) => Math.round((desde + (hasta - desde) * (i + 1) / n) * f) / f);
}

function lecturaActual(jugadorId, t) {
    const e = estado.obtener(jugadorId);
    const v = e && e.sensors && e.sensors[t.lectura[0]] && e.sensors[t.lectura[0]][t.lectura[1]];
    return v && typeof v.value === 'number' ? v.value : null;
}

const espera = ms => new Promise(r => setTimeout(r, ms));

// POST /api/alertas/:id/intervenir (médico) { por }
async function intervenir(alertaId, por) {
    const alerta = await Alerta.findById(alertaId);
    if (!alerta) throw new ErrorHttp(404, 'No existe la alerta ' + alertaId);
    if (alerta.estado !== 'activa') throw new ErrorHttp(409, 'La alerta ya está confirmada');
    const tipo = tipoPara(alerta.codigo);
    if (!tipo) throw new ErrorHttp(400, 'La alerta ' + alerta.codigo + ' no tiene intervención: confírmala con una nota');
    const id = alerta.jugadorId;
    if (enCurso.has(id)) throw new ErrorHttp(409, 'Ya hay una intervención en curso sobre ' + id);

    const t = TIPOS[tipo];
    const desde = lecturaActual(id, t) ?? alerta.valor ?? t.objetivo;
    const valores = pasos(desde, t.objetivo, PASOS, t.decimales);

    // El primer paso se publica antes de responder: si no hay broker, el médico recibe el 503
    await simulador.ajustarSensores(id, { [t.sensor]: valores[0], durationSeconds: 0 }, 'medico');
    enCurso.set(id, tipo);
    alerta.intervencion = { tipo, nombre: t.nombre, por, inicio: new Date(), desde, objetivo: t.objetivo, unidad: t.unidad, fin: null };
    await alerta.save();
    websocket.sendMessage({ tipo: 'intervencion', alerta: alerta.toJSON() });

    completar(alerta.id, id, tipo, valores.slice(1), por).catch(function (err) {
        console.error('Intervención sobre %s interrumpida: %s', id, err.message);
    }).finally(function () { enCurso.delete(id); });
    return alerta;
}

async function completar(alertaId, jugadorId, tipo, restantes, por) {
    const t = TIPOS[tipo];
    for (const v of restantes) {
        await espera(pasoMs);
        await simulador.ajustarSensores(jugadorId, { [t.sensor]: v, durationSeconds: 0 }, 'medico');
    }
    await espera(pasoMs);
    await simulador.quitarAjuste(jugadorId);   // el simulador vuelve a sus valores normales

    // Se cierran la alerta tratada y las demás activas del mismo jugador que trata esta intervención
    // (al enfriar se van CALOR_ROJA y CALOR_AMBAR)
    const nota = 'Intervención: ' + t.nombre + '. ' + (t.sensor === 'temperature' ? 'Temperatura' : 'Pulso') +
        ' normalizado a ' + t.objetivo + ' ' + t.unidad + '.';
    const abiertas = await Alerta.find({ jugadorId, estado: 'activa', codigo: { $in: t.codigos } });
    for (const a of abiertas) {
        a.intervencion = { ...(a.intervencion || { tipo, nombre: t.nombre, por, inicio: new Date(), objetivo: t.objetivo, unidad: t.unidad }), fin: new Date() };
        await a.save();
        await alertas.confirmar(a.id, por, nota);
    }
    console.info('INTERVENCIÓN %s sobre %s terminada: %d alertas cerradas', tipo, jugadorId, abiertas.length);
}

// Solo para los tests
function _pasoMs(ms) { pasoMs = ms; }

module.exports = { TIPOS, PASOS, tipoPara, pasos, intervenir, _pasoMs };
