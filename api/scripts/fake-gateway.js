// Imita la pasarela de Node-RED (Persona A) para poder probar la API sin depender de ella:
// cada segundo simula a los 11 jugadores y manda un lote a POST /api/telemetria,
// con el mismo formato que fija docs/contratos/api.md: los sensores de cada jugador
// tal y como los publica el simulador de A por MQTT (p1/sensors/gps, { unit, value }…).
//
//   npm run fake-gateway
//   npm run fake-gateway -- --calor p8 --asimetria p5 --incidente p3 --sin-senal p10
//   npm run fake-gateway -- --fc-alta p7 --desacople p6 --recuperacion p9 --duracion 120
//
// Escenarios (se pueden repetir y combinar):
//   --calor p8       temperatura interna desde 38,8 °C y subiendo hasta 40,6 °C
//   --fc-alta p7     FC sostenida en torno al 95 % de la FCmáx
//   --desacople p6   FC al 89 % de la FCmáx mientras camina
//   --recuperacion p9  sprint de 10 s y después camina, pero la FC apenas baja (alerta 60 s después)
//   --sobrecarga p4  arranca y frena sin parar: unas 20 acciones de alta intensidad por minuto
//   --asimetria p5   el reparto de carga entre pies se va desequilibrando
//   --incidente p3   a los 15 s: impacto de 6,5 g, se queda inmóvil y la FC cae
//   --sin-senal p10   a los 10 s deja de llegar señal (como el watchdog de la pasarela)
//
// La clave de la pasarela se lee de API_KEY_PASARELA en ../.env.

require('../env');
const { parseArgs } = require('node:util');
const plantilla = require('./plantilla');

const { values: op } = parseArgs({
    options: {
        url: { type: 'string', default: process.env.API_URL || 'http://localhost:' + (process.env.PORT || 3000) },
        duracion: { type: 'string' },
        calor: { type: 'string', multiple: true, default: [] },
        'fc-alta': { type: 'string', multiple: true, default: [] },
        desacople: { type: 'string', multiple: true, default: [] },
        recuperacion: { type: 'string', multiple: true, default: [] },
        sobrecarga: { type: 'string', multiple: true, default: [] },
        asimetria: { type: 'string', multiple: true, default: [] },
        incidente: { type: 'string', multiple: true, default: [] },
        'sin-senal': { type: 'string', multiple: true, default: [] }
    }
});

const CLAVE = process.env.API_KEY_PASARELA;
if (!CLAVE) {
    console.error('Falta API_KEY_PASARELA (ponla en el .env de la raíz del repo)');
    process.exit(1);
}

const ENDPOINT = op.url.replace(/\/$/, '') + '/api/telemetria';
const DURACION = op.duracion ? Number(op.duracion) : Infinity;
const T_INCIDENTE = 15;
const T_SIN_SENAL = 10;
const T_SPRINT = [5, 15];   // escenario de recuperación: sprint entre estos segundos

// ---------- Modelo de movimiento ----------

// Velocidad (km/h) de cada tipo de actividad
const ACTIVIDADES = {
    parado: [0, 1.5],
    andando: [4, 6.5],
    trote: [8, 13],
    carrera: [15, 19],
    alta: [20, 24.5],
    sprint: [25.5, 32]
};
const PESOS_CAMPO = { parado: 8, andando: 30, trote: 30, carrera: 16, alta: 10, sprint: 6 };
const PESOS_PORTERO = { parado: 50, andando: 40, trote: 10 };

const ACEL_MAX = 4.2 * 3.6;    // km/h que puede ganar en 1 s (4,2 m/s²)
const DECEL_MAX = 5.0 * 3.6;   // km/h que puede perder en 1 s (5 m/s²)

function azar(min, max) {
    return min + Math.random() * (max - min);
}

