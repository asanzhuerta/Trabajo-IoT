// Muestra cada 2 s el estado en vivo de un jugador tal y como lo ve la API.
//
//   node scripts/vigilar.js        (p1)
//   node scripts/vigilar.js p8

require('../env');

const jugador = process.argv[2] || 'p1';
const API = process.env.API_URL || 'http://localhost:' + (process.env.PORT || 3000);

function valor(m) {
    return m && typeof m.value === 'number' ? m.value : '-';
}

async function mirar() {
    const hora = new Date().toLocaleTimeString('es-ES');
    try {
        const res = await fetch(API + '/api/jugadores/' + jugador + '/estado', { signal: AbortSignal.timeout(2000) });
        const e = await res.json();
        if (!res.ok) return console.log('%s  %s', hora, e.error);
        if (!e.estado) return console.log('%s  %s: todavía sin datos', hora, jugador);

        const s = e.sensors || {};
        const gps = s.gps || {};
        const pos = gps.position || {};
        const pies = s.pressuresensor || {};
        const d = e.derivados || {};
        const alertas = e.alertasActivas.map(function (a) { return a.codigo; }).join(', ') || '-';
        console.log('%s  %s %s | %s | X %s Y %s | %s km/h | %s lpm (%s%%) | %s °C | pies %s/%s, asimetría (1 min): %s | alertas: %s',
            hora, jugador, e.estado.padEnd(9), e.semaforo.toUpperCase().padEnd(5),
            valor(pos.X), valor(pos.Y), valor(gps.speed), valor((s.pulsemeter || {}).pulse), d.pctFcMax ?? '-',
            valor((s.termometer || {}).temperature), valor(pies.pressureleftfoot), valor(pies.pressurerightfoot),
            d.asimetria ?? '-', alertas);
    } catch (err) {
        console.log('%s  la API no responde en %s', hora, API);
    }
}

console.log('Vigilando %s en %s (Ctrl+C para parar)', jugador, API);
mirar();
setInterval(mirar, 2000);
