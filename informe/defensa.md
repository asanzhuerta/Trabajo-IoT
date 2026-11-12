# Chuleta para la defensa

> Los dos tenemos que poder explicar todo el proyecto. Respuestas cortas, con el porqué.

## Arquitectura

**¿Cómo viaja un dato?** Simulador (Node-RED) → MQTT `p1/sensors/gps`… → Mosquitto → pasarela (Node-RED) junta un lote por segundo → `POST /api/telemetria` → la API valida, actualiza el estado en vivo, evalúa las reglas, guarda resúmenes en MongoDB → alertas por MQTT (`sensors/eq1/alertas`) al dashboard y por WebSocket a la web.

**¿Por qué la pasarela hace POST en vez de que Express se suscriba al broker?**
- Separa responsabilidades: Node-RED es la capa de edge y la API no depende del formato de cada topic.
- La pasarela junta 55 topics por segundo en un solo lote: una petición por segundo en vez de 66 mensajes sueltos.
- El watchdog de "sin señal" está donde están los datos.
- La API se puede probar sin broker (fake-gateway, Postman).

**¿Por qué QoS 1 en las alertas y QoS 0 en la telemetría?** Una lectura perdida da igual: llega otra en un segundo. Una alerta perdida no: QoS 1 garantiza que llega al menos una vez (puede llegar repetida, y el dashboard la identifica por su id). QoS 2 (exactamente una vez) añade dos idas y vueltas más que aquí no hacen falta.

**¿Qué pasa si se cae el broker?** mqtt.js reconecta solo cada 5 s y guarda en cola las alertas QoS 1 hasta que vuelve. Mientras tanto no llega telemetría: la pasarela no manda lotes y la API cierra las ventanas abiertas a los 15 s. Al volver, sigue como si nada. `/health` dice si MQTT está conectado.

**¿Y si se cae la API?** Al arrancar recupera de MongoDB las alertas activas y la sesión abierta; solo se pierde la ventana de 10 s en curso.

**¿Por qué no guardamos todos los mensajes?** Un partido son 356.400 mensajes. Guardamos un resumen cada 10 s por jugador (unos 5.940 documentos) en una colección time-series; el último valor de cada sensor vive en memoria para el tiempo real.

## MQTT y Mosquitto (parte de A)

- **QoS:** 0 = como mucho una vez (sin confirmación), 1 = al menos una vez (PUBACK), 2 = exactamente una vez (cuatro pasos).
- **Retain:** el broker guarda el último mensaje de un topic y se lo da a quien se suscribe después. Útil para estados ("el simulador está vivo"), no para alertas, que no deben repetirse a cada suscriptor nuevo.
- **LWT (last will):** mensaje que el broker publica en nombre de un cliente si este se desconecta sin avisar. Va por conexión, no por jugador; por eso la caída de un sensor concreto la detecta el watchdog de la pasarela (5 s sin datos → `sin_senal`).
- **Comodines:** `+` es un nivel (`+/sensors/#` = cualquier jugador); `#` es el resto del topic y va al final.
- **Seguridad del broker:** `allow_anonymous false`, usuarios con contraseña (`passwd`, con hash) y ACL: `nodered` lee y escribe `sensors/#` y `+/sensors/#`; `api` solo puede escribir en `sensors/+/alertas`.

## Node-RED (parte de A)

- **Simulador:** por jugador, un `inject` cada segundo → `function` "Movimiento" (un solo estado que alimenta GPS, acelerómetro, giroscopio, pulsómetro y plantillas, con acciones según su posición en el 4-2-3-1) y "Termometro" → `json` → `mqtt out`.
- **Pasarela:** `mqtt in` (`+/sensors/#`) → `function` que guarda cada sensor en su jugador (contexto de flujo) → `inject` cada segundo → `function` que monta el lote y hace de watchdog → `http request` (POST) → `function` que enseña la respuesta en el nodo.
- **Credenciales:** en los nodos solo hay `${NODERED_MQTT_USER}` y `${NODERED_MQTT_PASS}`; se leen del `.env` al arrancar (`node_red/arrancar.js`).
- **Dashboard 2.0** (`@flowfuse/node-red-dashboard`): nodos `ui-*` en `http://localhost:1880/dashboard`.

## API (parte de B)

- **Estructura:** la de clase (`server.js` + `servers/http-server.js` + `servers/websocket.js`), con la lógica en `services/` y los modelos en `models/`.
- **Validación:** se comprueba tipo, unidad y rango de cada medida; un lote con un error se rechaza entero con la lectura y el campo.
- **Motor de alertas:** 10 reglas como funciones puras (fáciles de probar), antirrebote (no se repite mientras está activa ni 60 s después de confirmarla) y semáforo (rojo si hay alguna crítica, ámbar si hay algún aviso).
- **¿Por qué la asimetría es la media del último minuto?** En cada pisada la carga pasa de un pie al otro; una lectura sola puede marcar 30 puntos. Con la media con signo esas alternancias se compensan y queda el desequilibrio mantenido, que es el de una lesión.
- **Calibración:** con el simulador de A, `SOBRECARGA` y `ASIMETRIA` saltaban en falso; se midió en partidos simulados y se ajustó (acciones de más de 3 m/s², asimetría con 15 puntos y 45 s de datos). Detalle en la sección 6.4 del informe.
- **ACWR:** carga de 7 días entre la media semanal de 28, con los metros a alta intensidad de cada sesión. Franja 0,8–1,3 (Gabbett 2016), discutida (Impellizzeri 2020): sirve para ver picos de carga, no para predecir lesiones.
- **FHIR:** `Observation` de `vital-signs` con LOINC 8867-4 (FC) y 8310-5 (temperatura), unidades UCUM, en un `Bundle searchset`; errores como `OperationOutcome`. No es un servidor FHIR completo.
- **WebSocket:** el mismo puerto que la API; la telemetría a 1 Hz y las alertas al momento, para que la web no tenga que preguntar cada segundo.
- **Seguridad:** `x-api-key` con dos roles (pasarela y médico) comparadas en tiempo constante; datos de salud (art. 9 del RGPD) con seudónimos y resúmenes. Limitaciones: GET sin clave, sin HTTPS, claves por rol y no por usuario.
- **Pruebas:** 59 tests con `node:test`, colección de Postman con tests, escenarios con el fake-gateway y el simulador de A pasado por la pasarela y la API.
