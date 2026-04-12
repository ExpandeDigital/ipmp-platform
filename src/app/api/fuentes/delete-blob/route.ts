/**
 * IP+MP Platform — Eliminar archivo fuente de Vercel Blob
 *
 * DELETE /api/fuentes/delete-blob
 *
 * Body JSON: { url: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const url = typeof body?.url === 'string' ? body.url : '';

    if (!url) {
      return NextResponse.json(
        { error: 'URL requerida' },
        { status: 400 }
      );
    }

    if (!url.startsWith('https://')) {
      return NextResponse.json(
        { error: 'URL invalida' },
        { status: 400 }
      );
    }

    await del(url);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/fuentes/delete-blob] Error:', error);
    return NextResponse.json(
      {
        error: 'Error al eliminar archivo',
        detail: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
}
