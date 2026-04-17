/**
 * IP+MP Platform — Schema de base de datos
 *
 * Tablas:
 *   tenants            → Las marcas/unidades del holding (Dreamoms, Expande, etc.)
 *   users              → Usuarios del sistema (admin/operator/reviewer)
 *   templates          → Las 13 plantillas de Project (Reportaje, Asesoría Legislativa, etc.)
 *   projects           → La unidad de trabajo del pipeline IP+MP
 *   assets             → Piezas visuales asociadas a un Project
 *   revisions          → Log de revisiones de Claudia / revisores
 *   exports            → Audit trail de qué se exportó y cuándo
 *   consumption_logs   → Tracking de consumo de Claude API por tenant
 *
 * REFACTORIZACIÓN 5a (Abril 2026):
 *   - tenantId y templateId ahora son NULLABLE
 *   - Project nace sin marca (InvestigaPress), se asigna en traspaso a MetricPress
 *   - classification tiene default 'por_asignar'
 */

import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  numeric,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// =====================================================
// TENANTS
// =====================================================
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  legalEntity: text('legal_entity').notNull(),
  brandVariants: jsonb('brand_variants').$type<string[]>().default([]),
  systemPromptBase: text('system_prompt_base').notNull(),
  semillaVisual: jsonb('semilla_visual').$type<Record<string, unknown>>().default({}),
  canonicalAvatarUrl: text('canonical_avatar_url'),
  monthlyTokenLimit: integer('monthly_token_limit').default(1000000),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// =====================================================
// USERS
// =====================================================
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: text('role', { enum: ['admin', 'operator', 'reviewer'] })
    .notNull()
    .default('operator'),
  token: text('token').notNull().unique(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// =====================================================
// TEMPLATES
// =====================================================
export const templates = pgTable('templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  family: text('family', {
    enum: ['prensa', 'opinion', 'institucional', 'academico'],
  }).notNull(),
  idPrefix: text('id_prefix').notNull(),
  defaultClassification: text('default_classification').notNull(),
  requiredVisualSlots: jsonb('required_visual_slots').$type<unknown[]>().default([]),
  pipelinePhases: jsonb('pipeline_phases').$type<string[]>().default([]),
  systemPromptAddendum: text('system_prompt_addendum'),
  semillaVisualOverride: jsonb('semilla_visual_override').$type<Record<string, unknown>>(),
  reviewLevel: text('review_level', { enum: ['express', 'profunda'] })
    .notNull()
    .default('profunda'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// =====================================================
// PROJECTS
// =====================================================
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  publicId: text('public_id').notNull().unique(),
  // ── REFACTORIZACIÓN 5a: nullable hasta traspaso IP→MP ──
  tenantId: uuid('tenant_id').references(() => tenants.id),
  templateId: uuid('template_id').references(() => templates.id),
  brandVariant: text('brand_variant'),
  title: text('title').notNull(),
  status: text('status', {
    enum: [
      'draft',
      'validacion',
      'hito_1',
      'pesquisa',
      'produccion',
      'visual',
      'revision',
      'aprobado',
      'exportado',
    ],
  })
    .notNull()
    .default('draft'),
  thesis: text('thesis'),
  classification: text('classification').notNull().default('por_asignar'),
  data: jsonb('data').$type<Record<string, unknown>>().default({}),
  // ── Chunk 28: editor asignado al proyecto (nullable) ──
  editorId: uuid('editor_id').references(() => editoresAgenda.id),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// =====================================================
// ASSETS
// =====================================================
export const assets = pgTable('assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  type: text('type', {
    enum: ['hero_narrativa', 'still_marca', 'visual_cientifico', 'gsv', 'infografia'],
  }).notNull(),
  fileUrl: text('file_url').notNull(),
  caption: text('caption'),
  altText: text('alt_text'),
  origin: text('origin', { enum: ['ia_generated', 'real_photo', 'illustration'] })
    .notNull()
    .default('ia_generated'),
  originTool: text('origin_tool').default('manus_im'),
  representsRealPerson: boolean('represents_real_person').notNull().default(false),
  consentDocUrl: text('consent_doc_url'),
  version: integer('version').notNull().default(1),
  previousVersionId: uuid('previous_version_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// =====================================================
// REVISIONS
// =====================================================
export const revisions = pgTable('revisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  reviewerId: uuid('reviewer_id').references(() => users.id),
  level: text('level', { enum: ['express', 'profunda'] }).notNull(),
  status: text('status', {
    enum: ['pending', 'approved', 'rejected', 'changes_requested'],
  }).notNull(),
  comments: text('comments'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// =====================================================
// EXPORTS
// =====================================================
export const exports_ = pgTable('exports', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  exportType: text('export_type', {
    enum: ['editor', 'medios_propios', 'redes', 'tracking_cto', 'empaquetado_interno'],
  }).notNull(),
  fileUrl: text('file_url'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// =====================================================
// CONSUMPTION LOGS
// =====================================================
export const consumptionLogs = pgTable('consumption_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  model: text('model').notNull(),
  tool: text('tool'),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).notNull().default('0'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// =====================================================
// RELATIONS
// =====================================================
export const tenantsRelations = relations(tenants, ({ many }) => ({
  projects: many(projects),
  consumptionLogs: many(consumptionLogs),
  tenantAssets: many(tenantAssets),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  tenant: one(tenants, { fields: [projects.tenantId], references: [tenants.id] }),
  template: one(templates, { fields: [projects.templateId], references: [templates.id] }),
  createdByUser: one(users, { fields: [projects.createdBy], references: [users.id] }),
  assets: many(assets),
  revisions: many(revisions),
  exports: many(exports_),
}));

export const assetsRelations = relations(assets, ({ one }) => ({
  project: one(projects, { fields: [assets.projectId], references: [projects.id] }),
}));

export const revisionsRelations = relations(revisions, ({ one }) => ({
  project: one(projects, { fields: [revisions.projectId], references: [projects.id] }),
  reviewer: one(users, { fields: [revisions.reviewerId], references: [users.id] }),
}));

// =====================================================
// EDITORES AGENDA (Chunk 10)
// =====================================================
export const editoresAgenda = pgTable('editores_agenda', {
  id: uuid('id').primaryKey().defaultRandom(),
  nombre: text('nombre').notNull(),
  apellido: text('apellido').notNull(),
  medio: text('medio').notNull(),
  seccion: text('seccion'),
  tier: integer('tier').notNull(),
  tenantsRelevantes: jsonb('tenants_relevantes').$type<string[]>().notNull().default([]),
  tipoPiezaRecomendado: jsonb('tipo_pieza_recomendado').$type<string[]>().notNull().default([]),
  email: text('email'),
  telefono: text('telefono'),
  notas: text('notas'),
  ultimaVerificacion: timestamp('ultima_verificacion'),
  activo: boolean('activo').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// =====================================================
// TENANT ASSETS — Asset Library per tenant (Chunk 17A)
// =====================================================
export const tenantAssets = pgTable('tenant_assets', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  nombre: text('nombre').notNull(),
  blob_url: text('blob_url').notNull(),
  blob_pathname: text('blob_pathname'),
  blob_size: integer('blob_size'),
  mime_type: text('mime_type'),
  declaracion_ia: boolean('declaracion_ia').notNull().default(false),
  alt_text: text('alt_text').notNull(),
  origen: text('origen').notNull(),
  activo: boolean('activo').notNull().default(true),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const tenantAssetsRelations = relations(tenantAssets, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantAssets.tenantId],
    references: [tenants.id],
  }),
}));
