/**
 * IP+MP Platform — Dashboard de consumo IA (Chunk 21A)
 *
 * GET /api/admin/consumo?token=ADMIN_TOKEN&tenantId=...&year=2026&month=4
 *
 * Devuelve consumo de tokens y costo estimado agrupado por
 * tenantId + toolName + mes calendar, leido de consumption_logs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { consumptionLogs } from '@/db/schema';
import { sql, eq, and } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // ── Auth (mismo patron que /api/admin/init) ──
  const token = request.nextUrl.searchParams.get('token');
  const expected = process.env.ADMIN_TOKEN;

  if (!expected) {
    return NextResponse.json(
      { ok: false, error: 'ADMIN_TOKEN no configurado en el servidor' },
      { status: 500 }
    );
  }

  if (!token || token !== expected) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // ── Query params ──
  const tenantIdParam = request.nextUrl.searchParams.get('tenantId') ?? null;
  const yearParam = request.nextUrl.searchParams.get('year');
  const monthParam = request.nextUrl.searchParams.get('month');

  const year = yearParam ? parseInt(yearParam, 10) : new Date().getUTCFullYear();
  if (isNaN(year) || year < 2020 || year > 2100) {
    return NextResponse.json(
      { ok: false, error: 'year debe ser un numero entre 2020 y 2100' },
      { status: 400 }
    );
  }

  let month: number | null = null;
  if (monthParam) {
    month = parseInt(monthParam, 10);
    if (isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json(
        { ok: false, error: 'month debe ser un numero entre 1 y 12' },
        { status: 400 }
      );
    }
  }

  try {
    // ── Construir condiciones WHERE ──
    const conditions = [];

    // Filtro por año (siempre presente)
    if (month) {
      // Mes especifico
      const startDate = new Date(Date.UTC(year, month - 1, 1));
      const endDate = new Date(Date.UTC(year, month, 1));
      conditions.push(
        sql`${consumptionLogs.createdAt} >= ${startDate.toISOString()}`,
        sql`${consumptionLogs.createdAt} < ${endDate.toISOString()}`,
      );
    } else {
      // Año completo
      const startDate = new Date(Date.UTC(year, 0, 1));
      const endDate = new Date(Date.UTC(year + 1, 0, 1));
      conditions.push(
        sql`${consumptionLogs.createdAt} >= ${startDate.toISOString()}`,
        sql`${consumptionLogs.createdAt} < ${endDate.toISOString()}`,
      );
    }

    if (tenantIdParam) {
      conditions.push(eq(consumptionLogs.tenantId, tenantIdParam));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // ── Query con GROUP BY ──
    const mes = sql<string>`to_char(date_trunc('month', ${consumptionLogs.createdAt}), 'YYYY-MM')`.as('mes');
    const sumInput = sql<number>`COALESCE(SUM(${consumptionLogs.inputTokens}), 0)`.as('input_tokens');
    const sumOutput = sql<number>`COALESCE(SUM(${consumptionLogs.outputTokens}), 0)`.as('output_tokens');
    const sumCost = sql<number>`COALESCE(SUM(${consumptionLogs.costUsd}::numeric), 0)`.as('cost_usd');

    const rows = await db
      .select({
        mes,
        tenantId: consumptionLogs.tenantId,
        toolName: consumptionLogs.tool,
        inputTokens: sumInput,
        outputTokens: sumOutput,
        costUsd: sumCost,
      })
      .from(consumptionLogs)
      .where(whereClause)
      .groupBy(mes, consumptionLogs.tenantId, consumptionLogs.tool)
      .orderBy(
        sql`mes DESC`,
        sql`${consumptionLogs.tenantId} ASC`,
        sql`${consumptionLogs.tool} ASC`,
      );

    // ── Formatear respuesta ──
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalEstimatedCost = 0;

    const formattedRows = rows.map((r) => {
      const input = Number(r.inputTokens) || 0;
      const output = Number(r.outputTokens) || 0;
      const cost = Number(r.costUsd) || 0;

      totalInputTokens += input;
      totalOutputTokens += output;
      totalEstimatedCost += cost;

      return {
        mes: r.mes,
        tenantId: r.tenantId,
        toolName: r.toolName ?? '(sin tool)',
        inputTokens: input,
        outputTokens: output,
        totalTokens: input + output,
        estimatedCost: parseFloat(cost.toFixed(6)),
      };
    });

    return NextResponse.json({
      ok: true,
      filters: {
        tenantId: tenantIdParam,
        year,
        month,
      },
      summary: {
        totalInputTokens,
        totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens,
        totalEstimatedCost: parseFloat(totalEstimatedCost.toFixed(6)),
        rowCount: formattedRows.length,
      },
      rows: formattedRows,
    });
  } catch (error) {
    console.error('[GET /api/admin/consumo] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
