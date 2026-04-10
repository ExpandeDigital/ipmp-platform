/**
 * IP+MP Platform — Init endpoint
 *
 * Inicializa la base de datos: crea las tablas y carga los datos semilla.
 * Se ejecuta UNA SOLA VEZ después del primer deploy.
 *
 * Uso:
 *   POST https://tu-app.vercel.app/api/admin/init?token=TU_ADMIN_TOKEN
 *
 * Es idempotente: si las tablas ya existen, no las rompe.
 * Si los tenants/templates ya existen (mismo slug), no los duplica.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { tenants, templates } from '@/db/schema';
import { CREATE_TABLES_SQL } from '@/db/init-sql';
import { SEED_TENANTS, SEED_TEMPLATES } from '@/db/seed-data';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  // --- Auth ---
  const token = request.nextUrl.searchParams.get('token');
  const expected = process.env.ADMIN_TOKEN;

  if (!expected) {
    return NextResponse.json(
      { error: 'ADMIN_TOKEN no configurado en el servidor' },
      { status: 500 }
    );
  }

  if (!token || token !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const log: string[] = [];

  try {
    // --- Step 1: Create tables ---
    log.push('🔨 Creando tablas...');
    await db.execute(sql.raw(CREATE_TABLES_SQL));
    log.push('✅ Tablas creadas (idempotente)');

    // --- Step 2: Seed tenants ---
    log.push('🌱 Insertando tenants...');
    for (const tenant of SEED_TENANTS) {
      await db.insert(tenants).values(tenant).onConflictDoNothing({ target: tenants.slug });
    }
    log.push(`✅ ${SEED_TENANTS.length} tenants procesados`);

    // --- Step 3: Seed templates ---
    log.push('🌱 Insertando plantillas...');
    for (const template of SEED_TEMPLATES) {
      await db.insert(templates).values(template).onConflictDoNothing({ target: templates.slug });
    }
    log.push(`✅ ${SEED_TEMPLATES.length} plantillas procesadas`);

    log.push('');
    log.push('🎉 Cimientos inicializados correctamente.');
    log.push('Visitá / para ver el estado del shell.');

    return NextResponse.json({
      success: true,
      log,
    });
  } catch (error) {
    log.push('');
    log.push('❌ Error durante la inicialización');
    return NextResponse.json(
      {
        success: false,
        log,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// GET devuelve instrucciones de uso (más amigable que un 405).
export async function GET() {
  return NextResponse.json({
    message: 'Endpoint de inicialización de la base de datos',
    usage: 'Hacé POST con ?token=TU_ADMIN_TOKEN',
    example: 'curl -X POST "https://tu-app.vercel.app/api/admin/init?token=XXX"',
  });
}
