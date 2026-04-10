/**
 * IP+MP Platform — Vista Detalle de Project (Client Component)
 *
 * Muestra:
 *   - Info del project (publicId, título, tesis, tenant, template)
 *   - Pipeline visual interactivo con 8 fases
 *   - Botones avanzar/retroceder estado
 *   - Generador de Ángulos integrado (usa tenant+template del project)
 *   - Ángulos guardados en el campo `data` del project
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

// ── Tipos ────────────────────────────────────────────
interface ProjectDetail {
  id: string;
  publicId: string;
  title: string;
  status: string;
  thesis: string | null;
  classification: string;
  brandVariant: string | null;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  tenantSlug: string;
  tenantName: string;
  templateSlug: string;
  templateName: string;
  templateFamily: string;
  templatePrefix: string;
  templateReviewLevel: string;
  pipelineIndex: number;
  pipelineTotal: number;
  pipelinePhases: string[];
}

interface Angulo {
  numero: number;
  tier: string;
  titulo: string;
  gancho: string;
  audiencia: string;
  tono: string;
  riesgo: string;
  fuentes: string[];
}

interface AngulosData {
  angulos: Angulo[];
  notaEditorial: string;
  tema: string;
  generadoEn: string;
}

// ── Labels legibles para las fases ───────────────────
const PHASE_LABELS: Record<string, string> = {
  draft: 'Borrador',
  validacion: 'Validación',
  pesquisa: 'Pesquisa',
  produccion: 'Producción',
  visual: 'Visual',
  revision: 'Revisión',
  aprobado: 'Aprobado',
  exportado: 'Exportado',
};

const PHASE_ICONS: Record<string, string> = {
  draft: '📝',
  validacion: '✅',
  pesquisa: '🔍',
  produccion: '⚙️',
  visual: '🎨',
  revision: '👁️',
  aprobado: '✓',
  exportado: '📤',
};

// ── Colores por tier de ángulo ───────────────────────
const TIER_COLORS: Record<string, string> = {
  S: 'bg-amber-brand/20 text-amber-brand border-amber-brand/40',
  A: 'bg-green-500/20 text-green-400 border-green-500/40',
  B: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
  C: 'bg-davy-gray/20 text-davy-gray border-davy-gray/40',
};

// ══════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════
export default function ProjectDetailClient({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pipeline action state
  const [actionLoading, setActionLoading] = useState(false);

  // Ángulos generator state
  const [tema, setTema] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // ── Cargar project ──
  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error cargando project');
      setProject(json.project);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  // ── Avanzar/retroceder pipeline ──
  async function handlePipelineAction(action: 'advance' | 'retreat') {
    if (!project || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      // Recargar project completo para actualizar toda la UI
      await fetchProject();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al cambiar estado');
    } finally {
      setActionLoading(false);
    }
  }

  // ── Generar ángulos ──
  async function handleGenerateAngulos() {
    if (!project || !tema.trim()) return;
    setGenerating(true);
    setGenError(null);

    try {
      // 1. Llamar al endpoint de IA
      const genRes = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: project.tenantSlug,
          templateSlug: project.templateSlug,
          tool: 'generador_angulos',
          userMessage: tema.trim(),
        }),
      });
      const genJson = await genRes.json();
      if (!genRes.ok) throw new Error(genJson.error || 'Error generando ángulos');

      // 2. Guardar resultado en el project
      const angulosPayload: AngulosData = {
        angulos: genJson.result?.angulos ?? genJson.angulos ?? [],
        notaEditorial: genJson.result?.notaEditorial ?? genJson.notaEditorial ?? '',
        tema: tema.trim(),
        generadoEn: new Date().toISOString(),
      };

      const patchRes = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { angulos: angulosPayload } }),
      });
      const patchJson = await patchRes.json();
      if (!patchRes.ok) throw new Error(patchJson.error || 'Error guardando ángulos');

      // 3. Recargar project
      await fetchProject();
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setGenerating(false);
    }
  }

  // ── Loading / Error states ──
  if (loading) {
    return (
      <main className="min-h-screen bg-oxford-blue p-8">
        <div className="max-w-5xl mx-auto text-center py-20">
          <div className="animate-pulse text-amber-brand text-lg">Cargando project…</div>
        </div>
      </main>
    );
  }

  if (error || !project) {
    return (
      <main className="min-h-screen bg-oxford-blue p-8">
        <div className="max-w-5xl mx-auto text-center py-20">
          <p className="text-red-400 text-lg mb-4">{error || 'Project no encontrado'}</p>
          <Link href="/projects" className="text-amber-brand hover:underline">
            ← Volver a Projects
          </Link>
        </div>
      </main>
    );
  }

  // ── Datos de ángulos guardados ──
  const savedAngulos = project.data?.angulos as AngulosData | undefined;

  return (
    <main className="min-h-screen bg-oxford-blue p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <Link
              href="/projects"
              className="text-davy-gray hover:text-seasalt text-sm mb-2 inline-block"
            >
              ← Volver a Projects
            </Link>
            <h1 className="text-2xl font-bold text-seasalt">{project.title}</h1>
            <p className="font-mono text-amber-brand text-sm mt-1">{project.publicId}</p>
          </div>
          <span className="bg-space-cadet border border-davy-gray/30 rounded px-3 py-1 text-xs font-mono text-davy-gray">
            {project.classification}
          </span>
        </div>

        {/* ── Pipeline Visual ── */}
        <section className="bg-space-cadet rounded-lg border border-davy-gray/20 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-seasalt font-semibold">Pipeline</h2>
            <div className="flex gap-2">
              <button
                onClick={() => handlePipelineAction('retreat')}
                disabled={actionLoading || project.pipelineIndex === 0}
                className="px-3 py-1 text-sm rounded border border-davy-gray/30 text-davy-gray
                           hover:text-seasalt hover:border-seasalt/50 transition-colors
                           disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ← Retroceder
              </button>
              <button
                onClick={() => handlePipelineAction('advance')}
                disabled={actionLoading || project.pipelineIndex >= project.pipelineTotal - 1}
                className="px-3 py-1 text-sm rounded bg-amber-brand/20 border border-amber-brand/40
                           text-amber-brand hover:bg-amber-brand/30 transition-colors
                           disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Avanzar →
              </button>
            </div>
          </div>

          {/* Barra de pipeline */}
          <div className="flex gap-1">
            {project.pipelinePhases.map((phase, idx) => {
              const isCurrent = idx === project.pipelineIndex;
              const isPast = idx < project.pipelineIndex;
              const isFuture = idx > project.pipelineIndex;

              return (
                <div
                  key={phase}
                  className={`flex-1 rounded-md py-3 px-2 text-center text-xs font-medium transition-all
                    ${isCurrent ? 'bg-amber-brand text-oxford-blue ring-2 ring-amber-brand/50 scale-[1.02]' : ''}
                    ${isPast ? 'bg-amber-brand/20 text-amber-brand/80' : ''}
                    ${isFuture ? 'bg-davy-gray/10 text-davy-gray/50' : ''}
                  `}
                >
                  <div className="text-base mb-1">{PHASE_ICONS[phase] ?? '○'}</div>
                  {PHASE_LABELS[phase] ?? phase}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Info del Project ── */}
        <section className="bg-space-cadet rounded-lg border border-davy-gray/20 p-6">
          <h2 className="text-seasalt font-semibold mb-4">Información</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-davy-gray">Tenant:</span>
              <span className="text-seasalt ml-2">{project.tenantName}</span>
            </div>
            <div>
              <span className="text-davy-gray">Template:</span>
              <span className="text-seasalt ml-2">{project.templateName}</span>
            </div>
            <div>
              <span className="text-davy-gray">Familia:</span>
              <span className="text-seasalt ml-2 capitalize">{project.templateFamily}</span>
            </div>
            <div>
              <span className="text-davy-gray">Revisión:</span>
              <span className="text-seasalt ml-2 capitalize">{project.templateReviewLevel}</span>
            </div>
            {project.brandVariant && (
              <div>
                <span className="text-davy-gray">Brand variant:</span>
                <span className="text-seasalt ml-2">{project.brandVariant}</span>
              </div>
            )}
            <div>
              <span className="text-davy-gray">Creado:</span>
              <span className="text-seasalt ml-2">
                {new Date(project.createdAt).toLocaleDateString('es-CL', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
          {project.thesis && (
            <div className="mt-4 pt-4 border-t border-davy-gray/20">
              <span className="text-davy-gray text-sm">Tesis:</span>
              <p className="text-seasalt mt-1">{project.thesis}</p>
            </div>
          )}
        </section>

        {/* ── Generador de Ángulos ── */}
        <section className="bg-space-cadet rounded-lg border border-davy-gray/20 p-6">
          <h2 className="text-seasalt font-semibold mb-1">Generador de Ángulos</h2>
          <p className="text-davy-gray text-sm mb-4">
            Genera ángulos periodísticos usando{' '}
            <span className="text-seasalt">{project.tenantName}</span> +{' '}
            <span className="text-seasalt">{project.templateName}</span> automáticamente.
          </p>

          <div className="flex gap-3">
            <input
              type="text"
              value={tema}
              onChange={(e) => setTema(e.target.value)}
              placeholder="Escribí el tema o pregunta a investigar…"
              className="flex-1 bg-oxford-blue border border-davy-gray/30 rounded px-4 py-2
                         text-seasalt placeholder:text-davy-gray/50 focus:outline-none
                         focus:border-amber-brand/50 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tema.trim() && !generating) handleGenerateAngulos();
              }}
            />
            <button
              onClick={handleGenerateAngulos}
              disabled={!tema.trim() || generating}
              className="px-5 py-2 bg-amber-brand text-oxford-blue rounded font-medium text-sm
                         hover:bg-amber-brand/90 transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {generating ? 'Generando…' : '⚡ Generar Ángulos'}
            </button>
          </div>

          {genError && (
            <p className="text-red-400 text-sm mt-3">{genError}</p>
          )}
        </section>

        {/* ── Ángulos Guardados ── */}
        {savedAngulos && savedAngulos.angulos && savedAngulos.angulos.length > 0 && (
          <section className="bg-space-cadet rounded-lg border border-davy-gray/20 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-seasalt font-semibold">
                Ángulos Generados ({savedAngulos.angulos.length})
              </h2>
              <div className="text-right">
                <p className="text-davy-gray text-xs">
                  Tema: <span className="text-seasalt">{savedAngulos.tema}</span>
                </p>
                <p className="text-davy-gray text-xs">
                  {new Date(savedAngulos.generadoEn).toLocaleDateString('es-CL', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {savedAngulos.angulos.map((angulo, idx) => (
                <div
                  key={idx}
                  className="bg-oxford-blue rounded-lg border border-davy-gray/15 p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold border ${
                          TIER_COLORS[angulo.tier] ?? TIER_COLORS.C
                        }`}
                      >
                        Tier {angulo.tier}
                      </span>
                      <h3 className="text-seasalt font-medium text-sm">
                        {angulo.numero}. {angulo.titulo}
                      </h3>
                    </div>
                  </div>
                  <p className="text-davy-gray text-sm mb-2">
                    <span className="text-amber-brand/80">Gancho:</span> {angulo.gancho}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-davy-gray">
                    <span>
                      👥 <span className="text-seasalt/70">{angulo.audiencia}</span>
                    </span>
                    <span>
                      🎭 <span className="text-seasalt/70">{angulo.tono}</span>
                    </span>
                    <span>
                      ⚠️ <span className="text-seasalt/70">{angulo.riesgo}</span>
                    </span>
                  </div>
                  {angulo.fuentes && angulo.fuentes.length > 0 && (
                    <div className="mt-2 text-xs text-davy-gray">
                      📚 Fuentes: {angulo.fuentes.join(' · ')}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {savedAngulos.notaEditorial && (
              <div className="mt-4 pt-4 border-t border-davy-gray/20">
                <p className="text-davy-gray text-xs uppercase tracking-wider mb-1">
                  Nota Editorial
                </p>
                <p className="text-seasalt/80 text-sm">{savedAngulos.notaEditorial}</p>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
