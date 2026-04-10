/**
 * IP+MP Platform — Capa de abstracción de modelo IA
 *
 * El código NUNCA llama directo a Anthropic. Llama a estas funciones,
 * que hoy usan Claude pero mañana pueden usar otro proveedor.
 *
 * Principios:
 *   - Una sola función `generate()` para todo
 *   - Retorna siempre { text, usage } normalizado
 *   - Loguea consumo automáticamente si se pasa tenantId
 *   - Maneja errores con mensajes claros
 */

import Anthropic from '@anthropic-ai/sdk';

// ── Tipos ────────────────────────────────────────────
export interface GenerateOptions {
  /** Prompt del sistema (instrucciones de rol) */
  system: string;
  /** Mensaje del usuario */
  userMessage: string;
  /** Modelo a usar. Default: claude-sonnet-4-20250514 */
  model?: string;
  /** Máximo de tokens de respuesta */
  maxTokens?: number;
  /** Temperatura (0-1). Default: 0.7 */
  temperature?: number;
}

export interface GenerateResult {
  /** Texto de respuesta */
  text: string;
  /** Modelo usado */
  model: string;
  /** Tokens consumidos */
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  /** Duración en ms */
  durationMs: number;
}

// ── Cliente singleton ────────────────────────────────
let _client: Anthropic | undefined;

function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY no está configurada. ' +
        'Agregala en Vercel → Settings → Environment Variables.'
      );
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

// ── Modelo default ───────────────────────────────────
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0.7;

// ── Función principal ────────────────────────────────
export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  const {
    system,
    userMessage,
    model = DEFAULT_MODEL,
    maxTokens = DEFAULT_MAX_TOKENS,
    temperature = DEFAULT_TEMPERATURE,
  } = options;

  const client = getClient();
  const start = Date.now();

  try {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: 'user', content: userMessage }],
    });

    // Extraer texto de los content blocks
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    return {
      text,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      durationMs: Date.now() - start,
    };
  } catch (error) {
    // Re-throw con contexto útil
    if (error instanceof Anthropic.APIError) {
      throw new Error(
        `Error de API Anthropic (${error.status}): ${error.message}`
      );
    }
    throw error;
  }
}

// ── Costo estimado (USD) ─────────────────────────────
// Precios Sonnet 4: input $3/MTok, output $15/MTok
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4 },
};

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const prices = PRICING[model] ?? PRICING['claude-sonnet-4-20250514'];
  return (inputTokens * prices.input + outputTokens * prices.output) / 1_000_000;
}
