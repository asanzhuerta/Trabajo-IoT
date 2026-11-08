// Configuración centralizada. Los valores vienen de ../.env (ver .env.example)
// o de las variables de entorno del contenedor. Si no hay nada, se usan los de desarrollo.

module.exports = {
    equipo: process.env.EQUIPO || 'eq1',
    port: Number(process.env.PORT) || 3000,
    mongoUrl: process.env.MONGO_URL || 'mongodb://localhost:27017/smarthealth',
    mqtt: {
        url: process.env.MQTT_URL || 'mqtt://localhost:1883',
        user: process.env.MQTT_USER,
        pass: process.env.MQTT_PASS
    },
    apiKeys: {
        pasarela: process.env.API_KEY_PASARELA,
        medico: process.env.API_KEY_MEDICO
    }
};
