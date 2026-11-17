// El script que da al dashboard médico la clave y el nombre ya puestos.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { scriptConfig } = require('../servers/medico-config');

function ejecutar(codigo) {
    const ventana = {};
    vm.runInNewContext(codigo, { window: ventana });
    // Viene de otro contexto de vm (otro Object.prototype): se copia para compararlo
    return JSON.parse(JSON.stringify(ventana.SMART_HEALTH_MEDICO));
}

test('lleva la clave del médico y su nombre, nunca la de la pasarela', function () {
    const codigo = scriptConfig({ pasarela: 'clave-pasarela', medico: 'clave-medico' }, 'Dra. Pérez');
    assert.deepEqual(ejecutar(codigo), { clave: 'clave-medico', nombre: 'Dra. Pérez' });
    assert.ok(!codigo.includes('clave-pasarela'));
});

test('sin API_KEY_MEDICO la clave va vacía y el dashboard queda en solo lectura', function () {
    assert.deepEqual(ejecutar(scriptConfig({}, 'Médico del equipo')), { clave: '', nombre: 'Médico del equipo' });
});

test('escapa comillas para que el nombre no rompa el script', function () {
    const datos = ejecutar(scriptConfig({ medico: 'k' }, 'Dr. "House"'));
    assert.equal(datos.nombre, 'Dr. "House"');
});
