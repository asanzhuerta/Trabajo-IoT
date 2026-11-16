# Campograma en tiempo real (P1–P11)

Diseño de la Persona A, adaptado por la Persona B para leer los datos de la **API** (REST + WebSocket) en lugar de conectarse a MQTT. La página la sirve la propia API, así que ya no hace falta el puente `server.js` ni el puerto propio: se abre en la misma dirección que la API.

## Requisitos

- La API arrancada (`npm run dev` en `api/`, o `arrancar-todo.cmd` en la raíz del repo), con MongoDB.
- Para ver datos reales, la cadena completa: el simulador de Node-RED publicando por MQTT y la pasarela mandando los lotes a `POST /api/telemetria`. Sin eso, el campograma muestra las posiciones iniciales o el **modo demostración**.

## Arranque

1. Arranca todo con `arrancar-todo.cmd` (o solo la API con `npm run dev` en `api/`).
2. Abre **http://localhost:3000** en el navegador.

## Esquema

```
Node-RED (simulador, 11 jugadores) --MQTT--> Mosquitto --MQTT--> pasarela (Node-RED)
                                                                      |
                                                       POST /api/telemetria (1 lote/s)
                                                                      |
                                                               API (Express)
                                                         |                     |
                                          WebSocket ws://localhost:3000    REST /api/...
                                                         \                     /
                                                    api/public/index.html (este campograma)
```

## De dónde saca los datos

| Qué | De dónde |
|---|---|
| Posición, velocidad, distancia, FC, temperatura, aceleraciones, giro y plantillas de los 11 jugadores | WebSocket de la API, mensaje `telemetria` cada segundo: los sensores en el formato del simulador (`{unit, value}`) |
| Semáforo de cada jugador (verde, ámbar o rojo) y valores derivados: % de la FC máxima, zona de FC, zona de velocidad y asimetría del último minuto | El mismo mensaje `telemetria` (`semaforo` y `derivados`) |
| Alertas activas | `GET /api/alertas?estado=activa` al conectar y cada 15 s; mensajes `alerta` y `alerta_confirmada` del WebSocket al momento |
| Dorsal, posición y si está en readaptación | `GET /api/jugadores` |
| Estado de MongoDB y MQTT | `GET /health` |
| Pulso y temperatura forzados en el simulador | `GET /api/simulador` y el mensaje `simulador` del WebSocket (los pone el dashboard de simulación de A) |

Formato de los mensajes y de las rutas: `docs/contratos/api.md` y Swagger (`http://localhost:3000/api-docs`).

## Qué muestra

- **El campo** (105 × 68 m; X de izquierda a derecha y Y = 0 abajo), con un círculo por jugador del color de su línea y su **dorsal**. Un aro ámbar indica que tiene algún aviso activo y uno rojo que late, una alerta crítica. Los jugadores sin señal o sin datos de los últimos 6 s aparecen atenuados.
- **El estado del equipo:** cuántos jugadores están en verde, ámbar, rojo o sin señal, y a quién se le está forzando el pulso o la temperatura desde el dashboard de simulación (y cuántos segundos le quedan).
- **El jugador seleccionado:** semáforo, si está en readaptación, velocidad y zona, FC con % de la FC máxima y zona, distancia, posición, temperatura interna, curva de velocidad, reparto de carga entre pies con la asimetría del último minuto, aceleración, desaceleración, giro y sus alertas activas.
- **Las alertas activas** de todo el equipo. Se confirman desde el dashboard de Node-RED o con `POST /api/alertas/:id/confirmar` (Swagger o Postman): la página solo lee, no guarda ninguna clave.

## Controles

- Pulsa un jugador en el campo o en la plantilla para ver su ficha.
- **Nombres** y **Rastro del seleccionado** muestran u ocultan los nombres y la trayectoria.
- **Modo demostración:** datos de prueba generados en el navegador, claramente etiquetados, para ver el diseño sin la API.
- **Conectar:** vuelve a los datos reales.

## Diagnóstico

1. `http://localhost:3000/health` debe responder con `"mongo": "connected"` y `"mqtt": "connected"`.
2. Si los jugadores están atenuados, comprueba que llegan lecturas: `http://localhost:3000/api/jugadores/p1/estado` tiene que traer `sensors` y un `ts` reciente.
3. Si no llegan, revisa la cadena: Mosquitto (`mosquitto_sub -h localhost -u nodered -P <contraseña> -t "+/sensors/#" -v`) y la pasarela en el editor de Node-RED (`http://localhost:1880`).

## Estado táctico integrado

El balón, poseedor, fase, posesión y objetivos del jugador seleccionado llegan por
`equipo/estado` → pasarela → `POST /api/equipo/estado` → WebSocket (`tipo: tactica`).
La API valida los datos y conserva la última situación en memoria. `GET /api/equipo/estado`
devuelve esa situación o `null` antes del primer mensaje. Funciona sin MongoDB.
Al conectar el WebSocket se envían la táctica y los jugadores disponibles en memoria.
Tras 6 segundos sin datos tácticos se ocultan el balón y los objetivos para no mostrar una posición antigua como actual.

Para activar esta conexión, reinicia la API y carga los flujos actualizados de la pasarela
con `node node_red/arrancar.js --reiniciar` desde la raíz. Ese comando respalda primero
los flujos del editor. Configura `API_KEY_PASARELA` y las credenciales de MQTT en `.env`.
Abre `http://localhost:3000`; no hace falta arrancar el servidor de la carpeta de Descargas.

## Privacidad y alcance

La página solo llama a la API de la misma dirección y no usa CDN ni manda datos a servicios externos. Los jugadores aparecen con su seudónimo (`p1`…`p11`), su dorsal y su posición, nunca con su nombre. Los datos son simulados y no sirven para monitorización sanitaria real.
