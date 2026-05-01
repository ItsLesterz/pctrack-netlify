# PCTrack — Netlify + Supabase

## Variables de entorno requeridas en Netlify

Ve a Netlify → Site Settings → Environment Variables y agrega:

| Variable | Valor |
|----------|-------|
| `SUPABASE_URL` | `https://kbogrtrlsoveuampzodt.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Tu **service_role key** (Settings → API → service_role) |
| `JWT_SECRET` | Cualquier string largo, ej: `pctrack-super-secret-2025` |

## Primer deploy en Netlify

1. Sube este proyecto a GitHub
2. Conecta el repo en Netlify
3. Agrega las variables de entorno
4. Deploy

## Después del primer deploy

Visita esta URL UNA VEZ para crear el usuario admin:
```
https://TU-SITIO.netlify.app/api/auth/setup
```

Credenciales: `admin` / `admin123`

## Estructura
```
pctrack-netlify/
├── netlify.toml
├── package.json
├── netlify/functions/
│   ├── auth.js
│   ├── devices.js
│   └── lib/
│       ├── supabase.js
│       └── auth.js
└── public/
    ├── index.html
    ├── css/style.css
    └── js/app.js
```
