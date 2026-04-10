'use client';

/**
 * IP+MP Platform — Generador de Ángulos (componente interactivo)
 *
 * Formulario que envía tema + tenant + template al endpoint
 * /api/ai/generate y muestra los ángulos generados.
 */

import { useState } from 'react';

// ── Tipos ────────────────────────────────────────────
interface Tenant {
  slug: string;
  name: string;
}

interface Template {
  slug: string;
  name: string;
  family: string;
  idPrefix: string;
}

interface Angulo {
  titulo: string;
  tier: string;
  gancho: string;
  audiencia: string;
  tono: string;
  riesgo: { nivel: string; justificacion: string };
  fuentes_sugeridas: string[];
}

interface AngulosResult {
  angulos: Angulo[];
  nota_editorial: string;
}

interface ApiResponse {
  success: boolean;
  result: AngulosResult;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  durationMs: number;
}

// ── Helpers ──────────────────────────────────────────
const TIER_LABELS: Record<string, string> = {
  tier1_nacional: 'Tier 1 — Nacional',
  tier2_especializado: 'Tier 2 — Especializado',
  tier3_regional: 'Tier 3 — Regional',
  medios_propios: 'Medios Propios',
  redes_sociales: 'Redes Sociales',
};

const TIER_COLORS: Record<string, string> = {
  tier1_nacional: 'bg-amber-brand/20 text-amber-brand border-amber-brand/40',
  tier2_especializado: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  tier3_regional: 'bg-green-500/20 text-green-300 border-green-500/40',
  medios_propios: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  redes_sociales: 'bg-pink-500/20 text-pink-300 border-pink-500/40',
};

const RIESGO_COLORS: Record<string, string> = {
  bajo: 'text-green-400',
  medio: 'text-amber-brand',
  alto: 'text-red-400',
};

const FAMILY_LABELS: Record<string, string> = {
  prensa: 'Prensa',
  opinion: 'Opinión',
  institucional: 'Institucional',
  academico: 'Académico',
};

