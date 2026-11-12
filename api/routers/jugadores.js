// /api/jugadores: perfil médico, umbrales, pauta de readaptación, estado en vivo e histórico.

const express = require('express');
const { Jugador, Lectura, Alerta, Pauta } = require('../models');
const { requiereClave } = require('../middleware/clave');
const perfiles = require('../services/perfiles');
const estado = require('../services/estado');
const { semaforo } = require('../services/semaforo');
const { UMBRALES_DEFECTO } = require('../services/umbrales');

const router = express.Router();

const CAMPOS_PERFIL = ['dorsal', 'posicion', 'fcMax', 'tempBasal', 'asimetriaBase', 'enReadaptacion'];
const HISTORICO_DEFECTO_MS = 15 * 60 * 1000;
const HISTORICO_MAX = 8640;   // 24 h de resúmenes de 10 s

function elegir(origen, campos) {
    const destino = {};
    for (const c of campos) {
        if (origen[c] !== undefined) destino[c] = origen[c];
    }
    return destino;
}

function noExiste(res, id) {
    return res.status(404).json({ error: 'No existe el jugador ' + id });
}

function fechaConsulta(valor) {
    if (valor === undefined) return undefined;
    if (typeof valor !== 'string') return null;
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? null : d;
}

// GET /api/jugadores
router.get('/', async function (req, res) {
    // collation numérica para que p10 y p11 vayan después de p9
    res.json(await Jugador.find().sort({ _id: 1 }).collation({ locale: 'es', numericOrdering: true }));
});

// POST /api/jugadores (médico)
router.post('/', requiereClave('medico'), async function (req, res) {
    const body = req.body || {};
    if (typeof body.id !== 'string') {
        return res.status(400).json({ error: 'Falta el id del jugador (p1…p99)' });
    }
    const jugador = new Jugador({ _id: body.id, ...elegir(body, CAMPOS_PERFIL) });
    await jugador.save();
    await perfiles.cargar();
    res.status(201).json(jugador);
});

// GET /api/jugadores/:id
router.get('/:id', async function (req, res) {
    const jugador = await Jugador.findById(req.params.id);
    if (!jugador) return noExiste(res, req.params.id);
    res.json(jugador);
});

// PUT /api/jugadores/:id (médico). El id y los umbrales no se cambian aquí.
router.put('/:id', requiereClave('medico'), async function (req, res) {
    const body = req.body || {};
    if (body.id !== undefined && body.id !== req.params.id) {
        return res.status(400).json({ error: 'El id del jugador no se puede cambiar' });
    }
    const jugador = await Jugador.findById(req.params.id);
    if (!jugador) return noExiste(res, req.params.id);
    jugador.set(elegir(body, CAMPOS_PERFIL));
    await jugador.save();
    await perfiles.cargar();
    res.json(jugador);
});

// PUT /api/jugadores/:id/umbrales (médico). Solo cambia los umbrales que vengan en el cuerpo.
router.put('/:id/umbrales', requiereClave('medico'), async function (req, res) {
    const body = req.body || {};
    const claves = Object.keys(body);
    if (claves.length === 0) {
        return res.status(400).json({ error: 'Indica al menos un umbral' });
    }
    for (const c of claves) {
        if (!(c in UMBRALES_DEFECTO)) {
            return res.status(400).json({ error: 'Umbral desconocido: ' + c });
        }
        if (typeof body[c] !== 'number' || !Number.isFinite(body[c]) || body[c] < 0) {
            return res.status(400).json({ error: c + ' debe ser un número positivo' });
        }
    }
    const jugador = await Jugador.findById(req.params.id);
    if (!jugador) return noExiste(res, req.params.id);
    for (const c of claves) jugador.umbrales[c] = body[c];
    if (jugador.umbrales.tempRoja <= jugador.umbrales.tempAmbar) {
        return res.status(400).json({ error: 'tempRoja tiene que ser mayor que tempAmbar' });
    }
    await jugador.save();
    await perfiles.cargar();
    res.json(jugador);
});

