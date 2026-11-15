'use strict';

// Puente MQTT -> WebSocket, sin dependencias NPM.
// MQTT 3.1.1 sobre TCP (Mosquitto:1883) y WebSocket local (navegador).
// Acepta publicaciones QoS 0 y QoS 1.
const net = require('node:net');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MQTT_HOST = process.env.MQTT_HOST || '127.0.0.1';
const MQTT_PORT = Number(process.env.MQTT_PORT || 1883);
const HTTP_PORT = Number(process.env.HTTP_PORT || 3000);
const HTTP_HOST = process.env.HTTP_HOST || '127.0.0.1';
const MQTT_USER = process.env.MQTT_USER || '';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || '';
const SAFE_TOPIC = /^p(?:[1-9]|10|11)\/sensors\/(gps|accelerometer|giroscope|pulsemeter|pressuresensor|thermometer)$|^equipo\/estado$/;
const TOPICS = [...Array.from({length: 11}, (_, i) => `p${i + 1}/sensors/#`), 'equipo/estado'];

const latest = new Map();
let mqttConnected = false;
let mqttError = null;
let mqttSocket = null;
let mqttBuffer = Buffer.alloc(0);
let mqttPingTimer = null;
let mqttReconnectTimer = null;
let mqttConnectTimer = null;
const viewers = new Set();

// ----------------------- MQTT 3.1.1 -----------------------
function mqttString(str) {
  const b = Buffer.from(str, 'utf8');
  if (b.length > 65535) throw new Error('Texto MQTT demasiado largo');
  return Buffer.concat([Buffer.from([b.length >> 8, b.length & 255]), b]);
}
function remainingLength(n) {
  const out = [];
  do { let d = n % 128; n = Math.floor(n / 128); if(n > 0) d |= 128; out.push(d); } while(n > 0);
  return Buffer.from(out);
}
function mqttPacket(header, body) {
  return Buffer.concat([Buffer.from([header]), remainingLength(body.length), body]);
}
function createConnect() {
  const id = `campograma_${process.pid}_${Math.random().toString(16).slice(2, 8)}`;
  let flags = 0x02; // clean session
  if (MQTT_USER) flags |= 0x80;
  if (MQTT_PASSWORD) flags |= 0x40;
  const header = Buffer.concat([mqttString('MQTT'), Buffer.from([4, flags, 0, 30])]);
  const fields = [mqttString(id)];
  if (MQTT_USER) fields.push(mqttString(MQTT_USER));
  if (MQTT_PASSWORD) fields.push(mqttString(MQTT_PASSWORD));
  return mqttPacket(0x10, Buffer.concat([header, ...fields]));
}
function createSubscribe() {
  const entries = TOPICS.map(t => Buffer.concat([mqttString(t), Buffer.from([0])]));
  return mqttPacket(0x82, Buffer.concat([Buffer.from([0, 1]), ...entries]));
}
function publishStatus() {
  sendToAll({type:'mqtt_status', connected:mqttConnected, host:MQTT_HOST, port:MQTT_PORT, error:mqttError});
}
function updateStatus(connected, error=null) {
  if (mqttConnected === connected && mqttError === error) return;
  mqttConnected = connected;
  mqttError = error;
  publishStatus();
}
function mqttDispatch(header, data) {
  const kind = header >>> 4;
  if(kind === 2) { // CONNACK
    if(data.length < 2 || data[1] !== 0) {
      const code = data.length > 1 ? data[1] : '?';
      updateStatus(false, `Conexión MQTT rechazada (código ${code})`);
      mqttSocket.destroy();
      return;
    }
    updateStatus(true);
    console.log(`MQTT conectado: ${MQTT_HOST}:${MQTT_PORT}`);
    mqttSocket.write(createSubscribe());
    mqttPingTimer = setInterval(() => {
      if(mqttConnected && mqttSocket && !mqttSocket.destroyed) mqttSocket.write(Buffer.from([0xC0, 0]));
    }, 20000);
  } else if(kind === 3) { // PUBLISH
    if(data.length < 2) return;
    const topicLength = data.readUInt16BE(0);
    if(data.length < 2 + topicLength) return;
    const topic = data.subarray(2,2+topicLength).toString('utf8');
    const qos = (header >> 1) & 3;
    let off = 2+topicLength;
    let messageId = 0;
    if(qos > 0) { if(data.length < off+2) return; messageId=data.readUInt16BE(off); off+=2; }
    if(qos === 1 && mqttSocket && !mqttSocket.destroyed) {
      mqttSocket.write(Buffer.from([0x40,0x02,messageId>>8,messageId&255]));
    }
    if(!SAFE_TOPIC.test(topic)) return;
    let payload;
    try {payload=JSON.parse(data.subarray(off).toString('utf8'));} catch {return;}
    if(!payload || typeof payload !== 'object') return;
    const at=Date.now();
    latest.set(topic,{payload,at});
    sendToAll({type:'reading',topic,payload,at});
  } else if(kind === 9) { // SUBACK
    if(data.length>2 && [...data.subarray(2)].some(x=>x===0x80)) {
      console.warn('Una suscripción MQTT fue rechazada (ACL del broker).');
    }
  }
}
function parseMQTT(data) {
  mqttBuffer=Buffer.concat([mqttBuffer,data]);
  if(mqttBuffer.length>8*1024*1024){mqttSocket.destroy();return;}
  while(mqttBuffer.length>=2) {
    let mult=1,rest=0,j=1,digit;
    do {
      if(j>=mqttBuffer.length)return;
      digit=mqttBuffer[j]; rest+=(digit&127)*mult;mult*=128;j++;
      if(j>5){mqttSocket.destroy();return;}
    } while(digit&128);
    if(rest>1024*1024){mqttSocket.destroy();return;}
    if(mqttBuffer.length<j+rest)return;
    const header=mqttBuffer[0];
    const packet=mqttBuffer.subarray(j,j+rest);
    mqttBuffer=mqttBuffer.subarray(j+rest);
    mqttDispatch(header,packet);
  }
}
function connectMQTT() {
  clearTimeout(mqttReconnectTimer);
  clearTimeout(mqttConnectTimer);
  clearInterval(mqttPingTimer);
  mqttBuffer=Buffer.alloc(0);
  const sock=net.createConnection({host:MQTT_HOST,port:MQTT_PORT});
  mqttSocket=sock;
  mqttConnectTimer=setTimeout(()=>{if(!mqttConnected)sock.destroy(new Error('Tiempo de conexión agotado'));},8000);
  sock.on('connect',()=>sock.write(createConnect()));
  sock.on('data',parseMQTT);
  sock.on('error',err=>{
    updateStatus(false,err.message);
    console.error('MQTT:',err.message);
  });
  sock.on('close',()=>{
    clearTimeout(mqttConnectTimer);clearInterval(mqttPingTimer);
    if(mqttSocket===sock){
      updateStatus(false,mqttError || 'Broker sin conexión');
      mqttReconnectTimer=setTimeout(connectMQTT,2000);
    }
  });
}

