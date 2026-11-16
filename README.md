# Smart Health: monitorización de futbolistas con IoT

Trabajo práctico de Internet de las Cosas (UCA, curso 2026/27).

Once futbolistas llevan wearables simulados en Node-RED: GPS, acelerómetro, giroscopio, pulsómetro, temperatura interna y plantillas de presión. Los datos viajan por MQTT a una API REST en Node.js y Express, que los guarda en MongoDB, aplica las reglas de alerta y avisa al cuerpo médico.

```
Simulador (Node-RED) ──MQTT──► Mosquitto ──MQTT──► Pasarela (Node-RED) ──POST──► API Express ──► MongoDB
                                    ▲                                              │
                                    └──────────── alertas (MQTT, QoS 1) ◄──────────┤
                                                                                   └──WebSocket──► web y dashboard
```

> **Para arrancarlo todo de golpe**, haz doble clic en `arrancar-todo.cmd`: se abre una ventana de Windows Terminal con una pestaña por pieza, cada una con su historial de comandos, y cuando la API está lista se abre el campograma (`http://localhost:3000`) en el navegador. Node-RED carga solo los flujos nuevos del repo.
>
> **Para probar lo que hay hasta ahora** (lo de A y lo de B juntos), sigue [TUTORIAL_DEV.md](TUTORIAL_DEV.md) en la rama `dev`.

## Requisitos

| Herramienta | Versión probada |
|---|---|
| Node.js | 24 |
| Docker Desktop | 29 (solo para MongoDB) |
| Mosquitto | 2.1, instalado en Windows como servicio |
| Node-RED | 5 |

## Arranque

1. **Variables de entorno.** Copia `.env.example` como `.env` en la raíz y rellena las contraseñas y claves.

2. **MongoDB:**
   ```bash
   docker compose up -d
   ```

3. **Mosquitto con la configuración del proyecto.** `mosquitto/passwd` no se sube al repo: pídeselo a A y ponlo en `mosquitto/`. En `.env`, `MQTT_PASS` es la contraseña del usuario `api`. Después, en una consola de administrador, desde la raíz del repo:
   ```bash
   net stop mosquitto
   ```
   ```bash
   mosquitto -c mosquitto/mosquitto.conf -v
   ```

4. **API:**
   ```bash
   cd api && npm install && npm run dev
   ```
   Comprueba que responde en `http://localhost:3000/health`. La documentación interactiva (Swagger) está en `http://localhost:3000/api-docs` y el **campograma** (los 11 jugadores en el campo, con su semáforo y sus alertas en vivo) en `http://localhost:3000`.

5. **Datos iniciales** (los 11 jugadores y la pauta de p5). Con `-- --limpiar` borra también lecturas, eventos, alertas y sesiones:
   ```bash
   cd api && npm run seed
   ```

6. **Node-RED:** ver `node_red/` (lo documenta A).

### Provocar alertas: control del simulador

Con todo en marcha, la API puede forzar el pulso o la temperatura que publica un jugador del simulador de A, durante los segundos que se indiquen. La orden va por MQTT (`control/jugadores/<id>/sensores`) y el simulador la recibe con un `mqtt in`. Es lo que usa el dashboard de simulación, y también se puede lanzar desde Swagger (sección *Simulador*) o Postman (carpeta *Simulador*):

```powershell
# Golpe de calor a p8 durante 60 s: saltan CALOR_AMBAR y CALOR_ROJA
Invoke-RestMethod -Method Put -Uri http://localhost:3000/api/simulador/jugadores/p8/sensores -ContentType "application/json" -Body '{"temperature": 40.5, "durationSeconds": 60}'
# Quitarlo antes de tiempo
Invoke-RestMethod -Method Delete -Uri http://localhost:3000/api/simulador/jugadores/p8/sensores
# Cambiar la fase de juego de todo el equipo
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/simulador/fase -ContentType "application/json" -Body '{"fase": "presion_alta"}'
```

Qué ajuste provoca cada alerta, rangos y errores: [contrato de la API](docs/contratos/api.md#control-del-simulador-dashboard-de-simulación--api--mqtt--simulador). Para ver las órdenes y las alertas pasar por el broker:

```bash
mosquitto_sub -h localhost -u nodered -P <contraseña-nodered> -t "control/#" -t "sensors/#" -v
```

`SOBRECARGA` necesita 120 acciones de alta intensidad en la sesión. Para la demo se baja el umbral del jugador con `PUT /api/jugadores/p4/umbrales` y `{"sobrecargaAcciones": 20}`. `npm run seed` vuelve a dejar los umbrales por defecto.

### Tests

```bash
cd api && npm test
```

### Documentación de la API y Postman

- **Swagger:** `http://localhost:3000/api-docs`. Pulsa *Authorize*, pon la clave del médico o de la pasarela (las del `.env`) y prueba cualquier endpoint desde ahí. La especificación está en `api/openapi.yaml`.
- **Postman:** importa `docs/postman_collection.json`. En las variables de la colección, pon en *Current value* `claveMedico` y `clavePasarela`. Se puede lanzar entera con el *Collection Runner*: cada petición comprueba su código de respuesta y la carpeta «Errores» enseña los 400, 401, 403, 404 y 409. La colección se regenera con `node scripts/generar-postman.js` desde `api/`.
- **Sesiones:** `POST /api/sesiones` con `{"tipo": "entrenamiento", "nombre": "…"}` para empezar una y `POST /api/sesiones/<id>/fin` para cerrarla y guardar el resumen de cada jugador.

## Estructura

| Carpeta | Contenido |
|---|---|
| `api/` | API REST en Express, WebSocket, modelos de Mongoose y motor de alertas |
| `api/public/` | Web propia: el campograma, servido en `http://localhost:3000` (ver su [README](api/public/README.md)) |
| `node_red/` | Flujos de Node-RED: simulador (`flows.json`, de A), pasarela MQTT → API (`flows_pasarela.json`) y dashboard médico en `/dashboard/medico` (`flows_medico.json`, de B) |
| `mosquitto/` | Configuración del broker, usuarios y ACL |
| `docs/contratos/` | Contratos entre las dos partes: API, alertas y MQTT |
| `informe/` | Informe y material del vídeo |

## Documentación

- [Contrato de la API REST](docs/contratos/api.md)
- [Contrato de alertas](docs/contratos/alertas.md)
- [Planning](PLANNING.md)
