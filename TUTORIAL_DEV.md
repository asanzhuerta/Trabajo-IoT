# Cómo probar la rama `dev`

`dev` junta el trabajo de los dos para probarlo de punta a punta:

```
Simulador (Node-RED, A) ──MQTT──► Mosquitto ──► Pasarela (Node-RED) ──POST──► API (Express, B) ──► MongoDB
                                      ▲                                            │
                                      └──────── alertas: sensors/eq1/alertas ◄─────┘
```

## 0. Requisitos

| Herramienta | Versión |
|---|---|
| Node.js | 24 |
| Docker Desktop | 29, arrancado (solo para MongoDB) |
| Mosquitto | 2.1, instalado en Windows |
| Node-RED | 5 (`npm install -g node-red`) |

## 1. Bajar la rama

```powershell
git fetch origin
git checkout dev
```

En GitHub Desktop: menú de ramas → `dev`. Si tienes cambios sin guardar, haz commit antes.

## 2. Contraseñas y claves (`.env`)

Copia `.env.example` como `.env` en la raíz del repo y rellena:

| Variable | Valor |
|---|---|
| `MQTT_USER` / `MQTT_PASS` | `api` y su contraseña de Mosquitto (la usa la API) |
| `NODERED_MQTT_USER` / `NODERED_MQTT_PASS` | `nodered` y su contraseña de Mosquitto (la usan el simulador y la pasarela) |
| `API_KEY_PASARELA` | cualquier texto: es la clave con la que la pasarela habla con la API |
| `API_KEY_MEDICO` | otro texto distinto: es la clave para confirmar alertas, crear pautas… |

Las contraseñas de Mosquitto os las pasáis por privado. `mosquitto/passwd` tiene que ser el que generó A. `.env` no se sube al repo.

## 3. MongoDB (consola 1)

Con Docker Desktop abierto, desde la raíz del repo:

```powershell
docker compose up -d
```

Levanta el contenedor `smarthealth-mongo` en el puerto 27017.

## 4. Mosquitto con la configuración del proyecto (consola 2, como administrador)

El servicio de Windows usa una configuración sin usuarios. Hay que pararlo y lanzar Mosquitto a mano con la nuestra, **desde la raíz del repo** (las rutas del `.conf` son relativas a esa carpeta):

```powershell
net stop mosquitto
cd "<ruta del repo>"
& "C:\Program Files\mosquitto\mosquitto.exe" -c mosquitto/mosquitto.conf -v
```

Deja esta consola abierta: con `-v` se ve cada conexión y cada mensaje.

## 5. Escuchar el broker (consola 3)

```powershell
& "C:\Program Files\mosquitto\mosquitto_sub.exe" -h localhost -u nodered -P "<contraseña-nodered>" -t "#" -v
```

## 6. La API (consola 4)

```powershell
cd api
npm install
node scripts/seed.js
npm run dev
```

- `seed` carga los 11 jugadores (`p1` … `p11`) y una pauta de readaptación para `p5`. Con `--limpiar` borra también las lecturas y las alertas.
- `dev` arranca la API en `http://localhost:3000`.

Abre `http://localhost:3000/health`: tiene que decir `"mongo":"connected"` y `"mqtt":"connected"`.

## 7. Node-RED: simulador y pasarela (consola 5)

Desde la raíz del repo:

```powershell
node node_red/arrancar.js
```

- Arranca un Node-RED **solo para el proyecto**, con su propia carpeta (`~/.node-red-smarthealth`). Así no se mezcla con los ejercicios de clase de tu `~/.node-red`.
- La primera vez lo prepara con el simulador de A (`flows.json`) y la pasarela (`flows_pasarela.json`). Con `--reiniciar` los vuelve a cargar desde el repo y se pierden los cambios hechos en el editor.
- Lee el `.env`: los nodos del broker usan `${NODERED_MQTT_USER}` y `${NODERED_MQTT_PASS}`, y la pasarela usa `API_KEY_PASARELA`. No hay que escribir ninguna contraseña en el editor.
- Si ya tienes otro Node-RED abierto en el puerto 1880, ciérralo antes.

En la consola tiene que salir `Connected to broker` dos veces, una por el simulador y otra por la pasarela. El editor está en `http://localhost:1880`.

Para ver a un jugador tal y como lo ve la API (consola 6, dentro de `api/`):

```powershell
node scripts/vigilar.js p1
```

Cada 2 s muestra su estado, el semáforo, la posición, la velocidad, el pulso, la temperatura, los pies, la asimetría del último minuto y las alertas activas.

Qué tienes que ver:

- **Consola 3:** cada segundo, `p1/sensors/gps`, `p1/sensors/accelerometer`, `p1/sensors/giroscope`, `p1/sensors/pulsemeter`, `p1/sensors/pressuresensor` y `p1/sensors/termometer/temperature`.
- **Pestaña de la pasarela en el editor:** el nodo *Respuesta de la API* pone `202 · 1 recibidas`.
- **Consola 6:** los datos del portero de A, que cambian cada 2 s.

