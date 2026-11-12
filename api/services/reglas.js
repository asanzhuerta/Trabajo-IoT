// Las reglas de alerta de docs/contratos/alertas.md, como funciones puras (test/reglas.test.js).
//
// Cada regla recibe un contexto { e, perfil, pauta, clima, ahora }:
//   e       estado en vivo del jugador (services/estado.js): sensors (formato de A), derivados,
//           historial de 180 s, sesion…
//   perfil  jugador con sus umbrales
//   pauta   pauta de readaptación activa, o null
//   clima   último registro de clima (con wbgt), o null
//   ahora   instante (ms) de la última lectura
// y devuelve { valor, umbral, mensaje } si se cumple, o null.
// El motor (alertas.js) añade el código, la severidad, el antirrebote y la publicación.

const { UMBRALES_DEFECTO } = require('./umbrales');
const sensores = require('./sensores');

const VEL_ESFUERZO = 19.8;   // km/h: por encima, el jugador está haciendo un esfuerzo
const VEL_REPOSO = 7;        // km/h: por debajo, está recuperando (andando o parado)
const VENTANA_RECUPERACION = 60;   // s
const VEL_INMOVIL = 1;       // km/h
const VENTANA_IMPACTO = 60;  // s en los que se busca el impacto previo a un incidente

// Velocidad y pulso de un punto del historial (sus sensores van en el formato de A)
function vel(h) {
    return sensores.velocidad(h.sensors);
}

function fc(h) {
    return sensores.pulso(h.sensors);
}

function umbralesDe(perfil) {
    return { ...UMBRALES_DEFECTO, ...((perfil && perfil.umbrales) || {}) };
}

function n(valor) {
    return Number(valor).toLocaleString('es-ES', { maximumFractionDigits: 2 });
}

function r2(valor) {
    return Math.round(valor * 100) / 100;
}

// Puntos del historial de los últimos `seg` segundos
function ultimosSegundos(historial, ahora, seg) {
    return historial.filter(function (h) { return h.ts > ahora - seg * 1000; });
}

// La condición se cumple en todos los puntos de los últimos `seg` segundos
// (se toleran un 10 % de lecturas perdidas, pero no menos)
function sostenido(historial, ahora, seg, condicion) {
    const tramo = ultimosSegundos(historial, ahora, seg);
    return tramo.length >= Math.max(1, Math.floor(seg * 0.9)) && tramo.every(condicion);
}

function conSenal(ctx) {
    return ctx.e.estado === 'ok' && ctx.e.sensors && ctx.e.derivados;
}

function ajusteCalor(u, clima) {
    if (clima && clima.wbgt != null && clima.wbgt >= u.wbgtAlto) return u.ajusteCalor;
    return 0;
}

function reglaCalor(campo) {
    return function (ctx) {
        if (!conSenal(ctx)) return null;
        const temp = sensores.temperatura(ctx.e.sensors);
        if (temp === null) return null;
        const u = umbralesDe(ctx.perfil);
        const ajuste = ajusteCalor(u, ctx.clima);
        const umbral = r2(u[campo] - ajuste);
        if (temp < umbral) return null;
        const motivo = ajuste ? ', bajado ' + n(ajuste) + ' °C por WBGT de ' + n(ctx.clima.wbgt) + ' °C' : '';
        return {
            valor: temp,
            umbral: umbral,
            mensaje: 'Temperatura interna de ' + n(temp) + ' °C (umbral ' + n(umbral) + ' °C' + motivo + ')'
        };
    };
}

function fcAlta(ctx) {
    if (!conSenal(ctx)) return null;
    const u = umbralesDe(ctx.perfil);
    const ok = sostenido(ctx.e.historial, ctx.ahora, u.fcAltaSeg, function (h) {
        return h.estado === 'ok' && h.pctFcMax > u.fcAltaPct;
    });
    if (!ok) return null;
    const pct = ctx.e.derivados.pctFcMax;
    return {
        valor: pct,
        umbral: u.fcAltaPct,
        mensaje: 'FC al ' + pct + ' % de la FCmáx durante más de ' + u.fcAltaSeg + ' s (umbral ' + u.fcAltaPct + ' %)'
    };
}

