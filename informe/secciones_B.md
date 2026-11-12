# Informe: secciones de la Persona B (backend y datos)

> Borrador de las secciones 5, 6 y 7, la parte de la API de la 9 y lo que aporta B a la 10. Las figuras que se citan están en `docs/diagramas/` y en `informe/capturas/`. Los datos salen del código del repo y de las pruebas descritas en la sección 10.

---

## 5. API REST y cómo invocarla

### 5.1 Qué es y dónde está

La API está hecha con **Node.js 24 y Express 5** (carpeta `api/`) y sigue la estructura de los ejemplos de clase: `server.js` arranca el servidor HTTP y le ata el servidor WebSocket; `servers/http-server.js` monta los routers; la lógica está en `services/` y los modelos de MongoDB en `models/`.

- **URL base:** `http://localhost:3000`. Peticiones y respuestas en JSON; fechas en ISO 8601 (UTC).
- **Documentación interactiva:** Swagger UI en `http://localhost:3000/api-docs`, generada a partir de `api/openapi.yaml` (OpenAPI 3.0.3, 17 rutas).
- **Contrato completo:** `docs/contratos/api.md`.

*Figura 5.1 — Arquitectura de la API por capas* (`docs/diagramas/api-arquitectura.png`).
*Figura 5.2 — Carpetas y archivos de la API, qué hace cada uno y quién entra por dónde* (`docs/diagramas/api-modulos.png`).

### 5.2 Operaciones

| Método | Ruta | Clave | Para qué |
|---|---|---|---|
| `POST` | `/api/telemetria` | pasarela | Lote por segundo con la última lectura de cada jugador |
| `GET` · `POST` | `/api/jugadores` | — · médico | Lista de jugadores · alta de uno nuevo |
| `GET` · `PUT` | `/api/jugadores/:id` | — · médico | Perfil médico (FCmáx, temperatura basal, asimetría base…) |
| `PUT` | `/api/jugadores/:id/umbrales` | médico | Ajustar los umbrales de alerta de un jugador |
| `GET` | `/api/jugadores/:id/estado` | — | Estado en vivo, valores derivados y semáforo |
| `GET` | `/api/jugadores/:id/historico?desde=&hasta=` | — | Resúmenes de 10 s entre dos fechas |
| `GET` | `/api/jugadores/:id/acwr?fecha=` | — | Ratio de carga aguda / crónica |
| `GET` · `POST` | `/api/jugadores/:id/pauta` | — · médico | Pauta de readaptación activa · crear una nueva |
| `GET` | `/api/alertas?estado=&jugadorId=` | — | Alertas, de la más reciente a la más antigua |
| `POST` | `/api/alertas/:id/confirmar` | médico | El médico confirma una alerta |
| `GET` · `POST` | `/api/sesiones` | — · médico | Lista de sesiones · empezar una |
| `GET` | `/api/sesiones/:id` | — | Una sesión con su resumen por jugador |
| `POST` | `/api/sesiones/:id/fin` | médico | Cerrar la sesión y guardar el resumen |
| `GET` · `POST` | `/api/clima` | — · pasarela | Último clima · guardar el de Open-Meteo |
| `GET` | `/fhir/Observation?patient=&code=` | — | Constantes vitales en FHIR R4 |
| `GET` | `/fhir/Observation/:id` | — | Una Observation |
| `GET` | `/health` | — | Estado de la API, de MongoDB y del broker |

**Errores.** Todas las rutas responden `{"error": "mensaje"}` con su código: `400` (cuerpo o parámetros no válidos, con el campo que falla), `401` (falta la clave o no es válida), `403` (la clave no tiene ese rol), `404`, `409` (ya existe, ya está confirmada o ya hay una sesión abierta) y `503` (MongoDB no disponible). Las rutas FHIR devuelven los errores como `OperationOutcome`, que es lo que espera un cliente FHIR.

### 5.3 El lote de telemetría

La pasarela de Node-RED junta cada segundo lo que el simulador ha publicado por MQTT y lo manda en un solo `POST`. **La API no traduce nada:** cada bloque de `sensors` es el payload que el simulador publica en `<jugador>/sensors/<sensor>`, con el formato `{unit, value}`.

