# Smart Health: monitorización de futbolistas con IoT

Trabajo práctico de Internet de las Cosas (UCA, curso 2026/27).

Once futbolistas llevan wearables simulados en Node-RED: GPS, acelerómetro, giroscopio, pulsómetro, temperatura interna y plantillas de presión. Los datos viajan por MQTT a una API REST en Node.js y Express, que los guarda en MongoDB, aplica las reglas de alerta y avisa al cuerpo médico.

```
Simulador (Node-RED) ──MQTT──► Mosquitto ──MQTT──► Pasarela (Node-RED) ──POST──► API Express ──► MongoDB
                                    ▲                                              │
                                    └──────────── alertas (MQTT, QoS 1) ◄──────────┤
                                                                                   └──WebSocket──► web y dashboard
```

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
   Comprueba que responde en `http://localhost:3000/health`.

5. **Datos iniciales** (los 11 jugadores y la pauta de p5). Con `-- --limpiar` borra también lecturas, eventos, alertas y sesiones:
   ```bash
   cd api && npm run seed
   ```

6. **Node-RED:** ver `node_red/` (lo documenta A).

### Probar la API sin Node-RED

`fake-gateway` imita a la pasarela: cada segundo manda un lote con los 11 jugadores a `POST /api/telemetria`. Los escenarios se activan por jugador:

```bash
cd api && npm run fake-gateway -- --calor p8 --asimetria p5 --incidente p3 --sin-senal p10
```

| Opción | Qué simula |
|---|---|
| `--calor p8` | Temperatura interna que sube de 38,8 a 40,6 °C |
| `--fc-alta p7` | FC sostenida en torno al 95 % de la FCmáx |
| `--desacople p6` | FC al 89 % de la FCmáx mientras camina |
| `--asimetria p5` | El reparto de carga entre pies se desequilibra poco a poco |
| `--incidente p3` | A los 15 s, impacto de 6,5 g; después se queda inmóvil y la FC cae |
| `--sin-senal p10` | A los 10 s deja de llegar señal |
| `--recuperacion p9` | Sprint de 10 s y después camina, pero la FC apenas baja. La alerta salta 60 s después |
| `--sobrecarga p4` | Arranca y frena sin parar: unas 20 acciones de alta intensidad por minuto |
| `--duracion 60` | Se para a los 60 s |

Con todos los escenarios menos `--sobrecarga`, en menos de 90 s saltan 9 de las 10 alertas. Para verlas llegar por MQTT:

```bash
mosquitto_sub -h localhost -u nodered -P <contraseña-nodered> -t "sensors/#" -v
```

Con el Mosquitto por defecto (sin la configuración del proyecto) no hacen falta `-u` ni `-P`.

`SOBRECARGA` necesita 120 acciones en la sesión, unos 6 minutos con `--sobrecarga`. Para la demo se baja el umbral del jugador a 20 con `PUT /api/jugadores/p4/umbrales` y `{"sobrecargaAcciones": 20}`, y salta en algo más de un minuto. `npm run seed` vuelve a dejar los umbrales por defecto.

### Tests

```bash
cd api && npm test
```

## Estructura

| Carpeta | Contenido |
|---|---|
| `api/` | API REST en Express, WebSocket, modelos de Mongoose y motor de alertas |
| `api/public/` | Web propia: plantilla, campo 2D y ficha del jugador |
| `node_red/` | Flujos del simulador, la pasarela y el dashboard |
| `mosquitto/` | Configuración del broker, usuarios y ACL |
| `docs/contratos/` | Contratos entre las dos partes: API, alertas y MQTT |
| `informe/` | Informe y material del vídeo |

## Documentación

- [Contrato de la API REST](docs/contratos/api.md)
- [Contrato de alertas](docs/contratos/alertas.md)
- [Planning](PLANNING.md)
