# Chuleta para la defensa

> Los dos tenemos que poder explicar todo el proyecto. Respuestas cortas, con el porqué.

## Arquitectura

**¿Cómo viaja un dato?** Simulador (Node-RED) → MQTT `p1/sensors/gps`… → Mosquitto → pasarela (Node-RED) junta un lote por segundo → `POST /api/telemetria` → la API valida, actualiza el estado en vivo, evalúa las reglas, guarda resúmenes en MongoDB → alertas por MQTT (`sensors/eq1/alertas`) al dashboard y por WebSocket a la web.

**¿Por qué la pasarela hace POST en vez de que Express se suscriba al broker?**
- Separa responsabilidades: Node-RED es la capa de edge y la API no depende del formato de cada topic.
- La pasarela junta 55 topics por segundo en un solo lote: una petición por segundo en vez de 66 mensajes sueltos.
- El watchdog de "sin señal" está donde están los datos.
- La API se puede probar sin broker (Postman, Swagger).

**¿Por qué QoS 1 en las alertas y QoS 0 en la telemetría?** Una lectura perdida da igual: llega otra en un segundo. Una alerta perdida no: QoS 1 garantiza que llega al menos una vez (puede llegar repetida, y el dashboard la identifica por su id). QoS 2 (exactamente una vez) añade dos idas y vueltas más que aquí no hacen falta.

**¿Qué pasa si se cae el broker?** mqtt.js reconecta solo cada 5 s y guarda en cola las alertas QoS 1 hasta que vuelve. Mientras tanto no llega telemetría: la pasarela no manda lotes y la API cierra las ventanas abiertas a los 15 s. Al volver, sigue como si nada. `/health` dice si MQTT está conectado.

**¿Y si se cae la API?** Al arrancar recupera de MongoDB las alertas activas y la sesión abierta; solo se pierde la ventana de 10 s en curso.

**¿Por qué no guardamos todos los mensajes?** Un partido son 356.400 mensajes. Guardamos un resumen cada 10 s por jugador (unos 5.940 documentos) en una colección time-series; el último valor de cada sensor vive en memoria para el tiempo real.

## MQTT y Mosquitto (parte de A)

- **QoS:** 0 = como mucho una vez (sin confirmación), 1 = al menos una vez (PUBACK), 2 = exactamente una vez (cuatro pasos).
- **Retain:** el broker guarda el último mensaje de un topic y se lo da a quien se suscribe después. Útil para estados ("el simulador está vivo"), no para alertas, que no deben repetirse a cada suscriptor nuevo.
- **LWT (last will):** mensaje que el broker publica en nombre de un cliente si este se desconecta sin avisar. No lo usamos: va por conexión, no por jugador; por eso la caída de un sensor concreto la detecta el watchdog de la pasarela (5 s sin datos → `sin_senal`).
- **Comodines:** `+` es un nivel (`+/sensors/#` = cualquier jugador); `#` es el resto del topic y va al final.
- **Seguridad del broker:** `allow_anonymous false`, usuarios con contraseña (`passwd`, con hash) y ACL: `nodered` lee y escribe `sensors/#`, `+/sensors/#` y `equipo/#`, y solo lee `control/#`; `api` solo puede escribir en `sensors/+/alertas` y `control/#`.

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
- **Control del simulador:** el dashboard de simulación (lo hace A) llama a `PUT /api/simulador/jugadores/p8/sensores` con `{"temperature": 40.5, "durationSeconds": 60}` (o a `POST /api/simulador/fase`); la API publica la orden en `control/jugadores/p8/sensores` con QoS 1 y el simulador la recibe con un `mqtt in`. Durante esos 60 s, p8 publica 40,5 °C y salta `CALOR_ROJA`; luego vuelve solo a su valor simulado. Responde `202` (la orden está en el broker, no hace falta esperar al simulador), `400` con el rango o la lista de fases válidas y `503` sin MQTT. No pide clave ni MongoDB: no toca datos clínicos.
- **¿Por qué se fuerza la lectura y no el estado del jugador?** No hay que tocar las funciones de los 11 jugadores: un nodo cambia el valor del sensor justo antes de publicarlo, y el resto de sensores y jugadores siguen igual.
- **¿Por qué de 35 a 42 °C y no hasta 39 como la simulación normal?** Con 39 °C de máximo nunca saltaría `CALOR_ROJA` (40 °C); y más allá de 45 °C la validación de la API rechazaría el lote.
- **¿Por qué la API publica en vez de que el dashboard hable con el broker?** El navegador no habla MQTT por TCP (haría falta MQTT sobre WebSocket y abrir el broker); así la orden se valida en un solo sitio y el broker sigue cerrado con su ACL.
- **WebSocket:** el mismo puerto que la API; la telemetría a 1 Hz y las alertas al momento, para que la web no tenga que preguntar cada segundo.
- **Seguridad:** `x-api-key` con dos roles (pasarela y médico) comparadas en tiempo constante; datos de salud (art. 9 del RGPD) con seudónimos y resúmenes. El dashboard médico trae la clave del médico ya puesta (la API la sirve en `/medico-config.js` desde el `.env`) para que la demo vaya seguida: quien abra `/medico.html` actúa como médico, así que esa página no se comparte fuera. Limitaciones: GET sin clave, sin HTTPS, claves por rol y no por usuario, y la clave del médico precargada en su página.
- **¿Por qué el equipo arranca en verde?** El seed no carga ninguna pauta. Antes p5 tenía una de 22 km/h y, como un central llega a 25 km/h, `PAUTA_EXCEDIDA` saltaba sola al minuto. La pauta de la demo se la pone el médico a p8.
- **Pruebas:** 69 tests con `node:test`, colección de Postman con tests (47 peticiones), el simulador de A pasado por la pasarela y la API, y las órdenes de `/api/simulador` comprobadas con Mosquitto y la ACL.
