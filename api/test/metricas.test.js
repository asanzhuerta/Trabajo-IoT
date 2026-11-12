const test = require('node:test');
const assert = require('node:assert/strict');
const metricas = require('../services/metricas');
const { sensores } = require('./ayuda');

function lectura(vel, v = {}) {
    return { jugadorId: 'p8', ts: new Date(0), estado: 'ok', sensors: sensores({ vel: vel, impacto: 1, ...v }) };
}

function tipos(lista) {
    return lista.map(function (e) { return e.tipo; });
}

test('zonas de velocidad', function () {
    assert.equal(metricas.zonaVelocidad(0), 'andar');
    assert.equal(metricas.zonaVelocidad(7), 'trote');
    assert.equal(metricas.zonaVelocidad(14.4), 'carrera');
    assert.equal(metricas.zonaVelocidad(19.8), 'alta');
    assert.equal(metricas.zonaVelocidad(25), 'sprint');
});

test('zonas de FC', function () {
    assert.deepEqual([55, 65, 75, 85, 95].map(metricas.zonaFc), ['Z1', 'Z2', 'Z3', 'Z4', 'Z5']);
});

test('un sprint se cuenta al cruzar los 25 km/h, no cada segundo', function () {
    assert.deepEqual(tipos(metricas.eventos(lectura(26), 20)), ['sprint']);
    assert.deepEqual(tipos(metricas.eventos(lectura(28), 26)), []);
    assert.deepEqual(tipos(metricas.eventos(lectura(26), null)), ['sprint']);
});

test('aceleraciones, desaceleraciones, cambios de dirección e impactos', function () {
    const ev = metricas.eventos(lectura(15, { acel: 3.4, decel: 3.6, giro: -90, impacto: 3 }), 15);
    assert.deepEqual(tipos(ev), ['aceleracion', 'desaceleracion', 'cambio_direccion', 'impacto']);
    assert.equal(ev[0].valor, 3.4);
    assert.equal(ev[1].valor, 3.6);
    assert.equal(ev[2].valor, 90);   // el giro va con signo; el evento guarda el ángulo
});

test('girar casi parado no es un cambio de dirección', function () {
    assert.deepEqual(tipos(metricas.eventos(lectura(5, { giro: 120 }), 5)), []);
});

test('acciones de alta intensidad: más de 3 m/s²', function () {
    assert.deepEqual(metricas.accionesAltas(sensores({ acel: 3.1, decel: 2.9 })), { acel: 1, decel: 0 });
    assert.deepEqual(metricas.accionesAltas(sensores({ acel: 0, decel: 4 })), { acel: 0, decel: 1 });
    // la frenada máxima del simulador de A (3,0 justos) no cuenta
    assert.deepEqual(metricas.accionesAltas(sensores({ acel: 3, decel: 3 })), { acel: 0, decel: 0 });
});

test('sin señal no hay eventos', function () {
    assert.deepEqual(metricas.eventos({ jugadorId: 'p8', ts: new Date(0), estado: 'sin_senal' }, 20), []);
});
