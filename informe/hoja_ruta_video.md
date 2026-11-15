# Hoja de ruta del vídeo (5 minutos)

> **Lo que pide el enunciado:** un vídeo de 5 minutos que explique las funcionalidades más importantes del proyecto, **cómo funciona y sin detalles técnicos**, subido por ejemplo a YouTube como oculto. El enlace va en la entrega del jueves 19. Cuenta dentro de «Informe y vídeo» (3 puntos): tiene que estar completo y bien argumentado.

## 1. Qué tiene que estar listo antes de grabar

| Pieza | Quién | Si no llega a tiempo |
|---|---|---|
| Dashboard de simulación y `mqtt in` de `control/#` en el simulador | A | El golpe de calor se lanza desde Swagger (`PUT /api/simulador/jugadores/p8/sensores`), pero el simulador tiene que tener el `mqtt in` sí o sí |
| Dashboard médico | B (después del de A) | Confirmar y crear la pauta desde Swagger |
| Campograma, API, Swagger, Postman y FHIR | B | Ya está |
| Diagrama de arquitectura para la diapositiva | B | **Hecho:** `docs/diagramas/sistema-arquitectura.png`, con el camino del dato numerado del 1 al 8 |

## 2. Calendario

| Día | Qué |
|---|---|
| **Lun 16** | Ensayo completo con cronómetro, sin grabar. Ajustar el texto para que quepa en 5:00. Por la tarde, **grabar las tomas** (sección 5). |
| **Mar 17** | **Montaje**, subtítulos y primera versión. Verla los dos y apuntar cambios. Con las mismas tomas, montar el TikTok ([guion_tiktok.md](guion_tiktok.md)). |
| **Mié 18** | Versión final, **subir a YouTube como «Oculto»**, comprobar que el enlace se abre sin sesión iniciada y ponerlo en el PDF y en la entrega. Publicar el TikTok. |

## 3. Escaleta

| Tiempo | Bloque | Quién | En pantalla | Idea clave |
|---|---|---|---|---|
| 0:00–0:30 | **El problema** | A o los dos | Imagen de un partido con calor + título «Smart Health» | En un partido no se ve cuándo un jugador está al límite: golpe de calor, FC disparada, un golpe fuerte, sobrecarga… Queremos que el médico se entere al momento. |
| 0:30–1:15 | **Cómo está montado** | A | `sistema-arquitectura.png`, siguiendo los números del 1 al 8 | 11 jugadores con 6 sensores simulados en Node-RED → MQTT (Mosquitto) → pasarela → API REST → MongoDB. Las alertas vuelven por MQTT al médico y por WebSocket al campograma. |
| 1:15–1:45 | **El simulador** | A | Campograma con los 11 moviéndose; consola del Subscriber con los topics pasando | Cada jugador publica sus sensores cada segundo y se mueve según la fase de juego (4-2-3-1). |
| 1:45–2:15 | **Dashboard de simulación** | A | Su dashboard: cambia a «presión alta» (el equipo se adelanta en el campograma) y fuerza 39,4 °C y luego 40,5 °C a p8 | Desde aquí se cambia el comportamiento del simulador para provocar situaciones: la orden pasa por la API y llega al simulador por MQTT. |
| 2:15–3:35 | **Alertas y médico** | B | Campograma (aro ámbar → rojo), dashboard médico (aviso, confirmar, pauta), `PAUTA_EXCEDIDA` | Ver [guion_video_B.md](guion_video_B.md). |
| 3:35–4:00 | **API abierta y estándar** | B | Swagger, Postman *Collection Runner* en verde, FHIR | Cualquiera puede usar la API: está documentada y probada, y los datos clínicos salen en FHIR. |
| 4:00–4:35 | **Privacidad y seguridad** | A (broker) + B (API) | Diapositiva con 3 puntos | Datos de salud (art. 9 del RGPD): seudónimos `p1`…`p11`; broker con usuarios y ACL; API con clave por rol. |
| 4:35–5:00 | **Cierre** | Los dos | Campograma en vivo de fondo + lista de tecnologías | Qué hemos conseguido: MQTT, Node-RED, API REST, MongoDB, WebSockets, dashboards y FHIR trabajando juntos. |

