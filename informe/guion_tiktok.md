# Guion del TikTok

> **Opcional en el enunciado:** una versión corta y llamativa de la demo; suma **+0,5** si la nota es 5 o más. Formato vertical **9:16 (1080×1920)**, **45–55 s**. Una sola historia: **la camiseta avisa al médico antes del golpe de calor.**

## Idea

Un jugador se está «cocinando» en pleno partido y nadie lo ve… menos nuestro sistema. En menos de un minuto se ve el problema, la alerta saltando y al médico actuando. La tecnología sale de pasada, al final, en ráfaga.

## Guion

| Tiempo | Imagen (vertical) | Texto en pantalla | Voz (opcional) |
|---|---|---|---|
| 0:00–0:03 | Primer plano del campograma, el #8 corriendo. Zoom rápido hacia él | **«Este jugador está a punto de sufrir un golpe de calor 🥵»** | «Este jugador está a punto de sufrir un golpe de calor… y él no lo sabe.» |
| 0:03–0:08 | Los 11 jugadores moviéndose | «11 jugadores · 6 sensores cada uno · datos cada segundo» | «Cada jugador lleva sensores: pulso, temperatura, GPS…» |
| 0:08–0:14 | Dashboard de simulación: se pulsa para subir la temperatura del #8 | «Le subimos la temperatura 🔥» | «Vamos a subirle la temperatura.» |
| 0:14–0:20 | El aro del #8 pasa a **ámbar**. Contador: 39,4 °C | «39 °C → ⚠️ AVISO» | «A 39 grados, aviso.» |
| 0:20–0:27 | El aro pasa a **rojo** y late. Notificación en el dashboard médico (con un «ding») | «40 °C → 🚨 ALERTA CRÍTICA» | «A 40, alerta crítica. El médico lo sabe en el mismo segundo.» |
| 0:27–0:35 | El médico confirma y pone la pauta «máx. 20 km/h» | «El médico actúa 👨‍⚕️» | «Lo confirma y le pone un límite de velocidad.» |
| 0:35–0:42 | El #8 corre más de la cuenta → `PAUTA_EXCEDIDA` | «Y si se pasa… 👀 te pillo» | «Y si se lo salta… también avisa.» |
| 0:42–0:50 | Ráfaga de 1 s por pantalla: Node-RED, Mosquitto, Swagger, MongoDB, campograma | «MQTT · Node-RED · API REST · MongoDB · WebSockets» | «Todo con IoT, en tiempo real.» |
| 0:50–0:55 | Campograma con todos en verde + título | **«Smart Health ⚽ · IoT UCA»** | — |

## Cómo grabarlo en vertical

- Reutilizar las **tomas 1, 4 y 5** del vídeo largo ([hoja_ruta_video.md](hoja_ruta_video.md)) y la **toma 7**, que se graba ya con la ventana estrecha.
- Para la toma 7: navegador con la ventana estrecha (o las herramientas de desarrollo en modo móvil, 390×844) y el campograma centrado en el #8.
- En el montaje (CapCut o Clipchamp), lienzo 9:16 y recortar cada toma; el campograma horizontal se puede poner arriba y el dashboard abajo.
- **Zona segura:** nada importante en el 20 % de abajo ni en la franja derecha (ahí van los botones de TikTok).

## Estilo

- **Gancho en los 3 primeros segundos:** el texto grande y el zoom al #8. Si no engancha ahí, se pierde.
- Cortes cada 3–5 s, zooms en el aro del jugador y en el aviso, y subtítulos grandes (en TikTok mucha gente lo ve sin sonido).
- Sonido: un «ding» o una sirena suave cuando salta la alerta. Música de la **biblioteca comercial de TikTok** (sin derechos), baja si hay voz.
- Nada de claves, contraseñas ni nombres reales en pantalla.

## Publicación

- **Texto:** «¿Y si la camiseta avisara al médico antes de un golpe de calor? 🥵⚽ Proyecto de IoT: sensores simulados, MQTT, Node-RED y una API que avisa en tiempo real.»
- **Hashtags:** #IoT #SmartHealth #NodeRED #MQTT #fútbol #ingeniería #UCA
- Poner el enlace en la entrega junto al del vídeo de YouTube.
