'use client';

/**
 * IP+MP Platform — Formulario de creación de Project (InvestigaPress)
 *
 * REFACTORIZACIÓN 5c (Abril 2026):
 *   - Simplificado: solo título + tesis
 *   - No requiere tenant ni template (se asignan en traspaso IP→MP)
 *   - PublicId se genera automático: IP-AÑO-XXXX
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewProjectClient() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [thesis, setThesis] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preview del publicId
  const year = new Date().getFullYear();
  const previewId = `IP-${year}-XXXX`;

  async function handleSubmit() {
    if (!title.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          thesis: thesis.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Error desconocido');
        return;
      }

      // Redirigir al detalle del project recién creado
      router.push(`/projects/${data.project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-space-cadet rounded-lg p-6 border border-davy-gray/30 space-y-6">
      {/* Fase indicator */}
      <div className="flex items-center gap-3 bg-oxford-blue rounded-lg p-4 border border-amber-brand/20">
        <span className="text-2xl">🔍</span>
        <div>
          <p className="text-amber-brand font-semibold text-sm">Fase InvestigaPress</p>
          <p className="text-davy-gray text-xs">
            El project nace sin marca. Investigás primero, asignás marca después (traspaso a MetricPress).
          </p>
        </div>
      </div>

      {/* Preview ID */}
      <div className="bg-oxford-blue rounded p-3 border border-davy-gray/20">
        <p className="text-xs font-mono text-davy-gray uppercase tracking-wider mb-1">
          ID del Project (auto-generado)
        </p>
        <p className="text-amber-brand font-mono text-lg">{previewId}</p>
        <p className="text-davy-gray/60 text-xs mt-1">
          Se actualizará a MARCA-TIPO-AÑO-XXXX cuando asignes tenant en el traspaso.
        </p>
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
          placeholder="Ej: Impacto de la IA en el control prenatal en Chile"
          maxLength={200}
          className="w-full bg-oxford-blue border border-davy-gray/50 rounded px-3 py-2.5 text-seasalt text-sm placeholder:text-davy-gray/50 focus:outline-none focus:border-amber-brand transition-colors"
        />
      </div>

      {/* Tesis */}
      <div>
        <label className="block text-xs font-mono text-davy-gray uppercase tracking-wider mb-2">
          Tesis / Hipótesis
          <span className="text-davy-gray/50 ml-2">(opcional)</span>
        </label>
        <textarea
          value={thesis}
          onChange={(e) => setThesis(e.target.value)}
          placeholder="Ej: La inteligencia artificial puede reducir en un 40% las complicaciones prenatales en el sistema público chileno, pero las brechas de acceso digital en regiones limitan su implementación equitativa."
          rows={4}
          maxLength={5000}
          className="w-full bg-oxford-blue border border-davy-gray/50 rounded px-3 py-2.5 text-seasalt text-sm placeholder:text-davy-gray/50 focus:outline-none focus:border-amber-brand transition-colors resize-y"
        />
        <p className="text-davy-gray/50 text-xs mt-1">
          Si ya tienes una tesis clara, escribela. Si arrancas desde un documento o un dato, dejalo vacio: la tesis puede emerger al generar hipotesis en la fase Validacion.
        </p>
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
          'Crear Project →'
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
