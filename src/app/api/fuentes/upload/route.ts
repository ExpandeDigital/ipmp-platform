/**
 * IP+MP Platform — Upload de archivo fuente a Vercel Blob
 *
 * POST /api/fuentes/upload
 *
 * Body: FormData con campos 'file' (File) y 'fuenteId' (string)
 *
 * Sube el archivo a Vercel Blob bajo el path fuentes/{fuenteId}/{filename}
 * con access público. Retorna la URL del blob.
 */

import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const dynamic = 'force-dynamic';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

function sanitizeFilename(name: string): string {
  return name
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9\-\.]/g, '');
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const fuenteId = formData.get('fuenteId');

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: 'No se recibio archivo' },
        { status: 400 }
      );
    }

    const mimeType = file.type;
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json(
        { error: 'Tipo de archivo no permitido', tipo: mimeType },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'Archivo demasiado grande', maxMB: 10 },
        { status: 400 }
      );
    }

    const originalName = (file as File).name || 'archivo';
    const safeName = sanitizeFilename(originalName) || 'archivo';
    const safeId = String(fuenteId || 'sin-id');
    const pathname = `fuentes/${safeId}/${safeName}`;

    const blob = await put(pathname, file, { access: 'private' });

    return NextResponse.json({
      success: true,
      url: blob.url,
      pathname: blob.pathname,
      size: file.size,
    });
  } catch (error) {
    console.error('[POST /api/fuentes/upload] Error:', error);
    return NextResponse.json(
      {
        error: 'Error al subir archivo',
        detail: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
}
