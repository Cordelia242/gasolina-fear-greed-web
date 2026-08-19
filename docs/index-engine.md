# Motor de índice (`src/index-engine`)

Este documento describe la arquitectura del cálculo del índice de gasolina:
qué vive en el motor, qué vive en n8n, cómo se clasifican los datos de
`public/data`, y cómo recalcular o cambiar la fórmula.

## Por qué existe

Antes de esto, toda la matemática (nivel de combustible, flujo, baseline por
estación/hora, índice de presión) vivía embebida en un Code node de n8n
("Construir datos e indices"), usando APIs de n8n (`$('Nodo').first().json`)
mezcladas con la lógica de negocio. Eso hacía imposible testear la fórmula
sin levantar n8n, y recalcular el histórico si la fórmula cambiaba.

Ahora la fórmula vive en **un solo lugar**: `src/index-engine/*.ts`. n8n y
`scripts/recalculate-history.ts` son los dos únicos consumidores, y ambos
llaman exactamente a la misma función `calculateIndex(...)`.

## Arquitectura

```
src/index-engine/
  types.ts       tipos + configuración por defecto (pesos, ventanas, capacidad)
  crises.ts      exclusión de fechas de crisis (isCrisisDate, sourceDate/Hour)
  fuel-level.ts  nivel de combustible puro: liters -> {score, state}
  flow.ts        deltas, L/h, EWMA de salida reciente, horas para agotarse
  baseline.ts    acumulador por estación + hora del día (mean/std de salida)
  pressure.ts    índice de presión PROVISIONAL/COMPLETE, pesos configurables
  engine.ts      calculateIndex(...) — orquestador puro

tests/index-engine/   node run via Vitest, un archivo por módulo + engine.test.ts

scripts/
  recalculate-history.ts        recalcula history/latest/stats desde saldos+crises
  n8n/build-engine-bundle.ts     empaqueta src/index-engine en un único script
  n8n/construir-datos-e-indices.glue.js   orquestación n8n (sin matemática)
  n8n/update-workflow.ts        inyecta bundle+glue en el Code node del workflow
```

`calculateIndex` es una función pura: recibe `{ currentMeasurements,
previousMeasurements, priorStats, previousHistoryEntry, crises, config }` y
devuelve `{ snapshot, nextStats, isNewSnapshot }`. No conoce `$()`, GitHub,
BioCloud, credenciales ni el filesystem — sólo datos adentro, datos afuera.
Tampoco llama `Date.now()`: el timestamp (`now`) es un input explícito, por
eso la misma entrada siempre produce la misma salida (determinismo).

### Por qué `priorStats` es un acumulador incremental, no "recorrer todo el historial crudo"

El baseline se guarda como `stats.json`: por estación, por hora del día
(0-23), por fecha, un contador + suma + suma de cuadrados de las tasas de
salida observadas. Esto permite calcular media/desviación estándar sin
recorrer meses de historial crudo en cada corrida — cada snapshot sólo pliega
una muestra más en el acumulador (ver `baseline.ts`). Es compatible con
recalcular todo el histórico: `recalculate-history.ts` simplemente vuelve a
reproducir esa misma acumulación desde `priorStats = {}` alimentando cada
snapshot en orden cronológico.

## Clasificación de datos (`public/data`)

| Archivo | Clasificación | Contiene | Se regenera con |
|---|---|---|---|
| `saldos/YYYY-MM-DD.json` | **RAW** | Lecturas observadas de BioCloud: `scrapedAt`, `sourceMeasuredAt`, `station`, `name`, `liters`, `visibleInSource`. Fuente de verdad histórica. | — (nunca se regenera, sólo se migra para quitar campos derivados) |
| `crises.json` | **RAW** (configuración curada a mano) | Períodos de crisis (`start`/`end`/`enabled`). | — (lo edita una persona) |
| `catalog.json` | DERIVADO (bookkeeping) | Roster de estaciones conocidas: `key`/`name`/`address`/`lastSeenAt`. Se deriva de los scrapes pero no puramente de la fórmula (depende de cuándo se vio cada estación por última vez), así que `recalculate-history.ts` no lo toca. | n8n, en cada corrida |
| `history/YYYY-MM-DD.json` | **DERIVADO** | Snapshots completos (`fuelLevel`, `flow`, `pressure`, `baseline`) por estación y global. 100% reconstruible desde `saldos/*.json` + `crises.json` + config. | `npm run recalculate` |
| `latest.json` | **DERIVADO** (= último snapshot) | El snapshot más reciente. | `npm run recalculate` |
| `stats.json` | **CACHE** | Acumulador incremental del baseline (`hours/days/outflowCount/sumOutflow/sumOutflowSq` por estación). Optimización para no recorrer todo el histórico crudo en cada corrida — se puede borrar y reconstruir por completo desde `saldos/*.json`. | `npm run recalculate` |

