# Contrato de la API REST

> **Versión 2.0 (jueves 12 de noviembre).** Adaptada al formato del simulador de A. Cualquier cambio posterior se acuerda entre los dos y se apunta en el registro de cambios del final.
>
> **Acuerdos con la pasarela de A:**
> - un lote por segundo con la forma `{ts, lecturas:[...]}`;
> - cada lectura lleva los sensores del jugador **tal y como los publica el simulador por MQTT** (`p1/sensors/gps`…, con `{unit, value}`), agrupados en `sensors`, igual que en `valores.json`. La pasarela solo tiene que juntar los mensajes de cada jugador;
> - si el watchdog lleva 5 s sin datos de un jugador, su lectura va como `{jugadorId, ts, estado:"sin_senal"}` dentro del mismo lote;
> - la pasarela manda la clave en la cabecera `x-api-key`.

## Generalidades

- **URL base:** `http://localhost:3000`
- **Formato:** JSON en peticiones y respuestas (`Content-Type: application/json`). Las fechas van en ISO 8601 UTC (`2026-11-12T18:30:05.000Z`).
- **Identificadores de jugador:** seudónimos `p1` … `p11`, los mismos que el simulador usa en los topics (`p1/sensors/...`). Nunca se usan nombres.
- **Autenticación:** cabecera `x-api-key`.
  - `API_KEY_PASARELA`: solo para `POST /api/telemetria` y `POST /api/clima` (la usa Node-RED).
  - `API_KEY_MEDICO`: para todo lo que escribe datos clínicos (jugadores, umbrales, pautas, confirmar alertas, sesiones).
  - Los `GET` no piden clave en esta versión. Es una limitación conocida y se explica en el informe.
- **Errores:** `{"error": "mensaje"}` con el código HTTP correspondiente.
  - `400` cuerpo inválido
  - `401` falta la clave o no es válida
  - `403` la clave no tiene permiso para esa operación
  - `404` no existe
  - `409` ya existe (id o dorsal repetido)
  - `503` MongoDB no está disponible

## Telemetría (pasarela → API)

### `POST /api/telemetria`

Un lote por segundo con la última lectura de cada jugador. Clave: `API_KEY_PASARELA`.

```json
{
  "ts": "2026-11-12T18:30:05.000Z",
  "lecturas": [
    {
      "jugadorId": "p8",
      "ts": "2026-11-12T18:30:05.000Z",
      "estado": "ok",
      "sensors": {
        "gps": {
          "speed": { "unit": "km/h", "value": 28.7 },
          "distancecovered": { "unit": "m", "value": 7842 },
          "position": { "X": { "unit": "m", "value": 52.3 }, "Y": { "unit": "m", "value": 30.1 } }
        },
        "accelerometer": {
          "acceleration": { "unit": "m/s2", "value": 3.7 },
          "desacceleration": { "unit": "m/s2", "value": 0 },
          "impact": { "unit": "g", "value": 1.2 }
        },
        "giroscope": { "changeinposition": { "unit": "degrees", "value": -72 } },
        "pulsemeter": { "pulse": { "unit": "bpm", "value": 181 } },
        "termometer": { "temperature": { "unit": "C", "value": 38.1 } },
        "pressuresensor": {
          "pressureleftfoot": { "unit": "%", "value": 42 },
          "pressurerightfoot": { "unit": "%", "value": 58 }
        }
      }
    },
    { "jugadorId": "p10", "ts": "2026-11-12T18:30:05.000Z", "estado": "sin_senal" }
  ]
}
```

Cada bloque de `sensors` es el payload que el simulador publica en `<jugadorId>/sensors/<sensor>`. **La pasarela no tiene que traducir nada:** el resto del topic, después de `sensors/`, es la ruta dentro de `sensors`. Por ejemplo:
- `p1/sensors/gps` con `{speed, distancecovered, position}` va a `sensors.gps`;
- `p1/sensors/termometer/temperature` con `{unit, value}` va a `sensors.termometer.temperature`.

La API guarda y usa los sensores en este mismo formato, sin convertirlos a otro.

| Campo | Unidad | Notas |
|---|---|---|
| `estado` | `ok` \| `sin_senal` | `sin_senal` lo pone el watchdog de la pasarela (5 s sin datos). En ese caso no van más campos |
| `gps.position.X`, `gps.position.Y` | m | Posición en el campo, de 0 a 105 y de 0 a 68 |
| `gps.speed` | km/h | Velocidad |
| `gps.distancecovered` | m | Distancia acumulada en la sesión |
| `accelerometer.acceleration`, `accelerometer.desacceleration` | m/s² | Cambio de velocidad en el último segundo. Las dos en positivo |
| `accelerometer.impact` | g | Pico de impacto del último segundo. **Opcional**, pero sin él no salta la alerta `INCIDENTE` |
| `giroscope.changeinposition` | grados | Giro del último segundo, con signo. **Opcional** (si no viene, 0) |
| `pulsemeter.pulse` | lpm | Frecuencia cardiaca |
| `termometer.temperature` | °C | Temperatura interna. **Opcional** |
| `pressuresensor.pressureleftfoot`, `pressurerightfoot` | % | Reparto de carga entre los pies (suman 100). **Opcional** |

