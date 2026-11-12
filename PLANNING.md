# Planning: plataforma smart health para un equipo de fútbol

Trabajo práctico de Internet de las Cosas 2026/27, en pareja.

## Qué vamos a hacer

Una plataforma **smart health** que vigila en tiempo real la salud de 11 jugadores con wearables simulados y avisa al cuerpo médico cuando hay un riesgo. Los sensores son GPS, acelerómetro, giroscopio, pulsómetro, temperatura y plantillas de presión.

```
[Node-RED · Simulador wearables]  11 jugadores (ID seudónimo, sin nombres)
     │ MQTT con usuario + ACL   <id>/sensors/{gps|accelerometer|giroscope|pulsemeter|termometer|pressuresensor}
     ▼
[Mosquitto] ◄──────── sensors/<equipo>/alertas ───────────┐
     │ suscripción +/sensors/#                             │
     ▼                                                     │
[Node-RED · Pasarela]  valida, une → POST /api/telemetria  │
     ▼                                                     │
[Express REST]  motor de reglas de salud ──────────────────┘
   │   ├─ /api/jugadores · /api/pautas · /api/alertas · /api/sesiones
   │   ├─ /fhir/Observation   (FC = LOINC 8867-4, Temp = 8310-5)
   │   └─ WebSocket ──► [Web: ficha del jugador + campo 2D en vivo]
   ▼
[MongoDB]  perfil médico · pautas · resúmenes 10 s · eventos · alertas

[Node-RED · Dashboard 2.0 "vista médica"]  semáforo por jugador, confirmar alertas,
                                           formulario de pauta (POST)
[Open-Meteo] ─► Node-RED ─► POST /api/clima   (WBGT estimado con temperatura y humedad)
[Telegram/email] ◄── alertas críticas (opcional)
```

**Qué cubre de la rúbrica:**
- **Flujo (7 puntos):** Express con REST, Mosquitto con MQTT, varios nodos de Node-RED y un dashboard.
- **Extra (+1):** WebSockets, base de datos y dashboard avanzado.
- **Informe y vídeo:** 3 puntos.

**Fechas:**
- **Objetivo: todo listo el domingo 15 de noviembre.**
- Entrega el jueves 19 y presentación el viernes 20.

## Reparto

Cada bloque tiene un dueño. Los dos bloques solo se comunican a través de los **contratos** que fijamos juntos el lunes: topics y payloads MQTT, la API REST y las reglas de alerta. Mientras respetemos los contratos, cada uno puede avanzar sin esperar al otro.

| | **Persona A — Edge y visualización** | **Persona B — Backend y datos** |
|---|---|---|
| Dueño de | `mosquitto/`, `node_red/` | `api/`, `docker-compose.yml` |
| Tareas | Mosquitto con usuarios y ACL, simulador de wearables y escenarios, pasarela MQTT→REST, Dashboard 2.0 "vista médica", Open-Meteo/WBGT, Telegram (opcional) | Express REST, MongoDB, motor de alertas, WebSockets, web con ficha del jugador y campo 2D, FHIR, Swagger y Postman, ACWR |
| Informe | Simulación, MQTT, flujos de Node-RED, dashboard, seguridad del broker | API, alertas, base de datos, WebSockets, FHIR, web, seguridad de la API |

Juntos: contratos, introducción, arquitectura, conclusiones, vídeo y TikTok.

Asignación: **A = ________** · **B = ________**

## Cómo trabajamos con Git

- **Una rama por persona:** `edge` (A) y `backend` (B). Cada uno trabaja siempre en la suya.
- **Cada noche**, PR de tu rama a `main`. **El otro la revisa antes del merge.** Así los dos conocemos todo el sistema para la defensa.
- **Cada mañana**, `git pull origin main` en tu rama para traer lo del otro.
- **Solo A hace commits de `node_red/flows.json`.** Es un único fichero y dos personas editándolo a la vez acaban en conflicto. Si B necesita un cambio en un flujo, se lo pide a A.
- Las credenciales no se suben al repo. Van en `.env`, y en git solo está `.env.example`. `mosquitto/passwd` tampoco se sube (está en `.gitignore`): lo genera A y se lo pasa a B por privado.

## Estructura del repositorio

