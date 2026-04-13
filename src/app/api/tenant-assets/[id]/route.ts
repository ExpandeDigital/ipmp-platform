/**
 * IP+MP Platform — PATCH metadata de un tenant asset
 *
 * PATCH /api/tenant-assets/[id]
 *
 * Body JSON parcial: { nombre?, alt_text?, origen?, declaracion_ia? }
 * No permite cambiar blob_url por esta via.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { tenantAssets } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [existing] = await db
      .select()
      .from(tenantAssets)
      .where(and(eq(tenantAssets.id, id), eq(tenantAssets.activo, true)))
      .limit(1);

    if (!existing) {
      return NextResponse.json(
        { error: `Asset no encontrado o inactivo: ${id}` },
        { status: 404 }
      );
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (typeof body.nombre === 'string' && body.nombre.trim()) {
      updates.nombre = body.nombre.trim();
    }
    if (typeof body.alt_text === 'string' && body.alt_text.trim()) {
      updates.alt_text = body.alt_text.trim();
    }
    if (typeof body.origen === 'string' && body.origen.trim()) {
      updates.origen = body.origen.trim();
    }
    if (typeof body.declaracion_ia === 'boolean') {
      updates.declaracion_ia = body.declaracion_ia;
    }

    const [updated] = await db
      .update(tenantAssets)
      .set(updates)
      .where(eq(tenantAssets.id, id))
      .returning();

    return NextResponse.json({ success: true, asset: updated });
  } catch (error) {
    console.error('[PATCH /api/tenant-assets/[id]] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    );
  }
}
