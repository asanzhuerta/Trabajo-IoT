// Ayuda para los tests: construye los sensores de un jugador en el formato del simulador de A
// a partir de valores sueltos. Lo que no se indique no se incluye.

const m = function (unit, value) { return { unit: unit, value: value }; };

function sensores(v = {}) {
    const s = {
        gps: {
            speed: m('km/h', v.vel ?? 10),
            distancecovered: m('m', v.dist ?? 0),
            position: { X: m('m', v.x ?? 50), Y: m('m', v.y ?? 30) }
        },
        accelerometer: {
            acceleration: m('m/s2', v.acel ?? 0.5),
            desacceleration: m('m/s2', v.decel ?? 0)
        },
        giroscope: { changeinposition: m('degrees', v.giro ?? 0) },
        pulsemeter: { pulse: m('bpm', v.fc ?? 140) }
    };
    if (v.impacto !== undefined) s.accelerometer.impact = m('g', v.impacto);
    if (v.temp !== undefined) s.termometer = { temperature: m('C', v.temp) };
    if (v.izq !== undefined) {
        s.pressuresensor = { pressureleftfoot: m('%', v.izq), pressurerightfoot: m('%', 100 - v.izq) };
    }
    return s;
}

module.exports = { m, sensores };
