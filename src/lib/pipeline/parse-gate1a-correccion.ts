/**
 * IP+MP Platform — Parser de correcciones del Gate 1a (Chunk 31I-3)
 *
 * Parser de vuelta del exportador del Chunk 31I-1. Acepta markdown o
 * docx con el expediente de correccion producido por el motor externo
 * (Sala de Redaccion u otro) y devuelve una estructura tipada lista
 * para persistir en data.gate_1a.correcciones[].
 *
 * Diseño:
 * - Markdown: parser line-by-line con regex de headings, sin libreria.
 * - DOCX: mammoth.convertToHtml (preserva headings H1/H2/H3/P/UL/OL)
 *   + node-html-parser para navegar la estructura.
 * - Anchor principal por supuesto: linea / paragraph "ID interno: <id>"
 *   emitida por el exporter del 31I-1. No depende de numeracion ni
 *   wording del motor externo.
 * - Tolerancia: seccion ausente => warning + campo null/vacio, nunca
 *   throw. Solo throw si el input esta completamente vacio o si
 *   mammoth falla al decodificar el docx.
 */

import { convertToHtml as mammothConvertToHtml } from 'mammoth';
import { parse as parseHtml, HTMLElement } from 'node-html-parser';

// ── Tipos publicos del modulo ──
export type Gate1aCorreccionVeredictoFinal =
  | 'confirmado'
  | 'corregido'
  | 'descartado'
  | 'no_resuelto';

export type Gate1aCorreccionSupuesto = {
  id: string;
  veredictoFinal: Gate1aCorreccionVeredictoFinal;
  textoCorregido: string | null;
  justificacion: string | null;
  fuentes: string[];
};

export type Gate1aCorreccionParsed = {
  enunciadoCorregido: {
    titulo: string | null;
    tesis: string | null;
  };
  supuestos: Gate1aCorreccionSupuesto[];
  fuentesGlobales: string[];
  notaEditorial: string | null;
  warnings: string[];
};

export type ParseInput = {
  buffer: Buffer;
  mimeType:
    | 'text/markdown'
    | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  supuestosIdsDelExport: string[];
};

// ── Estructura intermedia emitida por ambos parsers ──
type ParsedSupuestoRaw = {
  id: string;
  veredictoFinal: string | null;
  textoCorregido: string | null;
  justificacion: string | null;
  fuentes: string[];
};

type ParsedBase = {
  titulo: string | null;
  tesis: string | null;
  supuestos: ParsedSupuestoRaw[];
  fuentesGlobales: string[];
  notaEditorial: string | null;
};

// ── Labels esperados para detectar secciones (case-insensitive, permisivo) ──
const HEADING_ENUNCIADO = /^enunciado\s+corregido/i;
const HEADING_SUPUESTO = /^supuesto\b/i;
const HEADING_FUENTES_GLOBALES = /^fuentes\s+(consolidadas|consultadas|documentales)/i;
const HEADING_NOTA_EDITORIAL = /^nota\s+editorial/i;

// Labels por-supuesto. Los valores vienen tras `:` hasta final de linea
// o siguiente label; el parser tolera espacios, case y variaciones.
const LABEL_ID_INTERNO = /^id\s+interno\s*:\s*(.+)$/i;
const LABEL_VEREDICTO = /^veredicto\s*(final)?\s*:\s*(.+)$/i;
const LABEL_TEXTO_CORREGIDO = /^(texto\s+corregido|correccion)\s*:\s*(.+)?$/i;
const LABEL_JUSTIFICACION = /^justificaci(o|ó)n\s*:\s*(.+)?$/i;
const LABEL_FUENTES = /^fuentes\s*:\s*(.+)?$/i;
const LABEL_TITULO = /^(titulo|título|title)\s*:\s*(.+)$/i;
const LABEL_TESIS = /^(tesis|thesis)\s*:\s*(.+)$/i;

// Veredictos aceptados, normalizados a minusculas sin acentos
const VEREDICTOS_VALIDOS = new Set([
  'confirmado',
  'corregido',
  'descartado',
  'no_resuelto',
  'no resuelto',
  'sin resolver',
]);

