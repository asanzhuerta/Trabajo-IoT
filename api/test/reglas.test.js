// Una prueba (o varias) por regla de alerta, más el antirrebote

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluar } = require('../services/reglas');
const { puedeLanzarse, ESPERA_MS } = require('../services/alertas');
const { UMBRALES_DEFECTO } = require('../services/umbrales');
const { sensores } = require('./ayuda');

const AHORA = Date.parse('2026-11-12T18:30:00.000Z');
const PERFIL = { _id: 'p8', fcMax: 200, asimetriaBase: 4, umbrales: { ...UMBRALES_DEFECTO } };

// Historial de `seg` segundos a 1 Hz que termina en AHORA. punto(i) da los datos del segundo i (0 = el más antiguo):
// vel, fc, impacto (van a los sensores, en el formato de A), pctFcMax y estado.
function historial(seg, punto) {
    const h = [];
    for (let i = 0; i < seg; i++) {
        const v = { vel: 10, fc: 140, pctFcMax: 70, impacto: 1, ...punto(i) };
        if (v.estado === 'sin_senal') {
            h.push({ ts: AHORA - (seg - 1 - i) * 1000, estado: 'sin_senal' });
            continue;
        }
        h.push({
            ts: AHORA - (seg - 1 - i) * 1000,
            estado: 'ok',
            sensors: sensores({ vel: v.vel, fc: v.fc, impacto: v.impacto, temp: 38, izq: 47.5 }),
            pctFcMax: v.pctFcMax,
            asimetria: 5
        });
    }
    return h;
}

// Cambia la velocidad o el impacto de un punto ya construido
function fijar(punto, cambios) {
    if (cambios.vel !== undefined) punto.sensors.gps.speed.value = cambios.vel;
    if (cambios.impacto !== undefined) punto.sensors.accelerometer.impact.value = cambios.impacto;
}

// Contexto con un jugador "normal" al que se le cambia lo que haga falta
function ctx(cambios = {}) {
    const h = cambios.historial || historial(30, function () { return {}; });
    const conDatos = h.filter(function (p) { return p.estado === 'ok'; });
    const ultimoPunto = conDatos[conDatos.length - 1];
    const u = cambios.ultimo || {};
    // Últimos sensores (formato de A) y derivados, como los deja services/estado.js
    const s = JSON.parse(JSON.stringify(ultimoPunto.sensors));
    if (u.temp !== undefined) s.termometer.temperature.value = u.temp;
    const e = {
        jugadorId: 'p8',
        estado: cambios.estado || h[h.length - 1].estado,
        ts: new Date(AHORA),
        historial: h,
        sensors: s,
        derivados: { pctFcMax: ultimoPunto.pctFcMax, asimetria: u.asimetria ?? 5, zonaVelocidad: 'trote', zonaFc: 'Z3' },
        sesion: { distancia: 3000, distAltaInt: 200, sprints: 3, acelAltas: 20, decelAltas: 20, ...(cambios.sesion || {}) }
    };
    return {
        e: e,
        perfil: cambios.perfil || PERFIL,
        pauta: cambios.pauta || null,
        clima: cambios.clima || null,
        ahora: AHORA
    };
}

function codigos(c) {
    return evaluar(c).map(function (a) { return a.codigo; }).sort();
}

test('un jugador normal no genera ninguna alerta', function () {
    assert.deepEqual(codigos(ctx()), []);
});

test('CALOR_AMBAR desde 39 °C y CALOR_ROJA desde 40 °C', function () {
    assert.deepEqual(codigos(ctx({ ultimo: { temp: 38.9 } })), []);
    assert.deepEqual(codigos(ctx({ ultimo: { temp: 39.0 } })), ['CALOR_AMBAR']);
    assert.deepEqual(codigos(ctx({ ultimo: { temp: 40.1 } })), ['CALOR_AMBAR', 'CALOR_ROJA']);
    const roja = evaluar(ctx({ ultimo: { temp: 40.1 } })).find(function (a) { return a.codigo === 'CALOR_ROJA'; });
    assert.equal(roja.severidad, 'critica');
    assert.equal(roja.umbral, 40);
    assert.match(roja.mensaje, /40,1 °C/);
});