function fcDesacople(ctx) {
    if (!conSenal(ctx)) return null;
    const u = umbralesDe(ctx.perfil);
    const ok = sostenido(ctx.e.historial, ctx.ahora, u.desacopleSeg, function (h) {
        return h.estado === 'ok' && h.pctFcMax > u.desacoplePct && vel(h) < u.desacopleVel;
    });
    if (!ok) return null;
    const pct = ctx.e.derivados.pctFcMax;
    return {
        valor: pct,
        umbral: u.desacoplePct,
        mensaje: 'FC al ' + pct + ' % de la FCmáx sin esfuerzo (menos de ' + n(u.desacopleVel) +
            ' km/h) durante ' + u.desacopleSeg + ' s (umbral ' + u.desacoplePct + ' %)'
    };
}

// Se evalúa 60 s después del final de un esfuerzo: el primer segundo por debajo de 7 km/h
// tras haber ido a más de 19,8 km/h. Si desde entonces sigue en reposo y la FC ha bajado
// 12 lpm o menos, la recuperación es lenta (Cole et al., 1999).
function recuperacionLenta(ctx) {
    if (!conSenal(ctx)) return null;
    const u = umbralesDe(ctx.perfil);
    const h = ctx.e.historial;
    const limite = ctx.ahora - VENTANA_RECUPERACION * 1000;

    let i = -1;
    for (let k = h.length - 1; k >= 0; k--) {
        if (h[k].ts <= limite) { i = k; break; }
    }
    if (i < 1) return null;

    const fin = h[i];
    const previo = h[i - 1];
    if (fin.estado !== 'ok' || vel(fin) >= VEL_REPOSO) return null;
    if (previo.estado !== 'ok' || vel(previo) < VEL_REPOSO) return null;   // fin tiene que ser el primer segundo lento

    const esfuerzo = h.slice(Math.max(0, i - 10), i).filter(function (p) { return p.estado === 'ok'; });
    if (!esfuerzo.some(function (p) { return vel(p) > VEL_ESFUERZO; })) return null;

    const despues = h.slice(i);
    if (!despues.every(function (p) { return p.estado === 'ok' && vel(p) < VEL_REPOSO; })) return null;

    const fcAhora = sensores.pulso(ctx.e.sensors);
    const fcFin = Math.max(fc(fin), ...esfuerzo.map(fc));
    const bajada = fcFin - fcAhora;
    if (bajada > u.recuperacionLpm) return null;
    return {
        valor: bajada,
        umbral: u.recuperacionLpm,
        mensaje: 'La FC solo ha bajado ' + bajada + ' lpm en 60 s tras el esfuerzo (de ' + fcFin + ' a ' +
            fcAhora + ' lpm; se esperan más de ' + u.recuperacionLpm + ')'
    };
}

// Impacto fuerte, después inmóvil (o sin señal) durante inmovilSeg, y ahora FC anómala o sin señal
function incidente(ctx) {
    const u = umbralesDe(ctx.perfil);
    const h = ctx.e.historial;
    if (h.length === 0) return null;

    let k = -1;
    for (let j = h.length - 1; j >= 0 && h[j].ts > ctx.ahora - VENTANA_IMPACTO * 1000; j--) {
        const g = h[j].estado === 'ok' ? sensores.impacto(h[j].sensors) : null;
        if (g !== null && g >= u.impactoG) { k = j; break; }
    }
    if (k < 0) return null;

    const despues = h.slice(k + 1);
    if (despues.length < u.inmovilSeg) return null;
    if (!despues.every(function (p) { return p.estado === 'sin_senal' || vel(p) < VEL_INMOVIL; })) return null;

    const ultimo = h[h.length - 1];
    let causa;
    if (ultimo.estado === 'sin_senal') causa = 'sin señal';
    else if (fc(ultimo) < 50) causa = 'FC de ' + fc(ultimo) + ' lpm';
    else if (ultimo.pctFcMax > 95) causa = 'FC al ' + ultimo.pctFcMax + ' % de la FCmáx';
    else return null;

    const impacto = sensores.impacto(h[k].sensors);
    return {
        valor: impacto,
        umbral: u.impactoG,
        mensaje: 'Impacto de ' + n(impacto) + ' g, inmóvil desde hace ' + despues.length + ' s y ' + causa
    };
}

