// Constantes vitales en FHIR R4: cada resumen de 10 s (colección lecturas) se expone como Observation
// de categoría vital-signs. Solo FC y temperatura, que son las dos con código LOINC claro:
//   8867-4  Heart rate        → fcMedia de la ventana, en /min
//   8310-5  Body temperature  → temp (última lectura de la ventana), en Cel
// El id de cada Observation es <jugador>-<código>-<ts en ms>, así que se puede volver a pedir por id.
// El paciente es el seudónimo (Patient/p8): no hay nombres.

const CODIGOS = {
    '8867-4': {
        campo: 'fcMedia', nombre: 'Heart rate', texto: 'Frecuencia cardiaca', unidad: '/min',
        metodo: 'Media de 10 s del pulsómetro del wearable'
    },
    '8310-5': {
        campo: 'temp', nombre: 'Body temperature', texto: 'Temperatura interna', unidad: 'Cel',
        metodo: 'Última lectura en 10 s del sensor de temperatura interna del wearable'
    }
};

const ID = /^(p\d{1,2})-(8867-4|8310-5)-(\d+)$/;

function observacion(lectura, jugadorId, codigo) {
    const c = CODIGOS[codigo];
    const ts = new Date(lectura.ts);
    return {
        resourceType: 'Observation',
        id: jugadorId + '-' + codigo + '-' + ts.getTime(),
        status: 'final',
        category: [{
            coding: [{
                system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                code: 'vital-signs',
                display: 'Vital Signs'
            }]
        }],
        code: {
            coding: [{ system: 'http://loinc.org', code: codigo, display: c.nombre }],
            text: c.texto
        },
        subject: { reference: 'Patient/' + jugadorId },
        effectiveDateTime: ts.toISOString(),
        valueQuantity: { value: lectura[c.campo], unit: c.unidad, system: 'http://unitsofmeasure.org', code: c.unidad },
        method: { text: c.metodo }
    };
}

function bundle(observaciones, base, self) {
    return {
        resourceType: 'Bundle',
        type: 'searchset',
        timestamp: new Date().toISOString(),
        total: observaciones.length,
        link: [{ relation: 'self', url: self }],
        entry: observaciones.map(function (o) {
            return { fullUrl: base + '/fhir/Observation/' + o.id, resource: o, search: { mode: 'match' } };
        })
    };
}

// Los errores en FHIR se devuelven como OperationOutcome
function error(mensaje, tipo) {
    return {
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: tipo || 'invalid', diagnostics: mensaje }]
    };
}

// "p8" o "Patient/p8" → "p8" (o null si no es un seudónimo)
function leerPaciente(valor) {
    const m = typeof valor === 'string' && /^(?:Patient\/)?(p\d{1,2})$/.exec(valor);
    return m ? m[1] : null;
}

// "8867-4", "http://loinc.org|8867-4" o varios separados por comas → ['8867-4', …] (o null si alguno no vale)
function leerCodigos(valor) {
    if (valor === undefined) return Object.keys(CODIGOS);
    if (typeof valor !== 'string') return null;
    const codigos = valor.split(',').map(function (c) { return c.replace(/^http:\/\/loinc\.org\|/, '').trim(); });
    return codigos.every(function (c) { return c in CODIGOS; }) ? codigos : null;
}

// id de Observation → { jugadorId, codigo, ts } (o null)
function leerId(id) {
    const m = ID.exec(id);
    return m ? { jugadorId: m[1], codigo: m[2], ts: new Date(Number(m[3])) } : null;
}

module.exports = { CODIGOS, observacion, bundle, error, leerPaciente, leerCodigos, leerId };
