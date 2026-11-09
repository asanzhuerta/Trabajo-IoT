# Contrato de la API REST

> **Versión 1.0, cerrada el lunes 9 de noviembre.** Cualquier cambio posterior se acuerda entre los dos y se apunta en el registro de cambios del final.
>
> **Acuerdos con la pasarela de A:**
> - un lote por segundo con la forma `{equipo, ts, lecturas:[...]}`;
> - si el watchdog lleva 5 s sin datos de un jugador, su lectura va como `{jugadorId, ts, estado:"sin_senal"}` dentro del mismo lote;
> - las acciones de alta intensidad (`imu.acelAltas` y `imu.decelAltas`) llegan ya contadas desde el simulador;
> - la pasarela manda la clave en la cabecera `x-api-key`.

## Generalidades

- **URL base:** `http://localhost:3000`
- **Formato:** JSON en peticiones y respuestas (`Content-Type: application/json`). Las fechas van en ISO 8601 UTC (`2026-11-12T18:30:05.000Z`).
- **Identificadores de jugador:** seudónimos (`J01` … `J11`). Nunca se usan nombres.
- **Autenticación:** cabecera `x-api-key`.
  - `API_KEY_PASARELA`: solo para `POST /api/telemetria` y `POST /api/clima` (la usa Node-RED).
  - `API_KEY_MEDICO`: para todo lo que escribe datos clínicos (jugadores, umbrales, pautas, confirmar alertas, sesiones).
  - Los `GET` no piden clave en esta versión. Es una limitación conocida y se explica en el informe.
- **Errores:** `{"error": "mensaje"}` con el código HTTP correspondiente.
  - `400` cuerpo inválido
  - `401` falta la clave o no es válida
  - `403` la clave no tiene permiso para esa operación
  - `404` no existe

## Telemetría (pasarela → API)

### `POST /api/telemetria`

Un lote por segundo con la última lectura de cada jugador. Clave: `API_KEY_PASARELA`.

```json
{
  "equipo": "eq1",
  "ts": "2026-11-12T18:30:05.000Z",
  "lecturas": [
    {
      "jugadorId": "J08",
      "ts": "2026-11-12T18:30:05.000Z",
      "estado": "ok",
      "gps":  { "x": 52.3, "y": 30.1, "vel": 28.7, "dist": 7842 },
      "imu":  { "acelMax": 3.7, "decelMax": -4.1, "giro": 72, "impacto": 1.2, "acelAltas": 1, "decelAltas": 0 },
      "fc": 181,
      "temp": 38.1,
      "plantillas": { "izq": 42, "der": 58 }
    },
    { "jugadorId": "J10", "ts": "2026-11-12T18:30:05.000Z", "estado": "sin_senal" }
  ]
}
```

| Campo | Unidad | Notas |
|---|---|---|
| `estado` | `ok` \| `sin_senal` | `sin_senal` lo pone el watchdog de la pasarela (5 s sin datos). En ese caso no van más campos |
| `gps.x`, `gps.y` | m | Posición en el campo, de 0 a 105 y de 0 a 68 |
| `gps.vel` | km/h | Velocidad instantánea |
| `gps.dist` | m | Distancia acumulada en la sesión |
| `imu.acelMax`, `imu.decelMax` | m/s² | Pico del último segundo (`decelMax` es negativo) |
| `imu.giro` | grados | Ángulo del cambio de dirección del último segundo (0 si no hubo) |
| `imu.impacto` | g | Pico de impacto del último segundo |
| `imu.acelAltas`, `imu.decelAltas` | nº | Acciones de alta intensidad (±3 m/s² mantenidas 0,5 s) detectadas **por el wearable** en el último segundo. A 1 Hz la API no puede medir 0,5 s, así que se cuentan en el dispositivo |
| `fc` | lpm | Frecuencia cardiaca |
| `temp` | °C | Temperatura interna. **Opcional**: solo llega cada 10 s |
| `plantillas.izq`, `plantillas.der` | % | Reparto de carga entre los pies (suman 100). **Opcional**: llega cada 2 s |

**Respuesta `202`:** `{"recibidas": 11}`

## Jugadores y perfil médico

### `GET /api/jugadores`
Lista de jugadores con su perfil.

### `GET /api/jugadores/:id`
```json
{
  "id": "J08", "dorsal": 8, "posicion": "MC",
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
  "jugadorId": "J08", "ts": "2026-11-12T18:30:05.000Z",
  "semaforo": "ambar",
  "ultimo": { "x": 52.3, "y": 30.1, "vel": 28.7, "fc": 181, "pctFcMax": 93, "temp": 38.1, "asimetria": 16 },
  "alertasActivas": [ { "id": "…", "codigo": "FC_ALTA", "severidad": "aviso" } ]
}
```

### `GET /api/jugadores/:id/historico?desde=&hasta=`
Resúmenes de 10 s entre dos fechas. Por defecto, los últimos 15 minutos.
```json
[ { "ts": "…", "velMedia": 12.4, "velMax": 27.9, "distancia": 34, "fcMedia": 172, "fcMax": 181, "temp": 38.1, "asimetria": 15, "acelAltas": 1, "decelAltas": 2, "x": 52.3, "y": 30.1 } ]
```

### `GET /api/jugadores/:id/acwr`
```json
{ "jugadorId": "J08", "cargaAguda": 4200, "cargaCronica": 3800, "ratio": 1.11, "franja": "optima" }
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

### `GET /api/alertas?estado=activa&jugadorId=J08`
Los dos filtros son opcionales. Ordenadas de más reciente a más antigua. El formato de cada alerta está en `alertas.md`.

### `POST /api/alertas/:id/confirmar` (médico)
```json
{ "por": "Dra. Pérez", "nota": "Retirado a la banda, hidratación" }
```
**`200`** con la alerta en estado `confirmada`.

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

### `GET /fhir/Observation?patient=J08&code=8867-4`
Devuelve un `Bundle` (`type: searchset`) con `Observation` FHIR R4 de categoría `vital-signs`:
- frecuencia cardiaca: LOINC `8867-4`, unidad UCUM `/min`;
- temperatura corporal: LOINC `8310-5`, unidad UCUM `Cel`.

## Utilidad

### `GET /health`
```json
{ "status": "ok", "mongo": "connected", "uptime": 123 }
```

## WebSocket

En el mismo puerto que la API (`ws://localhost:3000`). Solo envía, del servidor al cliente:

| `tipo` | Contenido | Frecuencia |
|---|---|---|
| `bienvenida` | `{ "tipo": "bienvenida", "ts": "…" }` | Al conectar |
| `telemetria` | `{ "tipo": "telemetria", "ts": "…", "jugadores": [ { "jugadorId", "x", "y", "vel", "fc", "temp", "semaforo" } ] }` | 1 Hz |
| `alerta` | `{ "tipo": "alerta", "alerta": { … } }` | Al momento |
| `alerta_confirmada` | `{ "tipo": "alerta_confirmada", "alertaId": "…" }` | Al momento |

## Registro de cambios

| Fecha | Cambio |
|---|---|
| Lun 9 nov | Versión 1.0 cerrada con A |