// GET /api/jugadores/:id/pauta: pauta de readaptación activa
router.get('/:id/pauta', async function (req, res) {
    const id = req.params.id;
    if (!(await Jugador.exists({ _id: id }))) return noExiste(res, id);
    const pauta = await Pauta.findOne({ jugadorId: id, activa: true, hasta: { $gte: new Date() } });
    if (!pauta) return res.status(404).json({ error: id + ' no tiene ninguna pauta activa' });
    res.json(pauta);
});

// POST /api/jugadores/:id/pauta (médico): crea una pauta y desactiva la anterior
router.post('/:id/pauta', requiereClave('medico'), async function (req, res) {
    const id = req.params.id;
    const body = req.body || {};
    const jugador = await Jugador.findById(id);
    if (!jugador) return noExiste(res, id);

    const limites = elegir(body, ['velMax', 'cargaMax', 'asimetriaMax']);
    if (Object.keys(limites).length === 0) {
        return res.status(400).json({ error: 'Indica al menos un límite: velMax, cargaMax o asimetriaMax' });
    }
    const hasta = fechaConsulta(body.hasta);
    if (!hasta) return res.status(400).json({ error: 'hasta debe ser una fecha ISO 8601' });
    if (hasta < new Date()) return res.status(400).json({ error: 'hasta tiene que ser una fecha futura' });

    const pauta = new Pauta({ jugadorId: id, ...limites, hasta: hasta, notas: body.notas || '' });
    await pauta.validate();
    await Pauta.updateMany({ jugadorId: id, activa: true }, { activa: false });
    await pauta.save();

    if (!jugador.enReadaptacion) {
        jugador.enReadaptacion = true;
        await jugador.save();
    }
    await perfiles.cargar();
    res.status(201).json(pauta);
});

// GET /api/jugadores/:id/estado: último estado en vivo y semáforo
router.get('/:id/estado', async function (req, res) {
    const id = req.params.id;
    if (!(await Jugador.exists({ _id: id }))) return noExiste(res, id);

    const alertas = await Alerta.find({ jugadorId: id, estado: 'activa' }).sort({ ts: -1 });
    const e = estado.obtener(id);

    res.json({
        jugadorId: id,
        ts: e ? e.ts : null,
        estado: e ? e.estado : null,
        semaforo: semaforo(alertas.map(function (a) { return a.severidad; })),
        sensors: e ? e.sensors : null,       // últimos valores, en el formato del simulador de A
        derivados: e ? e.derivados : null,   // { pctFcMax, asimetria, zonaVelocidad, zonaFc }
        alertasActivas: alertas.map(function (a) {
            return { id: a.id, codigo: a.codigo, severidad: a.severidad };
        })
    });
});

// GET /api/jugadores/:id/historico?desde=&hasta=: resúmenes de 10 s (por defecto, los últimos 15 min)
router.get('/:id/historico', async function (req, res) {
    const id = req.params.id;
    let hasta = fechaConsulta(req.query.hasta);
    let desde = fechaConsulta(req.query.desde);
    if (hasta === null || desde === null) {
        return res.status(400).json({ error: 'desde y hasta deben ser fechas ISO 8601' });
    }
    if (hasta === undefined) hasta = new Date();
    if (desde === undefined) desde = new Date(hasta.getTime() - HISTORICO_DEFECTO_MS);
    if (desde > hasta) {
        return res.status(400).json({ error: 'desde tiene que ser anterior a hasta' });
    }
    if (!(await Jugador.exists({ _id: id }))) return noExiste(res, id);

    const lecturas = await Lectura
        .find({ jugadorId: id, ts: { $gte: desde, $lte: hasta } }, { _id: 0, jugadorId: 0 })
        .sort({ ts: 1 })
        .limit(HISTORICO_MAX)
        .lean();
    res.json(lecturas);
});

module.exports = router;
