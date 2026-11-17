const test = require('node:test');
const assert = require('node:assert/strict');
const { tipoPara, pasos, TIPOS, PASOS } = require('../services/intervenciones');

test('intervención: enfriar para el calor, reposo para la FC y nada para el resto', () => {
    assert.equal(tipoPara('CALOR_AMBAR'), 'enfriar');
    assert.equal(tipoPara('CALOR_ROJA'), 'enfriar');
    for (const c of ['FC_ALTA', 'FC_DESACOPLE', 'RECUPERACION_LENTA', 'INCIDENTE']) assert.equal(tipoPara(c), 'reposo');
    for (const c of ['SOBRECARGA', 'ASIMETRIA', 'PAUTA_EXCEDIDA', 'SIN_SENAL']) assert.equal(tipoPara(c), null);
});

test('intervención: la bajada va paso a paso hasta el objetivo, dentro de los rangos del simulador', () => {
    const temp = pasos(40.5, TIPOS.enfriar.objetivo, PASOS, 1);
    assert.equal(temp.length, PASOS);
    assert.equal(temp[temp.length - 1], 37.5);
    assert.ok(temp.every((v, i) => i === 0 || v < temp[i - 1]), 'baja en cada paso');
    assert.ok(temp.every(v => v >= 35 && v <= 42));
    const fc = pasos(185, TIPOS.reposo.objetivo, PASOS, 0);
    assert.equal(fc[fc.length - 1], 85);
    assert.ok(fc.every(Number.isInteger));
    // Un INCIDENTE con la FC muy baja también vuelve a la normalidad (sube)
    assert.deepEqual(pasos(45, 85, 4, 0), [55, 65, 75, 85]);
});
