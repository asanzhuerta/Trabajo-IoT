// Estado en vivo y resúmenes de 10 s

const test = require('node:test');
const assert = require('node:assert/strict');
const estado = require('../services/estado');
const resumen = require('../services/resumen');
const { semaforo } = require('../services/semaforo');
const { sensores } = require('./ayuda');

const PERFIL = { _id: 'p8', fcMax: 200 };
const T0 = Date.parse('2026-11-12T18:30:00.000Z');   // múltiplo de 10 s

// Lectura del segundo `seg`. Por defecto: 10 km/h, 5 m por segundo, FC 150.
function lectura(seg, v = {}) {
    return {
        jugadorId: 'p8',
        ts: new Date(T0 + seg * 1000),
        estado: 'ok',
        sensors: sensores({ dist: seg * 5, fc: 150, ...v })
    };
}

test.beforeEach(function () {
    estado.limpiar();
});

test('una ventana se cierra cuando llega la primera lectura de la siguiente', function () {
    for (let s = 0; s < 10; s++) {
        assert.equal(estado.procesar(lectura(s), PERFIL).resumen, null);
    }
    const r = estado.procesar(lectura(10), PERFIL).resumen;
    assert.ok(r);
    assert.equal(r.ts.getTime(), T0);
    assert.equal(r.jugadorId, 'p8');
    assert.equal(r.muestras, 10);
    assert.equal(r.distancia, 45);   // de 0 a 45 m (la primera lectura no tiene anterior)
    assert.equal(r.velMedia, 10);
    assert.equal(r.fcMedia, 150);
});

test('el resumen calcula medias, máximos, alta intensidad y asimetría', function () {
    estado.procesar(lectura(0, { x: 1, y: 1, vel: 10, dist: 100 }), PERFIL);
    estado.procesar(lectura(1, { x: 2, y: 2, vel: 25, dist: 107, fc: 190, izq: 40 }), PERFIL);
    estado.procesar(lectura(2, { x: 3, y: 4, vel: 20, dist: 113, temp: 38.4, izq: 45, acel: 3.5 }), PERFIL);
    const r = estado.procesar(lectura(10), PERFIL).resumen;
    assert.equal(r.velMax, 25);
    assert.equal(r.velMedia, 18.3);
    assert.equal(r.distancia, 13);
    assert.equal(r.distAltaInt, 13);          // las dos últimas, a más de 19,8 km/h
    assert.equal(r.fcMax, 190);
    assert.equal(r.temp, 38.4);
    assert.equal(r.asimetria, 15);            // media de 20 y 10
    assert.equal(r.acelAltas, 1);             // la API cuenta la aceleración de 3,5 m/s²
    assert.equal(r.sprints, 0);               // 25 km/h no pasa del umbral de sprint
    assert.deepEqual([r.x, r.y], [3, 4]);
});

test('el estado guarda los sensores en el formato de A y conserva temperatura y plantillas', function () {
    estado.procesar(lectura(0, { temp: 38.2, izq: 44 }), PERFIL);
    estado.procesar(lectura(1, { fc: 184 }), PERFIL);
    const e = estado.obtener('p8');
    assert.equal(e.estado, 'ok');
    assert.deepEqual(e.sensors.pulsemeter, { pulse: { unit: 'bpm', value: 184 } });
    assert.deepEqual(e.sensors.termometer, { temperature: { unit: 'C', value: 38.2 } });
    assert.equal(e.sensors.pressuresensor.pressureleftfoot.value, 44);
    assert.equal(e.derivados.pctFcMax, 92);
    assert.equal(e.derivados.asimetria, 12);
    assert.equal(e.derivados.zonaFc, 'Z5');
    assert.equal(e.historial.length, 2);
});

test('asimetría: las pisadas que alternan de pie se compensan', function () {
    // Como el simulador de A: la carga pasa de un pie al otro (35/65, 65/35…) aunque el jugador esté bien
    for (let s = 0; s < 10; s++) {
        estado.procesar(lectura(s, { izq: s % 2 === 0 ? 35 : 65 }), PERFIL);
    }
    assert.equal(estado.obtener('p8').derivados.asimetria, 0);
    const r = estado.procesar(lectura(10, { izq: 50 }), PERFIL).resumen;
    assert.equal(r.asimetria, 0);
});

