# Plan de Implementación: Plataforma de Asistencia a PYMEs para Mercado Público

## Arquitectura General

```
cursoMac/
├── backend/                     # FastAPI (Python)
│   ├── app/
│   │   ├── main.py              # Punto de entrada FastAPI
│   │   ├── config.py            # Configuración y variables de entorno
│   │   ├── routers/
│   │   │   ├── licitaciones.py  # Endpoints de búsqueda de licitaciones
│   │   │   ├── dashboard.py     # Endpoints de métricas y estadísticas
│   │   │   └── asistente.py     # Endpoints del asistente de postulación
│   │   ├── services/
│   │   │   ├── mercado_publico_api.py  # Cliente HTTP para API Mercado Público
│   │   │   └── data_processor.py       # Procesamiento y análisis de datos
│   │   └── models/
│   │       └── schemas.py       # Modelos Pydantic (request/response)
│   ├── requirements.txt
│   └── .env.example
├── frontend/                    # React (Vite)
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── components/
│   │   │   ├── Layout.jsx           # Layout principal con navegación
│   │   │   ├── SearchBar.jsx        # Barra de búsqueda de licitaciones
│   │   │   ├── LicitacionCard.jsx   # Tarjeta de licitación individual
│   │   │   ├── LicitacionList.jsx   # Lista de resultados
│   │   │   ├── Dashboard.jsx        # Panel de métricas
│   │   │   ├── StatsCard.jsx        # Tarjeta de estadística individual
│   │   │   └── Asistente.jsx        # Asistente de postulación
│   │   ├── pages/
│   │   │   ├── HomePage.jsx         # Página principal
│   │   │   ├── BuscadorPage.jsx     # Buscador de licitaciones
│   │   │   ├── DashboardPage.jsx    # Dashboard de oportunidades
│   │   │   └── AsistentePage.jsx    # Asistente de postulación
│   │   └── services/
│   │       └── api.js               # Cliente HTTP para nuestro backend
│   ├── package.json
│   └── index.html
└── INFORME_MERCADO_PUBLICO.md
```

## Pasos de Implementación

### Paso 1: Backend - Estructura base FastAPI
- Crear `backend/` con FastAPI, CORS configurado, y archivo de configuración
- Crear `requirements.txt` con dependencias: fastapi, uvicorn, httpx, pydantic, python-dotenv
- Crear `app/main.py` con la app FastAPI y middleware CORS
- Crear `app/config.py` con settings (API ticket, base URLs)

### Paso 2: Backend - Cliente de API Mercado Público
- Crear `app/services/mercado_publico_api.py`
- Implementar clase `MercadoPublicoClient` con httpx.AsyncClient
- Métodos: `buscar_licitaciones(fecha, estado, codigo_organismo)`, `obtener_licitacion(codigo)`, `buscar_ordenes_compra(fecha, estado)`, `buscar_proveedor(rut)`
- Base URL: `https://api.mercadopublico.cl/servicios/v1/publico/`
- Usar ticket de prueba: `F8537A18-6766-4DEF-9E59-426B4FEE2844`

### Paso 3: Backend - Router de Licitaciones
- Crear `app/routers/licitaciones.py`
- Endpoints:
  - `GET /api/licitaciones` - Listar licitaciones con filtros (fecha, estado, palabra clave)
  - `GET /api/licitaciones/{codigo}` - Detalle de licitación específica
  - `GET /api/licitaciones/activas` - Licitaciones activas del día
- Modelos Pydantic para request/response en `app/models/schemas.py`

### Paso 4: Backend - Router de Dashboard
- Crear `app/routers/dashboard.py`
- Endpoints:
  - `GET /api/dashboard/resumen` - Métricas del día (total licitaciones activas, por estado, montos)
  - `GET /api/dashboard/por-organismo` - Licitaciones agrupadas por organismo
  - `GET /api/dashboard/por-estado` - Conteo por estado
- Crear `app/services/data_processor.py` para agregar y calcular estadísticas

### Paso 5: Backend - Router del Asistente
- Crear `app/routers/asistente.py`
- Endpoints:
  - `GET /api/asistente/checklist/{tipo_licitacion}` - Checklist según tipo (LP, LE, L1, Compra Ágil, etc.)
  - `GET /api/asistente/guia/{tipo_licitacion}` - Guía paso a paso
  - `GET /api/asistente/garantias` - Info sobre tipos de garantías y cuándo aplican
- Datos estáticos basados en el informe de investigación

### Paso 6: Frontend - Setup React con Vite
- Crear proyecto React con Vite en `frontend/`
- Instalar dependencias: react-router-dom, axios
- Configurar estructura de carpetas (components, pages, services)
- Crear `services/api.js` con cliente axios apuntando a `http://localhost:8000/api`

### Paso 7: Frontend - Layout y Navegación
- Crear `components/Layout.jsx` con header, sidebar/navbar, footer
- Configurar React Router con rutas: `/`, `/buscador`, `/dashboard`, `/asistente`
- Estilos CSS limpios y responsive

### Paso 8: Frontend - Buscador de Licitaciones
- Crear `pages/BuscadorPage.jsx` con SearchBar y LicitacionList
- `components/SearchBar.jsx`: inputs para estado, fecha, palabra clave
- `components/LicitacionCard.jsx`: muestra nombre, código, organismo, monto, estado, fechas
- `components/LicitacionList.jsx`: renderiza lista de LicitacionCard
- Conectar con `GET /api/licitaciones`

### Paso 9: Frontend - Dashboard de Oportunidades
- Crear `pages/DashboardPage.jsx`
- `components/Dashboard.jsx`: grid de StatsCards + tablas resumen
- `components/StatsCard.jsx`: tarjeta con número, label e ícono
- Mostrar: total activas, por estado, por organismo
- Conectar con `GET /api/dashboard/*`

### Paso 10: Frontend - Asistente de Postulación
- Crear `pages/AsistentePage.jsx`
- `components/Asistente.jsx`: selector de tipo de licitación + checklist interactivo + guía paso a paso
- Mostrar info de garantías según monto/tipo
- Conectar con `GET /api/asistente/*`
