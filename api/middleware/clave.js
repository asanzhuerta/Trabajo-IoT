// Autenticación por API key (cabecera x-api-key).
//   - clave de la pasarela: telemetría y clima (Node-RED)
//   - clave del médico: todo lo que escribe datos clínicos
// Las claves se comparan en tiempo constante para no dar pistas por el tiempo de respuesta.

const crypto = require('crypto');
const config = require('../config');

function huella(texto) {
    return crypto.createHash('sha256').update(String(texto)).digest();
}

function coincide(recibida, esperada) {
    if (!recibida || !esperada) return false;
    return crypto.timingSafeEqual(huella(recibida), huella(esperada));
}

function rolDeClave(clave) {
    if (coincide(clave, config.apiKeys.pasarela)) return 'pasarela';
    if (coincide(clave, config.apiKeys.medico)) return 'medico';
    return null;
}

// Uso: router.post('/', requiereClave('medico'), manejador)
function requiereClave(...roles) {
    return function (req, res, next) {
        const clave = req.get('x-api-key');
        if (!clave) {
            return res.status(401).json({ error: 'Falta la cabecera x-api-key' });
        }
        const rol = rolDeClave(clave);
        if (!rol) {
            return res.status(401).json({ error: 'Clave no válida' });
        }
        if (!roles.includes(rol)) {
            return res.status(403).json({ error: 'Esta operación necesita la clave de: ' + roles.join(' o ') });
        }
        req.rol = rol;
        next();
    };
}

module.exports = { requiereClave };
