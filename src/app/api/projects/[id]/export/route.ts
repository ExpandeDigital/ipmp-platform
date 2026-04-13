/**
 * IP+MP Platform — Exportador de Project (Chunk 13B + 20A-fix)
 *
 * POST /api/projects/[id]/export
 *
 * Genera un ZIP en memoria con el contenido del project:
 *   [publicId]/borrador.docx     — borrador en Word
 *   [publicId]/fuentes.docx      — fuentes del ODF en tabla Word
 *   [publicId]/hipotesis.docx    — hipotesis en Word
 *   [publicId]/proyecto.json     — data completa del project
 *   [publicId]/imagen-visual.*   — imagen visual (si existe)
 *
 * Devuelve application/zip con Content-Disposition attachment.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { projects, tenants, templates } from '@/db/schema';
import { eq } from 'drizzle-orm';
import JSZip from 'jszip';
import { get as blobGet } from '@vercel/blob';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, Table, TableRow, TableCell,
  WidthType, BorderStyle, ShadingType, LevelFormat,
} from 'docx';

export const dynamic = 'force-dynamic';

// ── Constantes de estilo ──
const FONT = 'Arial';
const FOOTER_TEXT = 'Generado por IPMP Platform — Expande Digital Consultores SpA';

// ── Helper: buscar project por UUID ──
async function findProjectForExport(id: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (!isUuid) return null;

  const rows = await db
    .select({
      id: projects.id,
      publicId: projects.publicId,
      title: projects.title,
      status: projects.status,
      thesis: projects.thesis,
      classification: projects.classification,
      brandVariant: projects.brandVariant,
      data: projects.data,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      tenantSlug: tenants.slug,
      tenantName: tenants.name,
      templateSlug: templates.slug,
      templateName: templates.name,
      templateFamily: templates.family,
    })
    .from(projects)
    .leftJoin(tenants, eq(projects.tenantId, tenants.id))
    .leftJoin(templates, eq(projects.templateId, templates.id))
    .where(eq(projects.id, id))
    .limit(1);

  return rows[0] ?? null;
}

// ── Helper: nombre de archivo con genero y titulo ──
function buildNombreArchivo(
  templateName: string | null,
  titulo: string | null,
  sufijo: string,
  extension: string
): string {
  const genero = (templateName ?? 'Documento')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim();

  if (!titulo) {
    return `${genero} — ${sufijo}.${extension}`;
  }

  const tituloLimpio = titulo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim();

  const tituloCorto = tituloLimpio.length > 50
    ? tituloLimpio.substring(0, 50).replace(/\s+\S*$/, '').trim()
    : tituloLimpio;

  return `${genero} — ${tituloCorto}.${extension}`;
}

// ── Helper: footer paragraph ──
function footerParagraph(): Paragraph {
  return new Paragraph({
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' } },
    spacing: { before: 400 },
    children: [
      new TextRun({ text: FOOTER_TEXT, font: FONT, size: 18, color: '888888' }),
    ],
  });
}

// ── Helper: header meta lines for borrador ──
function headerMeta(publicId: string, tenantName: string | null, templateName: string | null, fecha: string): Paragraph[] {
  const lines: string[] = [publicId];
  if (templateName && tenantName) lines.push(`${templateName} — ${tenantName}`);
  if (fecha) lines.push(`Generado: ${new Date(fecha).toLocaleString('es-CL')}`);
  return lines.map((text) => new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [new TextRun({ text, font: FONT, size: 18, color: '888888' })],
  }));
}

// ── Helper: borrador a Document ──
function buildBorradorDocx(
  borrador: Record<string, unknown>,
  publicId: string,
  tenantName: string | null,
  templateName: string | null,
): Document {
  // Chunk 19D: lectura dual
  const b = (borrador.contenido ?? borrador.borrador) as Record<string, unknown> | undefined;
  const metadata = (borrador.metadata ?? {}) as Record<string, unknown>;
  const generadoEn = typeof borrador.generadoEn === 'string' ? borrador.generadoEn : '';

  const children: Paragraph[] = [];

  // Header meta
  children.push(...headerMeta(publicId, tenantName, templateName, generadoEn));

  if (!b) {
    children.push(new Paragraph({
      children: [new TextRun({ text: '(borrador sin estructura)', font: FONT, size: 24 })],
    }));
  } else {
    // Titulo
    if (b.titulo) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 240 },
        children: [new TextRun({ text: String(b.titulo), font: FONT, size: 32, bold: true })],
      }));
    }

    // Bajada
    if (b.bajada) {
      children.push(new Paragraph({
        border: { left: { style: BorderStyle.SINGLE, size: 4, color: '888888' } },
        indent: { left: 200 },
        spacing: { before: 120, after: 120 },
        children: [new TextRun({ text: String(b.bajada), font: FONT, size: 24, italics: true })],
      }));
    }

    // Lead
    if (b.lead) {
      children.push(new Paragraph({
        spacing: { before: 240 },
        shading: { type: ShadingType.CLEAR, fill: 'F5F5F5' },
        children: [new TextRun({ text: String(b.lead), font: FONT, size: 24 })],
      }));
    }

    // Cuerpo
    const cuerpo = Array.isArray(b.cuerpo) ? b.cuerpo : [];
    for (const sec of cuerpo) {
      const s = sec as Record<string, unknown>;
      if (s.subtitulo) {
        children.push(new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240 },
          children: [new TextRun({ text: String(s.subtitulo), font: FONT, size: 26, bold: true })],
        }));
      }
      const parrafos = Array.isArray(s.parrafos) ? s.parrafos : [];
      for (const p of parrafos) {
        children.push(new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 120 },
          children: [new TextRun({ text: String(p), font: FONT, size: 24 })],
        }));
      }
    }

    // Cierre
    if (b.cierre) {
      children.push(new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' } },
        spacing: { before: 240 },
        children: [new TextRun({ text: String(b.cierre), font: FONT, size: 24, italics: true })],
      }));
    }
  }

  // Fuentes citadas
  const fuentes = Array.isArray(metadata.fuentes_citadas) ? metadata.fuentes_citadas : [];
  if (fuentes.length > 0) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 360 },
      children: [new TextRun({ text: 'Fuentes citadas', font: FONT, size: 26, bold: true })],
    }));
    for (const f of fuentes) {
      children.push(new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: `• ${String(f)}`, font: FONT, size: 24 })],
      }));
    }
  }

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

// ── Helper: fuentes a Document (tabla) ──
function buildFuentesDocx(
  fuentes: unknown[],
  publicId: string,
): Document {
  const COL_WIDTHS = [2800, 1500, 1200, 1200, 2326]; // total = 9026 DXA
  const HEADERS = ['Nombre', 'Rol', 'Estado', 'Confianza', 'URL'];
  const HEADER_FILL = '1F3864';
  const ROW_EVEN = 'EBF3FB';
  const ROW_ODD = 'FFFFFF';
  const BORDER = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
  const CELL_MARGINS = { top: 80, bottom: 80, left: 120, right: 120 };
  const borders = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

  function makeCell(text: string, width: number, isHeader: boolean, rowIndex: number): TableCell {
    return new TableCell({
      width: { size: width, type: WidthType.DXA },
      borders,
      shading: {
        type: ShadingType.CLEAR,
        fill: isHeader ? HEADER_FILL : (rowIndex % 2 === 0 ? ROW_EVEN : ROW_ODD),
      },
      margins: CELL_MARGINS,
      children: [new Paragraph({
        children: [new TextRun({
          text,
          font: FONT,
          size: 20,
          bold: isHeader,
          color: isHeader ? 'FFFFFF' : '000000',
        })],
      })],
    });
  }

  // Header row
  const headerRow = new TableRow({
    children: HEADERS.map((h, i) => makeCell(h, COL_WIDTHS[i], true, -1)),
  });

  // Data rows
  let hasArchivo = false;
  const dataRows = fuentes.map((f, rowIdx) => {
    const src = f as Record<string, unknown>;
    if (src.archivo_url) hasArchivo = true;
    const nombre = String(src.nombre_titulo ?? '');
    const rol = String(src.rol_origen ?? '');
    const estado = String(src.estado ?? '');
    const confianza = String(src.confianza ?? '');
    const url = String(src.url ?? '');
    return new TableRow({
      children: [
        makeCell(nombre, COL_WIDTHS[0], false, rowIdx),
        makeCell(rol, COL_WIDTHS[1], false, rowIdx),
        makeCell(estado, COL_WIDTHS[2], false, rowIdx),
        makeCell(confianza, COL_WIDTHS[3], false, rowIdx),
        makeCell(url, COL_WIDTHS[4], false, rowIdx),
      ],
    });
  });

  const children: Paragraph[] = [];

  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: 'Fuentes del Expediente Forense', font: FONT, size: 32, bold: true })],
  }));

  children.push(new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({
      text: `${publicId} — ${new Date().toLocaleDateString('es-CL')}`,
      font: FONT, size: 18, color: '888888',
    })],
  }));

  const tableChildren: (Paragraph | Table)[] = [...children];

  tableChildren.push(new Table({
    width: { size: 9026, type: WidthType.DXA },
    rows: [headerRow, ...dataRows],
  }));

  if (hasArchivo) {
    tableChildren.push(new Paragraph({
      spacing: { before: 120 },
      children: [new TextRun({ text: '(*) Fuente con archivo adjunto', font: FONT, size: 18, color: '888888' })],
    }));
  }

  tableChildren.push(footerParagraph());

  return new Document({
    sections: [{
      properties: {
        page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
      },
      children: tableChildren,
    }],
  });
}

// ── Helper: hipotesis a Document ──
function buildHipotesisDocx(
  hipotesisData: Record<string, unknown>,
  publicId: string,
): Document {
  const children: Paragraph[] = [];

  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: 'Hipotesis de Investigacion', font: FONT, size: 32, bold: true })],
  }));

  children.push(new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({
      text: `${publicId} — ${new Date().toLocaleDateString('es-CL')}`,
      font: FONT, size: 18, color: '888888',
    })],
  }));

  // Hipotesis elegida (si existe)
  const elegida = hipotesisData.hipotesis_elegida as Record<string, unknown> | undefined;
  const hipotesisList = (() => {
    const raw = hipotesisData as Record<string, unknown>;
    const list = (raw.hipotesis ?? []) as unknown[];
    return Array.isArray(list) ? list : [];
  })();

  // Si hay hipotesis elegida, mostrar como principal
  const target = elegida ?? (hipotesisList[0] as Record<string, unknown> | undefined);

  if (target) {
    if (target.titulo) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 120 },
        children: [new TextRun({ text: String(target.titulo), font: FONT, size: 26, bold: true })],
      }));
    }

    const fields: { label: string; key: string }[] = [
      { label: 'Gancho periodistico', key: 'gancho' },
      { label: 'Pregunta clave', key: 'pregunta_clave' },
      { label: 'Tipo', key: 'tipo' },
      { label: 'Audiencia objetivo', key: 'audiencia' },
      { label: 'Nivel de riesgo', key: 'riesgo' },
    ];

    for (const f of fields) {
      const val = target[f.key];
      if (val) {
        children.push(new Paragraph({
          spacing: { before: 160, after: 60 },
          children: [
            new TextRun({ text: `${f.label}: `, font: FONT, size: 24, bold: true }),
            new TextRun({ text: String(val), font: FONT, size: 24 }),
          ],
        }));
      }
    }

    // Verificaciones criticas
    const verificaciones = Array.isArray(target.verificaciones_criticas) ? target.verificaciones_criticas : [];
    if (verificaciones.length > 0) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300 },
        children: [new TextRun({ text: 'Verificaciones criticas', font: FONT, size: 26, bold: true })],
      }));

      verificaciones.forEach((v, idx) => {
        children.push(new Paragraph({
          numbering: { reference: 'verificaciones', level: 0 },
          spacing: { after: 60 },
          children: [new TextRun({ text: `${idx + 1}. ${String(v)}`, font: FONT, size: 24 })],
        }));
      });
    }

    // Evidencia requerida
    if (target.evidencia_requerida) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300 },
        children: [new TextRun({ text: 'Evidencia requerida', font: FONT, size: 26, bold: true })],
      }));
      children.push(new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: String(target.evidencia_requerida), font: FONT, size: 24 })],
      }));
    }
  }

  children.push(footerParagraph());

  return new Document({
    numbering: {
      config: [{
        reference: 'verificaciones',
        levels: [{
          level: 0,
          format: LevelFormat.DECIMAL,
          text: '%1.',
          alignment: AlignmentType.LEFT,
        }],
      }],
    },
    sections: [{
      properties: {
        page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
      },
      children,
    }],
  });
}

// ── Helper: stream a Buffer ──
async function streamToBuffer(stream: ReadableStream): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await findProjectForExport(id);

    if (!project) {
      return NextResponse.json(
        { error: `Project no encontrado: ${id}` },
        { status: 404 }
      );
    }

    const data = (project.data ?? {}) as Record<string, unknown>;
    const prefix = project.publicId;

    const zip = new JSZip();
    const folder = zip.folder(prefix)!;

    // Extraer titulo del borrador para nombres de archivo (lectura dual)
    const borradorRaw = data.borrador as Record<string, unknown> | undefined;
    const borrContenido = borradorRaw
      ? (borradorRaw.contenido ?? borradorRaw.borrador) as Record<string, unknown> | undefined
      : undefined;
    const tituloDoc = borrContenido && typeof borrContenido.titulo === 'string'
      ? borrContenido.titulo
      : null;
    const templateName = project.templateName ?? null;

    // 1. borrador.docx — si existe
    if (borradorRaw && typeof borradorRaw === 'object') {
      const doc = buildBorradorDocx(
        borradorRaw,
        prefix,
        project.tenantName,
        project.templateName,
      );
      const buf = await Packer.toBuffer(doc);
      folder.file(buildNombreArchivo(templateName, tituloDoc, 'Borrador', 'docx'), buf);
    }

    // 2. fuentes.docx — si existen
    if (Array.isArray(data.fuentes) && data.fuentes.length > 0) {
      const doc = buildFuentesDocx(data.fuentes, prefix);
      const buf = await Packer.toBuffer(doc);
      folder.file(buildNombreArchivo(templateName, null, 'Fuentes del expediente', 'docx'), buf);
    }

    // 3. hipotesis.docx — si existen
    if (data.hipotesis && typeof data.hipotesis === 'object') {
      const hipotesisInput = { ...(data.hipotesis as Record<string, unknown>) };
      if (data.hipotesis_elegida) {
        hipotesisInput.hipotesis_elegida = data.hipotesis_elegida;
      }
      const doc = buildHipotesisDocx(hipotesisInput, prefix);
      const buf = await Packer.toBuffer(doc);
      folder.file(buildNombreArchivo(templateName, null, 'Hipotesis de investigacion', 'docx'), buf);
    }

    // 4. proyecto.json — data completa
    folder.file('proyecto.json', JSON.stringify(project, null, 2));

    // 5. imagen-visual — si existe (via Vercel Blob SDK, best-effort)
    const imgData = data.imagen_visual as Record<string, unknown> | undefined;
    if (imgData && typeof imgData.url === 'string' && typeof imgData.nombre === 'string') {
      try {
        const blobResult = await blobGet(imgData.url as string, { access: 'private' });
        if (blobResult && blobResult.stream) {
          const imgBuf = await streamToBuffer(blobResult.stream);
          const ext = (imgData.nombre as string).split('.').pop()?.toLowerCase() ?? 'jpg';
          folder.file(`imagen-visual.${ext}`, imgBuf);
        }
      } catch (imgErr) {
        console.warn('[export] imagen_visual blob get failed (best-effort):', imgErr);
      }
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${prefix}-export.zip"`,
      },
    });
  } catch (error) {
    console.error('[POST /api/projects/[id]/export] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
