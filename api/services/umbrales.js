// Umbrales por defecto de las reglas de alerta (ver docs/contratos/alertas.md).
// Cada jugador guarda su propia copia y el médico la ajusta con PUT /api/jugadores/:id/umbrales.

const UMBRALES_DEFECTO = Object.freeze({
    tempAmbar: 39,            // °C
    tempRoja: 40,             // °C
    wbgtAlto: 28,             // °C de WBGT a partir del cual bajan los umbrales de calor
    ajusteCalor: 0.3,         // °C que bajan
    fcAltaPct: 92,            // % de la FCmáx
    fcAltaSeg: 60,            // s
    desacoplePct: 85,         // % de la FCmáx
    desacopleVel: 7,          // km/h
    desacopleSeg: 30,         // s
    recuperacionLpm: 12,      // lpm que debe bajar la FC en 60 s
    impactoG: 4,              // g
    inmovilSeg: 10,           // s
    sobrecargaAcciones: 120,  // aceleraciones + desaceleraciones altas por sesión
    asimetriaUmbral: 10       // puntos sobre la asimetría base
});

module.exports = { UMBRALES_DEFECTO };
