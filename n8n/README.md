# Workflow de n8n

`gasolina-fear-greed-workflow.json` es el export del workflow de n8n que scrapea
BioCloud cada 30 minutos y publica `public/data/*.json` en este repo usando
nodos nativos de GitHub. Se guarda aquí solo como respaldo versionado; para
usarlo, impórtalo en n8n (`Import from File`) y reconecta la credencial
`githubApi`.

## Histórico de saldos particionado por día

El frontend dejó de leer un único `public/data/saldos-history.json` (crecía
sin límite y se descargaba completo en cada visita) y ahora lee
`public/data/saldos/YYYY-MM-DD.json`, un archivo por día igual que
`public/data/history/YYYY-MM-DD.json`. Este workflow ya está actualizado para
ese esquema:

- **GitHub - Leer saldos del día** lee `saldos/{fecha local}.json` en vez del
  archivo plano.
- **Construir datos e indices** arma `{ date, records }` para el día en curso
  (`saldosDay`) en lugar de ir concatenando en un objeto sin fin.
- **¿Existe saldos del día? / Editar / Crear saldos del día** hacen el
  upsert de ese archivo, igual que ya se hacía con el histórico diario.

Al cruzar la medianoche, `Fecha local` apunta a un archivo nuevo
automáticamente, así que no hace falta ninguna limpieza manual: el tráfico
por visita del frontend (que solo descarga los últimos días) queda acotado
sin importar cuánto histórico se acumule en `public/data/saldos/`.

Las métricas agregadas de largo plazo (`stats.json`, índice histórico) no se
ven afectadas: se calculan de forma incremental y no dependen de los
archivos de saldos.
