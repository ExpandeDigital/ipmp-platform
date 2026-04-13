'use client';

import { useState, useEffect, useCallback } from 'react';

// ── Tipos ──
interface ConsumoRow {
  mes: string;
  tenantId: string;
  toolName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

interface ConsumoSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalEstimatedCost: number;
  rowCount: number;
}

interface ConsumoResponse {
  ok: boolean;
  filters: { tenantId: string | null; year: number; month: number | null };
  summary: ConsumoSummary;
  rows: ConsumoRow[];
  error?: string;
}

interface TenantOption {
  id: string;
  slug: string;
  name: string;
}

interface ConsumoClientProps {
  tenantsDisponibles: TenantOption[];
  adminToken: string;
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export default function ConsumoClient({ tenantsDisponibles, adminToken }: ConsumoClientProps) {
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(0);
  const [data, setData] = useState<ConsumoResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mapa tenantId → name para mostrar en la tabla
  const tenantNameMap = new Map(tenantsDisponibles.map((t) => [t.id, t.name]));

  const fetchConsumo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('token', adminToken);
      params.set('year', String(selectedYear));
      if (selectedTenantId) params.set('tenantId', selectedTenantId);
      if (selectedMonth > 0) params.set('month', String(selectedMonth));

      const res = await fetch(`/api/admin/consumo?${params.toString()}`);
      const json = await res.json();

      if (!res.ok || !json.ok) {
        setError(json.error || 'Error al consultar consumo');
        setData(null);
        return;
      }

      setData(json as ConsumoResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [adminToken, selectedYear, selectedTenantId, selectedMonth]);

  // Fetch inicial al montar
  useEffect(() => {
    fetchConsumo();
  }, [fetchConsumo]);

  return (
    <div className="space-y-6">
      {/* ── Filtros ── */}
      <div className="flex gap-3 flex-wrap items-end">
        <div>
          <label className="block text-xs text-davy-gray mb-1">Tenant</label>
          <select
            value={selectedTenantId}
            onChange={(e) => setSelectedTenantId(e.target.value)}
            className="bg-space-cadet border border-davy-gray/30 text-seasalt text-sm rounded px-3 py-2"
          >
            <option value="">Todos los tenants</option>
            {tenantsDisponibles.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-davy-gray mb-1">Ano</label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="bg-space-cadet border border-davy-gray/30 text-seasalt text-sm rounded px-3 py-2"
          >
            {[2026, 2027].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-davy-gray mb-1">Mes</label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="bg-space-cadet border border-davy-gray/30 text-seasalt text-sm rounded px-3 py-2"
          >
            <option value={0}>Todos los meses</option>
            {MESES.map((m, i) => (
              <option key={i + 1} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={fetchConsumo}
          disabled={loading}
          className="px-4 py-2 bg-amber-brand text-oxford-blue font-semibold text-sm rounded
                     hover:bg-amber-brand/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Cargando...' : 'Consultar'}
        </button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/40 rounded p-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* ── Tarjetas de resumen ── */}
      {data && data.summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Tokens de entrada', value: data.summary.totalInputTokens.toLocaleString() },
            { label: 'Tokens de salida', value: data.summary.totalOutputTokens.toLocaleString() },
            { label: 'Tokens totales', value: data.summary.totalTokens.toLocaleString() },
            { label: 'Costo USD', value: `$${data.summary.totalEstimatedCost.toFixed(6)}` },
          ].map((card) => (
            <div
              key={card.label}
              className="bg-space-cadet rounded-lg border border-davy-gray/20 p-4"
            >
              <p className="text-davy-gray text-xs uppercase tracking-wider mb-1">{card.label}</p>
              <p className="text-seasalt text-xl font-semibold">{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Tabla de detalle ── */}
      {data && data.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-davy-gray/30 text-davy-gray text-xs uppercase tracking-wider">
                <th className="text-left py-3 px-3">Mes</th>
                <th className="text-left py-3 px-3">Tenant</th>
                <th className="text-left py-3 px-3">Herramienta</th>
                <th className="text-right py-3 px-3">Input</th>
                <th className="text-right py-3 px-3">Output</th>
                <th className="text-right py-3 px-3">Total</th>
                <th className="text-right py-3 px-3">Costo USD</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, idx) => (
                <tr
                  key={`${row.mes}-${row.tenantId}-${row.toolName}`}
                  className={`border-b border-davy-gray/10 ${
                    idx % 2 === 0 ? 'bg-oxford-blue/50' : ''
                  }`}
                >
                  <td className="py-2.5 px-3 text-seasalt">{row.mes}</td>
                  <td className="py-2.5 px-3 text-seasalt">
                    {tenantNameMap.get(row.tenantId) ?? row.tenantId.slice(0, 8)}
                  </td>
                  <td className="py-2.5 px-3 text-seasalt">{row.toolName}</td>
                  <td className="py-2.5 px-3 text-right text-seasalt">
                    {row.inputTokens.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 text-right text-seasalt">
                    {row.outputTokens.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 text-right text-amber-brand font-medium">
                    {row.totalTokens.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 text-right text-seasalt">
                    ${row.estimatedCost.toFixed(6)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Estado vacio ── */}
      {data && data.rows.length === 0 && !loading && (
        <div className="text-center py-12">
          <p className="text-davy-gray">
            No hay registros de consumo para los filtros seleccionados.
          </p>
        </div>
      )}
    </div>
  );
}
