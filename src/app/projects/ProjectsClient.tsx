'use client';

/**
 * IP+MP Platform — Lista de Projects (componente interactivo)
 *
 * Carga projects vía API, permite filtrar por tenant y estado.
 * Muestra el pipeline visual de cada project.
 */

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

// ── Tipos ────────────────────────────────────────────
interface Tenant {
  slug: string;
  name: string;
}

interface Project {
  id: string;
  publicId: string;
  title: string;
  status: string;
  thesis: string | null;
  classification: string;
  brandVariant: string | null;
  createdAt: string;
  updatedAt: string;
  tenantSlug: string;
  tenantName: string;
  templateSlug: string;
  templateName: string;
  templateFamily: string;
  templatePrefix: string;
  editorId: string | null;
  editorNombre: string | null;
  editorApellido: string | null;
}

// ── Constantes ───────────────────────────────────────
const PIPELINE_PHASES = [
  'draft',
  'validacion',
  'pesquisa',
  'produccion',
  'revision',
  'aprobado',
  'visual',
  'exportado',
];

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  validacion: 'Validación',
  pesquisa: 'Pesquisa',
  produccion: 'Producción',
  visual: 'Visual',
  revision: 'Revisión',
  aprobado: 'Aprobado',
  exportado: 'Exportado',
};

const INVESTIGAPRESS_STATUSES = ['draft', 'validacion', 'hito_1', 'pesquisa'];
const METRICPRESS_STATUSES = ['produccion', 'revision', 'aprobado', 'visual', 'exportado'];

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-davy-gray/30 text-davy-gray',
  validacion: 'bg-blue-500/20 text-blue-300',
  pesquisa: 'bg-cyan-500/20 text-cyan-300',
  produccion: 'bg-amber-brand/20 text-amber-brand',
  visual: 'bg-purple-500/20 text-purple-300',
  revision: 'bg-orange-500/20 text-orange-300',
  aprobado: 'bg-green-500/20 text-green-400',
  exportado: 'bg-green-700/20 text-green-300',
};