```
Trabajo-IoT/
├── PLANNING.md             # este documento
├── README.md               # cómo arrancar todo, paso a paso
├── docker-compose.yml      # mongo (api y Node-RED al final)
├── .env.example  .gitignore
├── mosquitto/              # mosquitto.conf, acl, passwd del Mosquitto nativo (A)
├── node_red/               # userDir de Node-RED: package.json, settings.js, flows.json (A)
├── valores.json            # ejemplo de la estructura de los sensores (A)
├── api/                    # Express (B)
│   ├── server.js  servers/{http-server,websocket}.js  mqtt/publisher.js
│   ├── routers/{telemetria,jugadores,alertas,pautas,sesiones,clima,fhir}.js
│   ├── services/{metricas,alertas,acwr}.js   models/ (Mongoose)
│   ├── public/  (web: ficha del jugador + campo 2D)   openapi.yaml
├── docs/
│   ├── contratos/{mqtt,api,alertas}.md
│   └── arquitectura.drawio  postman_collection.json
└── informe/
```

**Código de clase que reutilizamos** (proyecto `RESTAPI2026` de las sesiones):
- `servers/websocket.js`, con `listen` y `sendMessage`;
- el patrón de `servers/http-server.js` y de `wot-server.js`;
- `routers/smartcadiz.js`: POST, procesado con timestamp y publicación;
- `mqtt/publisher.js`, apuntado al Mosquitto local en vez de al broker público;
- `website/js/wsinvocation.js`, como base del cliente web.

## Contratos (en `docs/contratos/`; versión 2.0 del jueves 12, adaptada al simulador de A)

### MQTT

- **Telemetría:** `<idJugador>/sensors/<sensor>`, con QoS 0, a 1 Hz. Por ejemplo, `p1/sensors/gps`. Los sensores son `gps`, `accelerometer`, `giroscope`, `pulsemeter`, `termometer` y `pressuresensor`.
  - Cada payload es un objeto de medidas `{unit, value}` con la estructura de `valores.json`. Por ejemplo, `p1/sensors/pulsemeter` → `{"pulse": {"unit": "bpm", "value": 150}}`.
  - El resto del topic, después de `sensors/`, es la ruta dentro del objeto de sensores. Por eso la temperatura va en `p1/sensors/termometer/temperature` con payload `{unit, value}`, y queda en `sensors.termometer.temperature`.
  - La pasarela junta los mensajes de cada jugador en `sensors` sin traducir nada y los manda en el lote de `POST /api/telemetria`. La API trabaja directamente con este formato.
- **Alertas:** `sensors/<equipo>/alertas` (`sensors/eq1/alertas`), con QoS 1. Las publica la API.
- **Escenarios** (propuesta, pendiente de A): `sensors/control/escenario`. El dashboard los envía y el simulador los recibe.
- **Estado del simulador** (propuesta, pendiente de A): LWT en `sensors/sim/estado`, con retain.
- **Caída de un sensor concreto:** la detecta un watchdog en la pasarela (nodo trigger). El LWT va por conexión, no por jugador, así que no sirve para esto.
- **Identificadores:** son seudónimos, `p1` … `p11`. Nunca van nombres en los topics.

### REST

| Método | Ruta | Uso |
|---|---|---|
| POST | `/api/telemetria` | Lote de lecturas por segundo, desde la pasarela |
| GET / POST / PUT | `/api/jugadores[/:id]` | Perfil médico: FCmáx, temperatura basal, asimetría base, posición |
| GET | `/api/jugadores/:id/estado` | Último estado y semáforo |
| GET | `/api/jugadores/:id/historico` | Histórico (`?desde=&hasta=`) |
| GET | `/api/jugadores/:id/acwr` | Ratio de carga aguda/crónica |
| GET / POST | `/api/jugadores/:id/pauta` | Límites de readaptación que fija el médico |
| GET | `/api/alertas` | Alertas (`?estado=activa`) |
| POST | `/api/alertas/:id/confirmar` | El médico confirma la alerta |
| POST | `/api/sesiones`, `/api/sesiones/:id/fin` | Inicio y fin de sesión o partido |
| GET / POST | `/api/clima` | Datos de Open-Meteo y WBGT estimado |
| GET | `/fhir/Observation?patient=&code=` | Mediciones en formato FHIR R4 (FC = LOINC 8867-4, temperatura = 8310-5) |
| WS | mismo puerto que la API | Mensajes `{tipo: "telemetria" \| "alerta", ...}` |

Documentación: `openapi.yaml` con Swagger UI en `/api-docs` y una colección de Postman.

### Alertas