```json
{
  "ts": "2026-11-12T18:30:05.000Z",
  "lecturas": [
    { "jugadorId": "p8", "estado": "ok", "sensors": {
        "gps": { "speed": { "unit": "km/h", "value": 28.7 }, "distancecovered": { "unit": "m", "value": 7842 },
                 "position": { "X": { "unit": "m", "value": 52.3 }, "Y": { "unit": "m", "value": 30.1 } } },
        "accelerometer": { "acceleration": { "unit": "m/s2", "value": 3.7 }, "desacceleration": { "unit": "m/s2", "value": 0 } },
        "pulsemeter": { "pulse": { "unit": "bpm", "value": 181 } },
        "pressuresensor": { "pressureleftfoot": { "unit": "%", "value": 42 }, "pressurerightfoot": { "unit": "%", "value": 58 } } } },
    { "jugadorId": "p10", "estado": "sin_senal" }
  ]
}
```

La validación (`services/validacion.js`) comprueba cada medida, su unidad y su rango (una velocidad en m/s en vez de km/h se rechaza) y, si algo falla, rechaza el lote entero indicando la lectura y el campo: `lecturas[3]: sensors.pulsemeter.pulse.value debe ser un número`. Las lecturas de jugadores que no existen se descartan y se indican en la respuesta: `{"recibidas": 10, "ignoradas": ["p12"]}`.

### 5.4 Cómo invocarla

**Desde Swagger UI.** En `/api-docs`, el botón *Authorize* pide la `x-api-key` (la del médico o la de la pasarela, que están en el `.env`) y cada operación se puede probar con *Try it out → Execute*. *Figura 5.3 — Swagger UI* (`informe/capturas/swagger.png`).

**Desde Postman.** `docs/postman_collection.json` tiene 38 peticiones en 10 carpetas (una por recurso más una de errores). Las claves se ponen en el *Current value* de las variables `claveMedico` y `clavePasarela`, así que no se guardan en el archivo. Las peticiones encadenan datos entre sí (al empezar una sesión se guarda su id para cerrarla después) y cada una comprueba su código de respuesta, de modo que la colección entera se puede lanzar con el *Collection Runner*. *Figura 5.4 — Postman* (`informe/capturas/postman.png`).

**Con curl** (en PowerShell, `curl.exe`):

```bash
# Estado en vivo de un jugador (no pide clave)
curl http://localhost:3000/api/jugadores/p8/estado

# El médico confirma una alerta
curl -X POST http://localhost:3000/api/alertas/6733f0c2a1b2c3d4e5f60718/confirmar \
     -H "Content-Type: application/json" -H "x-api-key: <API_KEY_MEDICO>" \
     -d '{"por": "Dra. Pérez", "nota": "Retirado a la banda, hidratación"}'

# Frecuencia cardiaca en FHIR
curl "http://localhost:3000/fhir/Observation?patient=p8&code=8867-4&_count=5"
```

**Desde un cliente web** (`fetch` para REST y `WebSocket` para el tiempo real):

```js
const estado = await fetch('http://localhost:3000/api/jugadores/p8/estado').then(r => r.json());

const ws = new WebSocket('ws://localhost:3000');
ws.onmessage = function (e) {
    const msg = JSON.parse(e.data);
    if (msg.tipo === 'telemetria') pintarCampo(msg.jugadores);   // 1 Hz
    if (msg.tipo === 'alerta') avisar(msg.alerta);                // al momento
};
```

---

## 6. Motor de alertas

### 6.1 Cómo funciona

Cada segundo, por cada jugador del lote:

