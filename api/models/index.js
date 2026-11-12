// Todos los modelos de Mongoose en un único require.

module.exports = {
    Jugador: require('./Jugador'),
    Lectura: require('./Lectura'),
    Evento: require('./Evento'),
    Alerta: require('./Alerta'),
    Pauta: require('./Pauta'),
    Sesion: require('./Sesion'),
    Clima: require('./Clima')
};