Cada alerta tiene la forma `{id, jugadorId, codigo, severidad, valor, umbral, ts, estado}`. Los umbrales son **valores por defecto y se pueden cambiar por jugador** desde la API.

| Código | Regla por defecto | Severidad |
|---|---|---|
| `CALOR_AMBAR` / `CALOR_ROJA` | Temperatura interna ≥39 / ≥40 °C, más sensible si el WBGT es ≥28 | aviso / crítica |
| `FC_ALTA` | >92 % de la FCmáx durante más de 60 s | aviso |
| `FC_DESACOPLE` | FC >85 % de la FCmáx con velocidad <7 km/h durante 30 s | aviso |
| `RECUPERACION_LENTA` | Caída de ≤12 lpm en los 60 s siguientes al fin de un esfuerzo | aviso |
| `INCIDENTE` | Pico de impacto + inmóvil más de 10 s + FC anómala o sin señal | crítica |
| `SOBRECARGA` | Aceleraciones o desaceleraciones de ±3 m/s² por encima del límite de la sesión | aviso |
| `ASIMETRIA` | Diferencia izquierda/derecha frente a la línea base del jugador por encima del umbral | aviso |
| `PAUTA_EXCEDIDA` | Velocidad o carga por encima de lo que permite su pauta | aviso |
| `SIN_SENAL` | Watchdog de la pasarela (5 s sin datos) | aviso |

**Base de cada umbral (para el informe):**
- **Calor:** en partidos con calor el pico medio de temperatura interna es 39,2 °C. Por encima de 39 °C baja el rendimiento en sprint, y 40 °C es el criterio clínico de golpe de calor. FIFA obliga a pausas de hidratación con WBGT ≥32 °C y FIFPRO las pide desde 28 °C.
- **Aceleraciones:** ±3 m/s² mantenidos 0,5 s es el umbral habitual de alta intensidad (STATSports, SciSports).
- **Recuperación de la FC:** una caída de ≤12 lpm en el primer minuto tras el esfuerzo se asoció a más mortalidad en Cole et al. (1999). Era una cohorte clínica, así que aquí es un indicador, no un diagnóstico.
- **Asimetría:** no hay un umbral fijo validado, por eso se compara con la línea base de cada jugador.
- **ACWR:** la franja 0,8–1,3 se cita mucho, pero está discutida.
- **Temperatura interna:** los valores de 38–40 °C son temperatura interna. En la realidad se miden con una cápsula ingerible o se estiman a partir de la FC (algoritmo ECTemp, Buller 2013).

## Mosquitto nativo: cómo conectarse (lo monta A)

Usamos el Mosquitto instalado en Windows, no uno en Docker. Esta configuración está probada con Mosquitto 2.1.2.

### 1. Comprobar la instalación

- Los ejecutables (`mosquitto`, `mosquitto_pub`, `mosquitto_sub`, `mosquitto_passwd`) están en `C:\Program Files\mosquitto`. Si la consola no los encuentra, añade esa carpeta al PATH.
- El instalador lo deja como **servicio de Windows** `mosquitto`, con arranque automático.
- Ese servicio usa `C:\Program Files\mosquitto\mosquitto.conf`, que viene todo comentado. Por eso, sin tocar nada, solo escucha en `127.0.0.1:1883` y **acepta conexiones anónimas**.

### 2. Configuración del proyecto (carpeta `mosquitto/`)

`mosquitto/mosquitto.conf`:

```
listener 1883
allow_anonymous false
password_file mosquitto/passwd
acl_file mosquitto/acl
```

- `listener 1883` sin dirección escucha en todas las interfaces. Hace falta para que el sábado la API y Node-RED, ya dentro de Docker, lleguen al broker por `host.docker.internal:1883`.
- Las rutas son **relativas a la carpeta desde la que se lanza Mosquitto**. Lánzalo siempre desde la raíz del repo.

`mosquitto/acl`:

```
# Node-RED: simulador, pasarela y dashboard
user nodered
topic readwrite sensors/#
topic readwrite +/sensors/#

# API: solo publica alertas
user api
topic write sensors/+/alertas
```

- La línea `+/sensors/#` es la que permite publicar en `p1/sensors/gps`. **Falta en el `acl` que hay ahora en `edge`**: con solo `sensors/#`, el broker rechaza la telemetría del simulador (`Denied PUBLISH`). Está comprobado con un broker de prueba.
- `sensors/#` cubre las alertas (`sensors/eq1/alertas`), los escenarios y el LWT.

