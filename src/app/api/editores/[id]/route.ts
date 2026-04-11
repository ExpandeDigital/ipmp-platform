/**
 * IP+MP Platform — CRUD Editor por id (Chunk 10)
 *
 * GET   /api/editores/[id] → detalle
 * PATCH /api/editores/[id] → update parcial, soft-delete via { activo: false },
 *                            marcar verificado via { marcarVerificado: true }
 *
 * No hay DELETE real. Baja logica via activo = false.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { editoresAgenda } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

interface PatchBody {
  nombre?: string;
  apellido?: string;
  medio?: string;
  seccion?: string | null;
  tier?: number;
  tenantsRelevantes?: string[];
  tipoPiezaRecomendado?: string[];
  email?: string | null;
  telefono?: string | null;
  notas?: string | null;
  activo?: boolean;
  marcarVerificado?: boolean;
}

async function findEditor(id: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (!isUuid) return null;
  const rows = await db
    .select()
    .from(editoresAgenda)
    .where(eq(editoresAgenda.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const editor = await findEditor(id);
    if (!editor) {
      return NextResponse.json(
        { error: `Editor no encontrado: ${id}` },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, editor });
  } catch (error) {
    console.error('[GET /api/editores/[id]] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const editor = await findEditor(id);
    if (!editor) {
      return NextResponse.json(
        { error: `Editor no encontrado: ${id}` },
        { status: 404 }
      );
    }

    const body: PatchBody = await request.json();
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (typeof body.nombre === 'string') {
      if (body.nombre.trim().length === 0) {
        return NextResponse.json(
          { error: 'nombre no puede ser vacio', code: 'VALIDATION_FAILED' },
          { status: 400 }
        );
      }
      updates.nombre = body.nombre.trim();
    }

    if (typeof body.apellido === 'string') {
      if (body.apellido.trim().length === 0) {
        return NextResponse.json(
          { error: 'apellido no puede ser vacio', code: 'VALIDATION_FAILED' },
          { status: 400 }
        );
      }
      updates.apellido = body.apellido.trim();
    }

    if (typeof body.medio === 'string') {
      if (body.medio.trim().length === 0) {
        return NextResponse.json(
          { error: 'medio no puede ser vacio', code: 'VALIDATION_FAILED' },
          { status: 400 }
        );
      }
      updates.medio = body.medio.trim();
    }

    if (body.seccion !== undefined) {
      updates.seccion =
        typeof body.seccion === 'string' && body.seccion.trim().length > 0
          ? body.seccion.trim()
          : null;
    }

    if (typeof body.tier === 'number') {
      if (!Number.isInteger(body.tier) || body.tier <= 0) {
        return NextResponse.json(
          { error: 'tier debe ser entero positivo', code: 'VALIDATION_FAILED' },
          { status: 400 }
        );
      }
      updates.tier = body.tier;
    }

    if (Array.isArray(body.tenantsRelevantes)) {
      updates.tenantsRelevantes = body.tenantsRelevantes.filter(
        (s): s is string => typeof s === 'string'
      );
    }

    if (Array.isArray(body.tipoPiezaRecomendado)) {
      updates.tipoPiezaRecomendado = body.tipoPiezaRecomendado.filter(
        (s): s is string => typeof s === 'string'
      );
    }

    if (body.email !== undefined) {
      updates.email =
        typeof body.email === 'string' && body.email.trim().length > 0
          ? body.email.trim()
          : null;
    }

    if (body.telefono !== undefined) {
      updates.telefono =
        typeof body.telefono === 'string' && body.telefono.trim().length > 0
          ? body.telefono.trim()
          : null;
    }

    if (body.notas !== undefined) {
      updates.notas =
        typeof body.notas === 'string' && body.notas.trim().length > 0
          ? body.notas.trim()
          : null;
    }

    if (typeof body.activo === 'boolean') {
      updates.activo = body.activo;
    }

    if (body.marcarVerificado === true) {
      updates.ultimaVerificacion = new Date();
    }

    const [updated] = await db
      .update(editoresAgenda)
      .set(updates)
      .where(eq(editoresAgenda.id, editor.id))
      .returning();

    return NextResponse.json({ success: true, editor: updated });
  } catch (error) {
    console.error('[PATCH /api/editores/[id]] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
