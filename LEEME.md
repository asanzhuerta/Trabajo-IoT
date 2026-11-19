# Smart Health: cómo arrancarlo

## Requisitos

- Node.js 24
- Docker Desktop (solo para MongoDB)
- Mosquitto 2.1
- Node-RED 5, instalado de forma global (`npm install -g node-red`)

## 1. Configuración (solo la primera vez)

El `.env` y `mosquitto/passwd` ya vienen preparados con contraseñas y claves de demostración que coinciden entre sí. Solo hay que instalar las dependencias de la API:

```
cd api
npm install
```

Si cambias `MQTT_PASS` o `NODERED_MQTT_PASS` en el `.env`, vuelve a crear `mosquitto/passwd` con las nuevas:

```
mosquitto_passwd -c -b mosquitto/passwd nodered <NODERED_MQTT_PASS>
mosquitto_passwd -b mosquitto/passwd api <MQTT_PASS>
```

## 2. Arranque rápido (Windows)

Abre Docker Desktop y haz doble clic en `arrancar-todo.cmd`. Se abre Windows Terminal con una pestaña por pieza y, cuando todo está listo, el navegador con las páginas.

## 3. Arranque paso a paso

Desde la raíz del proyecto, cada comando en su propia consola:

```
docker compose up -d                        # MongoDB
net stop mosquitto                          # como administrador, si Mosquitto corre como servicio
mosquitto -c mosquitto/mosquitto.conf -v    # broker con usuarios y ACL
cd api && npm run seed                      # carga los 11 jugadores
cd api && npm run dev                       # API en el puerto 3000
node node_red/arrancar.js                   # simulador y pasarela de Node-RED
```

## Direcciones

| Página | Dirección |
|---|---|
| Campograma | http://localhost:3000 |
| Dashboard médico | http://localhost:3000/medico.html |
| Botonera de simulación | http://localhost:3000/control.html |
| Swagger | http://localhost:3000/api-docs |
| Editor de Node-RED | http://localhost:1880 |

La colección de Postman está en `docs/postman_collection.json`. Los tests se lanzan con `npm test` dentro de `api/`.