- `gps`, `accelerometer` y `pulsemeter` son obligatorios en cada lectura con `estado: "ok"`.
- `unit` puede omitirse; si viene, tiene que ser la de la tabla (así se detecta, por ejemplo, una velocidad en m/s).
- `equipo` en el lote es opcional; si viene, tiene que ser el del `.env` (`eq1`).
- Las **acciones de alta intensidad** las cuenta la API: una lectura con `acceleration` o `desacceleration` de 3 m/s² o más es una aceleración o desaceleración alta. A 1 Hz, ese valor es un cambio de velocidad mantenido durante todo el segundo, así que cumple el criterio de ±3 m/s² durante 0,5 s.

**Respuesta `202`:** `{"recibidas": 11}`

- Si alguna lectura es de un jugador que no está dado de alta, se descarta y la respuesta lo indica: `{"recibidas": 10, "ignoradas": ["p12"]}`.
- Si el lote no cumple el formato, se rechaza entero con `400`, indicando la lectura y el campo: `{"error": "lecturas[3]: sensors.pulsemeter.pulse.value debe ser un número"}`.
- Los campos que no están en esta tabla se ignoran.

## Jugadores y perfil médico

### `GET /api/jugadores`
Lista de jugadores con su perfil.

### `GET /api/jugadores/:id`
```json
{
  "id": "p8", "dorsal": 10, "posicion": "MC",
  "fcMax": 195, "tempBasal": 37.0, "asimetriaBase": 4,
  "umbrales": { "tempAmbar": 39, "tempRoja": 40, "fcAltaPct": 92 },
  "enReadaptacion": false
}
```

### `POST /api/jugadores` (médico)
Crea un jugador. Cuerpo como el anterior, sin `umbrales` (se rellenan con los valores por defecto). **`201`** con el jugador creado.

### `PUT /api/jugadores/:id` (médico)
Actualiza el perfil. **`200`** con el jugador actualizado.

### `PUT /api/jugadores/:id/umbrales` (médico)
Cambia solo los umbrales indicados. Los nombres están en `alertas.md`.
```json
{ "fcAltaPct": 90, "tempAmbar": 38.8 }
```

### `GET /api/jugadores/:id/estado`
Último estado en vivo y semáforo.
```json
{
  "jugadorId": "p8", "ts": "2026-11-12T18:30:05.000Z",
  "estado": "ok",
  "semaforo": "ambar",
  "sensors": { "gps": { … }, "accelerometer": { … }, "giroscope": { … }, "pulsemeter": { "pulse": { "unit": "bpm", "value": 181 } }, "termometer": { … }, "pressuresensor": { … } },
  "derivados": { "pctFcMax": 93, "asimetria": 16, "zonaVelocidad": "sprint", "zonaFc": "Z5" },
  "alertasActivas": [ { "id": "…", "codigo": "FC_ALTA", "severidad": "aviso" } ]
}
```
- `estado` es `ok` o `sin_senal`.
- `sensors` son los últimos valores en el formato del simulador de A. La temperatura y las plantillas conservan el último valor recibido.
- `derivados` es lo que calcula la API: `zonaVelocidad` puede ser `andar`, `trote`, `carrera`, `alta` o `sprint`, y `zonaFc` va de `Z1` a `Z5`.
- `derivados.asimetria` es `|media de (izq − der)|` de las plantillas del **último minuto**. En cada pisada la carga pasa de un pie al otro; con la media con signo esas alternancias se compensan y solo queda el desequilibrio que se mantiene.
- Si el jugador todavía no ha mandado datos, `ts`, `estado`, `sensors` y `derivados` valen `null`.

### `GET /api/jugadores/:id/historico?desde=&hasta=`
Resúmenes de 10 s entre dos fechas. Por defecto, los últimos 15 minutos.
```json
[ { "ts": "…", "muestras": 10, "velMedia": 12.4, "velMax": 27.9, "distancia": 34, "distAltaInt": 12, "fcMedia": 172, "fcMax": 181, "temp": 38.1, "asimetria": 15, "sprints": 1, "acelAltas": 1, "decelAltas": 2, "x": 52.3, "y": 30.1, "sesionId": null } ]
```
- `ts` es el inicio de la ventana de 10 s.
- `distancia` y `distAltaInt` son los metros recorridos en la ventana; los segundos son los que pasan de 19,8 km/h.
- `temp` es la última temperatura recibida en la ventana, y `asimetria` es `|media de (pressureleftfoot − pressurerightfoot)|` en la ventana. Pueden ser `null`.
- Los resúmenes no son lecturas de un sensor, sino datos que calcula la API (medias, máximos, metros…), así que tienen sus propios campos.

