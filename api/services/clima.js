// Clima de Open-Meteo que manda Node-RED. El último registro baja los umbrales de calor
// (CALOR_AMBAR y CALOR_ROJA) cuando el WBGT pasa de wbgtAlto (ver reglas.js).
//
// Si llega sin WBGT pero con humedad, se estima con la fórmula de la Oficina de Meteorología de Australia
// para la sombra y sin viento (no tiene en cuenta el sol, así que en pleno sol se queda corta):
//   WBGT ≈ 0,567·T + 0,393·e + 3,94,   e = (HR/100) · 6,105 · exp(17,27·T / (237,7 + T))   (hPa)

const { Clima } = require('../models');
const perfiles = require('./perfiles');
const websocket = require('../servers/websocket');

function estimarWbgt(temp, humedad) {
    const presionVapor = humedad / 100 * 6.105 * Math.exp(17.27 * temp / (237.7 + temp));
    return Math.round((0.567 * temp + 0.393 * presionVapor + 3.94) * 10) / 10;
}

async function guardar(datos) {
    const registro = new Clima({
        ts: datos.ts,
        temp: datos.temp,
        humedad: datos.humedad,
        wbgt: datos.wbgt,
        fuente: datos.fuente
    });
    if (registro.wbgt == null && registro.temp != null && registro.humedad != null) {
        registro.wbgt = estimarWbgt(registro.temp, registro.humedad);
        registro.wbgtEstimado = true;
    }
    await registro.save();

    // Solo pasa a ser el clima actual si es el más reciente (Node-RED podría reenviar uno antiguo)
    const actual = perfiles.clima();
    if (!actual || registro.ts >= actual.ts) perfiles.fijarClima(registro.toObject());

    websocket.sendMessage({ tipo: 'clima', clima: registro.toJSON() });
    return registro;
}

function ultimo() {
    return Clima.findOne().sort({ ts: -1 });
}

module.exports = { estimarWbgt, guardar, ultimo };
