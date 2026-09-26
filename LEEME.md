# El Puente — una obra VISE

Juego en pixel art con tabla global de récords.

## Estructura
- `public/index.html` — el juego completo (un solo archivo)
- `netlify/functions/scores.mjs` — API de récords en `/api/scores`, guardada con Netlify Blobs
- `netlify.toml` y `package.json` — configuración para Netlify

## Publicar (opción A: GitHub, recomendada)
1. Sube esta carpeta a un repositorio de GitHub.
2. En Netlify: Add new site → Import an existing project → elige el repo.
3. Deja los valores que detecta del `netlify.toml` y despliega. No hace falta comando de build.

## Publicar (opción B: Netlify CLI)
```
npm install
npm install -g netlify-cli
netlify login
netlify deploy --prod
```

Nota: arrastrar la carpeta a Netlify Drop publica el juego, pero **no** la función de récords.
En ese caso el juego sigue funcionando y guarda los récords solo en cada dispositivo.

## Probar en local
```
netlify dev
```

## Administrar récords
Los puntajes quedan en el store `el-puente-scores`, clave `top`. Se pueden ver o borrar
desde el panel de Netlify (Blobs) si hay que limpiar la tabla.
