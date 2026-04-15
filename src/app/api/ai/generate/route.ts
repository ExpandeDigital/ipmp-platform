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

const NO_CACHE_HEADERS = { 'Cache-Control': 'no-store' } as const;

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
    b.userMessage.length <= 120000
  );
}

// ── Herramientas válidas ─────────────────────────────
const VALID_TOOLS: ToolName[] = [
  'generador_angulos',
  'validador_tono',
  'validador_tono_ip',
  'validador_hipotesis_pista',
  'generador_borrador',
  'generador_borrador_ip',
  'generador_prompt_visual',
];

// ── Handler ──────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // 1. Parsear body
    const body = await request.json();

    if (!validateBody(body)) {
      return NextResponse.json(
        {
          error: 'Campos requeridos: tool, userMessage (max 120.000 chars)',
        },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const { tool, userMessage, tenantSlug, templateSlug, projectId } = body;

    // 2. Validar que la herramienta existe
    if (!VALID_TOOLS.includes(tool as ToolName)) {
      return NextResponse.json(
        { error: `Herramienta desconocida: ${tool}. Disponibles: ${VALID_TOOLS.join(', ')}` },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const toolName = tool as ToolName;

    // 2.5. Hard-block: herramientas MetricPress-only
    // generador_borrador requiere tenant + template porque solo opera en fase produccion (post-traspaso).
    const MP_ONLY_TOOLS: ToolName[] = ['generador_borrador', 'generador_prompt_visual'];
    if (MP_ONLY_TOOLS.includes(toolName) && (!tenantSlug || !templateSlug)) {
      return NextResponse.json(
        {
          error: `La herramienta ${toolName} requiere tenantSlug y templateSlug. Solo opera en modo MetricPress (fase produccion en adelante).`,
        },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

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
          { status: 404, headers: NO_CACHE_HEADERS }
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
          { status: 404, headers: NO_CACHE_HEADERS }
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

    // 5. Intentar parsear como JSON (robusto: limpia markdown fences y texto extra)
    let parsed: unknown = result.text;
    let parseError: string | null = null;
    const rawText = result.text.trim();

    const tryParse = (str: string): unknown | null => {
      try {
        return JSON.parse(str);
      } catch {
        return null;
      }
    };

    // Intento 1: parse directo
    let attempt = tryParse(rawText);

    // Intento 2: quitar markdown fences ```json ... ``` o ``` ... ```
    if (attempt === null) {
      const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (fenceMatch && fenceMatch[1]) {
        attempt = tryParse(fenceMatch[1].trim());
      }
    }

    // Intento 3: extraer primer bloque { ... } o [ ... ] completo
    if (attempt === null) {
      const firstBrace = rawText.search(/[{[]/);
      if (firstBrace !== -1) {
        // Buscar el cierre balanceado
        const openChar = rawText[firstBrace];
        const closeChar = openChar === '{' ? '}' : ']';
        let depth = 0;
        let endIdx = -1;
        for (let i = firstBrace; i < rawText.length; i++) {
          if (rawText[i] === openChar) depth++;
          else if (rawText[i] === closeChar) {
            depth--;
            if (depth === 0) {
              endIdx = i;
              break;
            }
          }
        }
        if (endIdx !== -1) {
          attempt = tryParse(rawText.slice(firstBrace, endIdx + 1));
        }
      }
    }

    if (attempt !== null) {
      parsed = attempt;
    } else {
      parseError = 'No se pudo extraer JSON de la respuesta del modelo';
      console.warn('[/api/ai/generate] JSON parse failed. Raw text:', rawText.slice(0, 500));
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
      rawText: parseError ? rawText.slice(0, 2000) : undefined,
      parseError,
      usage: result.usage,
      model: result.model,
      durationMs: result.durationMs,
    }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error('[/api/ai/generate] Error:', error);

    const message =
      error instanceof Error ? error.message : 'Error interno del servidor';

    if (message.includes('ANTHROPIC_API_KEY')) {
      return NextResponse.json(
        { error: 'API key de Anthropic no configurada. Revisá Environment Variables en Vercel.' },
        { status: 500, headers: NO_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { error: message },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
