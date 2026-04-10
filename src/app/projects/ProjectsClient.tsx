'use client';

/**
 * IP+MP Platform — Lista de Projects (componente interactivo)
 *
 * Carga projects vía API, permite filtrar por tenant y estado.
 * Muestra el pipeline visual de cada project.
 */

import { useState, useEffect } from 'react';
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
}

// ── Constantes ───────────────────────────────────────
const PIPELINE_PHASES = [
  'draft',
  'validacion',
  'pesquisa',
  'produccion',
  'visual',
  'revision',
  'aprobado',
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
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterTenant, setFilterTenant] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    loadProjects();
  }, []);

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
    return true;
  });

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
      <div className="flex gap-3">
        <select
          value={filterTenant}
          onChange={(e) => setFilterTenant(e.target.value)}
          className="bg-space-cadet border border-davy-gray/50 rounded px-3 py-2 text-seasalt text-sm focus:outline-none focus:border-amber-brand"
        >
          <option value="">Todos los tenants</option>
          {tenants.map((t) => (
            <option key={t.slug} value={t.slug}>{t.name}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-space-cadet border border-davy-gray/50 rounded px-3 py-2 text-seasalt text-sm focus:outline-none focus:border-amber-brand"
        >
          <option value="">Todos los estados</option>
          {PIPELINE_PHASES.map((phase) => (
            <option key={phase} value={phase}>{STATUS_LABELS[phase]}</option>
          ))}
        </select>
        <span className="text-davy-gray text-sm self-center ml-auto">
          {filtered.length} project{filtered.length !== 1 ? 's' : ''}
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
            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="block bg-space-cadet rounded-lg border border-davy-gray/30 hover:border-amber-brand/40 transition-colors p-5"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
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
