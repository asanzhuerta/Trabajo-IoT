// Lectura de los sensores en el formato del simulador de A (ver valores.json):
//   sensors.gps.speed = { unit: "km/h", value: 28.7 }, sensors.pulsemeter.pulse = { unit: "bpm", value: 181 }…
//
// La API guarda y usa los sensores tal cual llegan, sin traducirlos. Estas funciones solo
// devuelven el `value` de cada medida (o null si esa medida no ha llegado).

function valor(medida) {
    return medida && typeof medida.value === 'number' ? medida.value : null;
}

function r1(n) {
    return Math.round(n * 10) / 10;
}

const sensores = {
    velocidad: function (s) { return valor(s && s.gps && s.gps.speed); },                         // km/h
    distancia: function (s) { return valor(s && s.gps && s.gps.distancecovered); },               // m
    x: function (s) { return valor(s && s.gps && s.gps.position && s.gps.position.X); },          // m
    y: function (s) { return valor(s && s.gps && s.gps.position && s.gps.position.Y); },          // m
    aceleracion: function (s) { return valor(s && s.accelerometer && s.accelerometer.acceleration); },       // m/s²
    desaceleracion: function (s) { return valor(s && s.accelerometer && s.accelerometer.desacceleration); }, // m/s², en positivo
    impacto: function (s) { return valor(s && s.accelerometer && s.accelerometer.impact); },      // g
    giro: function (s) { return valor(s && s.giroscope && s.giroscope.changeinposition); },       // grados, con signo
    pulso: function (s) { return valor(s && s.pulsemeter && s.pulsemeter.pulse); },               // lpm
    temperatura: function (s) { return valor(s && s.termometer && s.termometer.temperature); },   // °C
    pieIzquierdo: function (s) { return valor(s && s.pressuresensor && s.pressuresensor.pressureleftfoot); },   // %
    pieDerecho: function (s) { return valor(s && s.pressuresensor && s.pressuresensor.pressurerightfoot); },    // %

    // |izq − der| en puntos, o null si no hay plantillas
    asimetria: function (s) {
        const izq = sensores.pieIzquierdo(s);
        const der = sensores.pieDerecho(s);
        return izq === null || der === null ? null : r1(Math.abs(izq - der));
    }
};

module.exports = sensores;
