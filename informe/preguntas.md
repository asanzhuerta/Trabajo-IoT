# 30 preguntas que nos puede hacer el profesor

> Respuesta corta primero y, si pregunta más, el porqué. Los números están comprobados con el código y la memoria.

## Enunciado y planteamiento

**1. ¿Qué tiene que ver esto con una smart city?**
La salud de quienes viven en la ciudad y las instalaciones donde hacen deporte forman parte de ella; Smart Health es una de las áreas IoT de las transparencias de clase. Es el mismo patrón: sensores, red, análisis y actuación en tiempo real.

**2. ¿Por qué los datos son simulados?**
No tenemos wearables reales. El simulador es coherente: los seis sensores de cada jugador salen de un único estado de movimiento y los once se mueven coordinados por un motor táctico. La API valida tipo, unidad y rango, así que aceptaría igual datos reales con el mismo formato.

**3. ¿Qué pide el enunciado y dónde está cada cosa?**
API REST en Express (GET/POST, y además PUT/DELETE), broker Mosquitto con MQTT, flujos de Node-RED que interoperan con la API y el broker, y un dashboard con las alertas. Extras: WebSockets, MongoDB, HL7 FHIR, Swagger y Postman.

**4. ¿Qué es lo más difícil que habéis resuelto?**
Que el motor de alertas no diera falsos positivos con un simulador realista: `SOBRECARGA` y `ASIMETRIA` saltaban solas. Lo medimos en partidos simulados y ajustamos los umbrales; después, tres partidos de dos horas sin falsas alarmas.

## Arquitectura

**5. Cuéntame el camino de un dato.**
Sensor → MQTT `p8/sensors/thermometer` → Mosquitto → pasarela de Node-RED (un lote por segundo) → `POST /api/telemetria` → validación, estado en vivo, 10 reglas, resumen en MongoDB → alerta por MQTT (QoS 1) y por WebSocket al dashboard y al campograma.

**6. ¿Por qué la pasarela hace POST y no se suscribe Express directamente al broker?**
Node-RED queda como capa edge y la API no depende de los topics. Junta 66 mensajes por segundo en una petición, el watchdog de «sin señal» está donde están los datos y la API se puede probar sin broker (Swagger, Postman).

**7. ¿Por qué el navegador no se conecta al broker?**
El navegador no habla MQTT por TCP: habría que abrir el broker con MQTT sobre WebSocket. Así las órdenes pasan por la API, se validan en un solo sitio y el broker sigue cerrado con su ACL.

**8. ¿Esto escala a varios equipos o a un estadio entero?**
El topic ya lleva el equipo (`sensors/eq1/alertas`), pero la API guarda el estado en vivo de cada jugador en su memoria. Para escalar: un broker en clúster, varias instancias de la API repartidas por equipo y el estado en vivo en algo compartido (por ejemplo Redis). Hoy es un prototipo en local.

## MQTT y Mosquitto

**9. Explica los niveles de QoS y por qué usáis cada uno.**
0: como mucho una vez; 1: al menos una vez (PUBACK); 2: exactamente una vez (cuatro pasos). Telemetría con QoS 0 porque llega otra al segundo; alertas y órdenes con QoS 1 porque no se pueden perder; si una alerta llega repetida, se reconoce por su id.

**10. ¿Usáis retain o last will? ¿Por qué no?**
No. Retain repetiría la última alerta a cada suscriptor nuevo. El last will va por conexión, no por jugador; la caída de un sensor concreto la detecta el watchdog de la pasarela (5 s sin datos → `SIN_SENAL`).

**11. ¿Cómo está protegido el broker?**
`allow_anonymous false`, usuarios con contraseña con hash (`mosquitto_passwd`) y ACL de mínimo privilegio: `nodered` publica sensores y solo lee `control/#`; `api` solo puede escribir alertas y órdenes, y no lee nada.

**12. ¿Qué pasa si se cae el broker?**
mqtt.js reconecta solo y guarda en cola las alertas QoS 1. Mientras tanto no llegan lotes, la API lo refleja en `/health` y, al volver, sigue como si nada.

## Node-RED

**13. ¿Qué nodos de Node-RED habéis usado?**
`inject`, `function`, `switch`, `json`, `mqtt in`, `mqtt out`, `http request`, `debug` y `comment`, en dos flujos: el simulador (motor táctico + 11 jugadores) y la pasarela hacia la API.

**14. ¿Cómo se coordinan los once jugadores?**
Un nodo function, el motor táctico, simula un partido en un 4-2-3-1 con cinco fases de juego temporizadas, mueve el balón y calcula para cada jugador un objetivo y una velocidad según su rol. Cada segundo manda once órdenes, una por jugador.

**15. ¿Dónde están las contraseñas del broker en Node-RED?**
En ningún nodo: solo aparecen `${NODERED_MQTT_USER}` y `${NODERED_MQTT_PASS}`, que se leen del `.env` al arrancar con `node_red/arrancar.js`.

## API REST

