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

test('jugador: p1…p11; otro id es 404', function () {
    assert.equal(simulador.validarJugador('p11'), 'p11');
    assert.equal(codigoDe(function () { simulador.validarJugador('p12'); }), 404);
    assert.equal(codigoDe(function () { simulador.validarJugador('p0'); }), 404);
});

test('ajuste de sensores: pulso, temperatura o los dos, con 30 s por defecto', function () {
    assert.deepEqual(simulador.validarAjuste({ pulse: 155, extra: 1 }), { pulse: 155, durationSeconds: 30 });
    assert.deepEqual(simulador.validarAjuste({ temperature: 40.4, durationSeconds: 0 }), { temperature: 40.4, durationSeconds: 0 });
    assert.deepEqual(simulador.validarAjuste({ pulse: 45, temperature: 38.2, durationSeconds: 1 }), { pulse: 45, temperature: 38.2, durationSeconds: 1 });
});

test('ajuste de sensores: deja provocar las alertas y rechaza lo que la telemetría no aceptaría', function () {
    // CALOR_ROJA (40 °C) e INCIDENTE (FC < 50) tienen que poder forzarse
    assert.equal(simulador.validarAjuste({ temperature: 41 }).temperature, 41);
    assert.equal(simulador.validarAjuste({ pulse: 40 }).pulse, 40);
    assert.equal(codigoDe(function () { simulador.validarAjuste({}); }), 400);
    assert.equal(codigoDe(function () { simulador.validarAjuste(null); }), 400);
    assert.equal(codigoDe(function () { simulador.validarAjuste({ pulse: '155' }); }), 400);
    assert.equal(codigoDe(function () { simulador.validarAjuste({ pulse: 300 }); }), 400);
    assert.equal(codigoDe(function () { simulador.validarAjuste({ temperature: 46 }); }), 400);
    assert.equal(codigoDe(function () { simulador.validarAjuste({ pulse: 150, durationSeconds: 2.5 }); }), 400);
    assert.equal(codigoDe(function () { simulador.validarAjuste({ pulse: 150, durationSeconds: -1 }); }), 400);
});

test('sin conexión con Mosquitto, la orden responde 503 y no se apunta', async function () {
    await assert.rejects(simulador.cambiarFase('presion_alta'), function (err) { return err.status === 503; });
    await assert.rejects(simulador.ajustarSensores('p8', { temperature: 40.4 }), function (err) { return err.status === 503; });
    const e = simulador.estado();
    assert.equal(e.fase, null);
    assert.deepEqual(e.ajustes, {});
    assert.equal(e.mqtt, 'disconnected');
});
