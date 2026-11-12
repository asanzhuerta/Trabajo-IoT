// Sesiones de entrenamiento o partido.
//   - Solo puede haber una abierta a la vez. Mientras lo está, los resúmenes de 10 s (lecturas) y los
//     eventos se guardan con su sesionId, y los acumulados en memoria (SOBRECARGA, PAUTA_EXCEDIDA) cuentan
//     desde su inicio.
//   - Al cerrarla, el resumen de cada jugador se calcula en Mongo a partir de las lecturas de la sesión.
//     Así no se pierde nada aunque la API se reinicie a mitad: al reconectar con Mongo se recupera la sesión abierta.

const mongoose = require('mongoose');
const { Sesion, Lectura } = require('../models');
const estado = require('./estado');
const websocket = require('../servers/websocket');
const { ErrorHttp } = require('./errores');

const MAX_SESIONES = 100;

function r1(n) {
    return Math.round(n * 10) / 10;
}

// Guarda las ventanas de 10 s que estén a medias, para que queden enteras dentro o fuera de la sesión
async function guardarVentanasAbiertas() {
    const resumenes = estado.cerrarTodas();
    if (resumenes.length) await Lectura.insertMany(resumenes);
}

async function buscar(id) {
    if (!mongoose.isValidObjectId(id)) throw new ErrorHttp(404, 'No existe la sesión ' + id);
    const sesion = await Sesion.findById(id);
    if (!sesion) throw new ErrorHttp(404, 'No existe la sesión ' + id);
    return sesion;
}

// Resumen de cada jugador en una sesión, calculado con los resúmenes de 10 s que tienen su sesionId
async function resumenDe(id) {
    const filas = await Lectura.aggregate([
        { $match: { sesionId: new mongoose.Types.ObjectId(String(id)) } },
        {
            $group: {
                _id: '$jugadorId',
                muestras: { $sum: '$muestras' },
                distancia: { $sum: '$distancia' },
                distAltaInt: { $sum: '$distAltaInt' },
                sprints: { $sum: '$sprints' },
                acelAltas: { $sum: '$acelAltas' },
                decelAltas: { $sum: '$decelAltas' },
                velMax: { $max: '$velMax' },
                sumaFc: { $sum: { $multiply: ['$fcMedia', '$muestras'] } },   // para la media ponderada
                fcMax: { $max: '$fcMax' }
            }
        }
    ]);
    return filas
        .map(function (f) {
            return {
                jugadorId: f._id,
                minutos: r1(f.muestras / 60),   // una lectura por segundo
                distancia: Math.round(f.distancia),
                distAltaInt: Math.round(f.distAltaInt),
                sprints: f.sprints,
                acelAltas: f.acelAltas,
                decelAltas: f.decelAltas,
                velMax: f.velMax,
                fcMedia: f.muestras ? Math.round(f.sumaFc / f.muestras) : null,
                fcMax: f.fcMax
            };
        })
        .sort(function (a, b) { return a.jugadorId.localeCompare(b.jugadorId, 'es', { numeric: true }); });
}

async function iniciar(datos) {
    const abierta = await Sesion.findOne({ fin: null });
    if (abierta) {
        throw new ErrorHttp(409, 'Ya hay una sesión abierta (' + abierta.id + ', "' + abierta.nombre + '"). Ciérrala antes de empezar otra');
    }
    const sesion = new Sesion({ tipo: datos.tipo, nombre: datos.nombre });
    await sesion.validate();

    await guardarVentanasAbiertas();   // lo anterior al inicio queda fuera de la sesión
    await sesion.save();
    estado.iniciarSesion(sesion.id);

    websocket.sendMessage({ tipo: 'sesion_iniciada', sesion: sesion.toJSON() });
    return sesion;
}

async function finalizar(id) {
    const sesion = await buscar(id);
    if (sesion.fin) throw new ErrorHttp(409, 'La sesión ya está cerrada');

    if (estado.sesionActual() === sesion.id) {
        await guardarVentanasAbiertas();   // los últimos segundos todavía cuentan para la sesión
        estado.iniciarSesion(null);
    }

    const cerrada = await Sesion.findOneAndUpdate(
        { _id: sesion._id, fin: null },
        { fin: new Date(), resumen: await resumenDe(sesion._id) },
        { returnDocument: 'after', runValidators: true }
    );
    if (!cerrada) throw new ErrorHttp(409, 'La sesión ya está cerrada');

    websocket.sendMessage({ tipo: 'sesion_cerrada', sesion: cerrada.toJSON() });
    return cerrada;
}

// Una sesión. Si sigue abierta, el resumen se calcula al momento con lo guardado hasta ahora
async function obtener(id) {
    const sesion = await buscar(id);
    const json = sesion.toJSON();
    if (!sesion.fin) json.resumen = await resumenDe(sesion._id);
    return json;
}

// filtro.estado: 'abierta' | 'cerrada' | undefined
async function listar(filtro) {
    const consulta = {};
    if (filtro.estado === 'abierta') consulta.fin = null;
    if (filtro.estado === 'cerrada') consulta.fin = { $ne: null };
    return Sesion.find(consulta).sort({ inicio: -1 }).limit(MAX_SESIONES);
}

// Al conectar con Mongo (también al arrancar la API), se sigue con la sesión que hubiera abierta
async function restaurar() {
    const abierta = await Sesion.findOne({ fin: null }).sort({ inicio: -1 });
    const id = abierta ? abierta.id : null;
    if (estado.sesionActual() !== id) {
        estado.iniciarSesion(id);
        if (abierta) console.info('Sesión abierta recuperada: %s ("%s")', abierta.id, abierta.nombre);
    }
}

mongoose.connection.on('connected', function () {
    restaurar().catch(function (err) { console.warn('No se pudo recuperar la sesión abierta: %s', err.message); });
});

module.exports = { iniciar, finalizar, obtener, listar };
