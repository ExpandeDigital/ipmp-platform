/**
 * IP+MP Platform — API de Project Individual
 *
 * GET   /api/projects/[id]   → Detalle completo de un project (por UUID o publicId)
 * PATCH /api/projects/[id]   → Actualizar status, data, tenant, template
 *
 * El parámetro [id] acepta tanto UUID como publicId (ej: IP-2026-0001 o DREAMOMS-RP-2026-0001)
 *
 * REFACTORIZACIÓN 5a (Abril 2026):
 *   - LEFT JOIN: tenant y template pueden ser null (fase InvestigaPress)
 *   - PATCH acepta tenantSlug + templateSlug para traspaso IP→MP
 *   - Al asignar tenant+template, se regenera publicId de IP-XXXX a TENANT-PREFIX-XXXX
 *   - Bloqueo: no puede avanzar de pesquisa a produccion sin tenant+template asignados
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { projects, tenants, templates } from '@/db/schema';
import { eq, like, count } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

// ── Pipeline: orden válido de estados ────────────────
const PIPELINE_ORDER = [
  'draft',
  'validacion',
  'pesquisa',
  'produccion',
  'visual',
  'revision',
  'aprobado',
  'exportado',
] as const;

type PipelineStatus = (typeof PIPELINE_ORDER)[number];

// ── Fases InvestigaPress (sin marca) ─────────────────
const IP_PHASES: PipelineStatus[] = ['draft', 'validacion', 'pesquisa'];

// ── Helper: buscar project por UUID o publicId ───────
async function findProject(idParam: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);

  const condition = isUuid
    ? eq(projects.id, idParam)
    : eq(projects.publicId, idParam);

  // LEFT JOIN: tenant y template pueden ser null en fase InvestigaPress
  const rows = await db
    .select({
      id: projects.id,
      publicId: projects.publicId,
      title: projects.title,
      status: projects.status,
      thesis: projects.thesis,
      classification: projects.classification,
      brandVariant: projects.brandVariant,
      data: projects.data,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      tenantId: projects.tenantId,
      templateId: projects.templateId,
      tenantSlug: tenants.slug,
      tenantName: tenants.name,
      tenantSystemPrompt: tenants.systemPromptBase,
      templateSlug: templates.slug,
      templateName: templates.name,
      templateFamily: templates.family,
      templatePrefix: templates.idPrefix,
      templateReviewLevel: templates.reviewLevel,
    })
    .from(projects)
    .leftJoin(tenants, eq(projects.tenantId, tenants.id))
    .leftJoin(templates, eq(projects.templateId, templates.id))
    .where(condition)
    .limit(1);

  return rows[0] ?? null;
}

// ── GET: Detalle de un project ───────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await findProject(id);

    if (!project) {
      return NextResponse.json(
        { error: `Project no encontrado: ${id}` },
        { status: 404 }
      );
    }

    // No exponer systemPrompt en la respuesta (propiedad intelectual)
    const { tenantSystemPrompt, ...safeProject } = project;

    // Determinar fase actual: InvestigaPress o MetricPress
    const isIPPhase = IP_PHASES.includes(project.status as PipelineStatus);

    return NextResponse.json({
      project: {
        ...safeProject,
        phase: isIPPhase ? 'investigapress' : 'metricpress',
        hasTenant: !!project.tenantId,
        hasTemplate: !!project.templateId,
        pipelineIndex: PIPELINE_ORDER.indexOf(project.status as PipelineStatus),
        pipelineTotal: PIPELINE_ORDER.length,
        pipelinePhases: PIPELINE_ORDER,
      },
    });
  } catch (error) {
    console.error('[GET /api/projects/[id]] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    );
  }
}

// ── PATCH: Actualizar project ────────────────────────
interface PatchBody {
  action?: 'advance' | 'retreat';
  data?: Record<string, unknown>;
  // Traspaso IP→MP: asignar tenant y template
  tenantSlug?: string;
  templateSlug?: string;
  brandVariant?: string;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await findProject(id);

    if (!project) {
      return NextResponse.json(
        { error: `Project no encontrado: ${id}` },
        { status: 404 }
      );
    }

    const body: PatchBody = await request.json();
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    // ── Traspaso: asignar tenant + template ──
    if (body.tenantSlug) {
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.slug, body.tenantSlug))
        .limit(1);

      if (!tenant) {
        return NextResponse.json(
          { error: `Tenant no encontrado: ${body.tenantSlug}` },
          { status: 404 }
        );
      }
      updates.tenantId = tenant.id;

      if (body.brandVariant !== undefined) {
        updates.brandVariant = body.brandVariant || null;
      }
    }

    if (body.templateSlug) {
      const [template] = await db
        .select()
        .from(templates)
        .where(eq(templates.slug, body.templateSlug))
        .limit(1);

      if (!template) {
        return NextResponse.json(
          { error: `Plantilla no encontrada: ${body.templateSlug}` },
          { status: 404 }
        );
      }
      updates.templateId = template.id;
      updates.classification = template.defaultClassification;
    }

    // ── Regenerar publicId si se asignaron AMBOS (traspaso completo) ──
    if (body.tenantSlug && body.templateSlug) {
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.slug, body.tenantSlug))
        .limit(1);
      const [template] = await db
        .select()
        .from(templates)
        .where(eq(templates.slug, body.templateSlug))
        .limit(1);

      if (tenant && template) {
        const year = new Date().getFullYear();
        const prefix = `${tenant.slug.toUpperCase()}-${template.idPrefix}-${year}-`;
        const [existing] = await db
          .select({ count: count() })
          .from(projects)
          .where(like(projects.publicId, `${prefix}%`));
        const nextNumber = (Number(existing.count) + 1).toString().padStart(4, '0');
        updates.publicId = `${prefix}${nextNumber}`;
      }
    }

    // ── Avanzar/retroceder pipeline ──
    if (body.action) {
      const currentIndex = PIPELINE_ORDER.indexOf(project.status as PipelineStatus);

      if (body.action === 'advance') {
        if (currentIndex >= PIPELINE_ORDER.length - 1) {
          return NextResponse.json(
            { error: 'El project ya está en el estado final (exportado)' },
            { status: 400 }
          );
        }

        const nextStatus = PIPELINE_ORDER[currentIndex + 1];

        // ── BLOQUEO: no avanzar a produccion sin tenant+template ──
        if (nextStatus === 'produccion') {
          // Verificar si ya tiene tenant+template (puede venir en este mismo PATCH o ya estar asignado)
          const willHaveTenant = updates.tenantId || project.tenantId;
          const willHaveTemplate = updates.templateId || project.templateId;

          if (!willHaveTenant || !willHaveTemplate) {
            return NextResponse.json(
              {
                error: 'Traspaso requerido: para avanzar a Producción necesitás asignar tenant y template (traspaso InvestigaPress → MetricPress)',
                code: 'TRASPASO_REQUIRED',
              },
              { status: 400 }
            );
          }
        }

        updates.status = nextStatus;
      } else if (body.action === 'retreat') {
        if (currentIndex <= 0) {
          return NextResponse.json(
            { error: 'El project ya está en el estado inicial (draft)' },
            { status: 400 }
          );
        }
        updates.status = PIPELINE_ORDER[currentIndex - 1];
      }
    }

    // ── Merge de data (no reemplaza, mergea al nivel raíz) ──
    if (body.data && typeof body.data === 'object') {
      const currentData = (project.data as Record<string, unknown>) ?? {};
      updates.data = { ...currentData, ...body.data };
    }

    // Ejecutar update
    const [updated] = await db
      .update(projects)
      .set(updates)
      .where(eq(projects.id, project.id))
      .returning();

    const isIPPhase = IP_PHASES.includes(updated.status as PipelineStatus);

    return NextResponse.json({
      success: true,
      project: {
        id: updated.id,
        publicId: updated.publicId,
        status: updated.status,
        data: updated.data,
        classification: updated.classification,
        updatedAt: updated.updatedAt,
        phase: isIPPhase ? 'investigapress' : 'metricpress',
        hasTenant: !!updated.tenantId,
        hasTemplate: !!updated.templateId,
        pipelineIndex: PIPELINE_ORDER.indexOf(updated.status as PipelineStatus),
        pipelineTotal: PIPELINE_ORDER.length,
      },
    });
  } catch (error) {
    console.error('[PATCH /api/projects/[id]] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    );
  }
}