**Ritmo:** unas 130 palabras por minuto. Si un bloque se pasa, se recorta texto, no se acelera la voz.

## 4. Preparación técnica (el día de grabar)

- [ ] `arrancar-todo.cmd -Limpiar` y esperar **1 minuto** antes de la primera toma (la asimetría y el histórico necesitan datos).
- [ ] Ventanas preparadas: campograma, dashboard de simulación, dashboard médico, Swagger con las peticiones ya escritas, Subscriber con `control/#` y `sensors/eq1/alertas`.
- [ ] **Nada de claves en pantalla:** el *Authorize* de Swagger se rellena antes de grabar; no abrir el `.env`; en Postman, las variables de clave sin mostrar.
- [ ] Pantalla a 1920×1080, zoom del navegador al 125 % para que se lea, notificaciones de Windows desactivadas (Asistente de concentración), barra de marcadores oculta.
- [ ] Antes de cada toma de alertas: `POST /api/simulador/reiniciar` y confirmar las alertas que queden, para empezar en verde.

## 5. Tomas que hay que grabar

Mejor grabar **por bloques** (si una sale mal, se repite solo esa) y **la voz aparte**, encima del montaje.

| # | Toma | Duración útil | Sirve para |
|---|---|---|---|
| 1 | Campograma con el equipo moviéndose (sin alertas) | 30 s | Vídeo (1:15) y TikTok |
| 2 | Subscriber con los topics pasando | 10 s | Vídeo |
| 3 | Dashboard de simulación: cambio de fase y el equipo adelantándose en el campograma | 20 s | Vídeo |
| 4 | Golpe de calor completo: forzar 39,4 °C → aro ámbar → 40,5 °C → aro rojo, y el aviso en el dashboard médico | 40 s | Vídeo y TikTok |
| 5 | El médico confirma y pone la pauta; salta `PAUTA_EXCEDIDA` | 40 s | Vídeo y TikTok |
| 6 | Swagger, Postman *Collection Runner* (todo en verde) y FHIR | 30 s | Vídeo |
| 7 | **Para el TikTok:** la toma 4 con la ventana estrecha (como un móvil), centrada en p8 | 30 s | TikTok |

## 6. Herramientas

- **Grabar la pantalla:** OBS Studio (gratis) o la Herramienta Recortes de Windows 11 (`Win + Mayús + R`, graba vídeo).
- **Voz:** con unos auriculares con micro en una habitación sin eco; mejor leída del guion que improvisada.
- **Montaje:** Clipchamp (viene con Windows 11) o DaVinci Resolve. Subtítulos automáticos en Clipchamp y revisarlos a mano. Música, si se pone, sin derechos (la biblioteca de Clipchamp o la de YouTube) y muy baja.
- **Zoom:** acercar la imagen cuando se habla de algo pequeño (el aro del jugador, el aviso del dashboard, el código de la alerta).

## 7. Publicación

1. YouTube → *Crear* → *Subir vídeo* → visibilidad **«Oculto»** (se ve con el enlace y no sale en búsquedas).
2. Título: «Smart Health · Practical Assignment IoT 2026/27». En la descripción, los nombres y una línea por bloque con su minuto (capítulos: `0:00 El problema`, `0:30 Arquitectura`…).
3. Abrir el enlace en una ventana de incógnito para comprobar que se ve.
4. Poner el enlace en el PDF (portada o anexo) y en la entrega.

## 8. Antes de darlo por bueno

- [ ] Dura **5:00 o menos**.
- [ ] Se entiende sin saber programar: qué problema resuelve y cómo funciona.
- [ ] Salen todas las piezas que puntúan: Express con REST, Mosquitto con MQTT, varios nodos de Node-RED, dashboards, y los extras (WebSockets, MongoDB, FHIR).
- [ ] No aparece ninguna clave, contraseña ni nombre real de jugador.
- [ ] Subtítulos revisados y audio claro.
