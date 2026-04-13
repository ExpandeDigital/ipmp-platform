/**
 * IP+MP Platform — Exportador de Project (Chunk 13B)
 *
 * POST /api/projects/[id]/export
 *
 * Genera un ZIP en memoria con el contenido del project:
 *   [publicId]/proyecto.json   — data completa del project
 *   [publicId]/borrador.md     — borrador en markdown (si existe)
 *   [publicId]/pitch.md        — pitch en markdown (si existe)
 *   [publicId]/fuentes-odf.json — fuentes del ODF (si existen)
 *   [publicId]/hipotesis.json  — hipotesis generadas (si existen)
 *
 * Devuelve application/zip con Content-Disposition attachment.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { projects, tenants, templates } from '@/db/schema';
import { eq } from 'drizzle-orm';
import JSZip from 'jszip';

export const dynamic = 'force-dynamic';

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

// ── Helper: borrador a markdown ──
function borradorToMarkdown(borrador: Record<string, unknown>): string {
  // Chunk 19D: lectura dual — clave nueva 'contenido' tiene prioridad sobre 'borrador' (legacy)
  const b = (borrador.contenido ?? borrador.borrador) as Record<string, unknown> | undefined;
  if (!b) return '# (borrador sin estructura)\n';

  const lines: string[] = [];

  if (b.titulo) lines.push(`# ${b.titulo}`);
  if (b.bajada) lines.push(`\n## Bajada\n\n${b.bajada}`);
  if (b.lead) lines.push(`\n## Lead\n\n${b.lead}`);

  const cuerpo = Array.isArray(b.cuerpo) ? b.cuerpo : [];
  if (cuerpo.length > 0) {
    lines.push(`\n## Cuerpo`);
    for (const sec of cuerpo) {
      const s = sec as Record<string, unknown>;
      if (s.subtitulo) lines.push(`\n### ${s.subtitulo}`);
      const parrafos = Array.isArray(s.parrafos) ? s.parrafos : [];
      lines.push(parrafos.map(String).join('\n\n'));
    }
  }

  if (b.cierre) lines.push(`\n## Cierre\n\n${b.cierre}`);

  const metadata = (borrador.metadata ?? {}) as Record<string, unknown>;
  const fuentes = Array.isArray(metadata.fuentes_citadas) ? metadata.fuentes_citadas : [];
  if (fuentes.length > 0) {
    lines.push(`\n---\n\nFuentes citadas:\n${fuentes.map((f) => `- ${f}`).join('\n')}`);
  }

  return lines.join('\n');
}

// ── Helper: pitch a markdown ──
function pitchToMarkdown(pitch: Record<string, unknown>): string {
  const p = pitch.pitch as Record<string, unknown> | undefined;
  const lines: string[] = [];

  if (p?.asunto) lines.push(`# Pitch: ${p.asunto}`);
  if (pitch.texto_completo) lines.push(`\n${pitch.texto_completo}`);
  lines.push(`\n---`);
  if (pitch.medio_destino) lines.push(`\nMedio destino: ${pitch.medio_destino}`);
  if (pitch.notas_estrategicas) lines.push(`Notas estrategicas: ${pitch.notas_estrategicas}`);

  return lines.join('\n');
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

    // 1. proyecto.json — data completa
    folder.file('proyecto.json', JSON.stringify(project, null, 2));

    // 2. borrador.md — si existe
    if (data.borrador && typeof data.borrador === 'object') {
      folder.file('borrador.md', borradorToMarkdown(data.borrador as Record<string, unknown>));
    }

    // 3. pitch.md — si existe
    if (data.pitch && typeof data.pitch === 'object') {
      folder.file('pitch.md', pitchToMarkdown(data.pitch as Record<string, unknown>));
    }

    // 4. fuentes-odf.json — si existen
    if (Array.isArray(data.fuentes) && data.fuentes.length > 0) {
      folder.file('fuentes-odf.json', JSON.stringify(data.fuentes, null, 2));
    }

    // 5. hipotesis.json — si existen
    if (data.hipotesis && typeof data.hipotesis === 'object') {
      folder.file('hipotesis.json', JSON.stringify(data.hipotesis, null, 2));
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