// ── Componente ───────────────────────────────────────
export default function AngulosClient({
  tenants,
  templates,
}: {
  tenants: Tenant[];
  templates: Template[];
}) {
  const [tenantSlug, setTenantSlug] = useState(tenants[0]?.slug ?? '');
  const [templateSlug, setTemplateSlug] = useState(templates[0]?.slug ?? '');
  const [userMessage, setUserMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!userMessage.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug,
          templateSlug,
          tool: 'generador_angulos',
          userMessage: userMessage.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Error desconocido');
        return;
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  // Agrupar templates por familia
  const templatesByFamily = templates.reduce<Record<string, Template[]>>((acc, t) => {
    if (!acc[t.family]) acc[t.family] = [];
    acc[t.family].push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      {/* ── FORMULARIO ─────────────────────────────── */}
      <div className="bg-space-cadet rounded-lg p-6 border border-davy-gray/30 space-y-5">
        {/* Selectores */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-mono text-davy-gray uppercase tracking-wider mb-2">
              Tenant
            </label>
            <select
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
              className="w-full bg-oxford-blue border border-davy-gray/50 rounded px-3 py-2.5 text-seasalt text-sm focus:outline-none focus:border-amber-brand transition-colors"
            >
              {tenants.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-mono text-davy-gray uppercase tracking-wider mb-2">
              Plantilla
            </label>
            <select
              value={templateSlug}
              onChange={(e) => setTemplateSlug(e.target.value)}
              className="w-full bg-oxford-blue border border-davy-gray/50 rounded px-3 py-2.5 text-seasalt text-sm focus:outline-none focus:border-amber-brand transition-colors"
            >
              {Object.entries(templatesByFamily).map(([family, tmpls]) => (
                <optgroup key={family} label={FAMILY_LABELS[family] ?? family}>
                  {tmpls.map((t) => (
                    <option key={t.slug} value={t.slug}>
                      [{t.idPrefix}] {t.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        {/* Textarea */}
        <div>
          <label className="block text-xs font-mono text-davy-gray uppercase tracking-wider mb-2">
            Tema o tesis
          </label>
          <textarea
            value={userMessage}
            onChange={(e) => setUserMessage(e.target.value)}
            placeholder="Ej: Impacto de la inteligencia artificial en el control prenatal en Chile: oportunidades, riesgos y brechas de acceso en el sistema público de salud"
            rows={3}
            maxLength={10000}
            className="w-full bg-oxford-blue border border-davy-gray/50 rounded px-3 py-2.5 text-seasalt text-sm placeholder:text-davy-gray/50 focus:outline-none focus:border-amber-brand transition-colors resize-y"
          />
          <p className="text-davy-gray text-xs mt-1 text-right">
            {userMessage.length} / 10.000
          </p>
        </div>

        {/* Botón */}
        <button
          onClick={handleSubmit}
          disabled={loading || !userMessage.trim()}
          className={`w-full py-3 rounded font-bold text-sm transition-all ${
            loading || !userMessage.trim()
              ? 'bg-davy-gray/30 text-davy-gray cursor-not-allowed'
              : 'bg-amber-brand text-oxford-blue hover:bg-amber-brand/90 active:scale-[0.99]'
          }`}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin inline-block w-4 h-4 border-2 border-oxford-blue/30 border-t-oxford-blue rounded-full" />
              Generando ángulos...
            </span>
          ) : (
            'Generar Ángulos Noticiosos'
          )}
        </button>

        {/* Error */}
        {error && (
          <div className="bg-red-900/20 border border-red-700 rounded p-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}
      </div>

      {/* ── RESULTADOS ─────────────────────────────── */}
      {result && result.result && (
        <div className="space-y-6">
          {/* Meta */}
          <div className="flex items-center justify-between text-xs text-davy-gray font-mono">
            <span>
              {result.result.angulos?.length ?? 0} ángulos generados
            </span>
            <span>
              {result.usage.inputTokens + result.usage.outputTokens} tokens ·{' '}
              {(result.durationMs / 1000).toFixed(1)}s · {result.model}
            </span>
          </div>

          {/* Ángulos */}
          <div className="space-y-4">
            {result.result.angulos?.map((angulo, i) => (
              <div
                key={i}
                className="bg-space-cadet rounded-lg border border-davy-gray/30 overflow-hidden"
              >
                {/* Header del ángulo */}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <h3 className="text-seasalt font-bold text-base leading-snug flex-1">
                      {angulo.titulo}
                    </h3>
                    <span className="text-xs font-mono text-davy-gray shrink-0">
                      #{i + 1}
                    </span>
                  </div>

                  <p className="text-seasalt/80 text-sm mb-4 leading-relaxed">
                    {angulo.gancho}
                  </p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    <span
                      className={`text-xs px-2 py-1 rounded border ${
                        TIER_COLORS[angulo.tier] ?? 'bg-white/10 text-davy-gray border-davy-gray/30'
                      }`}
                    >
                      {TIER_LABELS[angulo.tier] ?? angulo.tier}
                    </span>
                    <span className="text-xs px-2 py-1 rounded bg-white/5 text-davy-gray border border-davy-gray/20">
                      {angulo.tono}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded bg-white/5 border border-davy-gray/20 ${RIESGO_COLORS[angulo.riesgo.nivel] ?? 'text-davy-gray'}`}>
                      Riesgo: {angulo.riesgo.nivel}
                    </span>
                  </div>

                  {/* Detalles */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-davy-gray text-xs font-mono uppercase tracking-wider mb-1">
                        Audiencia
                      </p>
                      <p className="text-seasalt/70">{angulo.audiencia}</p>
                    </div>
                    <div>
                      <p className="text-davy-gray text-xs font-mono uppercase tracking-wider mb-1">
                        Fuentes sugeridas
                      </p>
                      <ul className="text-seasalt/70 space-y-0.5">
                        {angulo.fuentes_sugeridas.map((f, j) => (
                          <li key={j} className="flex items-baseline gap-1.5">
                            <span className="text-amber-brand text-xs">▸</span>
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Justificación de riesgo */}
                  {angulo.riesgo.justificacion && (
                    <div className="mt-3 pt-3 border-t border-davy-gray/20">
                      <p className="text-xs text-davy-gray">
                        <span className="font-mono uppercase tracking-wider">Riesgo:</span>{' '}
                        <span className="text-seasalt/60">{angulo.riesgo.justificacion}</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Nota editorial */}
          {result.result.nota_editorial && (
            <div className="bg-amber-brand/5 border border-amber-brand/20 rounded-lg p-5">
              <p className="text-xs font-mono text-amber-brand uppercase tracking-wider mb-2">
                Nota Editorial
              </p>
              <p className="text-seasalt/80 text-sm leading-relaxed">
                {result.result.nota_editorial}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