## 8. Ver el flujo completo

- **Pasarela → API:** `http://localhost:3000/api/jugadores/p1/estado` (semáforo, `sensors` en el formato de A y `derivados`) y `http://localhost:3000/api/jugadores/p1/historico` (resúmenes de 10 s).
- **API → broker:** si salta una alerta, aparece en la consola 3 como `sensors/eq1/alertas {…}`.
- **Probar una alerta:** baja el umbral de calor de `p1` por debajo de su temperatura (36-37 °C) con `PUT /api/jugadores/p1/umbrales` y `{"tempAmbar": 36.5}`. Salta `CALOR_AMBAR` en la consola 3 y en la 6. Después déjalo como estaba con `{"tempAmbar": 39}`.
- **Probar el watchdog:** en Node-RED, desactiva el nodo inyectar *Jugador 1* del simulador (o bórralo) y pulsa **Deploy**. A los 5 s, `p1` pasa a `sin_senal` y salta la alerta `SIN_SENAL`.
- **Alertas en Node-RED (opcional):** añade un **mqtt in** con el topic `sensors/eq1/alertas`, el broker *Mosquitto local (pasarela)* y la salida *a parsed JSON object*, conectado a un **debug**.

### Confirmar una alerta (como el médico)

```powershell
Invoke-RestMethod "http://localhost:3000/api/alertas?estado=activa"
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/alertas/<id>/confirmar" -ContentType "application/json" -Headers @{ "x-api-key" = "<API_KEY_MEDICO>" } -Body '{"por":"Dra. Pérez","nota":"Retirado a la banda"}'
```

El semáforo del jugador vuelve a verde si no le quedan alertas activas.

## 9. Escenarios con 11 jugadores: fake-gateway (opcional)

El simulador de A tiene, por ahora, un solo jugador y no tiene escenarios. Para ver todas las alertas, el fake-gateway hace de simulador y pasarela a la vez: cada segundo manda a la API los 11 jugadores, en el formato de A. En otra consola, dentro de `api/`:

```powershell
node scripts/fake-gateway.js --calor p8 --incidente p3 --sin-senal p10 --asimetria p5 --fc-alta p7 --desacople p6 --recuperacion p9
```

Si a la vez está funcionando el simulador de A, los datos de `p1` llegan por los dos lados. Mejor desactivar uno de los dos.

| Cuándo | Alerta |
|---|---|
| Al momento | `PAUTA_EXCEDIDA` de p5 (está en readaptación y se pasa de su límite) |
| ~10 s | `SIN_SENAL` de p10 y `CALOR_AMBAR` de p8 |
| ~30 s | `INCIDENTE` de p3 (impacto fuerte, inmóvil y FC muy baja) |
| ~60 s | `FC_DESACOPLE` de p6 y `CALOR_ROJA` de p8 |
| ~90 s | `ASIMETRIA` de p5 (es la media del último minuto, así que tarda más) |
| ~80 s | `RECUPERACION_LENTA` de p9 y `FC_ALTA` de p7 |

## 10. Tests

Dentro de `api/`:

```powershell
npm test
```

Tienen que pasar los 44.

## 11. Al terminar

1. `Ctrl+C` en las consolas de Node-RED, la API, `mosquitto_sub` y Mosquitto.
2. En la consola de administrador, deja el servicio de Mosquitto como estaba:
   ```powershell
   net start mosquitto
   ```
3. MongoDB se puede quedar encendido. Para pararlo (los datos se conservan): `docker compose down`.

## Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| Mosquitto dice que el puerto 1883 está ocupado | El servicio de Windows sigue arrancado: `net stop mosquitto` como administrador |
| `/health` da `"mqtt":"connecting"` | Mosquitto no está lanzado, o `MQTT_PASS` no es la contraseña de `api` |
| `/health` da `"mongo":"connecting"`, o la API responde `503` | Docker Desktop o el contenedor no están arrancados: `docker compose up -d` |
| Los nodos MQTT de Node-RED no se conectan | Node-RED se arrancó sin cargar el `.env` (paso 7), o el usuario o la contraseña no coinciden con el `passwd` |
| La consola 3 no recibe nada de `p1/...` | Mosquitto se lanzó desde otra carpeta, o el ACL no tiene `+/sensors/#` |
| La pasarela pone `falta API_KEY_PASARELA` | Node-RED se arrancó sin cargar el `.env` (paso 7) |
| La pasarela pone `error 401` | `API_KEY_PASARELA` no es la misma en Node-RED y en la API: arranca las dos con el mismo `.env` |
| La pasarela pone `ignoradas: p…` | Ese jugador no está en la base de datos: `node scripts/seed.js` |
| Una alerta no vuelve a salir | Hasta que el médico la confirma no se repite, y después hay 60 s de espera |
