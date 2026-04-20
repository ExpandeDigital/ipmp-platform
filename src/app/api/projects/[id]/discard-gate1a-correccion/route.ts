/**
 * IP+MP Platform — Descartar correccion del Gate 1a (Chunk 31J-3)
 *
 * POST /api/projects/[id]/discard-gate1a-correccion
 * Body: { correccionId: string }
 *
 * Marca un evento de correccion como descartado sin modificar
 * title/thesis del proyecto. A diferencia del endpoint apply del
 * Chunk 31J-2, aca NO se tocan title/thesis y NO se dispara el
 * auto-reset del Gate 1a: la unica mutacion es marcar el evento
 * como descartado con timestamp, preservando el historial para
 * trazabilidad editorial.
 *
 * Descartar y aplicar son mutuamente excluyentes por diseno: una
 * correccion aplicada no puede descartarse y viceversa. El evento
 * queda permanentemente registrado en data.gate_1a.correcciones[]
 * en ambos casos.
 *
 * Restringido a fases draft/validacion/hito_1 (donde el enunciado
 * sigue editable). En fases posteriores rechaza con PHASE_LOCKED.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { Gate1aCorreccionSupuesto } from '@/lib/pipeline/parse-gate1a-correccion';

export const dynamic = 'force-dynamic';

/**
 * Evento persistido en data.gate_1a.correcciones[]. Debe mantenerse
 * en sync con la copia en src/app/projects/[id]/ProjectDetailClient.tsx
 * y los endpoints hermanos (import, apply).
 */
interface Gate1aCorreccionEvent {
  id: string;
  importadoEn: string;
  formatoOrigen: 'md' | 'docx';
  nombreArchivo: string;
  enunciadoCorregido: {
    titulo: string | null;
    tesis: string | null;
  };
  supuestos: Gate1aCorreccionSupuesto[];
  fuentesGlobales: string[];
  notaEditorial: string | null;
  aplicado: boolean;
  aplicadoEn: string | null;
  // Chunk 31J: flags de estado de aplicación o descarte
  descartado?: boolean;
  descartadoEn?: string | null;
  warnings: string[];
}

/**
 * Simetrico a PHASES_ACEPTA_APPLY y PHASES_ACEPTA_IMPORT: solo
 * aceptamos discard en fases donde el enunciado sigue editable.
 * En fases posteriores el enunciado esta congelado por
 * ENUNCIADO_INMUTABLE y descartar eventos fuera de ese marco no
 * tiene sentido operativo.
 */
const PHASES_ACEPTA_DISCARD = new Set(['draft', 'validacion', 'hito_1']);

async function findProject(id: string) {
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (!isUuid) return null;
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // ── 1. Parse body ──
    let body: { correccionId?: unknown };
    try {
      body = (await request.json()) as { correccionId?: unknown };
    } catch {
      return NextResponse.json(
        { error: 'Body JSON invalido', code: 'BAD_REQUEST' },
        { status: 400 },
      );
    }

    const correccionId = body.correccionId;
    if (typeof correccionId !== 'string' || correccionId.length === 0) {
      return NextResponse.json(
        { error: 'correccionId requerido', code: 'BAD_REQUEST' },
        { status: 400 },
      );
    }

    // ── 2. Extraer id del proyecto ──
    const { id } = await params;

    // ── 3. Leer proyecto ──
    const project = await findProject(id);
    if (!project) {
      return NextResponse.json(
        { error: 'Proyecto no encontrado', code: 'PROJECT_NOT_FOUND' },
        { status: 404 },
      );
    }

    // ── 4. Validar fase ──
    if (!PHASES_ACEPTA_DISCARD.has(project.status)) {
      return NextResponse.json(
        {
          error: `El enunciado esta congelado en fase ${project.status}. No se pueden descartar correcciones externas fuera de draft/validacion/hito_1.`,
          code: 'PHASE_LOCKED',
        },
        { status: 400 },
      );
    }

    // ── 5. Extraer data y gate_1a ──
    const data = (project.data as Record<string, unknown> | null) ?? {};
    const gate1a = data.gate_1a as Record<string, unknown> | undefined;
    const correcciones = Array.isArray(gate1a?.correcciones)
      ? (gate1a.correcciones as Gate1aCorreccionEvent[])
      : [];

    // ── 6. Ubicar el evento ──
    const evento = correcciones.find((e) => e.id === correccionId);
    if (!evento) {
      return NextResponse.json(
        {
          error: 'Correccion no encontrada en el proyecto',
          code: 'CORRECCION_NOT_FOUND',
        },
        { status: 404 },
      );
    }

    // ── 7. Validar estado del evento ──
    // Aplicar y descartar son mutuamente excluyentes.
    if (evento.aplicado === true) {
      return NextResponse.json(
        {
          error: 'Esta correccion ya fue aplicada y no puede ser descartada',
          code: 'CORRECCION_YA_APLICADA',
        },
        { status: 400 },
      );
    }
    if (evento.descartado === true) {
      return NextResponse.json(
        {
          error: 'Esta correccion ya fue descartada',
          code: 'CORRECCION_YA_DESCARTADA',
        },
        { status: 400 },
      );
    }

    // ── 8. Construir el UPDATE ──
    // A diferencia del endpoint apply: NO tocamos title ni thesis, NO
    // disparamos auto-reset del Gate 1a. El proyecto no cambia
    // funcionalmente; solo se registra el descarte del evento.

    const ahora = new Date().toISOString();
    const correccionesActualizadas: Gate1aCorreccionEvent[] = correcciones.map(
      (e) =>
        e.id === correccionId
          ? { ...e, descartado: true, descartadoEn: ahora }
          : e,
    );

    // 8.a — construir el nuevo gate_1a preservando el resto de keys
    const gate1aFinal: Record<string, unknown> = {
      ...(gate1a ?? {}),
      correcciones: correccionesActualizadas,
    };

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
      data: { ...data, gate_1a: gate1aFinal },
    };

    // 8.b — UPDATE unico
    await db.update(projects).set(updates).where(eq(projects.id, project.id));

    // ── 9. Retornar success ──
    const eventoActualizado = correccionesActualizadas.find(
      (e) => e.id === correccionId,
    );
    return NextResponse.json(
      { ok: true, correccion: eventoActualizado },
      { status: 200 },
    );
  } catch (err) {
    console.error('[discard-gate1a-correccion] failed:', err);
    return NextResponse.json(
      { error: 'Error interno descartando la correccion', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
