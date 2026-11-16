const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { WebSocket } = require('ws');
const config = require('../config');
const tactica = require('../services/tactica');
const app = require('../servers/http-server');
const websocket = require('../servers/websocket');

const datos = () => ({ timestamp: new Date().toISOString(), segundo: 12, fase: 'ataque_organizado',
    descripcionFase: 'Ataque organizado', posesion: 'propia', evento: 'Pase a P8',
    balon: { X: 52, Y: 34, poseedor: 'p6', paseHacia: null }, objetivos: { p1: { X: 4, Y: 34 } } });

test('táctica: valida coordenadas, identificadores y campos antes de guardar', () => {
    assert.equal(tactica.validar(datos()).balon.X, 52);
    const medida = datos(); medida.balon.X = { unit: 'm', value: 50 };
    assert.equal(tactica.validar(medida).balon.X, 50);
    for (const invalido of [null, { ...datos(), fase: 'toString' }, { ...datos(), timestamp: 'mal' },
        { ...datos(), balon: { X: 106, Y: 20 } }, { ...datos(), balon: { X: 2, Y: '30' } },
        { ...datos(), objetivos: { p99: { X: 3, Y: 5 } } }]) {
        assert.throws(() => tactica.validar(invalido), err => err.status === 400);
    }
});

test('pasarela → Express → WebSocket, reconexión y lectura sin MongoDB', async t => {
    const anteriores = { ...config.apiKeys };
    config.apiKeys.pasarela = 'pasarela-prueba'; config.apiKeys.medico = 'medico-prueba';
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening'); websocket.listen(server);
    const base = 'http://127.0.0.1:' + server.address().port;
    const sockets = [];
    t.after(async () => {
        sockets.forEach(ws => ws.terminate());
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
        Object.assign(config.apiKeys, anteriores);
    });
    const enviar = (body, key) => fetch(base + '/api/equipo/estado', { method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(key ? { 'x-api-key': key } : {}) }, body: JSON.stringify(body) });
    const conectar = async () => {
        const ws = new WebSocket(base.replace('http', 'ws')); sockets.push(ws);
        const mensajes = []; ws.on('message', raw => mensajes.push(JSON.parse(raw)));
        await once(ws, 'open'); return { ws, mensajes };
    };
    const esperar = async (lista, tipo) => {
        for (let i = 0; i < 100; i++) {
            const m = lista.find(m => m.tipo === tipo); if (m) return m;
            await new Promise(r => setTimeout(r, 10));
        }
        assert.fail('No llegó el mensaje ' + tipo);
    };
    assert.equal(await (await fetch(base + '/api/equipo/estado')).json(), null);
    assert.equal((await enviar(datos())).status, 401);
    assert.equal((await enviar(datos(), 'medico-prueba')).status, 403);
    assert.equal((await enviar({ ...datos(), balon: null }, 'pasarela-prueba')).status, 400);
    const primero = await conectar();
    const estado = datos();
    assert.equal((await enviar(estado, 'pasarela-prueba')).status, 202);
    assert.equal((await esperar(primero.mensajes, 'tactica')).equipo.balon.poseedor, 'p6');
    assert.equal((await (await fetch(base + '/api/equipo/estado')).json()).segundo, 12);
    const segundo = await conectar();
    assert.equal((await esperar(segundo.mensajes, 'tactica')).equipo.segundo, 12);
    assert.ok(Array.isArray((await esperar(segundo.mensajes, 'telemetria')).jugadores));
    assert.equal((await enviar({ ...estado, timestamp: '2000-01-01T00:00:00Z' }, 'pasarela-prueba')).status, 409);
    const pagina = await (await fetch(base)).text();
    assert.match(pagina, /id="ballMarker"/);
    assert.match(pagina, /m.tipo === 'tactica'/);
});
