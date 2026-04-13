/**
 * IP+MP Platform — Extraccion de contenido de archivos adjuntos
 *
 * POST /api/fuentes/extract-content
 *
 * Recibe { blobUrl, mimeType } y devuelve el texto extraido del archivo.
 * Soporta: PDF (pdf-parse), DOCX (mammoth), texto plano.
 * Trunca a 12000 caracteres si excede.
 * Best-effort: si falla, retorna content: null sin error HTTP.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const MAX_CHARS = 50000;

interface ExtractRequest {
  blobUrl: string;
  mimeType: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<ExtractRequest>;

    if (!body.blobUrl || typeof body.blobUrl !== 'string') {
      return NextResponse.json(
        { error: 'Campo requerido: blobUrl' },
        { status: 400 }
      );
    }

    if (!body.blobUrl.startsWith('https://')) {
      return NextResponse.json(
        { error: 'blobUrl debe ser una URL HTTPS valida' },
        { status: 400 }
      );
    }

    const mimeType = typeof body.mimeType === 'string' ? body.mimeType : '';

    // Fetch del archivo desde Vercel Blob (URL con token embebido)
    let fileBuffer: Buffer;
    try {
      const res = await fetch(body.blobUrl);
      if (!res.ok) {
        console.warn('[extract-content] Blob fetch failed:', res.status);
        return NextResponse.json({ content: null, truncated: false });
      }
      const arrayBuf = await res.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuf);
    } catch (fetchErr) {
      console.warn('[extract-content] Blob fetch error:', fetchErr);
      return NextResponse.json({ content: null, truncated: false });
    }

    let text: string | null = null;

    try {
      if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword'
      ) {
        // DOCX
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        text = result.value;
      } else if (mimeType === 'application/pdf') {
        // PDF
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
        const result = await pdfParse(fileBuffer);
        text = result.text;
      } else if (mimeType.startsWith('text/')) {
        // Texto plano
        text = fileBuffer.toString('utf-8');
      } else {
        // Tipo no soportado — no es error
        return NextResponse.json({ content: null, truncated: false });
      }
    } catch (parseErr) {
      console.warn('[extract-content] Parse error:', parseErr);
      return NextResponse.json({ content: null, truncated: false });
    }

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ content: null, truncated: false, charCount: 0, originalLength: 0 });
    }

    const originalLength = text.length;
    const truncated = originalLength > MAX_CHARS;
    const content = truncated ? text.slice(0, MAX_CHARS) : text;

    return NextResponse.json({ content, truncated, charCount: content.length, originalLength });
  } catch (error) {
    console.error('[POST /api/fuentes/extract-content] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    );
  }
}
