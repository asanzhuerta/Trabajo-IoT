// GET /medico-config.js: el dashboard médico (public/medico.html) lo carga antes que medico.js.
// Le da la clave y el nombre del médico ya puestos, para que el médico no tenga que escribirlos
// y la demostración vaya seguida. Salen del .env (API_KEY_MEDICO y MEDICO_NOMBRE).
// Consecuencia: quien pueda abrir /medico.html actúa como médico (ver la sección de seguridad del README).

const config = require('../config');

function scriptConfig(apiKeys, nombre) {
    const datos = { clave: apiKeys.medico || '', nombre: nombre };
    return 'window.SMART_HEALTH_MEDICO = ' + JSON.stringify(datos) + ';\n';
}

function medicoConfig(req, res) {
    res.set('Cache-Control', 'no-store');
    res.type('application/javascript').send(scriptConfig(config.apiKeys, config.medicoNombre));
}

module.exports = { medicoConfig, scriptConfig };
