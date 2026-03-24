# Website Detection Agent - Teams Plugin

Extensión de navegador (Chrome/Edge) que detecta problemas en sitios web, recopila evidencias y genera recomendaciones de mejora para optimizar la experiencia del usuario.

## Características

### Detección Automática
- **Rendimiento**: Core Web Vitals (LCP, FID, CLS), TTFB, tiempo de carga total
- **Errores JavaScript**: Errores en tiempo de ejecución, promesas no manejadas, APIs obsoletas
- **Accesibilidad (WCAG)**: Alt text, labels, contraste, jerarquía de encabezados, navegación por teclado
- **SEO**: Title, meta description, H1, canonical, Open Graph, datos estructurados
- **Red**: Compresión, recursos bloqueantes, contenido mixto, recursos lentos
- **Seguridad**: HTTPS, contenido mixto, rel="noopener", formularios inseguros
- **Responsivo**: Overflow horizontal, tamaño táctil, fuentes, imágenes responsive

### Recopilación de Evidencias
- Captura de pantalla de la página
- Exportación de reportes en JSON
- Historial de escaneos
- Métricas detalladas de cada análisis

### Reportes y Sugerencias
- Puntuación por categoría (0-100)
- Problemas categorizados por severidad (Crítico/Advertencia/Info)
- Plan de mejora priorizado (Inmediato/Corto/Mediano/Largo plazo)
- Quick wins identificados
- Herramientas recomendadas para cada corrección

## Instalación

### Como extensión de Chrome (modo desarrollador)

1. Abrir Chrome y navegar a `chrome://extensions/`
2. Activar **Modo desarrollador** (esquina superior derecha)
3. Clic en **Cargar descomprimida**
4. Seleccionar la carpeta `extension/`
5. La extensión aparecerá en la barra de herramientas

### Agente de Análisis (Node.js)

```bash
# Analizar un reporte JSON exportado
node agent/analysis-agent.js reports/mi-reporte.json
```

## Uso

1. **Navegar** al sitio web que desea analizar
2. **Clic** en el icono de la extensión en la barra de herramientas
3. **Seleccionar** los tipos de análisis deseados
4. **Clic** en "Iniciar Escaneo Completo" o "Escaneo Rápido"
5. **Revisar** las evidencias en la pestaña "Evidencias"
6. **Consultar** el reporte con sugerencias en la pestaña "Reporte"
7. **Exportar** los datos en JSON para análisis posterior

## Estructura del Proyecto

```
teams-website-detection-agent/
├── extension/
│   ├── manifest.json          # Configuración de la extensión
│   ├── popup.html             # Interfaz del popup
│   ├── css/
│   │   ├── popup.css          # Estilos del popup
│   │   └── overlay.css        # Estilos inyectados en páginas
│   ├── js/
│   │   ├── background.js      # Service worker (gestión de datos)
│   │   ├── content-detector.js # Script de detección (se inyecta en cada página)
│   │   └── popup.js           # Controlador del popup
│   └── icons/                 # Iconos de la extensión
├── agent/
│   └── analysis-agent.js      # Motor de análisis offline
├── reports/                   # Directorio para reportes generados
└── README.md
```

## Tecnologías

- **Manifest V3** - Última versión de extensiones de Chrome
- **Performance Observer API** - Métricas de rendimiento nativas
- **Web APIs** - Navigation Timing, Resource Timing
- **Vanilla JS** - Sin dependencias externas
