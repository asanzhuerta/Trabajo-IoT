// Punto de entrada de la API (mismo patrón que wot-server.js de clase):
// arranca el servidor HTTP de Express y le ata el servidor WebSocket.

const config = require('./config');
const httpServer = require('./servers/http-server');
const webSocketServer = require('./servers/websocket');
const db = require('./db');
const publisher = require('./mqtt/publisher');

if (!config.apiKeys.pasarela || !config.apiKeys.medico) {
    console.warn('Faltan API_KEY_PASARELA o API_KEY_MEDICO en .env: las escrituras responderán 401');
}

db.connect();
publisher.conectar();

const server = httpServer.listen(config.port, function () {
    console.info('API Smart Health escuchando en http://localhost:%s', config.port);
    webSocketServer.listen(server);
});
