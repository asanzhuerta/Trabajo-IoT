// Validación del lote: los sensores se guardan en el mismo formato en el que los manda A

const test = require('node:test');
const assert = require('node:assert/strict');
const { validarLote } = require('../services/validacion');

const TS = '2026-11-12T18:30:05.000Z';

const m = function (unit, value) { return { unit: unit, value: value }; };

function sensores(cambios = {}) {
    return {
        gps: { speed: m('km/h', 28.7), distancecovered: m('m', 7842), position: { X: m('m', 52.3), Y: m('m', 30.1) } },
        accelerometer: { acceleration: m('m/s2', 3.7), desacceleration: m('m/s2', 0.4) },
        giroscope: { changeinposition: m('degrees', -72) },
        pulsemeter: { pulse: m('bpm', 181) },
        ...cambios
    };
}

function lecturaOk(cambios = {}, extra = {}) {
    return { jugadorId: 'p8', ts: TS, estado: 'ok', sensors: sensores(cambios), ...extra };
}

function lote(lecturas) {
    return { ts: TS, lecturas: lecturas };
}

test('guarda los sensores de A tal cual, sin traducirlos', function () {
    const entrada = sensores({
        termometer: { temperature: m('C', 38.1) },
        pressuresensor: { pressureleftfoot: m('%', 42), pressurerightfoot: m('%', 58) }
    });
    const r = validarLote(lote([{ jugadorId: 'p8', ts: TS, estado: 'ok', sensors: entrada }]), 'eq1');
    assert.equal(r.ok, true);
    const l = r.lote.lecturas[0];
    assert.deepEqual(l.sensors, entrada);
    assert.ok(l.ts instanceof Date);
});

test('descarta los campos que no están en el contrato', function () {
    const s = sensores();
    s.gps.altitud = m('m', 10);
    s.camara = { foto: 'x' };
    const r = validarLote(lote([{ jugadorId: 'p8', ts: TS, sensors: s, nombre: 'Pepe' }]), 'eq1');
    assert.equal(r.ok, true);
    assert.equal(r.lote.lecturas[0].nombre, undefined);
    assert.equal(r.lote.lecturas[0].sensors.gps.altitud, undefined);
    assert.equal(r.lote.lecturas[0].sensors.camara, undefined);
});

test('acepta la lectura sin señal del watchdog', function () {
    const r = validarLote(lote([lecturaOk(), { jugadorId: 'p10', ts: TS, estado: 'sin_senal' }]), 'eq1');
    assert.equal(r.ok, true);
    assert.deepEqual(r.lote.lecturas[1], { jugadorId: 'p10', ts: new Date(TS), estado: 'sin_senal' });
});

test('impact, giroscope, termometer y pressuresensor son opcionales', function () {
    const s = sensores({ accelerometer: { acceleration: m('m/s2', 1), desacceleration: m('m/s2', 0), impact: m('g', 6.5) } });
    delete s.giroscope;
    const r = validarLote(lote([{ jugadorId: 'p3', ts: TS, sensors: s }]), 'eq1');
    assert.equal(r.ok, true);
    assert.equal(r.lote.lecturas[0].sensors.accelerometer.impact.value, 6.5);
    assert.equal(r.lote.lecturas[0].sensors.giroscope, undefined);
    assert.equal(r.lote.lecturas[0].sensors.termometer, undefined);
    assert.equal(r.lote.lecturas[0].estado, 'ok');
});

test('la unidad es opcional, pero si viene tiene que ser la esperada', function () {
    const sinUnidad = validarLote(lote([lecturaOk({ pulsemeter: { pulse: { value: 150 } } })]), 'eq1');
    assert.equal(sinUnidad.ok, true);
    assert.deepEqual(sinUnidad.lote.lecturas[0].sensors.pulsemeter.pulse, { unit: 'bpm', value: 150 });
    const mal = validarLote(lote([lecturaOk({ gps: { speed: m('m/s', 8), distancecovered: m('m', 1), position: { X: m('m', 1), Y: m('m', 1) } } })]), 'eq1');
    assert.equal(mal.ok, false);
    assert.match(mal.error, /speed\.unit debe ser "km\/h"/);
});

test('si la lectura no trae ts usa el del lote; equipo es opcional', function () {
    const l = lecturaOk();
    delete l.ts;
    const r = validarLote(lote([l]), 'eq1');
    assert.equal(r.lote.lecturas[0].ts.toISOString(), TS);
    assert.equal(validarLote({ ...lote([lecturaOk()]), equipo: 'eq1' }, 'eq1').ok, true);
    assert.equal(validarLote({ ...lote([lecturaOk()]), equipo: 'eq2' }, 'eq1').ok, false);
});

test('rechaza cuerpos que no son un lote', function () {
    for (const cuerpo of [undefined, null, [], 'hola', { ts: TS, lecturas: [] }, { lecturas: [lecturaOk()] }]) {
        assert.equal(validarLote(cuerpo, 'eq1').ok, false);
    }
});

test('indica qué lectura y qué campo fallan', function () {
    const r = validarLote(lote([lecturaOk(), lecturaOk({ pulsemeter: { pulse: m('bpm', 'muchas') } }, { jugadorId: 'p9' })]), 'eq1');
    assert.equal(r.ok, false);
    assert.equal(r.error, 'lecturas[1]: sensors.pulsemeter.pulse.value debe ser un número');
    const sinGps = lecturaOk();
    delete sinGps.sensors.gps;
    assert.equal(validarLote(lote([sinGps]), 'eq1').error, 'lecturas[0]: falta el objeto sensors.gps');
});

test('rechaza valores fuera de rango', function () {
    const fuera = [
        { gps: { speed: m('km/h', 10), distancecovered: m('m', 1), position: { X: m('m', 120), Y: m('m', 30) } } },
        { pulsemeter: { pulse: m('bpm', 300) } },
        { termometer: { temperature: m('C', 50) } },
        { pressuresensor: { pressureleftfoot: m('%', 70), pressurerightfoot: m('%', 50) } }
    ];
    for (const cambio of fuera) {
        assert.equal(validarLote(lote([lecturaOk(cambio)]), 'eq1').ok, false, JSON.stringify(cambio));
    }
});

test('rechaza ids que no son seudónimos y jugadores repetidos', function () {
    assert.equal(validarLote(lote([lecturaOk({}, { jugadorId: 'Pedri' })]), 'eq1').ok, false);
    assert.equal(validarLote(lote([lecturaOk({}, { jugadorId: 'J08' })]), 'eq1').ok, false);
    const r = validarLote(lote([lecturaOk(), lecturaOk()]), 'eq1');
    assert.equal(r.ok, false);
    assert.match(r.error, /repetido/);
});

test('rechaza un estado desconocido', function () {
    assert.equal(validarLote(lote([lecturaOk({}, { estado: 'roto' })]), 'eq1').ok, false);
});
