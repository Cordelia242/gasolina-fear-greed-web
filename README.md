# Gasolina Index

Frontend estático sin backend. Consume los JSON generados por el workflow de n8n.

## Datos esperados

- `public/data/latest.json`
- `public/data/history/YYYY-MM-DD.json`
- `public/data/catalog.json`
- `public/data/stats.json`

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
