// Control del simulador: validación de las órdenes y respuesta sin conexión con Mosquitto

const test = require('node:test');
const assert = require('node:assert/strict');
const simulador = require('../services/simulador');

function codigoDe(fn) {
    try { fn(); } catch (err) { return err.status; }
    return null;
}

test('fase: solo las cinco del motor táctico de A', function () {
    assert.equal(simulador.validarFase('presion_alta'), 'presion_alta');
    assert.deepEqual(Object.keys(simulador.FASES), ['ataque_organizado', 'transicion_defensiva', 'presion_alta', 'defensa_organizada', 'transicion_ofensiva']);
    assert.equal(codigoDe(function () { simulador.validarFase('contraataque'); }), 400);
    assert.equal(codigoDe(function () { simulador.validarFase(undefined); }), 400);
    assert.equal(codigoDe(function () { simulador.validarFase('toString'); }), 400);   // no vale una propiedad heredada
});

test('escenario: jugador p1…p11 y un escenario conocido; "normal" lo quita', function () {
    assert.deepEqual(simulador.validarEscenario({ jugadorId: 'p8', escenario: 'golpe_calor', extra: 1 }), { jugadorId: 'p8', escenario: 'golpe_calor' });
    assert.deepEqual(simulador.validarEscenario({ jugadorId: 'p11', escenario: 'normal' }), { jugadorId: 'p11', escenario: 'normal' });
    assert.equal(codigoDe(function () { simulador.validarEscenario({ jugadorId: 'p12', escenario: 'fc_alta' }); }), 400);
    assert.equal(codigoDe(function () { simulador.validarEscenario({ jugadorId: 'p0', escenario: 'fc_alta' }); }), 400);
    assert.equal(codigoDe(function () { simulador.validarEscenario({ jugadorId: 'p3', escenario: 'gripe' }); }), 400);
    assert.equal(codigoDe(function () { simulador.validarEscenario(null); }), 400);
});

test('cada escenario (salvo normal) dice qué alerta debería provocar', function () {
    for (const [codigo, e] of Object.entries(simulador.ESCENARIOS)) {
        if (codigo === 'normal') assert.equal(e.alerta, null);
        else assert.ok(e.alerta, codigo);
    }
});

test('sin conexión con Mosquitto, la orden responde 503 y no se apunta', async function () {
    await assert.rejects(simulador.cambiarFase('presion_alta'), function (err) { return err.status === 503; });
    await assert.rejects(simulador.cambiarEscenario({ jugadorId: 'p8', escenario: 'golpe_calor' }), function (err) { return err.status === 503; });
    const e = simulador.estado();
    assert.equal(e.fase, null);
    assert.deepEqual(e.escenarios, {});
    assert.equal(e.mqtt, 'disconnected');
});
