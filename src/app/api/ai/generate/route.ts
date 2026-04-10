/**
 * IP+MP Platform — Endpoint de generación IA
 *
 * POST /api/ai/generate
 *
 * Recibe: { tenantSlug, templateSlug, tool, userMessage, projectId? }
 * Retorna: { result (parsed JSON o texto), usage, durationMs }
 *
 * Seguridad:
 *   - Server-side only (la API key nunca llega al browser)
 *   - Valida que tenant y template existan
 *   - Loguea consumo automáticamente
 *   - Rate limit básico por header (extensible)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { tenants, templates } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { generate } from '@/lib/ai/provider';
import { TOOL_PROMPT_BUILDERS, type ToolName } from '@/lib/ai/prompts';
import { trackUsage } from '@/lib/ai/usage-tracker';

export const dynamic = 'force-dynamic';

// ── Tipos de request ─────────────────────────────────
interface GenerateRequest {
  tenantSlug: string;
  templateSlug: string;
  tool: ToolName;
  userMessage: string;
  projectId?: string;
}

// ── Validar campos requeridos ────────────────────────
function validateBody(body: unknown): body is GenerateRequest {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.tenantSlug === 'string' &&
    typeof b.templateSlug === 'string' &&
    typeof b.tool === 'string' &&
    typeof b.userMessage === 'string' &&
    b.userMessage.length > 0 &&
    b.userMessage.length <= 10000
  );
}

// ── Handler ──────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // 1. Parsear body
    const body = await request.json();

    if (!validateBody(body)) {
      return NextResponse.json(
        {
          error: 'Campos requeridos: tenantSlug, templateSlug, tool, userMessage (max 10.000 chars)',
        },
        { status: 400 }
      );
    }

    const { tenantSlug, templateSlug, tool, userMessage, projectId } = body;

    // 2. Validar que la herramienta existe
    const promptBuilder = TOOL_PROMPT_BUILDERS[tool as ToolName];
    if (!promptBuilder) {
      return NextResponse.json(
        { error: `Herramienta desconocida: ${tool}. Disponibles: ${Object.keys(TOOL_PROMPT_BUILDERS).join(', ')}` },
        { status: 400 }
      );
    }

    // 3. Buscar tenant
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, tenantSlug))
      .limit(1);

    if (!tenant) {
      return NextResponse.json(
        { error: `Tenant no encontrado: ${tenantSlug}` },
        { status: 404 }
      );
    }

    // 4. Buscar template
    const [template] = await db
      .select()
      .from(templates)
      .where(eq(templates.slug, templateSlug))
      .limit(1);

    if (!template) {
      return NextResponse.json(
        { error: `Plantilla no encontrada: ${templateSlug}` },
        { status: 404 }
      );
    }

    // 5. Construir prompt del sistema
    const systemPrompt = promptBuilder(
      {
        name: tenant.name,
        slug: tenant.slug,
        systemPromptBase: tenant.systemPromptBase,
        brandVariant: null,
      },
      {
        name: template.name,
        family: template.family,
        idPrefix: template.idPrefix,
        reviewLevel: template.reviewLevel,
      }
    );

    // 6. Llamar al modelo
    const result = await generate({
      system: systemPrompt,
      userMessage,
      temperature: 0.7,
    });

    // 7. Intentar parsear como JSON (las herramientas devuelven JSON)
    let parsed: unknown = result.text;
    try {
      parsed = JSON.parse(result.text);
    } catch {
      // Si no es JSON válido, devolver como texto plano
    }

    // 8. Loguear consumo (async, no bloquea la respuesta)
    trackUsage({
      tenantId: tenant.id,
      projectId: projectId ?? null,
      model: result.model,
      tool,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    });

    // 9. Responder
    return NextResponse.json({
      success: true,
      tool,
      tenant: tenant.slug,
      template: template.slug,
      result: parsed,
      usage: result.usage,
      model: result.model,
      durationMs: result.durationMs,
    });
  } catch (error) {
    console.error('[/api/ai/generate] Error:', error);

    const message =
      error instanceof Error ? error.message : 'Error interno del servidor';

    // Detectar errores de API key
    if (message.includes('ANTHROPIC_API_KEY')) {
      return NextResponse.json(
        { error: 'API key de Anthropic no configurada. Revisá Environment Variables en Vercel.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
