# Chuleta para la defensa

> Los dos tenemos que poder explicar todo el proyecto. Respuestas cortas, con el porqué.

## Guion de 15 minutos

**Reparto:** diapositivas ~5 min · demo ~7:30 · margen ~2:30 para cambios de pantalla, el QR o un imprevisto.
A = Manuel (simulación, MQTT, Node-RED) · B = Alejandro (API, alertas, datos, seguridad).
Regla: una idea por diapositiva y pasar. Lo que se ve en la demo no se explica en las diapositivas.

**Antes de empezar:** `arrancar-todo.cmd` lanzado y el equipo en verde · devTunnel abierto (que el QR lleve a `control.html`) · pestañas preparadas: campograma, dashboard médico, botonera, Swagger y Postman.

| # | Diapositiva | Quién | Tiempo | Acumulado | Qué decir (lo mínimo) |
|---|---|---|---|---|---|
| 1 | Portada | A | 0:10 | 0:10 | «Smart Health: vigilamos en tiempo real la salud de un equipo de fútbol y avisamos al médico.» |
| 2 | Índice | A | 0:05 | 0:15 | No se lee. Pasar. |
| 3 | El problema | A | 0:25 | 0:40 | Golpe de calor, corazón disparado, golpe fuerte, vuelta de lesión. «Hoy se analiza después; nosotros avisamos al segundo.» |
| 4 | Arquitectura | A | 0:45 | 1:25 | La más importante. Recorrer los números 1→8 con el dedo: sensores por MQTT → pasarela → lote por segundo a la API → reglas y MongoDB → alertas por MQTT y WebSocket → el médico actúa por REST → la botonera manda órdenes al simulador. |
| 5 | Tecnologías y versiones | A | 0:05 | 1:30 | «Estas son las piezas y sus versiones.» No leerlas. Pasar. |
| 6 | Seis sensores | A | 0:15 | 1:45 | «Los seis sensores salen de un único estado de movimiento, así son coherentes: si acelera, sube el pulso. 67 mensajes por segundo.» |
| 7 | Motor táctico | A | 0:15 | 2:00 | «Los 11 se mueven coordinados en un 4-2-3-1: cinco fases de juego y velocidad máxima por rol.» |
| 8 | Dos flujos en Node-RED | A | 0:20 | 2:20 | Simulador y pasarela. «La pasarela convierte 66 mensajes por segundo en una sola petición REST y detecta si un jugador se queda sin señal.» |
| 9 | Topics y QoS | A | 0:25 | 2:45 | «Telemetría con QoS 0: si se pierde una, llega otra al segundo. Alertas y órdenes con QoS 1: tienen que llegar. QoS 2 no hace falta.» |
| 10 | API: carpetas y archivos | B | 0:20 | 3:05 | Señalar los cuatro números (20 operaciones, 16 servicios, 69 tests, 47 peticiones de Postman). «La estructura es la de clase.» Swagger se ve en la demo. |
| 11 | Diez reglas, un semáforo | B | 0:25 | 3:30 | «Cada segundo, 10 reglas por jugador; antirrebote para no repetir avisos; rojo si hay algo crítico, ámbar si es aviso.» |
| 12 | Umbrales y calibración | B | 0:25 | 3:55 | «Los umbrales salen de la literatura. Al conectarlo al simulador saltaban falsas alarmas; lo ajustamos midiendo y quedaron 0.» |
| 13 | Datos | B | 0:20 | 4:15 | «Un partido son 356.400 mensajes; guardamos 5.940 resúmenes. Con ellos calculamos la carga (ACWR).» |
| 14 | Cada canal para lo suyo | B | 0:20 | 4:35 | REST para consultar, WebSocket para empujar al navegador, MQTT entre máquinas. «El navegador nunca habla con el broker.» FHIR se ve en la demo. |
| 15 | Privacidad y seguridad | B | 0:20 | 4:55 | «Datos de salud: seudónimos, broker cerrado con usuarios y ACL, claves por rol.» Las limitaciones, solo señalarlas. |
| 16 | Demo + QR | A | 0:10 | 5:05 | «Escaneen el QR: pueden provocar ustedes el golpe de calor.» Cambiar a la demo. |

**Demo (7:30, hasta ~12:35):**

| Tiempo | Qué se enseña | Quién |
|---|---|---|
| 0:00–0:30 | Campograma: los 11 jugadores moviéndose, todos en verde. | A |
| 0:30–1:30 | Botonera (o el profesor desde el QR): p8 a 39,4 °C → aro ámbar; luego a 40,5 °C → aro rojo. | A |
| 1:30–3:00 | Dashboard médico: aviso «ALERTA CRÍTICA», tarjeta de p8 en rojo, su ficha con la temperatura disparada. | B |
| 3:00–4:30 | El médico pulsa «Enfriar»: la temperatura baja en la gráfica (~40 s) y la alerta se cierra sola. | B |
| 4:30–5:30 | Pauta de readaptación a p8 de 20 km/h → al correr más, salta `PAUTA_EXCEDIDA`. | B |
| 5:30–7:00 | API abierta: Swagger (una operación con Try it out), Postman Collection Runner en verde y la respuesta FHIR. | B |
| 7:00–7:30 | Volver a las diapositivas: «Gracias» (diapositiva 17, 5 s) y preguntas. | A + B |

