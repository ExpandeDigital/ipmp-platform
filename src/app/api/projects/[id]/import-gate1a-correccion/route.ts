/**
 * IP+MP Platform — Importador de correcciones del Gate 1a (Chunk 31I-3)
 *
 * POST /api/projects/[id]/import-gate1a-correccion
 *
 * Cierra el loop abierto por el exportador del Chunk 31I-1. Acepta un
 * .md o .docx con el expediente de correccion producido por el motor
 * externo, lo parsea, valida contra los supuestos del ultimo export,
 * y persiste como nuevo evento en data.gate_1a.correcciones[].
 *
 * Alcance del 31I-3: solo persistencia del buffer de correccion. NO
 * sobreescribe projects.title / projects.thesis — eso queda para un
 * Chunk 31J futuro (boton "Aplicar correccion" con PATCH explicito
 * que se apoya en el auto-reset atomico del 31C-2).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  parseGate1aCorreccion,
  type Gate1aCorreccionSupuesto,
} from '@/lib/pipeline/parse-gate1a-correccion';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MD_MIME = 'text/markdown';

// Evento persistido en data.gate_1a.correcciones[].
// Debe mantenerse en sync con Gate1aCorreccionEvent declarado en
// src/app/projects/[id]/ProjectDetailClient.tsx.
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

// Fases donde el enunciado sigue siendo editable y por ende aceptar
// correcciones es operativamente util. Derivadas de la decision del
// arquitecto para el 31I-3.
const PHASES_ACEPTA_IMPORT = new Set(['draft', 'validacion', 'hito_1']);

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

function resolveMimeType(
  reportedMime: string,
  filename: string,
): 'md' | 'docx' | null {
  const lowerMime = reportedMime.toLowerCase();
  const lowerName = filename.toLowerCase();

  if (lowerMime === DOCX_MIME) return 'docx';
  if (lowerMime === MD_MIME) return 'md';

  // Fallback: algunos browsers reportan .md como text/plain o vacio.
  if (lowerName.endsWith('.md') && (lowerMime === 'text/plain' || lowerMime === '')) {
    return 'md';
  }
  if (lowerName.endsWith('.docx') && lowerMime === '') {
    return 'docx';
  }

  return null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await findProject(id);

    if (!project) {
      return NextResponse.json(
        { error: `Proyecto no encontrado: ${id}`, code: 'PROJECT_NOT_FOUND' },
        { status: 404 },
      );
    }

    const data = (project.data ?? {}) as Record<string, unknown>;
    const gate1a = data.gate_1a as Record<string, unknown> | undefined;
    const exportaciones = Array.isArray(gate1a?.exportaciones)
      ? (gate1a.exportaciones as unknown[])
      : [];

    if (exportaciones.length === 0) {
      return NextResponse.json(
        {
          error:
            'No hay exportaciones previas del Gate 1a en este proyecto. Exporta primero los supuestos.',
          code: 'NO_EXPORT_PRIOR',
        },
        { status: 400 },
      );
    }

    if (!PHASES_ACEPTA_IMPORT.has(project.status)) {
      return NextResponse.json(
        {
          error: `El enunciado esta congelado en fase ${project.status}. Retrocede el pipeline para importar correcciones.`,
          code: 'PHASE_LOCKED',
        },
        { status: 400 },
      );
    }

    // Extraer supuestos ids del ultimoResultado filtrados a dudoso/falso,
    // mismo filtro que aplica el exporter del 31I-1.
    const ultimoResultado = gate1a?.ultimoResultado as
      | Record<string, unknown>
      | null
      | undefined;
    const supuestosAll = Array.isArray(ultimoResultado?.supuestos)
      ? (ultimoResultado.supuestos as Array<{ id: string; veredicto: string }>)
      : [];
    const supuestosIdsDelExport = supuestosAll
      .filter((s) => s.veredicto === 'dudoso' || s.veredicto === 'falso')
      .map((s) => s.id);

    // ── Parseo del multipart ──
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (err) {
      console.warn('[import-gate1a-correccion] formData parse failed:', err);
      return NextResponse.json(
        { error: 'No se pudo leer el cuerpo multipart.', code: 'INVALID_BODY' },
        { status: 400 },
      );
    }

    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json(
        { error: 'Falta el campo file en el multipart.', code: 'NO_FILE' },
        { status: 400 },
      );
    }

    const fileName = (file as File).name ?? '';
    const reportedMime = (file as File).type ?? '';
    const fileSize = (file as File).size ?? 0;

    if (fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `El archivo supera el limite de 2MB (recibido: ${fileSize} bytes).`,
          code: 'FILE_TOO_LARGE',
        },
        { status: 400 },
      );
    }

    const formatoOrigen = resolveMimeType(reportedMime, fileName);
    if (!formatoOrigen) {
      return NextResponse.json(
        {
          error: `Formato no soportado. Usa .md o .docx. Reportado: "${reportedMime}".`,
          code: 'INVALID_FORMAT',
        },
        { status: 400 },
      );
    }

    const arrayBuf = await (file as File).arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const mimeTypeParser =
      formatoOrigen === 'md' ? MD_MIME : DOCX_MIME;

    // ── Invocar parser puro ──
    let parsed;
    try {
      parsed = await parseGate1aCorreccion({
        buffer,
        mimeType: mimeTypeParser as
          | 'text/markdown'
          | typeof DOCX_MIME,
        supuestosIdsDelExport,
      });
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      if (msg === 'EMPTY_CORRECCION') {
        return NextResponse.json(
          {
            error:
              'El archivo no contiene enunciado corregido ni supuestos resueltos.',
            code: 'EMPTY_CORRECCION',
          },
          { status: 400 },
        );
      }
      if (msg.startsWith('PARSE_FAILED')) {
        return NextResponse.json(
          {
            error: msg,
            code: 'PARSE_FAILED',
          },
          { status: 400 },
        );
      }
      console.error('[import-gate1a-correccion] parser threw:', parseErr);
      return NextResponse.json(
        {
          error: 'Error inesperado al parsear el archivo.',
          code: 'PARSE_FAILED',
        },
        { status: 400 },
      );
    }

    // ── Construir evento ──
    const evento: Gate1aCorreccionEvent = {
      id: randomUUID(),
      importadoEn: new Date().toISOString(),
      formatoOrigen,
      nombreArchivo: fileName,
      enunciadoCorregido: parsed.enunciadoCorregido,
      supuestos: parsed.supuestos,
      fuentesGlobales: parsed.fuentesGlobales,
      notaEditorial: parsed.notaEditorial,
      aplicado: false,
      aplicadoEn: null,
      warnings: parsed.warnings,
    };

    // ── Persistencia (patron object-merge del 31I-1, no jsonb_set) ──
    // Fire-and-forget: si el UPDATE falla, el parseo ya se hizo pero no
    // persistio; devolvemos error porque el evento se perderia.
    try {
      const correccionesPrevias = Array.isArray(gate1a?.correcciones)
        ? (gate1a.correcciones as unknown[])
        : [];

      const nuevaData = {
        ...data,
        gate_1a: {
          ...(gate1a ?? {}),
          correcciones: [...correccionesPrevias, evento],
        },
      };

      await db
        .update(projects)
        .set({ data: nuevaData, updatedAt: new Date() })
        .where(eq(projects.id, project.id));
    } catch (persistErr) {
      console.error(
        '[import-gate1a-correccion] persist failed:',
        persistErr,
      );
      return NextResponse.json(
        {
          error: 'El parseo funciono pero no se pudo persistir. Reintenta.',
          code: 'PERSIST_FAILED',
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        correccion: evento,
        warnings: parsed.warnings,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error(
      '[POST /api/projects/[id]/import-gate1a-correccion] Error:',
      error,
    );
    const message = error instanceof Error ? error.message : 'Error interno';
    return NextResponse.json(
      { error: message, code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