function sobrecarga(ctx) {
    if (!conSenal(ctx)) return null;
    const u = umbralesDe(ctx.perfil);
    const acciones = ctx.e.sesion.acelAltas + ctx.e.sesion.decelAltas;
    if (acciones <= u.sobrecargaAcciones) return null;
    return {
        valor: acciones,
        umbral: u.sobrecargaAcciones,
        mensaje: acciones + ' aceleraciones y desaceleraciones de alta intensidad en la sesión (máximo ' +
            u.sobrecargaAcciones + ')'
    };
}

function asimetria(ctx) {
    if (!conSenal(ctx) || ctx.e.derivados.asimetria == null) return null;
    const u = umbralesDe(ctx.perfil);
    const base = (ctx.perfil && ctx.perfil.asimetriaBase) || 0;
    const valor = ctx.e.derivados.asimetria;
    const maximo = base + u.asimetriaUmbral;
    if (valor <= maximo) return null;
    return {
        valor: valor,
        umbral: maximo,
        mensaje: 'Asimetría de carga entre pies de ' + n(valor) + ' puntos (su base es ' + n(base) +
            '; máximo ' + n(maximo) + ')'
    };
}

function pautaExcedida(ctx) {
    const p = ctx.pauta;
    if (!conSenal(ctx) || !p) return null;
    if (p.hasta && new Date(p.hasta).getTime() < ctx.ahora) return null;
    const velocidad = sensores.velocidad(ctx.e.sensors);
    const asim = ctx.e.derivados.asimetria;

    if (p.velMax != null && velocidad > p.velMax) {
        return { valor: velocidad, umbral: p.velMax,
            mensaje: 'Pauta de readaptación: velocidad de ' + n(velocidad) + ' km/h (máximo ' + n(p.velMax) + ')' };
    }
    const carga = ctx.e.sesion.distAltaInt;
    if (p.cargaMax != null && carga > p.cargaMax) {
        return { valor: Math.round(carga), umbral: p.cargaMax,
            mensaje: 'Pauta de readaptación: ' + Math.round(carga) + ' m a alta intensidad en la sesión (máximo ' +
                p.cargaMax + ' m)' };
    }
    if (p.asimetriaMax != null && asim != null && asim > p.asimetriaMax) {
        return { valor: asim, umbral: p.asimetriaMax,
            mensaje: 'Pauta de readaptación: asimetría de ' + n(asim) + ' puntos (máximo ' +
                n(p.asimetriaMax) + ')' };
    }
    return null;
}

function sinSenal(ctx) {
    if (ctx.e.estado !== 'sin_senal') return null;
    return { valor: null, umbral: null, mensaje: 'Sin señal del wearable desde hace más de 5 s' };
}

const REGLAS = [
    { codigo: 'CALOR_AMBAR', severidad: 'aviso', evaluar: reglaCalor('tempAmbar') },
    { codigo: 'CALOR_ROJA', severidad: 'critica', evaluar: reglaCalor('tempRoja') },
    { codigo: 'FC_ALTA', severidad: 'aviso', evaluar: fcAlta },
    { codigo: 'FC_DESACOPLE', severidad: 'aviso', evaluar: fcDesacople },
    { codigo: 'RECUPERACION_LENTA', severidad: 'aviso', evaluar: recuperacionLenta },
    { codigo: 'INCIDENTE', severidad: 'critica', evaluar: incidente },
    { codigo: 'SOBRECARGA', severidad: 'aviso', evaluar: sobrecarga },
    { codigo: 'ASIMETRIA', severidad: 'aviso', evaluar: asimetria },
    { codigo: 'PAUTA_EXCEDIDA', severidad: 'aviso', evaluar: pautaExcedida },
    { codigo: 'SIN_SENAL', severidad: 'aviso', evaluar: sinSenal }
];

// Todas las reglas que se cumplen ahora: [{ codigo, severidad, valor, umbral, mensaje }]
function evaluar(ctx) {
    const resultado = [];
    for (const regla of REGLAS) {
        const r = regla.evaluar(ctx);
        if (r) resultado.push({ codigo: regla.codigo, severidad: regla.severidad, ...r });
    }
    return resultado;
}

module.exports = { REGLAS, evaluar, umbralesDe };
