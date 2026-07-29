-- ════════════════════════════════════════════════════════════════════════════
-- Faro — esquema inicial
--
-- Las migraciones son SQL puro a propósito: el DBA del banco tiene que poder
-- leerlas y aprobarlas sin conocer el ORM que usa la aplicación.
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ── Tipos ───────────────────────────────────────────────────────────────────

CREATE TYPE estado_campana AS ENUM (
  'borrador', 'en_revision', 'aprobada', 'activa', 'pausada', 'archivada'
);

CREATE TYPE categoria_campana AS ENUM (
  'contingencia', 'lanzamiento', 'promocion', 'operativo'
);

CREATE TYPE formato_superficie AS ENUM ('huincha', 'modal', 'drawer');

CREATE TYPE rol_admin AS ENUM ('viewer', 'editor', 'approver', 'admin');

CREATE TYPE tipo_evento AS ENUM (
  'latido', 'entregado', 'suprimido', 'impresion', 'fin_vista',
  'clic', 'acuse', 'descarte', 'expansion', 'error'
);

CREATE TYPE origen_perfil AS ENUM ('verificado', 'auto_declarado');

-- ── Usuarios del panel ──────────────────────────────────────────────────────

CREATE TABLE admin_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idp_subject   text UNIQUE NOT NULL,
  email         citext UNIQUE NOT NULL,
  nombre        text NOT NULL,
  rol           rol_admin NOT NULL DEFAULT 'viewer',
  activo        boolean NOT NULL DEFAULT true,
  ultimo_login  timestamptz,
  creado_en     timestamptz NOT NULL DEFAULT now()
);

-- ── Catálogo de plantillas ──────────────────────────────────────────────────
-- El renderer vive DENTRO de la extensión; esta tabla solo registra qué
-- plantillas existen y desde qué versión de la extensión se pueden usar.

CREATE TABLE templates (
  key                     text PRIMARY KEY,
  nombre                  text NOT NULL,
  descripcion             text NOT NULL,
  formato                 formato_superficie NOT NULL,
  min_extension_version   text NOT NULL DEFAULT '0.1.0',
  activa                  boolean NOT NULL DEFAULT true
);

-- ── Audiencias reutilizables ────────────────────────────────────────────────

CREATE TABLE audiences (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL,
  reglas      jsonb,
  creado_por  uuid REFERENCES admin_users(id),
  creado_en   timestamptz NOT NULL DEFAULT now()
);

-- ── Imágenes ────────────────────────────────────────────────────────────────
-- Toda imagen se re-codifica al subirla. `sha256` es del archivo YA
-- re-codificado, no del original: es lo que efectivamente se sirve.

CREATE TABLE assets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_key  text NOT NULL,
  sha256       text NOT NULL,
  mime         text NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp')),
  bytes        integer NOT NULL CHECK (bytes > 0 AND bytes <= 2097152),
  ancho        integer NOT NULL CHECK (ancho > 0 AND ancho <= 2000),
  alto         integer NOT NULL CHECK (alto > 0 AND alto <= 2000),
  alt_text     text NOT NULL,
  subido_por   uuid REFERENCES admin_users(id),
  creado_en    timestamptz NOT NULL DEFAULT now()
);

-- ── Campañas ────────────────────────────────────────────────────────────────

CREATE TABLE campaigns (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key                   text UNIQUE NOT NULL,
  nombre                text NOT NULL,
  categoria             categoria_campana NOT NULL,
  estado                estado_campana NOT NULL DEFAULT 'borrador',
  -- 0 = P0 (contingencia crítica) … 3 = promoción. El arbitraje de superficie
  -- en la extensión usa este orden: menor número gana.
  prioridad             smallint NOT NULL DEFAULT 2 CHECK (prioridad BETWEEN 0 AND 3),
  template_key          text NOT NULL REFERENCES templates(key),
  version_actual        integer NOT NULL DEFAULT 0,
  inicia_en             timestamptz,
  termina_en            timestamptz,

  -- Interruptor por campaña. Surte efecto en el siguiente ciclo (≤60 s).
  kill_switch           boolean NOT NULL DEFAULT false,

  -- Ruta de emergencia: un solo aprobador, y la campaña expira sola.
  es_emergencia         boolean NOT NULL DEFAULT false,
  emergencia_expira_en  timestamptz,
  justificacion_emergencia text,

  creado_por            uuid REFERENCES admin_users(id),
  actualizado_por       uuid REFERENCES admin_users(id),
  creado_en             timestamptz NOT NULL DEFAULT now(),
  actualizado_en        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ventana_coherente CHECK (termina_en IS NULL OR inicia_en IS NULL OR termina_en > inicia_en),
  CONSTRAINT emergencia_con_justificacion CHECK (
    NOT es_emergencia OR (justificacion_emergencia IS NOT NULL AND emergencia_expira_en IS NOT NULL)
  )
);