**Si vamos mal de tiempo:** quitar Postman de la demo (Swagger y FHIR bastan) y dejar las diapositivas 6, 7 y 13 en 10 s cada una.

## Arquitectura

**¿Cómo viaja un dato?** Simulador (Node-RED) → MQTT `p1/sensors/gps`… → Mosquitto → pasarela (Node-RED) junta un lote por segundo → `POST /api/telemetria` → la API valida, actualiza el estado en vivo, evalúa las reglas, guarda resúmenes en MongoDB → alertas por MQTT (`sensors/eq1/alertas`) al dashboard y por WebSocket a la web.

**¿Por qué la pasarela hace POST en vez de que Express se suscriba al broker?**
- Separa responsabilidades: Node-RED es la capa de edge y la API no depende del formato de cada topic.
- La pasarela junta los 66 mensajes por segundo (11 jugadores × 6 sensores) en un solo lote: una petición por segundo en vez de 66 sueltas.
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
- **No hay dashboard en Node-RED:** el dashboard médico, el campograma y la botonera son páginas que sirve la API (`/medico.html`, `/`, `/control.html`). Nodos usados en total: `inject`, `function`, `switch`, `json`, `mqtt in`, `mqtt out`, `http request`, `debug` y `comment`.

## API (parte de B)

- **Estructura:** la de clase (`server.js` + `servers/http-server.js` + `servers/websocket.js`), con la lógica en `services/` y los modelos en `models/`.
- **Validación:** se comprueba tipo, unidad y rango de cada medida; un lote con un error se rechaza entero con la lectura y el campo.
- **Motor de alertas:** 10 reglas como funciones puras (fáciles de probar), antirrebote (no se repite mientras está activa ni 60 s después de confirmarla) y semáforo (rojo si hay alguna crítica, ámbar si hay algún aviso).
- **¿Por qué la asimetría es la media del último minuto?** En cada pisada la carga pasa de un pie al otro; una lectura sola puede marcar 30 puntos. Con la media con signo esas alternancias se compensan y queda el desequilibrio mantenido, que es el de una lesión.
- **Calibración:** con el simulador de A, `SOBRECARGA` y `ASIMETRIA` saltaban en falso; se midió en partidos simulados y se ajustó (acciones de más de 3 m/s², asimetría con 15 puntos y 45 s de datos). Detalle en la sección 6.4 del informe.
- **ACWR:** carga de 7 días entre la media semanal de 28, con los metros a alta intensidad de cada sesión. Franja 0,8–1,3 (Gabbett 2016), discutida (Impellizzeri 2020): sirve para ver picos de carga, no para predecir lesiones.
- **FHIR:** `Observation` de `vital-signs` con LOINC 8867-4 (FC) y 8310-5 (temperatura), unidades UCUM, en un `Bundle searchset`; errores como `OperationOutcome`. No es un servidor FHIR completo.
- **Control del simulador:** la botonera de simulación (`/control.html`) llama a `PUT /api/simulador/jugadores/p8/sensores` con `{"temperature": 40.5, "durationSeconds": 60}` (o a `POST /api/simulador/fase`); la API publica la orden en `control/jugadores/p8/sensores` con QoS 1 y el simulador la recibe con un `mqtt in`. Durante esos 60 s, p8 publica 40,5 °C y salta `CALOR_ROJA`; luego vuelve solo a su valor simulado. Responde `202` (la orden está en el broker, no hace falta esperar al simulador), `400` con el rango o la lista de fases válidas y `503` sin MQTT. No pide clave ni MongoDB: no toca datos clínicos.
- **¿Por qué se fuerza la lectura y no el estado del jugador?** No hay que tocar las funciones de los 11 jugadores: un nodo cambia el valor del sensor justo antes de publicarlo, y el resto de sensores y jugadores siguen igual.
- **¿Por qué de 35 a 42 °C y no hasta 39 como la simulación normal?** Con 39 °C de máximo nunca saltaría `CALOR_ROJA` (40 °C); y más allá de 45 °C la validación de la API rechazaría el lote.
- **¿Por qué la API publica en vez de que el dashboard hable con el broker?** El navegador no habla MQTT por TCP (haría falta MQTT sobre WebSocket y abrir el broker); así la orden se valida en un solo sitio y el broker sigue cerrado con su ACL.
- **WebSocket:** el mismo puerto que la API; la telemetría a 1 Hz y las alertas al momento, para que la web no tenga que preguntar cada segundo.
- **Seguridad:** `x-api-key` con dos roles (pasarela y médico) comparadas en tiempo constante; datos de salud (art. 9 del RGPD) con seudónimos y resúmenes. El dashboard médico trae la clave del médico ya puesta (la API la sirve en `/medico-config.js` desde el `.env`) para que la demo vaya seguida: quien abra `/medico.html` actúa como médico, así que esa página no se comparte fuera. Limitaciones: GET sin clave, sin HTTPS, claves por rol y no por usuario, y la clave del médico precargada en su página.
- **¿Por qué el equipo arranca en verde?** El seed no carga ninguna pauta. Antes p5 tenía una de 22 km/h y, como un central llega a 25 km/h, `PAUTA_EXCEDIDA` saltaba sola al minuto. La pauta de la demo se la pone el médico a p8.
- **Pruebas:** 69 tests con `node:test`, colección de Postman con tests (47 peticiones), el simulador de A pasado por la pasarela y la API, y las órdenes de `/api/simulador` comprobadas con Mosquitto y la ACL.
