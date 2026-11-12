// Validación del lote de POST /api/telemetria (formato en docs/contratos/api.md).
//
// Cada lectura trae los sensores tal y como los publica el simulador de A por MQTT
// (mismo formato que valores.json: { unit, value } con nombres en inglés). La API los guarda y los usa
// en ese mismo formato: aquí solo se comprueba que estén bien y se descarta lo que no esté en el contrato.
//
// Devuelve { ok: true, lote } (con ts como Date) o { ok: false, error } con el campo que falla.

const MAX_LECTURAS = 50;
const ID_JUGADOR = /^p\d{1,2}$/;

class ErrorValidacion extends Error {}

function falla(mensaje) {
    throw new ErrorValidacion(mensaje);
}

function numero(valor, campo, min, max) {
    if (typeof valor !== 'number' || !Number.isFinite(valor)) falla(campo + ' debe ser un número');
    if (valor < min || valor > max) falla(campo + ' fuera de rango (' + min + ' a ' + max + ')');
    return valor;
}

function objeto(valor, campo) {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) falla('falta el objeto ' + campo);
    return valor;
}

function fecha(valor, campo) {
    if (typeof valor !== 'string') falla(campo + ' debe ser una fecha ISO 8601');
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) falla(campo + ' no es una fecha válida');
    return d;
}

// Medida { unit, value }. La unidad puede faltar, pero si viene tiene que ser la esperada.
function medida(contenedor, nombre, ruta, unidad, min, max) {
    const m = objeto(contenedor[nombre], ruta + '.' + nombre);
    if (m.unit !== undefined && m.unit !== unidad) falla(ruta + '.' + nombre + '.unit debe ser "' + unidad + '"');
    return { unit: unidad, value: numero(m.value, ruta + '.' + nombre + '.value', min, max) };
}

function presente(valor) {
    return valor !== undefined && valor !== null;
}

// Cada sensor: qué medidas tiene, con su unidad y su rango. Las opcionales pueden faltar.
const SENSORES = {
    gps: function (g) {
        const posicion = objeto(g.position, 'sensors.gps.position');
        return {
            speed: medida(g, 'speed', 'sensors.gps', 'km/h', 0, 45),
            distancecovered: medida(g, 'distancecovered', 'sensors.gps', 'm', 0, 30000),
            position: {
                X: medida(posicion, 'X', 'sensors.gps.position', 'm', 0, 105),
                Y: medida(posicion, 'Y', 'sensors.gps.position', 'm', 0, 68)
            }
        };
    },
    accelerometer: function (a) {
        const r = {
            acceleration: medida(a, 'acceleration', 'sensors.accelerometer', 'm/s2', 0, 20),
            desacceleration: medida(a, 'desacceleration', 'sensors.accelerometer', 'm/s2', 0, 20)
        };
        if (presente(a.impact)) r.impact = medida(a, 'impact', 'sensors.accelerometer', 'g', 0, 20);
        return r;
    },
    giroscope: function (g) {
        return { changeinposition: medida(g, 'changeinposition', 'sensors.giroscope', 'degrees', -360, 360) };
    },
    pulsemeter: function (p) {
        return { pulse: medida(p, 'pulse', 'sensors.pulsemeter', 'bpm', 20, 250) };
    },
    termometer: function (t) {
        return { temperature: medida(t, 'temperature', 'sensors.termometer', 'C', 30, 45) };
    },
    pressuresensor: function (p) {
        const r = {
            pressureleftfoot: medida(p, 'pressureleftfoot', 'sensors.pressuresensor', '%', 0, 100),
            pressurerightfoot: medida(p, 'pressurerightfoot', 'sensors.pressuresensor', '%', 0, 100)
        };
        if (Math.abs(r.pressureleftfoot.value + r.pressurerightfoot.value - 100) > 2) {
            falla('pressureleftfoot + pressurerightfoot debe sumar 100');
        }
        return r;
    }
};
const OBLIGATORIOS = ['gps', 'accelerometer', 'pulsemeter'];

function validarLectura(l, tsLote) {
    objeto(l, 'lectura');
    if (typeof l.jugadorId !== 'string' || !ID_JUGADOR.test(l.jugadorId)) {
        falla('jugadorId debe tener la forma p1…p99');
    }
    const ts = l.ts === undefined ? tsLote : fecha(l.ts, 'ts');
    const estado = l.estado === undefined ? 'ok' : l.estado;

    if (estado === 'sin_senal') {
        return { jugadorId: l.jugadorId, ts: ts, estado: 'sin_senal' };
    }
    if (estado !== 'ok') falla('estado debe ser "ok" o "sin_senal"');

    const entrada = objeto(l.sensors, 'sensors');
    const sensors = {};
    for (const [nombre, validar] of Object.entries(SENSORES)) {
        if (presente(entrada[nombre])) {
            sensors[nombre] = validar(objeto(entrada[nombre], 'sensors.' + nombre));
        } else if (OBLIGATORIOS.includes(nombre)) {
            falla('falta el objeto sensors.' + nombre);
        }
    }
    return { jugadorId: l.jugadorId, ts: ts, estado: 'ok', sensors: sensors };
}

function validarLote(body, equipoEsperado) {
    try {
        objeto(body, 'lote {ts, lecturas}');
        if (body.equipo !== undefined && body.equipo !== equipoEsperado) {
            falla('equipo debe ser "' + equipoEsperado + '"');
        }
        const ts = fecha(body.ts, 'ts');
        if (!Array.isArray(body.lecturas) || body.lecturas.length === 0) {
            falla('lecturas debe ser una lista con al menos una lectura');
        }
        if (body.lecturas.length > MAX_LECTURAS) falla('como mucho ' + MAX_LECTURAS + ' lecturas por lote');

        const vistos = new Set();
        const lecturas = body.lecturas.map(function (l, i) {
            try {
                const lectura = validarLectura(l, ts);
                if (vistos.has(lectura.jugadorId)) falla('jugador repetido en el lote');
                vistos.add(lectura.jugadorId);
                return lectura;
            } catch (err) {
                if (err instanceof ErrorValidacion) falla('lecturas[' + i + ']: ' + err.message);
                throw err;
            }
        });
        return { ok: true, lote: { ts: ts, lecturas: lecturas } };
    } catch (err) {
        if (err instanceof ErrorValidacion) return { ok: false, error: err.message };
        throw err;
    }
}

module.exports = { validarLote };
