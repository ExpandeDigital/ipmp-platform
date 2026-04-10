/**
 * IP+MP Platform — Plantillas de prompts del sistema
 *
 * Cada herramienta del pipeline tiene su propio system prompt.
 * Los prompts son propiedad intelectual de Expande Digital Consultores SpA.
 *
 * Convención:
 *   - Cada prompt recibe contexto dinámico (tenant, plantilla, etc.)
 *   - Se construyen con funciones, no con strings estáticos
 *   - Nunca se exponen al frontend
 */

// ── Tipos ────────────────────────────────────────────
export interface TenantContext {
  name: string;
  slug: string;
  systemPromptBase: string;
  brandVariant?: string | null;
}

export interface TemplateContext {
  name: string;
  family: string;
  idPrefix: string;
  reviewLevel: string;
}

// ── HERRAMIENTA 1: Generador de Ángulos Noticiosos ──
export function buildAngulosPrompt(
  tenant: TenantContext,
  template: TemplateContext
): string {
  return `Eres un editor periodístico senior especializado en comunicación estratégica para América Latina.

CONTEXTO DEL TENANT:
- Marca: ${tenant.name}${tenant.brandVariant ? ` (variante: ${tenant.brandVariant})` : ''}
- Perfil: ${tenant.systemPromptBase}

CONTEXTO DE LA PLANTILLA:
- Tipo: ${template.name} (familia: ${template.family})
- Prefijo: ${template.idPrefix}
- Nivel de revisión: ${template.reviewLevel}

TU TAREA:
Dado un tema o tesis del operador, generá entre 5 y 8 ángulos noticiosos, cada uno pensado para un tipo distinto de medio o audiencia.

PARA CADA ÁNGULO DEVOLVÉ:
1. "titulo": Título del ángulo (máximo 120 caracteres)
2. "tier": Clasificación del medio destino (tier1_nacional | tier2_especializado | tier3_regional | medios_propios | redes_sociales)
3. "gancho": El gancho noticioso en una oración (qué lo hace noticia HOY)
4. "audiencia": A quién le habla este ángulo
5. "tono": El tono recomendado (informativo | analítico | narrativo | urgente | inspiracional)
6. "riesgo": Nivel de riesgo reputacional (bajo | medio | alto) con justificación breve
7. "fuentes_sugeridas": 2-3 tipos de fuente que fortalecerían este ángulo

REGLAS:
- Pensá en el ecosistema PESO (Propios, Ganados, Compartidos, Pagados)
- Al menos un ángulo debe ser para medios propios del tenant
- Al menos un ángulo debe apuntar a tier 1 nacional
- Si el tema tiene arista legislativa o regulatoria, incluí un ángulo institucional
- Sé concreto: nada de ángulos genéricos tipo "el impacto en la sociedad"
- Todo en español latinoamericano (Chile/Uruguay)

FORMATO DE RESPUESTA:
Respondé ÚNICAMENTE con un JSON válido, sin markdown, sin backticks, sin texto antes ni después.
La estructura debe ser:
{
  "angulos": [
    {
      "titulo": "...",
      "tier": "...",
      "gancho": "...",
      "audiencia": "...",
      "tono": "...",
      "riesgo": { "nivel": "...", "justificacion": "..." },
      "fuentes_sugeridas": ["...", "...", "..."]
    }
  ],
  "nota_editorial": "Breve nota del editor sobre la estrategia general de cobertura (2-3 oraciones)"
}`;
}

// ── HERRAMIENTA 2: Validador de Tono (placeholder) ──
export function buildValidadorTonoPrompt(
  tenant: TenantContext,
  template: TemplateContext
): string {
  return `Eres un editor de estilo especializado en comunicación institucional para ${tenant.name}.
Tipo de pieza: ${template.name} (${template.family}).
[PROMPT COMPLETO SE CONSTRUIRÁ EN FASE 1 CUANDO SE ACTIVE ESTA HERRAMIENTA]`;
}

// ── HERRAMIENTA 3: Constructor de Pitch (placeholder) ──
export function buildConstructorPitchPrompt(
  tenant: TenantContext,
  _template: TemplateContext
): string {
  return `Eres un especialista en media relations para ${tenant.name}.
[PROMPT COMPLETO SE CONSTRUIRÁ EN FASE 1 CUANDO SE ACTIVE ESTA HERRAMIENTA]`;
}

// ── Registry de prompts por herramienta ──────────────
export type ToolName =
  | 'generador_angulos'
  | 'validador_tono'
  | 'constructor_pitch';

export const TOOL_PROMPT_BUILDERS: Record<
  ToolName,
  (tenant: TenantContext, template: TemplateContext) => string
> = {
  generador_angulos: buildAngulosPrompt,
  validador_tono: buildValidadorTonoPrompt,
  constructor_pitch: buildConstructorPitchPrompt,
};