function limitar(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function r1(n) { return Math.round(n * 10) / 10; }
function r2(n) { return Math.round(n * 100) / 100; }

function elegirActividad(pesos) {
    const total = Object.values(pesos).reduce(function (a, b) { return a + b; }, 0);
    let r = Math.random() * total;
    for (const [nombre, peso] of Object.entries(pesos)) {
        r -= peso;
        if (r <= 0) return nombre;
    }
    return 'andando';
}

function escenariosDe(id) {
    const tiene = function (lista) { return lista.includes(id); };
    return {
        calor: tiene(op.calor),
        fcAlta: tiene(op['fc-alta']),
        desacople: tiene(op.desacople),
        recuperacion: tiene(op.recuperacion),
        sobrecarga: tiene(op.sobrecarga),
        asimetria: tiene(op.asimetria),
        incidente: tiene(op.incidente),
        sinSenal: tiene(op['sin-senal'])
    };
}

function crearJugador(p, i) {
    const esPortero = p.posicion === 'POR';
    const esc = escenariosDe(p.id);
    return {
        ...p,
        indice: i,
        esPortero: esPortero,
        esc: esc,
        x: p.zona.x + azar(-3, 3),
        y: p.zona.y + azar(-3, 3),
        rumbo: azar(0, 2 * Math.PI),
        vel: 0,
        velObjetivo: 0,
        actividad: 'parado',
        velSuave: 0,
        carga: 0,
        dist: 0,
        fc: 95 + azar(-5, 5),
        temp: esc.calor ? 38.8 : p.tempBasal + 0.4,
        lado: Math.random() < 0.5 ? -1 : 1,    // qué pie carga más
        asimExtra: 0
    };
}

function mover(j, t) {
    const incidenteActivo = j.esc.incidente && t >= T_INCIDENTE;

    // 1. Actividad y velocidad objetivo
    if (incidenteActivo) {
        j.actividad = 'parado';
        j.velObjetivo = 0;
    } else if (j.esc.desacople) {
        j.actividad = 'andando';
        if (j.velObjetivo < 3 || j.velObjetivo > 6.5) j.velObjetivo = azar(3, 6.5);
    } else if (j.esc.sobrecarga) {
        const arrancando = Math.floor(t / 2) % 2 === 0;
        j.actividad = arrancando ? 'sprint' : 'parado';
        j.velObjetivo = arrancando ? 28 : 0;
    } else if (j.esc.recuperacion) {
        const sprintando = t >= T_SPRINT[0] && t < T_SPRINT[1];
        j.actividad = sprintando ? 'sprint' : 'andando';
        j.velObjetivo = sprintando ? 29 : 4;
    } else {
        const probCambio = j.actividad === 'sprint' ? 0.4 : 0.15;
        if (Math.random() < probCambio) {
            j.actividad = elegirActividad(j.esPortero ? PESOS_PORTERO : PESOS_CAMPO);
            const rango = ACTIVIDADES[j.actividad];
            j.velObjetivo = azar(rango[0], rango[1]);
        }
    }

    // 2. La velocidad se acerca a la objetivo con aceleración limitada
    const antes = j.vel;
    const dif = limitar(j.velObjetivo - j.vel, -DECEL_MAX, ACEL_MAX);
    j.vel = incidenteActivo ? 0 : Math.max(0, j.vel + dif * azar(0.55, 1));
    const acel = (j.vel - antes) / 3.6;   // m/s²

    // 3. Dirección: vuelve hacia su zona si se aleja y a veces cambia de dirección bruscamente
    const rumboAntes = j.rumbo;
    const dx = j.zona.x - j.x;
    const dy = j.zona.y - j.y;
    const lejos = Math.hypot(dx, dy) > (j.esPortero ? 6 : 14);
    if (lejos) {
        j.rumbo = Math.atan2(dy, dx) + azar(-0.3, 0.3);
    } else if (j.vel > 10 && Math.random() < 0.12) {
        j.rumbo += (Math.random() < 0.5 ? -1 : 1) * azar(Math.PI / 4, Math.PI * 0.8);
    } else {
        j.rumbo += azar(-0.35, 0.35);
    }

    // 4. Posición dentro del campo (rebota en las líneas)
    const paso = j.vel / 3.6;
    j.x += Math.cos(j.rumbo) * paso;
    j.y += Math.sin(j.rumbo) * paso;
    if (j.x < 0.5 || j.x > 104.5) { j.x = limitar(j.x, 0.5, 104.5); j.rumbo = Math.PI - j.rumbo; }
    if (j.y < 0.5 || j.y > 67.5) { j.y = limitar(j.y, 0.5, 67.5); j.rumbo = -j.rumbo; }
    j.dist += paso;

    let giroConSigno = 0;   // grados, positivo hacia la izquierda (como el giroscopio de A)
    if (j.vel > 2) {
        const d = Math.atan2(Math.sin(j.rumbo - rumboAntes), Math.cos(j.rumbo - rumboAntes));
        giroConSigno = Math.round(d * 180 / Math.PI);
    }

    // 5. Impactos: normalmente suaves, a veces un choque; 6,5 g en el incidente
    let impacto = azar(0.8, 1.6);
    if (Math.random() < 0.02) impacto = azar(2, 3.5);
    if (j.esc.incidente && t === T_INCIDENTE) impacto = 6.5;

    // 6. Frecuencia cardiaca: sigue al esfuerzo con retraso
    j.velSuave = j.velSuave * 0.9 + j.vel * 0.1;
    const esfuerzo = limitar(j.velSuave / 24, 0, 1);
    let fcObjetivo = 70 + (j.fcMax - 70) * (0.38 + 0.6 * esfuerzo);
    let reaccion = 0.12;
    if (j.esc.fcAlta) fcObjetivo = j.fcMax * 0.95;
    if (j.esc.desacople) fcObjetivo = j.fcMax * 0.89;
    if (incidenteActivo) { fcObjetivo = 42; reaccion = 0.15; }
    if (j.esc.recuperacion) {
        if (t < T_SPRINT[0]) fcObjetivo = j.fcMax * 0.7;
        else if (t < T_SPRINT[1]) { fcObjetivo = j.fcMax * 0.88; reaccion = 0.3; }   // sin pasar del 85 % al andar (no es FC_DESACOPLE)
        else {
            if (j.fcFinEsfuerzo === undefined) j.fcFinEsfuerzo = j.fc;
            fcObjetivo = j.fcFinEsfuerzo - 8;   // recuperación lenta: solo baja unos 8 lpm
        }
    }
    j.fc = limitar(j.fc + (fcObjetivo - j.fc) * reaccion + azar(-1.5, 1.5), 35, j.fcMax + 3);

    // 7. Temperatura interna: sube despacio con la carga acumulada
    j.carga = j.carga * 0.995 + esfuerzo * 0.005;
    if (j.esc.calor) {
        j.temp = Math.min(40.6, j.temp + 0.02);
    } else {
        const tempObjetivo = j.tempBasal + 0.6 + 1.4 * j.carga;
        j.temp += (tempObjetivo - j.temp) * 0.01;
    }

    // 8. Asimetría entre pies
    if (j.esc.asimetria) j.asimExtra = Math.min(28, j.asimExtra + 0.5);

    return { acel: acel, giroConSigno: giroConSigno, impacto: impacto };
}

function lecturaDe(j, t, ts) {
    if (j.esc.sinSenal && t >= T_SIN_SENAL) {
        return { jugadorId: j.id, ts: ts, estado: 'sin_senal' };
    }

    const m = mover(j, t);
    const medida = function (unit, value) { return { unit: unit, value: value }; };

    // Mismo formato que publica el simulador de A en p1/sensors/<sensor> (ver valores.json)
    const sensors = {
        gps: {
            speed: medida('km/h', r1(j.vel)),
            distancecovered: medida('m', r1(j.dist)),
            position: { X: medida('m', r1(j.x)), Y: medida('m', r1(j.y)) }
        },
        accelerometer: {
            acceleration: medida('m/s2', r2(Math.max(m.acel, 0) + azar(0, 0.2))),
            desacceleration: medida('m/s2', r2(Math.max(-m.acel, 0) + azar(0, 0.2))),
            impact: medida('g', r2(m.impacto))   // opcional en el contrato; sin él no salta INCIDENTE
        },
        giroscope: { changeinposition: medida('degrees', m.giroConSigno) },
        pulsemeter: { pulse: medida('bpm', Math.round(j.fc)) }
    };

    // Temperatura cada 10 s y plantillas cada 2 s, desfasadas entre jugadores
    if ((t + j.indice) % 10 === 0) sensors.termometer = { temperature: medida('C', r2(j.temp)) };
    if ((t + j.indice) % 2 === 0) {
        const asim = Math.max(0, j.asimetriaBase + j.asimExtra + azar(-1.5, 1.5));
        const izq = r1(limitar(50 + j.lado * asim / 2, 0, 100));
        sensors.pressuresensor = { pressureleftfoot: medida('%', izq), pressurerightfoot: medida('%', r1(100 - izq)) };
    }
    return { jugadorId: j.id, ts: ts, estado: 'ok', sensors: sensors };
}

// ---------- Bucle principal ----------

const jugadores = plantilla.map(crearJugador);
let t = 0;

const activos = jugadores
    .filter(function (j) { return Object.values(j.esc).some(Boolean); })
    .map(function (j) {
        const nombres = Object.entries(j.esc).filter(function (e) { return e[1]; }).map(function (e) { return e[0]; });
        return j.id + ' (' + nombres.join(', ') + ')';
    });

console.log('Fake-gateway → %s', ENDPOINT);
console.log('Escenarios: %s', activos.length ? activos.join('; ') : 'ninguno');
console.log('Ctrl+C para parar.\n');

async function enviar() {
    const ts = new Date().toISOString();
    const lote = {
        ts: ts,
        lecturas: jugadores.map(function (j) { return lecturaDe(j, t, ts); })
    };

    try {
        const res = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': CLAVE },
            body: JSON.stringify(lote),
            signal: AbortSignal.timeout(2000)
        });
        const texto = await res.text();
        if (res.status !== 202 || t % 10 === 0) {
            console.log('[t=%ss] %d %s', String(t).padStart(4), res.status, texto);
        }
    } catch (err) {
        console.log('[t=%ss] sin respuesta de la API: %s', String(t).padStart(4), err.cause?.code || err.message);
    }

    t++;
    if (t >= DURACION) {
        clearInterval(temporizador);
        console.log('\nFin (%d s).', t);
    }
}

const temporizador = setInterval(enviar, 1000);
enviar();
