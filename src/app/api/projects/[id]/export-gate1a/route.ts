/**
 * IP+MP Platform — Exportador de Gate 1a (Chunk 31I-1)
 *
 * POST /api/projects/[id]/export-gate1a
 *
 * Genera un .docx con los supuestos dudosos/falsos del Gate 1a para
 * que el operador lleve el enunciado a un motor externo con busqueda
 * web activa (ej. Sala de Redaccion) y regrese con un expediente de
 * correccion editorial. Sin invocacion de IA: generacion estatica a
 * partir de data.gate_1a.ultimoResultado ya persistido.
 *
 * Tracking de exportaciones en data.gate_1a.exportaciones[] (atomico,
 * fire-and-forget: si falla el UPDATE, el response sigue OK porque
 * el operador ya tiene el .docx).
 *
 * Motivado por el hallazgo emergente del Chunk 31D (expediente
 * ARICA-100-VF-2026-0001): el loop Gate 1a -> motor externo ->
 * correccion de enunciado existe y agrega valor, pero la plataforma
 * no tenia un canal formal de ida hasta este chunk.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle,
} from 'docx';

export const dynamic = 'force-dynamic';

// ── Constantes de estilo (paralelas al Chunk 13B export) ──
const FONT = 'Arial';
const FOOTER_TEXT = 'Generado por IPMP Platform — Expande Digital Consultores SpA';

// Shape nuevo de evento de exportacion agregado al data.gate_1a.
// El tipo Gate1aData esta definido en ProjectDetailClient.tsx (frontend);
// en el sub-chunk 31I-2 ese tipo se extiende con:
//   exportaciones?: Gate1aExportacionEvent[]
// para que la UI lea el historial. Retrocompat garantizada via `?? []`.
interface Gate1aExportacionEvent {
  exportadoEn: string;
  supuestosIncluidos: number;
  gate1aVeredictoGlobal: 'sano' | 'requiere_correccion';
}

// Labels para traducir enums al texto visible en el .docx
const CATEGORIA_LABELS: Record<string, string> = {
  nombre_propio: 'Nombre propio',
  denominacion_oficial: 'Denominacion oficial',
  fecha: 'Fecha',
  existencia_entidad: 'Existencia de entidad',
};

const VEREDICTO_LABELS: Record<string, string> = {
  confirmado: 'Confirmado',
  dudoso: 'Dudoso',
  falso: 'Falso',
};

// ── Nombre de archivo: GATE1A_<publicId>_<YYYYMMDD-HHMMSS>.docx (UTC) ──
function buildFilenameGate1a(publicId: string, date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  const mm = pad(date.getUTCMonth() + 1);
  const dd = pad(date.getUTCDate());
  const hh = pad(date.getUTCHours());
  const mi = pad(date.getUTCMinutes());
  const ss = pad(date.getUTCSeconds());
  return `GATE1A_${publicId}_${yyyy}${mm}${dd}-${hh}${mi}${ss}.docx`;
}

// ── Helper: footer paragraph (paralelo al export existente) ──
function footerParagraph(): Paragraph {
  return new Paragraph({
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' } },
    spacing: { before: 400 },
    children: [
      new TextRun({ text: FOOTER_TEXT, font: FONT, size: 18, color: '888888' }),
    ],
  });
}

// ── Helper: buscar project por UUID ──
async function findProject(id: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (!isUuid) return null;
  const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return rows[0] ?? null;
}

// ── Helpers de parrafos ──
function labelValueParagraph(label: string, value: string, opts?: { italic?: boolean }): Paragraph {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    children: [
      new TextRun({ text: `${label}: `, font: FONT, size: 22, bold: true }),
      new TextRun({ text: value, font: FONT, size: 22, italics: !!opts?.italic }),
    ],
  });
}

function smallMutedParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 40, after: 180 },
    children: [
      new TextRun({ text, font: FONT, size: 16, color: '888888' }),
    ],
  });
}

function headingLevel1(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 120 },
    children: [new TextRun({ text, font: FONT, size: 28, bold: true })],
  });
}

function headingLevel2(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, font: FONT, size: 24, bold: true })],
  });
}

// ── Tipos locales para los supuestos leidos del jsonb ──
interface SupuestoShape {
  id: string;
  enunciado: string;
  categoria: string;
  veredicto: string;
  justificacion: string;
  correccion_sugerida: string | null;
}

// ── Generar el Document ──
function buildGate1aDocx(args: {
  publicId: string;
  project: { title: string; thesis: string | null };
  gate1aResultado: {
    supuestos: SupuestoShape[];
    veredicto_global: string;
    resumen: string;
    ejecutadoEn?: string;
  };
  supuestosPendientes: SupuestoShape[];
  exportadoEn: Date;
}): Document {
  const { publicId, project, gate1aResultado, supuestosPendientes, exportadoEn } = args;
  const children: Paragraph[] = [];

  // ── Seccion de metadatos (sin numeracion) ──
  children.push(new Paragraph({
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
    children: [new TextRun({
      text: 'EXPORTACION GATE 1A — CORRECCION DE ENUNCIADO EXTERNA',
      font: FONT, size: 28, bold: true,
    })],
  }));

  children.push(labelValueParagraph('Proyecto', publicId));
  children.push(labelValueParagraph('Exportado', exportadoEn.toISOString()));
  if (gate1aResultado.ejecutadoEn) {
    children.push(labelValueParagraph('Gate 1a ejecutado en', gate1aResultado.ejecutadoEn));
  }
  children.push(labelValueParagraph(
    'Supuestos pendientes a resolver',
    `${supuestosPendientes.length} de ${gate1aResultado.supuestos.length} totales`,
  ));

  // ── 1. Enunciado actual ──
  children.push(headingLevel1('1. Enunciado actual'));
  children.push(labelValueParagraph('Titulo', project.title));
  children.push(labelValueParagraph(
    'Tesis',
    project.thesis && project.thesis.trim().length > 0 ? project.thesis : '(no declarada)',
  ));

  // ── 2. Veredicto del Gate 1a ──
  children.push(headingLevel1('2. Veredicto del Gate 1a'));
  children.push(labelValueParagraph('Estado', gate1aResultado.veredicto_global));
  children.push(labelValueParagraph('Resumen', gate1aResultado.resumen));

  // ── 3. Supuestos detectados (N) ──
  children.push(headingLevel1(`3. Supuestos detectados (${supuestosPendientes.length})`));

  supuestosPendientes.forEach((s, idx) => {
    children.push(headingLevel2(`Supuesto ${idx + 1}`));
    children.push(labelValueParagraph('Categoria', CATEGORIA_LABELS[s.categoria] ?? s.categoria));
    children.push(labelValueParagraph('Veredicto', VEREDICTO_LABELS[s.veredicto] ?? s.veredicto));
    children.push(labelValueParagraph('Enunciado evaluado', `"${s.enunciado}"`, { italic: true }));
    children.push(labelValueParagraph('Justificacion', s.justificacion));
    children.push(labelValueParagraph(
      'Correccion sugerida',
      s.correccion_sugerida && s.correccion_sugerida.trim().length > 0
        ? s.correccion_sugerida
        : '(sin sugerencia del modelo)',
    ));
    children.push(smallMutedParagraph(`ID interno: ${s.id}`));
  });

  // ── 4. Instruccion para el motor externo ──
  children.push(headingLevel1('4. Instruccion para el motor externo'));
  children.push(new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 180 },
    children: [new TextRun({
      text:
        'Se solicita al motor externo con capacidad de busqueda web activa ' +
        'resolver los supuestos listados en la seccion 3 y devolver un expediente ' +
        'con la estructura especificada en la seccion 5. Principio operativo no ' +
        'negociable: si la informacion buscada no se encuentra con certeza ' +
        'razonable, se plantea la duda en el expediente; no se inventa ni se ' +
        'infiere por plausibilidad. La plataforma IPMP consume el expediente de ' +
        'vuelta como insumo de correccion editorial del enunciado y registra la ' +
        'cadena de trazabilidad completa.',
      font: FONT, size: 22,
    })],
  }));

  // ── 5. Formato de devolucion esperado ──
  children.push(headingLevel1('5. Formato de devolucion esperado'));
  children.push(new Paragraph({
    spacing: { after: 180 },
    children: [new TextRun({
      text:
        'El expediente de vuelta debe entregarse en formato .docx o .md y debe ' +
        'contener los siguientes bloques:',
      font: FONT, size: 22,
    })],
  }));

  const formatoItems = [
    'Para cada supuesto listado en la seccion 3, resolucion con: ID del supuesto (mantener el ID interno de la seccion 3); veredicto final: confirmado, corregido o descartado; si corregido: texto corregido + justificacion + fuentes consultadas (con fechas de publicacion); si descartado: motivo del descarte.',
    'Enunciado corregido completo: titulo y tesis reformulados en base a los hallazgos. Si el motor externo concluye que el enunciado original es factible tal cual, declararlo explicitamente.',
    'Listado de fuentes documentales consultadas, con URLs y fechas de acceso.',
    'Nota editorial libre: cualquier hallazgo emergente que el operador deba conocer antes de reanudar el pipeline (por ejemplo, la hipotesis elegida resulta no investigable por ausencia del objeto).',
  ];

  formatoItems.forEach((text, idx) => {
    children.push(new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { before: 100, after: 100 },
      children: [
        new TextRun({ text: `${idx + 1}. `, font: FONT, size: 22, bold: true }),
        new TextRun({ text, font: FONT, size: 22 }),
      ],
    }));
  });

  children.push(footerParagraph());

  return new Document({
    sections: [{
      properties: {
        page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
      },
      children,
    }],
  });
}

// ── Handler ──
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // `request` es requerido por la firma del route handler de Next.js; no
  // se lee el body (el endpoint opera solo con params + estado persistido).
  void request;

  try {
    const { id } = await params;
    const project = await findProject(id);

    if (!project) {
      return NextResponse.json(
        { error: `Proyecto no encontrado: ${id}`, code: 'PROJECT_NOT_FOUND' },
        { status: 404 }
      );
    }

    const data = (project.data ?? {}) as Record<string, unknown>;
    const gate1a = data.gate_1a as Record<string, unknown> | undefined;
    const ultimoResultado = gate1a?.ultimoResultado as Record<string, unknown> | null | undefined;

    if (!ultimoResultado) {
      return NextResponse.json(
        {
          error: 'El Gate 1a aun no fue ejecutado en este proyecto. No hay supuestos que exportar.',
          code: 'GATE1A_NOT_EXECUTED',
        },
        { status: 400 }
      );
    }

    if (ultimoResultado.veredicto_global !== 'requiere_correccion') {
      return NextResponse.json(
        {
          error: 'El Gate 1a no requiere correccion externa. Su veredicto global no es requiere_correccion.',
          code: 'GATE1A_NOT_REQUIRES_CORRECTION',
        },
        { status: 400 }
      );
    }

    const supuestosAll: SupuestoShape[] = Array.isArray(ultimoResultado.supuestos)
      ? (ultimoResultado.supuestos as SupuestoShape[])
      : [];

    const supuestosPendientes = supuestosAll.filter(
      (s) => s.veredicto === 'dudoso' || s.veredicto === 'falso',
    );

    if (supuestosPendientes.length === 0) {
      return NextResponse.json(
        {
          error: 'No hay supuestos con veredicto dudoso o falso para exportar.',
          code: 'NO_SUPUESTOS_PENDIENTES',
        },
        { status: 400 }
      );
    }

    // ── Generar el .docx ──
    const exportadoEn = new Date();
    let docBuffer: Buffer;
    try {
      const doc = buildGate1aDocx({
        publicId: project.publicId,
        project: { title: project.title, thesis: project.thesis ?? null },
        gate1aResultado: {
          supuestos: supuestosAll,
          veredicto_global: String(ultimoResultado.veredicto_global),
          resumen: String(ultimoResultado.resumen ?? ''),
          ejecutadoEn: typeof ultimoResultado.ejecutadoEn === 'string'
            ? ultimoResultado.ejecutadoEn
            : undefined,
        },
        supuestosPendientes,
        exportadoEn,
      });
      docBuffer = await Packer.toBuffer(doc);
    } catch (genErr) {
      console.error('[POST /api/projects/[id]/export-gate1a] generation failed:', genErr);
      return NextResponse.json(
        {
          error: 'Error inesperado generando el documento.',
          code: 'EXPORT_GENERATION_FAILED',
        },
        { status: 500 }
      );
    }

    // ── Tracking atomico fire-and-forget en data.gate_1a.exportaciones[] ──
    // Si el UPDATE falla, logear pero NO fallar el response: el operador
    // ya tiene el .docx en mano. Patron paralelo al trackUsage() del Chunk 6.
    try {
      const evento: Gate1aExportacionEvent = {
        exportadoEn: exportadoEn.toISOString(),
        supuestosIncluidos: supuestosPendientes.length,
        gate1aVeredictoGlobal: 'requiere_correccion',
      };

      const exportacionesPrevias = Array.isArray(gate1a?.exportaciones)
        ? (gate1a.exportaciones as Gate1aExportacionEvent[])
        : [];

      const nuevaData = {
        ...data,
        gate_1a: {
          ...(gate1a ?? {}),
          exportaciones: [...exportacionesPrevias, evento],
        },
      };

      await db
        .update(projects)
        .set({ data: nuevaData, updatedAt: new Date() })
        .where(eq(projects.id, project.id));
    } catch (trackErr) {
      console.warn(
        '[POST /api/projects/[id]/export-gate1a] tracking failed (non-fatal):',
        trackErr,
      );
    }

    const filename = buildFilenameGate1a(project.publicId, exportadoEn);

    return new NextResponse(docBuffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('[POST /api/projects/[id]/export-gate1a] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno';
    return NextResponse.json(
      { error: message, code: 'EXPORT_GENERATION_FAILED' },
      { status: 500 }
    );
  }
}
