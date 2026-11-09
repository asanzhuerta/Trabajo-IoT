# Smart Health: monitorización de futbolistas con IoT

Trabajo práctico de Internet de las Cosas (UCA, curso 2026/27).

Once futbolistas llevan wearables simulados en Node-RED: GPS, acelerómetro, giroscopio, pulsómetro, temperatura interna y plantillas de presión. Los datos viajan por MQTT a una API REST en Node.js y Express, que los guarda en MongoDB, aplica las reglas de alerta y avisa al cuerpo médico.

```
Simulador (Node-RED) ──MQTT──► Mosquitto ──MQTT──► Pasarela (Node-RED) ──POST──► API Express ──► MongoDB
                                    ▲                                              │
                                    └──────────── alertas (MQTT, QoS 1) ◄──────────┤
                                                                                   └──WebSocket──► web y dashboard
```

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

3. **Mosquitto con la configuración del proyecto.** En una consola de administrador, desde la raíz del repo:
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

5. **Node-RED:** ver `node-red/` (lo documenta A).

## Estructura

| Carpeta | Contenido |
|---|---|
| `api/` | API REST en Express, WebSocket, modelos de Mongoose y motor de alertas |
| `api/public/` | Web propia: plantilla, campo 2D y ficha del jugador |
| `node-red/` | Flujos del simulador, la pasarela y el dashboard |
| `mosquitto/` | Configuración del broker, usuarios y ACL |
| `docs/contratos/` | Contratos entre las dos partes: API, alertas y MQTT |
| `informe/` | Informe y material del vídeo |

## Documentación

- [Contrato de la API REST](docs/contratos/api.md)
- [Contrato de alertas](docs/contratos/alertas.md)
- [Planning](PLANNING.md)
