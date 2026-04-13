/**
 * IP+MP Platform — Soft-delete de un tenant asset
 *
 * PATCH /api/tenant-assets/[id]/deactivate
 *
 * Intenta eliminar el blob de Vercel Blob (best-effort).
 * Luego marca el asset como activo = false.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { tenantAssets } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { del } from '@vercel/blob';

export const dynamic = 'force-dynamic';

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [existing] = await db
      .select()
      .from(tenantAssets)
      .where(eq(tenantAssets.id, id))
      .limit(1);

    if (!existing) {
      return NextResponse.json(
        { error: `Asset no encontrado: ${id}` },
        { status: 404 }
      );
    }

    // Best-effort: intentar eliminar el blob
    if (existing.blob_url) {
      try {
        await del(existing.blob_url);
      } catch (blobErr) {
        console.warn('[deactivate] Blob delete failed (best-effort):', blobErr);
      }
    }

    await db
      .update(tenantAssets)
      .set({ activo: false, updatedAt: new Date() })
      .where(eq(tenantAssets.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[PATCH /api/tenant-assets/[id]/deactivate] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    );
  }
}
