/**
 * IP+MP Platform — Sugerencias de Editores (Chunk 11A)
 *
 * GET /api/editores/sugerencias?tenantSlug={slug}&tier={1-4}&templateFamily={prensa|opinion|institucional|academico}
 *
 * Devuelve un subset de editores_agenda filtrado y clasificado para
 * alimentar el autopoblado del Constructor de Pitch.
 *
 * Filtro duro (siempre aplicado en el query Drizzle):
 *   - activo = true
 *   - tier <= tierObjetivo
 *
 * Sobre ese subset, cada editor se clasifica en uno de tres niveles
 * de match (relajacion progresiva), evaluando condiciones blandas:
 *
 *   1. "exacto"      → tenantsRelevantes incluye tenantSlug
 *                       AND tipoPiezaRecomendado incluye algun
 *                       identificador compatible con templateFamily.
 *   2. "sin_tipo"    → tenantsRelevantes incluye tenantSlug
 *                       AND NO hay match de tipo de pieza.
 *   3. "sin_tenant"  → tenantsRelevantes NO incluye tenantSlug
 *                       AND tipoPiezaRecomendado incluye algun
 *                       identificador compatible con templateFamily.
 *
 * Los editores que no cumplen ni tenant ni tipo de pieza quedan
 * fuera del resultado (solo cumplen el filtro duro, no se devuelven).
 *
 * El array sugerencias viene ordenado en bloques: exacto, sin_tipo,
 * sin_tenant. Dentro de cada bloque se preserva el orden del query
 * original (tier asc, apellido asc).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { editoresAgenda } from '@/db/schema';
import { and, asc, eq, lte } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

// ── Tipos locales ────────────────────────────────────
type TemplateFamily = 'prensa' | 'opinion' | 'institucional' | 'academico';
type MatchLevel = 'exacto' | 'sin_tipo' | 'sin_tenant';

// ── Mapeo templateFamily → identificadores compatibles ──
const FAMILY_TO_TIPOS: Record<TemplateFamily, string[]> = {
  prensa: ['reportaje', 'nota', 'entrevista', 'cronica', 'investigacion'],
  opinion: ['columna', 'opinion', 'editorial', 'tribuna'],
  institucional: ['comunicado', 'institucional', 'declaracion'],
  academico: ['paper', 'academico', 'analisis', 'ensayo'],
};

const VALID_FAMILIES: TemplateFamily[] = [
  'prensa',
  'opinion',
  'institucional',
  'academico',
];

// ── Helper: match case-insensitive por inclusion substring ──
// Considera match si algun identificador de familyTipos esta contenido
// en algun tipo del editor, O al reves (cualquiera de las dos
// direcciones). Ambos lados se normalizan con toLowerCase antes de
// comparar. No se normalizan acentos: las entradas canonicas las
// define el operador al cargar la agenda.
function hasCompatibleTipo(
  editorTipos: string[],
  familyTipos: string[]
): boolean {
  for (const et of editorTipos) {
    const etLower = et.toLowerCase();
    for (const ft of familyTipos) {
      const ftLower = ft.toLowerCase();
      if (etLower.includes(ftLower) || ftLower.includes(etLower)) {
        return true;
      }
    }
  }
  return false;
}

export async function GET(request: NextRequest) {
  try {
    // ── 1. Leer y validar query params ──
    const { searchParams } = new URL(request.url);
    const tenantSlug = searchParams.get('tenantSlug');
    const tierRaw = searchParams.get('tier');
    const templateFamilyRaw = searchParams.get('templateFamily');

    if (!tenantSlug || !tierRaw || !templateFamilyRaw) {
      return NextResponse.json(
        {
          error:
            'Params requeridos: tenantSlug, tier, templateFamily',
          code: 'VALIDATION_FAILED',
        },
        { status: 400 }
      );
    }

    if (tenantSlug.trim().length === 0) {
      return NextResponse.json(
        {
          error:
            'Params requeridos: tenantSlug, tier, templateFamily',
          code: 'VALIDATION_FAILED',
        },
        { status: 400 }
      );
    }

    const tierObjetivo = parseInt(tierRaw, 10);
    if (!Number.isInteger(tierObjetivo) || tierObjetivo <= 0) {
      return NextResponse.json(
        {
          error: 'tier debe ser entero positivo',
          code: 'VALIDATION_FAILED',
        },
        { status: 400 }
      );
    }

    if (!VALID_FAMILIES.includes(templateFamilyRaw as TemplateFamily)) {
      return NextResponse.json(
        {
          error:
            'templateFamily debe ser uno de: prensa, opinion, institucional, academico',
          code: 'VALIDATION_FAILED',
        },
        { status: 400 }
      );
    }
    const templateFamily = templateFamilyRaw as TemplateFamily;

    // ── 2. Query con filtro duro: activo=true AND tier<=tierObjetivo ──
    const rows = await db
      .select()
      .from(editoresAgenda)
      .where(
        and(
          eq(editoresAgenda.activo, true),
          lte(editoresAgenda.tier, tierObjetivo)
        )
      )
      .orderBy(asc(editoresAgenda.tier), asc(editoresAgenda.apellido));

    // ── 3. Clasificar in-memory en 3 buckets ──
    const familyTipos = FAMILY_TO_TIPOS[templateFamily];

    const exacto: Array<{ editor: typeof rows[number]; match: MatchLevel }> = [];
    const sinTipo: Array<{ editor: typeof rows[number]; match: MatchLevel }> = [];
    const sinTenant: Array<{ editor: typeof rows[number]; match: MatchLevel }> = [];

    for (const editor of rows) {
      const editorTenants = Array.isArray(editor.tenantsRelevantes)
        ? editor.tenantsRelevantes
        : [];
      const editorTipos = Array.isArray(editor.tipoPiezaRecomendado)
        ? editor.tipoPiezaRecomendado
        : [];

      const matchTenant = editorTenants.includes(tenantSlug);
      const matchTipo = hasCompatibleTipo(editorTipos, familyTipos);

      if (matchTenant && matchTipo) {
        exacto.push({ editor, match: 'exacto' });
      } else if (matchTenant && !matchTipo) {
        sinTipo.push({ editor, match: 'sin_tipo' });
      } else if (!matchTenant && matchTipo) {
        sinTenant.push({ editor, match: 'sin_tenant' });
      }
      // Los que no cumplen ni tenant ni tipo quedan fuera del resultado.
    }

    // ── 4. Concatenar en orden de bloques ──
    const sugerencias = [...exacto, ...sinTipo, ...sinTenant];

    return NextResponse.json({
      success: true,
      sugerencias,
      meta: {
        tenantSlug,
        tier: tierObjetivo,
        templateFamily,
        totalExacto: exacto.length,
        totalSinTipo: sinTipo.length,
        totalSinTenant: sinTenant.length,
      },
    });
  } catch (error) {
    console.error('[GET /api/editores/sugerencias] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