1. **Estado en vivo** (`services/estado.js`). Se guardan en memoria sus últimos sensores, un historial de 180 s y unos valores derivados: % de la FC máxima, zona de FC (Z1–Z5), zona de velocidad (andar, trote, carrera, alta intensidad, sprint) y asimetría de carga entre pies. También se acumulan los datos de la sesión: distancia, metros a alta intensidad (más de 19,8 km/h), sprints (más de 25 km/h) y acciones de alta intensidad (más de 3 m/s²).
2. **Reglas** (`services/reglas.js`). Diez funciones puras que reciben el estado del jugador, su perfil (con sus umbrales), su pauta y el último clima, y devuelven la alerta o nada.
3. **Antirrebote** (`services/alertas.js`). Una alerta no se repite para el mismo jugador mientras siga activa, ni durante los 60 s siguientes a que el médico la confirme.
4. **Difusión.** Cada alerta nueva se guarda en MongoDB, se publica por MQTT en `sensors/eq1/alertas` con QoS 1 (la recibe el Dashboard 2.0) y se envía por WebSocket a la web.

El **semáforo** de cada jugador sale de sus alertas activas: rojo si alguna es crítica, ámbar si hay algún aviso y verde si no hay ninguna. Las alertas no se cierran solas: siguen activas hasta que el médico las confirma.

### 6.2 Reglas y umbrales

Los umbrales son valores por defecto. Cada jugador guarda su propia copia, que el médico ajusta con `PUT /api/jugadores/:id/umbrales`.

| Código | Se dispara cuando… | Por defecto | Severidad |
|---|---|---|---|
| `CALOR_AMBAR` | Temperatura interna ≥ `tempAmbar` | 39 °C | aviso |
| `CALOR_ROJA` | Temperatura interna ≥ `tempRoja` | 40 °C | crítica |
| *(ajuste por clima)* | Con WBGT ≥ `wbgtAlto`, los dos umbrales de calor bajan `ajusteCalor` | 28 °C · 0,3 °C | — |
| `FC_ALTA` | FC por encima del `fcAltaPct` % de la FCmáx durante `fcAltaSeg` | 92 % · 60 s | aviso |
| `FC_DESACOPLE` | FC por encima del 85 % de la FCmáx caminando (menos de 7 km/h) durante 30 s | 85 % · 7 km/h · 30 s | aviso |
| `RECUPERACION_LENTA` | Tras un esfuerzo (de más de 19,8 a menos de 7 km/h), la FC baja 12 lpm o menos en 60 s | 12 lpm | aviso |
| `INCIDENTE` | Impacto ≥ 4 g, inmóvil 10 s y luego FC anómala (menos de 50 lpm o más del 95 % de la FCmáx) o sin señal | 4 g · 10 s | crítica |
| `SOBRECARGA` | Aceleraciones + desaceleraciones de más de 3 m/s² en la sesión por encima del límite | 120 | aviso |
| `ASIMETRIA` | \|media de (izq − der) en 60 s\| supera la asimetría base del jugador en más del umbral (con al menos 45 s de datos) | 15 puntos | aviso |
| `PAUTA_EXCEDIDA` | Con pauta activa: velocidad > `velMax`, metros a alta intensidad de la sesión > `cargaMax` o asimetría > `asimetriaMax` | los fija el médico | aviso |
| `SIN_SENAL` | El watchdog de la pasarela lleva 5 s sin datos del jugador | 5 s | aviso |

**WBGT.** Si el flujo de Open-Meteo manda temperatura y humedad pero no el WBGT, la API lo estima con la fórmula de la Oficina de Meteorología de Australia para la sombra: `WBGT ≈ 0,567·T + 0,393·e + 3,94`, con `e = (HR/100)·6,105·exp(17,27·T/(237,7+T))`. Con 30 °C y 50 % de humedad da 29,3 °C.

### 6.3 De dónde salen los umbrales