test('con WBGT alto los umbrales de calor bajan 0,3 °C', function () {
    assert.deepEqual(codigos(ctx({ ultimo: { temp: 38.8 }, clima: { wbgt: 27.9 } })), []);
    const r = evaluar(ctx({ ultimo: { temp: 38.8 }, clima: { wbgt: 29 } }));
    assert.equal(r.length, 1);
    assert.equal(r[0].codigo, 'CALOR_AMBAR');
    assert.equal(r[0].umbral, 38.7);
    assert.match(r[0].mensaje, /WBGT/);
});

test('los umbrales son los del jugador', function () {
    const perfil = { ...PERFIL, umbrales: { ...UMBRALES_DEFECTO, tempAmbar: 38.5 } };
    assert.deepEqual(codigos(ctx({ ultimo: { temp: 38.6 }, perfil: perfil })), ['CALOR_AMBAR']);
});

test('FC_ALTA solo si se mantiene por encima del 92 % durante 60 s', function () {
    const alta = historial(60, function () { return { fc: 188, pctFcMax: 94 }; });
    assert.deepEqual(codigos(ctx({ historial: alta })), ['FC_ALTA']);

    const corta = historial(60, function (i) { return i < 20 ? { pctFcMax: 85 } : { fc: 188, pctFcMax: 94 }; });
    assert.deepEqual(codigos(ctx({ historial: corta })), []);

    const pocosDatos = historial(30, function () { return { fc: 188, pctFcMax: 94 }; });
    assert.deepEqual(codigos(ctx({ historial: pocosDatos })), []);
});

test('FC_DESACOPLE: FC > 85 % caminando durante 30 s', function () {
    const desacople = historial(30, function () { return { vel: 5, fc: 178, pctFcMax: 89 }; });
    assert.deepEqual(codigos(ctx({ historial: desacople })), ['FC_DESACOPLE']);

    const corriendo = historial(30, function () { return { vel: 18, fc: 178, pctFcMax: 89 }; });
    assert.deepEqual(codigos(ctx({ historial: corriendo })), []);
});

// 10 s de sprint y 61 s andando: el primer segundo andando es el que queda justo hace 60 s
function trasEsfuerzo(fcFinal) {
    return historial(71, function (i) {
        if (i < 10) return { vel: 26, fc: 185, pctFcMax: 93 };
        const fc = Math.round(185 - (185 - fcFinal) * (i - 10) / 60);
        return { vel: 4, fc: fc, pctFcMax: 80 };   // por debajo del 85 % para no mezclarla con FC_DESACOPLE
    });
}

test('RECUPERACION_LENTA si la FC baja 12 lpm o menos en 60 s tras un esfuerzo', function () {
    const lenta = evaluar(ctx({ historial: trasEsfuerzo(175) }));
    assert.deepEqual(lenta.map(function (a) { return a.codigo; }), ['RECUPERACION_LENTA']);
    assert.equal(lenta[0].valor, 10);
    assert.deepEqual(codigos(ctx({ historial: trasEsfuerzo(173) })), ['RECUPERACION_LENTA']);   // justo 12
    assert.deepEqual(codigos(ctx({ historial: trasEsfuerzo(150) })), []);
});

test('RECUPERACION_LENTA no salta si vuelve a correr durante la recuperación', function () {
    const h = trasEsfuerzo(178);
    fijar(h[40], { vel: 15 });
    assert.deepEqual(codigos(ctx({ historial: h })), []);
});

function golpe(despues) {
    return historial(20, function (i) {
        if (i < 5) return { vel: 18 };
        if (i === 5) return { vel: 3, impacto: 6.5 };
        return { vel: 0, ...despues(i) };
    });
}