test('asimetría: un desequilibrio mantenido sí se detecta', function () {
    // Carga siempre más el pie derecho: 40/60 y 45/55 → media de izq − der = −15
    for (let s = 0; s < 10; s++) {
        estado.procesar(lectura(s, { izq: s % 2 === 0 ? 40 : 45 }), PERFIL);
    }
    assert.equal(estado.obtener('p8').derivados.asimetria, 15);
});

test('asimetría: solo cuentan las plantillas del último minuto', function () {
    for (let s = 0; s < 5; s++) estado.procesar(lectura(s, { izq: 30 }), PERFIL);   // 40 puntos
    for (let s = 5; s < 66; s++) estado.procesar(lectura(s, { izq: 48 }), PERFIL);  // 4 puntos
    assert.equal(estado.obtener('p8').derivados.asimetria, 4);
});

test('asimetría: cargar un pie unos segundos (moverse de lado) no basta', function () {
    // 8 s cargando el derecho (30/70) dentro de un minuto equilibrado: la media se queda en 40 × 8 / 60 ≈ 5
    for (let s = 0; s < 60; s++) estado.procesar(lectura(s, { izq: s >= 20 && s < 28 ? 30 : 50 }), PERFIL);
    assert.ok(estado.obtener('p8').derivados.asimetria < 6);
});

test('sin_senal cambia el estado pero no suma muestras', function () {
    estado.procesar(lectura(0), PERFIL);
    estado.procesar({ jugadorId: 'p8', ts: new Date(T0 + 1000), estado: 'sin_senal' }, PERFIL);
    const e = estado.obtener('p8');
    assert.equal(e.estado, 'sin_senal');
    assert.equal(e.ventana.muestras, 1);
    assert.equal(estado.vista()[0].estado, 'sin_senal');
});

test('una ventana sin ninguna lectura válida no genera resumen', function () {
    estado.procesar({ jugadorId: 'p8', ts: new Date(T0), estado: 'sin_senal' }, PERFIL);
    assert.equal(estado.procesar(lectura(10), PERFIL).resumen, null);
});

test('cerrarVencidas cierra las ventanas abandonadas tras el margen', function () {
    estado.procesar(lectura(3), PERFIL);
    assert.equal(estado.cerrarVencidas(T0 + 12000).length, 0);
    const cerrados = estado.cerrarVencidas(T0 + 15000);
    assert.equal(cerrados.length, 1);
    assert.equal(estado.obtener('p8').ventana, null);
});

test('si la distancia baja (reinicio del wearable) no cuenta metros negativos', function () {
    estado.procesar(lectura(0, { dist: 500 }), PERFIL);
    estado.procesar(lectura(1, { dist: 3 }), PERFIL);
    estado.procesar(lectura(2, { dist: 8 }), PERFIL);
    assert.equal(estado.procesar(lectura(10), PERFIL).resumen.distancia, 5);
});

test('los acumulados de la sesión se ponen a cero al empezar otra', function () {
    estado.procesar(lectura(0, { acel: 4, decel: 4 }), PERFIL);
    assert.equal(estado.obtener('p8').sesion.acelAltas, 1);
    assert.equal(estado.obtener('p8').sesion.decelAltas, 1);
    estado.iniciarSesion('abc');
    assert.equal(estado.obtener('p8').sesion.acelAltas, 0);
    assert.equal(estado.sesionActual(), 'abc');
});

test('semáforo: rojo si hay crítica, ámbar si hay aviso, verde si nada', function () {
    assert.equal(semaforo([]), 'verde');
    assert.equal(semaforo(['aviso']), 'ambar');
    assert.equal(semaforo(['aviso', 'critica']), 'rojo');
    estado.procesar(lectura(0), PERFIL);
    estado.obtener('p8').alertas.set('CALOR_AMBAR', 'aviso');
    const v = estado.vista()[0];
    assert.equal(v.semaforo, 'ambar');
    assert.equal(v.sensors.gps.speed.value, 10);
});

test('inicioVentana redondea a múltiplos de 10 s', function () {
    assert.equal(resumen.inicioVentana(T0 + 9999), T0);
    assert.equal(resumen.inicioVentana(T0 + 10000), T0 + 10000);
});