**16. ¿Qué operaciones tiene la API y cómo se invocan?**
21 rutas, documentadas en Swagger (`/api-docs`): telemetría, jugadores, perfil y umbrales, estado en vivo, histórico, ACWR, pautas, alertas, sesiones, simulador, FHIR y `/health`. Se prueban desde Swagger, la colección de Postman (47 peticiones), curl o un cliente web con `fetch`.

**17. ¿Qué códigos de error devuelve?**
400 si el cuerpo no es válido (dice el campo), 401 sin clave o clave mala, 403 si la clave no tiene ese rol, 404, 409 si ya existe o ya está confirmada y 503 si no hay MongoDB o broker. Las rutas FHIR devuelven `OperationOutcome`.

**18. ¿Por qué WebSocket y no que la web pregunte cada segundo?**
Con polling, cada página haría una petición por segundo aunque no haya nada nuevo y una alerta tardaría hasta un segundo más. El WebSocket comparte puerto con la API y empuja la telemetría a 1 Hz y cada alerta en cuanto se genera.

**19. ¿Cómo lo habéis probado?**
69 tests con `node:test` sobre las partes puras (validación, reglas, antirrebote, ACWR, FHIR…), las 47 peticiones de Postman con sus comprobaciones, un partido de 90 minutos por toda la cadena y el repositorio arrancado desde cero en otro equipo.

## Alertas y datos

**20. ¿De dónde salen los umbrales?**
De la literatura: 39 °C empeora el rendimiento y 40 °C es criterio de golpe de calor; bajar 12 lpm o menos en el primer minuto tras el esfuerzo es mala recuperación; ±3 m/s² es alta intensidad. Cada jugador tiene su copia y el médico la ajusta.

**21. ¿Cómo evitáis que una alerta se repita sin parar?**
Antirrebote: no se repite para el mismo jugador mientras siga activa ni durante los 60 s siguientes a que el médico la confirme. Las alertas no caducan: siguen activas hasta que el médico las confirma o las trata.

**22. ¿Qué hace el botón «Enfriar»?**
La API baja la temperatura del simulador paso a paso hasta 37,5 °C (ocho pasos, uno cada 5 s), imitando el enfriamiento en el sitio de un golpe de calor; al llegar, cierra sola las alertas de calor con una nota. «Reposo» hace lo mismo con el pulso, hasta 85 lpm.

**23. ¿Por qué MongoDB y una colección time-series?**
Son medidas en el tiempo de muchos jugadores: la time-series las agrupa por jugador y por tiempo, ocupan menos y el histórico por rango de fechas es más rápido. Además los documentos encajan con el JSON de los sensores.

**24. ¿Por qué no guardáis cada mensaje?**
Un partido son 356.400 mensajes. Guardamos un resumen cada 10 s por jugador (unos 5.940 documentos) y el último valor de cada sensor vive en memoria para el tiempo real.

**25. ¿Qué es el ACWR y es fiable?**
Carga de los últimos 7 días entre la media semanal de 28. Entre 0,8 y 1,3 se considera la zona óptima (Gabbett 2016), pero está discutido (Impellizzeri 2020): lo usamos para ver picos de carga, no para predecir lesiones.

## Interoperabilidad, seguridad y futuro

**26. ¿Qué es HL7 FHIR y cómo lo usáis?**
El estándar para intercambiar datos clínicos entre sistemas sanitarios. `GET /fhir/Observation` devuelve las constantes como recursos `Observation` de signos vitales: frecuencia cardiaca con LOINC 8867-4 y temperatura con 8310-5, unidades UCUM, en un `Bundle`. No es un servidor FHIR completo: no hay recurso `Patient`.

**27. Son datos de salud: ¿qué habéis hecho con la privacidad?**
Son categoría especial (art. 9 del RGPD). Seudónimos `p1`–`p11` en topics y base de datos, ningún nombre, solo resúmenes, broker cerrado con ACL y API keys con dos roles comparadas en tiempo constante.

**28. Si cualquiera abre el dashboard médico, ¿actúa como médico?**
Sí, y es una decisión consciente para que la demo vaya fluida: la API le pasa la clave desde el `.env` y en el código de la web no hay ninguna. Por eso esa página no se comparte por el túnel. En producción iría con usuario y contraseña del médico (OAuth 2.0 / OpenID Connect).

**29. ¿Qué haría falta para llevarlo a producción?**
Wearables reales, HTTPS y MQTT sobre TLS, autenticación por usuario, clave también para leer, registro de accesos, cifrado de la base de datos y límite de peticiones. También que la regla `INCIDENTE` reciba impactos reales, porque el simulador no los genera.

**30. ¿Cómo os habéis organizado y qué haríais distinto?**
Fijamos al principio un contrato de topics, payloads y API, y eso nos dejó avanzar en paralelo; cuando cambió el formato del simulador, bastó con actualizar el contrato. Los dos conocemos todo el sistema. Lo distinto: conectar antes el simulador al motor de alertas, porque la calibración salió al final.

---

*Si preguntan por el uso de IA: responded con sinceridad sobre cómo la habéis usado.*
