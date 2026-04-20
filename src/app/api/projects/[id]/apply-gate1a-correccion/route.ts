/**
 * IP+MP Platform — Aplicar correccion del Gate 1a (Chunk 31J-2)
 *
 * POST /api/projects/[id]/apply-gate1a-correccion
 * Body: { correccionId: string }
 *
 * Cierra el loop abierto por el importador del Chunk 31I-3. Toma un
 * evento persistido en data.gate_1a.correcciones[] y lo aplica al
 * enunciado del proyecto: escribe title/thesis con los valores
 * propuestos (si los incluye) y marca el evento como aplicado.
 *
 * Si el enunciado cambia, se replica inline el auto-reset atomico del
 * Chunk 31C-2: el Gate 1a vuelve a 'pendiente', ultimoResultado se
 * archiva en historial[]. A diferencia del 31C-2, aca se preservan
 * explicitamente exportaciones[] y correcciones[] para no perder el
 * expediente documental de la interaccion con motores externos.
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
 * y src/app/api/projects/[id]/import-gate1a-correccion/route.ts.
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
 * Simetrico a PHASES_ACEPTA_IMPORT del endpoint import: solo aceptamos
 * apply en fases donde el enunciado sigue editable. En fases
 * posteriores el enunciado esta congelado por ENUNCIADO_INMUTABLE.
 */
const PHASES_ACEPTA_APPLY = new Set(['draft', 'validacion', 'hito_1']);

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
    if (!PHASES_ACEPTA_APPLY.has(project.status)) {
      return NextResponse.json(
        {
          error: `El enunciado esta congelado en fase ${project.status}. No se pueden aplicar correcciones externas fuera de draft/validacion/hito_1.`,
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
    if (evento.aplicado === true) {
      return NextResponse.json(
        { error: 'Esta correccion ya fue aplicada', code: 'CORRECCION_YA_APLICADA' },
        { status: 400 },
      );
    }
    if (evento.descartado === true) {
      return NextResponse.json(
        { error: 'Esta correccion fue descartada', code: 'CORRECCION_DESCARTADA' },
        { status: 400 },
      );
    }

    // ── 8. Construir el UPDATE ──

    // 8.a — determinar cambio de enunciado
    const nuevoTitulo = evento.enunciadoCorregido.titulo;
    const nuevaTesis = evento.enunciadoCorregido.tesis;
    const enunciadoCambio = nuevoTitulo !== null || nuevaTesis !== null;

    // 8.b — updates base
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (nuevoTitulo !== null) updates.title = nuevoTitulo;
    if (nuevaTesis !== null) updates.thesis = nuevaTesis;

    // 8.c — actualizar el evento dentro de correcciones
    const ahora = new Date().toISOString();
    const correccionesActualizadas: Gate1aCorreccionEvent[] = correcciones.map(
      (e) =>
        e.id === correccionId
          ? { ...e, aplicado: true, aplicadoEn: ahora }
          : e,
    );

    // 8.d — construir el nuevo gate_1a
    let gate1aFinal: Record<string, unknown>;

    if (enunciadoCambio) {
      // Replicar el auto-reset atomico del 31C-2 inline.
      // A diferencia del 31C-2, preservamos exportaciones y correcciones.
      const historialPrevio = Array.isArray(gate1a?.historial)
        ? (gate1a.historial as Array<Record<string, unknown>>)
        : [];
      const ultimoResultado = gate1a?.ultimoResultado as
        | Record<string, unknown>
        | null
        | undefined;
      const nuevoHistorial = ultimoResultado
        ? [...historialPrevio, ultimoResultado]
        : historialPrevio;

      gate1aFinal = {
        ...(gate1a ?? {}),
        estado: 'pendiente',
        ultimoResultado: null,
        aprobadoEn: null,
        historial: nuevoHistorial,
        correcciones: correccionesActualizadas,
      };
    } else {
      gate1aFinal = {
        ...(gate1a ?? {}),
        correcciones: correccionesActualizadas,
      };
    }

    updates.data = { ...data, gate_1a: gate1aFinal };

    // 8.e — UPDATE unico
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
    console.error('[apply-gate1a-correccion] failed:', err);
    return NextResponse.json(
      { error: 'Error interno aplicando la correccion', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