function normalizeVeredicto(raw: string | null): Gate1aCorreccionVeredictoFinal | null {
  if (!raw) return null;
  const t = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!VEREDICTOS_VALIDOS.has(t)) return null;
  if (t === 'no resuelto' || t === 'sin resolver') return 'no_resuelto';
  return t as Gate1aCorreccionVeredictoFinal;
}

// ── Parser de markdown ──
function parseFromMarkdown(text: string): ParsedBase {
  const lines = text.split(/\r?\n/);

  const base: ParsedBase = {
    titulo: null,
    tesis: null,
    supuestos: [],
    fuentesGlobales: [],
    notaEditorial: null,
  };

  type SectionKind =
    | 'none'
    | 'enunciado'
    | 'supuesto'
    | 'fuentes_globales'
    | 'nota_editorial';

  let section: SectionKind = 'none';
  let currentSupuesto: ParsedSupuestoRaw | null = null;
  let enunciadoBuffer: string[] = [];
  let notaBuffer: string[] = [];
  // Buffer para el label activo dentro del supuesto (para acumular
  // lineas que sean continuacion del mismo campo).
  let activeLabel: 'texto' | 'justif' | 'fuentes' | null = null;

  const flushSupuesto = () => {
    if (currentSupuesto && currentSupuesto.id) {
      base.supuestos.push(currentSupuesto);
    }
    currentSupuesto = null;
    activeLabel = null;
  };

  const finalizeEnunciado = () => {
    if (enunciadoBuffer.length > 0) {
      // Si no se capturo via labels Titulo/Tesis, usar primera linea no
      // vacia como titulo y resto como tesis.
      if (base.titulo === null && base.tesis === null) {
        const nonEmpty = enunciadoBuffer.filter((l) => l.trim().length > 0);
        if (nonEmpty.length > 0) {
          base.titulo = nonEmpty[0].trim();
          if (nonEmpty.length > 1) {
            base.tesis = nonEmpty.slice(1).join('\n').trim() || null;
          }
        }
      }
      enunciadoBuffer = [];
    }
  };

  const finalizeNota = () => {
    if (notaBuffer.length > 0) {
      const joined = notaBuffer.join('\n').trim();
      base.notaEditorial = joined.length > 0 ? joined : null;
      notaBuffer = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      // Cerrar seccion previa
      if (section === 'supuesto') flushSupuesto();
      if (section === 'enunciado') finalizeEnunciado();
      if (section === 'nota_editorial') finalizeNota();

      const headingText = headingMatch[2].trim();

      if (HEADING_ENUNCIADO.test(headingText)) {
        section = 'enunciado';
        continue;
      }
      if (HEADING_SUPUESTO.test(headingText)) {
        section = 'supuesto';
        // Si el heading lleva un uuid o id en el texto, capturarlo como
        // fallback. Anchor real sigue siendo "ID interno: <id>".
        const inlineIdMatch = headingText.match(/([0-9a-f-]{8,})/i);
        currentSupuesto = {
          id: inlineIdMatch ? inlineIdMatch[1] : '',
          veredictoFinal: null,
          textoCorregido: null,
          justificacion: null,
          fuentes: [],
        };
        activeLabel = null;
        continue;
      }
      if (HEADING_FUENTES_GLOBALES.test(headingText)) {
        section = 'fuentes_globales';
        continue;
      }
      if (HEADING_NOTA_EDITORIAL.test(headingText)) {
        section = 'nota_editorial';
        continue;
      }
      // Heading desconocido: lo cerramos a 'none'
      section = 'none';
      continue;
    }

    const trimmed = line.trim();

    if (section === 'enunciado') {
      const mTitulo = trimmed.match(LABEL_TITULO);
      const mTesis = trimmed.match(LABEL_TESIS);
      if (mTitulo) {
        base.titulo = mTitulo[2].trim() || null;
        continue;
      }
      if (mTesis) {
        base.tesis = mTesis[2].trim() || null;
        continue;
      }
      enunciadoBuffer.push(line);
      continue;
    }

    if (section === 'supuesto' && currentSupuesto) {
      const mId = trimmed.match(LABEL_ID_INTERNO);
      if (mId) {
        currentSupuesto.id = mId[1].trim();
        activeLabel = null;
        continue;
      }
      const mVer = trimmed.match(LABEL_VEREDICTO);
      if (mVer) {
        currentSupuesto.veredictoFinal = mVer[2].trim() || null;
        activeLabel = null;
        continue;
      }
      const mTexto = trimmed.match(LABEL_TEXTO_CORREGIDO);
      if (mTexto) {
        currentSupuesto.textoCorregido = (mTexto[2] ?? '').trim() || null;
        activeLabel = 'texto';
        continue;
      }
      const mJustif = trimmed.match(LABEL_JUSTIFICACION);
      if (mJustif) {
        currentSupuesto.justificacion = (mJustif[2] ?? '').trim() || null;
        activeLabel = 'justif';
        continue;
      }
      const mFuentes = trimmed.match(LABEL_FUENTES);
      if (mFuentes) {
        const inline = (mFuentes[1] ?? '').trim();
        if (inline.length > 0) {
          currentSupuesto.fuentes.push(inline);
        }
        activeLabel = 'fuentes';
        continue;
      }
      // Linea sin label: continuacion del campo activo o item de lista
      if (trimmed.length === 0) {
        continue;
      }
      const bulletMatch = trimmed.match(/^[-*+]\s+(.+)$/);
      if (activeLabel === 'fuentes' && bulletMatch) {
        currentSupuesto.fuentes.push(bulletMatch[1].trim());
        continue;
      }
      if (activeLabel === 'fuentes') {
        currentSupuesto.fuentes.push(trimmed);
        continue;
      }
      if (activeLabel === 'texto') {
        currentSupuesto.textoCorregido =
          (currentSupuesto.textoCorregido ?? '') +
          (currentSupuesto.textoCorregido ? '\n' : '') +
          trimmed;
        continue;
      }
      if (activeLabel === 'justif') {
        currentSupuesto.justificacion =
          (currentSupuesto.justificacion ?? '') +
          (currentSupuesto.justificacion ? '\n' : '') +
          trimmed;
        continue;
      }
      continue;
    }

    if (section === 'fuentes_globales') {
      if (trimmed.length === 0) continue;
      const bulletMatch = trimmed.match(/^[-*+]\s+(.+)$/);
      base.fuentesGlobales.push(bulletMatch ? bulletMatch[1].trim() : trimmed);
      continue;
    }

    if (section === 'nota_editorial') {
      notaBuffer.push(line);
      continue;
    }
  }

  // Cerrar ultima seccion abierta
  if (section === 'supuesto') flushSupuesto();
  if (section === 'enunciado') finalizeEnunciado();
  if (section === 'nota_editorial') finalizeNota();

  return base;
}