test('INCIDENTE: impacto ≥ 4 g, inmóvil 10 s y FC anómala o sin señal', function () {
    const bradicardia = golpe(function () { return { fc: 45, pctFcMax: 23 }; });
    const r = evaluar(ctx({ historial: bradicardia }));
    assert.deepEqual(r.map(function (a) { return a.codigo; }), ['INCIDENTE']);
    assert.equal(r[0].severidad, 'critica');
    assert.equal(r[0].valor, 6.5);

    const taquicardia = golpe(function () { return { fc: 194, pctFcMax: 97 }; });
    assert.ok(codigos(ctx({ historial: taquicardia })).includes('INCIDENTE'));

    const sinSenal = golpe(function (i) { return i > 10 ? { estado: 'sin_senal' } : { fc: 120, pctFcMax: 60 }; });
    assert.deepEqual(codigos(ctx({ historial: sinSenal, estado: 'sin_senal' })), ['INCIDENTE', 'SIN_SENAL']);
});

test('INCIDENTE no salta si se levanta, si la FC es normal o si el impacto es flojo', function () {
    assert.deepEqual(codigos(ctx({ historial: golpe(function (i) { return i === 15 ? { vel: 6, fc: 45, pctFcMax: 23 } : { fc: 45, pctFcMax: 23 }; }) })), []);
    assert.deepEqual(codigos(ctx({ historial: golpe(function () { return { fc: 110, pctFcMax: 55 }; }) })), []);
    const flojo = golpe(function () { return { fc: 45, pctFcMax: 23 }; });
    fijar(flojo[5], { impacto: 3 });
    assert.deepEqual(codigos(ctx({ historial: flojo })), []);
});

test('SOBRECARGA con más de 120 acciones de alta intensidad en la sesión', function () {
    assert.deepEqual(codigos(ctx({ sesion: { acelAltas: 60, decelAltas: 60 } })), []);
    assert.deepEqual(codigos(ctx({ sesion: { acelAltas: 60, decelAltas: 61 } })), ['SOBRECARGA']);
});

test('ASIMETRIA si supera en más de 15 puntos la base del jugador', function () {
    assert.deepEqual(codigos(ctx({ ultimo: { asimetria: 19 } })), []);
    const r = evaluar(ctx({ ultimo: { asimetria: 20 } }));
    assert.equal(r[0].codigo, 'ASIMETRIA');
    assert.equal(r[0].umbral, 19);
});

test('PAUTA_EXCEDIDA por velocidad, carga o asimetría, solo con pauta en vigor', function () {
    const pauta = { velMax: 22, cargaMax: 600, asimetriaMax: 8, hasta: new Date(AHORA + 86400000) };
    assert.deepEqual(codigos(ctx({ pauta: pauta })), []);

    const rapido = historial(30, function () { return { vel: 24 }; });
    assert.match(evaluar(ctx({ historial: rapido, pauta: pauta }))[0].mensaje, /velocidad de 24 km\/h/);
    assert.match(evaluar(ctx({ pauta: pauta, sesion: { distAltaInt: 650 } }))[0].mensaje, /650 m/);
    assert.match(evaluar(ctx({ pauta: pauta, ultimo: { asimetria: 9 } }))[0].mensaje, /asimetría/);

    const caducada = { ...pauta, hasta: new Date(AHORA - 1000) };
    assert.deepEqual(codigos(ctx({ historial: rapido, pauta: caducada })), []);
});

test('SIN_SENAL cuando la última lectura es sin_senal (y nada más)', function () {
    const h = historial(30, function (i) { return i === 29 ? { estado: 'sin_senal' } : {}; });
    assert.deepEqual(codigos(ctx({ historial: h, estado: 'sin_senal', ultimo: { temp: 41 } })), ['SIN_SENAL']);
});

test('antirrebote: no se repite mientras está activa ni hasta 60 s después de confirmarla', function () {
    const e = { alertas: new Map(), confirmadas: new Map() };
    assert.equal(puedeLanzarse(e, 'FC_ALTA', AHORA), true);
    e.alertas.set('FC_ALTA', 'aviso');
    assert.equal(puedeLanzarse(e, 'FC_ALTA', AHORA), false);
    assert.equal(puedeLanzarse(e, 'CALOR_AMBAR', AHORA), true);

    e.alertas.delete('FC_ALTA');
    e.confirmadas.set('FC_ALTA', AHORA);
    assert.equal(puedeLanzarse(e, 'FC_ALTA', AHORA + ESPERA_MS - 1), false);
    assert.equal(puedeLanzarse(e, 'FC_ALTA', AHORA + ESPERA_MS), true);
});