- **Calor.** En partidos con calor, el pico medio de temperatura interna fue de 39,2 °C (rango 37,9–40,1 °C). Por encima de 39 °C empeora el sprint repetido, y 40 °C es el criterio clínico de golpe de calor. FIFA obliga a pausas de hidratación con WBGT ≥ 32 °C y FIFPRO las pide desde 28 °C. El ajuste de 0,3 °C es una decisión nuestra.
- **Recuperación de la FC.** Una caída de 12 lpm o menos en el primer minuto tras el esfuerzo se asoció a más mortalidad en una cohorte clínica de 2.428 adultos (Cole et al., 1999). Aquí es un indicador, no un diagnóstico.
- **Aceleraciones.** ±3 m/s² mantenidos 0,5 s es el umbral habitual de alta intensidad (STATSports, SciSports). A 1 Hz, un valor de más de 3 m/s² es un cambio de velocidad mantenido todo el segundo. En partidos de academia de élite se han registrado hasta 46 aceleraciones y 73 desaceleraciones de alta intensidad; de ahí el límite de 120 por sesión.
- **Asimetría.** No hay un umbral validado, por eso se compara con la línea base de cada jugador. Se usa la **media con signo** del último minuto: en cada pisada la carga pasa de un pie al otro y una lectura suelta puede marcar 20 o 30 puntos aunque el jugador esté bien; con la media esas alternancias se compensan y queda solo el desequilibrio que se mantiene.
- **ACWR.** Carga de los últimos 7 días entre la media semanal de 28 (Gabbett, 2016): por debajo de 0,8 la carga es baja, entre 0,8 y 1,3 está en la "zona óptima" y por encima de 1,3 sube el riesgo. Es una referencia discutida (Impellizzeri et al., 2020), así que la usamos para vigilar picos de carga, no para predecir lesiones.

### 6.4 Calibración con el simulador

Con el simulador de 11 jugadores de la Persona A, dos reglas saltaban en falso y se ajustaron con medidas, no a ojo (detalle en la sección 10):

- **`SOBRECARGA`** saltaba en todos los jugadores de campo a partir del minuto 33. El simulador limita la frenada a 3,0 m/s² justos y frena siempre a tope, así que con "3 o más" cada parada contaba como alta intensidad: de 2.811 frenadas altas, 2.787 eran exactamente 3,0. Ahora se cuentan las de **más** de 3 m/s².
- **`ASIMETRIA`** saltaba al arrancar (con una sola lectura, la "media" es una pisada) y, de vez en cuando, al moverse de lado (la media de un minuto llegó a 17,4 puntos en 2 horas). Ahora hacen falta 45 s de datos y el umbral pasa de 10 a 15 puntos.

Después de los ajustes, en tres partidos simulados de 2 horas con los 11 jugadores no saltó ninguna alerta falsa, y los escenarios de prueba (calor, FC alta, desacople, recuperación lenta, incidente, asimetría, sin señal y pauta excedida) siguen disparando sus alertas.

---

## 7. Base de datos, WebSockets y FHIR

### 7.1 MongoDB

MongoDB 8 en Docker (`docker-compose.yml`), con Mongoose. **No se guarda cada mensaje:** un partido de 90 minutos con 11 jugadores son **356.400 mensajes MQTT** (6 por jugador y segundo). La API guarda **un resumen cada 10 s por jugador**, unos 5.940 documentos por partido, y el último valor de cada sensor se mantiene en memoria para el tiempo real.

| Colección | Qué guarda | Notas |
|---|---|---|
| `jugadores` | Perfil médico con id seudónimo (`p1`…`p11`), posición, FCmáx, temperatura basal, asimetría base y sus umbrales | Nunca nombres |
| `lecturas` | Resumen de 10 s por jugador: velocidad media y máxima, metros, metros a alta intensidad, FC media y máxima, temperatura, asimetría, sprints, acciones altas y posición | **Colección time-series** (`timeField: ts`, `metaField: jugadorId`) |
| `eventos` | Sprints, aceleraciones y desaceleraciones altas, cambios de dirección e impactos | Para el informe del partido |
| `alertas` | Cada alerta, con su valor, su umbral, su mensaje y quién la confirmó y cuándo | |
| `pautas` | Pautas de readaptación (velocidad máxima, carga por sesión, asimetría máxima, hasta cuándo) | Una activa por jugador |
| `sesiones` | Entrenamientos y partidos con el resumen de cada jugador al cerrarlos | Base del ACWR |
| `clima` | Temperatura, humedad y WBGT (medido o estimado) | |

**Por qué time-series.** Las lecturas son medidas en el tiempo de muchos jugadores: MongoDB las agrupa por jugador y por tiempo, ocupan menos y las consultas por rango de fechas (el histórico de la ficha) son más rápidas.

