/**
 * IP+MP Platform — API de Project Individual
 *
 * GET   /api/projects/[id]   → Detalle completo de un project (por UUID o publicId)
 * PATCH /api/projects/[id]   → Actualizar status y/o data del project
 *
 * El parámetro [id] acepta tanto UUID como publicId (ej: DREAMOMS-RP-2026-0001)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { projects, tenants, templates } from '@/db/schema';
import { eq } from 'drizzle-orm';

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

// ── Helper: buscar project por UUID o publicId ───────
async function findProject(idParam: string) {
  // Intentar como UUID primero (formato: 8-4-4-4-12 hex)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);

  const condition = isUuid
    ? eq(projects.id, idParam)
    : eq(projects.publicId, idParam);

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
    .innerJoin(tenants, eq(projects.tenantId, tenants.id))
    .innerJoin(templates, eq(projects.templateId, templates.id))
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

    return NextResponse.json({
      project: {
        ...safeProject,
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
        updates.status = PIPELINE_ORDER[currentIndex + 1];
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

    return NextResponse.json({
      success: true,
      project: {
        id: updated.id,
        publicId: updated.publicId,
        status: updated.status,
        data: updated.data,
        updatedAt: updated.updatedAt,
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
