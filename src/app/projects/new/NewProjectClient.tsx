'use client';

/**
 * IP+MP Platform — Formulario de creación de Project
 *
 * Permite seleccionar tenant, plantilla, brand variant,
 * título y tesis. Crea el project vía API y redirige a la lista.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// ── Tipos ────────────────────────────────────────────
interface Tenant {
  slug: string;
  name: string;
  brandVariants: string[] | null;
}

interface Template {
  slug: string;
  name: string;
  family: string;
  idPrefix: string;
  reviewLevel: string;
  defaultClassification: string;
}

const FAMILY_LABELS: Record<string, string> = {
  prensa: 'Prensa',
  opinion: 'Opinión',
  institucional: 'Institucional',
  academico: 'Académico',
};

const REVIEW_LABELS: Record<string, string> = {
  express: 'Express (aprueba operador)',
  profunda: 'Profunda (aprueba Claudia)',
};

// ── Componente ───────────────────────────────────────
export default function NewProjectClient({
  tenants,
  templates,
}: {
  tenants: Tenant[];
  templates: Template[];
}) {
  const router = useRouter();
  const [tenantSlug, setTenantSlug] = useState(tenants[0]?.slug ?? '');
  const [templateSlug, setTemplateSlug] = useState(templates[0]?.slug ?? '');
  const [brandVariant, setBrandVariant] = useState('');
  const [title, setTitle] = useState('');
  const [thesis, setThesis] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tenant seleccionado
  const selectedTenant = tenants.find((t) => t.slug === tenantSlug);
  const hasBrandVariants =
    selectedTenant?.brandVariants && selectedTenant.brandVariants.length > 0;

  // Template seleccionado
  const selectedTemplate = templates.find((t) => t.slug === templateSlug);

  // Agrupar templates por familia
  const templatesByFamily = templates.reduce<Record<string, Template[]>>((acc, t) => {
    if (!acc[t.family]) acc[t.family] = [];
    acc[t.family].push(t);
    return acc;
  }, {});

  // Preview del publicId
  const year = new Date().getFullYear();
  const previewId = selectedTemplate
    ? `${tenantSlug.toUpperCase()}-${selectedTemplate.idPrefix}-${year}-XXXX`
    : '';

  async function handleSubmit() {
    if (!title.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug,
          templateSlug,
          title: title.trim(),
          thesis: thesis.trim() || undefined,
          brandVariant: brandVariant || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Error desconocido');
        return;
      }

      // Redirigir a la lista de projects
      router.push('/projects');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-space-cadet rounded-lg p-6 border border-davy-gray/30 space-y-6">
      {/* Preview ID */}
      {previewId && (
        <div className="bg-oxford-blue rounded p-3 border border-davy-gray/20">
          <p className="text-xs font-mono text-davy-gray uppercase tracking-wider mb-1">
            ID del Project (auto-generado)
          </p>
          <p className="text-amber-brand font-mono text-lg">{previewId}</p>
        </div>
      )}

      {/* Tenant */}
      <div>
        <label className="block text-xs font-mono text-davy-gray uppercase tracking-wider mb-2">
          Tenant
        </label>
        <select
          value={tenantSlug}
          onChange={(e) => {
            setTenantSlug(e.target.value);
            setBrandVariant('');
          }}
          className="w-full bg-oxford-blue border border-davy-gray/50 rounded px-3 py-2.5 text-seasalt text-sm focus:outline-none focus:border-amber-brand transition-colors"
        >
          {tenants.map((t) => (
            <option key={t.slug} value={t.slug}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Brand Variant (solo si el tenant tiene) */}
      {hasBrandVariants && (
        <div>
          <label className="block text-xs font-mono text-davy-gray uppercase tracking-wider mb-2">
            Brand Variant
            <span className="text-davy-gray/50 ml-2">(opcional)</span>
          </label>
          <select
            value={brandVariant}
            onChange={(e) => setBrandVariant(e.target.value)}
            className="w-full bg-oxford-blue border border-davy-gray/50 rounded px-3 py-2.5 text-seasalt text-sm focus:outline-none focus:border-amber-brand transition-colors"
          >
            <option value="">Sin variante (marca principal)</option>
            {selectedTenant?.brandVariants?.map((bv) => (
              <option key={bv} value={bv}>{bv}</option>
            ))}
          </select>
        </div>
      )}

      {/* Plantilla */}
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
        {selectedTemplate && (
          <div className="flex gap-3 mt-2 text-xs text-davy-gray">
            <span>Revisión: {REVIEW_LABELS[selectedTemplate.reviewLevel] ?? selectedTemplate.reviewLevel}</span>
            <span>·</span>
            <span>Clasificación: {selectedTemplate.defaultClassification}</span>
          </div>
        )}
      </div>

      {/* Título */}
      <div>
        <label className="block text-xs font-mono text-davy-gray uppercase tracking-wider mb-2">
          Título del Project
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ej: IA en control prenatal Chile — Dreamoms Q2 2026"
          maxLength={200}
          className="w-full bg-oxford-blue border border-davy-gray/50 rounded px-3 py-2.5 text-seasalt text-sm placeholder:text-davy-gray/50 focus:outline-none focus:border-amber-brand transition-colors"
        />
      </div>

      {/* Tesis */}
      <div>
        <label className="block text-xs font-mono text-davy-gray uppercase tracking-wider mb-2">
          Tesis / Hipótesis
          <span className="text-davy-gray/50 ml-2">(opcional, se puede completar después)</span>
        </label>
        <textarea
          value={thesis}
          onChange={(e) => setThesis(e.target.value)}
          placeholder="Ej: La inteligencia artificial puede reducir en un 40% las complicaciones prenatales en el sistema público chileno, pero las brechas de acceso digital en regiones limitan su implementación equitativa."
          rows={3}
          maxLength={5000}
          className="w-full bg-oxford-blue border border-davy-gray/50 rounded px-3 py-2.5 text-seasalt text-sm placeholder:text-davy-gray/50 focus:outline-none focus:border-amber-brand transition-colors resize-y"
        />
      </div>

      {/* Botón */}
      <button
        onClick={handleSubmit}
        disabled={loading || !title.trim()}
        className={`w-full py-3 rounded font-bold text-sm transition-all ${
          loading || !title.trim()
            ? 'bg-davy-gray/30 text-davy-gray cursor-not-allowed'
            : 'bg-amber-brand text-oxford-blue hover:bg-amber-brand/90 active:scale-[0.99]'
        }`}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin inline-block w-4 h-4 border-2 border-oxford-blue/30 border-t-oxford-blue rounded-full" />
            Creando project...
          </span>
        ) : (
          'Crear Project'
        )}
      </button>

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded p-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}
