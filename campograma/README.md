# Campograma IoT en tiempo real (P1-P11)

## Requisitos

- Node.js 18 o posterior.
- Mosquitto escuchando en `localhost:1883` (protocolo MQTT TCP convencional).
- Node-RED publicando los valores de GPS en `p1/sensors/gps` ... `p11/sensors/gps` (y opcionalmente los otros cinco sensores). La versión táctica también publica `equipo/estado`.

## Arranque (Windows, Linux o macOS)

1. Descomprime esta carpeta.
2. Abre una terminal en la carpeta donde están `index.html`, `server.js` y `package.json`.
3. Ejecuta (sin instalar librerías externas):

   ```bash
   npm start
   ```

   También puedes iniciar directamente con `node server.js`.

4. Abre **http://localhost:3000** en tu navegador.

**IMPORTANTE:** no abras solo el HTML para intentar conectarlo directamente al puerto 1883. El navegador no admite MQTT TCP convencional. `server.js` se conecta al broker en 1883 mediante MQTT 3.1.1 y retransmite las lecturas a la web por WebSocket local (`ws://localhost:3000/stream`). No hace falta modificar Mosquitto ni Node-RED.

## Esquema

```
Node-RED (11 jugadores) --MQTT TCP--> Mosquitto localhost:1883
                                              |
                                     server.js (cliente MQTT)
                                              |
                                    WebSocket localhost:3000
                                              |
                                           index.html
```

## Temas MQTT y JSON esperados

Para cada jugador `N` entre 1 y 11:

- `pN/sensors/gps` -> `{ "speed":{"value":12.3}, "distancecovered":{"value":456}, "position":{"X":{"value":52},"Y":{"value":34}} }`
- `pN/sensors/accelerometer` -> `{ "acceleration":{"value":1.5}, "desacceleration":{"value":0} }`
- `pN/sensors/giroscope` -> `{ "changeinposition":{"value":-15} }`
- `pN/sensors/pulsemeter` -> `{ "pulse":{"value":125} }`
- `pN/sensors/thermometer` -> `{ "temperature":{"unit":"°C","value":37.14} }`
- `pN/sensors/pressuresensor` -> `{ "pressureleftfoot":{"value":55}, "pressurerightfoot":{"value":45} }`
- `equipo/estado` -> fase de juego, posesión, ubicación del balón, jugador con balón, orden de pase y posiciones objetivo de P1-P11.

La versión actual muestra el balón con un marcador blanco, la fase táctica y el poseedor. Se dibuja también una línea discontinua al objetivo del jugador seleccionado, cuando se recibe `equipo/estado`.

Los valores incluyen opcionalmente el campo `unit`. **No** hace falta añadir envolturas `gps`, `accelerometer`, etc., porque el código maestro de Node-RED envía los objetos directamente.

El campo mide 105 x 68 metros; X va de izquierda a derecha y Y=0 se representa **abajo**. Se representan las posiciones iniciales hasta que llegan lecturas, diferenciadas visualmente de las activas. Los jugadores activos tienen una lectura GPS reciente (< 6 segundos). Las demás métricas también se actualizan al recibir cada topic.

## Control de conexión / prueba

- El panel indica el estado del broker y cuántos jugadores están enviando GPS.
- Botón **Modo demostración** para probar el diseño sin Mosquitto. Las lecturas de prueba están claramente etiquetadas como tales.
- Botón **Conectar** para volver a los datos reales.
- Puedes mostrar u ocultar rastros de trayectoria y elegir jugadores sobre el campo o en la lista.

## Configuración opcional

Si Mosquitto está en otra dirección o tiene contraseña, indica variables de entorno antes de arrancar `npm start`:

| Variable | Por defecto | Uso |
|---|---|---|
| `MQTT_HOST` | `127.0.0.1` | Dirección del broker |
| `MQTT_PORT` | `1883` | Puerto TCP MQTT |
| `MQTT_USER` | no establecido | Usuario MQTT |
| `MQTT_PASSWORD` | no establecido | Contraseña MQTT |
| `HTTP_PORT` | `3000` | Puerto de la web |
| `HTTP_HOST` | `127.0.0.1` | Interfaz de escucha (local) |

Ejemplo PowerShell (Windows):

```powershell
$env:MQTT_HOST="127.0.0.1"
$env:MQTT_PORT="1883"
$env:MQTT_USER="usuario"
$env:MQTT_PASSWORD="contraseña"
npm start
```

## Diagnóstico

1. Comprueba si Mosquitto recibe mensajes: `mosquitto_sub -h localhost -p 1883 -t "+/sensors/gps" -v`.
2. Comprueba si el puente ve MQTT: http://localhost:3000/health (debe indicar `mqttConnected:true`).
3. Si ves los jugadores apagados en el campo, revisa que Node-RED publica los datos GPS con el **topic** y **JSON** esperados.
4. En la versión táctica coordinada, importa `FLUJO_IMPORTAR_NODE_RED.json` del paquete principal. Hay un único `Inject` para los once jugadores; desactiva los flujos antiguos independientes para evitar mensajes duplicados.
5. Si los jugadores no se mueven porque se quedaron en una posición inicial, comprueba que el nodo `Inject` está activando el flujo y la conexión está activa.

## Privacidad y alcance

La web se sirve solo en `127.0.0.1` por defecto y no manda datos a servicios externos. La visualización funciona sin CDN ni dependencias NPM; solo necesita Node.js 18 o superior. El modelo es una simulación táctica aproximada: incluye un rival virtual representado solo por el balón y cambios de fase, no simula a los once futbolistas rivales ni leyes del juego de forma completa. No es un sistema de seguimiento físico de precisión.

## Sensor de temperatura (version 6 sensores)

En el panel del jugador seleccionado se muestra la temperatura corporal simulada del topic `pN/sensors/thermometer`. El puente `server.js` actualizado debe estar arrancado para aceptar ese topic. La simulacion y los limites no sirven para monitorizacion sanitaria.
