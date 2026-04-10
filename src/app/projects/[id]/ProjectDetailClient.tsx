'use client';

/**
 * IP+MP Platform — Vista Detalle de Project (Client Component)
 *
 * REFACTORIZACIÓN 5d (Abril 2026):
 *   - Soporta projects sin tenant/template (fase InvestigaPress)
 *   - Generador de Ángulos con 3 campos (tema, audiencia, dato clave)
 *   - Validador de Tono integrado
 *   - Constructor de Pitch integrado
 *   - Traspaso inline IP→MP al avanzar de pesquisa a produccion
 *   - Parsing de nuevos campos: tipo, verificacion, pregunta_clave, lentes
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

// ══════════════════════════════════════════════════════
// TIPOS
// ══════════════════════════════════════════════════════
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
  tenantId: string | null;
  templateId: string | null;
  tenantSlug: string | null;
  tenantName: string | null;
  templateSlug: string | null;
  templateName: string | null;
  templateFamily: string | null;
  templatePrefix: string | null;
  templateReviewLevel: string | null;
  phase: 'investigapress' | 'metricpress';
  hasTenant: boolean;
  hasTemplate: boolean;
  pipelineIndex: number;
  pipelineTotal: number;
  pipelinePhases: string[];
}

interface Angulo {
  numero: number;
  tipo: string;
  titulo: string;
  gancho: string;
  audiencia: string;
  tono: string;
  lentes: string[];
  fuentes: Array<{ cargo: string; institucion: string; pais: string } | string>;
  verificacion: string;
  pregunta_clave: string;
  riesgo: string;
}

interface AngulosData {
  angulos: Angulo[];
  notaEditorial: string;
  tema: string;
  generadoEn: string;
}

interface ValidacionDimension {
  dimension: string;
  puntuacion: number;
  hallazgos: string[];
  sugerencias: string[];
}

interface ValidacionData {
  evaluacion: ValidacionDimension[];
  puntuacion_global: number;
  veredicto: string;
  resumen: string;
  texto: string;
  generadoEn: string;
}

interface PitchData {
  pitch: Record<string, unknown>;
  texto_completo: string;
  medio_destino: string;
  notas_estrategicas: string;
  angulo_titulo: string;
  generadoEn: string;
}

interface TenantOption {
  slug: string;
  name: string;
  brandVariants: string[] | null;
}

interface TemplateOption {
  slug: string;
  name: string;
  family: string;
  idPrefix: string;
  reviewLevel: string;
}

// ══════════════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════════════
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

const IP_PHASES = ['draft', 'validacion', 'pesquisa'];

const TIPO_LABELS: Record<string, string> = {
  noticia: '📰 Noticia',
  analisis: '📊 Análisis',
  cronica: '📖 Crónica',
  investigacion: '🔬 Investigación',
};

const VERIFICACION_COLORS: Record<string, string> = {
  hipotesis: 'bg-amber-brand/20 text-amber-brand border-amber-brand/40',
  dato_referencial: 'bg-green-500/20 text-green-400 border-green-500/40',
  requiere_pesquisa: 'bg-red-500/20 text-red-400 border-red-500/40',
};

const VEREDICTO_LABELS: Record<string, { label: string; color: string }> = {
  publicable: { label: '✅ Publicable', color: 'text-green-400' },
  publicable_con_cambios: { label: '⚠️ Publicable con cambios', color: 'text-amber-brand' },
  requiere_revision: { label: '🔄 Requiere revisión', color: 'text-orange-400' },
  no_publicable: { label: '❌ No publicable', color: 'text-red-400' },
};

const FAMILY_LABELS: Record<string, string> = {
  prensa: 'Prensa',
  opinion: 'Opinión',
  institucional: 'Institucional',
  academico: 'Académico',
};

// ══════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════
export default function ProjectDetailClient({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pipeline
  const [actionLoading, setActionLoading] = useState(false);

  // Traspaso
  const [showTraspaso, setShowTraspaso] = useState(false);
  const [tenantsList, setTenantsList] = useState<TenantOption[]>([]);
  const [templatesList, setTemplatesList] = useState<TemplateOption[]>([]);
  const [traspasoTenant, setTraspasoTenant] = useState('');
  const [traspasoTemplate, setTraspasoTemplate] = useState('');
  const [traspasoBrandVariant, setTraspasoBrandVariant] = useState('');
  const [traspasoLoading, setTraspasoLoading] = useState(false);
  const [traspasoError, setTraspasoError] = useState<string | null>(null);

  // Ángulos generator
  const [angTema, setAngTema] = useState('');
  const [angAudiencia, setAngAudiencia] = useState('');
  const [angDato, setAngDato] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // Validador de Tono
  const [tonoTexto, setTonoTexto] = useState('');
  const [validando, setValidando] = useState(false);
  const [tonoError, setTonoError] = useState<string | null>(null);

  // Constructor de Pitch
  const [pitchAngulo, setPitchAngulo] = useState('');
  const [pitchMedio, setPitchMedio] = useState('');
  const [construyendo, setConstruyendo] = useState(false);
  const [pitchError, setPitchError] = useState<string | null>(null);

  // Active tool tab
  const [activeTool, setActiveTool] = useState<'angulos' | 'validador' | 'pitch'>('angulos');

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

  // ── Cargar config para traspaso ──
  async function loadConfig() {
    try {
      const res = await fetch('/api/config');
      const json = await res.json();
      if (res.ok) {
        setTenantsList(json.tenants ?? []);
        setTemplatesList(json.templates ?? []);
        if (json.tenants?.length > 0) setTraspasoTenant(json.tenants[0].slug);
        if (json.templates?.length > 0) setTraspasoTemplate(json.templates[0].slug);
      }
    } catch {
      // Silencioso — el form mostrará vacío
    }
  }

  // ── Avanzar/retroceder pipeline ──
  async function handlePipelineAction(action: 'advance' | 'retreat') {
    if (!project || actionLoading) return;

    // Traspaso check: si está en pesquisa y quiere avanzar, mostrar form
    if (action === 'advance' && project.status === 'pesquisa' && !project.hasTenant) {
      setShowTraspaso(true);
      loadConfig();
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) {
        // Si backend exige traspaso, mostrar form
        if (json.code === 'TRASPASO_REQUIRED') {
          setShowTraspaso(true);
          loadConfig();
          return;
        }
        throw new Error(json.error);
      }
      await fetchProject();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al cambiar estado');
    } finally {
      setActionLoading(false);
    }
  }

  // ── Ejecutar traspaso ──
  async function handleTraspaso() {
    if (!project || !traspasoTenant || !traspasoTemplate) return;
    setTraspasoLoading(true);
    setTraspasoError(null);

    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'advance',
          tenantSlug: traspasoTenant,
          templateSlug: traspasoTemplate,
          brandVariant: traspasoBrandVariant || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      setShowTraspaso(false);
      await fetchProject();
    } catch (err) {
      setTraspasoError(err instanceof Error ? err.message : 'Error en traspaso');
    } finally {
      setTraspasoLoading(false);
    }
  }

  // ── Generar ángulos ──
  async function handleGenerateAngulos() {
    if (!project || !angTema.trim()) return;
    setGenerating(true);
    setGenError(null);

    // Construir mensaje compuesto
    let userMessage = `TEMA: ${angTema.trim()}`;
    if (angAudiencia.trim()) userMessage += `\nAUDIENCIA OBJETIVO: ${angAudiencia.trim()}`;
    if (angDato.trim()) userMessage += `\nDATO CLAVE: ${angDato.trim()}`;
    if (project.thesis) userMessage += `\nTESIS DEL PROJECT: ${project.thesis}`;

    try {
      // Construir body según fase
      const genBody: Record<string, unknown> = {
        tool: 'generador_angulos',
        userMessage,
        projectId: project.id,
      };
      // Si tiene tenant/template (MetricPress), incluirlos
      if (project.hasTenant && project.tenantSlug && project.templateSlug) {
        genBody.tenantSlug = project.tenantSlug;
        genBody.templateSlug = project.templateSlug;
      }

      const genRes = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(genBody),
      });
      const genJson = await genRes.json();
      if (!genRes.ok) throw new Error(genJson.error || 'Error generando ángulos');

      // Guardar resultado
      const result = genJson.result ?? {};
      const angulosPayload = {
        angulos: result.angulos ?? [],
        notaEditorial: result.nota_editorial ?? '',
        tema: angTema.trim(),
        audiencia: angAudiencia.trim(),
        datoClave: angDato.trim(),
        generadoEn: new Date().toISOString(),
        modo: genJson.mode,
      };

      const patchRes = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { angulos: angulosPayload } }),
      });
      if (!patchRes.ok) {
        const pj = await patchRes.json();
        throw new Error(pj.error || 'Error guardando ángulos');
      }

      await fetchProject();
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setGenerating(false);
    }
  }

  // ── Validar tono ──
  async function handleValidarTono() {
    if (!project || !tonoTexto.trim()) return;
    setValidando(true);
    setTonoError(null);

    try {
      const genBody: Record<string, unknown> = {
        tool: 'validador_tono',
        userMessage: tonoTexto.trim(),
        projectId: project.id,
      };
      if (project.hasTenant && project.tenantSlug && project.templateSlug) {
        genBody.tenantSlug = project.tenantSlug;
        genBody.templateSlug = project.templateSlug;
      }

      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(genBody),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error validando tono');

      const result = json.result ?? {};
      const validacionPayload = {
        evaluacion: result.evaluacion ?? [],
        puntuacion_global: result.puntuacion_global ?? 0,
        veredicto: result.veredicto ?? 'requiere_revision',
        resumen: result.resumen ?? '',
        texto: tonoTexto.trim().slice(0, 200) + '…',
        generadoEn: new Date().toISOString(),
      };

      await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { validacion_tono: validacionPayload } }),
      });

      await fetchProject();
    } catch (err) {
      setTonoError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setValidando(false);
    }
  }

  // ── Construir pitch ──
  async function handleConstruirPitch() {
    if (!project || !pitchAngulo.trim()) return;
    setConstruyendo(true);
    setPitchError(null);

    let userMessage = `ÁNGULO: ${pitchAngulo.trim()}`;
    if (pitchMedio.trim()) userMessage += `\nMEDIO DESTINO: ${pitchMedio.trim()}`;
    if (project.thesis) userMessage += `\nTESIS: ${project.thesis}`;

    try {
      const genBody: Record<string, unknown> = {
        tool: 'constructor_pitch',
        userMessage,
        projectId: project.id,
      };
      if (project.hasTenant && project.tenantSlug && project.templateSlug) {
        genBody.tenantSlug = project.tenantSlug;
        genBody.templateSlug = project.templateSlug;
      }

      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(genBody),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error construyendo pitch');

      const result = json.result ?? {};
      const pitchPayload = {
        pitch: result.pitch ?? {},
        texto_completo: result.texto_completo ?? '',
        medio_destino: result.medio_destino ?? (pitchMedio.trim() || 'General'),
        notas_estrategicas: result.notas_estrategicas ?? '',
        angulo_titulo: pitchAngulo.trim(),
        generadoEn: new Date().toISOString(),
      };

      await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { pitch: pitchPayload } }),
      });

      await fetchProject();
    } catch (err) {
      setPitchError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setConstruyendo(false);
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

  // ══════════════════════════════════════════════════════
  // PARSING DEFENSIVO DE DATA
  // ══════════════════════════════════════════════════════
  const isIPPhase = IP_PHASES.includes(project.status);

  // ── Ángulos guardados ──
  let savedAngulos: AngulosData | null = null;
  try {
    const raw = project.data?.angulos as Record<string, unknown> | undefined;
    if (raw && typeof raw === 'object') {
      const rawAngulos = raw.angulos ?? [];
      const angulosList = Array.isArray(rawAngulos) ? rawAngulos : [];

      savedAngulos = {
        angulos: angulosList.map((a: Record<string, unknown>, idx: number) => ({
          numero: Number(a.numero ?? idx + 1),
          tipo: String(a.tipo ?? a.type ?? 'noticia'),
          titulo: String(a.titulo ?? a.title ?? 'Sin título'),
          gancho: String(a.gancho ?? a.hook ?? ''),
          audiencia: String(a.audiencia ?? a.audience ?? ''),
          tono: String(a.tono ?? a.tone ?? ''),
          lentes: Array.isArray(a.lentes) ? a.lentes.map(String) : [],
          fuentes: Array.isArray(a.fuentes_sugeridas)
            ? a.fuentes_sugeridas
            : Array.isArray(a.fuentes)
            ? a.fuentes
            : [],
          verificacion: String(a.verificacion ?? ''),
          pregunta_clave: String(a.pregunta_clave ?? ''),
          riesgo: typeof a.riesgo === 'object' && a.riesgo
            ? `${(a.riesgo as Record<string, unknown>).nivel ?? ''} — ${(a.riesgo as Record<string, unknown>).justificacion ?? ''}`
            : String(a.riesgo ?? ''),
        })),
        notaEditorial: String(raw.notaEditorial ?? raw.nota_editorial ?? ''),
        tema: String(raw.tema ?? ''),
        generadoEn: String(raw.generadoEn ?? ''),
      };
      if (savedAngulos.angulos.length === 0) savedAngulos = null;
    }
  } catch {
    savedAngulos = null;
  }

  // ── Validación de tono guardada ──
  let savedValidacion: ValidacionData | null = null;
  try {
    const raw = project.data?.validacion_tono as Record<string, unknown> | undefined;
    if (raw && typeof raw === 'object' && Array.isArray(raw.evaluacion)) {
      savedValidacion = {
        evaluacion: (raw.evaluacion as Record<string, unknown>[]).map((d) => ({
          dimension: String(d.dimension ?? ''),
          puntuacion: Number(d.puntuacion ?? 0),
          hallazgos: Array.isArray(d.hallazgos) ? d.hallazgos.map(String) : [],
          sugerencias: Array.isArray(d.sugerencias) ? d.sugerencias.map(String) : [],
        })),
        puntuacion_global: Number(raw.puntuacion_global ?? 0),
        veredicto: String(raw.veredicto ?? ''),
        resumen: String(raw.resumen ?? ''),
        texto: String(raw.texto ?? ''),
        generadoEn: String(raw.generadoEn ?? ''),
      };
    }
  } catch {
    savedValidacion = null;
  }

  // ── Pitch guardado ──
  let savedPitch: PitchData | null = null;
  try {
    const raw = project.data?.pitch as Record<string, unknown> | undefined;
    if (raw && typeof raw === 'object' && raw.texto_completo) {
      savedPitch = {
        pitch: (raw.pitch as Record<string, unknown>) ?? {},
        texto_completo: String(raw.texto_completo ?? ''),
        medio_destino: String(raw.medio_destino ?? ''),
        notas_estrategicas: String(raw.notas_estrategicas ?? ''),
        angulo_titulo: String(raw.angulo_titulo ?? ''),
        generadoEn: String(raw.generadoEn ?? ''),
      };
    }
  } catch {
    savedPitch = null;
  }

  // ── Tenant seleccionado para traspaso ──
  const selectedTraspasoTenant = tenantsList.find((t) => t.slug === traspasoTenant);
  const hasBrandVariants = selectedTraspasoTenant?.brandVariants && selectedTraspasoTenant.brandVariants.length > 0;

  // Agrupar templates por familia
  const templatesByFamily = templatesList.reduce<Record<string, TemplateOption[]>>((acc, t) => {
    if (!acc[t.family]) acc[t.family] = [];
    acc[t.family].push(t);
    return acc;
  }, {});

  // ══════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════
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
            <div className="flex items-center gap-3 mt-1">
              <p className="font-mono text-amber-brand text-sm">{project.publicId}</p>
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                isIPPhase
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                  : 'bg-amber-brand/20 text-amber-brand border border-amber-brand/40'
              }`}>
                {isIPPhase ? '🔍 InvestigaPress' : '⚙️ MetricPress'}
              </span>
            </div>
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
                {project.status === 'pesquisa' && !project.hasTenant
                  ? 'Traspaso → MetricPress'
                  : 'Avanzar →'}
              </button>
            </div>
          </div>

          {/* Barra de pipeline */}
          <div className="flex gap-1">
            {project.pipelinePhases.map((phase, idx) => {
              const isCurrent = idx === project.pipelineIndex;
              const isPast = idx < project.pipelineIndex;
              const isFuture = idx > project.pipelineIndex;
              const isIPBar = IP_PHASES.includes(phase);

              return (
                <div
                  key={phase}
                  className={`flex-1 rounded-md py-3 px-2 text-center text-xs font-medium transition-all
                    ${isCurrent ? 'bg-amber-brand text-oxford-blue ring-2 ring-amber-brand/50 scale-[1.02]' : ''}
                    ${isPast ? (isIPBar ? 'bg-blue-500/20 text-blue-400/80' : 'bg-amber-brand/20 text-amber-brand/80') : ''}
                    ${isFuture ? 'bg-davy-gray/10 text-davy-gray/50' : ''}
                  `}
                >
                  <div className="text-base mb-1">{PHASE_ICONS[phase] ?? '○'}</div>
                  {PHASE_LABELS[phase] ?? phase}
                </div>
              );
            })}
          </div>

          {/* Línea divisoria IP/MP */}
          <div className="flex items-center gap-2 mt-3 text-xs text-davy-gray/60">
            <div className="flex items-center gap-1">
              <span className="w-3 h-1.5 rounded bg-blue-500/40" />
              InvestigaPress
            </div>
            <span>→</span>
            <div className="flex items-center gap-1">
              <span className="w-3 h-1.5 rounded bg-amber-brand/40" />
              MetricPress
            </div>
          </div>
        </section>

        {/* ── Traspaso Form (inline) ── */}
        {showTraspaso && (
          <section className="bg-space-cadet rounded-lg border-2 border-amber-brand/50 p-6">
            <h2 className="text-amber-brand font-semibold mb-1">Traspaso: InvestigaPress → MetricPress</h2>
            <p className="text-davy-gray text-sm mb-4">
              Para avanzar a Producción, asigná la marca y el tipo de pieza.
            </p>

            <div className="space-y-4">
              {/* Tenant */}
              <div>
                <label className="block text-xs font-mono text-davy-gray uppercase tracking-wider mb-2">
                  Marca (Tenant)
                </label>
                <select
                  value={traspasoTenant}
                  onChange={(e) => { setTraspasoTenant(e.target.value); setTraspasoBrandVariant(''); }}
                  className="w-full bg-oxford-blue border border-davy-gray/50 rounded px-3 py-2.5 text-seasalt text-sm focus:outline-none focus:border-amber-brand"
                >
                  {tenantsList.map((t) => (
                    <option key={t.slug} value={t.slug}>{t.name}</option>
                  ))}
                </select>
              </div>

              {/* Brand Variant */}
              {hasBrandVariants && (
                <div>
                  <label className="block text-xs font-mono text-davy-gray uppercase tracking-wider mb-2">
                    Brand Variant <span className="text-davy-gray/50">(opcional)</span>
                  </label>
                  <select
                    value={traspasoBrandVariant}
                    onChange={(e) => setTraspasoBrandVariant(e.target.value)}
                    className="w-full bg-oxford-blue border border-davy-gray/50 rounded px-3 py-2.5 text-seasalt text-sm focus:outline-none focus:border-amber-brand"
                  >
                    <option value="">Sin variante</option>
                    {selectedTraspasoTenant?.brandVariants?.map((bv) => (
                      <option key={bv} value={bv}>{bv}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Template */}
              <div>
                <label className="block text-xs font-mono text-davy-gray uppercase tracking-wider mb-2">
                  Plantilla (tipo de pieza)
                </label>
                <select
                  value={traspasoTemplate}
                  onChange={(e) => setTraspasoTemplate(e.target.value)}
                  className="w-full bg-oxford-blue border border-davy-gray/50 rounded px-3 py-2.5 text-seasalt text-sm focus:outline-none focus:border-amber-brand"
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

              {/* Preview nuevo publicId */}
              {traspasoTenant && traspasoTemplate && (
                <div className="bg-oxford-blue rounded p-3 border border-davy-gray/20">
                  <p className="text-xs text-davy-gray mb-1">Nuevo PublicId:</p>
                  <p className="text-amber-brand font-mono">
                    {traspasoTenant.toUpperCase()}-{templatesList.find(t => t.slug === traspasoTemplate)?.idPrefix ?? '??'}-{new Date().getFullYear()}-XXXX
                  </p>
                </div>
              )}

              {/* Botones */}
              <div className="flex gap-3">
                <button
                  onClick={handleTraspaso}
                  disabled={traspasoLoading || !traspasoTenant || !traspasoTemplate}
                  className="flex-1 py-2.5 bg-amber-brand text-oxford-blue rounded font-bold text-sm
                             hover:bg-amber-brand/90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {traspasoLoading ? 'Ejecutando traspaso…' : 'Confirmar Traspaso y Avanzar →'}
                </button>
                <button
                  onClick={() => setShowTraspaso(false)}
                  className="px-4 py-2.5 border border-davy-gray/30 text-davy-gray rounded text-sm hover:text-seasalt"
                >
                  Cancelar
                </button>
              </div>

              {traspasoError && (
                <p className="text-red-400 text-sm">{traspasoError}</p>
              )}
            </div>
          </section>
        )}

        {/* ── Info del Project ── */}
        <section className="bg-space-cadet rounded-lg border border-davy-gray/20 p-6">
          <h2 className="text-seasalt font-semibold mb-4">Información</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-davy-gray">Tenant:</span>
              <span className="text-seasalt ml-2">
                {project.tenantName ?? <span className="text-davy-gray/50 italic">Sin asignar (InvestigaPress)</span>}
              </span>
            </div>
            <div>
              <span className="text-davy-gray">Template:</span>
              <span className="text-seasalt ml-2">
                {project.templateName ?? <span className="text-davy-gray/50 italic">Sin asignar</span>}
              </span>
            </div>
            {project.templateFamily && (
              <div>
                <span className="text-davy-gray">Familia:</span>
                <span className="text-seasalt ml-2 capitalize">{project.templateFamily}</span>
              </div>
            )}
            {project.templateReviewLevel && (
              <div>
                <span className="text-davy-gray">Revisión:</span>
                <span className="text-seasalt ml-2 capitalize">{project.templateReviewLevel}</span>
              </div>
            )}
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
                  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
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

        {/* ── Herramientas InvestigaPress (tabs) ── */}
        <section className="bg-space-cadet rounded-lg border border-davy-gray/20 overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-davy-gray/20">
            {[
              { key: 'angulos' as const, label: '⚡ Ángulos', icon: '' },
              { key: 'validador' as const, label: '✅ Validador de Tono', icon: '' },
              { key: 'pitch' as const, label: '📨 Constructor de Pitch', icon: '' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTool(tab.key)}
                className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                  activeTool === tab.key
                    ? 'bg-oxford-blue text-amber-brand border-b-2 border-amber-brand'
                    : 'text-davy-gray hover:text-seasalt'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-6">
            {/* ── TAB: Generador de Ángulos ── */}
            {activeTool === 'angulos' && (
              <div>
                <p className="text-davy-gray text-sm mb-4">
                  {isIPPhase
                    ? 'Genera ángulos periodísticos puros — sin sesgo de marca.'
                    : `Genera ángulos con contexto de ${project.tenantName ?? 'marca'}.`
                  }
                </p>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={angTema}
                    onChange={(e) => setAngTema(e.target.value)}
                    placeholder="Tema o pregunta a investigar…"
                    className="w-full bg-oxford-blue border border-davy-gray/30 rounded px-4 py-2
                               text-seasalt placeholder:text-davy-gray/50 focus:outline-none
                               focus:border-amber-brand/50 text-sm"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={angAudiencia}
                      onChange={(e) => setAngAudiencia(e.target.value)}
                      placeholder="Audiencia objetivo (opcional)"
                      className="bg-oxford-blue border border-davy-gray/30 rounded px-4 py-2
                                 text-seasalt placeholder:text-davy-gray/50 focus:outline-none
                                 focus:border-amber-brand/50 text-sm"
                    />
                    <input
                      type="text"
                      value={angDato}
                      onChange={(e) => setAngDato(e.target.value)}
                      placeholder="Dato clave de contexto (opcional)"
                      className="bg-oxford-blue border border-davy-gray/30 rounded px-4 py-2
                                 text-seasalt placeholder:text-davy-gray/50 focus:outline-none
                                 focus:border-amber-brand/50 text-sm"
                    />
                  </div>
                  <button
                    onClick={handleGenerateAngulos}
                    disabled={!angTema.trim() || generating}
                    className="w-full py-2.5 bg-amber-brand text-oxford-blue rounded font-medium text-sm
                               hover:bg-amber-brand/90 transition-colors
                               disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {generating ? 'Generando ángulos…' : '⚡ Generar Ángulos'}
                  </button>
                </div>
                {genError && <p className="text-red-400 text-sm mt-3">{genError}</p>}
              </div>
            )}

            {/* ── TAB: Validador de Tono ── */}
            {activeTool === 'validador' && (
              <div>
                <p className="text-davy-gray text-sm mb-4">
                  Pegá un texto (borrador, lead, párrafo) y evaluá su tono editorial, sesgo, precisión y claridad.
                </p>
                <div className="space-y-3">
                  <textarea
                    value={tonoTexto}
                    onChange={(e) => setTonoTexto(e.target.value)}
                    placeholder="Pegá acá el texto a evaluar…"
                    rows={5}
                    maxLength={10000}
                    className="w-full bg-oxford-blue border border-davy-gray/30 rounded px-4 py-2
                               text-seasalt placeholder:text-davy-gray/50 focus:outline-none
                               focus:border-amber-brand/50 text-sm resize-y"
                  />
                  <button
                    onClick={handleValidarTono}
                    disabled={!tonoTexto.trim() || validando}
                    className="w-full py-2.5 bg-amber-brand text-oxford-blue rounded font-medium text-sm
                               hover:bg-amber-brand/90 transition-colors
                               disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {validando ? 'Analizando tono…' : '✅ Validar Tono'}
                  </button>
                </div>
                {tonoError && <p className="text-red-400 text-sm mt-3">{tonoError}</p>}
              </div>
            )}

            {/* ── TAB: Constructor de Pitch ── */}
            {activeTool === 'pitch' && (
              <div>
                <p className="text-davy-gray text-sm mb-4">
                  Construí un pitch editorial listo para enviar a editores de medios.
                </p>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={pitchAngulo}
                    onChange={(e) => setPitchAngulo(e.target.value)}
                    placeholder="Título o descripción del ángulo para el pitch…"
                    className="w-full bg-oxford-blue border border-davy-gray/30 rounded px-4 py-2
                               text-seasalt placeholder:text-davy-gray/50 focus:outline-none
                               focus:border-amber-brand/50 text-sm"
                  />
                  <input
                    type="text"
                    value={pitchMedio}
                    onChange={(e) => setPitchMedio(e.target.value)}
                    placeholder="Medio destino (opcional, ej: La Tercera, El País)"
                    className="w-full bg-oxford-blue border border-davy-gray/30 rounded px-4 py-2
                               text-seasalt placeholder:text-davy-gray/50 focus:outline-none
                               focus:border-amber-brand/50 text-sm"
                  />
                  <button
                    onClick={handleConstruirPitch}
                    disabled={!pitchAngulo.trim() || construyendo}
                    className="w-full py-2.5 bg-amber-brand text-oxford-blue rounded font-medium text-sm
                               hover:bg-amber-brand/90 transition-colors
                               disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {construyendo ? 'Construyendo pitch…' : '📨 Construir Pitch'}
                  </button>
                </div>
                {pitchError && <p className="text-red-400 text-sm mt-3">{pitchError}</p>}
              </div>
            )}
          </div>
        </section>

        {/* ── Ángulos Guardados ── */}
        {savedAngulos && savedAngulos.angulos.length > 0 && (
          <section className="bg-space-cadet rounded-lg border border-davy-gray/20 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-seasalt font-semibold">
                Ángulos Generados ({savedAngulos.angulos.length})
              </h2>
              <div className="text-right">
                <p className="text-davy-gray text-xs">
                  Tema: <span className="text-seasalt">{savedAngulos.tema}</span>
                </p>
                {savedAngulos.generadoEn && (
                  <p className="text-davy-gray text-xs">
                    {new Date(savedAngulos.generadoEn).toLocaleDateString('es-CL', {
                      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {savedAngulos.angulos.map((angulo, idx) => (
                <div key={idx} className="bg-oxford-blue rounded-lg border border-davy-gray/15 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs">{TIPO_LABELS[angulo.tipo] ?? angulo.tipo}</span>
                      <h3 className="text-seasalt font-medium text-sm">
                        {angulo.numero}. {angulo.titulo}
                      </h3>
                    </div>
                    {angulo.verificacion && (
                      <span className={`px-2 py-0.5 rounded text-xs font-medium border whitespace-nowrap ${
                        VERIFICACION_COLORS[angulo.verificacion] ?? 'bg-davy-gray/20 text-davy-gray border-davy-gray/40'
                      }`}>
                        {angulo.verificacion.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>

                  <p className="text-davy-gray text-sm mb-2">
                    <span className="text-amber-brand/80">Gancho:</span> {angulo.gancho}
                  </p>

                  {angulo.pregunta_clave && (
                    <p className="text-davy-gray text-sm mb-2">
                      <span className="text-blue-400/80">Pregunta clave:</span> {angulo.pregunta_clave}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-davy-gray mb-2">
                    <span>👥 <span className="text-seasalt/70">{angulo.audiencia}</span></span>
                    <span>🎭 <span className="text-seasalt/70">{angulo.tono}</span></span>
                    <span>⚠️ <span className="text-seasalt/70">{angulo.riesgo}</span></span>
                  </div>

                  {angulo.lentes.length > 0 && (
                    <div className="flex gap-1.5 mb-2 flex-wrap">
                      {angulo.lentes.map((lente, li) => (
                        <span key={li} className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-xs border border-blue-500/20">
                          {lente.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  )}

                  {angulo.fuentes.length > 0 && (
                    <div className="mt-2 text-xs text-davy-gray">
                      📚 Fuentes:{' '}
                      {angulo.fuentes.map((f, fi) => (
                        <span key={fi}>
                          {typeof f === 'object' && f
                            ? `${(f as Record<string, string>).cargo}, ${(f as Record<string, string>).institucion} (${(f as Record<string, string>).pais})`
                            : String(f)
                          }
                          {fi < angulo.fuentes.length - 1 ? ' · ' : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {savedAngulos.notaEditorial && (
              <div className="mt-4 pt-4 border-t border-davy-gray/20">
                <p className="text-davy-gray text-xs uppercase tracking-wider mb-1">Nota Editorial</p>
                <p className="text-seasalt/80 text-sm">{savedAngulos.notaEditorial}</p>
              </div>
            )}
          </section>
        )}

        {/* ── Validación de Tono Guardada ── */}
        {savedValidacion && (
          <section className="bg-space-cadet rounded-lg border border-davy-gray/20 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-seasalt font-semibold">Validación de Tono</h2>
              <div className="flex items-center gap-3">
                <span className={`font-bold text-lg ${
                  VEREDICTO_LABELS[savedValidacion.veredicto]?.color ?? 'text-davy-gray'
                }`}>
                  {savedValidacion.puntuacion_global.toFixed(1)}/5
                </span>
                <span className={`text-sm ${VEREDICTO_LABELS[savedValidacion.veredicto]?.color ?? 'text-davy-gray'}`}>
                  {VEREDICTO_LABELS[savedValidacion.veredicto]?.label ?? savedValidacion.veredicto}
                </span>
              </div>
            </div>

            <p className="text-seasalt/80 text-sm mb-4">{savedValidacion.resumen}</p>

            <div className="space-y-3">
              {savedValidacion.evaluacion.map((dim, di) => (
                <div key={di} className="bg-oxford-blue rounded-lg border border-davy-gray/15 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-seasalt text-sm font-medium capitalize">
                      {dim.dimension.replace(/_/g, ' ')}
                    </h4>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <span key={n} className={`w-5 h-2 rounded-full ${
                          n <= dim.puntuacion ? 'bg-amber-brand' : 'bg-davy-gray/20'
                        }`} />
                      ))}
                    </div>
                  </div>
                  {dim.hallazgos.length > 0 && (
                    <div className="mb-2">
                      {dim.hallazgos.map((h, hi) => (
                        <p key={hi} className="text-red-400/80 text-xs mb-0.5">⚠ {h}</p>
                      ))}
                    </div>
                  )}
                  {dim.sugerencias.length > 0 && (
                    <div>
                      {dim.sugerencias.map((s, si) => (
                        <p key={si} className="text-green-400/80 text-xs mb-0.5">→ {s}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Pitch Guardado ── */}
        {savedPitch && (
          <section className="bg-space-cadet rounded-lg border border-davy-gray/20 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-seasalt font-semibold">Pitch Editorial</h2>
              <p className="text-davy-gray text-xs">
                Medio: <span className="text-seasalt">{savedPitch.medio_destino}</span>
              </p>
            </div>

            <div className="bg-oxford-blue rounded-lg border border-davy-gray/15 p-5">
              <p className="text-seasalt text-sm whitespace-pre-wrap leading-relaxed">
                {savedPitch.texto_completo}
              </p>
            </div>

            {savedPitch.notas_estrategicas && (
              <div className="mt-4 pt-4 border-t border-davy-gray/20">
                <p className="text-davy-gray text-xs uppercase tracking-wider mb-1">Notas Estratégicas</p>
                <p className="text-seasalt/80 text-sm">{savedPitch.notas_estrategicas}</p>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