// ── Componente ───────────────────────────────────────
export default function ProjectsClient({ tenants }: { tenants: Tenant[] }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterTenant, setFilterTenant] = useState(
    searchParams.get('tenant') ?? ''
  );
  const [filterStatus, setFilterStatus] = useState(
    searchParams.get('status') ?? ''
  );
  const [titleInput, setTitleInput] = useState(
    searchParams.get('q') ?? ''
  );
  const [filterTitle, setFilterTitle] = useState(
    searchParams.get('q') ?? ''
  );
  const [filterPhase, setFilterPhase] = useState(
    searchParams.get('phase') ?? ''
  );

  const updateURL = (params: Record<string, string>) => {
    const current = new URLSearchParams(Array.from(searchParams.entries()));
    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        current.set(key, value);
      } else {
        current.delete(key);
      }
    });
    router.replace(`${pathname}?${current.toString()}`, { scroll: false });
  };

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilterTitle(titleInput);
      updateURL({ q: titleInput });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titleInput]);

  async function loadProjects() {
    try {
      setLoading(true);
      const res = await fetch('/api/projects');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setProjects(data.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando projects');
    } finally {
      setLoading(false);
    }
  }

  // Filtrar en cliente
  const filtered = projects.filter((p) => {
    if (filterTenant && p.tenantSlug !== filterTenant) return false;
    if (filterStatus && p.status !== filterStatus) return false;
    if (filterTitle && !p.title.toLowerCase().includes(filterTitle.toLowerCase())) return false;
    if (filterPhase === 'investigapress' && !INVESTIGAPRESS_STATUSES.includes(p.status)) return false;
    if (filterPhase === 'metricpress' && !METRICPRESS_STATUSES.includes(p.status)) return false;
    return true;
  });

  const hasActiveFilters = Boolean(filterTenant || filterStatus || filterTitle || filterPhase);

  const countIP = filtered.filter((p) => INVESTIGAPRESS_STATUSES.includes(p.status)).length;
  const countMP = filtered.filter((p) => METRICPRESS_STATUSES.includes(p.status)).length;
  const countListos = filtered.filter((p) => p.status === 'aprobado' || p.status === 'visual').length;

  function healthDot(status: string): { color: string; title: string } {
    if (status === 'draft') return { color: 'bg-red-500', title: 'Requiere borrador para avanzar' };
    if (status === 'pesquisa' || status === 'visual') return { color: 'bg-amber-400', title: 'Pendiente de accion del operador' };
    if (status === 'aprobado' || status === 'exportado') return { color: 'bg-green-500', title: 'En buen estado' };
    return { color: 'bg-davy-gray', title: 'En progreso' };
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="animate-spin inline-block w-6 h-6 border-2 border-davy-gray/30 border-t-amber-brand rounded-full" />
        <span className="ml-3 text-davy-gray text-sm">Cargando projects...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-700 rounded-lg p-6">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="flex gap-3 flex-wrap items-center">
        <select
          value={filterTenant}
          onChange={(e) => {
            const value = e.target.value;
            setFilterTenant(value);
            updateURL({ tenant: value });
          }}
          className="bg-space-cadet border border-davy-gray/50 rounded px-3 py-2 text-seasalt text-sm focus:outline-none focus:border-amber-brand"
        >
          <option value="">Todos los tenants</option>
          {tenants.map((t) => (
            <option key={t.slug} value={t.slug}>{t.name}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => {
            const value = e.target.value;
            setFilterStatus(value);
            updateURL({ status: value });
          }}
          className="bg-space-cadet border border-davy-gray/50 rounded px-3 py-2 text-seasalt text-sm focus:outline-none focus:border-amber-brand"
        >
          <option value="">Todos los estados</option>
          {PIPELINE_PHASES.map((phase) => (
            <option key={phase} value={phase}>{STATUS_LABELS[phase]}</option>
          ))}
        </select>
        <select
          value={filterPhase}
          onChange={(e) => {
            const value = e.target.value;
            setFilterPhase(value);
            updateURL({ phase: value });
          }}
          className="bg-space-cadet border border-davy-gray/50 rounded px-3 py-2 text-seasalt text-sm focus:outline-none focus:border-amber-brand"
        >
          <option value="">Todas las fases</option>
          <option value="investigapress">InvestigaPress</option>
          <option value="metricpress">MetricPress</option>
        </select>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            placeholder="🔍 Buscar por titulo..."
            className="bg-space-cadet border border-davy-gray/50 rounded px-3 py-2 text-seasalt text-sm focus:outline-none focus:border-amber-brand w-52"
          />
          {filterTitle && (
            <button
              onClick={() => {
                setTitleInput('');
                setFilterTitle('');
                updateURL({ q: '' });
              }}
              className="bg-space-cadet border border-davy-gray/50 rounded px-2 py-2 text-davy-gray text-sm hover:text-seasalt hover:border-amber-brand transition-colors"
              title="Limpiar busqueda"
            >
              ✕
            </button>
          )}
        </div>
        {hasActiveFilters && (
          <button
            onClick={() => {
              setFilterTenant('');
              setFilterStatus('');
              setTitleInput('');
              setFilterTitle('');
              setFilterPhase('');
              router.replace(pathname, { scroll: false });
            }}
            className="text-sm text-gray-400 hover:text-white underline"
          >
            Limpiar filtros
          </button>
        )}
        <span className="text-davy-gray text-sm self-center ml-auto">
          {filtered.length} proyecto{filtered.length !== 1 ? 's' : ''} · {countIP} en investigación · {countMP} en producción · {countListos} listos para exportar
        </span>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="bg-space-cadet rounded-lg border border-davy-gray/30 p-12 text-center">
          <p className="text-davy-gray text-lg mb-2">
            {projects.length === 0
              ? 'No hay projects todavía'
              : 'Ningún project coincide con los filtros'}
          </p>
          {projects.length === 0 && (
            <a
              href="/projects/new"
              className="inline-block mt-3 bg-amber-brand text-oxford-blue px-4 py-2 rounded font-bold text-sm hover:bg-amber-brand/90 transition-colors"
            >
              Crear el primero
            </a>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((project) => {
            const phaseIndex = PIPELINE_PHASES.indexOf(project.status);
            const health = healthDot(project.status);
            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="block bg-space-cadet rounded-lg border border-davy-gray/30 hover:border-amber-brand/40 transition-colors p-5"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${health.color}`}
                        title={health.title}
                      />
                      <span className="text-xs font-mono text-amber-brand">
                        {project.publicId}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[project.status] ?? 'bg-davy-gray/30 text-davy-gray'}`}>
                        {STATUS_LABELS[project.status] ?? project.status}
                      </span>
                    </div>
                    <h3 className="text-seasalt font-bold text-base truncate">
                      {project.title}
                    </h3>
                    {project.thesis && (
                      <p className="text-davy-gray text-sm mt-1 line-clamp-1">
                        {project.thesis}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-davy-gray">{project.tenantName}</p>
                    <p className="text-xs text-davy-gray/70">{project.templateName}</p>
                    {project.editorNombre && (
                      <p className="text-xs text-amber-brand/70">
                        Editor: {project.editorNombre} {project.editorApellido ?? ''}
                      </p>
                    )}
                  </div>
                </div>

                {/* Pipeline mini */}
                <div className="flex gap-0.5">
                  {PIPELINE_PHASES.map((phase, i) => (
                    <div
                      key={phase}
                      className={`h-1.5 flex-1 rounded-full ${
                        i <= phaseIndex
                          ? 'bg-amber-brand'
                          : 'bg-davy-gray/20'
                      }`}
                      title={STATUS_LABELS[phase]}
                    />
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
