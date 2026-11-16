// Última situación táctica recibida de equipo/estado a través de la pasarela.
// Es estado en vivo: no depende de MongoDB ni reemplaza al GPS de los jugadores.
const { ErrorHttp } = require('./errores');
const FASES = ['ataque_organizado', 'transicion_defensiva', 'presion_alta', 'defensa_organizada', 'transicion_ofensiva'];
let ultima = null;
const idValido = id => typeof id === 'string' && /^p(?:[1-9]|10|11)$/.test(id);
function exigir(ok, campo) {
    if (!ok) throw new ErrorHttp(400, 'Estado táctico no válido: ' + campo);
}
function posicion(p, campo) {
    exigir(p && typeof p === 'object', campo);
    const medida = (v, max) => {
        const n = typeof v === 'object' && v ? v.value : v;
        exigir(typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max, campo);
        return n;
    };
    return { X: medida(p.X, 105), Y: medida(p.Y, 68) };
}
function validar(datos) {
    exigir(datos && typeof datos === 'object', 'cuerpo');
    exigir(FASES.includes(datos.fase), 'fase');
    exigir(['propia', 'rival'].includes(datos.posesion), 'posesion');
    exigir(typeof datos.timestamp === 'string' && Number.isFinite(Date.parse(datos.timestamp)), 'timestamp');
    exigir(Number.isInteger(datos.segundo) && datos.segundo >= 0, 'segundo');
    const balon = posicion(datos.balon, 'balon');
    for (const campo of ['poseedor', 'paseHacia']) {
        exigir(datos.balon[campo] == null || idValido(datos.balon[campo]), 'balon.' + campo);
        balon[campo] = datos.balon[campo] ?? null;
    }
    const resultado = { timestamp: new Date(datos.timestamp).toISOString(), segundo: datos.segundo,
        fase: datos.fase, posesion: datos.posesion, balon, objetivos: {} };
    for (const campo of ['descripcionFase', 'evento', 'formacion']) {
        if (datos[campo] === undefined) continue;
        exigir(typeof datos[campo] === 'string' && datos[campo].length <= 300, campo);
        resultado[campo] = datos[campo];
    }
    if (datos.objetivos !== undefined) {
        exigir(datos.objetivos && typeof datos.objetivos === 'object' && !Array.isArray(datos.objetivos), 'objetivos');
        for (const [id, p] of Object.entries(datos.objetivos)) {
            exigir(idValido(id), 'objetivos.jugadorId');
            resultado.objetivos[id] = posicion(p, 'objetivos.' + id);
        }
    }
    return resultado;
}
function actualizar(datos) {
    const estado = validar(datos);
    if (ultima && Date.parse(estado.timestamp) < Date.parse(ultima.timestamp)) {
        throw new ErrorHttp(409, 'Estado táctico anterior al último recibido');
    }
    ultima = estado;
    return ultima;
}
module.exports = { validar, actualizar, obtener: () => ultima };
