// Carga en MongoDB los 11 jugadores, la pauta de readaptación de p5 y 4 semanas de sesiones para el ACWR.
//
//   npm run seed               -> reemplaza jugadores, pautas y las sesiones simuladas
//   npm run seed -- --limpiar  -> además borra lecturas, eventos, alertas y todas las sesiones
//
// La API puede estar arrancada: recarga los perfiles sola en menos de 30 s.

const { parseArgs } = require('node:util');
const mongoose = require('mongoose');
const config = require('../config');
const { Jugador, Pauta, Lectura, Evento, Alerta, Sesion } = require('../models');
const plantilla = require('./plantilla');
const historial = require('./historial');

const { values: opciones } = parseArgs({
    options: { limpiar: { type: 'boolean', default: false } }
});

const DIA_MS = 24 * 60 * 60 * 1000;

async function main() {
    await mongoose.connect(config.mongoUrl, { serverSelectionTimeoutMS: 5000 });
    console.log('Conectado a %s', config.mongoUrl);

    // Crea las colecciones (y la time-series de lecturas) si todavía no existen
    await Promise.all([Jugador, Pauta, Lectura, Evento, Alerta, Sesion].map(function (m) { return m.init(); }));

    await Jugador.deleteMany({});
    await Jugador.insertMany(plantilla.map(function (j) {
        return {
            _id: j.id,
            dorsal: j.dorsal,
            posicion: j.posicion,
            fcMax: j.fcMax,
            tempBasal: j.tempBasal,
            asimetriaBase: j.asimetriaBase,
            enReadaptacion: Boolean(j.enReadaptacion)
        };
    }));
    console.log('Jugadores: %d', plantilla.length);

    await Pauta.deleteMany({});
    for (const p of plantilla.PAUTAS) {
        await Pauta.create({
            jugadorId: p.jugadorId,
            velMax: p.velMax,
            cargaMax: p.cargaMax,
            asimetriaMax: p.asimetriaMax,
            hasta: new Date(Date.now() + p.diasVigencia * DIA_MS),
            notas: p.notas
        });
    }
    console.log('Pautas: %d (%s)', plantilla.PAUTAS.length, plantilla.PAUTAS.map(function (p) { return p.jugadorId; }).join(', '));

    if (opciones.limpiar) {
        const [l, e, a, s] = await Promise.all([
            Lectura.deleteMany({}), Evento.deleteMany({}), Alerta.deleteMany({}), Sesion.deleteMany({})
        ]);
        console.log('Borrado: %d lecturas, %d eventos, %d alertas, %d sesiones',
            l.deletedCount, e.deletedCount, a.deletedCount, s.deletedCount);
    }

    // Histórico para el ACWR: se rehace cada vez (relativo a hoy) sin tocar las sesiones reales
    await Sesion.deleteMany({ simulada: true });
    const sesiones = await Sesion.insertMany(historial.generar(Date.now()));
    console.log('Histórico para el ACWR: %d sesiones de las últimas 4 semanas', sesiones.length);
}

main()
    .catch(function (err) {
        console.error('Error en el seed: %s', err.message);
        process.exitCode = 1;
    })
    .finally(function () {
        return mongoose.disconnect();
    });
