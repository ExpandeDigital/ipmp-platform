/**
 * IP+MP Platform — CRUD de Editores (Chunk 10)
 *
 * GET  /api/editores        → listar todos los editores ordenados por tier asc, apellido asc
 * POST /api/editores        → crear editor nuevo
 *
 * Sin paginacion ni filtros (volumen esperado bajo, <100 entradas).
 * Sin FK a tenants: tenants_relevantes se guarda como array de slugs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { editoresAgenda } from '@/db/schema';
import { asc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

interface CreateEditorBody {
  nombre: string;
  apellido: string;
  medio: string;
  seccion?: string;
  tier: number;
  tenantsRelevantes?: string[];
  tipoPiezaRecomendado?: string[];
  email?: string;
  telefono?: string;
  notas?: string;
}

function validateCreateBody(body: unknown): body is CreateEditorBody {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.nombre === 'string' && b.nombre.trim().length > 0 &&
    typeof b.apellido === 'string' && b.apellido.trim().length > 0 &&
    typeof b.medio === 'string' && b.medio.trim().length > 0 &&
    typeof b.tier === 'number' && Number.isInteger(b.tier) && b.tier > 0
  );
}

export async function GET() {
  try {
    const rows = await db
      .select()
      .from(editoresAgenda)
      .orderBy(asc(editoresAgenda.tier), asc(editoresAgenda.apellido));

    return NextResponse.json({ success: true, editores: rows });
  } catch (error) {
    console.error('[GET /api/editores] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!validateCreateBody(body)) {
      return NextResponse.json(
        {
          error: 'Campos requeridos: nombre, apellido, medio, tier (entero positivo)',
          code: 'VALIDATION_FAILED',
        },
        { status: 400 }
      );
    }

    const {
      nombre,
      apellido,
      medio,
      seccion,
      tier,
      tenantsRelevantes,
      tipoPiezaRecomendado,
      email,
      telefono,
      notas,
    } = body;

    const tenantsArr = Array.isArray(tenantsRelevantes)
      ? tenantsRelevantes.filter((s): s is string => typeof s === 'string')
      : [];
    const tiposArr = Array.isArray(tipoPiezaRecomendado)
      ? tipoPiezaRecomendado.filter((s): s is string => typeof s === 'string')
      : [];

    const [created] = await db
      .insert(editoresAgenda)
      .values({
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        medio: medio.trim(),
        seccion: seccion && seccion.trim().length > 0 ? seccion.trim() : null,
        tier,
        tenantsRelevantes: tenantsArr,
        tipoPiezaRecomendado: tiposArr,
        email: email && email.trim().length > 0 ? email.trim() : null,
        telefono: telefono && telefono.trim().length > 0 ? telefono.trim() : null,
        notas: notas && notas.trim().length > 0 ? notas.trim() : null,
      })
      .returning();

    return NextResponse.json({ success: true, editor: created }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/editores] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
