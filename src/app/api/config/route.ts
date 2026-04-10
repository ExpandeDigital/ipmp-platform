/**
 * IP+MP Platform — API de Configuración
 *
 * GET /api/config → Devuelve tenants y templates activos
 *
 * Usado por el traspaso InvestigaPress → MetricPress
 * para poblar los selectores de tenant y template.
 */

import { NextResponse } from 'next/server';
import { db } from '@/db';
import { tenants, templates } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const allTenants = await db
      .select({
        slug: tenants.slug,
        name: tenants.name,
        brandVariants: tenants.brandVariants,
      })
      .from(tenants)
      .where(eq(tenants.active, true))
      .orderBy(tenants.name);

    const allTemplates = await db
      .select({
        slug: templates.slug,
        name: templates.name,
        family: templates.family,
        idPrefix: templates.idPrefix,
        reviewLevel: templates.reviewLevel,
      })
      .from(templates)
      .where(eq(templates.active, true))
      .orderBy(templates.family, templates.name);

    return NextResponse.json({ tenants: allTenants, templates: allTemplates });
  } catch (error) {
    console.error('[GET /api/config] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    );
  }
}
