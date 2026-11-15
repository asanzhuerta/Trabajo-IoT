# Vídeo: guion de la parte de B

> Es el bloque de B dentro del vídeo de 5 minutos (escaleta completa en [hoja_ruta_video.md](hoja_ruta_video.md)). B cuenta la parte de **alertas → confirmación → pauta → pauta excedida**, y después **Swagger y FHIR**. Unos 1 min 45 s, del 2:15 al 4:00.

## Antes de grabar

1. Base de datos vacía: `.\arrancar-todo.ps1 -Limpiar` (o `node scripts/seed.js --limpiar` en `api/`).
2. Todo arrancado con `arrancar-todo.cmd` y esperar 1 minuto: la asimetría necesita 45 s de datos y conviene que haya algo de histórico.
3. **El golpe de calor** lo lanza A justo antes (desde su dashboard de simulación): 39,4 °C a p8 y, a los pocos segundos, 40,5 °C, con `durationSeconds: 120`. Si su dashboard no está, desde Swagger: `PUT /api/simulador/jugadores/p8/sensores`.
4. **La confirmación y la pauta**, desde el **dashboard médico**. Si no está a tiempo, desde **Swagger** (`http://localhost:3000/api-docs`, *Authorize* con la clave del médico **fuera de cámara**). Dejar las peticiones ya escritas para no teclear en directo.
5. Pestañas abiertas, en este orden: campograma, dashboard médico, Subscriber (`sensors/eq1/alertas`), Swagger y la URL de FHIR.

## Guion (≈ 1 min 45 s)

| Tiempo | En pantalla | Qué digo |
|---|---|---|
| 2:15 | Campograma: el aro de p8 se pone ÁMBAR | "La temperatura del 8 ha pasado de 39 grados. La API recibe un lote por segundo y evalúa diez reglas para cada jugador: salta la alerta de calor." |
| 2:30 | El aro pasa a ROJO y late; en el dashboard médico aparece la notificación; en el Subscriber, el mensaje en `sensors/eq1/alertas` | "A 40 grados ya es crítica. La alerta se guarda en MongoDB, se publica por MQTT para el dashboard del médico y llega por WebSocket al campograma, todo en el mismo segundo." |
| 2:50 | El médico confirma la alerta | "El médico la confirma: queda registrado quién y cuándo, y durante un minuto no se repite, para no saturarle." |
| 3:05 | Crea una pauta para p8 con `velMax: 20` | "Y le pone una pauta: como máximo 20 km/h en lo que queda de sesión." |
| 3:20 | Salta `PAUTA_EXCEDIDA` cuando p8 pasa de 20 km/h | "En cuanto la supera, la API avisa: pauta excedida, con la velocidad y el límite." |
| 3:35 | Swagger: la lista de rutas y *Try it out* en `GET /api/jugadores/p8/estado` | "Toda la API está documentada en Swagger, y hay una colección de Postman con 43 peticiones que se comprueban solas." |
| 3:50 | `GET /fhir/Observation?patient=p8&code=8867-4` | "Y para la historia clínica, las constantes vitales salen en FHIR, el estándar de los hospitales. El paciente es un seudónimo: nunca guardamos nombres." |

El TikTok tiene su propio guion: [guion_tiktok.md](guion_tiktok.md).
