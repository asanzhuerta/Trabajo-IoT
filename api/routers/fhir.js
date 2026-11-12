// /fhir: constantes vitales de los jugadores como recursos FHIR R4 (ver services/fhir.js).
//   GET /fhir/Observation?patient=p8&code=8867-4&_count=20
//   GET /fhir/Observation/p8-8867-4-1794500000000

const express = require('express');
const { Lectura } = require('../models');
const fhir = require('../services/fhir');

const router = express.Router();

const COUNT_DEFECTO = 20;
const COUNT_MAX = 100;

function responder(res, status, recurso) {
    res.status(status).type('application/fhir+json').send(JSON.stringify(recurso));
}

function base(req) {
    return req.protocol + '://' + req.get('host');
}

router.get('/Observation', async function (req, res) {
    const jugadorId = fhir.leerPaciente(req.query.patient);
    if (!jugadorId) {
        return responder(res, 400, fhir.error('Indica el paciente: patient=p8 (o patient=Patient/p8)', 'required'));
    }
    const codigos = fhir.leerCodigos(req.query.code);
    if (!codigos) {
        return responder(res, 400, fhir.error('code solo puede ser ' + Object.keys(fhir.CODIGOS).join(' o ') + ' (LOINC)', 'not-supported'));
    }
    const count = req.query._count === undefined ? COUNT_DEFECTO : Number(req.query._count);
    if (!Number.isInteger(count) || count < 1 || count > COUNT_MAX) {
        return responder(res, 400, fhir.error('_count va de 1 a ' + COUNT_MAX));
    }

    // Las más recientes de cada código, todas juntas de la más nueva a la más antigua
    const listas = await Promise.all(codigos.map(async function (codigo) {
        const campo = fhir.CODIGOS[codigo].campo;
        const lecturas = await Lectura
            .find({ jugadorId: jugadorId, [campo]: { $ne: null } }, { ts: 1, [campo]: 1 })
            .sort({ ts: -1 }).limit(count).lean();
        return lecturas.map(function (l) { return fhir.observacion(l, jugadorId, codigo); });
    }));
    const observaciones = listas.flat().sort(function (a, b) {
        return b.effectiveDateTime.localeCompare(a.effectiveDateTime);
    });

    responder(res, 200, fhir.bundle(observaciones, base(req), base(req) + req.originalUrl));
});

router.get('/Observation/:id', async function (req, res) {
    const id = fhir.leerId(req.params.id);
    const noExiste = fhir.error('No existe la Observation ' + req.params.id, 'not-found');
    if (!id) return responder(res, 404, noExiste);

    const campo = fhir.CODIGOS[id.codigo].campo;
    const lectura = await Lectura.findOne({ jugadorId: id.jugadorId, ts: id.ts, [campo]: { $ne: null } }).lean();
    if (!lectura) return responder(res, 404, noExiste);
    responder(res, 200, fhir.observacion(lectura, id.jugadorId, id.codigo));
});

module.exports = router;
