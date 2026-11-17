# Botonera de sensores

Con Express arrancado, abrir http://localhost:3000/control.html o el enlace «Control de sensores» del campograma.

- Elegir P1–P11 y duración entre 1 y 3600 segundos, o «Hasta que lo retire» (durationSeconds: 0).
- Los botones rápidos envían inmediatamente un PUT a `/api/simulador/jugadores/:id/sensores`.
- Los formularios permiten temperatura de 35–42 °C y pulso de 30–220 lpm. «Forzar ambos» envía los dos campos.
- «Retirar ajustes» envía DELETE a esa misma ruta y retira ambos sensores del jugador.
- Un PUT de un solo sensor conserva en Node-RED el otro ajuste si sigue vigente.
- La duración se aplica a los sensores enviados en esa petición, no a los ajustes anteriores.

Express publica en `control/jugadores/:id/sensores`. Los nodos «Guardar ajustes de sensores» y «Aplicar ajustes de sensores» actúan sobre los valores publicados; no modifican el GPS ni el motor táctico. Los botones de fase llaman a `POST /api/simulador/fase` con `{fase}` y publican en `control/fase`. Cambian la fase de todo el equipo sin usar el jugador o la duración del control de sensores. El motor sigue evolucionando automáticamente. La página no llama a la ruta de reinicio.

La API no expone todavía el modo `once` ni las duraciones de 24 horas que admite Node-RED; la interfaz utiliza el contrato actual de la API.

Se necesita Express y MQTT conectado para publicar órdenes. Para ver lecturas se necesita además Node-RED, la pasarela y MongoDB. Una respuesta 202 significa orden publicada al broker, no confirmación de consumo por Node-RED. La tarjeta de telemetría muestra las lecturas recibidas por el WebSocket de la API y oculta los datos de más de seis segundos.

La API solo recuerda la última orden por jugador y puede perder ese registro al reiniciarse. Esa tarjeta no es un inventario fiable de todos los ajustes de Node-RED. El historial de peticiones pertenece a la pestaña y se pierde al recargar.

No requiere claves en el navegador: conserva la política existente de las rutas del simulador. El resto de la simulación y la autenticación de las rutas médicas no cambian.

Las cinco fases disponibles son ataque organizado, transición defensiva, presión alta, defensa organizada y transición ofensiva. La última fase solicitada se consulta en GET /api/simulador y se actualiza mediante WebSocket; es el registro de una orden, no la fase actual del motor. Las peticiones POST aparecen en el mismo historial que PUT y DELETE.