**Tolerancia a reinicios.** Lo que está en memoria se reconstruye: al conectar con MongoDB, la API recupera las alertas activas (para el semáforo y el antirrebote) y la sesión abierta, y sincroniza las alertas cada 30 s. El resumen de una sesión se calcula en MongoDB a partir de las lecturas que llevan su `sesionId`, así que un reinicio a mitad de sesión solo pierde la ventana de 10 s en curso.

*Figura 7.1 — Las colecciones en MongoDB Compass* (`informe/capturas/compass.png`).

### 7.2 WebSocket

El servidor WebSocket comparte puerto con la API (`ws://localhost:3000`) y solo envía, del servidor al cliente:

| `tipo` | Contenido | Cuándo |
|---|---|---|
| `telemetria` | Los 11 jugadores: estado, semáforo, sensores y valores derivados | Cada segundo |
| `alerta` | La alerta completa | Al momento |
| `alerta_confirmada` | Id de la alerta | Al momento |
| `sesion_iniciada` · `sesion_cerrada` | La sesión (con el resumen al cerrarla) | Al momento |
| `clima` | El registro de clima | Cada vez que llega |

REST sirve para consultar y modificar; el WebSocket evita que la web tenga que preguntar cada segundo y hace que una alerta aparezca en cuanto se genera.

### 7.3 FHIR

`GET /fhir/Observation` expone las constantes vitales como recursos **FHIR R4 `Observation`** de categoría `vital-signs`, dentro de un `Bundle` de tipo `searchset`. Salen de los resúmenes de 10 s:

- **Frecuencia cardiaca:** LOINC `8867-4` (*Heart rate*), la media de los 10 s, en `/min`.
- **Temperatura corporal:** LOINC `8310-5` (*Body temperature*), la última lectura de los 10 s, en `Cel` (unidades UCUM).

```json
{
  "resourceType": "Observation", "id": "p8-8867-4-1794500000000", "status": "final",
  "category": [{ "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "vital-signs" }] }],
  "code": { "coding": [{ "system": "http://loinc.org", "code": "8867-4", "display": "Heart rate" }] },
  "subject": { "reference": "Patient/p8" },
  "effectiveDateTime": "2026-11-12T18:30:00.000Z",
  "valueQuantity": { "value": 172, "unit": "/min", "system": "http://unitsofmeasure.org", "code": "/min" },
  "method": { "text": "Media de 10 s del pulsómetro del wearable" }
}
```

El paciente es el seudónimo (`Patient/p8`); cada Observation tiene un id estable y se puede pedir por él; la respuesta es `application/fhir+json`, y los errores, `OperationOutcome`. **Limitaciones:** no es un servidor FHIR completo (no hay recurso `Patient`, solo se busca por paciente y código) y la temperatura interna es simulada: en la realidad se mide con una cápsula ingerible o se estima a partir de la FC (ECTemp, Buller et al., 2013).

*Figura 7.2 — Respuesta de `/fhir/Observation`* (`informe/capturas/fhir.png`).

---

## 9. Privacidad y seguridad (parte de la API)

Los datos de la plataforma (frecuencia cardiaca, temperatura interna, lesiones y pautas) son **datos de salud**, una categoría especial según el **artículo 9 del RGPD**. Las medidas de la API:

- **Seudonimización y minimización.** Los jugadores se identifican solo con `p1`…`p11`, igual que en los topics MQTT; no se guarda ningún nombre. Se guardan resúmenes de 10 s y no la señal completa.
- **Autenticación por API key con dos roles** (cabecera `x-api-key`, `middleware/clave.js`): la clave de la **pasarela** solo puede mandar telemetría y clima; la del **médico** es la única que escribe datos clínicos (perfiles, umbrales, pautas, confirmaciones y sesiones). Una clave válida usada en una operación que no le corresponde recibe `403`.
- **Comparación en tiempo constante.** Las claves se comparan con `crypto.timingSafeEqual` sobre su hash SHA-256, para no dar pistas por el tiempo de respuesta.
- **Secretos fuera del repositorio.** Claves de la API y contraseñas de Mosquitto en el `.env` (en `.gitignore`); en los flujos de Node-RED solo aparecen `${NODERED_MQTT_USER}` y `${NODERED_MQTT_PASS}`, y en Postman las claves van en el *Current value*, que no se exporta.
- **Mínimo privilegio en el broker.** El usuario `api` de Mosquitto solo puede escribir en `sensors/+/alertas` (la ACL de la Persona A).
- **Validación estricta de la entrada** (tipos, unidades, rangos y tamaño del lote) y errores sin detalles internos: un fallo inesperado responde "Error interno".

