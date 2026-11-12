// Semáforo de un jugador a partir de las severidades de sus alertas activas:
// rojo si hay alguna crítica, ámbar si hay algún aviso y verde si no hay ninguna.

function semaforo(severidades) {
    let color = 'verde';
    for (const s of severidades) {
        if (s === 'critica') return 'rojo';
        if (s === 'aviso') color = 'ambar';
    }
    return color;
}

module.exports = { semaforo };
