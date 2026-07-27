# Desplegar el frontend en Netlify

Antes de subir: pega la URL de tu Apps Script en `CONFIG.APPS_SCRIPT_URL`
dentro de `src/App.jsx` (línea ~15). Si la dejas vacía, el sitio publicado
funcionará en modo demo con datos de ejemplo.

Tienes dos formas de publicarlo. Elige la que prefieras.

## Método 1 — Arrastrar y soltar (el más simple, sin instalar nada en tu computador salvo Node.js)

1. Instala [Node.js](https://nodejs.org) si no lo tienes (versión 18 o superior).
2. Descarga esta carpeta completa (`gestion-cursos-netlify`) a tu computador.
3. Abre una terminal dentro de la carpeta y ejecuta:
   ```
   npm install
   npm run build
   ```
   Esto genera una carpeta `dist/` con el sitio ya compilado (HTML, CSS y JS listos).
4. Ve a **[app.netlify.com/drop](https://app.netlify.com/drop)**.
5. Arrastra la carpeta `dist` (solo esa carpeta, no el proyecto completo) a la
   zona de "Drag and drop".
6. En segundos Netlify te entrega una URL pública (ej. `nombre-al-azar.netlify.app`).
   Puedes cambiar el nombre del sitio desde **Site settings → Change site name**.

Con este método, cada vez que cambies algo en el código deberás repetir
`npm run build` y volver a arrastrar la carpeta `dist`.

## Método 2 — Conectado a un repositorio Git (recomendado si vas a seguir iterando)

1. Sube esta carpeta a un repositorio de GitHub (o GitLab/Bitbucket).
2. Entra a [app.netlify.com](https://app.netlify.com) → **Add new site → Import
   an existing project**.
3. Conecta tu cuenta de GitHub y selecciona el repositorio.
4. Netlify detecta automáticamente el archivo `netlify.toml` con:
   - Build command: `npm run build`
   - Publish directory: `dist`
5. Presiona **Deploy site**.

Con este método, cada vez que hagas `git push`, Netlify reconstruye y
publica el sitio automáticamente — no necesitas correr nada localmente ni
volver a arrastrar carpetas.

## Notas

- No necesitas configurar nada especial de backend en Netlify: solo sirve
  archivos estáticos. Toda la lógica con Google Sheets/Drive la maneja el
  Apps Script desplegado por separado (ver `backend/README-DEPLOY.md`).
- Si más adelante quieres un dominio propio (ej. `capacitaciones.tuempresa.cl`),
  se configura en **Site settings → Domain management** dentro de Netlify.
- Variables sensibles: este proyecto no usa claves secretas en el frontend
  (la URL de Apps Script es pública por diseño), así que no necesitas
  variables de entorno en Netlify para que funcione.
