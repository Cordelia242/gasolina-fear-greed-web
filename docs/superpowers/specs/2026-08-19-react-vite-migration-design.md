# Migración a React + Vite + Recharts

## Contexto

`gasolina-fear-greed-web` es hoy una SPA estática sin build: `index.html` +
`app.js` (vanilla JS, ~26KB, sin dependencias) + `styles.css`, desplegada a
GitHub Pages subiendo el repo tal cual vía Actions. Los gráficos (gauge,
trend chart, sparklines, chart de estación) se dibujan a mano con SVG. Los
datos vienen de `public/data/*.json`, escritos por un workflow externo de
n8n — ese contrato no cambia con esta migración.

Objetivo: reescribir el frontend en React + TypeScript, usando Recharts
donde aporte, compilado a estático con Vite y desplegado al mismo GitHub
Pages (repo `Cordelia242/gasolina-fear-greed-web`, sin dominio custom →
`base: '/gasolina-fear-greed-web/'`).

Alcance aprobado: paridad funcional, abierto a mejoras menores de
implementación donde el código actual sea un hack (ej. el gauge).

## Enfoque

Migración de bajo diff: un `App` con hooks de datos que reflejan 1:1 la
lógica de fetch actual, y componentes presentacionales por sección. Sin
librería de fetching/estado (TanStack Query, Zustand) — la app pide 2-3 JSON
estáticos por carga, no hay necesidad real de caché ni estado compartido
complejo. Sin Next.js — no hay SSR ni routing que justifique la
complejidad extra sobre un deploy 100% estático.

## Estructura

```
src/
  main.tsx
  App.tsx
  types.ts                 // Snapshot, Station, FuelLevel, Pressure, etc.
  styles.css                // migrado del root tal cual (mismo look & feel)
  hooks/
    useLatestSnapshot.ts   // reemplaza fetch de latest.json
    useHistory.ts          // reemplaza getRangeSnapshots(days, rangeKey)
    useSaldosRecords.ts    // reemplaza getSaldosRecords() (SALDOS_DAYS_BACK=2)
  components/
    Header.tsx
    GaugeCard.tsx
    TrendCard.tsx
    StationsSection.tsx
    StationCard.tsx
    StationDialog.tsx
index.html                 // entry Vite, referencia src/main.tsx
vite.config.ts
public/data/...             // sin cambios, n8n sigue escribiendo acá
```

`index.html` (raíz, versión Vite) reemplaza al actual; `app.js` y
`styles.css` (raíz) se eliminan tras portar su contenido.

## Mapeo de gráficos

| Gráfico | Implementación | Razón |
|---|---|---|
| Gauge semicircular (zonas por color) | SVG propio en JSX | Recharts no tiene gauge nativo; forzar un `RadialBarChart` sería más código que un componente SVG chico. Se porta la lógica de color por zona (`fuelScoreColor`) tal cual. |
| Trend chart (3 series toggleables + tooltip + rango 7d/30d/todo) | Recharts `ComposedChart` (Area + Line), `Legend` con `onClick` para toggle, `Tooltip` custom | Reemplaza ~80 líneas de math de paths SVG a mano (`drawZoneChart`) por componentes declarativos. |
| Sparkline por estación (dentro de cada `StationCard`) | Recharts `AreaChart` mini, ejes ocultos | Consistencia con el resto. Si el número de estaciones crece y pesa en performance, ese es el punto para volver a SVG a mano — no antes. |
| Chart del dialog de estación (litros en el tiempo, rango 5h/10h/1d) | Recharts `LineChart` | Mismo patrón que el trend chart, una sola serie. |

## Datos y fetch

Los hooks portan la lógica actual de `app.js` función por función
(`localDateString`, `dateOffsetString`, `getJSON`, `getRangeSnapshots`,
`getSaldosRecords`) sin cambiar su comportamiento observable.

Cambio obligado por Vite: los archivos en `public/` se sirven desde la raíz
del sitio, no bajo `/public/`. Los fetch pasan de
`'./public/data/latest.json'` a `` `${import.meta.env.BASE_URL}data/latest.json` ``
para funcionar tanto en dev como bajo el `base` de producción.

## Testing

Todo migra a **Vitest** (viene con Vite, entiende TS/JSX sin config extra):

- Los tests de forma de datos de `schema-contract.test.js`
  (`assertSnapshot` sobre `latest.json`, `history/*.json`, y el workflow
  n8n) se portan tal cual, solo cambia el runner.
- Los greps de texto literal sobre `app.js`/`index.html` se eliminan. El
  contrato de datos pasa a vivir en `src/types.ts`. Se agregan 2 tests de
  comportamiento con `@testing-library/react`: el más importante, que
  `TrendCard`/`GaugeCard` no rompan y muestren el estado "BASELINE" cuando
  `pressure.score` es `null` (el caso que el test viejo protegía indirecto
  vía grep de código fuente).

## Build y deploy

`vite.config.ts`: plugin React, `base: '/gasolina-fear-greed-web/'`.

`package.json`: scripts `dev`, `build`, `preview`, `test` (vitest run).
Dependencias nuevas: `react`, `react-dom`, `recharts`; devDependencies:
`vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`,
`@types/react-dom`, `@types/node`, `vitest`, `jsdom`,
`@testing-library/react`, `@testing-library/jest-dom`.

`.github/workflows/deploy.yml`: agrega `actions/setup-node` (con cache de
npm), `npm ci`, `npm test`, `npm run build` antes del deploy; el
`upload-pages-artifact` pasa de `path: '.'` a `path: './dist'`. Los path
filters del trigger se simplifican a `src/**`, `public/**`, `index.html`,
`package.json`, `package-lock.json`, `vite.config.ts`,
`.github/workflows/deploy.yml` — cualquier commit de datos de n8n
(`public/data/**`) sigue disparando el workflow, ahora con un build de por
medio (rápido, la app es chica).

## Fuera de alcance

- Rediseño visual — se preserva el look & feel actual; las únicas
  diferencias de implementación son las marcadas arriba (gauge como
  componente SVG propio en vez de manipulación directa del DOM).
- Cambios al workflow de n8n o al contrato de `public/data/*.json`.
- Librerías de fetching/estado (TanStack Query, Zustand) — YAGNI para el
  tamaño actual de la app.
