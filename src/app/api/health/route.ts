/**
 * IP+MP Platform — Health check endpoint
 *
 * Verifica que la aplicación responde y que la base de datos está accesible.
 * Útil para monitoring externo y para debugging del primer deploy.
 */

import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const checks: Record<string, { status: 'ok' | 'error'; message?: string }> = {
    app: { status: 'ok' },
    database: { status: 'ok' },
  };

  // Verificamos que podamos hacer una query trivial
  try {
    await db.execute(sql`SELECT 1`);
  } catch (error) {
    checks.database = {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
  }

  const allOk = Object.values(checks).every((c) => c.status === 'ok');

  return NextResponse.json(
    {
      status: allOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allOk ? 200 : 503 }
  );
}
