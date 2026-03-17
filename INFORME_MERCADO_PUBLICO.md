# Informe de Investigación: Mercado Público de Chile
## Oportunidades para construir un sitio web de asistencia a PYMEs

**Fecha:** 17 de marzo de 2026

---

## 1. ¿Qué es Mercado Público?

Mercado Público (www.mercadopublico.cl) es la plataforma oficial de compras públicas del Estado de Chile, administrada por la Dirección ChileCompra. En ella, más de **850 organismos públicos** adquieren bienes y servicios de más de **123.000 proveedores**, de los cuales el **91% son micro y pequeñas empresas**. Anualmente se transan más de **US$13.104 millones**.

Un **43% de los contratos públicos** son adjudicados a pequeñas y medianas empresas, lo que representa una oportunidad masiva para PYMEs.

---

## 2. Servicios y Funcionalidades de la Plataforma

### 2.1 Mecanismos de Compra

| Mecanismo | Descripción | Monto |
|-----------|-------------|-------|
| **Licitación Pública (LP)** | Proceso abierto y competitivo para adquisiciones mayores | > 1.000 UTM |
| **Licitación Privada (LE)** | Proceso para montos medianos | 100 - 1.000 UTM |
| **Licitación Menor (L1)** | Proceso simplificado para montos menores | < 100 UTM |
| **Compra Ágil** | Procedimiento expedito, con al menos 3 cotizaciones. Prioriza Empresas de Menor Tamaño y locales | ≤ 100 UTM |
| **Convenio Marco** | Tienda electrónica con catálogo de productos/servicios pre-adjudicados | > 100 UTM |
| **Trato Directo** | Contratación directa con un proveedor específico (casos justificados) | Variable |
| **Subasta Inversa Electrónica** | Puja online en tiempo real donde proveedores compiten bajando precios (60 min + extensión) | Bienes estandarizados no en Convenio Marco |
| **Diálogos Competitivos** | Nuevo procedimiento para soluciones complejas | Variable |
| **Contratos para la Innovación** | Nuevo procedimiento para soluciones innovadoras | Variable |

### 2.2 Secciones Principales del Sitio

- **Búsqueda de Licitaciones**: Filtros por rubro, ubicación, monto, estado
- **Órdenes de Compra**: Consulta de órdenes emitidas por organismos públicos
- **Contratos**: Registro de contratos adjudicados
- **Consultas al Mercado**: Consultas previas que hacen los organismos antes de licitar
- **Plan de Compras**: Planificación anual de compras de cada organismo (2026: $15,6 billones CLP planificados)
- **Ficha de Proveedores**: Información pública de cada proveedor registrado
- **Tienda Electrónica (ChileCompra Express)**: Catálogo de Convenios Marco
- **Catálogo de Economía Circular**: Productos en desuso del Estado (obligatorio desde junio 2025)

### 2.3 Plataformas Complementarias

| Plataforma | URL | Función |
|-----------|-----|---------|
| **ChileCompra** | www.chilecompra.cl | Sitio institucional con normativa, directivas y capacitación |
| **ChileProveedores** | proveedor.mercadopublico.cl | Registro oficial de proveedores del Estado |
| **Centro de Ayuda** | ayuda.mercadopublico.cl | Soporte técnico y preguntas frecuentes |
| **Datos Abiertos** | datos-abiertos.chilecompra.cl | Portal de datos abiertos y descargas masivas |
| **API Mercado Público** | api.mercadopublico.cl | API pública para desarrollo de aplicaciones |

---

## 3. API y Fuentes de Datos (Oportunidades Técnicas)

### 3.1 API REST de Mercado Público

La API pública permite consumir información de licitaciones y órdenes de compra. Está en estado **Beta**.

**Autenticación:** Se requiere un ticket (API key). Existe un ticket de pruebas: `F8537A18-6766-4DEF-9E59-426B4FEE2844`

**Formatos de respuesta:** JSON, JSONP, XML

#### Endpoints de Licitaciones

```
Base: https://api.mercadopublico.cl/servicios/v1/publico/licitaciones

GET .json?ticket={TICKET}                                    → Licitaciones del día
GET .json?codigo={CODIGO}&ticket={TICKET}                    → Licitación por código
GET .json?fecha={ddmmaaaa}&ticket={TICKET}                   → Licitaciones por fecha
GET .json?estado={ESTADO}&ticket={TICKET}                    → Licitaciones por estado
GET .json?fecha={ddmmaaaa}&estado={ESTADO}&ticket={TICKET}   → Por fecha y estado
GET .json?CodigoOrganismo={COD}&ticket={TICKET}              → Por organismo público
GET .json?CodigoProveedor={COD}&ticket={TICKET}              → Por proveedor
```

**Estados disponibles:** activas, cerradas, desierta, adjudicada, revocada, suspendida, todos

#### Endpoints de Órdenes de Compra

