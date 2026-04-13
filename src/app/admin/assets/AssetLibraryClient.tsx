'use client';

import { useState, useCallback } from 'react';

interface TenantOption {
  slug: string;
  name: string;
}

interface TenantAsset {
  id: string;
  tenantId: string;
  nombre: string;
  blob_url: string;
  blob_pathname: string | null;
  blob_size: number | null;
  mime_type: string | null;
  declaracion_ia: boolean;
  alt_text: string;
  origen: string;
  activo: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  tenantsDisponibles: TenantOption[];
}

function formatSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function mimeShort(mime: string | null): string {
  if (!mime) return 'archivo';
  if (mime.startsWith('image/')) return mime.replace('image/', '').toUpperCase();
  if (mime === 'application/pdf') return 'PDF';
  return mime.split('/').pop()?.toUpperCase() ?? 'archivo';
}

export default function AssetLibraryClient({ tenantsDisponibles }: Props) {
  const [selectedTenant, setSelectedTenant] = useState('');
  const [assets, setAssets] = useState<TenantAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [file, setFile] = useState<File | null>(null);
  const [nombre, setNombre] = useState('');
  const [altText, setAltText] = useState('');
  const [origen, setOrigen] = useState('');
  const [declaracionIa, setDeclaracionIa] = useState(false);

  const fetchAssets = useCallback(async (slug: string) => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenant-assets?tenantSlug=${encodeURIComponent(slug)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error cargando assets');
      setAssets(json.assets ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  function handleTenantChange(slug: string) {
    setSelectedTenant(slug);
    setAssets([]);
    if (slug) fetchAssets(slug);
  }

  function resetForm() {
    setFile(null);
    setNombre('');
    setAltText('');
    setOrigen('');
    setDeclaracionIa(false);
    // Reset file input
    const fileInput = document.getElementById('asset-file-input') as HTMLInputElement | null;
    if (fileInput) fileInput.value = '';
  }

  async function handleUpload() {
    if (!file || !selectedTenant) return;
    if (!nombre.trim() || !altText.trim() || !origen.trim()) {
      setError('Todos los campos de metadata son obligatorios');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      // Paso A: subir blob
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await fetch('/api/tenant-assets/upload', {
        method: 'POST',
        body: formData,
      });
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok || !uploadJson.success) {
        throw new Error(uploadJson.error || 'Error al subir archivo');
      }

      // Paso B: crear registro con metadata
      const createRes = await fetch('/api/tenant-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: selectedTenant,
          nombre: nombre.trim(),
          blob_url: uploadJson.url,
          blob_pathname: uploadJson.pathname,
          blob_size: uploadJson.size,
          mime_type: uploadJson.contentType,
          alt_text: altText.trim(),
          origen: origen.trim(),
          declaracion_ia: declaracionIa,
        }),
      });
      const createJson = await createRes.json();
      if (!createRes.ok || !createJson.success) {
        throw new Error(createJson.error || 'Error al crear asset');
      }

      resetForm();
      await fetchAssets(selectedTenant);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setUploading(false);
    }
  }

  async function handleDeactivate(assetId: string) {
    if (!confirm('Esto eliminara el archivo. No se puede deshacer. Continuar?')) return;
    setError(null);
    try {
      const res = await fetch(`/api/tenant-assets/${assetId}/deactivate`, {
        method: 'PATCH',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Error al desactivar asset');
      }
      await fetchAssets(selectedTenant);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    }
  }

  return (
    <div className="space-y-8">
      {/* Selector de tenant */}
      <div>
        <label className="block text-xs font-mono text-davy-gray uppercase tracking-wider mb-2">
          Tenant
        </label>
        <select
          value={selectedTenant}
          onChange={(e) => handleTenantChange(e.target.value)}
          className="w-full max-w-md bg-oxford-blue border border-davy-gray/50 rounded px-3 py-2.5
                     text-seasalt text-sm focus:outline-none focus:border-amber-brand"
        >
          <option value="">Seleccionar tenant...</option>
          {tenantsDisponibles.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {/* Error global */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/40 rounded p-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Formulario de upload */}
      {selectedTenant && (
        <div className="bg-space-cadet rounded-lg border border-davy-gray/30 p-5 space-y-4">
          <h3 className="text-amber-brand font-semibold text-sm">Subir nuevo asset</h3>

          <div>
            <label className="block text-xs font-mono text-davy-gray uppercase tracking-wider mb-2">
              Archivo <span className="text-red-400">*</span>
            </label>
            <input
              id="asset-file-input"
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-davy-gray file:mr-3 file:py-2 file:px-4
                         file:rounded file:border-0 file:text-sm file:font-semibold
                         file:bg-amber-brand/20 file:text-amber-brand
                         hover:file:bg-amber-brand/30 file:cursor-pointer"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-davy-gray uppercase tracking-wider mb-2">
              Nombre descriptivo <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Logo Dreamoms horizontal, Foto portada reportaje natalidad"
              className="w-full bg-oxford-blue border border-davy-gray/50 rounded px-3 py-2.5
                         text-seasalt text-sm placeholder:text-davy-gray/50
                         focus:outline-none focus:border-amber-brand"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-davy-gray uppercase tracking-wider mb-2">
              Texto alternativo (alt text) <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              placeholder="Descripcion del contenido visual para accesibilidad"
              className="w-full bg-oxford-blue border border-davy-gray/50 rounded px-3 py-2.5
                         text-seasalt text-sm placeholder:text-davy-gray/50
                         focus:outline-none focus:border-amber-brand"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-davy-gray uppercase tracking-wider mb-2">
              Origen / credito <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={origen}
              onChange={(e) => setOrigen(e.target.value)}
              placeholder="Ej: Archivo propio, Fuente: Reuters, IA: DALL-E 3"
              className="w-full bg-oxford-blue border border-davy-gray/50 rounded px-3 py-2.5
                         text-seasalt text-sm placeholder:text-davy-gray/50
                         focus:outline-none focus:border-amber-brand"
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="declaracion-ia"
              checked={declaracionIa}
              onChange={(e) => setDeclaracionIa(e.target.checked)}
              className="w-4 h-4 rounded border-davy-gray/50 bg-oxford-blue
                         text-amber-brand focus:ring-amber-brand/50"
            />
            <label htmlFor="declaracion-ia" className="text-sm text-seasalt">
              Este asset fue generado con inteligencia artificial
            </label>
          </div>

          <button
            onClick={handleUpload}
            disabled={uploading || !file || !nombre.trim() || !altText.trim() || !origen.trim()}
            className={`w-full py-3 rounded font-bold text-sm transition-all ${
              uploading || !file || !nombre.trim() || !altText.trim() || !origen.trim()
                ? 'bg-davy-gray/30 text-davy-gray cursor-not-allowed'
                : 'bg-amber-brand text-oxford-blue hover:bg-amber-brand/90 active:scale-[0.99]'
            }`}
          >
            {uploading ? 'Subiendo...' : 'Subir asset'}
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-8">
          <p className="text-davy-gray text-sm animate-pulse">Cargando assets...</p>
        </div>
      )}

      {/* Grilla de assets */}
      {selectedTenant && !loading && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-seasalt font-semibold text-sm">
              Assets ({assets.length})
            </h3>
          </div>

          {assets.length === 0 ? (
            <div className="bg-oxford-blue/50 border border-davy-gray/20 rounded-lg p-8 text-center">
              <p className="text-davy-gray text-sm">
                No hay assets en esta biblioteca. Subi el primero usando el formulario de arriba.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className="bg-space-cadet rounded-lg border border-davy-gray/30 overflow-hidden
                             hover:border-amber-brand/30 transition-colors"
                >
                  {/* Thumbnail o icono */}
                  <div className="h-40 bg-oxford-blue/50 flex items-center justify-center overflow-hidden">
                    {asset.mime_type?.startsWith('image/') ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={asset.blob_url}
                        alt={asset.alt_text}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center">
                        <div className="text-4xl mb-1">📄</div>
                        <span className="text-davy-gray text-xs">
                          {mimeShort(asset.mime_type)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-4 space-y-2">
                    <h4 className="text-seasalt font-semibold text-sm truncate">
                      {asset.nombre}
                    </h4>
                    <p className="text-davy-gray text-xs truncate">{asset.alt_text}</p>
                    <p className="text-davy-gray/70 text-xs">
                      <span className="text-davy-gray">Fuente:</span> {asset.origen}
                    </p>

                    <div className="flex items-center gap-2 flex-wrap">
                      {asset.declaracion_ia && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-brand/15
                                         border border-amber-brand/40 text-amber-brand">
                          Generado con IA
                        </span>
                      )}
                      {asset.blob_size && (
                        <span className="text-davy-gray/60 text-[10px]">
                          {formatSize(asset.blob_size)}
                        </span>
                      )}
                      <span className="text-davy-gray/60 text-[10px]">
                        {formatDate(asset.createdAt)}
                      </span>
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center gap-2 pt-2 border-t border-davy-gray/20">
                      <a
                        href={asset.blob_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-amber-brand hover:underline"
                      >
                        Ver archivo
                      </a>
                      <button
                        onClick={() => handleDeactivate(asset.id)}
                        className="text-xs text-davy-gray hover:text-red-400 transition-colors ml-auto"
                      >
                        Desactivar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
