# Rifa a beneficio de Fernanda 💗

Sitio estático para la rifa solidaria. El **Google Sheet es la única fuente de la verdad**:
los vendedores siguen trabajando ahí como siempre, y la página lee y escribe sobre él
a través de un Google Apps Script.

## Arquitectura

```
Comprador ──▶ Sitio estático (GitHub Pages)
                 │  GET  → lee vendedores, números, estados, totales
                 │  POST → reserva un número (Estado = "Reservado")
                 ▼
             Google Apps Script (Web App, gratis)
                 ▼
             Google Sheet  ◀── los vendedores confirman pagos acá, como siempre
```

- **Meta**: se calcula sola → total de números × $2.000. Si agregan pestañas de
  vendedores, la meta crece automáticamente.
- **Recaudado**: números en estado `Pagado` × $2.000.
- **Anti doble-reserva**: el Apps Script usa `LockService`, así dos personas no
  pueden reservar el mismo número al mismo tiempo.

## Estructura

```
index.html            → la página (historia, contador, grilla, premios, transferencia)
css/styles.css        → estilos (paleta del afiche)
js/app.js             → lógica: fetch de datos, grilla, modal de reserva
apps-script/Code.gs   → backend que va pegado en el Google Sheet
```

## Puesta en marcha (una sola vez, ~10 minutos)

### 1. Publicar el Apps Script

1. Abrí el Google Sheet de la rifa.
2. **Extensiones → Apps Script**.
3. Borrá el contenido de `Código.gs` y pegá el contenido de `apps-script/Code.gs`.
4. **Implementar → Nueva implementación → ⚙️ Tipo: Aplicación web**:
   - Descripción: `rifa-fer`
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier persona**
5. **Implementar** → autorizá los permisos → copiá la **URL de la app web**
   (termina en `/exec`).

> ⚠️ Si después modificás el código del script, tenés que hacer
> **Implementar → Administrar implementaciones → ✏️ → Nueva versión** para que
> los cambios queden publicados.

### 2. Conectar el sitio

En `js/app.js`, línea 8, pegá la URL:

```js
const API_URL = 'https://script.google.com/macros/s/XXXXX/exec';
```

Mientras `API_URL` esté vacía, el sitio corre en **modo demo** con datos de
ejemplo (útil para probar el diseño sin tocar el sheet).

### 3. Publicar en GitHub Pages

```bash
git init
git add .
git commit -m "feat: sitio rifa a beneficio de Fernanda"
gh repo create rifa-fer --public --source=. --push
```

Después en GitHub: **Settings → Pages → Source: Deploy from a branch →
Branch: `main` / `(root)`** → Save. En un par de minutos el sitio queda en
`https://<tu-usuario>.github.io/rifa-fer/`.

## Formato esperado del Sheet

Cada pestaña de vendedor debe tener una fila de encabezados en alguna de sus
primeras 10 filas (el script la detecta por prefijo, sin importar mayúsculas;
en el sheet real está en la fila 4, debajo del título "RIFA n" y el resumen):

| Número | Nombre comprador | Teléfono | Estado | Valor | Fecha pago | Observaciones |
| ------ | ---------------- | -------- | ------ | ----- | ---------- | ------------- |

- `Estado` reconocido: `Disponible` (o vacío), `Reservado`, `Pagado`.
- Las pestañas sin columnas `Número`/`Estado` (resúmenes, notas) se ignoran solas.
- Cuando alguien reserva desde la web, el script escribe `Reservado`, el nombre,
  el teléfono y una observación `Reserva web · <fecha>`. El vendedor luego
  confirma el pago cambiando el estado a `Pagado`, como siempre.

## Flujo de una venta

1. El comprador entra al sitio, elige vendedor y número disponible.
2. Deja nombre y teléfono → el número pasa a `Reservado` en el sheet.
3. El comprador transfiere $2.000 (datos en el sitio, con botón copiar).
4. El vendedor ve la reserva en su pestaña, valida la transferencia y marca `Pagado`.
5. El contador del sitio se actualiza (refresco automático cada 60 segundos).