CREATE INDEX idx_campaigns_estado ON campaigns(estado) WHERE estado = 'activa';

-- ── Versiones de campaña (inmutables) ───────────────────────────────────────
-- Publicar nunca modifica una versión: crea una nueva. Así el contenido que
-- se firmó y se mostró queda para siempre reproducible en una auditoría.

CREATE TABLE campaign_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  version        integer NOT NULL,

  contenido      jsonb NOT NULL,   -- campos tipados validados contra la plantilla
  presentacion   jsonb NOT NULL,   -- formato, frecuencia, descartable, acuse
  audiencia      jsonb NOT NULL,   -- reglas de segmentación
  experimento    jsonb NOT NULL,   -- controlPct, rolloutPct, salt

  content_hash   text,             -- sha256 de la forma canónica
  signature      text,             -- ECDSA P-256 sobre content_hash

  creado_por     uuid NOT NULL REFERENCES admin_users(id),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  enviado_en     timestamptz,
  enviado_por    uuid REFERENCES admin_users(id),
  aprobado_en    timestamptz,
  aprobado_por   uuid REFERENCES admin_users(id),
  nota_aprobacion text,
  publicado_en   timestamptz,

  UNIQUE (campaign_id, version),

  -- ══════════════════════════════════════════════════════════════════════════
  -- DOBLE CONTROL, IMPUESTO POR LA BASE DE DATOS.
  --
  -- Quien crea una versión no puede aprobarla. Está aquí y no en la lógica de
  -- aplicación a propósito: un auditor lo verifica en diez segundos, y ningún
  -- bug ni ruta nueva de la API puede saltárselo.
  -- ══════════════════════════════════════════════════════════════════════════
  CONSTRAINT doble_control CHECK (aprobado_por IS NULL OR aprobado_por <> creado_por)
);

CREATE INDEX idx_versions_campaign ON campaign_versions(campaign_id, version DESC);

-- ── Dispositivos y perfiles ─────────────────────────────────────────────────

CREATE TABLE installs (
  install_id        uuid PRIMARY KEY,
  primera_vez       timestamptz NOT NULL DEFAULT now(),
  ultimo_visto      timestamptz NOT NULL DEFAULT now(),
  extension_version text,
  chrome_version    text,
  so                text,
  revocado_en       timestamptz
);

CREATE INDEX idx_installs_ultimo_visto ON installs(ultimo_visto DESC);