`mosquitto/passwd` se genera con `mosquitto_passwd`. Aunque solo guarda hashes, **no se sube**: está en `.gitignore` y A se lo pasa a B por privado. Ojo: `-c` crea el fichero de cero y borra lo que hubiera.

```
mosquitto_passwd -c -b mosquitto/passwd nodered <contraseña-nodered>
mosquitto_passwd -b mosquitto/passwd api <contraseña-api>
```

Las contraseñas en claro **no se suben**: nos las pasamos por privado y cada uno las pone en su `.env` (`MQTT_USER` y `MQTT_PASS` para la API).

### 3. Arrancarlo con nuestra configuración

El servicio no lee nuestra configuración. Mientras trabajamos en el proyecto, se para y Mosquitto se lanza a mano desde la raíz del repo:

```
net stop mosquitto
mosquitto -c mosquitto/mosquitto.conf -v
```

- `net stop` y `net start` necesitan una consola **como administrador**.
- `-v` muestra cada conexión y cada mensaje. Va bien para depurar y para el vídeo.
- Si Windows pregunta por el firewall al arrancarlo, permite el acceso en redes privadas. Lo necesitará Docker el sábado.
- Al terminar la sesión de trabajo, `net start mosquitto` deja el servicio como estaba.

### 4. Quién se conecta y cómo

| Cliente | Dónde corre | Broker | Usuario |
|---|---|---|---|
| Node-RED (simulador, pasarela, dashboard) | Nativo | `localhost:1883` | `nodered`, en el nodo de configuración *mqtt-broker* (pestaña *Security*) |
| API Express | Nativa hasta el sábado | `MQTT_URL=mqtt://localhost:1883` | `api` |
| API y Node-RED en Docker | Contenedores, desde el sábado | `host.docker.internal:1883` | Los mismos |

### 5. Probar que funciona

En una consola, escuchar todo lo del proyecto:

```
mosquitto_sub -h localhost -u nodered -P <contraseña-nodered> -t "#" -v
```

En otra, publicar con usuario (tiene que aparecer en la primera) y sin usuario (tiene que fallar):

```
mosquitto_pub -h localhost -u nodered -P <contraseña-nodered> -t p8/sensors/pulsemeter -m '{"pulse":{"unit":"bpm","value":150}}'
mosquitto_pub -h localhost -t sensors/prueba -m hola
```

La segunda tiene que responder `Connection Refused: not authorised`.

## Calendario

| Día | Persona A | Persona B |
|---|---|---|
| **Dom 8** | Repartir los papeles A/B | — |
| **Lun 9** | **Juntos (unas 2 h):** cerrar los contratos, README, `.gitignore` y comprobar las herramientas de los dos (Node, Node-RED, Mosquitto, Docker). **Después, A:** configuración del Mosquitto nativo en `mosquitto/` (conf, passwd y ACL, siguiendo la sección «Mosquitto nativo») y pasarle a B la contraseña del usuario `api`; `node_red/` como userDir con `@flowfuse/node-red-dashboard` y `credentialSecret` por variable de entorno | **Después, B:** esqueleto de Express con la estructura de clase, `docker-compose` con mongo, `/health`, conexión con Mongoose |
| **Mar 10** | Simulador v1: máquina de estados por jugador (parado, andando, trote, carrera, sprint); posición en un campo de 105×68 m; distancia; aceleración y giro; FC con retraso respecto al esfuerzo. Publica por MQTT | Modelos (Jugador, Lectura resumida cada 10 s, Evento, Alerta, Pauta, Sesión), seed de los 11 jugadores, `POST /api/telemetria`, CRUD de jugadores |
| **Mié 11** | Simulador v2: temperatura interna (sube con la carga y el calor), plantillas con línea base y LWT. Pasarela: suscripción `+/sensors/#`, validación, unión por segundo, POST y watchdog | Servicio de métricas (zonas, carrera de alta intensidad, sprints, aceleraciones y desaceleraciones, %FCmáx). Motor de alertas con las 9 reglas, que publica en MQTT y guarda en Mongo |
| **Jue 12** | **Hito 1: el núcleo funciona de extremo a extremo** (simulador → MQTT → pasarela → API → alerta → dashboard). Dashboard 2.0: semáforo por jugador, indicadores, lista de alertas con confirmación (POST) y formulario de pauta | Servidor WebSocket, endpoints de pauta, umbrales y sesiones, `openapi.yaml` con Swagger UI en `/api-docs` |
| **Vie 13** | Escenarios inyectables desde el dashboard (golpe de calor, asimetría creciente, incidente, sensor caído), flujo de Open-Meteo con WBGT estimado y POST a `/api/clima`, Telegram (opcional) | Web: ficha del jugador con gráficas históricas y campo 2D en vivo por WebSocket; endpoint `/fhir/Observation` |
| **Sáb 14** | **Hito 2: extras integrados. Código congelado a las 20:00.** Pulir el dashboard, exportar los flujos y sacar capturas. Empezar el diagrama de arquitectura | ACWR con un histórico de 4 semanas generado, colección de Postman, `docker-compose` final (api y Node-RED), README de arranque |
| **Dom 15** | **Juntos:** borrador completo del informe (cada uno sus secciones), guion y grabación del vídeo de 5 minutos, guion del TikTok. **Todo listo** | (juntos) |
| **Lun 16 – Mié 18** | **Margen:** clonar el repo en limpio en el otro portátil y arrancarlo, corregir fallos, repasar el texto, generar el ZIP y el PDF con el nombre que exige el enunciado, subir el vídeo a YouTube como oculto y publicar el TikTok | (juntos) |
| **Jue 19** | **Entrega** | |
| **Vie 20** | **Presentación.** Antes, un ensayo en el que cada uno explica el bloque del otro | |

