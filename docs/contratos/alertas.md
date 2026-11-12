# Contrato de alertas

> **Versión 2.0 (jueves 12 de noviembre).** La API publica las alertas en MQTT con el usuario `api`, que en la ACL de A solo puede escribir en `sensors/+/alertas`. Los umbrales son **valores por defecto**: se ajustan con el simulador y se pueden cambiar por jugador con `PUT /api/jugadores/:id/umbrales`.

## Forma de una alerta

```json
{
  "id": "6733f0c2a1b2c3d4e5f60718",
  "jugadorId": "p8",
  "codigo": "CALOR_AMBAR",
  "severidad": "aviso",
  "mensaje": "Temperatura interna 39,2 °C (umbral 39 °C)",
  "valor": 39.2,
  "umbral": 39,
  "ts": "2026-11-12T18:30:05.000Z",
  "estado": "activa",
  "confirmadaPor": null,
  "confirmadaEn": null,
  "nota": null
}
```

- **`severidad`:** `aviso` o `critica`.
- **`estado`:** `activa` o `confirmada`. La confirma el médico con `POST /api/alertas/:id/confirmar`.
- **Semáforo del jugador:**
  - `rojo` si tiene alguna alerta `critica` activa;
  - `ambar` si tiene algún `aviso` activo;
  - `verde` si no tiene ninguna.

## Dónde se publica

- **MQTT:** `sensors/<equipo>/alertas` (`sensors/eq1/alertas`), QoS 1, sin retain. El payload es la alerta completa. La publica la API; el Dashboard 2.0 de A está suscrito.
- **WebSocket:** `{"tipo": "alerta", "alerta": {…}}` para la web.
- **MongoDB:** colección `alertas`.

## Antirrebote

- No se repite el mismo código para el mismo jugador mientras haya una alerta igual **activa**.
- Después de confirmarla hay **60 s** de espera antes de poder lanzarla de nuevo.
- Las alertas no se cierran solas: siguen activas, y el semáforo en ámbar o rojo, hasta que el médico las confirma.
- La API evalúa las reglas con cada lectura (1 Hz).

## Reglas

| Código | Se dispara cuando… | Umbrales configurables (por defecto) | Severidad |
|---|---|---|---|
| `CALOR_AMBAR` | Temperatura interna ≥ `tempAmbar` | `tempAmbar` = 39 °C | aviso |
| `CALOR_ROJA` | Temperatura interna ≥ `tempRoja` | `tempRoja` = 40 °C | critica |
| *(ajuste por clima)* | Si el WBGT ≥ `wbgtAlto`, los dos umbrales de calor bajan `ajusteCalor` | `wbgtAlto` = 28 °C, `ajusteCalor` = 0,3 °C | — |
| `FC_ALTA` | FC > `fcAltaPct` % de la FCmáx durante más de `fcAltaSeg` | `fcAltaPct` = 92, `fcAltaSeg` = 60 s | aviso |
| `FC_DESACOPLE` | FC > `desacoplePct` % de la FCmáx con velocidad < `desacopleVel` durante `desacopleSeg` | `desacoplePct` = 85, `desacopleVel` = 7 km/h, `desacopleSeg` = 30 s | aviso |
| `RECUPERACION_LENTA` | Tras un esfuerzo (velocidad de >19,8 a <7 km/h), la FC baja ≤ `recuperacionLpm` en los 60 s siguientes | `recuperacionLpm` = 12 | aviso |
| `INCIDENTE` | Impacto ≥ `impactoG`, seguido de velocidad < 1 km/h durante `inmovilSeg`, con FC anómala (<50 lpm o >95 % FCmáx) o sin señal | `impactoG` = 4 g, `inmovilSeg` = 10 s | critica |
| `SOBRECARGA` | Acciones de alta intensidad (`acelAltas` + `decelAltas`) acumuladas en la sesión > `sobrecargaAcciones` | `sobrecargaAcciones` = 120 | aviso |
| `ASIMETRIA` | \|media de (izq − der) en 60 s\| − `asimetriaBase` del jugador > `asimetriaUmbral` | `asimetriaUmbral` = 10 puntos | aviso |
| `PAUTA_EXCEDIDA` | Con pauta activa: velocidad > `velMax`, o distancia en alta intensidad de la sesión > `cargaMax`, o asimetría > `asimetriaMax` | Los fija la pauta del médico | aviso |
| `SIN_SENAL` | Llega una lectura con `estado: "sin_senal"` (watchdog de la pasarela, 5 s) | — | aviso |

## Base de cada umbral (para el informe)

- **Calor:**
  - En partidos con calor, el pico medio de temperatura interna fue de 39,2 °C (rango 37,9–40,1 °C).
  - Por encima de 39 °C empeora el sprint repetido, y 40 °C es el criterio clínico de golpe de calor.
  - FIFA obliga a pausas de hidratación con WBGT ≥32 °C, y FIFPRO las pide desde 28 °C.
  - El ajuste de 0,3 °C es una decisión nuestra, no un valor publicado.
- **Recuperación de la FC:** una caída de ≤12 lpm en el primer minuto tras el esfuerzo se asoció a más mortalidad en una cohorte clínica de 2.428 adultos (Cole et al., 1999). Aquí es un indicador, no un diagnóstico.
- **Aceleraciones:** ±3 m/s² mantenidos 0,5 s es el umbral habitual de alta intensidad (STATSports, SciSports). En partidos de academia de élite se han registrado hasta 46 aceleraciones y 73 desaceleraciones de alta intensidad; de ahí el valor de 120 por sesión.
- **Asimetría:** no hay un umbral fijo validado, por eso se compara con la línea base de cada jugador. El valor de 10 puntos es nuestro.
- **Impacto:** el valor de 4 g es nuestro y se ajusta con el simulador.
- **Temperatura interna:** en la realidad se mide con una cápsula ingerible o se estima a partir de la FC (algoritmo ECTemp, Buller et al., 2013).

## Fuentes

- Cole et al. (1999), recuperación de la FC: https://pubmed.ncbi.nlm.nih.gov/10536127/
- Temperatura interna en futbolistas: https://opus.lib.uts.edu.au/bitstream/10453/191965/2/PIIS1440244025005377.pdf
- Revisión sobre temperatura interna en competición: https://www.termedia.pl/Core-body-temperature-responses-during-competitive-sporting-events-a-narrative-review,78,50091,1,1.html
- FIFPRO, calor extremo: https://www.fifpro.org/articles/2021/07/extreme-weather-in-football
- STATSports, aceleraciones: https://statsports.com/the-locker/maximum-acceleration-and-decelerations-significance-for-an-athletes-physical-development
- Glosario de SciSports: https://support.scisports.com/en/articles/4476826-physical-variables-glossary
- Plantillas instrumentadas y asimetría: https://pmc.ncbi.nlm.nih.gov/articles/PMC9208063
- ECTemp (Buller): https://nrt.org/sites/58/files/RT%20PSI%20Assessment%20-%20M.%20Buller.pdf
