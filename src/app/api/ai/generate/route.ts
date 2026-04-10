/**
 * IP+MP Platform — Endpoint de generación IA
 *
 * POST /api/ai/generate
 *
 * REFACTORIZACIÓN 5c (Abril 2026):
 *   - tenantSlug y templateSlug son OPCIONALES
 *   - Sin tenant/template → modo InvestigaPress (IP_PROMPT_BUILDERS)
 *   - Con tenant/template → modo MetricPress (MP_PROMPT_BUILDERS)
 *   - Consumo se loguea bajo tenant "investigapress" cuando no hay tenant
 *
 * Recibe: { tool, userMessage, tenantSlug?, templateSlug?, projectId? }
 * Retorna: { result (parsed JSON o texto), usage, durationMs }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { tenants, templates } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { generate } from '@/lib/ai/provider';
import {
  IP_PROMPT_BUILDERS,
  MP_PROMPT_BUILDERS,
  type ToolName,
} from '@/lib/ai/prompts';
import { trackUsage } from '@/lib/ai/usage-tracker';

export const dynamic = 'force-dynamic';

// ── Tipos de request ─────────────────────────────────
interface GenerateRequest {
  tool: string;
  userMessage: string;
  // Opcionales — si se pasan, modo MetricPress
  tenantSlug?: string;
  templateSlug?: string;
  projectId?: string;
}

// ── Validar campos requeridos ────────────────────────
function validateBody(body: unknown): body is GenerateRequest {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.tool === 'string' &&
    typeof b.userMessage === 'string' &&
    b.userMessage.length > 0 &&
    b.userMessage.length <= 10000
  );
}

// ── Herramientas válidas ─────────────────────────────
const VALID_TOOLS: ToolName[] = ['generador_angulos', 'validador_tono', 'constructor_pitch'];

// ── Handler ──────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // 1. Parsear body
    const body = await request.json();

    if (!validateBody(body)) {
      return NextResponse.json(
        {
          error: 'Campos requeridos: tool, userMessage (max 10.000 chars)',
        },
        { status: 400 }
      );
    }

    const { tool, userMessage, tenantSlug, templateSlug, projectId } = body;

    // 2. Validar que la herramienta existe
    if (!VALID_TOOLS.includes(tool as ToolName)) {
      return NextResponse.json(
        { error: `Herramienta desconocida: ${tool}. Disponibles: ${VALID_TOOLS.join(', ')}` },
        { status: 400 }
      );
    }

    const toolName = tool as ToolName;

    // 3. Determinar modo: InvestigaPress o MetricPress
    let systemPrompt: string;
    let tenantId: string | null = null;
    let resolvedTenantSlug: string | null = null;
    let resolvedTemplateSlug: string | null = null;

    if (tenantSlug && templateSlug) {
      // ── MODO METRICPRESS: con tenant + template ──
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

      const promptBuilder = MP_PROMPT_BUILDERS[toolName];
      systemPrompt = promptBuilder(
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

      tenantId = tenant.id;
      resolvedTenantSlug = tenant.slug;
      resolvedTemplateSlug = template.slug;
    } else {
      // ── MODO INVESTIGAPRESS: sin tenant, periodismo puro ──
      const promptBuilder = IP_PROMPT_BUILDERS[toolName];
      systemPrompt = promptBuilder();

      // Para loguear consumo, usar tenant "investigapress"
      const [ipTenant] = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, 'investigapress'))
        .limit(1);

      tenantId = ipTenant?.id ?? null;
      resolvedTenantSlug = 'investigapress';
    }

    // 4. Llamar al modelo
    const result = await generate({
      system: systemPrompt,
      userMessage,
      temperature: 0.7,
    });

    // 5. Intentar parsear como JSON
    let parsed: unknown = result.text;
    try {
      parsed = JSON.parse(result.text);
    } catch {
      // Si no es JSON válido, devolver como texto plano
    }

    // 6. Loguear consumo (async, no bloquea la respuesta)
    if (tenantId) {
      trackUsage({
        tenantId,
        projectId: projectId ?? null,
        model: result.model,
        tool: toolName,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      });
    }

    // 7. Responder
    return NextResponse.json({
      success: true,
      tool: toolName,
      mode: tenantSlug ? 'metricpress' : 'investigapress',
      tenant: resolvedTenantSlug,
      template: resolvedTemplateSlug,
      result: parsed,
      usage: result.usage,
      model: result.model,
      durationMs: result.durationMs,
    });
  } catch (error) {
    console.error('[/api/ai/generate] Error:', error);

    const message =
      error instanceof Error ? error.message : 'Error interno del servidor';

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