```
Base: https://api.mercadopublico.cl/servicios/v1/publico/ordenesdecompra

GET .json?codigo={CODIGO_OC}&ticket={TICKET}                        → OC por código
GET .json?estado=todos&ticket={TICKET}                               → Todas las OC del día
GET .json?fecha={ddmmaaaa}&ticket={TICKET}                           → OC por fecha
GET .json?fecha={ddmmaaaa}&CodigoOrganismo={COD}&ticket={TICKET}     → OC por organismo
GET .json?fecha={ddmmaaaa}&CodigoProveedor={COD}&ticket={TICKET}     → OC por proveedor
```

#### Endpoints de Búsqueda de Empresas

```
# Buscar proveedor por RUT
GET https://api.mercadopublico.cl/servicios/v1/Publico/Empresas/BuscarProveedor
    ?rutempresaproveedor={RUT_CON_PUNTOS_Y_GUION}&ticket={TICKET}

# Listar todos los organismos públicos
GET https://api.mercadopublico.cl/servicios/v1/Publico/Empresas/BuscarComprador
    ?ticket={TICKET}
```

### 3.2 Datos Abiertos (Open Data)

| Recurso | URL | Descripción |
|---------|-----|-------------|
| Portal principal | datos-abiertos.chilecompra.cl | Datasets y herramientas |
| Descargas masivas | datos-abiertos.chilecompra.cl/descargas/ordenes-y-licitaciones | Archivos CSV/Excel de licitaciones y OC |
| OCDS | datos-abiertos.chilecompra.cl/descargas/procesos-ocds | Estándar Open Contracting Data Standard |
| Herramientas API | datos-abiertos.chilecompra.cl/descargas/herramientas | Documentación y herramientas para devs |

**Datos OCDS disponibles desde:**
- Licitaciones: desde 2009
- Convenio Marco y Trato Directo: desde 2019

### 3.3 Documentación Técnica

- Diccionario de datos de licitaciones (PDF): `api.mercadopublico.cl/documentos/Documentación API Mercado Publico - Licitaciones.pdf`
- Repositorio comunitario en GitHub: `github.com/MartinGonzalezAlvarez/api_mercadop`

---

## 4. Registro y Certificación de Proveedores (ChileProveedores)

### Requisitos

Desde **diciembre 2024**, es **obligatorio** estar inscrito y en estado hábil en el Registro de Proveedores para participar en licitaciones y firmar contratos.

### Tipos de Registro

| Tipo | Descripción |
|------|-------------|
| **Registro Básico** | Habilitación inicial para operar en licitaciones. Gratuito |
| **Registro Avanzado** | Servicios adicionales: certificación de habilidades, acreditación de documentos |

### Tarifas (por tamaño de empresa)

| Tamaño | Ventas anuales | Tarifa semestral | Tarifa anual |
|--------|---------------|-----------------|--------------|
| Microempresa | 0 - 2.400 UF | $9.990 | $18.867 |
| PYME | 2.401 - 100.000 UF | $23.709 | $46.489 |
| Grande | > 100.000 UF | - | $47.165 |

### Composición actual

- 30.000 empresas inscritas
- 65% microempresas
- 32% PYMEs
- 3% grandes empresas

---

## 5. Sistema de Garantías

### Tipos de Garantía

| Garantía | Cuándo se exige | Límite |
|----------|----------------|--------|
| **Seriedad de la Oferta** | Solo en licitaciones > 5.000 UTM (con justificación) | Máx. 3% del monto ofertado |
| **Fiel y Oportuno Cumplimiento** | Contrataciones > 1.000 UTM | Máx. 5% del valor neto del contrato |

### Instrumentos Disponibles

- **Boleta Bancaria**: Emitida por bancos, inmoviliza capital
- **Certificado de Fianza**: No inmoviliza fondos, ideal para PYMEs (ej: Maxxa, hasta $20M)
- **Póliza de Seguro/Garantía**: Emitida por aseguradoras (ej: AVLA, Garantía Segura), 100% online

**Nota importante para PYMEs:** La nueva normativa redujo significativamente la exigencia de garantías, facilitando la participación de empresas de menor tamaño.

---

## 6. Oportunidades para un Sitio Web de Asistencia a PYMEs

### 6.1 Funcionalidades Clave a Desarrollar

#### A) Motor de Búsqueda Inteligente de Licitaciones
- **Fuente de datos:** API de Mercado Público (licitaciones activas, por rubro, ubicación, monto)
- **Valor agregado:** Filtros personalizados por perfil de PYME, alertas por email/WhatsApp, matching inteligente con IA entre capacidades de la empresa y requisitos de licitación
- **Actualización:** Cada 5 minutos (igual que Mercado Público)

#### B) Dashboard de Oportunidades
- **Fuente de datos:** API + datos OCDS + plan de compras
- **Valor agregado:** Visualización del plan de compras 2026 ($15,6 billones), tendencias por rubro/organismo, predicción de licitaciones futuras basada en patrones históricos

#### C) Asistente de Postulación
- **Valor agregado:** Guías paso a paso para cada tipo de licitación, templates de ofertas, checklist de documentos requeridos, validador de requisitos antes de postular

#### D) Gestión de Garantías
- **Fuente de datos:** Integración con plataformas de fianzas (Maxxa, AVLA, Garantía Segura)
- **Valor agregado:** Comparador de costos de garantías, simulador de montos, gestión digital de certificados