// ── Parser de DOCX via mammoth + node-html-parser ──
async function parseFromDocx(buffer: Buffer): Promise<ParsedBase> {
  let html: string;
  try {
    const result = await mammothConvertToHtml({ buffer });
    html = result.value;
  } catch (err) {
    const detalle = err instanceof Error ? err.message : 'error desconocido';
    throw new Error(`PARSE_FAILED: mammoth convertToHtml fallo — ${detalle}`);
  }

  if (!html || html.trim().length === 0) {
    throw new Error('PARSE_FAILED: docx vacio tras conversion a HTML');
  }

  let root: HTMLElement;
  try {
    root = parseHtml(html) as HTMLElement;
  } catch (err) {
    const detalle = err instanceof Error ? err.message : 'error desconocido';
    throw new Error(`PARSE_FAILED: HTML invalido tras mammoth — ${detalle}`);
  }

  // Serializar el arbol a lineas de texto en el orden del documento,
  // marcando los headings para reutilizar el parser de markdown. Esto
  // evita duplicar la logica de seccion y aprovecha que ambos formatos
  // comparten la estructura semantica (H1 -> seccion, H2 -> supuesto,
  // P/LI -> labels o items).
  const lines: string[] = [];

  const walk = (node: HTMLElement) => {
    const tag = node.tagName ? node.tagName.toLowerCase() : '';
    if (tag === 'h1') {
      lines.push(`# ${node.text.trim()}`);
      return;
    }
    if (tag === 'h2') {
      lines.push(`## ${node.text.trim()}`);
      return;
    }
    if (tag === 'h3') {
      lines.push(`### ${node.text.trim()}`);
      return;
    }
    if (tag === 'p') {
      lines.push(node.text.trim());
      return;
    }
    if (tag === 'li') {
      lines.push(`- ${node.text.trim()}`);
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      for (const child of node.childNodes) {
        if (child instanceof HTMLElement) walk(child);
      }
      return;
    }
    // Otros nodos: descender
    for (const child of node.childNodes) {
      if (child instanceof HTMLElement) walk(child);
    }
  };

  for (const child of root.childNodes) {
    if (child instanceof HTMLElement) walk(child);
  }

  const pseudoMarkdown = lines.join('\n');
  return parseFromMarkdown(pseudoMarkdown);
}

