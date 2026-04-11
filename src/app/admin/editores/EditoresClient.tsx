'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// ── Tipos locales (deben matchear el shape del API de 10A) ──
interface TenantLite {
  slug: string;
  name: string;
}

interface Editor {
  id: string;
  nombre: string;
  apellido: string;
  medio: string;
  seccion: string | null;
  tier: number;
  tenantsRelevantes: string[];
  tipoPiezaRecomendado: string[];
  email: string | null;
  telefono: string | null;
  notas: string | null;
  ultimaVerificacion: string | null;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  tenantsDisponibles: TenantLite[];
  editoresIniciales: Editor[];
}

// ── Shape del form (tanto para alta como para edicion) ──
interface FormState {
  nombre: string;
  apellido: string;
  medio: string;
  seccion: string;
  tier: string; // string en el form, se convierte a number en el submit
  tenantsRelevantes: string[];
  tipoPiezaRecomendado: string; // comma-separated en el form
  email: string;
  telefono: string;
  notas: string;
}

const EMPTY_FORM: FormState = {
  nombre: '',
  apellido: '',
  medio: '',
  seccion: '',
  tier: '',
  tenantsRelevantes: [],
  tipoPiezaRecomendado: '',
  email: '',
  telefono: '',
  notas: '',
};

export default function EditoresClient({
  tenantsDisponibles,
  editoresIniciales,
}: Props) {
  const router = useRouter();

  // ── Listado ──
  const [editores, setEditores] = useState<Editor[]>(editoresIniciales);
  const [mostrarInactivos, setMostrarInactivos] = useState(false);

  // ── Form de alta ──
  const [altaOpen, setAltaOpen] = useState(false);
  const [altaForm, setAltaForm] = useState<FormState>(EMPTY_FORM);
  const [altaLoading, setAltaLoading] = useState(false);
  const [altaError, setAltaError] = useState<string | null>(null);

  // ── Edicion inline ──
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // ── Acciones puntuales (verificar, soft-delete, reactivar) ──
  const [accionLoadingId, setAccionLoadingId] = useState<string | null>(null);

  // Lista filtrada segun toggle
  const editoresVisibles = mostrarInactivos
    ? editores
    : editores.filter((e) => e.activo);

  // ── Helpers de parsing form → API body ──
  function formToBody(form: FormState): Record<string, unknown> | null {
    const nombre = form.nombre.trim();
    const apellido = form.apellido.trim();
    const medio = form.medio.trim();
    const tierNum = parseInt(form.tier, 10);

    if (!nombre || !apellido || !medio) return null;
    if (!Number.isInteger(tierNum) || tierNum <= 0) return null;

    const tiposArr = form.tipoPiezaRecomendado
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    return {
      nombre,
      apellido,
      medio,
      seccion: form.seccion.trim() || undefined,
      tier: tierNum,
      tenantsRelevantes: form.tenantsRelevantes,
      tipoPiezaRecomendado: tiposArr,
      email: form.email.trim() || undefined,
      telefono: form.telefono.trim() || undefined,
      notas: form.notas.trim() || undefined,
    };
  }

  // Helper inverso: Editor → FormState (para arrancar la edicion inline)
  function editorToForm(editor: Editor): FormState {
    return {
      nombre: editor.nombre,
      apellido: editor.apellido,
      medio: editor.medio,
      seccion: editor.seccion ?? '',
      tier: String(editor.tier),
      tenantsRelevantes: editor.tenantsRelevantes,
      tipoPiezaRecomendado: editor.tipoPiezaRecomendado.join(', '),
      email: editor.email ?? '',
      telefono: editor.telefono ?? '',
      notas: editor.notas ?? '',
    };
  }

  // ── Handler: crear editor ──
  async function handleCrear() {
    const body = formToBody(altaForm);
    if (!body) {
      setAltaError(
        'Faltan campos obligatorios: nombre, apellido, medio y tier (entero positivo).'
      );
      return;
    }
    setAltaLoading(true);
    setAltaError(null);
    try {
      const res = await fetch('/api/editores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setAltaError(data.error || 'Error al crear editor');
        return;
      }
      // Optimistic update: agrega al listado local
      setEditores((prev) =>
        [...prev, data.editor as Editor].sort((a, b) => {
          if (a.tier !== b.tier) return a.tier - b.tier;
          return a.apellido.localeCompare(b.apellido);
        })
      );
      setAltaForm(EMPTY_FORM);
      setAltaOpen(false);
    } catch (err) {
      setAltaError(err instanceof Error ? err.message : 'Error de conexion');
    } finally {
      setAltaLoading(false);
    }
  }

  // ── Handler: arrancar edicion inline ──
  function handleIniciarEdicion(editor: Editor) {
    setEditandoId(editor.id);
    setEditForm(editorToForm(editor));
    setEditError(null);
  }

  // ── Handler: cancelar edicion inline ──
  function handleCancelarEdicion() {
    setEditandoId(null);
    setEditForm(EMPTY_FORM);
    setEditError(null);
  }

  // ── Handler: guardar edicion inline ──
  async function handleGuardarEdicion(id: string) {
    const body = formToBody(editForm);
    if (!body) {
      setEditError(
        'Faltan campos obligatorios: nombre, apellido, medio y tier (entero positivo).'
      );
      return;
    }
    setEditLoading(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/editores/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || 'Error al guardar cambios');
        return;
      }
      setEditores((prev) =>
        prev
          .map((e) => (e.id === id ? (data.editor as Editor) : e))
          .sort((a, b) => {
            if (a.tier !== b.tier) return a.tier - b.tier;
            return a.apellido.localeCompare(b.apellido);
          })
      );
      handleCancelarEdicion();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Error de conexion');
    } finally {
      setEditLoading(false);
    }
  }

  // ── Handler generico: PATCH de un solo campo (verificar, activo) ──
  async function handlePatchSimple(
    id: string,
    patch: Record<string, unknown>
  ) {
    setAccionLoadingId(id);
    try {
      const res = await fetch(`/api/editores/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Error al actualizar editor');
        return;
      }
      setEditores((prev) =>
        prev.map((e) => (e.id === id ? (data.editor as Editor) : e))
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error de conexion');
    } finally {
      setAccionLoadingId(null);
    }
  }

  // ── Toggle de checkbox de tenant (reutilizable entre alta y edicion) ──
  function toggleTenantInForm(
    currentForm: FormState,
    setForm: (f: FormState) => void,
    slug: string
  ) {
    const yaEsta = currentForm.tenantsRelevantes.includes(slug);
    const nuevo = yaEsta
      ? currentForm.tenantsRelevantes.filter((s) => s !== slug)
      : [...currentForm.tenantsRelevantes, slug];
    setForm({ ...currentForm, tenantsRelevantes: nuevo });
  }

  // ── Format helpers ──
  function formatFecha(iso: string | null): string {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('es-CL', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return iso;
    }
  }

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── Barra superior: contador + toggle inactivos + boton alta ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="text-sm text-davy-gray">
          {editoresVisibles.length} editor
          {editoresVisibles.length === 1 ? '' : 'es'} visible
          {editoresVisibles.length === 1 ? '' : 's'}
          {!mostrarInactivos && editores.some((e) => !e.activo) && (
            <span className="ml-2 text-xs">
              ({editores.filter((e) => !e.activo).length} inactivo
              {editores.filter((e) => !e.activo).length === 1 ? '' : 's'}{' '}
              oculto
              {editores.filter((e) => !e.activo).length === 1 ? '' : 's'})
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-davy-gray cursor-pointer">
            <input
              type="checkbox"
              checked={mostrarInactivos}
              onChange={(e) => setMostrarInactivos(e.target.checked)}
              className="rounded"
            />
            Mostrar inactivos
          </label>
          <button
            onClick={() => setAltaOpen((v) => !v)}
            className="px-4 py-2 bg-amber-brand text-oxford-blue font-medium rounded hover:bg-amber-brand/90 transition-colors text-sm"
          >
            {altaOpen ? 'Cancelar' : '+ Nuevo editor'}
          </button>
        </div>
      </div>

      {/* ── Form de alta (colapsable) ── */}
      {altaOpen && (
        <div className="bg-white/5 border border-white/10 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-seasalt mb-4">
            Nuevo editor
          </h2>
          <FormFields
            form={altaForm}
            setForm={setAltaForm}
            tenantsDisponibles={tenantsDisponibles}
            toggleTenant={(slug) =>
              toggleTenantInForm(altaForm, setAltaForm, slug)
            }
          />
          {altaError && (
            <div className="mt-4 bg-red-900/20 border border-red-700 rounded p-3">
              <p className="text-red-400 text-sm">{altaError}</p>
            </div>
          )}
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleCrear}
              disabled={altaLoading}
              className="px-4 py-2 bg-amber-brand text-oxford-blue font-medium rounded hover:bg-amber-brand/90 transition-colors text-sm disabled:opacity-50"
            >
              {altaLoading ? 'Creando...' : 'Crear editor'}
            </button>
            <button
              onClick={() => {
                setAltaForm(EMPTY_FORM);
                setAltaError(null);
              }}
              disabled={altaLoading}
              className="px-4 py-2 text-davy-gray hover:text-seasalt text-sm"
            >
              Limpiar form
            </button>
          </div>
        </div>
      )}

      {/* ── Listado ── */}
      {editoresVisibles.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-lg p-12 text-center">
          <p className="text-davy-gray">
            {editores.length === 0
              ? 'Todavia no hay editores cargados. Usa "+ Nuevo editor" para empezar.'
              : 'No hay editores que coincidan con los filtros actuales.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {editoresVisibles.map((editor) => (
            <div
              key={editor.id}
              className={`bg-white/5 border border-white/10 rounded-lg p-4 ${
                !editor.activo ? 'opacity-60' : ''
              }`}
            >
              {editandoId === editor.id ? (
                // ── MODO EDICION ──
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-amber-brand">
                      Editando: {editor.nombre} {editor.apellido}
                    </h3>
                  </div>
                  <FormFields
                    form={editForm}
                    setForm={setEditForm}
                    tenantsDisponibles={tenantsDisponibles}
                    toggleTenant={(slug) =>
                      toggleTenantInForm(editForm, setEditForm, slug)
                    }
                  />
                  {editError && (
                    <div className="mt-4 bg-red-900/20 border border-red-700 rounded p-3">
                      <p className="text-red-400 text-sm">{editError}</p>
                    </div>
                  )}
                  <div className="mt-4 flex gap-3">
                    <button
                      onClick={() => handleGuardarEdicion(editor.id)}
                      disabled={editLoading}
                      className="px-4 py-2 bg-amber-brand text-oxford-blue font-medium rounded hover:bg-amber-brand/90 transition-colors text-sm disabled:opacity-50"
                    >
                      {editLoading ? 'Guardando...' : 'Guardar cambios'}
                    </button>
                    <button
                      onClick={handleCancelarEdicion}
                      disabled={editLoading}
                      className="px-4 py-2 text-davy-gray hover:text-seasalt text-sm"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                // ── MODO LECTURA ──
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1 flex-wrap">
                        <h3 className="text-base font-semibold text-seasalt">
                          {editor.nombre} {editor.apellido}
                        </h3>
                        <span className="text-xs px-2 py-0.5 bg-amber-brand/20 text-amber-brand rounded">
                          Tier {editor.tier}
                        </span>
                        {!editor.activo && (
                          <span className="text-xs px-2 py-0.5 bg-red-900/30 text-red-400 rounded">
                            Inactivo
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-davy-gray">
                        {editor.medio}
                        {editor.seccion && ` · ${editor.seccion}`}
                      </p>
                      {(editor.email || editor.telefono) && (
                        <p className="text-xs text-davy-gray mt-1">
                          {editor.email && (
                            <span className="mr-3">{editor.email}</span>
                          )}
                          {editor.telefono && <span>{editor.telefono}</span>}
                        </p>
                      )}
                      {editor.tenantsRelevantes.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {editor.tenantsRelevantes.map((slug) => (
                            <span
                              key={slug}
                              className="text-xs px-2 py-0.5 bg-white/10 text-davy-gray rounded"
                            >
                              {slug}
                            </span>
                          ))}
                        </div>
                      )}
                      {editor.tipoPiezaRecomendado.length > 0 && (
                        <p className="text-xs text-davy-gray mt-1">
                          Piezas: {editor.tipoPiezaRecomendado.join(', ')}
                        </p>
                      )}
                      {editor.notas && (
                        <p className="text-xs text-davy-gray mt-2 italic">
                          {editor.notas}
                        </p>
                      )}
                      <p className="text-xs text-davy-gray/70 mt-2">
                        Ultima verificacion: {formatFecha(editor.ultimaVerificacion)}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        onClick={() => handleIniciarEdicion(editor)}
                        disabled={accionLoadingId === editor.id}
                        className="px-3 py-1 text-xs bg-white/10 text-seasalt rounded hover:bg-white/20 transition-colors"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() =>
                          handlePatchSimple(editor.id, {
                            marcarVerificado: true,
                          })
                        }
                        disabled={accionLoadingId === editor.id}
                        className="px-3 py-1 text-xs bg-white/10 text-seasalt rounded hover:bg-white/20 transition-colors disabled:opacity-50"
                      >
                        {accionLoadingId === editor.id
                          ? '...'
                          : 'Verificar hoy'}
                      </button>
                      {editor.activo ? (
                        <button
                          onClick={() =>
                            handlePatchSimple(editor.id, { activo: false })
                          }
                          disabled={accionLoadingId === editor.id}
                          className="px-3 py-1 text-xs bg-red-900/20 text-red-400 rounded hover:bg-red-900/40 transition-colors disabled:opacity-50"
                        >
                          Desactivar
                        </button>
                      ) : (
                        <button
                          onClick={() =>
                            handlePatchSimple(editor.id, { activo: true })
                          }
                          disabled={accionLoadingId === editor.id}
                          className="px-3 py-1 text-xs bg-green-900/20 text-green-400 rounded hover:bg-green-900/40 transition-colors disabled:opacity-50"
                        >
                          Reactivar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Subcomponente: campos del form (reutilizable alta/edicion)
// ─────────────────────────────────────────────────────────
interface FormFieldsProps {
  form: FormState;
  setForm: (f: FormState) => void;
  tenantsDisponibles: TenantLite[];
  toggleTenant: (slug: string) => void;
}

function FormFields({
  form,
  setForm,
  tenantsDisponibles,
  toggleTenant,
}: FormFieldsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label className="block text-xs text-davy-gray mb-1">Nombre *</label>
        <input
          type="text"
          value={form.nombre}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })}
          className="w-full px-3 py-2 bg-oxford-blue border border-white/10 rounded text-seasalt text-sm focus:border-amber-brand focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs text-davy-gray mb-1">Apellido *</label>
        <input
          type="text"
          value={form.apellido}
          onChange={(e) => setForm({ ...form, apellido: e.target.value })}
          className="w-full px-3 py-2 bg-oxford-blue border border-white/10 rounded text-seasalt text-sm focus:border-amber-brand focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs text-davy-gray mb-1">Medio *</label>
        <input
          type="text"
          value={form.medio}
          onChange={(e) => setForm({ ...form, medio: e.target.value })}
          className="w-full px-3 py-2 bg-oxford-blue border border-white/10 rounded text-seasalt text-sm focus:border-amber-brand focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs text-davy-gray mb-1">Seccion</label>
        <input
          type="text"
          value={form.seccion}
          onChange={(e) => setForm({ ...form, seccion: e.target.value })}
          className="w-full px-3 py-2 bg-oxford-blue border border-white/10 rounded text-seasalt text-sm focus:border-amber-brand focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs text-davy-gray mb-1">
          Tier * (entero positivo)
        </label>
        <input
          type="number"
          min="1"
          step="1"
          value={form.tier}
          onChange={(e) => setForm({ ...form, tier: e.target.value })}
          className="w-full px-3 py-2 bg-oxford-blue border border-white/10 rounded text-seasalt text-sm focus:border-amber-brand focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs text-davy-gray mb-1">Email</label>
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="w-full px-3 py-2 bg-oxford-blue border border-white/10 rounded text-seasalt text-sm focus:border-amber-brand focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs text-davy-gray mb-1">Telefono</label>
        <input
          type="text"
          value={form.telefono}
          onChange={(e) => setForm({ ...form, telefono: e.target.value })}
          className="w-full px-3 py-2 bg-oxford-blue border border-white/10 rounded text-seasalt text-sm focus:border-amber-brand focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs text-davy-gray mb-1">
          Tipo de pieza recomendado (separado por comas)
        </label>
        <input
          type="text"
          value={form.tipoPiezaRecomendado}
          onChange={(e) =>
            setForm({ ...form, tipoPiezaRecomendado: e.target.value })
          }
          placeholder="reportaje, columna, entrevista"
          className="w-full px-3 py-2 bg-oxford-blue border border-white/10 rounded text-seasalt text-sm focus:border-amber-brand focus:outline-none placeholder:text-davy-gray/50"
        />
      </div>
      <div className="md:col-span-2">
        <label className="block text-xs text-davy-gray mb-2">
          Tenants relevantes
        </label>
        {tenantsDisponibles.length === 0 ? (
          <p className="text-xs text-davy-gray italic">
            No hay tenants cargados en la base.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {tenantsDisponibles.map((tenant) => (
              <label
                key={tenant.slug}
                className="flex items-center gap-2 text-sm text-seasalt cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={form.tenantsRelevantes.includes(tenant.slug)}
                  onChange={() => toggleTenant(tenant.slug)}
                  className="rounded"
                />
                {tenant.name}
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="md:col-span-2">
        <label className="block text-xs text-davy-gray mb-1">Notas</label>
        <textarea
          value={form.notas}
          onChange={(e) => setForm({ ...form, notas: e.target.value })}
          rows={3}
          className="w-full px-3 py-2 bg-oxford-blue border border-white/10 rounded text-seasalt text-sm focus:border-amber-brand focus:outline-none resize-none"
        />
      </div>
    </div>
  );
}
