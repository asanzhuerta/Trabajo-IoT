// ACWR (acute:chronic workload ratio) de un jugador: la carga de los últimos 7 días entre la media
// semanal de los últimos 28. La carga de cada sesión son los metros a alta intensidad (distAltaInt,
// a más de 19,8 km/h) de su resumen.
//
// Franjas (Gabbett, 2016): por debajo de 0,8 la carga es baja, entre 0,8 y 1,3 es la "zona óptima"
// y por encima de 1,3 el riesgo de lesión sube. Es una referencia discutida (Impellizzeri et al., 2020):
// sirve para vigilar los picos de carga, no para predecir lesiones.

const DIA_MS = 24 * 60 * 60 * 1000;

function franja(ratio) {
    if (ratio === null) return null;
    if (ratio < 0.8) return 'baja';
    if (ratio <= 1.3) return 'optima';
    return 'alta';
}

// cargas: [{ inicio: Date, carga: m }] de las sesiones cerradas del jugador. ahora: ms.
function calcular(cargas, ahora) {
    let aguda = 0, total28 = 0, sesiones7d = 0, sesiones28d = 0;
    for (const c of cargas) {
        const edad = ahora - new Date(c.inicio).getTime();
        if (edad < 0 || edad >= 28 * DIA_MS) continue;
        total28 += c.carga;
        sesiones28d++;
        if (edad < 7 * DIA_MS) {
            aguda += c.carga;
            sesiones7d++;
        }
    }
    const cronica = total28 / 4;
    const ratio = cronica > 0 ? Math.round(aguda / cronica * 100) / 100 : null;
    return {
        cargaAguda: Math.round(aguda),
        cargaCronica: Math.round(cronica),
        ratio: ratio,
        franja: franja(ratio),
        sesiones7d: sesiones7d,
        sesiones28d: sesiones28d
    };
}

module.exports = { DIA_MS, calcular, franja };
