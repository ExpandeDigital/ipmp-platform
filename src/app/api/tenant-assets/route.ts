/**
 * IP+MP Platform — Asset Library per tenant
 *
 * GET  /api/tenant-assets?tenantSlug=X  — lista assets activos del tenant
 * POST /api/tenant-assets               — crea un asset con metadata obligatoria
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { tenants, tenantAssets } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const tenantSlug = request.nextUrl.searchParams.get('tenantSlug');
    if (!tenantSlug) {
      return NextResponse.json(
        { error: 'Query param tenantSlug es obligatorio' },
        { status: 400 }
      );
    }

    const [tenant] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, tenantSlug))
      .limit(1);

    if (!tenant) {
      return NextResponse.json(
        { error: `Tenant no encontrado: ${tenantSlug}` },
        { status: 404 }
      );
    }

    const rows = await db
      .select()
      .from(tenantAssets)
      .where(
        and(
          eq(tenantAssets.tenantId, tenant.id),
          eq(tenantAssets.activo, true)
        )
      )
      .orderBy(desc(tenantAssets.createdAt));

    return NextResponse.json({ success: true, assets: rows });
  } catch (error) {
    console.error('[GET /api/tenant-assets] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    );
  }
}

interface CreateBody {
  tenantSlug?: string;
  nombre?: string;
  blob_url?: string;
  blob_pathname?: string;
  blob_size?: number;
  mime_type?: string;
  declaracion_ia?: boolean;
  alt_text?: string;
  origen?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateBody = await request.json();

    // Validaciones obligatorias
    if (!body.tenantSlug || typeof body.tenantSlug !== 'string') {
      return NextResponse.json({ error: 'Campo obligatorio faltante: tenantSlug' }, { status: 400 });
    }
    if (!body.nombre || typeof body.nombre !== 'string') {
      return NextResponse.json({ error: 'Campo obligatorio faltante: nombre' }, { status: 400 });
    }
    if (!body.blob_url || typeof body.blob_url !== 'string') {
      return NextResponse.json({ error: 'Campo obligatorio faltante: blob_url' }, { status: 400 });
    }
    if (!body.alt_text || typeof body.alt_text !== 'string') {
      return NextResponse.json({ error: 'Campo obligatorio faltante: alt_text' }, { status: 400 });
    }
    if (!body.origen || typeof body.origen !== 'string') {
      return NextResponse.json({ error: 'Campo obligatorio faltante: origen' }, { status: 400 });
    }
    if (typeof body.declaracion_ia !== 'boolean') {
      return NextResponse.json({ error: 'Campo obligatorio faltante: declaracion_ia (boolean)' }, { status: 400 });
    }

    const [tenant] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, body.tenantSlug))
      .limit(1);

    if (!tenant) {
      return NextResponse.json(
        { error: `Tenant no encontrado: ${body.tenantSlug}` },
        { status: 404 }
      );
    }

    const [created] = await db
      .insert(tenantAssets)
      .values({
        tenantId: tenant.id,
        nombre: body.nombre,
        blob_url: body.blob_url,
        blob_pathname: body.blob_pathname ?? null,
        blob_size: body.blob_size ?? null,
        mime_type: body.mime_type ?? null,
        declaracion_ia: body.declaracion_ia,
        alt_text: body.alt_text,
        origen: body.origen,
      })
      .returning();

    return NextResponse.json({ success: true, asset: created });
  } catch (error) {
    console.error('[POST /api/tenant-assets] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    );
  }
}