**Limitaciones conocidas** (es un entorno de desarrollo): los `GET` no piden clave; no hay HTTPS ni TLS en MQTT; las claves son por rol y no por usuario, así que no queda registrado qué médico hizo cada cosa (salvo el campo `por` al confirmar una alerta); no hay límite de peticiones. En producción harían falta HTTPS, autenticación por usuario (por ejemplo OAuth 2.0 / OpenID Connect), clave también para leer, registro de accesos y cifrado de la base de datos.

---

## 10. Pruebas (parte de la API)

- **Tests automáticos:** 59 tests con `node:test` (`npm test`) sobre las partes puras: validación del lote, estado en vivo y resúmenes de 10 s, métricas, las 10 reglas y el antirrebote, ACWR, estimación del WBGT y conversión a FHIR.
- **Colección de Postman:** las 38 peticiones pasan con el *Collection Runner*, incluidos los errores esperados (400, 401, 403, 404 y 409).
- **Escenarios:** `api/scripts/fake-gateway.js` imita la pasarela con escenarios activables por jugador (golpe de calor, FC alta, desacople, recuperación lenta, incidente, asimetría, sin señal y sobrecarga). En 100 s saltan 9 de las 10 alertas; `SOBRECARGA` necesita más tiempo o bajar su umbral.
- **Integración con el simulador de A:** se ejecutó el simulador real de 11 jugadores, segundo a segundo, a través de la pasarela y de la validación y el motor de alertas de la API. En un partido de 90 minutos (356.400 mensajes, 5.400 lotes) la API no rechazó ningún lote. Esta prueba destapó los dos ajustes de la sección 6.4; después de hacerlos, tres partidos de 2 horas sin ninguna alerta falsa.
- **De extremo a extremo:** Mosquitto con usuarios y ACL → simulador y pasarela en Node-RED → API → MongoDB, comprobado con los 11 jugadores llegando en tiempo real y `/health` con MongoDB y MQTT conectados.

---

## Fuentes

- Cole, C. R. et al. (1999). Heart-rate recovery immediately after exercise as a predictor of mortality. *NEJM*. https://pubmed.ncbi.nlm.nih.gov/10536127/
- Temperatura interna en futbolistas con calor: https://opus.lib.uts.edu.au/bitstream/10453/191965/2/PIIS1440244025005377.pdf
- Revisión sobre temperatura interna en competición: https://www.termedia.pl/Core-body-temperature-responses-during-competitive-sporting-events-a-narrative-review,78,50091,1,1.html
- FIFPRO, calor extremo en el fútbol: https://www.fifpro.org/articles/2021/07/extreme-weather-in-football
- STATSports, aceleraciones y desaceleraciones: https://statsports.com/the-locker/maximum-acceleration-and-decelerations-significance-for-an-athletes-physical-development
- SciSports, glosario de variables físicas: https://support.scisports.com/en/articles/4476826-physical-variables-glossary
- Plantillas instrumentadas y asimetría: https://pmc.ncbi.nlm.nih.gov/articles/PMC9208063
- Buller, M. et al. ECTemp: https://nrt.org/sites/58/files/RT%20PSI%20Assessment%20-%20M.%20Buller.pdf
- Gabbett, T. J. (2016). The training-injury prevention paradox. *BJSM*.
- Impellizzeri, F. M. et al. (2020). Acute:chronic workload ratio: conceptual issues and fundamental pitfalls. *IJSPP*.
- HL7 FHIR R4, Observation: https://hl7.org/fhir/R4/observation.html · LOINC: https://loinc.org