// ── Entry point publico ──
export async function parseGate1aCorreccion(
  input: ParseInput,
): Promise<Gate1aCorreccionParsed> {
  const warnings: string[] = [];

  let base: ParsedBase;
  if (input.mimeType === 'text/markdown') {
    const text = input.buffer.toString('utf-8');
    if (text.trim().length === 0) {
      throw new Error('EMPTY_CORRECCION');
    }
    base = parseFromMarkdown(text);
  } else if (
    input.mimeType ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    base = await parseFromDocx(input.buffer);
  } else {
    throw new Error(`PARSE_FAILED: mimeType no soportado: ${input.mimeType}`);
  }

  // ── Matching contra supuestos del export ──
  const supuestosIdsSet = new Set(input.supuestosIdsDelExport);
  const parsedIds = new Set(base.supuestos.map((s) => s.id).filter(Boolean));

  const supuestosFinal: Gate1aCorreccionSupuesto[] = [];

  for (const parsed of base.supuestos) {
    if (!parsed.id) {
      warnings.push('Supuesto sin ID interno detectado, descartado');
      continue;
    }
    if (!supuestosIdsSet.has(parsed.id)) {
      warnings.push(
        `Supuesto con ID ${parsed.id} no estaba en el export, descartado`,
      );
      continue;
    }
    const veredictoNorm = normalizeVeredicto(parsed.veredictoFinal);
    if (parsed.veredictoFinal && !veredictoNorm) {
      warnings.push(
        `Supuesto ${parsed.id}: veredicto "${parsed.veredictoFinal}" no reconocido, registrado como no_resuelto`,
      );
    }
    supuestosFinal.push({
      id: parsed.id,
      veredictoFinal: veredictoNorm ?? 'no_resuelto',
      textoCorregido: parsed.textoCorregido,
      justificacion: parsed.justificacion,
      fuentes: parsed.fuentes,
    });
  }

  // Agregar supuestos del export ausentes en el parser
  for (const idExport of input.supuestosIdsDelExport) {
    if (!parsedIds.has(idExport)) {
      warnings.push(`Supuesto ${idExport} del export no aparece en el import`);
      supuestosFinal.push({
        id: idExport,
        veredictoFinal: 'no_resuelto',
        textoCorregido: null,
        justificacion: null,
        fuentes: [],
      });
    }
  }

  const enunciadoCorregido = {
    titulo: base.titulo,
    tesis: base.tesis,
  };

  const sinSupuestosResueltos = supuestosFinal.every(
    (s) => s.veredictoFinal === 'no_resuelto',
  );
  const sinEnunciado = !enunciadoCorregido.titulo && !enunciadoCorregido.tesis;

  if (sinSupuestosResueltos && sinEnunciado && base.notaEditorial === null) {
    throw new Error('EMPTY_CORRECCION');
  }

  if (!enunciadoCorregido.titulo) {
    warnings.push('El expediente no trae titulo corregido');
  }
  if (base.fuentesGlobales.length === 0) {
    warnings.push('El expediente no trae fuentes globales consolidadas');
  }

  return {
    enunciadoCorregido,
    supuestos: supuestosFinal,
    fuentesGlobales: base.fuentesGlobales,
    notaEditorial: base.notaEditorial,
    warnings,
  };
}
