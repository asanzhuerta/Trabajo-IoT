# Cómo probar la rama `dev`

`dev` junta el trabajo de los dos para poder probarlo entero:

| De quién | Qué hay |
|---|---|
| **A** (`edge`) | Configuración de Mosquitto (`mosquitto/`), simulador de un jugador en Node-RED (`node_red/flows.json`) y `valores.json` |
| **B** (`backend`) | API REST en Express con MongoDB, motor de alertas, WebSocket, seed y fake-gateway (`api/`) |

**Qué funciona ya y qué falta:**

- El simulador de A publica sus sensores por MQTT (`p1/sensors/gps`…).
- La API recibe los lotes en `POST /api/telemetria`, guarda los datos y lanza alertas a `sensors/eq1/alertas`.
- **Falta la pasarela** (le toca a A): el flujo que se suscribe a `+/sensors/#`, junta los mensajes de cada jugador y hace el POST a la API. Mientras tanto, la API se prueba con el **fake-gateway**, que manda exactamente lo que mandará la pasarela.

> En `dev` el ACL tiene la línea `topic readwrite +/sensors/#` para `nodered`. Sin ella, Mosquitto rechaza los mensajes del simulador. A tiene que añadirla también en `edge`.

Todos los comandos se escriben en **Git Bash**, desde la raíz del repo, salvo los de Mosquitto, que van en una consola **como administrador**.

## 0. Requisitos

| Herramienta | Versión |
|---|---|
| Node.js | 24 |
| Docker Desktop | 29, arrancado (solo para MongoDB) |
| Mosquitto | 2.1, instalado en Windows |
| Node-RED | 5 (`npm install -g node-red`) |

## 1. Bajar la rama

```bash
git fetch origin
```

```bash
git checkout dev
```

Si usas GitHub Desktop, cambia a la rama `dev` desde el menú de ramas. Si tienes cambios sin guardar, haz commit antes.

## 2. Contraseñas y claves (`.env`)

Copia `.env.example` como `.env` en la raíz del repo y rellena:

| Variable | Valor |
|---|---|
| `MQTT_USER` | `api` |
| `MQTT_PASS` | la contraseña del usuario `api` de Mosquitto (os la pasáis por privado) |
| `API_KEY_PASARELA` | cualquier texto: es la clave con la que la pasarela (o el fake-gateway) habla con la API |
| `API_KEY_MEDICO` | otro texto distinto: es la clave para confirmar alertas, crear pautas… |

`.env` no se sube al repo.

## 3. MongoDB

Con Docker Desktop abierto:

```bash
docker compose up -d
```

Levanta el contenedor `smarthealth-mongo` en el puerto 27017.

## 4. Mosquitto con la configuración del proyecto

El servicio de Windows usa una configuración sin usuarios. Hay que pararlo y lanzar Mosquitto a mano con la nuestra. En una consola **como administrador**, desde la raíz del repo:

```bash
net stop mosquitto
```

```bash
mosquitto -c mosquitto/mosquitto.conf -v
```

Deja esa consola abierta: con `-v` se ve cada conexión y cada mensaje. Las rutas del `.conf` son relativas a la carpeta desde la que lo lanzas, así que tiene que ser la raíz del repo.

## 5. La API

En otra consola, entra en la carpeta de la API:

```bash
cd api
```

```bash
npm install
```

```bash
npm run seed
```

```bash
npm run dev
```

- `seed` carga los 11 jugadores (`p1` … `p11`) y una pauta de readaptación para `p5`.
- `dev` arranca la API en `http://localhost:3000` y la reinicia sola si cambias el código.

Abre `http://localhost:3000/health`. Tiene que decir `"mongo": "connected"` y `"mqtt": "connected"`. Si `mqtt` se queda en `connecting`, la contraseña de `MQTT_PASS` no coincide con el `passwd`.

## 6. Ver lo que pasa por MQTT

En otra consola, escucha todo con el usuario de Node-RED:

```bash
mosquitto_sub -h localhost -u nodered -P <contraseña-nodered> -t "#" -v
```

## 7. Probar la API con el fake-gateway

El fake-gateway hace de pasarela: cada segundo manda a la API un lote con los 11 jugadores, en el formato del simulador de A. Se pueden activar escenarios por jugador. En otra consola, dentro de `api/`:

