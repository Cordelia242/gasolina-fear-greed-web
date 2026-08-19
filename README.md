# Gasolina Index

Frontend estático sin backend. Consume los JSON generados por el workflow de n8n.

## Datos esperados

- `public/data/latest.json`
- `public/data/history/YYYY-MM-DD.json`
- `public/data/saldos/YYYY-MM-DD.json`
- `public/data/catalog.json`
- `public/data/stats.json`

### Histórico de saldos por surtidor

`public/data/saldos/YYYY-MM-DD.json` reemplaza al antiguo `saldos-history.json`
(un solo archivo que concatenaba todos los registros desde el inicio y crecía
sin límite, descargándose completo en cada visita). Ahora, igual que
`history/`, hay **un archivo por día**:

```json
{
  "date": "YYYY-MM-DD",
  "records": [
    {
      "scrapedAt": "2026-08-18T03:35:08.164Z",
      "sourceMeasuredAt": "2026-08-17T23:31:00",
      "station": "alemana",
      "name": "ALEMANA",
      "liters": 37408,
      "vehiclesEstimated": 935,
      "queueMinutes": 2,
      "visibleInSource": true
    }
  ]
}
```

n8n debe ir agregando registros al archivo del día en curso (igual que ya
hace con `history/YYYY-MM-DD.json`) y empezar un archivo nuevo al cruzar la
medianoche, en vez de seguir concatenando en un único archivo para siempre.
El frontend solo descarga los últimos 2 días (suficiente para los rangos de
5h/10h/1d que muestra), así que el tráfico por visita queda acotado sin
importar cuánto histórico se acumule. Los archivos de días anteriores pueden
conservarse para archivo, pero no afectan el consumo de red de los
visitantes.

## GitHub Pages

1. Sube estos archivos a la raíz del repositorio.
2. Ve a **Settings → Pages**.
3. En **Build and deployment**, selecciona **Deploy from a branch**.
4. Selecciona `main` y `/ (root)`.

Cada commit de n8n sobre `main` hará que GitHub Pages vuelva a publicar el sitio.

## Prueba local

```bash
python3 -m http.server 8080
```

Abre `http://localhost:8080`.
