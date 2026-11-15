// Publicador MQTT (adaptado de mqtt/publisher.js de clase).
// La API solo publica, con QoS 1 y sin retain:
//   - las alertas, en sensors/<equipo>/alertas (las recibe el dashboard médico);
//   - las órdenes al simulador, en control/fase, control/reset y control/jugadores/<id>/sensores (ver services/simulador.js).
// Se conecta al Mosquitto nativo con el usuario "api", que en la ACL solo puede escribir en esos topics.
// Si el broker se cae, mqtt.js reconecta solo y guarda en cola los mensajes QoS 1 mientras tanto.

const mqtt = require('mqtt');
const config = require('../config');

const TOPIC_ALERTAS = 'sensors/' + config.equipo + '/alertas';

let client = null;

function conectar() {
    client = mqtt.connect(config.mqtt.url, {
        clientId: 'api-smarthealth-' + process.pid,
        username: config.mqtt.user,
        password: config.mqtt.pass,
        reconnectPeriod: 5000,
        connectTimeout: 5000
    });

    client.on('connect', function () {
        console.info('MQTT conectado a %s (publica en %s y control/#)', config.mqtt.url, TOPIC_ALERTAS);
    });
    client.on('reconnect', function () {
        console.warn('MQTT: reconectando con %s…', config.mqtt.url);
    });
    client.on('error', function (err) {
        console.warn('MQTT: %s', err.message);
    });
}

function publicarAlerta(alerta) {
    if (!client) return;
    client.publish(TOPIC_ALERTAS, JSON.stringify(alerta), { qos: 1, retain: false }, function (err) {
        if (err) console.warn('MQTT: no se pudo publicar la alerta %s: %s', alerta.codigo, err.message);
    });
}

// Publica y espera la confirmación del broker (PUBACK, QoS 1). Falla si no hay conexión.
function publicar(topic, mensaje) {
    return new Promise(function (resolve, reject) {
        if (!client || !client.connected) return reject(new Error('Sin conexión con Mosquitto'));
        const datos = typeof mensaje === 'string' ? mensaje : JSON.stringify(mensaje);
        client.publish(topic, datos, { qos: 1, retain: false }, function (err) {
            if (err) reject(err); else resolve();
        });
    });
}

function estado() {
    if (!client) return 'disconnected';
    return client.connected ? 'connected' : 'connecting';
}

module.exports = { conectar, publicarAlerta, publicar, estado };
