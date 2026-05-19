# ⚽ Torneo Amateur

App web completa para gestionar torneos de fútbol amateur. Funciona 100% en el navegador y guarda todos los datos en tu propio Google Drive.

## Funcionalidades

- **Login con Google** – acceso seguro con tu cuenta
- **Crear Torneo** – nombre, equipos (4–16), modalidad ida o ida-y-vuelta
- **Fixture automático** – genera todos los partidos (todos contra todos)
- **Resultados** – ingresa marcadores por jornada, se recalcula todo
- **Posiciones** – tabla PJ PG PE PP GF GC DG Pts, top 3 coloreado
- **Estadísticas** – goleadores, tarjetas, ranking juego limpio
- **Jornadas** – calendario con fecha, hora y cancha por partido
- **Exportar** – imagen de cualquier tabla + página HTML para compartir por WhatsApp

## Tecnología

- HTML + CSS + JavaScript puro (sin frameworks)
- Google Sheets como base de datos (API v4)
- Google Identity Services (OAuth 2.0)
- html2canvas para exportar imágenes
- GitHub Pages compatible

## Cómo usar

1. Abre la app en GitHub Pages
2. Haz clic en **Iniciar sesión con Google**
3. Completa el formulario de nuevo torneo
4. La app crea automáticamente una hoja de cálculo en tu Drive
5. ¡Listo! Ingresa resultados y comparte las tablas

## Estructura del proyecto

```
torneo-amateur/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── auth.js          # Autenticación Google
│   ├── sheets.js        # API de Google Sheets
│   ├── torneo.js        # Gestión del torneo
│   ├── resultados.js    # Resultados por jornada
│   ├── posiciones.js    # Tabla de posiciones
│   ├── estadisticas.js  # Estadísticas de jugadores
│   ├── jornadas.js      # Calendario de partidos
│   └── exportar.js      # Exportar tablas e imágenes
└── README.md
```

## Despliegue en GitHub Pages

1. Haz fork o sube el repositorio a GitHub
2. Ve a **Settings → Pages → Source: main branch**
3. Agrega tu dominio de GitHub Pages como origen autorizado en la [Google Cloud Console](https://console.cloud.google.com/) bajo el Client ID OAuth