**Sincronización diaria** de unos 15 minutos por la noche: qué se ha mergeado, qué bloquea y si se mantiene el hito.

**Si algo se retrasa**, se recorta en este orden: Telegram → Open-Meteo → ACWR → FHIR → campo 2D. El núcleo y el Dashboard 2.0 no se tocan, porque son los que aseguran los 7 puntos.

## Informe y vídeo

**Informe (PDF):**
1. Motivación smart health
2. Arquitectura (diagrama)
3. Simulación y MQTT (A)
4. Flujos de Node-RED con capturas (A)
5. API REST y cómo invocarla desde un cliente web o REST (B)
6. Motor de alertas y fuentes (B)
7. Base de datos, WebSockets y FHIR (B)
8. Dashboards (A y B)
9. Privacidad y seguridad: datos de salud según el art. 9 del RGPD, ACL del broker y autenticación de la API (A y B)
10. Pruebas y demo
11. Conclusiones
- Anexo: cómo ejecutarlo

**Vídeo de 5 minutos:**
- problema (30 s);
- arquitectura (45 s);
- demo (3 min): partido normal → escenario de calor → alerta → el médico la confirma y pone una pauta → la pauta se excede → Swagger y FHIR;
- cierre (30 s).

**TikTok opcional (+0,5):** versión corta, de 45 a 60 s, con la demo del golpe de calor.

## Entregables

- [ ] **ZIP** con el código y los flujos de Node-RED: `PracticalAssignment2627_Apellido1Nombre1_Apellido2Nombre2.zip`
- [ ] **PDF** del informe con capturas: `PracticalAssignment2627_Apellido1Nombre1_Apellido2Nombre2.pdf`
- [ ] Enlace al **vídeo** de 5 minutos (YouTube, oculto)
- [ ] **TikTok** (opcional, +0,5 si la nota es ≥5)
- [ ] Documento corto de la API: operaciones GET/POST y cómo invocarlas (Swagger + Postman + sección del informe)

## Cómo comprobamos que funciona (en cada hito)

- Mosquitto nativo en marcha con la configuración de `mosquitto/`, `docker compose up -d` (MongoDB), luego `node-red -u node_red` y `npm start` en `api/`.
- `mosquitto_sub -h localhost -u nodered -P <pass> -t '+/sensors/#' -v` muestra la telemetría. Sin credenciales, la conexión se rechaza.
- `curl` y Postman sobre GET/POST de jugadores, pauta y alertas. `/api-docs` carga.
- Lanzar el escenario "golpe de calor p8" desde el dashboard: en menos de 10 s aparece `CALOR_AMBAR` en el Dashboard 2.0 y en la web, y queda guardada en Mongo.
- Parar un jugador en el simulador: en 5 s salta `SIN_SENAL`.
- `GET /fhir/Observation?patient=p8&code=8867-4` devuelve Observations con código LOINC.
- El sábado 14 y el lunes 16: clonar el repo en limpio en el portátil del otro y que todo arranque solo siguiendo el README.