Regla práctica: si un archivo desapareciera, ¿se podría reconstruir
exactamente con `saldos/*.json` + `crises.json` + la config del motor? RAW y
`crises.json` son las únicas excepciones (son la entrada, no se derivan de
nada); todo lo demás es DERIVADO o CACHE.

`vehiclesEstimated` y `queueMinutes` (cuando existan en scrapes históricos)
nunca participan del cálculo — el motor no declara esos campos en su tipo de
entrada (`RawMeasurement`), así que ni siquiera puede leerlos por accidente.

## Migración de `saldos/*.json`

Los registros históricos podían traer `fuelLevel`/`pressure`/`flow`
embebidos (resultados del algoritmo viejo). `npm run recalculate` los quita
por defecto (son derivables, no observados) sin tocar los campos realmente
crudos — usa `--keep-derived-in-saldos` si por algún motivo se quiere
conservar esa copia vieja.

## Recalcular el histórico

```bash
npm run recalculate                              # todo el histórico disponible
npm run recalculate -- --from 2026-08-01 --to 2026-08-31
npm run recalculate -- --dry-run                 # sólo imprime qué haría
```

`--from`/`--to` acotan qué días de `history/*.json` se escriben (y hasta
dónde llega el reprocesamiento); el *replay* interno siempre arranca desde el
saldo más antiguo disponible porque el acumulador de baseline necesita
continuidad — no se puede "saltar" al medio de una media corriendo.
`latest.json`/`stats.json` siempre reflejan el estado justo después del
último snapshot procesado.

## Cambiar la fórmula

1. Editar `src/index-engine/*.ts` (con sus tests en `tests/index-engine/`).
2. `npm test` — el motor no toca n8n ni GitHub, corre todo local.
3. `npm run recalculate` para regenerar `history/`, `latest.json`, `stats.json`.
4. `npm run build:n8n-workflow` para que el Code node de n8n use la fórmula
   nueva (regenera su contenido desde el mismo `src/index-engine`).
5. Commitear todo junto: motor, histórico recalculado, workflow regenerado.

## n8n: cómo se invoca el motor

Opciones evaluadas para llamar al motor desde el Code node de n8n:

- **A. Importar el módulo TS/JS directamente** — el Code node de n8n corre en
  un sandbox que no tiene acceso a `require()` de archivos arbitrarios del
  repo salvo que el host esté configurado explícitamente para permitirlo
  (`NODE_FUNCTION_ALLOW_EXTERNAL`) y el módulo esté montado en el contenedor.
  Este workflow no tiene ninguna otra dependencia de filesystem — lee y
  escribe todo vía la API de GitHub (nodos `n8n-nodes-base.github`), no hay
  evidencia de que el repo esté clonado dentro del contenedor de n8n. Frágil.
- **B. Execute Command con Node** — mismo problema: requeriría que el
  contenedor de n8n tenga Node.js *y* el código del motor disponibles en su
  filesystem, algo que este workflow no usa ni necesita hoy.
- **C. Empaquetar el motor en un único script y pegarlo en el Code node** —
  elegida. `scripts/n8n/build-engine-bundle.ts` transpila
  `src/index-engine/*.ts` (vía la API de TypeScript, sin dependencias nuevas)
  y lo concatena en un único bundle sin imports externos;
  `scripts/n8n/update-workflow.ts` lo inyecta, junto con la orquestación en
  `construir-datos-e-indices.glue.js`, en el Code node del workflow. Funciona
  sin importar cómo esté provisionado el contenedor de n8n — no depende de
  filesystem compartido, Execute Command, ni un servicio nuevo.
- **D. Servicio HTTP local** — descartado: añade infraestructura nueva
  (proceso a mantener, red, despliegue) sin ninguna ventaja sobre C para este
  volumen de cálculo (unas pocas decenas de estaciones cada 30 minutos).

El Code node resultante tiene dos partes, ambas generadas o mantenidas desde
este repo — nunca se edita a mano:

1. El bundle (arriba, generado, con el aviso "AUTO-GENERATED... DO NOT EDIT
   BY HAND").
2. La orquestación (`construir-datos-e-indices.glue.js`): lee los nodos de
   GitHub, arma el roster de estaciones, arma `currentMeasurements` /
   `previousMeasurements` / `priorStats` / `previousHistoryEntry`, llama a
   `GasolinaIndexEngine.calculateIndex(...)` — la única llamada matemática de
   todo el nodo — y vuelca el resultado a los mismos archivos que ya se
   commiteaban antes.

`tests/data-contract.test.ts` verifica que el Code node siga generando
`fuelLevel`/`pressure`/`pressureStateFor` (es decir, que siga llamando al
motor) como parte del suite normal — corre con `npm test`, sin n8n.
