/**
 * IP+MP Platform — Upload de archivo para Asset Library
 *
 * POST /api/tenant-assets/upload
 *
 * Body: FormData con campo 'file'
 * Sube a Vercel Blob con access privado. No crea registro en DB.
 * Devuelve { url, pathname, size, contentType }.
 */

import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const dynamic = 'force-dynamic';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
  'text/plain',
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

    const originalName = (file as File).name || 'asset';
    const safeName = sanitizeFilename(originalName) || 'asset';
    const pathname = `tenant-assets/${safeName}`;

    const blob = await put(pathname, file, { access: 'private' });

    return NextResponse.json({
      success: true,
      url: blob.url,
      pathname: blob.pathname,
      size: file.size,
      contentType: mimeType,
    });
  } catch (error) {
    console.error('[POST /api/tenant-assets/upload] Error:', error);
    return NextResponse.json(
      {
        error: 'Error al subir archivo',
        detail: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
}