CREATE TABLE install_profiles (
  install_id     uuid PRIMARY KEY REFERENCES installs(install_id) ON DELETE CASCADE,
  -- Identificador laboral corporativo. NUNCA el RUT: minimización de datos
  -- personales bajo la Ley 21.719.
  employee_id    text,
  email          citext,
  rol            text,
  sucursal       text,
  region         text,
  area           text,
  tags           text[] NOT NULL DEFAULT '{}',
  origen_perfil  origen_perfil NOT NULL DEFAULT 'auto_declarado',
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_sucursal ON install_profiles(sucursal);
CREATE INDEX idx_profiles_region_rol ON install_profiles(region, rol);
CREATE INDEX idx_profiles_employee ON install_profiles(employee_id);

CREATE TABLE install_profile_history (
  id          bigserial PRIMARY KEY,
  install_id  uuid NOT NULL,
  antes       jsonb,
  despues     jsonb,
  cambiado_en timestamptz NOT NULL DEFAULT now()
);

-- ── Eventos (particionados por día) ─────────────────────────────────────────
-- Sin restricción de clave foránea contra campaigns a propósito: la ingesta
-- debe ser rápida y nunca debe fallar porque una campaña se archivó.

CREATE TABLE events (
  event_id          uuid NOT NULL,
  install_id        uuid NOT NULL,

  -- Desnormalizados al ingerir para que el reporting no tenga que unir tablas
  -- sobre millones de filas.
  employee_id       text,
  sucursal          text,
  region            text,
  rol               text,

  campaign_id       uuid,
  campaign_version  integer,
  variante          text CHECK (variante IN ('target', 'control')),
  tipo              tipo_evento NOT NULL,
  formato           formato_superficie,

  -- Identificador LÓGICO del botón. Jamás la URL de destino.
  cta_id            text,
  dwell_ms          integer CHECK (dwell_ms IS NULL OR dwell_ms BETWEEN 0 AND 600000),
  motivo_supresion  text,
  codigo_error      text,

  ocurrido_en       timestamptz NOT NULL,
  recibido_en       timestamptz NOT NULL DEFAULT now(),
  session_id        uuid,
  seq               integer,
  extension_version text,

  PRIMARY KEY (event_id, recibido_en)
) PARTITION BY RANGE (recibido_en);

CREATE INDEX idx_events_campana ON events(campaign_id, recibido_en DESC);
CREATE INDEX idx_events_install ON events(install_id, recibido_en DESC);
CREATE INDEX idx_events_tipo ON events(tipo, recibido_en DESC);

-- ── Métricas agregadas ──────────────────────────────────────────────────────
-- El dashboard consulta esta tabla, nunca la de eventos crudos.

CREATE TABLE campaign_daily_metrics (
  dia                       date NOT NULL,
  campaign_id               uuid NOT NULL,
  campaign_version          integer NOT NULL,
  variante                  text NOT NULL,
  sucursal                  text NOT NULL DEFAULT '',
  region                    text NOT NULL DEFAULT '',
  rol                       text NOT NULL DEFAULT '',

  entregados_unicos         integer NOT NULL DEFAULT 0,
  impresiones               bigint  NOT NULL DEFAULT 0,
  alcance_unico             integer NOT NULL DEFAULT 0,
  clics                     bigint  NOT NULL DEFAULT 0,
  clics_unicos              integer NOT NULL DEFAULT 0,
  acuses                    integer NOT NULL DEFAULT 0,
  descartes                 integer NOT NULL DEFAULT 0,
  suprimidos                integer NOT NULL DEFAULT 0,
  dwell_ms_p50              integer,
  dwell_ms_p90              integer,
  calculado_en              timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (dia, campaign_id, campaign_version, variante, sucursal, region, rol)
);

CREATE TABLE install_daily_activity (
  dia        date NOT NULL,
  install_id uuid NOT NULL,
  PRIMARY KEY (dia, install_id)
);

-- ── Auditoría (append-only) ─────────────────────────────────────────────────

CREATE TABLE audit_log (
  id           bigserial PRIMARY KEY,
  actor_id     uuid,
  actor_email  text,
  accion       text NOT NULL,
  entidad      text NOT NULL,
  entidad_id   text,
  antes        jsonb,
  despues      jsonb,
  ip           inet,
  user_agent   text,
  request_id   text,
  creado_en    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_entidad ON audit_log(entidad, entidad_id, creado_en DESC);
CREATE INDEX idx_audit_actor ON audit_log(actor_id, creado_en DESC);

-- El append-only se impone con un trigger, además de los grants: en el
-- prototipo la aplicación corre como dueña de la tabla, así que los grants
-- solos no bastarían.
CREATE OR REPLACE FUNCTION audit_log_solo_insert() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log es append-only: % no está permitido', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_inmutable
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_solo_insert();

-- ── Configuración global ────────────────────────────────────────────────────

CREATE TABLE config_global (
  clave         text PRIMARY KEY,
  valor         jsonb NOT NULL,
  actualizado_por uuid REFERENCES admin_users(id),
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO config_global (clave, valor) VALUES
  ('kill_global', 'false'::jsonb),
  ('etag_manifiesto', '"inicial"'::jsonb);

-- ── Sesiones del panel ──────────────────────────────────────────────────────

CREATE TABLE admin_sessions (
  id          text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  csrf_token  text NOT NULL,
  expira_en   timestamptz NOT NULL,
  creado_en   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_expira ON admin_sessions(expira_en);
