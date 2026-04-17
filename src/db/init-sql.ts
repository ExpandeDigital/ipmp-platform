/**
 * IP+MP Platform — Schema SQL inicial
 *
 * SQL crudo para crear todas las tablas en el primer arranque.
 * Se usa una sola vez vía POST /api/admin/init.
 *
 * En el futuro (Fase 1+), las migraciones se manejarán con drizzle-kit.
 * Por ahora, este enfoque evita que Cristian tenga que correr nada local.
 */

export const CREATE_TABLES_SQL = `
-- =====================================================
-- Extensions
-- =====================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- TENANTS
-- =====================================================
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  legal_entity TEXT NOT NULL,
  brand_variants JSONB DEFAULT '[]'::jsonb,
  system_prompt_base TEXT NOT NULL,
  semilla_visual JSONB DEFAULT '{}'::jsonb,
  canonical_avatar_url TEXT,
  monthly_token_limit INTEGER DEFAULT 1000000,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- =====================================================
-- USERS
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('admin', 'operator', 'reviewer')),
  token TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- =====================================================
-- TEMPLATES
-- =====================================================
CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  family TEXT NOT NULL CHECK (family IN ('prensa', 'opinion', 'institucional', 'academico')),
  id_prefix TEXT NOT NULL,
  default_classification TEXT NOT NULL,
  required_visual_slots JSONB DEFAULT '[]'::jsonb,
  pipeline_phases JSONB DEFAULT '[]'::jsonb,
  system_prompt_addendum TEXT,
  semilla_visual_override JSONB,
  review_level TEXT NOT NULL DEFAULT 'profunda' CHECK (review_level IN ('express', 'profunda')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- =====================================================
-- PROJECTS
-- =====================================================
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id TEXT NOT NULL UNIQUE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  template_id UUID NOT NULL REFERENCES templates(id),
  brand_variant TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'validacion', 'hito_1', 'pesquisa', 'produccion',
    'visual', 'revision', 'aprobado', 'exportado'
  )),
  thesis TEXT,
  classification TEXT NOT NULL,
  data JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- =====================================================
-- ASSETS
-- =====================================================
CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('hero_narrativa', 'still_marca', 'visual_cientifico', 'gsv', 'infografia')),
  file_url TEXT NOT NULL,
  caption TEXT,
  alt_text TEXT,
  origin TEXT NOT NULL DEFAULT 'ia_generated' CHECK (origin IN ('ia_generated', 'real_photo', 'illustration')),
  origin_tool TEXT DEFAULT 'manus_im',
  represents_real_person BOOLEAN NOT NULL DEFAULT false,
  consent_doc_url TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  previous_version_id UUID,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id);

-- =====================================================
-- REVISIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES users(id),
  level TEXT NOT NULL CHECK (level IN ('express', 'profunda')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'changes_requested')),
  comments TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revisions_project ON revisions(project_id);

-- =====================================================
-- EXPORTS
-- =====================================================
CREATE TABLE IF NOT EXISTS exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  export_type TEXT NOT NULL CHECK (export_type IN ('editor', 'medios_propios', 'redes', 'tracking_cto', 'empaquetado_interno')),
  file_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exports_project ON exports(project_id);

-- =====================================================
-- CONSUMPTION_LOGS
-- =====================================================
CREATE TABLE IF NOT EXISTS consumption_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  model TEXT NOT NULL,
  tool TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consumption_tenant ON consumption_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_consumption_created ON consumption_logs(created_at);

-- =====================================================
-- EDITORES AGENDA (Chunk 10)
-- =====================================================
-- Chunk 10: Agenda de Editores (media relations interno)
CREATE TABLE IF NOT EXISTS editores_agenda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  medio TEXT NOT NULL,
  seccion TEXT,
  tier INTEGER NOT NULL,
  tenants_relevantes JSONB NOT NULL DEFAULT '[]'::jsonb,
  tipo_pieza_recomendado JSONB NOT NULL DEFAULT '[]'::jsonb,
  email TEXT,
  telefono TEXT,
  notas TEXT,
  ultima_verificacion TIMESTAMP,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_editores_activo ON editores_agenda(activo);
CREATE INDEX IF NOT EXISTS idx_editores_tier ON editores_agenda(tier);

-- =====================================================
-- TENANT ASSETS — Asset Library per tenant (Chunk 17A)
-- =====================================================
CREATE TABLE IF NOT EXISTS tenant_assets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  nombre          TEXT NOT NULL,
  blob_url        TEXT NOT NULL,
  blob_pathname   TEXT,
  blob_size       INTEGER,
  mime_type       TEXT,
  declaracion_ia  BOOLEAN NOT NULL DEFAULT false,
  alt_text        TEXT NOT NULL,
  origen          TEXT NOT NULL,
  activo          BOOLEAN NOT NULL DEFAULT true,
  version         INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_assets_tenant ON tenant_assets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_assets_activo ON tenant_assets(activo);

-- =====================================================
-- Chunk 28: editor asignado a proyecto (nullable)
-- =====================================================
ALTER TABLE projects ADD COLUMN IF NOT EXISTS editor_id UUID REFERENCES editores_agenda(id);
CREATE INDEX IF NOT EXISTS idx_projects_editor ON projects(editor_id);

-- =====================================================
-- Chunk 31D: estado hito_1 en pipelineStatus
-- =====================================================
-- Agrega 'hito_1' al CHECK constraint de projects.status.
-- Verificado en Railway (17 abril 2026): el nombre del constraint es
-- 'projects_status_check' (convención estándar de Postgres sobre
-- tablas creadas por el bloque CREATE TABLE de este mismo archivo).
-- Patrón: DROP + ADD del mismo nombre con la lista actualizada.
-- Idempotente: re-ejecutar tras un init previo regenera exactamente
-- la misma constraint con los mismos valores permitidos.
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN (
    'draft','validacion','hito_1','pesquisa','produccion',
    'visual','revision','aprobado','exportado'
  ));
`;
