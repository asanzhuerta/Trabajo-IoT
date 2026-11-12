# Vídeo: guion de la parte de B

> Vídeo de 5 minutos: problema (30 s) · arquitectura (45 s) · **demo (3 min)** · cierre (30 s). B cuenta en la demo la parte de **alertas → confirmación → pauta → pauta excedida**, y después **Swagger y FHIR**. Unos 1 min 45 s.

## Antes de grabar

1. Base de datos vacía: `.\arrancar-todo.ps1 -Limpiar` (o `node scripts/seed.js --limpiar` en `api/`).
2. Todo arrancado con `arrancar-todo.cmd` y esperar 1 minuto: la asimetría necesita 45 s de datos y conviene que haya algo de histórico.
3. Para la confirmación y la pauta:
   - con el **Dashboard 2.0 de A**, si ya está: confirmar y crear la pauta desde él;
   - si no, desde **Swagger** (`http://localhost:3000/api-docs`, *Authorize* con la clave del médico). Dejar las peticiones ya escritas para no teclear en directo.
4. El golpe de calor:
   - con el **escenario del dashboard de A**, si ya está;
   - si no, con el fake-gateway en otra consola: `node scripts/fake-gateway.js --calor p8 --duracion 120`. Ojo: el fake-gateway y el simulador de A mandan los dos datos de los mismos jugadores, así que para esta toma conviene parar el Node-RED.
5. Pestañas abiertas: la consola de «Mirar p8» (`node scripts/vigilar.js p8`), la del Subscriber (`#` del broker), Swagger y la URL de FHIR.

## Guion (≈ 1 min 45 s)

| Tiempo | En pantalla | Qué digo |
|---|---|---|
| 0:00 | Consola de `vigilar.js p8`: el semáforo en VERDE y la temperatura subiendo | "El jugador 8 está en un día de calor y su temperatura interna va subiendo. La API recibe un lote por segundo de la pasarela y evalúa diez reglas para cada jugador." |
| 0:15 | Salta `CALOR_AMBAR`; el semáforo pasa a ÁMBAR. En el Subscriber, el mensaje en `sensors/eq1/alertas` | "Al pasar de 39 °C salta la alerta de calor. Se guarda en MongoDB, se publica por MQTT con QoS 1 para el dashboard del médico y se envía por WebSocket a la web." |
| 0:35 | Confirmar la alerta (dashboard o `POST /api/alertas/{id}/confirmar` en Swagger) | "El médico la confirma: queda registrado quién y cuándo, y durante un minuto no se vuelve a lanzar, para no saturarle." |
| 0:50 | Crear una pauta (`POST /api/jugadores/p8/pauta` con `velMax: 20`) | "Y le pone una pauta de readaptación: como máximo 20 km/h en lo que queda de sesión." |
| 1:05 | Salta `PAUTA_EXCEDIDA` cuando p8 pasa de 20 km/h | "En cuanto la supera, la API avisa: pauta excedida, con la velocidad y el límite." |
| 1:15 | Swagger: la lista de rutas y *Try it out* en `GET /api/jugadores/p8/estado` | "Toda la API está documentada en Swagger con OpenAPI, y hay una colección de Postman con 38 peticiones que se prueban solas." |
| 1:30 | `GET /fhir/Observation?patient=p8&code=8867-4` | "Y para la historia clínica, las constantes vitales salen en FHIR R4, como Observation con códigos LOINC, que es como las leería un hospital. El paciente es un seudónimo: nunca guardamos nombres." |

## Si sobra tiempo o para el TikTok (45–60 s)

Solo el golpe de calor: semáforo verde → ámbar → rojo (`CALOR_ROJA` a 40 °C) → el médico confirma.