```bash
npm run fake-gateway -- --calor p8 --incidente p3 --sin-senal p10 --asimetria p5 --fc-alta p7 --desacople p6 --recuperacion p9
```

En la consola de `mosquitto_sub` irán apareciendo las alertas en `sensors/eq1/alertas`, más o menos en este orden:

| Cuándo | Alerta |
|---|---|
| Al momento | `PAUTA_EXCEDIDA` de p5 (está en readaptación y se pasa de su límite) |
| ~10 s | `SIN_SENAL` de p10 y `CALOR_AMBAR` de p8 |
| ~30 s | `ASIMETRIA` de p5 e `INCIDENTE` de p3 (impacto fuerte, inmóvil y FC muy baja) |
| ~60 s | `FC_DESACOPLE` de p6 y `CALOR_ROJA` de p8 |
| ~80 s | `RECUPERACION_LENTA` de p9 y `FC_ALTA` de p7 |

Se para con `Ctrl+C`. La lista completa de escenarios está en el README.

### Consultas útiles

En el navegador, o con `curl` desde Git Bash:

```bash
curl http://localhost:3000/api/jugadores
```

```bash
curl http://localhost:3000/api/jugadores/p8/estado
```

```bash
curl "http://localhost:3000/api/alertas?estado=activa"
```

- `/estado` devuelve el semáforo (`verde`, `ambar` o `rojo`), los últimos `sensors` en el formato de A y los `derivados` (%FCmáx, asimetría y zonas).
- `/api/jugadores/p8/historico` devuelve los resúmenes de 10 s de los últimos 15 minutos.

### Confirmar una alerta (como el médico)

Copia el `id` de una alerta activa y sustituye `<id>` y `<API_KEY_MEDICO>`:

```bash
curl -X POST http://localhost:3000/api/alertas/<id>/confirmar -H "Content-Type: application/json" -H "x-api-key: <API_KEY_MEDICO>" -d '{"por": "Dra. Pérez", "nota": "Retirado a la banda"}'
```

El semáforo del jugador vuelve a verde si no le quedan alertas activas.

## 8. El simulador de A en Node-RED

En otra consola:

```bash
node-red
```

1. Abre `http://localhost:1880`.
2. Menú (☰) → **Import** → **select a file to import** → `node_red/flows.json` → **Import**.
3. Haz doble clic en el nodo **mqtt out** y, al lado de *Server* (`ServidorLocal`), pulsa el lápiz.
4. En la pestaña **Security**, pon el usuario `nodered` y su contraseña. Pulsa **Update** y luego **Done**.
5. Pulsa **Deploy**.

En la consola de `mosquitto_sub` empezarán a salir, una vez por segundo, `p1/sensors/gps`, `p1/sensors/accelerometer`, `p1/sensors/giroscope`, `p1/sensors/pulsemeter`, `p1/sensors/pressuresensor` y `p1/sensors/termometer/temperature`.

Estos datos todavía **no llegan a la API**: falta la pasarela.

## 9. Tests

Dentro de `api/`:

```bash
npm test
```

Tienen que pasar los 44.

## 10. Al terminar

1. Para el fake-gateway, la API, Node-RED y Mosquitto con `Ctrl+C` en cada consola.
2. Vuelve a dejar el servicio de Mosquitto como estaba (consola como administrador):

```bash
net start mosquitto
```

3. MongoDB se puede dejar encendido. Para pararlo (los datos se conservan):

```bash
docker compose down
```

Para empezar con la base de datos limpia: `npm run seed -- --limpiar` en `api/`.

## Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| Mosquitto dice que el puerto 1883 está ocupado | El servicio de Windows sigue arrancado: `net stop mosquitto` como administrador |
| `/health` da `"mqtt": "connecting"` | Mosquitto no está lanzado, o `MQTT_PASS` no es la contraseña de `api` |
| `/health` da `"mongo": "connecting"`, o la API responde `503` | Docker Desktop o el contenedor no están arrancados: `docker compose up -d` |
| El fake-gateway recibe `401` | `API_KEY_PASARELA` no está en `.env` |
| El fake-gateway recibe `202` con `ignoradas` | Faltan jugadores en la base de datos: `npm run seed` |
| Node-RED no publica nada | Falta el usuario y la contraseña en el nodo del broker, o el ACL no tiene `+/sensors/#` |
| Una alerta no vuelve a salir | Hasta que el médico la confirma no se repite, y después hay 60 s de espera |
