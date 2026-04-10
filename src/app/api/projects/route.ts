/**
 * IP+MP Platform — API de Projects
 *
 * GET  /api/projects         → Lista todos los projects (con filtros opcionales)
 * POST /api/projects         → Crea un nuevo project con publicId automático
 *
 * Formato publicId: TENANT_SLUG-PREFIX-AÑO-NÚMERO
 * Ejemplo: DREAMOMS-RP-2026-0001
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { projects, tenants, templates } from '@/db/schema';
import { eq, desc, and, like, count } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

// ── GET: Listar projects ─────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantSlug = searchParams.get('tenant');
    const status = searchParams.get('status');

    // Query con joins para traer nombres de tenant y template
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
      })
      .from(projects)
      .innerJoin(tenants, eq(projects.tenantId, tenants.id))
      .innerJoin(templates, eq(projects.templateId, templates.id))
      .orderBy(desc(projects.createdAt));

    // Filtrar en JS (más simple que condiciones dinámicas con Drizzle)
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
  tenantSlug: string;
  templateSlug: string;
  title: string;
  thesis?: string;
  brandVariant?: string;
}

function validateCreateBody(body: unknown): body is CreateProjectBody {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.tenantSlug === 'string' &&
    typeof b.templateSlug === 'string' &&
    typeof b.title === 'string' &&
    b.title.length > 0
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!validateCreateBody(body)) {
      return NextResponse.json(
        { error: 'Campos requeridos: tenantSlug, templateSlug, title' },
        { status: 400 }
      );
    }

    const { tenantSlug, templateSlug, title, thesis, brandVariant } = body;

    // Buscar tenant
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

    // Buscar template
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

    // Generar publicId: TENANT-PREFIX-AÑO-NÚMERO
    const year = new Date().getFullYear();
    const prefix = `${tenantSlug.toUpperCase()}-${template.idPrefix}-${year}-`;

    // Contar projects existentes con este prefijo para el número secuencial
    const [existing] = await db
      .select({ count: count() })
      .from(projects)
      .where(like(projects.publicId, `${prefix}%`));

    const nextNumber = (Number(existing.count) + 1).toString().padStart(4, '0');
    const publicId = `${prefix}${nextNumber}`;

    // Crear project
    const [newProject] = await db
      .insert(projects)
      .values({
        publicId,
        tenantId: tenant.id,
        templateId: template.id,
        title,
        thesis: thesis ?? null,
        brandVariant: brandVariant ?? null,
        classification: template.defaultClassification,
        status: 'draft',
        data: {},
      })
      .returning();

    return NextResponse.json({
      success: true,
      project: {
        ...newProject,
        publicId,
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
        templateSlug: template.slug,
        templateName: template.name,
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