#### E) Seguimiento de Procesos
- **Fuente de datos:** API de OC + licitaciones
- **Valor agregado:** Timeline visual del estado de cada licitación/OC, notificaciones de cambios de estado, seguimiento de pagos post-adjudicación

#### F) Análisis Competitivo
- **Fuente de datos:** Datos abiertos + API
- **Valor agregado:** Análisis de competidores en licitaciones anteriores, precios promedio adjudicados por rubro, tasas de éxito por organismo público, ranking de proveedores por sector

#### G) Capacitación y Asesoría
- **Valor agregado:** Cursos sobre cómo participar en Mercado Público, glosario de términos, FAQ interactivo, chatbot con IA para resolver dudas sobre procesos

#### H) Gestión Documental
- **Valor agregado:** Repositorio centralizado de documentos de la empresa, auto-completado de formularios, gestión de vencimientos de certificados y acreditaciones

### 6.2 Datos Disponibles para Explotar

| Dato | Fuente | Uso Potencial |
|------|--------|---------------|
| Licitaciones activas (tiempo real) | API REST | Motor de búsqueda, alertas |
| Licitaciones históricas (desde 2009) | OCDS / Descargas masivas | Análisis de mercado, predicciones |
| Órdenes de compra | API REST | Seguimiento de contratos, análisis de pagos |
| Plan de compras anual | Mercado Público | Proyección de oportunidades |
| Organismos públicos (850+) | API REST | Directorio de compradores |
| Proveedores registrados (123.000+) | API REST (por RUT) | Análisis competitivo |
| Convenios Marco | Tienda electrónica | Catálogo de oportunidades recurrentes |

### 6.3 Modelo de Negocio Sugerido

| Tier | Precio | Funcionalidades |
|------|--------|----------------|
| **Gratuito** | $0 | Búsqueda básica, alertas limitadas (3/mes), guías generales |
| **PYME** | $15.000-25.000/mes | Alertas ilimitadas, dashboard, seguimiento, análisis básico |
| **Premium** | $45.000-75.000/mes | IA para matching, análisis competitivo, asistente de postulación, gestión documental |
| **Enterprise** | Personalizado | API propia, integración con ERP, soporte dedicado |

### 6.4 Ventajas Competitivas Posibles

1. **Simplificación**: Mercado Público es complejo para PYMEs sin experiencia; un sitio simplificado con UX moderna tiene alto valor
2. **Inteligencia de datos**: Los datos están disponibles pero dispersos; agregarlos y analizarlos crea valor diferencial
3. **Automatización**: Alertas, auto-completado de formularios y seguimiento automático ahorran tiempo
4. **Marco legal favorable**: La Ley 21.634 prioriza PYMEs, aumentando la demanda de herramientas de asistencia
5. **Mercado amplio**: 123.000+ proveedores, 91% micro/pequeñas empresas, muchas sin herramientas sofisticadas

### 6.5 Stack Tecnológico Recomendado

- **Backend**: Node.js o Python (FastAPI) para consumir la API de Mercado Público
- **Base de datos**: PostgreSQL para almacenar datos históricos + Redis para caché
- **Frontend**: React/Next.js para dashboard interactivo
- **Scheduler**: Cron jobs para sincronizar datos cada 5 minutos
- **IA/ML**: Modelos de matching licitación-empresa, análisis de texto de bases de licitación
- **Notificaciones**: SendGrid (email), Twilio (SMS/WhatsApp)

---

## 7. Consideraciones Legales y Técnicas

- La API está en estado **Beta** y puede tener interrupciones
- Los datos son **públicos** y su uso está alineado con la política de datos abiertos del gobierno
- Se debe solicitar un **ticket propio** para uso en producción (no usar el de pruebas)
- El estándar **OCDS** permite interoperabilidad con sistemas internacionales
- Cumplir con la **Ley de Protección de Datos Personales** al manejar información de proveedores

---

## 8. Fuentes y Enlaces de Referencia

| Recurso | URL |
|---------|-----|
| Mercado Público (principal) | https://www.mercadopublico.cl |
| ChileCompra (institucional) | https://www.chilecompra.cl |
| API Mercado Público | https://api.mercadopublico.cl/modules/api.aspx |
| Datos Abiertos | https://datos-abiertos.chilecompra.cl |
| Datos OCDS | https://datos-abiertos.chilecompra.cl/descargas/procesos-ocds |
| Descargas masivas | https://datos-abiertos.chilecompra.cl/descargas/ordenes-y-licitaciones |
| ChileProveedores (Registro) | https://proveedor.mercadopublico.cl |
| Centro de Ayuda | https://ayuda.mercadopublico.cl |
| Plan de Compras 2026 | https://www.mercadopublico.cl/Home/Plandecompra |
| Garantía Mercado Público (Maxxa) | https://garantiamercadopublico.cl |
| Garantía Segura | https://www.garantiasegura.cl |
| AVLA Garantías | https://www.avla.com/cl/blog/garantia-mercado-publico-en-chile |
| Soporte telefónico | 600 7000 600 / +56 4 4236 0646 |