// ----------------------- HTTP + WebSocket local -----------------------
const server=http.createServer((req,res)=>{
  if(req.url==='/' || req.url==='/index.html') {
    fs.readFile(path.join(__dirname,'index.html'),(err,body)=>{
      if(err){res.writeHead(500);res.end('No se ha podido leer index.html');return;}
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
      res.end(body);
    });
    return;
  }
  if(req.url==='/health') {
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
    res.end(JSON.stringify({ok:true,mqttConnected,cachedMessages:latest.size,viewers:viewers.size}));
    return;
  }
  res.writeHead(404);res.end('Not found');
});
function websocketFrame(obj) {
  const b=Buffer.from(JSON.stringify(obj),'utf8');
  let h;
  if(b.length<126) h=Buffer.from([0x81,b.length]);
  else if(b.length<=65535)h=Buffer.from([0x81,126,(b.length>>8)&255,b.length&255]);
  else {h=Buffer.alloc(10);h[0]=0x81;h[1]=127;h.writeBigUInt64BE(BigInt(b.length),2);}
  return Buffer.concat([h,b]);
}
function send(socket,obj) {
  if(socket.destroyed||!socket.writable||socket.writableLength>1024*1024)return;
  socket.write(websocketFrame(obj));
}
function sendToAll(obj){
  const frame=websocketFrame(obj);
  for(const sock of viewers) if(!sock.destroyed&&sock.writable&&sock.writableLength<1024*1024)sock.write(frame);
}
server.on('upgrade',(req,sock)=>{
  const key=req.headers['sec-websocket-key'];
  if(req.url!=='/stream'||!key||req.headers['upgrade']?.toLowerCase()!=='websocket'){
    sock.write('HTTP/1.1 400 Bad Request\r\n\r\n');sock.destroy();return;
  }
  const accept=crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
  viewers.add(sock);
  sock.on('error',()=>viewers.delete(sock));
  sock.on('end',()=>viewers.delete(sock));
  sock.on('close',()=>viewers.delete(sock));
  // El navegador no envía mensajes: solo solicita una conexión de lectura.
  sock.on('data',data=>{
    if(data.length>=2&&(data[0]&0x0f)===0x8){sock.end(Buffer.from([0x88,0x00]));}
    else if(data.length>=2&&(data[0]&0x0f)===0x9){sock.write(Buffer.from([0x8A,0x00]));}
  });
  send(sock,{type:'mqtt_status',connected:mqttConnected,host:MQTT_HOST,port:MQTT_PORT,error:mqttError});
  for(const [topic,entry] of latest)send(sock,{type:'reading',topic,...entry,historical:true});
});
server.on('error',err=>{console.error('HTTP:',err.message);process.exitCode=1;});
server.listen(HTTP_PORT,HTTP_HOST,()=>{
  console.log(`\nCampograma: http://${HTTP_HOST}:${HTTP_PORT}`);
  console.log(`Mosquitto: MQTT TCP ${MQTT_HOST}:${MQTT_PORT}`);
  console.log('Sin librerías externas ni npm install. Ctrl+C para detener.\n');
});
connectMQTT();
process.on('SIGINT',()=>{
  clearInterval(mqttPingTimer);clearTimeout(mqttReconnectTimer);clearTimeout(mqttConnectTimer);
  if(mqttSocket)mqttSocket.destroy();
  for(const viewer of viewers)viewer.destroy();
  server.close(()=>process.exit(0));
});
