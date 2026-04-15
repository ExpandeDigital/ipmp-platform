/**
 * IP+MP Platform — API de Projects
 *
 * GET  /api/projects         → Lista todos los projects (con filtros opcionales)
 * POST /api/projects         → Crea un nuevo project
 *
 * REFACTORIZACIÓN 5a (Abril 2026):
 *   - POST ya NO requiere tenantSlug ni templateSlug
 *   - Project nace solo con título + tesis (InvestigaPress)
 *   - PublicId temporal: IP-AÑO-XXXX (sin tenant prefix)
 *   - Si se pasan tenant/template, se usan (retrocompatibilidad)
 *   - GET usa LEFT JOIN (tenant y template pueden ser null)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { projects, tenants, templates, editoresAgenda } from '@/db/schema';
import { eq, desc, like, count, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

// ── GET: Listar projects ─────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantSlug = searchParams.get('tenant');
    const status = searchParams.get('status');

    // LEFT JOIN: tenant y template pueden ser null (fase InvestigaPress)
    const allProjects = await db
      .select({
        id: projects.id,
        publicId: projects.publicId,
        title: projects.title,
        status: projects.status,
        thesis: projects.thesis,
        classification: projects.classification,
        brandVariant: projects.brandVariant,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
        tenantSlug: tenants.slug,
        tenantName: tenants.name,
        templateSlug: templates.slug,
        templateName: templates.name,
        templateFamily: templates.family,
        templatePrefix: templates.idPrefix,
        editorId: projects.editorId,
        editorNombre: editoresAgenda.nombre,
        editorApellido: editoresAgenda.apellido,
      })
      .from(projects)
      .leftJoin(tenants, eq(projects.tenantId, tenants.id))
      .leftJoin(templates, eq(projects.templateId, templates.id))
      .leftJoin(editoresAgenda, eq(projects.editorId, editoresAgenda.id))
      .orderBy(desc(projects.createdAt));

    // Filtrar en JS
    let filtered = allProjects;
    if (tenantSlug) {
      filtered = filtered.filter((p) => p.tenantSlug === tenantSlug);
    }
    if (status) {
      filtered = filtered.filter((p) => p.status === status);
    }

    return NextResponse.json({ projects: filtered, total: filtered.length });
  } catch (error) {
    console.error('[GET /api/projects] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    );
  }
}

// ── POST: Crear project ──────────────────────────────
interface CreateProjectBody {
  title: string;
  thesis?: string;
  // Opcionales — si se pasan, se asignan (retrocompatibilidad Chunk 4)
  tenantSlug?: string;
  templateSlug?: string;
  brandVariant?: string;
}

function validateCreateBody(body: unknown): body is CreateProjectBody {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return typeof b.title === 'string' && b.title.length > 0;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!validateCreateBody(body)) {
      return NextResponse.json(
        { error: 'Campo requerido: title' },
        { status: 400 }
      );
    }

    const { title, thesis, tenantSlug, templateSlug, brandVariant } = body;

    let tenantId: string | null = null;
    let templateId: string | null = null;
    let tenantSlugResolved: string | null = null;
    let tenantNameResolved: string | null = null;
    let templateSlugResolved: string | null = null;
    let templateNameResolved: string | null = null;
    let idPrefix: string | null = null;
    let classification = 'por_asignar';

    // ── Si se pasa tenant, resolverlo ──
    if (tenantSlug) {
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.slug, tenantSlug))
        .limit(1);

      if (!tenant) {
        return NextResponse.json(
          { error: `Tenant no encontrado: ${tenantSlug}` },
          { status: 404 }
        );
      }
      tenantId = tenant.id;
      tenantSlugResolved = tenant.slug;
      tenantNameResolved = tenant.name;
    }

    // ── Si se pasa template, resolverlo ──
    if (templateSlug) {
      const [template] = await db
        .select()
        .from(templates)
        .where(eq(templates.slug, templateSlug))
        .limit(1);

      if (!template) {
        return NextResponse.json(
          { error: `Plantilla no encontrada: ${templateSlug}` },
          { status: 404 }
        );
      }
      templateId = template.id;
      templateSlugResolved = template.slug;
      templateNameResolved = template.name;
      idPrefix = template.idPrefix;
      classification = template.defaultClassification;
    }

    // ── Generar publicId ──
    const year = new Date().getFullYear();
    let publicId: string;

    if (tenantSlugResolved && idPrefix) {
      // Modo MetricPress (retrocompatibilidad): TENANT-PREFIX-AÑO-XXXX
      const prefix = `${tenantSlugResolved.toUpperCase()}-${idPrefix}-${year}-`;
      const [existing] = await db
        .select({ count: count() })
        .from(projects)
        .where(like(projects.publicId, `${prefix}%`));
      const nextNumber = (Number(existing.count) + 1).toString().padStart(4, '0');
      publicId = `${prefix}${nextNumber}`;
    } else {
      // Modo InvestigaPress: IP-AÑO-XXXX
      const prefix = `IP-${year}-`;
      const [existing] = await db
        .select({ count: count() })
        .from(projects)
        .where(like(projects.publicId, `${prefix}%`));
      const nextNumber = (Number(existing.count) + 1).toString().padStart(4, '0');
      publicId = `${prefix}${nextNumber}`;
    }

    // ── Crear project ──
    const [newProject] = await db
      .insert(projects)
      .values({
        publicId,
        tenantId,
        templateId,
        title,
        thesis: thesis ?? null,
        brandVariant: brandVariant ?? null,
        classification,
        status: 'draft',
        data: {},
      })
      .returning();

    return NextResponse.json({
      success: true,
      project: {
        ...newProject,
        publicId,
        tenantSlug: tenantSlugResolved,
        tenantName: tenantNameResolved,
        templateSlug: templateSlugResolved,
        templateName: templateNameResolved,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/projects] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    );
  }
}
