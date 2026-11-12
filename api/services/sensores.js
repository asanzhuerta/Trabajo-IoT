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

    // izq − der en puntos, CON signo (positivo si carga más el pie izquierdo), o null si no hay plantillas
    diferenciaPies: function (s) {
        const izq = sensores.pieIzquierdo(s);
        const der = sensores.pieDerecho(s);
        return izq === null || der === null ? null : izq - der;
    }
};

// Asimetría de carga entre pies a partir de varias lecturas: |media de (izq − der)|.
// En cada pisada la carga pasa de un pie al otro, así que una lectura suelta puede marcar 20 o 30 puntos
// aunque el jugador esté bien. Con la media con signo esas alternancias se compensan y queda
// solo el desequilibrio que se mantiene, que es el que interesa (lesión, compensación…).
sensores.asimetriaMedia = function (diferencias) {
    if (diferencias.length === 0) return null;
    const suma = diferencias.reduce(function (a, b) { return a + b; }, 0);
    return r1(Math.abs(suma / diferencias.length));
};

module.exports = sensores;
