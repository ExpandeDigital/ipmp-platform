/**
 * IP+MP Platform — Tracker de consumo de IA
 *
 * Registra cada llamada a la API en la tabla consumption_logs.
 * Permite monitorear gasto por tenant y por herramienta.
 */

import { db } from '@/db';
import { consumptionLogs } from '@/db/schema';
import { estimateCostUsd } from './provider';

export interface UsageEntry {
  tenantId: string;
  projectId?: string | null;
  model: string;
  tool: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Registra consumo de IA en la base de datos.
 * No lanza error si falla — el logging no debe romper el flujo principal.
 */
export async function trackUsage(entry: UsageEntry): Promise<void> {
  try {
    const costUsd = estimateCostUsd(entry.model, entry.inputTokens, entry.outputTokens);

    await db.insert(consumptionLogs).values({
      tenantId: entry.tenantId,
      projectId: entry.projectId ?? null,
      model: entry.model,
      tool: entry.tool,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      costUsd: costUsd.toFixed(6),
    });
  } catch (error) {
    // Log silencioso — no romper el flujo por un error de tracking
    console.error('[usage-tracker] Error registrando consumo:', error);
  }
}
