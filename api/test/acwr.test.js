// ACWR, estimación del WBGT y conversión a FHIR

const test = require('node:test');
const assert = require('node:assert/strict');
const acwr = require('../services/acwr');
const { estimarWbgt } = require('../services/clima');
const fhir = require('../services/fhir');
const historial = require('../scripts/historial');

const AHORA = Date.parse('2026-11-12T18:00:00.000Z');
const DIA = acwr.DIA_MS;

// Una sesión de `carga` metros cada `cada` días durante 28 días
function sesiones(carga, cada) {
    const lista = [];
    for (let d = 0.5; d < 28; d += cada) {
        lista.push({ inicio: new Date(AHORA - d * DIA), carga: carga });
    }
    return lista;
}

test('ACWR: con la misma carga todas las semanas el ratio es 1', function () {
    const r = acwr.calcular(sesiones(500, 1.75), AHORA);   // 4 por semana
    assert.equal(r.ratio, 1);
    assert.equal(r.franja, 'optima');
    assert.equal(r.sesiones7d, 4);
    assert.equal(r.sesiones28d, 16);
    assert.equal(r.cargaCronica, r.cargaAguda);
});

test('ACWR: la crónica es la media semanal de los 28 días, incluida la última semana', function () {
    // 3 semanas a 1000 m y la última a 2000: aguda 2000, crónica (3000 + 2000) / 4 = 1250
    const r = acwr.calcular([
        { inicio: new Date(AHORA - 3 * DIA), carga: 2000 },
        { inicio: new Date(AHORA - 10 * DIA), carga: 1000 },
        { inicio: new Date(AHORA - 17 * DIA), carga: 1000 },
        { inicio: new Date(AHORA - 24 * DIA), carga: 1000 }
    ], AHORA);
    assert.deepEqual([r.cargaAguda, r.cargaCronica, r.ratio, r.franja], [2000, 1250, 1.6, 'alta']);
});

test('ACWR: franjas en 0,8 y 1,3; sin carga crónica no hay ratio', function () {
    assert.equal(acwr.franja(0.79), 'baja');
    assert.equal(acwr.franja(0.8), 'optima');
    assert.equal(acwr.franja(1.3), 'optima');
    assert.equal(acwr.franja(1.31), 'alta');
    const vacio = acwr.calcular([], AHORA);
    assert.equal(vacio.ratio, null);
    assert.equal(vacio.franja, null);
});

test('ACWR: no cuentan las sesiones de hace 28 días o más, ni las futuras', function () {
    const r = acwr.calcular([
        { inicio: new Date(AHORA - 28 * DIA), carga: 9999 },
        { inicio: new Date(AHORA + DIA), carga: 9999 },
        { inicio: new Date(AHORA - DIA), carga: 400 }
    ], AHORA);
    assert.equal(r.sesiones28d, 1);
    assert.equal(r.cargaAguda, 400);
});

test('el histórico del seed da las tres franjas: p7 alta, p5 baja y el resto óptima', function () {
    const s = historial.generar(AHORA);
    assert.equal(s.length, 16);
    function ratioDe(id) {
        return acwr.calcular(s.map(function (x) {
            return { inicio: x.inicio, carga: x.resumen.find(function (r) { return r.jugadorId === id; }).distAltaInt };
        }), AHORA);
    }
    assert.equal(ratioDe('p7').franja, 'alta');
    assert.equal(ratioDe('p5').franja, 'baja');
    for (const id of ['p1', 'p2', 'p3', 'p4', 'p6', 'p8', 'p9', 'p10', 'p11']) {
        assert.equal(ratioDe(id).franja, 'optima', id);
    }
});

test('WBGT estimado: 30 °C y 50 % de humedad dan unos 29 °C; más humedad, más WBGT', function () {
    assert.equal(estimarWbgt(30, 50), 29.3);
    assert.ok(estimarWbgt(30, 80) > estimarWbgt(30, 50));
    assert.ok(estimarWbgt(20, 50) < 28);   // un día templado no baja los umbrales de calor
});

test('FHIR: una lectura de 10 s se convierte en una Observation de constantes vitales', function () {
    const o = fhir.observacion({ ts: new Date(AHORA), fcMedia: 172, temp: 38.4 }, 'p8', '8867-4');
    assert.equal(o.resourceType, 'Observation');
    assert.equal(o.id, 'p8-8867-4-' + AHORA);
    assert.equal(o.status, 'final');
    assert.equal(o.category[0].coding[0].code, 'vital-signs');
    assert.deepEqual(o.code.coding[0], { system: 'http://loinc.org', code: '8867-4', display: 'Heart rate' });
    assert.equal(o.subject.reference, 'Patient/p8');
    assert.deepEqual(o.valueQuantity, { value: 172, unit: '/min', system: 'http://unitsofmeasure.org', code: '/min' });

    const t = fhir.observacion({ ts: new Date(AHORA), fcMedia: 172, temp: 38.4 }, 'p8', '8310-5');
    assert.equal(t.valueQuantity.value, 38.4);
    assert.equal(t.valueQuantity.code, 'Cel');
});

test('FHIR: lectura de parámetros e ids', function () {
    assert.equal(fhir.leerPaciente('p8'), 'p8');
    assert.equal(fhir.leerPaciente('Patient/p11'), 'p11');
    assert.equal(fhir.leerPaciente('Pepe'), null);
    assert.deepEqual(fhir.leerCodigos(undefined), ['8867-4', '8310-5']);
    assert.deepEqual(fhir.leerCodigos('http://loinc.org|8310-5'), ['8310-5']);
    assert.equal(fhir.leerCodigos('1234-5'), null);
    const id = fhir.leerId('p8-8867-4-' + AHORA);
    assert.deepEqual([id.jugadorId, id.codigo, id.ts.getTime()], ['p8', '8867-4', AHORA]);
    assert.equal(fhir.leerId('p8-9999-9-1'), null);
});