### `GET /api/jugadores/:id/acwr`
```json
{ "jugadorId": "p8", "cargaAguda": 4200, "cargaCronica": 3800, "ratio": 1.11, "franja": "optima" }
```
`franja` puede ser `baja` (<0,8), `optima` (0,8–1,3) o `alta` (>1,3).

## Pauta de readaptación

### `GET /api/jugadores/:id/pauta`
Pauta activa o `404`.

### `POST /api/jugadores/:id/pauta` (médico)
Crea una pauta y sustituye a la anterior.
```json
{ "velMax": 22, "cargaMax": 600, "asimetriaMax": 8, "hasta": "2026-11-20", "notas": "Vuelta progresiva tras sobrecarga en isquios" }
```
`cargaMax` es la distancia en alta intensidad (m) permitida por sesión. **`201`** con la pauta.

## Alertas

### `GET /api/alertas?estado=activa&jugadorId=p8`
Los dos filtros son opcionales. Ordenadas de más reciente a más antigua. El formato de cada alerta está en `alertas.md`.

### `POST /api/alertas/:id/confirmar` (médico)
```json
{ "por": "Dra. Pérez", "nota": "Retirado a la banda, hidratación" }
```
**`200`** con la alerta en estado `confirmada`, con `confirmadaPor`, `confirmadaEn` y `nota`. Si ya estaba confirmada, **`409`**.

Al confirmarla se envía `{"tipo": "alerta_confirmada"}` por WebSocket y el semáforo del jugador se recalcula.

## Sesiones

| Método | Ruta | Uso |
|---|---|---|
| `POST` | `/api/sesiones` (médico) | `{"tipo": "partido" \| "entrenamiento", "nombre": "J12 vs Cádiz B"}`. **`201`** con `{id, inicio}` |
| `POST` | `/api/sesiones/:id/fin` (médico) | Cierra la sesión y calcula el resumen por jugador |
| `GET` | `/api/sesiones` | Lista de sesiones con su resumen |

## Clima (Open-Meteo → Node-RED → API)

### `POST /api/clima` (pasarela)
```json
{ "ts": "2026-11-12T18:30:00.000Z", "temp": 31.5, "humedad": 55, "wbgt": 28.9, "fuente": "open-meteo" }
```

### `GET /api/clima`
Último registro.

## FHIR

### `GET /fhir/Observation?patient=p8&code=8867-4`
Devuelve un `Bundle` (`type: searchset`) con `Observation` FHIR R4 de categoría `vital-signs`:
- frecuencia cardiaca: LOINC `8867-4`, unidad UCUM `/min`;
- temperatura corporal: LOINC `8310-5`, unidad UCUM `Cel`.

## Utilidad

### `GET /health`
```json
{ "status": "ok", "mongo": "connected", "mqtt": "connected", "uptime": 123 }
```

## WebSocket

En el mismo puerto que la API (`ws://localhost:3000`). Solo envía, del servidor al cliente:

| `tipo` | Contenido | Frecuencia |
|---|---|---|
| `bienvenida` | `{ "tipo": "bienvenida", "ts": "…" }` | Al conectar |
| `telemetria` | `{ "tipo": "telemetria", "ts": "…", "jugadores": [ { "jugadorId", "ts", "estado", "semaforo", "sensors", "derivados" } ] }`, con `sensors` en el formato de A | 1 Hz |
| `alerta` | `{ "tipo": "alerta", "alerta": { … } }` | Al momento |
| `alerta_confirmada` | `{ "tipo": "alerta_confirmada", "alertaId": "…" }` | Al momento |

## Registro de cambios

| Fecha | Cambio |
|---|---|
| Lun 9 nov | Versión 1.0 cerrada con A |
| Mar 10 nov | Errores `409` y `503`. `POST /api/telemetria` puede devolver `ignoradas`. `GET /estado` incluye `estado`. El histórico añade `muestras`, `distAltaInt` y `sesionId`. En el WebSocket, cada jugador de `telemetria` lleva también `estado`. Nada de esto cambia lo que manda la pasarela |
| Mié 11 nov | `/health` incluye `mqtt`. Confirmar una alerta ya confirmada devuelve `409`. El histórico añade `sprints`. Al crear una pauta, el jugador pasa a `enReadaptacion: true` |
| Jue 12 nov (tarde) | La asimetría pasa a ser la media con signo (en `derivados`, del último minuto; en el histórico, de la ventana de 10 s), no la de una sola lectura, para no confundir las pisadas o los desplazamientos laterales con un desequilibrio |
| Jue 12 nov | **Versión 2.0, adaptada al simulador de A.** Las lecturas llevan `sensors` con el formato de los topics `p1/sensors/<sensor>` (`{unit, value}`). Los ids pasan a `p1`…`p11`. `equipo` es opcional. La API cuenta las acciones de alta intensidad. `impact` y `giroscope` son opcionales. Las alertas se publican en `sensors/<equipo>/alertas`. La API guarda los sensores en este formato, sin traducirlos: `GET /estado` y el WebSocket devuelven `sensors` (formato de A) y `derivados` en lugar de `ultimo` |
