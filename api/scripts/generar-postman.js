// Genera docs/postman_collection.json (Postman Collection v2.1) con todas las peticiones de la API.
// Al añadir un endpoint: se añade aquí su petición y se vuelve a generar.
//
//   node scripts/generar-postman.js      (desde api/)
//
// Las claves no se escriben en la colección: en Postman se ponen en el Current value de claveMedico y clavePasarela.

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..');

const MEDICO = { key: 'x-api-key', value: '{{claveMedico}}' };
const PASARELA = { key: 'x-api-key', value: '{{clavePasarela}}' };
const JSON_H = { key: 'Content-Type', value: 'application/json' };

function url(ruta, query) {
    const crudo = '{{baseUrl}}' + ruta + (query ? '?' + query.map(function (q) { return q.key + '=' + q.value; }).join('&') : '');
    const u = { raw: crudo, host: ['{{baseUrl}}'], path: ruta.replace(/^\//, '').split('/') };
    if (query) u.query = query;
    return u;
}

function test(lineas) {
    return { listen: 'test', script: { type: 'text/javascript', exec: lineas } };
}

function codigo(n) {
    return "pm.test('Responde " + n + "', function () { pm.response.to.have.status(" + n + "); });";
}

// p: { nombre, metodo, ruta, query, clave, cuerpo, esperado, guardar, descripcion, preRequest }
function peticion(p) {
    const cabeceras = [];
    if (p.clave) cabeceras.push(p.clave);
    if (p.cuerpo !== undefined) cabeceras.push(JSON_H);
    const lineasTest = [codigo(p.esperado || 200)].concat(p.guardar || []);
    const eventos = [test(lineasTest)];
    if (p.preRequest) eventos.unshift({ listen: 'prerequest', script: { type: 'text/javascript', exec: p.preRequest } });
    const item = {
        name: p.nombre,
        event: eventos,
        request: {
            method: p.metodo,
            header: cabeceras,
            url: url(p.ruta, p.query),
            description: p.descripcion || ''
        }
    };
    if (p.cuerpo !== undefined) {
        item.request.body = {
            mode: 'raw',
            raw: typeof p.cuerpo === 'string' ? p.cuerpo : JSON.stringify(p.cuerpo, null, 2),
            options: { raw: { language: 'json' } }
        };
    }
    return item;
}

function carpeta(nombre, descripcion, items) {
    return { name: nombre, description: descripcion, item: items };
}

// Una lectura de ejemplo en el formato del simulador de A
function lecturaEjemplo(jugadorId, v) {
    return {
        jugadorId: jugadorId,
        ts: '{{ahora}}',
        estado: 'ok',
        sensors: {
            gps: {
                speed: { unit: 'km/h', value: v.vel },
                distancecovered: { unit: 'm', value: v.dist },
                position: { X: { unit: 'm', value: v.x }, Y: { unit: 'm', value: v.y } }
            },
            accelerometer: {
                acceleration: { unit: 'm/s2', value: 1.2 },
                desacceleration: { unit: 'm/s2', value: 0 },
                impact: { unit: 'g', value: 1.1 }
            },
            giroscope: { changeinposition: { unit: 'degrees', value: 12 } },
            pulsemeter: { pulse: { unit: 'bpm', value: v.fc } },
            termometer: { temperature: { unit: 'C', value: v.temp } },
            pressuresensor: {
                pressureleftfoot: { unit: '%', value: 49 },
                pressurerightfoot: { unit: '%', value: 51 }
            }
        }
    };
}

const PONER_AHORA = ["pm.collectionVariables.set('ahora', new Date().toISOString());"];

const loteEjemplo = {
    ts: '{{ahora}}',
    lecturas: [
        lecturaEjemplo('p1', { vel: 14.2, dist: 2350, x: 40.5, y: 22.1, fc: 152, temp: 37.9 }),
        lecturaEjemplo('p8', { vel: 26.1, dist: 3120, x: 71.0, y: 40.3, fc: 178, temp: 38.4 }),
        { jugadorId: 'p10', ts: '{{ahora}}', estado: 'sin_senal' }
    ]
};

const coleccion = {
    info: {
        name: 'Smart Health · API REST',
        description: [
            'Colección de la API de Smart Health (Practical Assignment IoT 2026/27).',
            '',
            '**Antes de empezar:**',
            '1. Arranca la API (`npm run dev` en `api/`) y carga los jugadores (`node scripts/seed.js`).',
            '2. En las variables de la colección, pon en **Current value** las claves del `.env`: `claveMedico` = `API_KEY_MEDICO` y `clavePasarela` = `API_KEY_PASARELA`. El *Current value* no se exporta ni se sube al repo.',
            '3. Si la API no está en el puerto 3000, cambia `baseUrl`.',
            '',
            '**Variables que se rellenan solas:** `sesionId` (al empezar una sesión), `alertaId` (al listar alertas activas), `observacionId` (al buscar la FC en FHIR) y `ahora` (fecha actual para la telemetría y el clima).',
            '',
            'Cada petición comprueba el código de respuesta, así que se puede lanzar entera con el *Collection Runner*.',
            'La documentación interactiva está en `{{baseUrl}}/api-docs` y los contratos en `docs/contratos/`.'
        ].join('\n'),
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    variable: [
        { key: 'baseUrl', value: 'http://localhost:3000' },
        { key: 'claveMedico', value: 'pon-aqui-API_KEY_MEDICO' },
        { key: 'clavePasarela', value: 'pon-aqui-API_KEY_PASARELA' },
        { key: 'jugadorId', value: 'p1' },
        { key: 'sesionId', value: '' },
        { key: 'alertaId', value: '' },
        { key: 'observacionId', value: '' },
        { key: 'ahora', value: '' }
    ],
    item: [
        carpeta('Utilidad', 'Comprobaciones rápidas.', [
            peticion({ nombre: 'Health', metodo: 'GET', ruta: '/health',
                guardar: ["pm.test('Mongo conectado', function () { pm.expect(pm.response.json().mongo).to.eql('connected'); });"] })
        ]),

        carpeta('Telemetría', 'Lo que manda la pasarela de Node-RED una vez por segundo (clave de la pasarela).', [
            peticion({
                nombre: 'Enviar un lote', metodo: 'POST', ruta: '/api/telemetria', clave: PASARELA,
                cuerpo: loteEjemplo, esperado: 202, preRequest: PONER_AHORA,
                descripcion: 'Lote con p1 y p8 en el formato del simulador de A, y p10 sin señal. `{{ahora}}` se rellena antes de enviarlo.',
                guardar: ["pm.test('Recibe las 3 lecturas', function () { pm.expect(pm.response.json().recibidas).to.eql(3); });"]
            })
        ]),

        carpeta('Jugadores', 'Perfil médico, umbrales, estado en vivo e histórico. Las escrituras piden la clave del médico.', [
            peticion({ nombre: 'Listar jugadores', metodo: 'GET', ruta: '/api/jugadores',
                guardar: ["pm.test('Hay jugadores', function () { pm.expect(pm.response.json().length).to.be.above(0); });"] }),
            peticion({ nombre: 'Ver un jugador', metodo: 'GET', ruta: '/api/jugadores/{{jugadorId}}' }),
            peticion({ nombre: 'Estado en vivo y semáforo', metodo: 'GET', ruta: '/api/jugadores/{{jugadorId}}/estado',
                guardar: ["pm.test('Tiene semáforo', function () { pm.expect(['verde', 'ambar', 'rojo']).to.include(pm.response.json().semaforo); });"] }),
            peticion({ nombre: 'Histórico (últimos 15 min)', metodo: 'GET', ruta: '/api/jugadores/{{jugadorId}}/historico' }),
            peticion({ nombre: 'Histórico entre dos fechas', metodo: 'GET', ruta: '/api/jugadores/{{jugadorId}}/historico',
                query: [{ key: 'desde', value: '2026-11-12T18:00:00Z' }, { key: 'hasta', value: '2026-11-12T18:15:00Z' }] }),
            peticion({ nombre: 'Dar de alta un jugador (p12)', metodo: 'POST', ruta: '/api/jugadores', clave: MEDICO, esperado: 201,
                cuerpo: { id: 'p12', dorsal: 23, posicion: 'DFC', fcMax: 192, tempBasal: 37.0, asimetriaBase: 3 },
                descripcion: 'La segunda vez responde 409 (ya existe). Para repetirlo, vuelve a lanzar el seed con `--limpiar`.' }),
            peticion({ nombre: 'Actualizar el perfil', metodo: 'PUT', ruta: '/api/jugadores/{{jugadorId}}', clave: MEDICO,
                cuerpo: { asimetriaBase: 3 },
                descripcion: 'Solo cambia los campos que vengan. 3 es el valor que tiene p1 en el seed.' }),
            peticion({ nombre: 'Ajustar umbrales', metodo: 'PUT', ruta: '/api/jugadores/{{jugadorId}}/umbrales', clave: MEDICO,
                cuerpo: { fcAltaPct: 92, tempAmbar: 39 },
                descripcion: 'Los nombres de los umbrales están en `docs/contratos/alertas.md`. Aquí se dejan los valores por defecto.' })
        ]),

        carpeta('Pauta de readaptación', 'Límites que fija el médico a un jugador que vuelve de una lesión (p5 tiene una en el seed).', [
            peticion({ nombre: 'Ver la pauta activa de p5', metodo: 'GET', ruta: '/api/jugadores/p5/pauta' }),
            peticion({ nombre: 'Crear una pauta para p5', metodo: 'POST', ruta: '/api/jugadores/p5/pauta', clave: MEDICO, esperado: 201,
                preRequest: ["const d = new Date(Date.now() + 7 * 24 * 3600 * 1000);", "pm.collectionVariables.set('dentroDeUnaSemana', d.toISOString().slice(0, 10));"],
                cuerpo: { velMax: 22, cargaMax: 600, asimetriaMax: 8, hasta: '{{dentroDeUnaSemana}}', notas: 'Vuelta progresiva tras sobrecarga en isquios' },
                descripcion: 'Sustituye a la anterior. `hasta` se pone a una semana vista antes de enviarla.' })
        ]),

        carpeta('Alertas', 'Alertas del motor de reglas. Para que haya alguna activa, lanza el fake-gateway con un escenario (p. ej. `--calor p8`).', [
            peticion({ nombre: 'Alertas activas', metodo: 'GET', ruta: '/api/alertas', query: [{ key: 'estado', value: 'activa' }],
                guardar: [
                    'const activas = pm.response.json();',
                    "if (activas.length) pm.collectionVariables.set('alertaId', activas[0].id);",
                    "console.log(activas.length ? 'alertaId = ' + activas[0].id + ' (' + activas[0].codigo + ' de ' + activas[0].jugadorId + ')' : 'No hay alertas activas');"
                ] }),
            peticion({ nombre: 'Alertas de un jugador', metodo: 'GET', ruta: '/api/alertas', query: [{ key: 'jugadorId', value: '{{jugadorId}}' }] }),
            peticion({ nombre: 'Confirmar la alerta', metodo: 'POST', ruta: '/api/alertas/{{alertaId}}/confirmar', clave: MEDICO,
                cuerpo: { por: 'Dra. Pérez', nota: 'Retirado a la banda, hidratación' },
                descripcion: 'Confirma la alerta guardada en `alertaId` por «Alertas activas». Si ya estaba confirmada responde 409.' })
        ]),

        carpeta('Sesiones', 'Entrenamientos y partidos. Solo puede haber una abierta; al cerrarla se guarda el resumen de cada jugador.', [
            peticion({ nombre: 'Empezar una sesión', metodo: 'POST', ruta: '/api/sesiones', clave: MEDICO, esperado: 201,
                cuerpo: { tipo: 'entrenamiento', nombre: 'Entrenamiento de prueba (Postman)' },
                guardar: ["pm.collectionVariables.set('sesionId', pm.response.json().id);"],
                descripcion: 'Guarda el id en `sesionId`. Si ya hay una abierta responde 409: ciérrala antes.' }),
            peticion({ nombre: 'Sesión abierta', metodo: 'GET', ruta: '/api/sesiones', query: [{ key: 'estado', value: 'abierta' }] }),
            peticion({ nombre: 'Ver la sesión (resumen hasta ahora)', metodo: 'GET', ruta: '/api/sesiones/{{sesionId}}' }),
            peticion({ nombre: 'Cerrar la sesión', metodo: 'POST', ruta: '/api/sesiones/{{sesionId}}/fin', clave: MEDICO,
                guardar: ["pm.test('Queda cerrada', function () { pm.expect(pm.response.json().fin).to.not.eql(null); });"] }),
            peticion({ nombre: 'Listar sesiones', metodo: 'GET', ruta: '/api/sesiones' })
        ]),

        carpeta('Clima', 'Lo que manda el flujo de Open-Meteo de Node-RED (clave de la pasarela). Con un WBGT de 28 °C o más, los umbrales de calor bajan 0,3 °C.', [
            peticion({ nombre: 'Guardar clima (la API estima el WBGT)', metodo: 'POST', ruta: '/api/clima', clave: PASARELA, esperado: 201,
                preRequest: PONER_AHORA,
                cuerpo: { ts: '{{ahora}}', temp: 24, humedad: 55, fuente: 'open-meteo' },
                guardar: ["pm.test('WBGT estimado', function () { pm.expect(pm.response.json().wbgtEstimado).to.eql(true); });"],
                descripcion: 'Sin `wbgt`: la API lo estima con la temperatura y la humedad. Con 24 °C sale un WBGT de unos 24 °C, que no cambia los umbrales. Para probar el ajuste por calor, prueba con `"temp": 34, "humedad": 60` (y vuelve a mandar este después).' }),
            peticion({ nombre: 'Último clima', metodo: 'GET', ruta: '/api/clima' })
        ]),

        carpeta('FHIR', 'Constantes vitales como recursos FHIR R4. Hacen falta datos: lanza antes el fake-gateway o la pasarela unos segundos.', [
            peticion({ nombre: 'FC de un jugador (LOINC 8867-4)', metodo: 'GET', ruta: '/fhir/Observation',
                query: [{ key: 'patient', value: '{{jugadorId}}' }, { key: 'code', value: '8867-4' }, { key: '_count', value: '5' }],
                guardar: [
                    'const b = pm.response.json();',
                    "pm.test('Es un Bundle searchset', function () { pm.expect(b.resourceType + ' ' + b.type).to.eql('Bundle searchset'); });",
                    "if (b.entry && b.entry.length) pm.collectionVariables.set('observacionId', b.entry[0].resource.id);"
                ],
                descripcion: 'Guarda el id de la primera Observation en `observacionId`.' }),
            peticion({ nombre: 'Temperatura de un jugador (LOINC 8310-5)', metodo: 'GET', ruta: '/fhir/Observation',
                query: [{ key: 'patient', value: 'Patient/{{jugadorId}}' }, { key: 'code', value: 'http://loinc.org|8310-5' }] }),
            peticion({ nombre: 'Todas las constantes de un jugador', metodo: 'GET', ruta: '/fhir/Observation',
                query: [{ key: 'patient', value: '{{jugadorId}}' }] }),
            peticion({ nombre: 'Una Observation por su id', metodo: 'GET', ruta: '/fhir/Observation/{{observacionId}}',
                preRequest: ["if (!pm.collectionVariables.get('observacionId')) pm.execution.skipRequest();"],
                guardar: ["pm.test('Es una Observation', function () { pm.expect(pm.response.json().resourceType).to.eql('Observation'); });"],
                descripcion: 'Usa el id que guardó «FC de un jugador». Si no había datos, se salta.' })
        ]),

        carpeta('ACWR', 'Carga aguda (7 días) entre crónica (media semanal de 28). El seed genera 4 semanas de sesiones: p7 sale alto, p5 bajo y el resto en la zona óptima.', [
            peticion({ nombre: 'ACWR de p7 (pico de carga)', metodo: 'GET', ruta: '/api/jugadores/p7/acwr',
                guardar: ["pm.test('Franja alta', function () { pm.expect(pm.response.json().franja).to.eql('alta'); });"] }),
            peticion({ nombre: 'ACWR de p5 (readaptación)', metodo: 'GET', ruta: '/api/jugadores/p5/acwr',
                guardar: ["pm.test('Franja baja', function () { pm.expect(pm.response.json().franja).to.eql('baja'); });"] }),
            peticion({ nombre: 'ACWR de un jugador', metodo: 'GET', ruta: '/api/jugadores/{{jugadorId}}/acwr' })
        ]),

        carpeta('Errores (para enseñarlos)', 'Cómo responde la API cuando algo está mal. Cada petición espera su código de error.', [
            peticion({ nombre: '401: sin clave', metodo: 'POST', ruta: '/api/sesiones', esperado: 401,
                cuerpo: { tipo: 'partido', nombre: 'x' } }),
            peticion({ nombre: '403: la pasarela intenta confirmar una alerta', metodo: 'POST', ruta: '/api/alertas/000000000000000000000000/confirmar',
                clave: PASARELA, esperado: 403, cuerpo: { por: 'Node-RED' } }),
            peticion({ nombre: '400: lote con un pulso que no es un número', metodo: 'POST', ruta: '/api/telemetria', clave: PASARELA, esperado: 400,
                preRequest: PONER_AHORA,
                cuerpo: { ts: '{{ahora}}', lecturas: [{ ...lecturaEjemplo('p1', { vel: 10, dist: 100, x: 10, y: 10, fc: 150, temp: 37.5 }), sensors: { ...lecturaEjemplo('p1', { vel: 10, dist: 100, x: 10, y: 10, fc: 150, temp: 37.5 }).sensors, pulsemeter: { pulse: { unit: 'bpm', value: 'mucho' } } } }] } }),
            peticion({ nombre: '400: velocidad en m/s en vez de km/h', metodo: 'POST', ruta: '/api/telemetria', clave: PASARELA, esperado: 400,
                preRequest: PONER_AHORA,
                cuerpo: { ts: '{{ahora}}', lecturas: [{ ...lecturaEjemplo('p1', { vel: 10, dist: 100, x: 10, y: 10, fc: 150, temp: 37.5 }), sensors: { ...lecturaEjemplo('p1', { vel: 10, dist: 100, x: 10, y: 10, fc: 150, temp: 37.5 }).sensors, gps: { speed: { unit: 'm/s', value: 3 }, distancecovered: { unit: 'm', value: 100 }, position: { X: { unit: 'm', value: 10 }, Y: { unit: 'm', value: 10 } } } } }] } }),
            peticion({ nombre: '400: JSON mal formado', metodo: 'POST', ruta: '/api/sesiones', clave: MEDICO, esperado: 400,
                cuerpo: '{ "tipo": "partido", ' }),
            peticion({ nombre: '404: jugador que no existe', metodo: 'GET', ruta: '/api/jugadores/p99', esperado: 404 }),
            peticion({ nombre: '400: clima sin temperatura', metodo: 'POST', ruta: '/api/clima', clave: PASARELA, esperado: 400,
                cuerpo: { humedad: 55 } }),
            peticion({ nombre: '400 FHIR: búsqueda sin paciente (OperationOutcome)', metodo: 'GET', ruta: '/fhir/Observation', esperado: 400,
                guardar: ["pm.test('Es un OperationOutcome', function () { pm.expect(pm.response.json().resourceType).to.eql('OperationOutcome'); });"] }),
            peticion({ nombre: '409: dorsal repetido', metodo: 'POST', ruta: '/api/jugadores', clave: MEDICO, esperado: 409,
                cuerpo: { id: 'p13', dorsal: 1, posicion: 'POR', fcMax: 190 },
                descripcion: 'El dorsal 1 ya lo tiene un jugador del seed.' })
        ])
    ]
};

const destino = path.join(REPO, 'docs', 'postman_collection.json');
fs.writeFileSync(destino, JSON.stringify(coleccion, null, 2) + '\n');
console.log('Escrito %s (%d carpetas, %d peticiones)', destino, coleccion.item.length,
    coleccion.item.reduce(function (n, c) { return n + c.item.length; }, 0));
