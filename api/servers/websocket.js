// Servidor WebSocket (adaptado de servers/websocket.js de clase).
// Comparte puerto con Express y solo envía mensajes JSON del servidor a los clientes:
// { tipo: 'bienvenida' | 'telemetria' | 'alerta' | 'alerta_confirmada', ... }

const { WebSocketServer, WebSocket } = require('ws');

let wss = null;

exports.listen = function (server) {
    wss = new WebSocketServer({ server: server });
    console.info('Servidor WebSocket listo en el mismo puerto que la API');

    wss.on('connection', function (ws, req) {
        console.log('Conexión WS desde %s', req.socket.remoteAddress);
        ws.send(JSON.stringify({ tipo: 'bienvenida', ts: new Date().toISOString() }));
    });
};

// Envía un objeto a todos los clientes conectados
exports.sendMessage = function (mensaje) {
    if (!wss) return;
    const datos = typeof mensaje === 'string' ? mensaje : JSON.stringify(mensaje);
    wss.clients.forEach(function (client) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(datos);
        }
    });
};
