'use client';

/**
 * IP+MP Platform — Vista Detalle de Project (Client Component)
 *
 * CHUNK 6 (Abril 2026):
 *   - Generador de Hipótesis periodísticas (reemplaza conceptualmente al Generador de Ángulos)
 *   - Tabs condicionales por fase del pipeline (PHASE_CONFIG)
 *   - Hipótesis con campos nuevos: verificaciones_criticas, evidencia_requerida, riesgo_fabricacion
 *   - Hipótesis elegida persistida en data.hipotesis_elegida y prellenada en Constructor de Pitch
 *   - Radar Editorial (fase pesquisa): audita cobertura externa, historial en data.radar_editorial[]
 *   - Validador de Tono restringido a fase revision, historial en data.validaciones_borrador[]
 *   - Retrocompat: data.angulos y data.validacion_tono legacy se siguen leyendo (solo-read)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
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
  // Chunk 28: editor asignado
  editorId: string | null;
  editorNombre: string | null;
  editorApellido: string | null;
  editorMedio: string | null;
  phase: 'investigapress' | 'metricpress';
  hasTenant: boolean;
  hasTemplate: boolean;
  pipelineIndex: number;
  pipelineTotal: number;
  pipelinePhases: string[];
}

// Hipótesis = estructura nueva (Chunk 6). Los 3 últimos campos son opcionales
// para poder parsear también data.angulos legacy sin reventar.
interface Hipotesis {
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
  verificaciones_criticas?: string[];
  evidencia_requerida?: string;
  riesgo_fabricacion?: string;
}

interface HipotesisData {
  hipotesis: Hipotesis[];
  notaEditorial: string;
  tema: string;
  audiencia?: string;
  datoClave?: string;
  generadoEn: string;
  modo?: string;
}

interface HipotesisElegida extends Hipotesis {
  elegidaEn: string;
}

interface ValidacionDimension {
  dimension: string;
  puntuacion: number;
  hallazgos: string[];
  sugerencias: string[];
}

interface RadarEntry {
  id: string;
  medio: string;
  url: string;
  fecha_publicacion: string;
  notas_propias: string;
  texto_analizado: string;
  evaluacion: ValidacionDimension[];
  puntuacion_global: number;
  veredicto: string;
  resumen: string;
  auditado_en: string;
}

interface ValidacionBorradorEntry {
  id: string;
  texto_analizado: string;
  evaluacion: ValidacionDimension[];
  puntuacion_global: number;
  veredicto: string;
  resumen: string;
  validado_en: string;
}

// Organizador de Fuentes Forenses — Chunk 7
interface Fuente {
  id: string;
  tipo: 'persona' | 'documento' | 'dato' | 'testimonio';
  nombre_titulo: string;
  rol_origen: string;
  estado: 'por_contactar' | 'contactada' | 'verificada' | 'descartada';
  confianza: 'baja' | 'media' | 'alta';
  notas: string;
  fecha_registro: string;
  // Chunk 9C (C1): URL libre opcional. Texto plano sin validacion de formato.
  url?: string;
  // Chunk 15B: archivo adjunto vía Vercel Blob
  archivo_url?: string;
  archivo_nombre?: string;
  // Chunk 16B: historial V1 al reemplazar archivo
  archivo_url_v1?: string;
  archivo_nombre_v1?: string;
  archivo_size_v1?: number;
  archivo_replaced_at?: string;
  // Chunk 29: marca de fuente principal del expediente (solo una por proyecto)
  principal?: boolean;
  // Trazabilidad: cuando una fuente fue auto-promovida desde el VHP (Chunk 7B)
  origen?: 'manual' | 'vhp';
  origen_validacion_id?: string;
}

// Validador de Hipótesis y Pista (VHP) — Chunk 7B
type LeadTipo = 'persona' | 'documento' | 'dato_publico' | 'testimonio' | 'otro';
type LeadAcceso = 'confirmado' | 'probable' | 'especulativo';
type VhpVeredicto = 'viable' | 'viable_con_reservas' | 'no_viable';

interface HipotesisSnapshot {
  titulo: string;
  gancho: string;
  pregunta_clave: string;
  verificaciones_criticas: string[];
  evidencia_requerida: string;
}

interface LeadInput {
  tipo: LeadTipo;
  descripcion: string;
  acceso: LeadAcceso;
  notas: string;
}

interface VhpAiResponse {
  viabilidad_score: number;
  veredicto: VhpVeredicto;
  fortalezas: string[];
  riesgos: string[];
  recomendaciones: string[];
  preguntas_clave: string[];
}

interface ValidacionHipotesisEntry {
  id: string;
  fecha_validacion: string;
  hipotesis_snapshot: HipotesisSnapshot;
  lead_input: LeadInput;
  ai_response: VhpAiResponse;
  promovida_a_fuente: boolean;
}

// Legacy (retrocompat — Chunks 4-5)
interface ValidacionLegacy {
  evaluacion: ValidacionDimension[];
  puntuacion_global: number;
  veredicto: string;
  resumen: string;
  texto: string;
  generadoEn: string;
}

interface AngulosLegacy {
  angulos: Hipotesis[];
  notaEditorial: string;
  tema: string;
  generadoEn: string;
}

// Chunk 11B — Sugerencias de editores
type MatchLevel = 'exacto' | 'sin_tipo' | 'sin_tenant';

interface EditorSugerido {
  editor: {
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
    activo: boolean;
  };
  match: MatchLevel;
}

interface SugerenciasMeta {
  tenantSlug: string;
  tier: number;
  templateFamily: string;
  totalExacto: number;
  totalSinTipo: number;
  totalSinTenant: number;
}

// Generador de Borrador — Chunk 8
interface BorradorSeccion {
  subtitulo: string;
  parrafos: string[];
}

interface BorradorBody {
  titulo: string;
  bajada: string;
  lead: string;
  cuerpo: BorradorSeccion[];
  cierre: string;
}

interface BorradorMetadata {
  extension_palabras: number;
  tipo_pieza: string;
  tono_aplicado: string;
  fuentes_citadas: string[];
  advertencias_verificacion: string[];
  verificaciones_criticas_resueltas: string[];
  verificaciones_criticas_pendientes: string[];
}

interface BorradorData {
  contenido: BorradorBody;       // Chunk 19D: clave nueva (escritura nueva)
  borrador?: BorradorBody;       // clave vieja (solo lectura legacy, no escribir)
  metadata: BorradorMetadata;
  notas_editoriales: string;
  generadoEn: string;
  notasOperador?: string;
  modo?: string;
  // Chunk 12C: campos de auto-invalidacion del borrador.
  fuentes_count_al_generar?: number;
  desactualizado?: boolean;
}

// Chunk 31C-2: Gate 1a — Sanity check de supuestos factuales (fase draft)
type Gate1aVeredicto = 'confirmado' | 'dudoso' | 'falso';
type Gate1aCategoria = 'nombre_propio' | 'denominacion_oficial' | 'fecha' | 'existencia_entidad';
type Gate1aEstado = 'pendiente' | 'en_revision' | 'aprobado';
type Gate1aVeredictoGlobal = 'sano' | 'requiere_correccion';

interface Gate1aSupuesto {
  id: string;
  enunciado: string;
  categoria: Gate1aCategoria;
  veredicto: Gate1aVeredicto;
  justificacion: string;
  correccion_sugerida: string;
}

interface Gate1aResultado {
  supuestos: Gate1aSupuesto[];
  veredicto_global: Gate1aVeredictoGlobal;
  resumen: string;
  ejecutadoEn: string;
  enunciado_evaluado: {
    title: string;
    thesis: string | null;
  };
}

/**
 * Chunk 31I-1: shape del evento de exportacion registrado en backend.
 * Debe mantenerse en sync con Gate1aExportacionEvent declarado local en
 * src/app/api/projects/[id]/export-gate1a/route.ts. Si cambia la shape,
 * actualizar ambos lugares simultaneamente.
 */
interface Gate1aExportacionEvent {
  exportadoEn: string; // ISO timestamp
  supuestosIncluidos: number;
  gate1aVeredictoGlobal: 'sano' | 'requiere_correccion';
}

/**
 * Chunk 31I-3: shape del evento de importacion registrado en backend.
 * Debe mantenerse en sync con Gate1aCorreccionEvent declarado local en
 * src/app/api/projects/[id]/import-gate1a-correccion/route.ts. Si cambia
 * la shape, actualizar ambos lugares simultaneamente.
 */
type Gate1aCorreccionVeredictoFinal =
  | 'confirmado'
  | 'corregido'
  | 'descartado'
  | 'no_resuelto';

interface Gate1aCorreccionSupuesto {
  id: string;
  veredictoFinal: Gate1aCorreccionVeredictoFinal;
  textoCorregido: string | null;
  justificacion: string | null;
  fuentes: string[];
}

interface Gate1aCorreccionEvent {
  id: string;
  importadoEn: string;
  formatoOrigen: 'md' | 'docx';
  nombreArchivo: string;
  enunciadoCorregido: {
    titulo: string | null;
    tesis: string | null;
  };
  supuestos: Gate1aCorreccionSupuesto[];
  fuentesGlobales: string[];
  notaEditorial: string | null;
  aplicado: boolean;
  aplicadoEn: string | null;
  // Chunk 31J: flags de estado de aplicación o descarte
  descartado?: boolean;
  descartadoEn?: string | null;
  warnings: string[];
}

interface Gate1aData {
  estado: Gate1aEstado;
  ultimoResultado: Gate1aResultado | null;
  aprobadoEn: string | null;
  historial: Gate1aResultado[];
  exportaciones?: Gate1aExportacionEvent[]; // Chunk 31I-1 — opcional para retrocompat
  correcciones?: Gate1aCorreccionEvent[]; // Chunk 31I-3 — opcional para retrocompat
}

// Chunk 31D-2: Hito 1 - Validacion de hipotesis elegida (fase hito_1)
type Hito1VeredictoCorrectivo = 'coherente' | 'requiere_reformulacion' | 'inviable';
type Hito1Estado = 'pendiente' | 'en_revision' | 'aprobado';

interface Hito1Dimension {
  pasa: boolean;
  justificacion: string;
}

interface Hito1Correctivo {
  veredicto: Hito1VeredictoCorrectivo;
  dimensiones: {
    coherencia: Hito1Dimension;
    falsabilidad: Hito1Dimension;
    viabilidad_factual: Hito1Dimension;
  };
  problemas_detectados: string[];
  reformulacion_sugerida: string | null;
}

interface Hito1Optimizadora {
  existe_angulo_mejor: boolean;
  angulo_sugerido: string | null;
  justificacion: string;
  trade_offs: string[];
}

interface Hito1Resultado {
  correctivo: Hito1Correctivo;
  optimizadora: Hito1Optimizadora;
  resumen: string;
  ejecutadoEn: string;
  hipotesis_evaluada: HipotesisElegida;
}

interface Hito1Data {
  estado: Hito1Estado;
  ultimoResultado: Hito1Resultado | null;
  aprobadoEn: string | null;
  historial: Hito1Resultado[];
}

// Chunk 20A: imagen visual generada externamente
interface ImagenVisualData {
  url: string;
  nombre: string;
  size: number;
  mimeType: string;
  subidaEn: string;
}

// Chunk 23A: entrada del historial del Validador IP
interface ValidacionIPEntry {
  generadoEn: string;
  score: number;
  apto_para_traspaso: boolean;
  dimensiones: Array<{
    nombre: string;
    puntuacion: number;
    observacion: string;
  }>;
  recomendaciones: string[];
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

type ActiveTool = 'gate_1a' | 'hito_1' | 'hipotesis' | 'vhp' | 'odf' | 'pitch' | 'radar' | 'validador' | 'validador_ip' | 'borrador' | 'borrador_ip' | 'exportador' | 'prompt_visual' | 'vista_previa';

interface PhaseConfig {
  tabs: { key: ActiveTool; label: string; subtitle?: string }[];
  placeholder?: string;
  info?: string;
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

const IP_PHASES = ['draft', 'validacion', 'hito_1', 'pesquisa'];

const TIPO_LABELS: Record<string, string> = {
  noticia: '📰 Noticia',
  analisis: '📊 Análisis',
  cronica: '📖 Crónica',
  investigacion: '🔬 Investigación',
};

const VERIFICACION_COLORS: Record<string, string> = {
  hipotesis: 'bg-amber-brand/20 text-amber-brand border-amber-brand/40',
  requiere_pesquisa: 'bg-red-500/20 text-red-400 border-red-500/40',
};

const RIESGO_FAB_COLORS: Record<string, string> = {
  bajo: 'bg-green-500/20 text-green-400 border-green-500/40',
  medio: 'bg-amber-brand/20 text-amber-brand border-amber-brand/40',
  alto: 'bg-red-500/20 text-red-400 border-red-500/40',
};

const RIESGO_FAB_LABELS: Record<string, string> = {
  bajo: '🟢 Riesgo fabricación: BAJO',
  medio: '🟡 Riesgo fabricación: MEDIO',
  alto: '🔴 Riesgo fabricación: ALTO',
};

const FUENTE_TIPO_LABELS: Record<string, string> = {
  persona: '👤 Persona',
  documento: '📄 Documento',
  dato: '📊 Dato',
  testimonio: '🗣️ Testimonio',
};

const FUENTE_ESTADO_LABELS: Record<string, string> = {
  por_contactar: 'Por contactar',
  contactada: 'Contactada',
  verificada: 'Verificada',
  descartada: 'Descartada',
};

const FUENTE_ESTADO_COLORS: Record<string, string> = {
  por_contactar: 'bg-davy-gray/20 text-davy-gray border-davy-gray/40',
  contactada: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
  verificada: 'bg-green-500/20 text-green-400 border-green-500/40',
  descartada: 'bg-red-500/20 text-red-400 border-red-500/40',
};

const FUENTE_CONFIANZA_COLORS: Record<string, string> = {
  baja: 'bg-red-500/20 text-red-400 border-red-500/40',
  media: 'bg-amber-brand/20 text-amber-brand border-amber-brand/40',
  alta: 'bg-green-500/20 text-green-400 border-green-500/40',
};

// Chunk 31C-2: labels y colores del Gate 1a
const GATE_1A_CATEGORIA_LABELS: Record<Gate1aCategoria, string> = {
  nombre_propio: 'Nombre propio',
  denominacion_oficial: 'Denominación oficial',
  fecha: 'Fecha',
  existencia_entidad: 'Existencia de entidad',
};

const GATE_1A_VEREDICTO_LABELS: Record<Gate1aVeredicto, { label: string; color: string }> = {
  confirmado: { label: 'Confirmado', color: 'bg-green-100 text-green-800 border-green-300' },
  dudoso: { label: 'Dudoso', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  falso: { label: 'Falso', color: 'bg-red-100 text-red-800 border-red-300' },
};

const GATE_1A_GLOBAL_LABELS: Record<Gate1aVeredictoGlobal, { label: string; color: string; descripcion: string }> = {
  sano: {
    label: 'Enunciado sano',
    color: 'bg-green-50 text-green-900 border-green-300',
    descripcion: 'No se detectaron supuestos factuales problemáticos. Puedes aprobar la revisión y avanzar a Validación.',
  },
  requiere_correccion: {
    label: 'Requiere corrección',
    color: 'bg-yellow-50 text-yellow-900 border-yellow-300',
    descripcion: 'Se detectaron supuestos dudosos o falsos. Revisa los hallazgos, corrige el enunciado si corresponde, y re-ejecuta la revisión. Si aun así decides aprobar, el veredicto queda registrado para trazabilidad editorial.',
  },
};

// Validador de Hipótesis y Pista (Chunk 7B)
const LEAD_TIPO_LABELS: Record<LeadTipo, string> = {
  persona: '👤 Persona',
  documento: '📄 Documento',
  dato_publico: '📊 Dato público',
  testimonio: '🗣️ Testimonio',
  otro: '🔗 Otro',
};

const LEAD_ACCESO_LABELS: Record<LeadAcceso, string> = {
  confirmado: 'Confirmado',
  probable: 'Probable',
  especulativo: 'Especulativo',
};

const LEAD_ACCESO_COLORS: Record<LeadAcceso, string> = {
  confirmado: 'bg-green-500/20 text-green-400 border-green-500/40',
  probable: 'bg-amber-brand/20 text-amber-brand border-amber-brand/40',
  especulativo: 'bg-red-500/20 text-red-400 border-red-500/40',
};

const VHP_VEREDICTO_LABELS: Record<VhpVeredicto, { label: string; color: string }> = {
  viable: { label: '✅ Viable', color: 'text-green-400' },
  viable_con_reservas: { label: '⚠️ Viable con reservas', color: 'text-amber-brand' },
  no_viable: { label: '❌ No viable', color: 'text-red-400' },
};

const VEREDICTO_LABELS: Record<string, { label: string; color: string }> = {
  publicable: { label: '✅ Publicable', color: 'text-green-400' },
  publicable_con_cambios: { label: '⚠️ Publicable con cambios', color: 'text-amber-brand' },
  requiere_revision: { label: '🔄 Requiere revisión', color: 'text-orange-400' },
  no_publicable: { label: '❌ No publicable', color: 'text-red-400' },
};

const TEMPLATE_DESCRIPTIONS: Record<string, string> = {
  'reportaje-profundidad': 'Pieza de largo aliento con fuentes verificadas. 1.500–4.000 palabras.',
  'cronica-narrativa': 'Narrativa periodística con estructura literaria. 900–2.500 palabras.',
  'nota-prensa': 'Comunicado institucional formal. 400–800 palabras.',
  'columna-opinion': 'Análisis firmado con posición editorial explícita. 500–900 palabras.',
  'editorial': 'Posición institucional en voz colectiva. 400–700 palabras.',
  'carta-director': 'Una sola idea clara, máximo 300 palabras.',
  'paper-academico': 'Documento con estructura IMRAD y referencias bibliográficas. 2.500–6.000 palabras.',
  'asesoria-legislativa': 'Informe técnico para tomadores de decisión. Toda referencia normativa lleva [VERIFICAR].',
  'white-paper': 'Documento de posición institucional con evidencia técnica. 1.800–4.000 palabras.',
  'informe-tecnico': 'Informe estructurado con metodología y hallazgos. 1.500–3.500 palabras.',
  'investigacion-forense': 'Investigación rigurosa con cadena de custodia de fuentes. 2.500–5.000 palabras.',
  'minuta-ejecutiva': 'Resumen ejecutivo para directivos. 1–2 páginas.',
  'entrevista': 'Perfil periodístico basado en conversación directa. 800–2.000 palabras.',
};

const FAMILY_LABELS: Record<string, string> = {
  prensa: 'Prensa',
  opinion: 'Opinión',
  institucional: 'Institucional',
  academico: 'Académico',
};

const PHASE_CONFIG: Record<string, PhaseConfig> = {
  draft: {
    tabs: [
      { key: 'gate_1a', label: '🛡️ Revisión de supuestos', subtitle: 'Audita los supuestos factuales del enunciado antes de generar hipótesis' },
    ],
    info: 'Antes de generar hipótesis, ejecuta la Revisión de supuestos factuales. Este paso verifica que nombres propios, denominaciones oficiales, fechas y entidades referidas en el título y la tesis sean correctos.',
  },
  validacion: {
    tabs: [
      { key: 'hipotesis', label: '🔬 Generador de Hipótesis', subtitle: 'Genera hipotesis periodisticas a partir del tema del proyecto' },
      { key: 'vhp', label: '🧪 Validador de Hipótesis y Pista', subtitle: 'Evalua la viabilidad de un lead contra la hipotesis elegida' },
    ],
  },
  hito_1: {
    tabs: [
      { key: 'hito_1', label: '🎯 Hito 1 - Validacion de Hipotesis', subtitle: 'Valida la hipotesis elegida antes de abrir pesquisa: coherencia, falsabilidad, viabilidad factual + angulo optimo' },
    ],
    info: 'La hipotesis elegida debe pasar una validacion critica antes de invertir trabajo de pesquisa. El Hito 1 audita tres dimensiones (coherencia interna, falsabilidad, viabilidad factual) como gate bloqueante y propone un angulo mejor si existe (informativo).',
  },
  pesquisa: {
    tabs: [
      { key: 'odf', label: '🗂️ Organizador de Fuentes', subtitle: 'Registra y gestiona las fuentes documentales del expediente' },
      { key: 'borrador_ip', label: '📄 Documento de Investigacion', subtitle: 'Genera el documento base de investigacion a partir del expediente' },
      { key: 'validador_ip', label: '✅ Validador IP', subtitle: 'Evalua la calidad del documento de investigacion antes del traspaso' },
      { key: 'radar', label: '📡 Radar Editorial', subtitle: 'Audita cobertura externa del tema en otros medios' },
    ],
  },
  produccion: {
    tabs: [
      { key: 'borrador', label: '✍️ Generador de Borrador', subtitle: 'Produce el borrador editorial con genero y voz de marca' },
    ],
  },
  visual: {
    tabs: [
      { key: 'prompt_visual', label: '🎨 Generador de Prompt Visual', subtitle: 'Crea un prompt estructurado para generar la imagen editorial' },
    ],
  },
  revision: {
    tabs: [{ key: 'validador', label: '✅ Revision del Borrador', subtitle: 'El borrador fue validado en fase Pesquisa (Validador IP). Revisa el score antes de avanzar a Aprobado.' }],
  },
  aprobado: {
    tabs: [
      { key: 'vista_previa', label: '👁️ Vista Previa — Lectura Final', subtitle: 'Revision tipografica del borrador aprobado antes de exportar' },
    ],
  },
  exportado: {
    tabs: [{ key: 'exportador', label: '📦 Exportar proyecto', subtitle: 'Descarga el ZIP con todos los artefactos del proyecto' }],
  },
};

// ══════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════
function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Chunk 18B: derivar MIME type de un nombre de archivo
function getMimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    txt: 'text/plain',
    csv: 'text/csv',
    md: 'text/plain',
  };
  return map[ext] ?? '';
}

function parseHipotesisFromRaw(a: Record<string, unknown>, idx: number): Hipotesis {
  return {
    numero: Number(a.numero ?? idx + 1),
    tipo: String(a.tipo ?? a.type ?? 'noticia'),
    titulo: String(a.titulo ?? a.title ?? 'Sin título'),
    gancho: String(a.gancho ?? a.hook ?? ''),
    audiencia: String(a.audiencia ?? a.audience ?? ''),
    tono: String(a.tono ?? a.tone ?? ''),
    lentes: Array.isArray(a.lentes) ? a.lentes.map(String) : [],
    fuentes: Array.isArray(a.fuentes_sugeridas)
      ? (a.fuentes_sugeridas as Hipotesis['fuentes'])
      : Array.isArray(a.fuentes)
      ? (a.fuentes as Hipotesis['fuentes'])
      : [],
    verificacion: String(a.verificacion ?? ''),
    pregunta_clave: String(a.pregunta_clave ?? ''),
    riesgo:
      typeof a.riesgo === 'object' && a.riesgo
        ? `${(a.riesgo as Record<string, unknown>).nivel ?? ''} — ${
            (a.riesgo as Record<string, unknown>).justificacion ?? ''
          }`
        : String(a.riesgo ?? ''),
    verificaciones_criticas: Array.isArray(a.verificaciones_criticas)
      ? (a.verificaciones_criticas as unknown[]).map(String)
      : undefined,
    evidencia_requerida:
      typeof a.evidencia_requerida === 'string' ? a.evidencia_requerida : undefined,
    riesgo_fabricacion:
      typeof a.riesgo_fabricacion === 'string' ? a.riesgo_fabricacion : undefined,
  };
}

function parseFuenteFromRaw(f: Record<string, unknown>): Fuente {
  const tipoRaw = String(f.tipo ?? '');
  const tipo: Fuente['tipo'] =
    tipoRaw === 'persona' || tipoRaw === 'documento' || tipoRaw === 'dato' || tipoRaw === 'testimonio'
      ? tipoRaw
      : 'documento';

  const estadoRaw = String(f.estado ?? '');
  const estado: Fuente['estado'] =
    estadoRaw === 'por_contactar' ||
    estadoRaw === 'contactada' ||
    estadoRaw === 'verificada' ||
    estadoRaw === 'descartada'
      ? estadoRaw
      : 'por_contactar';

  const confianzaRaw = String(f.confianza ?? '');
  const confianza: Fuente['confianza'] =
    confianzaRaw === 'baja' || confianzaRaw === 'media' || confianzaRaw === 'alta'
      ? confianzaRaw
      : 'media';

  const origenRaw = String(f.origen ?? '');
  const origen: Fuente['origen'] | undefined =
    origenRaw === 'manual' || origenRaw === 'vhp' ? origenRaw : undefined;

  return {
    id: typeof f.id === 'string' && f.id ? f.id : genId(),
    tipo,
    nombre_titulo: String(f.nombre_titulo ?? ''),
    rol_origen: String(f.rol_origen ?? ''),
    estado,
    confianza,
    notas: String(f.notas ?? ''),
    url: typeof f.url === 'string' && f.url ? f.url : undefined,
    archivo_url: typeof f.archivo_url === 'string' ? f.archivo_url : undefined,
    archivo_nombre: typeof f.archivo_nombre === 'string' ? f.archivo_nombre : undefined,
    archivo_url_v1: typeof f.archivo_url_v1 === 'string' ? f.archivo_url_v1 : undefined,
    archivo_nombre_v1: typeof f.archivo_nombre_v1 === 'string' ? f.archivo_nombre_v1 : undefined,
    archivo_size_v1: typeof f.archivo_size_v1 === 'number' ? f.archivo_size_v1 : undefined,
    archivo_replaced_at: typeof f.archivo_replaced_at === 'string' ? f.archivo_replaced_at : undefined,
    fecha_registro:
      typeof f.fecha_registro === 'string' && f.fecha_registro
        ? f.fecha_registro
        : new Date().toISOString(),
    origen,
    origen_validacion_id:
      typeof f.origen_validacion_id === 'string' ? f.origen_validacion_id : undefined,
    // Chunk 29: marca de fuente principal
    principal: f.principal === true ? true : undefined,
  };
}

function parseBorradorFromRaw(raw: Record<string, unknown>): BorradorData | null {
  if (!raw || typeof raw !== 'object') return null;

  // Chunk 19D: lectura dual — clave nueva 'contenido' tiene prioridad sobre 'borrador' (legacy)
  const contenidoRaw = (raw.contenido ?? raw.borrador) as Record<string, unknown> | undefined;
  if (!contenidoRaw || typeof contenidoRaw !== 'object') return null;

  const cuerpoRaw = Array.isArray(contenidoRaw.cuerpo) ? contenidoRaw.cuerpo : [];
  const cuerpo: BorradorSeccion[] = cuerpoRaw.map((s) => {
    const sec = s as Record<string, unknown>;
    return {
      subtitulo: typeof sec.subtitulo === 'string' ? sec.subtitulo : '',
      parrafos: Array.isArray(sec.parrafos) ? (sec.parrafos as unknown[]).map(String) : [],
    };
  });

  const contenido: BorradorBody = {
    titulo: typeof contenidoRaw.titulo === 'string' ? contenidoRaw.titulo : 'Sin titulo',
    bajada: typeof contenidoRaw.bajada === 'string' ? contenidoRaw.bajada : '',
    lead: typeof contenidoRaw.lead === 'string' ? contenidoRaw.lead : '',
    cuerpo,
    cierre: typeof contenidoRaw.cierre === 'string' ? contenidoRaw.cierre : '',
  };

  const metadataRaw = (raw.metadata ?? {}) as Record<string, unknown>;
  const metadata: BorradorMetadata = {
    extension_palabras:
      typeof metadataRaw.extension_palabras === 'number' ? metadataRaw.extension_palabras : 0,
    tipo_pieza: typeof metadataRaw.tipo_pieza === 'string' ? metadataRaw.tipo_pieza : '',
    tono_aplicado: typeof metadataRaw.tono_aplicado === 'string' ? metadataRaw.tono_aplicado : '',
    fuentes_citadas: Array.isArray(metadataRaw.fuentes_citadas)
      ? (metadataRaw.fuentes_citadas as unknown[]).map(String)
      : [],
    advertencias_verificacion: Array.isArray(metadataRaw.advertencias_verificacion)
      ? (metadataRaw.advertencias_verificacion as unknown[]).map(String)
      : [],
    verificaciones_criticas_resueltas: Array.isArray(metadataRaw.verificaciones_criticas_resueltas)
      ? (metadataRaw.verificaciones_criticas_resueltas as unknown[]).map(String)
      : [],
    verificaciones_criticas_pendientes: Array.isArray(
      metadataRaw.verificaciones_criticas_pendientes
    )
      ? (metadataRaw.verificaciones_criticas_pendientes as unknown[]).map(String)
      : [],
  };

  const notas = typeof raw.notas_editoriales === 'string' ? raw.notas_editoriales : '';
  const generadoEn = typeof raw.generadoEn === 'string' ? raw.generadoEn : new Date().toISOString();
  const notasOperador = typeof raw.notasOperador === 'string' ? raw.notasOperador : undefined;
  const modo = typeof raw.modo === 'string' ? raw.modo : undefined;

  return { contenido, metadata, notas_editoriales: notas, generadoEn, notasOperador, modo };
}

// Chunk 19B: construye texto plano del borrador para el Validador de Tono
// y para el botón "Copiar al portapapeles". Reutilizable.
function buildBorradorTextoPlano(data: BorradorData): string {
  const c = data.contenido;
  const partes: string[] = [];
  if (c.titulo) partes.push(c.titulo);
  if (c.bajada) partes.push(c.bajada);
  if (c.lead) partes.push(c.lead);
  c.cuerpo.forEach((sec) => {
    if (sec.subtitulo) partes.push(sec.subtitulo);
    sec.parrafos.forEach((p) => partes.push(p));
  });
  if (c.cierre) partes.push(c.cierre);
  return partes.join('\n\n');
}

// Chunk 12B: builder del texto del exportador de pesquisa externa.
// Genera el prompt pre-formateado que el operador va a copiar y
// pegar en una conversacion nueva de Claude.ai (el motor de
// investigacion externo, con web search nativa).
function buildTextoExportadorPesquisa(
  proj: ProjectDetail,
  borrador: BorradorData
): string {
  const titulo = proj.title || '(sin titulo)';
  const fase = proj.status || '(sin fase)';

  const hipotesisElegida = (proj.data?.hipotesis_elegida as Record<string, unknown>) ?? null;
  const hipotesisTitulo =
    hipotesisElegida && typeof hipotesisElegida.titulo === 'string'
      ? hipotesisElegida.titulo
      : '(sin hipotesis elegida)';

  const verificacionesPendientes = Array.isArray(borrador.metadata?.verificaciones_criticas_pendientes)
    ? borrador.metadata.verificaciones_criticas_pendientes
    : [];

  const advertencias = Array.isArray(borrador.metadata?.advertencias_verificacion)
    ? borrador.metadata.advertencias_verificacion
    : [];

  const tenantSlug = proj.tenantSlug ?? null;
  let geografiaInstruccion: string;
  if (tenantSlug === 'dreamoms') {
    geografiaInstruccion = 'Geografia: prioriza fuentes de Chile (medios chilenos, instituciones chilenas, archivos academicos chilenos). Cuando una pregunta requiera contexto regional, puedes incluir fuentes del Cono Sur en general.';
  } else {
    geografiaInstruccion = 'Geografia: prioriza fuentes en espanol de cualquier pais de habla hispana, especialmente del Cono Sur (Chile, Argentina, Uruguay) cuando aplique al tema.';
  }

  const bloque1 = 'Necesito ayuda para investigar un conjunto de verificaciones criticas pendientes para una nota periodistica. Este es el contexto del project:';

  const bloque2 = `PROJECT: ${titulo}
FASE ACTUAL: ${fase}
HIPOTESIS ELEGIDA: ${hipotesisTitulo}`;

  const bloque3 =
    verificacionesPendientes.length > 0
      ? 'VERIFICACIONES CRITICAS PENDIENTES (estas son las preguntas estructurales que necesito que investigues con prioridad alta):\n' +
        verificacionesPendientes
          .map((v, i) => `${i + 1}. ${v}`)
          .join('\n')
      : 'VERIFICACIONES CRITICAS PENDIENTES: (ninguna registrada — el borrador no tiene este campo o esta vacio)';

  const bloque4 =
    advertencias.length > 0
      ? 'OTRAS SENALES DEL BORRADOR QUE PUEDEN NECESITAR VERIFICACION (contexto secundario, no son las preguntas principales):\n' +
        advertencias.map((a) => `- ${a}`).join('\n')
      : '';

  const bloque5 = `INSTRUCCIONES PARA VOS, CLAUDE.AI:
Por favor investiga cada pregunta numerada de la seccion "VERIFICACIONES CRITICAS PENDIENTES" usando tu herramienta de busqueda web nativa. Para cada hallazgo devolveme:
(a) el hallazgo en una o dos oraciones,
(b) la fuente original con URL si aplica,
(c) tu nivel de confianza (alta / media / baja),
(d) una cita textual breve cuando corresponda.

Si una pregunta no tiene respuesta clara en fuentes confiables, decimelo explicitamente en vez de inventar una respuesta plausible. Es preferible que me reportes "no encontre evidencia confiable sobre X" antes que entregarme un hallazgo dudoso.

Una vez que tengas los hallazgos, los voy a cargar manualmente como fuentes en mi plataforma (en el Organizador de Fuentes Forenses), y desde ahi el sistema regenera el borrador con la evidencia incorporada.`;

  const bloque6 = `IDIOMA Y GEOGRAFIA:
Idioma: espanol neutro internacional, sin regionalismos rioplatenses ("vos", "tenes", "queres") ni chilenismos.
${geografiaInstruccion}`;

  const bloques = [bloque1, bloque2, bloque3];
  if (bloque4) bloques.push(bloque4);
  bloques.push(bloque5, bloque6);

  return bloques.join('\n\n');
}

function parseValidacionHipotesisFromRaw(
  v: Record<string, unknown>
): ValidacionHipotesisEntry {
  const snapRaw = (v.hipotesis_snapshot as Record<string, unknown>) ?? {};
  const leadRaw = (v.lead_input as Record<string, unknown>) ?? {};
  const aiRaw = (v.ai_response as Record<string, unknown>) ?? {};

  const tipoLeadRaw = String(leadRaw.tipo ?? '');
  const tipoLead: LeadTipo =
    tipoLeadRaw === 'persona' ||
    tipoLeadRaw === 'documento' ||
    tipoLeadRaw === 'dato_publico' ||
    tipoLeadRaw === 'testimonio' ||
    tipoLeadRaw === 'otro'
      ? tipoLeadRaw
      : 'otro';

  const accesoRaw = String(leadRaw.acceso ?? '');
  const acceso: LeadAcceso =
    accesoRaw === 'confirmado' || accesoRaw === 'probable' || accesoRaw === 'especulativo'
      ? accesoRaw
      : 'especulativo';

  const veredictoRaw = String(aiRaw.veredicto ?? '');
  const veredicto: VhpVeredicto =
    veredictoRaw === 'viable' ||
    veredictoRaw === 'viable_con_reservas' ||
    veredictoRaw === 'no_viable'
      ? veredictoRaw
      : 'no_viable';

  const toStringArr = (x: unknown): string[] =>
    Array.isArray(x) ? (x as unknown[]).map(String) : [];

  return {
    id: typeof v.id === 'string' && v.id ? v.id : genId(),
    fecha_validacion: String(v.fecha_validacion ?? ''),
    hipotesis_snapshot: {
      titulo: String(snapRaw.titulo ?? ''),
      gancho: String(snapRaw.gancho ?? ''),
      pregunta_clave: String(snapRaw.pregunta_clave ?? ''),
      verificaciones_criticas: toStringArr(snapRaw.verificaciones_criticas),
      evidencia_requerida: String(snapRaw.evidencia_requerida ?? ''),
    },
    lead_input: {
      tipo: tipoLead,
      descripcion: String(leadRaw.descripcion ?? ''),
      acceso,
      notas: String(leadRaw.notas ?? ''),
    },
    ai_response: {
      viabilidad_score: Number(aiRaw.viabilidad_score ?? 0),
      veredicto,
      fortalezas: toStringArr(aiRaw.fortalezas),
      riesgos: toStringArr(aiRaw.riesgos),
      recomendaciones: toStringArr(aiRaw.recomendaciones),
      preguntas_clave: toStringArr(aiRaw.preguntas_clave),
    },
    promovida_a_fuente: v.promovida_a_fuente === true,
  };
}

function parseValidacionDimensions(arr: unknown): ValidacionDimension[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((d) => {
    const dim = d as Record<string, unknown>;
    return {
      dimension: String(dim.dimension ?? ''),
      puntuacion: Number(dim.puntuacion ?? 0),
      hallazgos: Array.isArray(dim.hallazgos) ? (dim.hallazgos as unknown[]).map(String) : [],
      sugerencias: Array.isArray(dim.sugerencias)
        ? (dim.sugerencias as unknown[]).map(String)
        : [],
    };
  });
}

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
  const [exportGateConditions, setExportGateConditions] = useState<
    Array<{ id: string; passed: boolean; descripcion: string; soft?: boolean }> | null
  >(null);
  const [c4Ack, setC4Ack] = useState(false);
  const [tenantsList, setTenantsList] = useState<TenantOption[]>([]);
  const [templatesList, setTemplatesList] = useState<TemplateOption[]>([]);
  const [traspasoTenant, setTraspasoTenant] = useState('');
  const [traspasoTemplate, setTraspasoTemplate] = useState('');
  const [traspasoBrandVariant, setTraspasoBrandVariant] = useState('');
  const [traspasoLoading, setTraspasoLoading] = useState(false);
  const [traspasoError, setTraspasoError] = useState<string | null>(null);
  const [traspasoScoreAck, setTraspasoScoreAck] = useState(false);

  // Generador de Hipótesis
  const [hipTema, setHipTema] = useState('');
  const [hipAudiencia, setHipAudiencia] = useState('');
  const [hipDato, setHipDato] = useState('');
  const [generandoHip, setGenerandoHip] = useState(false);
  const [hipError, setHipError] = useState<string | null>(null);
  const [eligiendo, setEligiendo] = useState<number | null>(null);

  // Chunk 24C: estados del Constructor de Pitch y panel de editores eliminados

  // Radar Editorial
  const [radarMedio, setRadarMedio] = useState('');
  const [radarUrl, setRadarUrl] = useState('');
  const [radarFecha, setRadarFecha] = useState('');
  const [radarNotas, setRadarNotas] = useState('');
  const [radarTexto, setRadarTexto] = useState('');
  const [auditandoRadar, setAuditandoRadar] = useState(false);
  const [radarError, setRadarError] = useState<string | null>(null);
  const [expandedRadar, setExpandedRadar] = useState<string | null>(null);

  // Validador de Tono del Borrador (fase revision)
  // Chunk 24B: estados del Validador de Tono MP eliminados (borradorTexto, validandoBorrador, borradorError)
  const [expandedBorrador, setExpandedBorrador] = useState<string | null>(null);

  // Validador de Tono del Borrador IP (fase pesquisa) — Chunk 19C
  const [ipValidadorTexto, setIpValidadorTexto] = useState('');
  const [ipValidandoBorrador, setIpValidandoBorrador] = useState(false);
  const [ipValidadorError, setIpValidadorError] = useState<string | null>(null);
  const [ipResultadoValidacion, setIpResultadoValidacion] = useState<{
    score: number;
    resumen_ejecutivo: string;
    dimensiones: { nombre: string; score: number; observacion: string }[];
    recomendaciones: string[];
    apto_para_traspaso: boolean;
  } | null>(null);
  const [showHistorialIP, setShowHistorialIP] = useState(false);

  // Validador de Hipótesis y Pista (VHP) — Chunk 7B
  const [vhpTipoLead, setVhpTipoLead] = useState<LeadTipo>('documento');
  const [vhpDescripcion, setVhpDescripcion] = useState('');
  const [vhpAcceso, setVhpAcceso] = useState<LeadAcceso>('probable');
  const [vhpNotas, setVhpNotas] = useState('');
  const [validandoVhp, setValidandoVhp] = useState(false);
  const [vhpError, setVhpError] = useState<string | null>(null);
  const [expandedVhp, setExpandedVhp] = useState<string | null>(null);

  // Organizador de Fuentes Forenses (ODF) — Chunk 7
  const [odfTipo, setOdfTipo] = useState<Fuente['tipo']>('documento');
  const [odfNombreTitulo, setOdfNombreTitulo] = useState('');
  const [odfRolOrigen, setOdfRolOrigen] = useState('');
  const [odfEstado, setOdfEstado] = useState<Fuente['estado']>('por_contactar');
  const [odfConfianza, setOdfConfianza] = useState<Fuente['confianza']>('media');
  const [odfNotas, setOdfNotas] = useState('');
  // Chunk 9C (C1): URL libre opcional por fuente
  const [odfUrl, setOdfUrl] = useState('');
  const [odfGuardando, setOdfGuardando] = useState(false);
  const [odfError, setOdfError] = useState<string | null>(null);
  const [odfEditandoId, setOdfEditandoId] = useState<string | null>(null);
  // Chunk 15B: upload de archivos por fuente
  const [odfUploadingId, setOdfUploadingId] = useState<string | null>(null);
  const [odfUploadError, setOdfUploadError] = useState<string | null>(null);

  // Active tool (default se reajusta por useEffect según fase)
  const [activeTool, setActiveTool] = useState<ActiveTool>('gate_1a');

  // Chunk 31C-2: Gate 1a — estados locales
  const [gate1aLoading, setGate1aLoading] = useState(false);
  const [gate1aError, setGate1aError] = useState<string | null>(null);
  const [gate1aAprobando, setGate1aAprobando] = useState(false);
  const [gate1aEditandoEnunciado, setGate1aEditandoEnunciado] = useState(false);
  // Chunk 31I-2: estado del exportador de supuestos del Gate 1a
  const [exportandoGate1a, setExportandoGate1a] = useState(false);
  // Chunk 31I-3: estado del importador de correcciones del Gate 1a
  const [importandoGate1a, setImportandoGate1a] = useState(false);
  const importGate1aInputRef = useRef<HTMLInputElement | null>(null);
  // Chunk 31J-2: estado del handler de aplicar correcciones
  const [aplicandoCorreccionId, setAplicandoCorreccionId] = useState<string | null>(null);
  const [gate1aEditTitle, setGate1aEditTitle] = useState('');
  const [gate1aEditThesis, setGate1aEditThesis] = useState('');
  const [gate1aGuardandoEnunciado, setGate1aGuardandoEnunciado] = useState(false);
  const [gate1aVerHistorial, setGate1aVerHistorial] = useState(false);

  // Chunk 31D-2: Hito 1 - estados locales
  const [ejecutandoHito1, setEjecutandoHito1] = useState(false);
  const [aprobandoHito1, setAprobandoHito1] = useState(false);
  const [hito1Error, setHito1Error] = useState<string | null>(null);
  const [verHistorialHito1, setVerHistorialHito1] = useState(false);

  // Generador de Borrador — Chunk 8
  const [borradorOperadorNotas, setBorradorOperadorNotas] = useState('');
  const [generandoBorrador, setGenerandoBorrador] = useState(false);
  const [genBorradorError, setGenBorradorError] = useState<string | null>(null);

  // Chunk 18B: Generador de Borrador InvestigaPress (fase pesquisa)
  const [borradorIPNotas, setBorradorIPNotas] = useState('');
  const [generandoBorradorIP, setGenerandoBorradorIP] = useState(false);
  const [genBorradorIPError, setGenBorradorIPError] = useState<string | null>(null);
  const [borradorIPTruncWarnings, setBorradorIPTruncWarnings] = useState<string[]>([]);

  // Chunk 12B: modal del exportador de pesquisa externa
  const [exportadorAbierto, setExportadorAbierto] = useState(false);
  const [exportadorCopiado, setExportadorCopiado] = useState(false);

  // Chunk 13B: exportador ZIP de fase exportado
  const [exportandoZip, setExportandoZip] = useState(false);
  const [exportZipError, setExportZipError] = useState<string | null>(null);

  // Chunk 14B: generador de prompt visual
  const [generandoPromptVisual, setGenerandoPromptVisual] = useState(false);
  const [genPromptVisualError, setGenPromptVisualError] = useState<string | null>(null);

  // Chunk 20A: upload de imagen visual
  const [subiendoImagenVisual, setSubiendoImagenVisual] = useState(false);
  const [imagenVisualError, setImagenVisualError] = useState<string | null>(null);

  // Chunk 28 — asignacion de editor al proyecto
  interface EditorOption {
    id: string;
    nombre: string;
    apellido: string;
    medio: string;
    activo: boolean;
  }
  const [editoresList, setEditoresList] = useState<EditorOption[]>([]);
  const [asignandoEditor, setAsignandoEditor] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorSavedFlash, setEditorSavedFlash] = useState(false);

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

  // Chunk 28 — cargar lista de editores al montar
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/editores');
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Error cargando editores');
        if (Array.isArray(json.editores)) {
          setEditoresList(json.editores as EditorOption[]);
        }
      } catch (err) {
        console.error('[editores] load error:', err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chunk 28 — asignar/desasignar editor al proyecto
  async function handleAsignarEditor(editorId: string | null) {
    if (!project) return;
    setAsignandoEditor(true);
    setEditorError(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editorId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error asignando editor');
      await fetchProject();
      setEditorSavedFlash(true);
      setTimeout(() => setEditorSavedFlash(false), 1500);
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setAsignandoEditor(false);
    }
  }

  // ── Ajustar tab activo cuando cambia la fase ──
  useEffect(() => {
    if (!project) return;
    const cfg = PHASE_CONFIG[project.status];
    if (!cfg || cfg.tabs.length === 0) return;
    const validTools = cfg.tabs.map((t) => t.key);
    if (!validTools.includes(activeTool)) {
      setActiveTool(validTools[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.status]);

  // Chunk 13A: eliminado useEffect de prefill pitchAngulo desde hipotesis
  // (codigo muerto post-12E: el Constructor de Pitch ahora consume data.borrador).

  // Chunk 9B (B1): prefill del textarea de notas del operador del Generador de Borrador
  // desde data.borrador.notasOperador al montar/cambiar el project, si el textarea local
  // esta vacio. Patron identico al prefill del Constructor de Pitch.
  useEffect(() => {
    if (!project) return;
    const dataObj = (project.data ?? {}) as Record<string, unknown>;
    const borradorRaw = dataObj.borrador as Record<string, unknown> | undefined;
    const notasPersistidas =
      typeof borradorRaw?.notasOperador === 'string' ? borradorRaw.notasOperador : '';
    if (notasPersistidas && !borradorOperadorNotas.trim()) {
      setBorradorOperadorNotas(notasPersistidas);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  // Chunk 19C: prefill del textarea del Validador IP desde data.borrador_ip
  useEffect(() => {
    if (!project) return;
    if (ipValidadorTexto.trim()) return;
    const dataObj = (project.data ?? {}) as Record<string, unknown>;
    const borradorIPRaw = dataObj.borrador_ip as Record<string, unknown> | undefined;
    if (borradorIPRaw) {
      const parsed = parseBorradorFromRaw(borradorIPRaw);
      if (parsed) {
        setIpValidadorTexto(buildBorradorTextoPlano(parsed));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

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
      // Silencioso
    }
  }

  // ── Pipeline actions ──
  async function handlePipelineAction(action: 'advance' | 'retreat') {
    if (!project || actionLoading) return;

    // Chunk 9C (E1): Soft gates confirmables en transiciones criticas del pipeline.
    // No reemplazan el hard-block del traspaso (que sigue activo abajo).
    // Chunk 31D-2: Soft gate 9C eliminado. Reemplazado por hard gate
    // HIPOTESIS_ELEGIDA_REQUIRED del backend (Chunk 31D-1) que opera
    // en la transicion validacion -> hito_1.
    // Chunk 31L-2: soft gate de fuentes vacias eliminado. Reemplazado por
    // hard gate FUENTES_REQUIRED del backend (Chunk 31L-1, commit 6bf052b) que
    // opera en la transicion pesquisa -> produccion con codigo de error explicito.
    // Chunk 12C: soft gate de avance produccion -> revision con borrador desactualizado.
    if (action === 'advance' && project.status === 'produccion') {
      const dataObj = (project.data ?? {}) as Record<string, unknown>;
      const borrador = dataObj.borrador as Record<string, unknown> | null;
      if (borrador?.desactualizado === true) {
        const ok = confirm(
          'El borrador no refleja las fuentes mas recientes del ODF. ' +
          'Si avanzas a Revision ahora, vas a validar un borrador ' +
          'desactualizado.\n\n' +
          '¿Avanzar de todos modos?'
        );
        if (!ok) return;
      }
    }

    if (action === 'advance' && project.status === 'pesquisa' && !project.hasTenant) {
      setTraspasoScoreAck(false);
      setShowTraspaso(true);
      loadConfig();
      return;
    }

    setActionLoading(true);
    try {
      const patchBody: Record<string, unknown> = { action };
      if (action === 'advance' && project.status === 'visual' && c4Ack) {
        patchBody.c4Acknowledged = true;
      }
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.code === 'TRASPASO_REQUIRED') {
          setTraspasoScoreAck(false);
          setShowTraspaso(true);
          loadConfig();
          return;
        }
        if (json.code === 'EXPORT_GATE_FAILED') {
          setExportGateConditions(json.conditions);
          return;
        }
        if (json.code === 'C4_ACK_REQUIRED') {
          setExportGateConditions(json.conditions);
          return;
        }
        if (json.code === 'BORRADOR_IP_REQUIRED') {
          alert(json.error);
          return;
        }
        if (json.code === 'FUENTES_REQUIRED') {
          alert(json.error);
          setActiveTool('odf');
          return;
        }
        if (json.code === 'GATE_1A_REQUIRED') {
          alert(json.error);
          setActiveTool('gate_1a');
          return;
        }
        if (json.code === 'HIPOTESIS_ELEGIDA_REQUIRED') {
          alert(json.error);
          setActiveTool('hipotesis');
          return;
        }
        if (json.code === 'HITO_1_REQUIRED') {
          alert(json.error);
          setActiveTool('hito_1');
          return;
        }
        if (json.code === 'ENUNCIADO_INMUTABLE') {
          alert(json.error);
          return;
        }
        throw new Error(json.error);
      }
      setC4Ack(false);
      await fetchProject();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al cambiar estado');
    } finally {
      setActionLoading(false);
    }
  }

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

  // ── Generar Hipótesis ──
  async function handleGenerateHipotesis() {
    if (!project || !hipTema.trim()) return;
    setGenerandoHip(true);
    setHipError(null);

    let userMessage = `TEMA: ${hipTema.trim()}`;
    if (hipAudiencia.trim()) userMessage += `\nAUDIENCIA OBJETIVO: ${hipAudiencia.trim()}`;
    if (hipDato.trim()) userMessage += `\nDATO CLAVE DE CONTEXTO: ${hipDato.trim()}`;
    if (project.thesis) userMessage += `\nTESIS DEL PROJECT: ${project.thesis}`;

    try {
      const genBody: Record<string, unknown> = {
        tool: 'generador_angulos',
        userMessage,
        projectId: project.id,
      };
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
      if (!genRes.ok) throw new Error(genJson.error || 'Error generando hipótesis');

      const result = genJson.result ?? {};
      // La clave que devuelve el modelo sigue siendo "angulos" por contrato,
      // pero conceptualmente son hipótesis. La guardamos bajo data.hipotesis.
      const hipotesisPayload = {
        hipotesis: result.angulos ?? [],
        notaEditorial: result.nota_editorial ?? '',
        tema: hipTema.trim(),
        audiencia: hipAudiencia.trim(),
        datoClave: hipDato.trim(),
        generadoEn: new Date().toISOString(),
        modo: genJson.mode,
      };

      const patchRes = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { hipotesis: hipotesisPayload } }),
      });
      if (!patchRes.ok) {
        const pj = await patchRes.json();
        throw new Error(pj.error || 'Error guardando hipótesis');
      }

      await fetchProject();
    } catch (err) {
      setHipError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setGenerandoHip(false);
    }
  }

  // ── Chunk 31C-2: Gate 1a — ejecutar llamada IA ──
  async function handleEjecutarGate1a() {
    if (!project || gate1aLoading) return;
    setGate1aLoading(true);
    setGate1aError(null);

    try {
      const userMessage = `TITULO: ${project.title}${project.thesis ? `\nTESIS: ${project.thesis}` : ''}`;

      const genRes = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'gate_1a',
          userMessage,
          projectId: project.id,
        }),
      });
      const genJson = await genRes.json();
      if (!genRes.ok) throw new Error(genJson.error || 'Error ejecutando Gate 1a');
      if (genJson.parseError) throw new Error('El modelo devolvio un formato invalido. Reintenta.');

      const result = genJson.result ?? {};
      const nuevoResultado: Gate1aResultado = {
        supuestos: Array.isArray(result.supuestos) ? result.supuestos : [],
        veredicto_global: result.veredicto_global === 'sano' ? 'sano' : 'requiere_correccion',
        resumen: typeof result.resumen === 'string' ? result.resumen : '',
        ejecutadoEn: new Date().toISOString(),
        enunciado_evaluado: {
          title: project.title,
          thesis: project.thesis ?? null,
        },
      };

      // Archivar resultado previo al historial si existe
      const currentGate1a = (project.data?.gate_1a as Gate1aData | undefined) ?? null;
      const historialPrevio = currentGate1a?.historial ?? [];
      const historialActualizado = currentGate1a?.ultimoResultado
        ? [...historialPrevio, currentGate1a.ultimoResultado]
        : historialPrevio;

      const gate1aPayload: Gate1aData = {
        estado: 'en_revision',
        ultimoResultado: nuevoResultado,
        aprobadoEn: null,
        historial: historialActualizado,
      };

      const patchRes = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { gate_1a: gate1aPayload } }),
      });
      if (!patchRes.ok) {
        const pj = await patchRes.json();
        throw new Error(pj.error || 'Error guardando resultado del Gate 1a');
      }

      await fetchProject();
    } catch (err) {
      setGate1aError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setGate1aLoading(false);
    }
  }

  // ── Chunk 31C-2: Gate 1a — aprobar revision ──
  async function handleAprobarGate1a() {
    if (!project || gate1aAprobando) return;
    const currentGate1a = project.data?.gate_1a as Gate1aData | undefined;
    if (!currentGate1a?.ultimoResultado) {
      alert('No hay resultado de Gate 1a para aprobar. Ejecuta la revision primero.');
      return;
    }

    if (currentGate1a.ultimoResultado.veredicto_global === 'requiere_correccion') {
      const ok = confirm(
        'El veredicto actual es "requiere correccion". Si apruebas igual, queda registrado que decidiste asumir el riesgo editorial. ¿Aprobar la revision de todos modos?'
      );
      if (!ok) return;
    }

    setGate1aAprobando(true);
    try {
      const aprobado: Gate1aData = {
        ...currentGate1a,
        estado: 'aprobado',
        aprobadoEn: new Date().toISOString(),
      };
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { gate_1a: aprobado } }),
      });
      if (!res.ok) {
        const pj = await res.json();
        throw new Error(pj.error || 'Error aprobando la revision');
      }
      await fetchProject();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setGate1aAprobando(false);
    }
  }

  // ── Chunk 31I-2: Gate 1a — exportar supuestos a .docx para correccion externa ──
  // Consume POST /api/projects/[id]/export-gate1a (Chunk 31I-1).
  // Descarga el blob como archivo .docx con el filename provisto en el header
  // Content-Disposition. Errores mapeados a mensajes operativos por code.
  async function handleExportarGate1a() {
    if (!project || exportandoGate1a) return;

    setExportandoGate1a(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/export-gate1a`, {
        method: 'POST',
      });

      if (!res.ok) {
        let errorJson: { error?: string; code?: string } = {};
        try {
          errorJson = await res.json();
        } catch {
          // Response no es JSON parseable; usar fallback
        }

        const mensajes: Record<string, string> = {
          PROJECT_NOT_FOUND: 'El proyecto no existe o fue eliminado.',
          GATE1A_NOT_EXECUTED: 'El Gate 1a aun no fue ejecutado. Ejecutalo primero.',
          GATE1A_NOT_REQUIRES_CORRECTION: 'El Gate 1a no requiere correccion. La exportacion no aplica.',
          NO_SUPUESTOS_PENDIENTES: 'No hay supuestos pendientes de resolver. No hay nada que exportar.',
          EXPORT_GENERATION_FAILED: 'Error generando el documento. Intenta nuevamente.',
        };

        const code = errorJson.code ?? '';
        const mensaje = mensajes[code] ?? errorJson.error ?? `Error ${res.status}`;
        alert(`Exportacion fallida: ${mensaje}`);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      // Extraer filename del header Content-Disposition
      const cd = res.headers.get('Content-Disposition') ?? '';
      const match = cd.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : `GATE1A_${project.publicId}.docx`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      alert('Exportacion realizada. El archivo se descargo en tu carpeta de descargas.');
    } catch (error) {
      console.error('[handleExportarGate1a] error inesperado:', error);
      alert('Error de red exportando el Gate 1a. Revisa tu conexion y reintentalo.');
    } finally {
      setExportandoGate1a(false);
    }
  }

  // ── Chunk 31I-3: Gate 1a — importar correccion externa (.md o .docx) ──
  // Consume POST /api/projects/[id]/import-gate1a-correccion. El archivo
  // se parsea server-side, se valida contra los supuestos del ultimo
  // export y se persiste en data.gate_1a.correcciones[]. Scope del 31I-3:
  // solo persistencia del buffer. La aplicacion efectiva a title/thesis
  // queda para un Chunk 31J futuro.
  async function handleImportarGate1aCorreccion(file: File) {
    if (!project || importandoGate1a) return;

    setImportandoGate1a(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(
        `/api/projects/${project.id}/import-gate1a-correccion`,
        { method: 'POST', body: formData },
      );

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        const code = (json as { code?: string }).code ?? '';
        const errorText = (json as { error?: string }).error ?? `Error ${res.status}`;
        const mensajes: Record<string, string> = {
          PROJECT_NOT_FOUND: 'El proyecto no existe o fue eliminado.',
          NO_EXPORT_PRIOR: 'Debes exportar supuestos antes de importar una correccion.',
          PHASE_LOCKED: 'El enunciado esta congelado en esta fase.',
          NO_FILE: 'No se adjunto ningun archivo.',
          INVALID_FORMAT: 'Formato no soportado. Usa .md o .docx.',
          FILE_TOO_LARGE: 'Archivo mayor a 2MB.',
          EMPTY_CORRECCION: 'El archivo no contiene correcciones parseables.',
          PARSE_FAILED: 'Error al parsear el archivo. Revisa formato.',
          PERSIST_FAILED: 'El parseo funciono pero no se pudo persistir. Reintenta.',
        };
        const mensaje = mensajes[code] ?? errorText;
        alert(`Importacion fallida: ${mensaje}`);
        return;
      }

      const correccion = (json as { correccion?: Gate1aCorreccionEvent }).correccion;
      const warnings = (json as { warnings?: string[] }).warnings ?? [];

      if (correccion) {
        const resueltos = correccion.supuestos.filter(
          (s) => s.veredictoFinal !== 'no_resuelto',
        ).length;
        const enunciadoEstado =
          correccion.enunciadoCorregido.titulo || correccion.enunciadoCorregido.tesis
            ? 'corregido'
            : 'sin cambios';
        const wSuffix =
          warnings.length > 0 ? ` ${warnings.length} warning(s).` : '';
        alert(
          `Correccion importada: ${resueltos} supuesto(s) resuelto(s), enunciado ${enunciadoEstado}.${wSuffix}`,
        );
      } else {
        alert('Correccion importada.');
      }

      await fetchProject();
    } catch (error) {
      console.error('[handleImportarGate1aCorreccion] error inesperado:', error);
      alert('Error de red importando la correccion. Revisa tu conexion y reintentalo.');
    } finally {
      setImportandoGate1a(false);
      if (importGate1aInputRef.current) {
        importGate1aInputRef.current.value = '';
      }
    }
  }

  // ── Chunk 31J-2: aplicar corrección externa ──
  // Consume POST /api/projects/[id]/apply-gate1a-correccion. Actualiza
  // title/thesis con el enunciado propuesto (si los incluye), marca el
  // evento como aplicado y dispara el auto-reset del Gate 1a por el
  // patrón del 31C-2 replicado inline en el endpoint.
  async function handleAplicarGate1aCorreccion(correccionId: string) {
    if (aplicandoCorreccionId !== null) return;
    if (!project) return;

    const ok = confirm(
      '¿Aplicar esta corrección? Se actualizarán título/tesis con los valores propuestos (si los incluye) y el Gate 1a quedará pendiente de re-ejecutar.',
    );
    if (!ok) return;

    setAplicandoCorreccionId(correccionId);
    try {
      const res = await fetch(
        `/api/projects/${project.id}/apply-gate1a-correccion`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ correccionId }),
        },
      );
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        const code = (json as { code?: string }).code ?? '';
        const errorText = (json as { error?: string }).error ?? `Error ${res.status}`;
        const mensajes: Record<string, string> = {
          CORRECCION_YA_APLICADA: 'Esta corrección ya fue aplicada.',
          CORRECCION_DESCARTADA: 'Esta corrección fue descartada.',
          CORRECCION_NOT_FOUND: 'Corrección no encontrada.',
          PROJECT_NOT_FOUND: 'Proyecto no encontrado.',
        };
        const mensaje = mensajes[code] ?? errorText;
        alert(`No se pudo aplicar la corrección: ${mensaje}`);
        return;
      }

      await fetchProject();
    } catch (error) {
      console.error('[handleAplicarGate1aCorreccion] error inesperado:', error);
      alert('Error de red aplicando la corrección. Revisa tu conexión y reintentalo.');
    } finally {
      setAplicandoCorreccionId(null);
    }
  }

  // ── Chunk 31D-2: Hito 1 — ejecutar llamada IA ──
  async function handleEjecutarHito1() {
    if (!project || ejecutandoHito1) return;
    const dataObj = (project.data ?? {}) as Record<string, unknown>;
    const hipotesisElegida = dataObj.hipotesis_elegida as HipotesisElegida | undefined;
    if (!hipotesisElegida) {
      setHito1Error('No hay hipotesis elegida. Volve al tab Generador de Hipotesis en la fase anterior.');
      return;
    }

    setEjecutandoHito1(true);
    setHito1Error(null);
    try {
      const userMessage = [
        `TITULO: ${project.title}`,
        `TESIS: ${project.thesis ?? '(no declarada)'}`,
        'HIPOTESIS ELEGIDA:',
        JSON.stringify(hipotesisElegida, null, 2),
      ].join('\n');

      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'hito_1', userMessage }),
      });
      const json = await res.json();
      if (!res.ok || json.parseError) {
        throw new Error(json.error || json.parseError || 'Error ejecutando Hito 1');
      }

      const result = json.result as Omit<Hito1Resultado, 'ejecutadoEn' | 'hipotesis_evaluada'>;
      const nuevoResultado: Hito1Resultado = {
        ...result,
        ejecutadoEn: new Date().toISOString(),
        hipotesis_evaluada: hipotesisElegida,
      };

      const hito1Actual = (dataObj.hito_1 as Hito1Data | undefined) ?? {
        estado: 'pendiente' as Hito1Estado,
        ultimoResultado: null,
        aprobadoEn: null,
        historial: [],
      };

      const nuevoHistorial = hito1Actual.ultimoResultado
        ? [...hito1Actual.historial, hito1Actual.ultimoResultado]
        : hito1Actual.historial;

      const nuevaData: Hito1Data = {
        estado: 'en_revision',
        ultimoResultado: nuevoResultado,
        aprobadoEn: null,
        historial: nuevoHistorial,
      };

      const patchRes = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { hito_1: nuevaData } }),
      });
      if (!patchRes.ok) throw new Error('Error persistiendo resultado del Hito 1');

      await fetchProject();
    } catch (err) {
      setHito1Error(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setEjecutandoHito1(false);
    }
  }

  // ── Chunk 31D-2: Hito 1 — aprobar revision ──
  async function handleAprobarHito1() {
    if (!project || aprobandoHito1) return;
    const dataObj = (project.data ?? {}) as Record<string, unknown>;
    const hito1 = dataObj.hito_1 as Hito1Data | undefined;
    if (!hito1?.ultimoResultado) {
      setHito1Error('Ejecuta el Hito 1 antes de aprobarlo.');
      return;
    }

    const veredicto = hito1.ultimoResultado.correctivo.veredicto;
    if (veredicto !== 'coherente') {
      const ok = confirm(
        `El Hito 1 determino veredicto "${veredicto}" en la revision correctiva. Aprobar asumiendo el riesgo de avanzar con una hipotesis que el modelo flaggeo como problematica?`
      );
      if (!ok) return;
    }

    setAprobandoHito1(true);
    setHito1Error(null);
    try {
      const nuevaData: Hito1Data = {
        ...hito1,
        estado: 'aprobado',
        aprobadoEn: new Date().toISOString(),
      };
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { hito_1: nuevaData } }),
      });
      if (!res.ok) throw new Error('Error aprobando el Hito 1');
      await fetchProject();
    } catch (err) {
      setHito1Error(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setAprobandoHito1(false);
    }
  }

  // ── Chunk 31C-2: Gate 1a — abrir/cerrar edicion de enunciado ──
  function handleAbrirEdicionEnunciado() {
    if (!project) return;
    setGate1aEditTitle(project.title);
    setGate1aEditThesis(project.thesis ?? '');
    setGate1aEditandoEnunciado(true);
  }

  function handleCancelarEdicionEnunciado() {
    setGate1aEditandoEnunciado(false);
    setGate1aEditTitle('');
    setGate1aEditThesis('');
  }

  // ── Chunk 31C-2: Gate 1a — guardar enunciado editado ──
  // El backend auto-archiva el ultimoResultado del gate y resetea
  // estado a 'pendiente' cuando title o thesis cambian.
  async function handleGuardarEnunciado() {
    if (!project || gate1aGuardandoEnunciado) return;
    const nuevoTitle = gate1aEditTitle.trim();
    const nuevaThesis = gate1aEditThesis.trim();
    if (nuevoTitle.length === 0) {
      alert('El titulo no puede quedar vacio.');
      return;
    }
    if (nuevoTitle === project.title && nuevaThesis === (project.thesis ?? '')) {
      setGate1aEditandoEnunciado(false);
      return;
    }

    setGate1aGuardandoEnunciado(true);
    try {
      const body: Record<string, unknown> = {};
      if (nuevoTitle !== project.title) body.title = nuevoTitle;
      if (nuevaThesis !== (project.thesis ?? '')) body.thesis = nuevaThesis.length > 0 ? nuevaThesis : null;

      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const pj = await res.json();
        throw new Error(pj.error || 'Error guardando el enunciado');
      }
      setGate1aEditandoEnunciado(false);
      setGate1aEditTitle('');
      setGate1aEditThesis('');
      await fetchProject();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setGate1aGuardandoEnunciado(false);
    }
  }

  // ── Elegir hipótesis ──
  async function handleElegirHipotesis(h: Hipotesis, idx: number) {
    if (!project) return;
    setEligiendo(idx);
    try {
      const elegida: HipotesisElegida = { ...h, elegidaEn: new Date().toISOString() };
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { hipotesis_elegida: elegida } }),
      });
      if (!res.ok) {
        const pj = await res.json();
        throw new Error(pj.error || 'Error eligiendo hipótesis');
      }
      await fetchProject();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setEligiendo(null);
    }
  }

  // ── Cambiar elección ──
  async function handleCambiarEleccion() {
    if (!project) return;
    if (!confirm('¿Cambiar la hipótesis elegida? Vas a poder elegir otra del listado.')) return;
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { hipotesis_elegida: null } }),
      });
      if (!res.ok) {
        const pj = await res.json();
        throw new Error(pj.error || 'Error limpiando elección');
      }
      await fetchProject();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error desconocido');
    }
  }

  // ── Auditar cobertura externa (Radar Editorial) ──
  async function handleAuditarRadar() {
    if (!project || !radarMedio.trim() || !radarTexto.trim()) return;
    setAuditandoRadar(true);
    setRadarError(null);

    try {
      const genBody: Record<string, unknown> = {
        tool: 'validador_tono',
        userMessage: radarTexto.trim(),
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
      if (!res.ok) throw new Error(json.error || 'Error auditando texto');

      const result = json.result ?? {};
      const entry: RadarEntry = {
        id: genId(),
        medio: radarMedio.trim(),
        url: radarUrl.trim(),
        fecha_publicacion: radarFecha.trim(),
        notas_propias: radarNotas.trim(),
        texto_analizado: radarTexto.trim().slice(0, 300),
        evaluacion: parseValidacionDimensions(result.evaluacion),
        puntuacion_global: Number(result.puntuacion_global ?? 0),
        veredicto: String(result.veredicto ?? 'requiere_revision'),
        resumen: String(result.resumen ?? ''),
        auditado_en: new Date().toISOString(),
      };

      const currentRaw = project.data?.radar_editorial;
      const current: RadarEntry[] = Array.isArray(currentRaw)
        ? (currentRaw as RadarEntry[])
        : [];
      const next = [...current, entry];

      const patchRes = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { radar_editorial: next } }),
      });
      if (!patchRes.ok) {
        const pj = await patchRes.json();
        throw new Error(pj.error || 'Error guardando auditoría');
      }

      setRadarMedio('');
      setRadarUrl('');
      setRadarFecha('');
      setRadarNotas('');
      setRadarTexto('');
      await fetchProject();
    } catch (err) {
      setRadarError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setAuditandoRadar(false);
    }
  }

  // ── Generar Borrador (Chunk 8) ──
  async function handleGenerateBorrador() {
    if (!project) return;

    // Hard-block: hipótesis elegida obligatoria
    const hipotesisElegida = project.data?.hipotesis_elegida as
      | Record<string, unknown>
      | undefined;
    if (!hipotesisElegida || typeof hipotesisElegida !== 'object') {
      setGenBorradorError(
        'No hay hipotesis elegida. Volve a la fase Validacion, generá hipotesis y eligi una antes de generar el borrador.'
      );
      return;
    }

    // Hard-block: tenant + template (debería estar garantizado por el traspaso, pero validamos)
    if (!project.tenantSlug || !project.templateSlug) {
      setGenBorradorError(
        'El Generador de Borrador requiere que el project ya haya pasado por el traspaso a MetricPress (tenant + template asignados).'
      );
      return;
    }

    // Soft gate: fuentes vacías es warning confirmable
    const fuentes = (project.data?.fuentes as unknown[] | undefined) ?? [];
    if (fuentes.length === 0) {
      const confirmar = confirm(
        'No hay fuentes registradas en el ODF. El borrador va a quedar muy escueto y con muchas advertencias [VERIFICAR]. ¿Generar igual?'
      );
      if (!confirmar) return;
    }

    setGenerandoBorrador(true);
    setGenBorradorError(null);

    try {
      // Construir el userMessage desde el expediente
      const heRaw = hipotesisElegida as Record<string, unknown>;
      const verifCriticas = Array.isArray(heRaw.verificaciones_criticas)
        ? (heRaw.verificaciones_criticas as unknown[]).map(String)
        : [];

      let userMessage = '';

      // Chunk 18C: inyectar borrador IP como contexto prioritario
      const borradorIPRawMP = project.data?.borrador_ip as Record<string, unknown> | undefined;
      if (borradorIPRawMP) {
        const ipParsed = parseBorradorFromRaw(borradorIPRawMP);
        if (ipParsed) {
          userMessage += `BORRADOR IP VERIFICADO (InvestigaPress)\n`;
          userMessage += `Este documento fue generado en la fase de pesquisa a partir de las fuentes verificadas del expediente. Usarlo como base y fuente de verdad prioritaria. Aplicar sobre el el genero, la voz y la estructura del template ${project.templateName ?? ''} de ${project.tenantName ?? ''}. No fabricar datos que no esten en este documento.\n\n`;
          userMessage += `${ipParsed.contenido.titulo}\n`;
          if (ipParsed.contenido.bajada) userMessage += `${ipParsed.contenido.bajada}\n`;
          userMessage += `\n${ipParsed.contenido.lead}\n\n`;
          ipParsed.contenido.cuerpo.forEach((sec) => {
            if (sec.subtitulo) userMessage += `## ${sec.subtitulo}\n`;
            sec.parrafos.forEach((p) => {
              userMessage += `${p}\n\n`;
            });
          });
          if (ipParsed.contenido.cierre) userMessage += `${ipParsed.contenido.cierre}\n\n`;
          if (ipParsed.metadata.fuentes_citadas.length > 0) {
            userMessage += `Fuentes citadas en el IP: ${ipParsed.metadata.fuentes_citadas.join(', ')}\n`;
          }
          if (ipParsed.notas_editoriales) {
            userMessage += `Notas editoriales IP: ${ipParsed.notas_editoriales}\n`;
          }
          userMessage += `---\n\n`;
        }
      }

      if (project.thesis) {
        userMessage += `TESIS ORIGINAL DEL PROJECT:\n${project.thesis}\n\n`;
      }

      userMessage += `HIPOTESIS ELEGIDA:\n`;
      userMessage += `- Titulo: ${heRaw.titulo ?? '[sin titulo]'}\n`;
      userMessage += `- Gancho: ${heRaw.gancho ?? '[sin gancho]'}\n`;
      userMessage += `- Tipo: ${heRaw.tipo ?? '[sin tipo]'}\n`;
      userMessage += `- Audiencia: ${heRaw.audiencia ?? '[sin audiencia]'}\n`;
      userMessage += `- Tono: ${heRaw.tono ?? '[sin tono]'}\n`;
      userMessage += `- Pregunta clave: ${heRaw.pregunta_clave ?? '[sin pregunta clave]'}\n`;
      if (verifCriticas.length > 0) {
        userMessage += `- Verificaciones criticas:\n`;
        verifCriticas.forEach((v) => {
          userMessage += `  * ${v}\n`;
        });
      }
      if (heRaw.evidencia_requerida) {
        userMessage += `- Evidencia requerida: ${heRaw.evidencia_requerida}\n`;
      }
      userMessage += `\n`;

      // Fuentes del ODF
      if (fuentes.length > 0) {
        userMessage += `FUENTES DOCUMENTADAS (ODF):\n`;
        fuentes.forEach((f, idx) => {
          const fr = f as Record<string, unknown>;
          userMessage += `${idx + 1}. Tipo: ${fr.tipo ?? '[sin tipo]'}\n`;
          userMessage += `   Nombre/titulo: ${fr.nombre_titulo ?? '[sin nombre]'}\n`;
          userMessage += `   Rol/origen: ${fr.rol_origen ?? '[sin rol]'}\n`;
          userMessage += `   Estado: ${fr.estado ?? 'por_contactar'}\n`;
          userMessage += `   Confianza: ${fr.confianza ?? 'media'}\n`;
          if (fr.notas) userMessage += `   Notas: ${fr.notas}\n`;
          if (fr.origen) userMessage += `   Origen: ${fr.origen}\n`;
          userMessage += `\n`;
        });
      } else {
        userMessage += `FUENTES DOCUMENTADAS (ODF): ninguna registrada en el expediente.\n\n`;
      }

      // Validaciones VHP previas (opcional)
      const vhps = (project.data?.validacion_hipotesis_pista as unknown[] | undefined) ?? [];
      if (vhps.length > 0) {
        userMessage += `VALIDACIONES VHP PREVIAS:\n`;
        vhps.forEach((v, idx) => {
          const vr = v as Record<string, unknown>;
          const ai = (vr.ai_response ?? {}) as Record<string, unknown>;
          userMessage += `Validacion ${idx + 1}: veredicto=${ai.veredicto ?? '[sin veredicto]'}, score=${ai.viabilidad_score ?? '?'}\n`;
        });
        userMessage += `\n`;
      } else {
        userMessage += `VALIDACIONES VHP PREVIAS: ninguna registrada en este project.\n\n`;
      }

      // Iteraciones previas del Validador de Borrador (crítico para iteración)
      const valBorrador = (project.data?.validaciones_borrador as unknown[] | undefined) ?? [];
      if (valBorrador.length > 0) {
        userMessage += `ITERACIONES PREVIAS DEL VALIDADOR DE BORRADOR:\n`;
        valBorrador.forEach((v, idx) => {
          const vr = v as Record<string, unknown>;
          userMessage += `Iteracion ${idx + 1}: veredicto=${vr.veredicto ?? '[sin veredicto]'}, resumen=${vr.resumen ?? '[sin resumen]'}\n`;
        });
        userMessage += `\n`;
      } else {
        userMessage += `ITERACIONES PREVIAS DEL VALIDADOR DE BORRADOR: ninguna. Esta es la primera version del borrador.\n\n`;
      }

      // Notas opcionales del operador
      if (borradorOperadorNotas.trim()) {
        userMessage += `NOTAS ADICIONALES DEL OPERADOR: ${borradorOperadorNotas.trim()}\n`;
      } else {
        userMessage += `NOTAS ADICIONALES DEL OPERADOR: ninguna.\n`;
      }

      // Llamar al endpoint
      const genRes = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'generador_borrador',
          tenantSlug: project.tenantSlug,
          templateSlug: project.templateSlug,
          projectId: project.id,
          userMessage,
        }),
      });
      const genJson = await genRes.json();
      if (!genRes.ok) {
        throw new Error(genJson.error || 'Error generando borrador');
      }

      // Parsear la respuesta
      const parsed = parseBorradorFromRaw(genJson.result ?? {});
      if (!parsed) {
        throw new Error(
          'El modelo devolvio una respuesta sin estructura de borrador valida. Intenta regenerar.'
        );
      }

      // Chunk 12C: contar fuentes al momento de la generacion para
      // poder comparar despues si se cargaron fuentes nuevas.
      const fuentesCountAlGenerar = Array.isArray(project.data?.fuentes)
        ? (project.data.fuentes as unknown[]).length
        : 0;

      const borradorPayload: BorradorData = {
        ...parsed,
        notasOperador: borradorOperadorNotas.trim() || undefined,
        modo: genJson.mode,
        fuentes_count_al_generar: fuentesCountAlGenerar,
        desactualizado: false,
      };

      // Persistir en data.borrador (singular, sobreescribe)
      const patchRes = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { borrador: borradorPayload } }),
      });
      if (!patchRes.ok) {
        const pj = await patchRes.json();
        throw new Error(pj.error || 'Error guardando borrador');
      }

      await fetchProject();
    } catch (err) {
      setGenBorradorError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setGenerandoBorrador(false);
    }
  }

  // Chunk 18B: handler del Generador de Borrador InvestigaPress (fase pesquisa)
  async function handleGenerateBorradorIP() {
    if (!project) return;

    // Hard-block: hipotesis elegida obligatoria
    const hipotesisElegida = project.data?.hipotesis_elegida as
      | Record<string, unknown>
      | undefined;
    if (!hipotesisElegida || typeof hipotesisElegida !== 'object') {
      setGenBorradorIPError(
        'No hay hipotesis elegida. Volve a la fase Validacion, genera hipotesis y elegi una antes de generar el documento de investigacion.'
      );
      return;
    }

    // Si ya existe borrador_ip, confirmar regeneracion
    const existingBorradorIP = project.data?.borrador_ip as Record<string, unknown> | undefined;
    if (existingBorradorIP) {
      const confirmar = confirm(
        'Ya existe un documento de investigacion generado. ¿Regenerar? El anterior se sobreescribe.'
      );
      if (!confirmar) return;
    }

    setGenerandoBorradorIP(true);
    setGenBorradorIPError(null);
    setBorradorIPTruncWarnings([]);

    try {
      const heRaw = hipotesisElegida as Record<string, unknown>;
      const verifCriticas = Array.isArray(heRaw.verificaciones_criticas)
        ? (heRaw.verificaciones_criticas as unknown[]).map(String)
        : [];
      const fuentes = (project.data?.fuentes as Array<Record<string, unknown>>) ?? [];

      // Paso 1: extraer contenido de archivos adjuntos
      const fuentesConContenido: Array<{ nombre: string; contenido: string }> = [];
      const truncWarnings: string[] = [];
      for (const f of fuentes) {
        if (f.archivo_url && typeof f.archivo_url === 'string') {
          try {
            const extractRes = await fetch('/api/fuentes/extract-content', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                blobUrl: f.archivo_url,
                mimeType: f.archivo_nombre
                  ? getMimeFromName(String(f.archivo_nombre))
                  : '',
              }),
            });
            const extractJson = await extractRes.json();
            if (extractJson.content) {
              fuentesConContenido.push({
                nombre: String(f.nombre_titulo ?? 'Fuente sin nombre'),
                contenido: extractJson.content,
              });
              if (extractJson.truncated) {
                const pct = Math.round(
                  (Number(extractJson.charCount) / Number(extractJson.originalLength)) * 100
                );
                truncWarnings.push(
                  `${String(f.nombre_titulo ?? 'Fuente sin nombre')}: se extrajeron ${Number(extractJson.charCount).toLocaleString()} de ${Number(extractJson.originalLength).toLocaleString()} caracteres (${pct}%).`
                );
              }
            }
          } catch {
            // Best-effort: si falla la extraccion, seguimos sin ese contenido
          }
        }
      }
      if (truncWarnings.length > 0) setBorradorIPTruncWarnings(truncWarnings);

      // Paso 2: construir userMessage
      let userMessage = '';

      if (project.thesis) {
        userMessage += `TESIS ORIGINAL DEL PROJECT:\n${project.thesis}\n\n`;
      }

      userMessage += `HIPOTESIS ELEGIDA:\n`;
      userMessage += `- Titulo: ${heRaw.titulo ?? '[sin titulo]'}\n`;
      userMessage += `- Gancho: ${heRaw.gancho ?? '[sin gancho]'}\n`;
      userMessage += `- Tipo: ${heRaw.tipo ?? '[sin tipo]'}\n`;
      userMessage += `- Audiencia: ${heRaw.audiencia ?? '[sin audiencia]'}\n`;
      userMessage += `- Tono: ${heRaw.tono ?? '[sin tono]'}\n`;
      userMessage += `- Pregunta clave: ${heRaw.pregunta_clave ?? '[sin pregunta clave]'}\n`;
      if (verifCriticas.length > 0) {
        userMessage += `- Verificaciones criticas:\n`;
        verifCriticas.forEach((v) => {
          userMessage += `  * ${v}\n`;
        });
      }
      if (heRaw.evidencia_requerida) {
        userMessage += `- Evidencia requerida: ${heRaw.evidencia_requerida}\n`;
      }
      userMessage += `\n`;

      // Fuentes del ODF
      if (fuentes.length > 0) {
        userMessage += `FUENTES DOCUMENTADAS (ODF):\n`;
        fuentes.forEach((f, idx) => {
          userMessage += `${idx + 1}. Tipo: ${f.tipo ?? '[sin tipo]'}\n`;
          userMessage += `   Nombre/titulo: ${f.nombre_titulo ?? '[sin nombre]'}\n`;
          userMessage += `   Rol/origen: ${f.rol_origen ?? '[sin rol]'}\n`;
          userMessage += `   Estado: ${f.estado ?? 'por_contactar'}\n`;
          userMessage += `   Confianza: ${f.confianza ?? 'media'}\n`;
          if (f.notas) userMessage += `   Notas: ${f.notas}\n`;
          if (f.url) userMessage += `   URL: ${f.url}\n`;
          userMessage += `\n`;
        });
      } else {
        userMessage += `FUENTES DOCUMENTADAS (ODF): ninguna registrada en el expediente.\n\n`;
      }

      // Contenido extraido de archivos adjuntos
      if (fuentesConContenido.length > 0) {
        userMessage += `CONTENIDO VERIFICADO DE ARCHIVOS ADJUNTOS:\n\n`;
        fuentesConContenido.forEach((fc) => {
          userMessage += `──── CONTENIDO VERIFICADO DE FUENTE: ${fc.nombre} ────\n`;
          userMessage += `${fc.contenido}\n`;
          userMessage += `──── FIN CONTENIDO: ${fc.nombre} ────\n\n`;
        });
      } else {
        userMessage += `CONTENIDO VERIFICADO DE ARCHIVOS ADJUNTOS: ningun archivo con contenido extraible.\n\n`;
      }

      // Notas del operador
      if (borradorIPNotas.trim()) {
        userMessage += `NOTAS ADICIONALES DEL OPERADOR: ${borradorIPNotas.trim()}\n`;
      } else {
        userMessage += `NOTAS ADICIONALES DEL OPERADOR: ninguna.\n`;
      }

      // Paso 3: llamar al endpoint
      const genRes = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'generador_borrador_ip',
          projectId: project.id,
          userMessage,
        }),
      });
      const genJson = await genRes.json();
      if (!genRes.ok) {
        throw new Error(genJson.error || 'Error generando documento de investigacion');
      }

      // Parsear con el mismo parser del borrador MP
      const parsed = parseBorradorFromRaw(genJson.result ?? {});
      if (!parsed) {
        throw new Error(
          'El modelo devolvio una respuesta sin estructura valida. Intenta regenerar.'
        );
      }

      const borradorIPPayload: BorradorData = {
        ...parsed,
        notasOperador: borradorIPNotas.trim() || undefined,
        modo: fuentesConContenido.length > 0 ? 'evidencia' : 'diagnostico',
      };

      // Persistir en data.borrador_ip (separado de data.borrador)
      const patchRes = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { borrador_ip: borradorIPPayload } }),
      });
      if (!patchRes.ok) {
        const pj = await patchRes.json();
        throw new Error(pj.error || 'Error guardando documento de investigacion');
      }

      await fetchProject();
    } catch (err) {
      setGenBorradorIPError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setGenerandoBorradorIP(false);
    }
  }

  // Chunk 12B: handler de copia al portapapeles del exportador.
  async function handleCopiarExportador() {
    if (!project) return;
    const borrador = parseBorradorFromRaw(
      (project.data?.borrador as Record<string, unknown>) ?? {}
    );
    if (!borrador) return;

    const texto = buildTextoExportadorPesquisa(project, borrador);

    try {
      await navigator.clipboard.writeText(texto);
      setExportadorCopiado(true);
      setTimeout(() => setExportadorCopiado(false), 2500);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        document.execCommand('copy');
        setExportadorCopiado(true);
        setTimeout(() => setExportadorCopiado(false), 2500);
      } catch {
        alert('No se pudo copiar automaticamente. Usa Ctrl+C en el textarea del modal.');
      } finally {
        document.body.removeChild(ta);
      }
    }
  }

  // ── Validar borrador propio (fase revision) ──
  // ── Chunk 19C: Validar borrador IP (fase pesquisa) ──
  async function handleValidarBorradorIP() {
    if (!project) return;
    const dataObj = (project.data ?? {}) as Record<string, unknown>;
    if (!dataObj.borrador_ip) {
      setIpValidadorError('Genera el borrador IP antes de validar.');
      return;
    }
    if (!ipValidadorTexto.trim()) return;
    setIpValidandoBorrador(true);
    setIpValidadorError(null);

    try {
      // Chunk 31M-DT16-a: inyectar metadata de fuentes del ODF al userMessage
      // para que el Validador IP pueda hacer cross-reference real contra el
      // expediente. Patron replicado del precedente canonico de
      // handleGenerateBorradorIP (lineas ~2259-2275).
      const fuentes = (project.data?.fuentes as Array<Record<string, unknown>>) ?? [];
      let userMessage = '';
      if (fuentes.length > 0) {
        userMessage += `FUENTES DOCUMENTADAS (ODF):\n`;
        fuentes.forEach((f, idx) => {
          userMessage += `${idx + 1}. Tipo: ${f.tipo ?? '[sin tipo]'}\n`;
          userMessage += `   Nombre/titulo: ${f.nombre_titulo ?? '[sin nombre]'}\n`;
          userMessage += `   Rol/origen: ${f.rol_origen ?? '[sin rol]'}\n`;
          userMessage += `   Estado: ${f.estado ?? 'por_contactar'}\n`;
          userMessage += `   Confianza: ${f.confianza ?? 'media'}\n`;
          if (f.notas) userMessage += `   Notas: ${f.notas}\n`;
          if (f.url) userMessage += `   URL: ${f.url}\n`;
          userMessage += `\n`;
        });
      } else {
        userMessage += `FUENTES DOCUMENTADAS (ODF): ninguna registrada en el expediente.\n\n`;
      }
      userMessage += `BORRADOR IP A VALIDAR:\n${ipValidadorTexto.trim()}`;

      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'validador_tono_ip',
          userMessage,
          projectId: project.id,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error validando borrador IP');

      const result = json.result ?? {};
      const parsedScore = Number(result.score ?? 0);
      const parsedDimensiones = Array.isArray(result.dimensiones)
        ? (result.dimensiones as { nombre: string; score: number; observacion: string }[]).map(
            (d) => ({
              nombre: String(d.nombre ?? ''),
              puntuacion: Number(d.score ?? 0),
              observacion: String(d.observacion ?? ''),
            })
          )
        : [];
      const parsedRecomendaciones = Array.isArray(result.recomendaciones)
        ? (result.recomendaciones as unknown[]).map(String)
        : [];
      const parsedApto = Boolean(result.apto_para_traspaso ?? false);

      // Chunk 23A: persistir en data.validaciones_ip[] (fire-and-forget)
      const nuevaEntrada: ValidacionIPEntry = {
        generadoEn: new Date().toISOString(),
        score: parsedScore,
        apto_para_traspaso: parsedApto,
        dimensiones: parsedDimensiones,
        recomendaciones: parsedRecomendaciones,
      };
      const existentes = ((project.data?.validaciones_ip ?? []) as ValidacionIPEntry[]);
      const nuevoArray = [...existentes, nuevaEntrada];
      fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { validaciones_ip: nuevoArray } }),
      }).then((patchRes) => {
        if (!patchRes.ok) console.error('[Chunk 23A] Error persistiendo validaciones_ip');
        else fetchProject();
      }).catch((patchErr) => {
        console.error('[Chunk 23A] Error persistiendo validaciones_ip:', patchErr);
      });

      setIpResultadoValidacion({
        score: parsedScore,
        resumen_ejecutivo: String(result.resumen_ejecutivo ?? ''),
        dimensiones: parsedDimensiones.map((d) => ({
          nombre: d.nombre,
          score: d.puntuacion,
          observacion: d.observacion,
        })),
        recomendaciones: parsedRecomendaciones,
        apto_para_traspaso: parsedApto,
      });
    } catch (err) {
      setIpValidadorError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setIpValidandoBorrador(false);
    }
  }

  // ── Curacion del historial del Validador de Borrador (Chunk 9C - C2) ──
  async function handleMarcarValidacionDefinitiva(entryId: string) {
    if (!project) return;
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: { validacion_borrador_definitiva_id: entryId },
        }),
      });
      if (!res.ok) {
        const pj = await res.json();
        throw new Error(pj.error || 'Error marcando validacion como definitiva');
      }
      await fetchProject();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error desconocido');
    }
  }

  async function handleEliminarValidacionBorrador(entryId: string) {
    if (!project) return;
    if (
      !confirm(
        '¿Eliminar esta iteracion del historial del Validador de Borrador? Esta accion no se puede deshacer.'
      )
    ) {
      return;
    }
    try {
      const dataObj = (project.data ?? {}) as Record<string, unknown>;
      const currentRaw = dataObj.validaciones_borrador;
      const current: ValidacionBorradorEntry[] = Array.isArray(currentRaw)
        ? (currentRaw as unknown as ValidacionBorradorEntry[])
        : [];
      const next = current.filter((e) => e.id !== entryId);

      // Si la entrada eliminada era la definitiva, limpiar tambien el puntero
      const definitivaActual = dataObj.validacion_borrador_definitiva_id;
      const limpiarDefinitiva = definitivaActual === entryId;

      const patchBody: Record<string, unknown> = {
        data: { validaciones_borrador: next },
      };
      if (limpiarDefinitiva) {
        (patchBody.data as Record<string, unknown>).validacion_borrador_definitiva_id =
          null;
      }

      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      });
      if (!res.ok) {
        const pj = await res.json();
        throw new Error(pj.error || 'Error eliminando validacion');
      }
      await fetchProject();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error desconocido');
    }
  }

  // ── Construir pitch ──
  // ── Generador de Prompt Visual — Chunk 14B ──
  async function handleGenerarPromptVisual() {
    if (!project) return;

    const dataObj = (project.data ?? {}) as Record<string, unknown>;
    const borradorRaw = dataObj.borrador as Record<string, unknown> | undefined;
    if (!borradorRaw || typeof borradorRaw !== 'object') {
      setGenPromptVisualError(
        'El proyecto no tiene borrador aprobado. Genera el borrador en la fase Produccion antes de continuar.'
      );
      return;
    }

    const borradorParsed = parseBorradorFromRaw(borradorRaw);
    if (!borradorParsed || !borradorParsed.contenido.titulo) {
      setGenPromptVisualError(
        'El borrador guardado no tiene estructura valida. Regenera el borrador antes de continuar.'
      );
      return;
    }

    if (!project.tenantSlug || !project.templateSlug) {
      setGenPromptVisualError(
        'El Generador de Prompt Visual requiere tenant y template asignados.'
      );
      return;
    }

    setGenerandoPromptVisual(true);
    setGenPromptVisualError(null);

    const b = borradorParsed.contenido;
    const m = borradorParsed.metadata;

    let userMessage = `BORRADOR APROBADO:\n`;
    userMessage += `TITULO: ${b.titulo}\n`;
    if (b.bajada) userMessage += `BAJADA: ${b.bajada}\n`;
    userMessage += `\nLEAD:\n${b.lead}\n`;
    if (b.cuerpo.length > 0) {
      userMessage += `\nCUERPO:\n`;
      b.cuerpo.forEach((sec) => {
        if (sec.subtitulo) userMessage += `\n## ${sec.subtitulo}\n`;
        sec.parrafos.forEach((p) => {
          userMessage += `${p}\n\n`;
        });
      });
    }
    if (b.cierre) userMessage += `CIERRE:\n${b.cierre}\n`;

    if (m.fuentes_citadas.length > 0) {
      userMessage += `\nFUENTES CITADAS:\n`;
      m.fuentes_citadas.forEach((f) => {
        userMessage += `- ${f}\n`;
      });
    }

    if (project.thesis) userMessage += `\nTESIS: ${project.thesis}\n`;

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'generador_prompt_visual',
          userMessage,
          projectId: project.id,
          tenantSlug: project.tenantSlug,
          templateSlug: project.templateSlug,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error generando prompt visual');

      const result = json.result ?? {};

      await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            prompt_visual: {
              ...result,
              generadoEn: new Date().toISOString(),
            },
          },
        }),
      });

      await fetchProject();
    } catch (err) {
      setGenPromptVisualError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setGenerandoPromptVisual(false);
    }
  }

  // ── Upload de imagen visual (Chunk 20A) ──
  async function handleUploadImagenVisual(file: File) {
    if (!project) return;
    setSubiendoImagenVisual(true);
    setImagenVisualError(null);

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setImagenVisualError('Solo se permiten imagenes JPEG, PNG o WebP.');
      setSubiendoImagenVisual(false);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setImagenVisualError('El archivo excede el limite de 10 MB.');
      setSubiendoImagenVisual(false);
      return;
    }

    try {
      // Paso 1: upload del blob via el endpoint existente de fuentes
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fuenteId', `visual-${project.id}`);

      const uploadRes = await fetch('/api/fuentes/upload', {
        method: 'POST',
        body: formData,
      });
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadJson.error || 'Error subiendo imagen');

      // Paso 2: persistir metadata en data.imagen_visual
      const imagenVisual: ImagenVisualData = {
        url: uploadJson.url,
        nombre: file.name,
        size: file.size,
        mimeType: file.type,
        subidaEn: new Date().toISOString(),
      };

      const patchRes = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { imagen_visual: imagenVisual } }),
      });
      if (!patchRes.ok) {
        const patchJson = await patchRes.json().catch(() => ({}));
        throw new Error((patchJson as Record<string, string>).error || 'Error guardando metadata');
      }

      await fetchProject();
    } catch (err) {
      setImagenVisualError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSubiendoImagenVisual(false);
    }
  }

  // ── Organizador de Fuentes Forenses (ODF) — Chunk 7 ──
  function resetOdfForm() {
    setOdfTipo('documento');
    setOdfNombreTitulo('');
    setOdfRolOrigen('');
    setOdfEstado('por_contactar');
    setOdfConfianza('media');
    setOdfNotas('');
    setOdfUrl('');
    setOdfEditandoId(null);
    setOdfError(null);
  }

  async function persistirFuentes(nuevasFuentes: Fuente[]) {
    if (!project) return;
    const res = await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { fuentes: nuevasFuentes } }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || 'Error persistiendo fuentes');
    }
    await fetchProject();
  }

  async function handleGuardarFuente() {
    if (!project) return;
    if (!odfNombreTitulo.trim()) {
      setOdfError('El nombre/título es obligatorio');
      return;
    }
    setOdfGuardando(true);
    setOdfError(null);

    try {
      const fuentesActuales: Fuente[] = Array.isArray(project.data?.fuentes)
        ? (project.data.fuentes as unknown[]).map((f) =>
            parseFuenteFromRaw(f as Record<string, unknown>)
          )
        : [];

      let nuevasFuentes: Fuente[];

      if (odfEditandoId) {
        nuevasFuentes = fuentesActuales.map((f) =>
          f.id === odfEditandoId
            ? {
                ...f,
                tipo: odfTipo,
                nombre_titulo: odfNombreTitulo.trim(),
                rol_origen: odfRolOrigen.trim(),
                estado: odfEstado,
                confianza: odfConfianza,
                notas: odfNotas.trim(),
                url: odfUrl.trim() || undefined,
              }
            : f
        );
      } else {
        const nueva: Fuente = {
          id: genId(),
          tipo: odfTipo,
          nombre_titulo: odfNombreTitulo.trim(),
          rol_origen: odfRolOrigen.trim(),
          estado: odfEstado,
          confianza: odfConfianza,
          notas: odfNotas.trim(),
          url: odfUrl.trim() || undefined,
          fecha_registro: new Date().toISOString(),
        };
        nuevasFuentes = [...fuentesActuales, nueva];
      }

      await persistirFuentes(nuevasFuentes);
      resetOdfForm();
    } catch (err) {
      setOdfError(err instanceof Error ? err.message : 'Error al guardar fuente');
    } finally {
      setOdfGuardando(false);
    }
  }

  function handleEditarFuente(f: Fuente) {
    setOdfEditandoId(f.id);
    setOdfTipo(f.tipo);
    setOdfNombreTitulo(f.nombre_titulo);
    setOdfRolOrigen(f.rol_origen);
    setOdfEstado(f.estado);
    setOdfConfianza(f.confianza);
    setOdfNotas(f.notas);
    setOdfUrl(f.url ?? '');
    setOdfError(null);
  }

  // ── Validador de Hipótesis y Pista (VHP) — Chunk 7B ──
  async function handleValidarHipotesisPista() {
    if (!project) return;
    if (!vhpDescripcion.trim()) {
      setVhpError('La descripción del lead es obligatoria');
      return;
    }

    // Necesitamos una hipótesis elegida para correr el validador
    const elegidaRaw = project.data?.hipotesis_elegida as
      | Record<string, unknown>
      | undefined;
    if (!elegidaRaw || typeof elegidaRaw !== 'object' || !elegidaRaw.titulo) {
      setVhpError(
        'Antes de validar una pista, elige una hipótesis en el Generador de Hipótesis.'
      );
      return;
    }

    setValidandoVhp(true);
    setVhpError(null);

    try {
      const elegidaParsed = parseHipotesisFromRaw(elegidaRaw, 0);
      const snapshot: HipotesisSnapshot = {
        titulo: elegidaParsed.titulo,
        gancho: elegidaParsed.gancho,
        pregunta_clave: elegidaParsed.pregunta_clave,
        verificaciones_criticas: elegidaParsed.verificaciones_criticas ?? [],
        evidencia_requerida: elegidaParsed.evidencia_requerida ?? '',
      };

      const lead: LeadInput = {
        tipo: vhpTipoLead,
        descripcion: vhpDescripcion.trim(),
        acceso: vhpAcceso,
        notas: vhpNotas.trim(),
      };

      // Construcción del userMessage para el modelo
      const verificacionesBlock =
        snapshot.verificaciones_criticas.length > 0
          ? snapshot.verificaciones_criticas.map((v, i) => `  ${i + 1}. ${v}`).join('\n')
          : '  (sin verificaciones críticas declaradas)';

      const userMessage = `HIPÓTESIS ELEGIDA
─────────────────
Título: ${snapshot.titulo}
Gancho: ${snapshot.gancho || '(sin gancho)'}
Pregunta clave: ${snapshot.pregunta_clave || '(sin pregunta clave)'}
Verificaciones críticas:
${verificacionesBlock}
Evidencia requerida: ${snapshot.evidencia_requerida || '(no declarada)'}

LEAD PROPUESTO POR EL OPERADOR
──────────────────────────────
Tipo: ${lead.tipo}
Nivel de acceso declarado: ${lead.acceso}
Descripción: ${lead.descripcion}
Notas adicionales: ${lead.notas || '(sin notas)'}`;

      const genBody: Record<string, unknown> = {
        tool: 'validador_hipotesis_pista',
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
      if (!res.ok) throw new Error(json.error || 'Error validando hipótesis y pista');

      const result = (json.result ?? {}) as Record<string, unknown>;
      const veredictoRaw = String(result.veredicto ?? '');
      const veredicto: VhpVeredicto =
        veredictoRaw === 'viable' ||
        veredictoRaw === 'viable_con_reservas' ||
        veredictoRaw === 'no_viable'
          ? veredictoRaw
          : 'no_viable';

      const toStringArr = (x: unknown): string[] =>
        Array.isArray(x) ? (x as unknown[]).map(String) : [];

      const aiResponse: VhpAiResponse = {
        viabilidad_score: Number(result.viabilidad_score ?? 0),
        veredicto,
        fortalezas: toStringArr(result.fortalezas),
        riesgos: toStringArr(result.riesgos),
        recomendaciones: toStringArr(result.recomendaciones),
        preguntas_clave: toStringArr(result.preguntas_clave),
      };

      const entry: ValidacionHipotesisEntry = {
        id: genId(),
        fecha_validacion: new Date().toISOString(),
        hipotesis_snapshot: snapshot,
        lead_input: lead,
        ai_response: aiResponse,
        promovida_a_fuente: false,
      };

      const currentRaw = project.data?.validaciones_hipotesis;
      const current: ValidacionHipotesisEntry[] = Array.isArray(currentRaw)
        ? (currentRaw as unknown[]).map((v) =>
            parseValidacionHipotesisFromRaw(v as Record<string, unknown>)
          )
        : [];
      const next = [...current, entry];

      const patchRes = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { validaciones_hipotesis: next } }),
      });
      if (!patchRes.ok) {
        const pj = await patchRes.json();
        throw new Error(pj.error || 'Error guardando validación VHP');
      }

      // Limpiar form de lead (la descripción es lo único largo)
      setVhpDescripcion('');
      setVhpNotas('');
      await fetchProject();
    } catch (err) {
      setVhpError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setValidandoVhp(false);
    }
  }

  async function handleEliminarFuente(id: string) {
    if (!project) return;
    const fuentesActuales: Fuente[] = Array.isArray(project.data?.fuentes)
      ? (project.data.fuentes as unknown[]).map((f) =>
          parseFuenteFromRaw(f as Record<string, unknown>)
        )
      : [];
    const f = fuentesActuales.find((x) => x.id === id);
    if (!f) return;
    if (
      !confirm(
        `¿Eliminar la fuente "${f.nombre_titulo}"? Esta acción no se puede deshacer.`
      )
    )
      return;

    // Chunk 15C: eliminar blob adjunto antes de eliminar la fuente (best-effort)
    if (f.archivo_url) {
      try {
        await fetch('/api/fuentes/delete-blob', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: f.archivo_url }),
        });
      } catch {
        // Best-effort: si falla, la fuente se elimina igual.
        // El blob huérfano es recuperable desde el dashboard de Vercel.
      }
    }

    setOdfGuardando(true);
    setOdfError(null);
    try {
      const nuevasFuentes = fuentesActuales.filter((x) => x.id !== id);
      await persistirFuentes(nuevasFuentes);
      if (odfEditandoId === id) resetOdfForm();
    } catch (err) {
      setOdfError(err instanceof Error ? err.message : 'Error al eliminar fuente');
    } finally {
      setOdfGuardando(false);
    }
  }

  // ── Chunk 29: marcar/desmarcar fuente principal del expediente ──
  async function handleMarcarPrincipal(id: string) {
    if (!project) return;
    const fuentesActuales: Fuente[] = Array.isArray(project.data?.fuentes)
      ? (project.data.fuentes as unknown[]).map((f) =>
          parseFuenteFromRaw(f as Record<string, unknown>)
        )
      : [];
    const target = fuentesActuales.find((x) => x.id === id);
    if (!target) return;
    const nuevoEstado = !target.principal;
    // Solo una principal por proyecto: al marcar una, desmarca las demas
    const nuevasFuentes: Fuente[] = fuentesActuales.map((f) => ({
      ...f,
      principal: f.id === id ? nuevoEstado : false,
    }));
    setOdfGuardando(true);
    setOdfError(null);
    try {
      await persistirFuentes(nuevasFuentes);
    } catch (err) {
      setOdfError(err instanceof Error ? err.message : 'Error al marcar principal');
    } finally {
      setOdfGuardando(false);
    }
  }

  // ── Upload / Delete de archivo adjunto por fuente — Chunk 15B ──
  async function handleUploadArchivo(fuenteId: string, file: File) {
    if (!project) return;
    setOdfUploadingId(fuenteId);
    setOdfUploadError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fuenteId', fuenteId);
      const res = await fetch('/api/fuentes/upload', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setOdfUploadError(json.error || 'Error al subir archivo');
        return;
      }
      const fuentesActuales: Fuente[] = Array.isArray(project.data?.fuentes)
        ? (project.data.fuentes as unknown[]).map((f) =>
            parseFuenteFromRaw(f as Record<string, unknown>)
          )
        : [];
      const actualizadas = fuentesActuales.map((f) => {
        if (f.id !== fuenteId) return f;
        const updated: Fuente = {
          ...f,
          archivo_url: json.url as string,
          archivo_nombre: file.name,
        };
        // Chunk 16B: si ya tenia archivo, respaldar V1
        if (f.archivo_url) {
          updated.archivo_url_v1 = f.archivo_url;
          updated.archivo_nombre_v1 = f.archivo_nombre;
          updated.archivo_replaced_at = new Date().toISOString();
        }
        return updated;
      });
      await persistirFuentes(actualizadas);
    } catch (err) {
      setOdfUploadError(err instanceof Error ? err.message : 'Error al subir archivo');
    } finally {
      setOdfUploadingId(null);
    }
  }

  async function handleDeleteArchivo(fuenteId: string, archivoUrl: string) {
    if (!project) return;
    if (!confirm('¿Eliminar el archivo adjunto de esta fuente?')) return;
    setOdfUploadError(null);
    try {
      const res = await fetch('/api/fuentes/delete-blob', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: archivoUrl }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setOdfUploadError(json.error || 'Error al eliminar archivo');
        return;
      }
      const fuentesActuales: Fuente[] = Array.isArray(project.data?.fuentes)
        ? (project.data.fuentes as unknown[]).map((f) =>
            parseFuenteFromRaw(f as Record<string, unknown>)
          )
        : [];
      const actualizadas = fuentesActuales.map((f) =>
        f.id === fuenteId
          ? { ...f, archivo_url: undefined, archivo_nombre: undefined }
          : f
      );
      await persistirFuentes(actualizadas);
    } catch (err) {
      setOdfUploadError(err instanceof Error ? err.message : 'Error al eliminar archivo');
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
  const phaseConfig = PHASE_CONFIG[project.status] ?? { tabs: [] };

  // ── Hipótesis (nuevo, Chunk 6) ──
  let savedHipotesis: HipotesisData | null = null;
  try {
    const raw = project.data?.hipotesis as Record<string, unknown> | undefined;
    if (raw && typeof raw === 'object') {
      const rawList = (raw.hipotesis ?? raw.angulos ?? []) as unknown[];
      const list = Array.isArray(rawList) ? rawList : [];
      const parsed = list.map((a, idx) =>
        parseHipotesisFromRaw(a as Record<string, unknown>, idx)
      );
      if (parsed.length > 0) {
        savedHipotesis = {
          hipotesis: parsed,
          notaEditorial: String(raw.notaEditorial ?? raw.nota_editorial ?? ''),
          tema: String(raw.tema ?? ''),
          audiencia: raw.audiencia ? String(raw.audiencia) : undefined,
          datoClave: raw.datoClave ? String(raw.datoClave) : undefined,
          generadoEn: String(raw.generadoEn ?? ''),
          modo: raw.modo ? String(raw.modo) : undefined,
        };
      }
    }
  } catch {
    savedHipotesis = null;
  }

  // ── Ángulos legacy (retrocompat — DREAMOMS-RP-2026-0001 y proyectos pre-Chunk 6) ──
  let savedAngulosLegacy: AngulosLegacy | null = null;
  try {
    const raw = project.data?.angulos as Record<string, unknown> | undefined;
    if (raw && typeof raw === 'object') {
      const rawList = (raw.angulos ?? []) as unknown[];
      const list = Array.isArray(rawList) ? rawList : [];
      const parsed = list.map((a, idx) =>
        parseHipotesisFromRaw(a as Record<string, unknown>, idx)
      );
      if (parsed.length > 0) {
        savedAngulosLegacy = {
          angulos: parsed,
          notaEditorial: String(raw.notaEditorial ?? raw.nota_editorial ?? ''),
          tema: String(raw.tema ?? ''),
          generadoEn: String(raw.generadoEn ?? ''),
        };
      }
    }
  } catch {
    savedAngulosLegacy = null;
  }

  // ── Hipótesis elegida ──
  let savedHipotesisElegida: HipotesisElegida | null = null;
  try {
    const raw = project.data?.hipotesis_elegida as Record<string, unknown> | undefined;
    if (raw && typeof raw === 'object' && raw.titulo) {
      const parsed = parseHipotesisFromRaw(raw, 0);
      savedHipotesisElegida = {
        ...parsed,
        elegidaEn: String(raw.elegidaEn ?? ''),
      };
    }
  } catch {
    savedHipotesisElegida = null;
  }

  // ── Fuentes del ODF (Chunk 7, retrocompat: proyectos viejos no tienen data.fuentes) ──
  const currentFuentes: Fuente[] = Array.isArray(project.data?.fuentes)
    ? (project.data.fuentes as unknown[]).map((f) =>
        parseFuenteFromRaw(f as Record<string, unknown>)
      )
    : [];

  // ── Validaciones VHP (Chunk 7B, retrocompat: proyectos viejos no tienen data.validaciones_hipotesis) ──
  const savedVhp: ValidacionHipotesisEntry[] = Array.isArray(
    project.data?.validaciones_hipotesis
  )
    ? (project.data.validaciones_hipotesis as unknown[]).map((v) =>
        parseValidacionHipotesisFromRaw(v as Record<string, unknown>)
      )
    : [];

  // ── Radar editorial historial ──
  let savedRadar: RadarEntry[] = [];
  try {
    const raw = project.data?.radar_editorial;
    if (Array.isArray(raw)) {
      savedRadar = (raw as unknown[]).map((r) => {
        const e = r as Record<string, unknown>;
        return {
          id: String(e.id ?? genId()),
          medio: String(e.medio ?? ''),
          url: String(e.url ?? ''),
          fecha_publicacion: String(e.fecha_publicacion ?? ''),
          notas_propias: String(e.notas_propias ?? ''),
          texto_analizado: String(e.texto_analizado ?? ''),
          evaluacion: parseValidacionDimensions(e.evaluacion),
          puntuacion_global: Number(e.puntuacion_global ?? 0),
          veredicto: String(e.veredicto ?? ''),
          resumen: String(e.resumen ?? ''),
          auditado_en: String(e.auditado_en ?? ''),
        };
      });
    }
  } catch {
    savedRadar = [];
  }

  // ── Validaciones de borrador historial ──
  let savedValidacionesBorrador: ValidacionBorradorEntry[] = [];
  try {
    const raw = project.data?.validaciones_borrador;
    if (Array.isArray(raw)) {
      savedValidacionesBorrador = (raw as unknown[]).map((v) => {
        const e = v as Record<string, unknown>;
        return {
          id: String(e.id ?? genId()),
          texto_analizado: String(e.texto_analizado ?? ''),
          evaluacion: parseValidacionDimensions(e.evaluacion),
          puntuacion_global: Number(e.puntuacion_global ?? 0),
          veredicto: String(e.veredicto ?? ''),
          resumen: String(e.resumen ?? ''),
          validado_en: String(e.validado_en ?? ''),
        };
      });
    }
  } catch {
    savedValidacionesBorrador = [];
  }

  // ── Validación legacy (retrocompat) ──
  let savedValidacionLegacy: ValidacionLegacy | null = null;
  try {
    const raw = project.data?.validacion_tono as Record<string, unknown> | undefined;
    if (raw && typeof raw === 'object' && Array.isArray(raw.evaluacion)) {
      savedValidacionLegacy = {
        evaluacion: parseValidacionDimensions(raw.evaluacion),
        puntuacion_global: Number(raw.puntuacion_global ?? 0),
        veredicto: String(raw.veredicto ?? ''),
        resumen: String(raw.resumen ?? ''),
        texto: String(raw.texto ?? ''),
        generadoEn: String(raw.generadoEn ?? ''),
      };
    }
  } catch {
    savedValidacionLegacy = null;
  }

  // ── Tenant seleccionado para traspaso ──
  const selectedTraspasoTenant = tenantsList.find((t) => t.slug === traspasoTenant);
  const hasBrandVariants =
    selectedTraspasoTenant?.brandVariants && selectedTraspasoTenant.brandVariants.length > 0;

  const templatesByFamily = templatesList.reduce<Record<string, TemplateOption[]>>((acc, t) => {
    if (!acc[t.family]) acc[t.family] = [];
    acc[t.family].push(t);
    return acc;
  }, {});

  // Key del título de la hipótesis elegida (para marcar en el listado)
  const elegidaKey = savedHipotesisElegida?.titulo ?? null;

  // ══════════════════════════════════════════════════════
  // HELPERS DE RENDER (closures — acceden a state/handlers)
  // ══════════════════════════════════════════════════════
  function renderDimensions(dims: ValidacionDimension[]) {
    return (
      <div className="space-y-3">
        {dims.map((dim, di) => (
          <div key={di} className="bg-space-cadet rounded-lg border border-davy-gray/15 p-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-seasalt text-sm font-medium capitalize">
                {dim.dimension.replace(/_/g, ' ')}
              </h4>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <span
                    key={n}
                    className={`w-5 h-2 rounded-full ${
                      n <= dim.puntuacion ? 'bg-amber-brand' : 'bg-davy-gray/20'
                    }`}
                  />
                ))}
              </div>
            </div>
            {dim.hallazgos.length > 0 && (
              <div className="mb-1">
                {dim.hallazgos.map((h, hi) => (
                  <p key={hi} className="text-red-400/80 text-xs mb-0.5">
                    ⚠ {h}
                  </p>
                ))}
              </div>
            )}
            {dim.sugerencias.length > 0 && (
              <div>
                {dim.sugerencias.map((s, si) => (
                  <p key={si} className="text-green-400/80 text-xs mb-0.5">
                    → {s}
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  function renderHipotesisCard(h: Hipotesis, idx: number, isElegida: boolean) {
    const isChosen = !isElegida && elegidaKey !== null && elegidaKey === h.titulo;
    return (
      <div
        className={`rounded-lg p-4 ${
          isElegida
            ? 'bg-oxford-blue border border-amber-brand/30'
            : isChosen
            ? 'bg-oxford-blue border-2 border-amber-brand/60 ring-1 ring-amber-brand/30'
            : 'bg-oxford-blue border border-davy-gray/15'
        }`}
      >
        {/* Header con tipo + título + badge elegida + badge verificación */}
        <div className="flex items-start justify-between mb-2 gap-2">
          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
            <span className="text-xs">{TIPO_LABELS[h.tipo] ?? h.tipo}</span>
            {isChosen && (
              <span className="bg-amber-brand/20 text-amber-brand border border-amber-brand/40 px-2 py-0.5 rounded text-xs font-bold">
                ⭐ ELEGIDA
              </span>
            )}
            <h3 className="text-seasalt font-medium text-sm w-full">
              {!isElegida ? `${h.numero}. ` : ''}
              {h.titulo}
            </h3>
          </div>
          {h.verificacion && (
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium border whitespace-nowrap ${
                VERIFICACION_COLORS[h.verificacion] ??
                'bg-davy-gray/20 text-davy-gray border-davy-gray/40'
              }`}
            >
              {h.verificacion.replace(/_/g, ' ')}
            </span>
          )}
        </div>

        {/* Badge riesgo_fabricacion (solo si existe — Chunk 6+) */}
        {h.riesgo_fabricacion && (
          <div className="mb-2">
            <span
              className={`inline-block px-2 py-0.5 rounded text-xs font-semibold border ${
                RIESGO_FAB_COLORS[h.riesgo_fabricacion] ??
                'bg-davy-gray/20 text-davy-gray border-davy-gray/40'
              }`}
            >
              {RIESGO_FAB_LABELS[h.riesgo_fabricacion] ??
                `Riesgo fabricación: ${h.riesgo_fabricacion}`}
            </span>
          </div>
        )}

        {/* Gancho */}
        {h.gancho && (
          <p className="text-davy-gray text-sm mb-2">
            <span className="text-amber-brand/80">Gancho:</span> {h.gancho}
          </p>
        )}

        {/* Pregunta clave */}
        {h.pregunta_clave && (
          <p className="text-davy-gray text-sm mb-2">
            <span className="text-blue-400/80">Pregunta clave:</span> {h.pregunta_clave}
          </p>
        )}

        {/* Meta: audiencia, tono, riesgo editorial */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-davy-gray mb-3">
          {h.audiencia && (
            <span>
              👥 <span className="text-seasalt/70">{h.audiencia}</span>
            </span>
          )}
          {h.tono && (
            <span>
              🎭 <span className="text-seasalt/70">{h.tono}</span>
            </span>
          )}
          {h.riesgo && (
            <span>
              ⚠️ <span className="text-seasalt/70">{h.riesgo}</span>
            </span>
          )}
        </div>

        {/* Lentes */}
        {h.lentes.length > 0 && (
          <div className="flex gap-1.5 mb-3 flex-wrap">
            {h.lentes.map((lente, li) => (
              <span
                key={li}
                className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-xs border border-blue-500/20"
              >
                {lente.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        )}

        {/* Verificaciones críticas con checkboxes visuales (Chunk 6+) */}
        {h.verificaciones_criticas && h.verificaciones_criticas.length > 0 && (
          <div className="mt-3 mb-3 bg-blue-500/5 border border-blue-500/20 rounded p-3">
            <p className="text-xs text-blue-400 font-semibold uppercase tracking-wider mb-2">
              🔍 Verificaciones críticas antes de publicar
            </p>
            <ul className="space-y-1.5">
              {h.verificaciones_criticas.map((vc, vi) => (
                <li key={vi} className="flex items-start gap-2 text-sm text-seasalt/80">
                  <span
                    className="flex-shrink-0 mt-0.5 w-4 h-4 border border-blue-400/50 rounded-sm bg-oxford-blue"
                    aria-hidden="true"
                  />
                  <span>{vc}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Evidencia requerida (Chunk 6+) */}
        {h.evidencia_requerida && (
          <div className="mt-3 mb-3 bg-amber-brand/5 border border-amber-brand/25 rounded p-3">
            <p className="text-xs text-amber-brand font-semibold uppercase tracking-wider mb-1">
              📚 Evidencia requerida
            </p>
            <p className="text-sm text-seasalt/80">{h.evidencia_requerida}</p>
          </div>
        )}

        {/* Fuentes tipo */}
        {h.fuentes.length > 0 && (
          <div className="mt-2 text-xs text-davy-gray">
            📚 Fuentes tipo:{' '}
            {h.fuentes.map((f, fi) => (
              <span key={fi}>
                {typeof f === 'object' && f
                  ? `${(f as Record<string, string>).cargo}, ${
                      (f as Record<string, string>).institucion
                    } (${(f as Record<string, string>).pais})`
                  : String(f)}
                {fi < h.fuentes.length - 1 ? ' · ' : ''}
              </span>
            ))}
          </div>
        )}

        {/* Botón elegir (solo en el listado, no en la card destacada de "hipótesis elegida") */}
        {!isElegida && (
          <div className="mt-4 pt-3 border-t border-davy-gray/15 flex justify-end">
            <button
              onClick={() => handleElegirHipotesis(h, idx)}
              disabled={eligiendo !== null || isChosen}
              className={`px-4 py-1.5 rounded text-xs font-semibold transition-colors ${
                isChosen
                  ? 'bg-amber-brand/20 text-amber-brand border border-amber-brand/40 cursor-default'
                  : 'bg-amber-brand/10 border border-amber-brand/30 text-amber-brand hover:bg-amber-brand/20'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {eligiendo === idx
                ? 'Eligiendo…'
                : isChosen
                ? '⭐ ELEGIDA'
                : '⭐ Elegir esta hipótesis'}
            </button>
          </div>
        )}
      </div>
    );
  }

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
              <span
                className={`px-2 py-0.5 rounded text-xs font-bold ${
                  isIPPhase
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                    : 'bg-amber-brand/20 text-amber-brand border border-amber-brand/40'
                }`}
              >
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
              const showElegidaBadge = phase === 'validacion' && !!savedHipotesisElegida;
              const showFuentesBadge = phase === 'pesquisa' && currentFuentes.length > 0;

              return (
                <div
                  key={phase}
                  className={`flex-1 rounded-md py-3 px-2 text-center text-xs font-medium transition-all
                    ${
                      isCurrent
                        ? 'bg-amber-brand text-oxford-blue ring-2 ring-amber-brand/50 scale-[1.02]'
                        : ''
                    }
                    ${
                      isPast
                        ? isIPBar
                          ? 'bg-blue-500/20 text-blue-400/80'
                          : 'bg-amber-brand/20 text-amber-brand/80'
                        : ''
                    }
                    ${isFuture ? 'bg-davy-gray/10 text-davy-gray/50' : ''}
                  `}
                >
                  <div className="text-base mb-1">{PHASE_ICONS[phase] ?? '○'}</div>
                  <div>{PHASE_LABELS[phase] ?? phase}</div>
                  {showElegidaBadge && (
                    <div className="mt-1 text-[10px] leading-none font-semibold">
                      ⭐ elegida
                    </div>
                  )}
                  {showFuentesBadge && (
                    <div className="mt-1 text-[10px] leading-none font-semibold">
                      🗂️ {currentFuentes.length} fuente{currentFuentes.length !== 1 ? 's' : ''}
                    </div>
                  )}
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
            <h2 className="text-amber-brand font-semibold mb-1">
              Traspaso: InvestigaPress → MetricPress
            </h2>
            <p className="text-davy-gray text-sm mb-4">
              Para avanzar a Producción, asigná la marca y el tipo de pieza.
            </p>

            {/* Chunk 23C: soft gate de score IP */}
            {(() => {
              const valIpArr23c = ((project?.data?.validaciones_ip ?? []) as ValidacionIPEntry[]);
              const lastScore = valIpArr23c.length > 0 ? valIpArr23c[valIpArr23c.length - 1].score : null;
              const needsScoreAck = valIpArr23c.length === 0 || (lastScore !== null && lastScore < 3.0);
              const borradorIpRaw23c = project?.data?.borrador_ip as Record<string, unknown> | undefined;
              const modoIP23c = borradorIpRaw23c?.modo as string | undefined;
              const isDiagnostico = modoIP23c === 'diagnostico';

              return (
                <>
                  {needsScoreAck && (
                    <div className="bg-amber-500/10 border border-amber-500/40 rounded p-4 mb-4">
                      <p className="text-amber-400 text-sm mb-2">
                        {valIpArr23c.length === 0
                          ? '⚠ El borrador IP no ha sido validado. Se recomienda ejecutar el Validador IP antes de traspasar.'
                          : `⚠ El ultimo score del Validador IP es ${lastScore!.toFixed(1)}/5.0, por debajo del minimo recomendado (3.0). Podes continuar, pero el borrador MP tendra una base debil.`
                        }
                      </p>
                      <label className="flex items-center gap-2 text-sm text-seasalt cursor-pointer">
                        <input
                          type="checkbox"
                          checked={traspasoScoreAck}
                          onChange={(e) => setTraspasoScoreAck(e.target.checked)}
                          className="accent-amber-brand"
                        />
                        Entiendo y quiero traspasar de todas formas
                      </label>
                    </div>
                  )}
                  {isDiagnostico && (
                    <div className="bg-blue-500/10 border border-blue-500/40 rounded p-4 mb-4">
                      <p className="text-blue-300 text-sm">
                        ℹ El borrador IP fue generado en modo diagnostico (ODF sin fuentes verificadas). El borrador MP tendra menos evidencia como base. Considera cargar fuentes al ODF y regenerar el borrador IP antes de traspasar.
                      </p>
                    </div>
                  )}
                </>
              );
            })()}

            <div className="space-y-4">
              {/* Tenant */}
              <div>
                <label className="block text-xs font-mono text-davy-gray uppercase tracking-wider mb-2">
                  Marca (Tenant)
                </label>
                <select
                  value={traspasoTenant}
                  onChange={(e) => {
                    setTraspasoTenant(e.target.value);
                    setTraspasoBrandVariant('');
                  }}
                  className="w-full bg-oxford-blue border border-davy-gray/50 rounded px-3 py-2.5 text-seasalt text-sm focus:outline-none focus:border-amber-brand"
                >
                  {tenantsList.map((t) => (
                    <option key={t.slug} value={t.slug}>
                      {t.name}
                    </option>
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
                      <option key={bv} value={bv}>
                        {bv}
                      </option>
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
                {TEMPLATE_DESCRIPTIONS[traspasoTemplate] && (
                  <p className="text-xs text-gray-500 mt-1">{TEMPLATE_DESCRIPTIONS[traspasoTemplate]}</p>
                )}
              </div>

              {/* Preview nuevo publicId */}
              {traspasoTenant && traspasoTemplate && (
                <div className="bg-oxford-blue rounded p-3 border border-davy-gray/20">
                  <p className="text-xs text-davy-gray mb-1">Nuevo PublicId:</p>
                  <p className="text-amber-brand font-mono">
                    {traspasoTenant.toUpperCase()}-
                    {templatesList.find((t) => t.slug === traspasoTemplate)?.idPrefix ?? '??'}-
                    {new Date().getFullYear()}-XXXX
                  </p>
                </div>
              )}

              {/* Botones */}
              <div className="flex gap-3">
                <button
                  onClick={handleTraspaso}
                  disabled={traspasoLoading || !traspasoTenant || !traspasoTemplate || (() => {
                    const vArr = ((project?.data?.validaciones_ip ?? []) as ValidacionIPEntry[]);
                    const needsAck = vArr.length === 0 || vArr[vArr.length - 1].score < 3.0;
                    return needsAck && !traspasoScoreAck;
                  })()}
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

              {traspasoError && <p className="text-red-400 text-sm">{traspasoError}</p>}
            </div>
          </section>
        )}

        {/* ── Chunk 18A: Export Gate — condiciones fallidas ── */}
        {exportGateConditions && (() => {
          const hardFailed = exportGateConditions.some((c) => !c.passed && !c.soft);
          const c4Condition = exportGateConditions.find((c) => c.id === 'C4');
          const c4Failed = c4Condition && !c4Condition.passed;
          const canExport = !hardFailed && (!c4Failed || c4Ack);
          return (
            <section className={`bg-space-cadet rounded-lg border-2 p-6 ${hardFailed ? 'border-red-500/50' : 'border-amber-500/50'}`}>
              <h2 className={`font-semibold mb-1 ${hardFailed ? 'text-red-400' : 'text-amber-400'}`}>
                Requisitos para exportar
              </h2>
              <p className="text-davy-gray text-sm mb-4">
                {hardFailed
                  ? 'El proyecto debe cumplir las condiciones obligatorias antes de poder exportarse.'
                  : 'Las condiciones obligatorias se cumplen. Revisa las recomendaciones antes de exportar.'}
              </p>
              <ul className="space-y-2 mb-4">
                {exportGateConditions.map((c) => (
                  <li key={c.id} className="flex items-start gap-2 text-sm">
                    <span className={`mt-0.5 flex-shrink-0 ${
                      c.passed ? 'text-green-400' : (c.soft ? 'text-amber-400' : 'text-red-400')
                    }`}>
                      {c.passed ? '✓' : (c.soft ? '⚠' : '✗')}
                    </span>
                    <span className={c.passed ? 'text-davy-gray' : 'text-seasalt'}>
                      <span className="font-mono text-xs text-davy-gray/60 mr-1">{c.id}</span>
                      {c.descripcion}
                    </span>
                  </li>
                ))}
              </ul>
              {c4Failed && !hardFailed && (
                <div className="bg-amber-500/10 border border-amber-500/40 rounded p-4 mb-4">
                  <p className="text-amber-400 text-sm mb-2">
                    El operador puede exportar asumiendo la responsabilidad editorial.
                  </p>
                  <label className="flex items-center gap-2 text-sm text-seasalt cursor-pointer">
                    <input
                      type="checkbox"
                      checked={c4Ack}
                      onChange={(e) => setC4Ack(e.target.checked)}
                      className="accent-amber-brand"
                    />
                    Entiendo y confirmo la exportacion sin score suficiente
                  </label>
                </div>
              )}
              <div className="flex gap-3">
                {canExport && (
                  <button
                    onClick={() => {
                      setExportGateConditions(null);
                      handlePipelineAction('advance');
                    }}
                    disabled={actionLoading}
                    className="px-4 py-2 bg-amber-brand text-oxford-blue rounded text-sm font-bold hover:bg-amber-brand/90 disabled:opacity-50"
                  >
                    {actionLoading ? 'Avanzando...' : 'Exportar'}
                  </button>
                )}
                <button
                  onClick={() => { setExportGateConditions(null); setC4Ack(false); }}
                  className="px-4 py-2 border border-davy-gray/30 text-davy-gray rounded text-sm hover:text-seasalt"
                >
                  Cerrar
                </button>
              </div>
            </section>
          );
        })()}

        {/* ── Info del Project ── */}
        <section className="bg-space-cadet rounded-lg border border-davy-gray/20 p-6">
          <h2 className="text-seasalt font-semibold mb-4">Información</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-davy-gray">Tenant:</span>
              <span className="text-seasalt ml-2">
                {project.tenantName ?? (
                  <span className="text-davy-gray/50 italic">Sin asignar (InvestigaPress)</span>
                )}
              </span>
            </div>
            <div>
              <span className="text-davy-gray">Template:</span>
              <span className="text-seasalt ml-2">
                {project.templateName ?? (
                  <span className="text-davy-gray/50 italic">Sin asignar</span>
                )}
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
            {/* Chunk 28: editor asignado */}
            <div className="col-span-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-davy-gray">Editor asignado:</span>
                <select
                  value={project.editorId ?? ''}
                  onChange={(e) => handleAsignarEditor(e.target.value || null)}
                  disabled={asignandoEditor}
                  className="bg-oxford-blue border border-davy-gray/40 rounded px-2 py-1 text-seasalt text-xs focus:outline-none focus:border-amber-brand disabled:opacity-50"
                >
                  <option value="">Sin asignar</option>
                  {editoresList
                    .filter((ed) => ed.activo || ed.id === project.editorId)
                    .map((ed) => (
                      <option key={ed.id} value={ed.id}>
                        {ed.nombre} {ed.apellido} — {ed.medio}
                        {!ed.activo ? ' (inactivo)' : ''}
                      </option>
                    ))}
                </select>
                {asignandoEditor && (
                  <span className="text-davy-gray text-xs italic">Guardando…</span>
                )}
                {editorSavedFlash && !asignandoEditor && (
                  <span className="text-green-400 text-xs">✓ Guardado</span>
                )}
                {editorError && (
                  <span className="text-red-400 text-xs">{editorError}</span>
                )}
              </div>
            </div>
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
          {(() => {
            const hipElegidaRaw = project.data?.hipotesis_elegida as Record<string, unknown> | undefined;
            const tituloHipElegida = hipElegidaRaw?.titulo as string | undefined;
            const thesisObsoleta = !!tituloHipElegida;

            if (project.thesis && thesisObsoleta) {
              return (
                <div className="mt-4 pt-4 border-t border-davy-gray/20 space-y-3">
                  <div className="opacity-50 text-sm">
                    <span className="text-xs text-gray-400 italic">Tesis original</span>
                    <p className="text-seasalt mt-1">{project.thesis}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-davy-gray text-sm font-semibold">Hipótesis elegida</span>
                      <span className="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full">Activa</span>
                    </div>
                    <p className="text-seasalt mt-1">{tituloHipElegida}</p>
                  </div>
                </div>
              );
            }

            if (project.thesis) {
              return (
                <div className="mt-4 pt-4 border-t border-davy-gray/20">
                  <span className="text-davy-gray text-sm">Tesis:</span>
                  <p className="text-seasalt mt-1">{project.thesis}</p>
                </div>
              );
            }

            if (tituloHipElegida) {
              return (
                <div className="mt-4 pt-4 border-t border-davy-gray/20">
                  <div className="flex items-center gap-2">
                    <span className="text-davy-gray text-sm font-semibold">Hipótesis elegida</span>
                    <span className="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full">Activa</span>
                  </div>
                  <p className="text-seasalt mt-1">{tituloHipElegida}</p>
                </div>
              );
            }

            return (
              <div className="mt-4 pt-4 border-t border-davy-gray/20">
                <span className="text-davy-gray text-sm">Tesis:</span>
                <p className="text-davy-gray/70 text-sm italic mt-1">
                  Aun no hay tesis definida. Puedes generar hipotesis en la fase Validacion
                  y la tesis va a emerger de la hipotesis que elijas.
                </p>
              </div>
            );
          })()}
        </section>

        {/* ══════════════════════════════════════════════════════ */}
        {/* ── Herramientas condicionales por fase del pipeline ── */}
        {/* ══════════════════════════════════════════════════════ */}
        <section className="bg-space-cadet rounded-lg border border-davy-gray/20 overflow-hidden">
          {/* Tab bar — solo si hay 2+ tabs */}
          {phaseConfig.tabs.length > 1 && (
            <div className="flex border-b border-davy-gray/20">
              {phaseConfig.tabs.map((tab) => (
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
          )}

          {/* Header — para fases con un único tab activo */}
          {phaseConfig.tabs.length === 1 && (
            <div className="px-6 pt-5 pb-3 border-b border-davy-gray/20">
              <h2 className="text-amber-brand font-semibold">{phaseConfig.tabs[0].label}</h2>
            </div>
          )}

          <div className="p-6">
            {/* ── Placeholder destacado (produccion, visual, exportado) ── */}
            {phaseConfig.tabs.length === 0 && phaseConfig.placeholder && (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">🛠️</div>
                <p className="text-davy-gray text-lg">{phaseConfig.placeholder}</p>
                <p className="text-davy-gray/60 text-sm mt-2">
                  Esta herramienta aún no está disponible en esta fase.
                </p>
              </div>
            )}

            {/* ── Subtitle descriptivo del tab activo (Chunk 20A) ── */}
            {(() => {
              const activeTabConfig = phaseConfig.tabs.find((t) => t.key === activeTool);
              if (!activeTabConfig?.subtitle) return null;
              return (
                <p className="text-davy-gray text-sm mb-4">{activeTabConfig.subtitle}</p>
              );
            })()}

            {/* ── Info (draft — fases sin tabs) ── */}
            {phaseConfig.tabs.length === 0 && phaseConfig.info && (
              <div className="text-center py-10">
                <div className="text-5xl mb-3">📝</div>
                <p className="text-davy-gray">{phaseConfig.info}</p>
              </div>
            )}

            {activeTool === 'gate_1a' && phaseConfig.tabs.some((t) => t.key === 'gate_1a') && (
              <div className="space-y-4">
                {(() => {
                  const gate1a = (project.data?.gate_1a as Gate1aData | undefined) ?? null;
                  const tieneResultado = !!gate1a?.ultimoResultado;
                  const estado = gate1a?.estado ?? 'pendiente';
                  const resultado = gate1a?.ultimoResultado ?? null;
                  const globalConfig = resultado
                    ? GATE_1A_GLOBAL_LABELS[resultado.veredicto_global]
                    : null;

                  return (
                    <>
                      {/* Introduccion explicativa */}
                      {!tieneResultado && (
                        <div className="bg-blue-50 border border-blue-200 rounded p-4">
                          <h3 className="font-semibold text-blue-900 mb-2">¿Qué hace la Revisión de supuestos?</h3>
                          <p className="text-sm text-blue-900">
                            Antes de generar hipótesis, este paso audita los supuestos factuales concretos que contiene el título y la tesis del proyecto: nombres propios, denominaciones oficiales, fechas y entidades mencionadas. El objetivo es detectar si la pregunta parte de información incorrecta, para no construir pesquisa sobre un supuesto falso.
                          </p>
                          <p className="text-sm text-blue-900 mt-2">
                            No evalúa calidad periodística ni relevancia editorial. Esa evaluación viene después.
                          </p>
                        </div>
                      )}

                      {/* Estado actual del gate */}
                      {estado === 'aprobado' && (
                        <div className="bg-green-50 border border-green-300 rounded p-3 flex items-center gap-3">
                          <span className="text-green-700 text-2xl">✓</span>
                          <div>
                            <div className="font-semibold text-green-900">Revisión aprobada</div>
                            <div className="text-xs text-green-800">
                              {gate1a?.aprobadoEn ? `Aprobada el ${new Date(gate1a.aprobadoEn).toLocaleString('es-CL')}` : ''}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Enunciado actual */}
                      <div className="bg-white border border-gray-200 rounded p-4">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-semibold text-gray-900">Enunciado del proyecto</h3>
                          {!gate1aEditandoEnunciado && (
                            <button
                              onClick={handleAbrirEdicionEnunciado}
                              className="text-sm text-blue-600 hover:text-blue-800 underline"
                            >
                              Editar enunciado
                            </button>
                          )}
                        </div>

                        {!gate1aEditandoEnunciado ? (
                          <>
                            <div className="text-sm text-gray-500 mb-1">Título</div>
                            <div className="text-gray-900 mb-3">{project.title}</div>
                            <div className="text-sm text-gray-500 mb-1">Tesis</div>
                            <div className="text-gray-900">
                              {project.thesis || <span className="text-gray-400 italic">Sin tesis definida</span>}
                            </div>
                          </>
                        ) : (
                          <div className="space-y-3">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
                              <input
                                type="text"
                                value={gate1aEditTitle}
                                onChange={(e) => setGate1aEditTitle(e.target.value)}
                                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                                maxLength={500}
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Tesis (opcional)</label>
                              <textarea
                                value={gate1aEditThesis}
                                onChange={(e) => setGate1aEditThesis(e.target.value)}
                                rows={4}
                                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                              />
                            </div>
                            <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-xs text-yellow-900">
                              Al guardar cambios, el resultado actual del Gate 1a se archiva en el historial y el estado vuelve a &ldquo;pendiente&rdquo;. Tendrás que re-ejecutar la revisión con el enunciado corregido.
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={handleGuardarEnunciado}
                                disabled={gate1aGuardandoEnunciado}
                                className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:bg-gray-400"
                              >
                                {gate1aGuardandoEnunciado ? 'Guardando...' : 'Guardar enunciado'}
                              </button>
                              <button
                                onClick={handleCancelarEdicionEnunciado}
                                disabled={gate1aGuardandoEnunciado}
                                className="bg-gray-200 text-gray-800 px-4 py-2 rounded text-sm hover:bg-gray-300"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Boton de ejecutar / re-ejecutar */}
                      {!gate1aEditandoEnunciado && (
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={handleEjecutarGate1a}
                            disabled={gate1aLoading}
                            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
                          >
                            {gate1aLoading
                              ? 'Ejecutando revisión...'
                              : tieneResultado
                                ? 'Re-ejecutar revisión'
                                : 'Ejecutar Revisión de supuestos'}
                          </button>
                          {tieneResultado && estado !== 'aprobado' && (
                            <button
                              onClick={handleAprobarGate1a}
                              disabled={gate1aAprobando}
                              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400"
                            >
                              {gate1aAprobando ? 'Aprobando...' : 'Aprobar revisión'}
                            </button>
                          )}
                          {/* Chunk 31I-2: exportar supuestos a .docx para correccion externa */}
                          {tieneResultado && resultado?.veredicto_global === 'requiere_correccion' && (() => {
                            const supuestosPendientes = (resultado.supuestos ?? []).filter(
                              (s) => s.veredicto === 'dudoso' || s.veredicto === 'falso',
                            );
                            if (supuestosPendientes.length === 0) return null;
                            return (
                              <button
                                type="button"
                                onClick={handleExportarGate1a}
                                disabled={exportandoGate1a}
                                className="bg-amber-600 text-white px-4 py-2 rounded hover:bg-amber-700 disabled:bg-gray-400"
                                title="Exporta los supuestos dudosos o falsos a un documento Word que podés llevar a un motor de verificacion externo"
                              >
                                {exportandoGate1a ? 'Exportando...' : 'Exportar supuestos para correccion externa'}
                              </button>
                            );
                          })()}
                          {/* Chunk 31I-3: importar correccion externa (.md o .docx) */}
                          {(gate1a?.exportaciones?.length ?? 0) > 0 && (
                            <>
                              <input
                                ref={importGate1aInputRef}
                                type="file"
                                accept=".md,.docx,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) void handleImportarGate1aCorreccion(f);
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => importGate1aInputRef.current?.click()}
                                disabled={importandoGate1a}
                                className="bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700 disabled:bg-gray-400"
                                title="Importa un expediente .md o .docx con la correccion producida por un motor externo (por ejemplo Sala de Redaccion)"
                              >
                                {importandoGate1a ? 'Importando...' : 'Importar correccion externa'}
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {/* Chunk 31J-1: seccion de revision de correcciones externas importadas */}
                      {(gate1a?.correcciones?.length ?? 0) > 0 && (
                        <div className="bg-white border border-gray-200 rounded p-4 space-y-4">
                          <h3 className="font-semibold text-lg">Correcciones externas importadas</h3>
                          <p className="text-sm text-gray-600">
                            Eventos recibidos del motor externo. Revisá el contenido de cada corrección. Los controles para aplicarla o descartarla llegan en las próximas actualizaciones de este tab.
                          </p>
                          {/* Chunk 31J-1: render descriptivo. Botones de Aplicar (31J-2) y Descartar (31J-3) llegan en sub-chunks siguientes. */}
                          {[...(gate1a?.correcciones ?? [])]
                            .sort((a, b) => b.importadoEn.localeCompare(a.importadoEn))
                            .map((evento) => {
                              const estadoBadge = evento.aplicado === true
                                ? { texto: 'Aplicado', clases: 'bg-emerald-100 text-emerald-800 border border-emerald-300' }
                                : evento.descartado === true
                                  ? { texto: 'Descartado', clases: 'bg-gray-100 text-gray-700 border border-gray-300' }
                                  : { texto: 'Pendiente', clases: 'bg-amber-100 text-amber-800 border border-amber-300' };
                              return (
                                <div key={evento.id} className="border border-gray-300 rounded p-4 space-y-3">
                                  <div className="flex flex-wrap gap-2 items-center">
                                    <span className={`${estadoBadge.clases} px-2 py-0.5 rounded text-xs font-medium`}>
                                      {estadoBadge.texto}
                                    </span>
                                    <span className="font-mono text-sm">{evento.nombreArchivo}</span>
                                    <span className="text-sm text-gray-600">
                                      {new Date(evento.importadoEn).toLocaleString('es-CL')}
                                    </span>
                                    <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs">
                                      {evento.formatoOrigen.toUpperCase()}
                                    </span>
                                  </div>

                                  <div className="space-y-1">
                                    <h4 className="font-medium text-sm">Enunciado propuesto</h4>
                                    <div className="text-sm">
                                      <span className="text-gray-600">Título: </span>
                                      {evento.enunciadoCorregido.titulo !== null ? (
                                        <span className="font-medium">{evento.enunciadoCorregido.titulo}</span>
                                      ) : (
                                        <span className="italic text-gray-500">(sin cambios)</span>
                                      )}
                                    </div>
                                    <div className="text-sm">
                                      <span className="text-gray-600">Tesis: </span>
                                      {evento.enunciadoCorregido.tesis !== null ? (
                                        <span className="font-medium">{evento.enunciadoCorregido.tesis}</span>
                                      ) : (
                                        <span className="italic text-gray-500">(sin cambios)</span>
                                      )}
                                    </div>
                                  </div>

                                  <details>
                                    <summary className="cursor-pointer font-medium text-sm">
                                      Supuestos evaluados ({evento.supuestos.length})
                                    </summary>
                                    <ul className="space-y-2 mt-2">
                                      {evento.supuestos.map((supuesto) => {
                                        const veredictoClases = supuesto.veredictoFinal === 'confirmado'
                                          ? 'bg-green-100 text-green-800 border border-green-300'
                                          : supuesto.veredictoFinal === 'corregido'
                                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                            : supuesto.veredictoFinal === 'descartado'
                                              ? 'bg-gray-100 text-gray-700 border border-gray-300'
                                              : 'bg-red-100 text-red-800 border border-red-300';
                                        return (
                                          <li key={supuesto.id} className="space-y-1">
                                            <div className="flex flex-wrap gap-2 items-center">
                                              <span className="font-mono text-xs">{supuesto.id}</span>
                                              <span className={`${veredictoClases} px-2 py-0.5 rounded text-xs font-medium`}>
                                                {supuesto.veredictoFinal}
                                              </span>
                                            </div>
                                            {supuesto.textoCorregido && (
                                              <p className="text-sm">
                                                <span className="text-gray-600">Texto corregido: </span>
                                                {supuesto.textoCorregido}
                                              </p>
                                            )}
                                            {supuesto.justificacion && (
                                              <blockquote className="border-l-2 border-gray-300 pl-3 text-sm text-gray-700">
                                                {supuesto.justificacion}
                                              </blockquote>
                                            )}
                                            {supuesto.fuentes.length > 0 && (
                                              <ul className="list-disc pl-5 text-sm text-gray-700">
                                                {supuesto.fuentes.map((fuente, idx) => (
                                                  <li key={idx}>{fuente}</li>
                                                ))}
                                              </ul>
                                            )}
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  </details>

                                  {evento.fuentesGlobales.length > 0 && (
                                    <div className="space-y-1">
                                      <h4 className="font-medium text-sm">Fuentes globales</h4>
                                      <ul className="list-disc pl-5 text-sm text-gray-700">
                                        {evento.fuentesGlobales.map((fuente, idx) => (
                                          <li key={idx}>{fuente}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}

                                  {evento.notaEditorial && evento.notaEditorial.length > 0 && (
                                    <div className="space-y-1">
                                      <h4 className="font-medium text-sm">Nota editorial</h4>
                                      <blockquote className="border-l-2 border-gray-300 pl-3 text-sm text-gray-700 italic">
                                        {evento.notaEditorial}
                                      </blockquote>
                                    </div>
                                  )}

                                  {evento.warnings.length > 0 && (
                                    <div className="space-y-1">
                                      <h4 className="font-medium text-sm text-amber-800">Warnings del parser</h4>
                                      <ul className="list-disc pl-5 text-sm text-amber-700">
                                        {evento.warnings.map((warning, idx) => (
                                          <li key={idx}>{warning}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}

                                  {!evento.aplicado && !evento.descartado && (
                                    <button
                                      type="button"
                                      onClick={() => void handleAplicarGate1aCorreccion(evento.id)}
                                      disabled={aplicandoCorreccionId !== null}
                                      title="Aplica esta corrección al enunciado del proyecto y resetea el Gate 1a a pendiente"
                                      className="bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700 disabled:bg-gray-400 text-sm"
                                    >
                                      {aplicandoCorreccionId === evento.id ? 'Aplicando...' : 'Aplicar corrección'}
                                    </button>
                                  )}

                                  <div className="text-xs text-gray-500 italic border-t border-gray-200 pt-2 mt-2">
                                    El botón para Descartar esta corrección se activa en el sub-chunk 31J-3.
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}

                      {gate1aError && (
                        <div className="bg-red-50 border border-red-300 rounded p-3 text-sm text-red-800">
                          {gate1aError}
                        </div>
                      )}

                      {/* Resultado de la ultima ejecucion */}
                      {tieneResultado && resultado && globalConfig && (
                        <div className="bg-white border border-gray-200 rounded p-4 space-y-4">
                          <div className={`border rounded p-3 ${globalConfig.color}`}>
                            <div className="font-semibold mb-1">{globalConfig.label}</div>
                            <div className="text-sm mb-2">{resultado.resumen}</div>
                            <div className="text-xs opacity-80">{globalConfig.descripcion}</div>
                          </div>

                          <div className="text-xs text-gray-500">
                            Ejecutada el {new Date(resultado.ejecutadoEn).toLocaleString('es-CL')}
                          </div>

                          {resultado.supuestos.length === 0 ? (
                            <div className="text-sm text-gray-600 italic">
                              El modelo no identificó supuestos factuales concretos para auditar. Esto puede significar que el enunciado es abstracto, muy general, o no contiene afirmaciones factuales verificables. Considera si el enunciado necesita más especificidad antes de avanzar a Validación.
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <h4 className="font-semibold text-gray-900">
                                Supuestos detectados ({resultado.supuestos.length})
                              </h4>
                              {resultado.supuestos.map((s) => {
                                const veredictoConfig = GATE_1A_VEREDICTO_LABELS[s.veredicto];
                                return (
                                  <div key={s.id} className="border border-gray-200 rounded p-3">
                                    <div className="flex justify-between items-start gap-2 mb-2 flex-wrap">
                                      <div className="text-xs text-gray-500 uppercase tracking-wide">
                                        {GATE_1A_CATEGORIA_LABELS[s.categoria]}
                                      </div>
                                      <span className={`text-xs px-2 py-1 rounded border ${veredictoConfig.color}`}>
                                        {veredictoConfig.label}
                                      </span>
                                    </div>
                                    <div className="text-gray-900 font-medium mb-2">&ldquo;{s.enunciado}&rdquo;</div>
                                    <div className="text-sm text-gray-700 mb-2">{s.justificacion}</div>
                                    {s.veredicto === 'falso' && s.correccion_sugerida && (
                                      <div className="bg-amber-50 border border-amber-200 rounded p-2 text-sm">
                                        <span className="font-medium text-amber-900">Corrección sugerida: </span>
                                        <span className="text-amber-900">{s.correccion_sugerida}</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Historial de revisiones previas */}
                      {gate1a?.historial && gate1a.historial.length > 0 && (
                        <div className="bg-white border border-gray-200 rounded p-4">
                          <button
                            onClick={() => setGate1aVerHistorial((v) => !v)}
                            className="text-sm text-blue-600 hover:text-blue-800 underline"
                          >
                            {gate1aVerHistorial ? 'Ocultar' : 'Ver'} historial de revisiones ({gate1a.historial.length})
                          </button>
                          {gate1aVerHistorial && (
                            <div className="mt-3 space-y-2">
                              {gate1a.historial.map((h, idx) => (
                                <div key={idx} className="text-xs border-l-2 border-gray-300 pl-3">
                                  <div className="text-gray-500">
                                    {new Date(h.ejecutadoEn).toLocaleString('es-CL')} — {GATE_1A_GLOBAL_LABELS[h.veredicto_global].label}
                                  </div>
                                  <div className="text-gray-700 mt-1">{h.resumen}</div>
                                  <div className="text-gray-500 mt-1 italic">
                                    Enunciado evaluado: &ldquo;{h.enunciado_evaluado.title}&rdquo;
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {/* ── TAB: Hito 1 — Validacion de hipotesis elegida (fase hito_1) ── */}
            {activeTool === 'hito_1' && (
              <div className="space-y-6">
                {(() => {
                  const dataObj = (project.data ?? {}) as Record<string, unknown>;
                  const hipotesisElegida = dataObj.hipotesis_elegida as HipotesisElegida | undefined;
                  const hito1 = (dataObj.hito_1 as Hito1Data | undefined) ?? {
                    estado: 'pendiente' as Hito1Estado,
                    ultimoResultado: null,
                    aprobadoEn: null,
                    historial: [],
                  };

                  if (!hipotesisElegida) {
                    return (
                      <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-4 text-sm text-amber-100">
                        <strong>No hay hipotesis elegida.</strong> Retrocedé al pipeline y elegí una hipotesis en el tab <em>Generador de Hipotesis</em> de la fase anterior. El Hito 1 necesita una hipotesis elegida para poder validarla.
                      </div>
                    );
                  }

                  const resultado = hito1.ultimoResultado;
                  const aprobado = hito1.estado === 'aprobado';
                  const veredictoCorrectivo = resultado?.correctivo.veredicto;

                  // Color semaforizado del panel correctivo
                  const correctivoColor =
                    veredictoCorrectivo === 'coherente' ? 'border-emerald-500/60 bg-emerald-950/30' :
                    veredictoCorrectivo === 'requiere_reformulacion' ? 'border-amber-500/60 bg-amber-950/30' :
                    veredictoCorrectivo === 'inviable' ? 'border-red-500/60 bg-red-950/30' :
                    'border-slate-700 bg-slate-900/40';

                  return (
                    <>
                      {/* Encabezado + introduccion */}
                      {!resultado && (
                        <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-300">
                          <p className="mb-2"><strong>Hito 1 - Validacion de la hipotesis elegida.</strong></p>
                          <p className="mb-2">Antes de invertir trabajo de pesquisa, el modelo evalua la hipotesis elegida en dos capas separadas:</p>
                          <ul className="list-disc pl-5 space-y-1">
                            <li><strong>Correctivo</strong> (bloqueante): coherencia interna, falsabilidad, viabilidad factual. Si una dimension falla, el modelo propone reformulacion.</li>
                            <li><strong>Optimizadora</strong> (informativo): existe un angulo con mas potencia periodistica? Si existe, el modelo lo propone con sus trade-offs.</li>
                          </ul>
                        </div>
                      )}

                      {/* Resumen de la hipotesis que se va a evaluar */}
                      <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4 text-sm">
                        <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">Hipotesis elegida a evaluar</p>
                        <p className="text-slate-100 font-medium">{hipotesisElegida.titulo ?? '(sin titulo)'}</p>
                        {hipotesisElegida.pregunta_clave && (
                          <p className="text-slate-300 mt-1 text-xs">Pregunta clave: {hipotesisElegida.pregunta_clave}</p>
                        )}
                      </div>

                      {/* Badge de aprobacion si aplica */}
                      {aprobado && (
                        <div className="rounded-lg border border-emerald-500/60 bg-emerald-950/30 p-3 text-sm text-emerald-100">
                          ✅ <strong>Hito 1 aprobado</strong>
                          {hito1.aprobadoEn && <span className="text-xs text-emerald-300/80 ml-2">({new Date(hito1.aprobadoEn).toLocaleString()})</span>}
                        </div>
                      )}

                      {/* Error bar */}
                      {hito1Error && (
                        <div className="rounded-lg border border-red-500/60 bg-red-950/30 p-3 text-sm text-red-100">
                          {hito1Error}
                        </div>
                      )}

                      {/* Botones contextuales */}
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={handleEjecutarHito1}
                          disabled={ejecutandoHito1 || aprobandoHito1}
                          className="px-4 py-2 rounded bg-amber-brand text-slate-950 font-medium disabled:opacity-50"
                        >
                          {ejecutandoHito1 ? 'Ejecutando...' : resultado ? 'Re-ejecutar Hito 1' : 'Ejecutar Hito 1'}
                        </button>
                        {resultado && !aprobado && (
                          <button
                            onClick={handleAprobarHito1}
                            disabled={aprobandoHito1 || ejecutandoHito1}
                            className="px-4 py-2 rounded border border-emerald-500/60 text-emerald-100 disabled:opacity-50"
                          >
                            {aprobandoHito1 ? 'Aprobando...' : 'Aprobar Hito 1'}
                          </button>
                        )}
                      </div>

                      {/* Panel correctivo - semaforizado */}
                      {resultado && (
                        <div className={`rounded-lg border p-4 space-y-3 ${correctivoColor}`}>
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-slate-100 uppercase tracking-wide">Veredicto correctivo</h3>
                            <span className="text-xs px-2 py-1 rounded bg-slate-900/60 text-slate-200">
                              {resultado.correctivo.veredicto}
                            </span>
                          </div>
                          <div className="grid gap-3 md:grid-cols-3 text-xs">
                            {(['coherencia', 'falsabilidad', 'viabilidad_factual'] as const).map((dim) => {
                              const d = resultado.correctivo.dimensiones[dim];
                              return (
                                <div key={dim} className="rounded border border-slate-700/60 bg-slate-900/40 p-2">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-slate-400 uppercase text-[10px] tracking-wider">{dim.replace('_', ' ')}</span>
                                    <span className={d.pasa ? 'text-emerald-300' : 'text-red-300'}>{d.pasa ? '✓' : '✗'}</span>
                                  </div>
                                  <p className="text-slate-200 leading-snug">{d.justificacion}</p>
                                </div>
                              );
                            })}
                          </div>
                          {resultado.correctivo.problemas_detectados.length > 0 && (
                            <div>
                              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Problemas detectados</p>
                              <ul className="list-disc pl-5 text-sm text-slate-200 space-y-1">
                                {resultado.correctivo.problemas_detectados.map((p, i) => <li key={i}>{p}</li>)}
                              </ul>
                            </div>
                          )}
                          {resultado.correctivo.reformulacion_sugerida && (
                            <div>
                              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Reformulacion sugerida</p>
                              <p className="text-sm text-slate-100 italic">{resultado.correctivo.reformulacion_sugerida}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Panel optimizadora - informativo azul */}
                      {resultado && (
                        <div className="rounded-lg border border-sky-500/40 bg-sky-950/20 p-4 space-y-3">
                          <h3 className="text-sm font-semibold text-sky-100 uppercase tracking-wide">Sugerencia optimizadora (informativa)</h3>
                          {resultado.optimizadora.existe_angulo_mejor && resultado.optimizadora.angulo_sugerido ? (
                            <>
                              <div>
                                <p className="text-xs text-sky-300 uppercase tracking-wide mb-1">Angulo sugerido</p>
                                <p className="text-sm text-slate-100">{resultado.optimizadora.angulo_sugerido}</p>
                              </div>
                              <div>
                                <p className="text-xs text-sky-300 uppercase tracking-wide mb-1">Justificacion</p>
                                <p className="text-sm text-slate-200">{resultado.optimizadora.justificacion}</p>
                              </div>
                              {resultado.optimizadora.trade_offs.length > 0 && (
                                <div>
                                  <p className="text-xs text-sky-300 uppercase tracking-wide mb-1">Trade-offs</p>
                                  <ul className="list-disc pl-5 text-sm text-slate-200 space-y-1">
                                    {resultado.optimizadora.trade_offs.map((t, i) => <li key={i}>{t}</li>)}
                                  </ul>
                                </div>
                              )}
                            </>
                          ) : (
                            <p className="text-sm text-slate-300">
                              El modelo no detecto un angulo adyacente con mas potencia. La hipotesis actual esta bien enfocada.
                            </p>
                          )}
                        </div>
                      )}

                      {/* Resumen */}
                      {resultado && (
                        <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 text-sm text-slate-200">
                          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Resumen</p>
                          <p>{resultado.resumen}</p>
                        </div>
                      )}

                      {/* Historial colapsable */}
                      {hito1.historial.length > 0 && (
                        <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 text-xs">
                          <button
                            onClick={() => setVerHistorialHito1((v) => !v)}
                            className="text-slate-300 hover:text-slate-100"
                          >
                            {verHistorialHito1 ? '▼' : '▶'} Historial ({hito1.historial.length} revisiones previas)
                          </button>
                          {verHistorialHito1 && (
                            <ul className="mt-2 space-y-2">
                              {[...hito1.historial].reverse().map((h, i) => (
                                <li key={i} className="border border-slate-700/60 rounded p-2">
                                  <div className="flex justify-between text-slate-400 text-[10px]">
                                    <span>{new Date(h.ejecutadoEn).toLocaleString()}</span>
                                    <span>{h.correctivo.veredicto}</span>
                                  </div>
                                  <p className="text-slate-300 mt-1">{h.resumen}</p>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {/* ── TAB: Generador de Hipótesis (fase validacion) ── */}
            {activeTool === 'hipotesis' &&
              phaseConfig.tabs.some((t) => t.key === 'hipotesis') && (
                <div>
                  {/* Disclaimer permanente anti-fabricación */}
                  <div className="bg-amber-brand/15 border border-amber-brand/40 rounded-lg p-4 mb-5 flex gap-3">
                    <span className="text-amber-brand text-xl flex-shrink-0">⚠️</span>
                    <div>
                      <p className="text-amber-brand font-semibold text-sm mb-1">
                        Todas las hipótesis requieren verificación antes de cualquier publicación
                      </p>
                      <p className="text-amber-brand/80 text-xs leading-relaxed">
                        Los hechos mencionados son sugerencias a investigar, no datos
                        confirmados. La IA puede equivocarse o fabricar detalles específicos.
                        La pesquisa en terreno es obligatoria antes de cualquier afirmación
                        pública.
                      </p>
                    </div>
                  </div>

                  <p className="text-davy-gray text-sm mb-4">
                    Genera 3 a 5 hipótesis de investigación periodística sobre tu tema. Cada
                    hipótesis incluye verificaciones críticas y evidencia requerida para guiar la
                    pesquisa.
                  </p>

                  <div className="space-y-3">
                    <input
                      type="text"
                      value={hipTema}
                      onChange={(e) => setHipTema(e.target.value)}
                      placeholder="Tema o pregunta a investigar…"
                      className="w-full bg-oxford-blue border border-davy-gray/30 rounded px-4 py-2
                                 text-seasalt placeholder:text-davy-gray/50 focus:outline-none
                                 focus:border-amber-brand/50 text-sm"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={hipAudiencia}
                        onChange={(e) => setHipAudiencia(e.target.value)}
                        placeholder="Audiencia objetivo (opcional)"
                        className="bg-oxford-blue border border-davy-gray/30 rounded px-4 py-2
                                   text-seasalt placeholder:text-davy-gray/50 focus:outline-none
                                   focus:border-amber-brand/50 text-sm"
                      />
                      <input
                        type="text"
                        value={hipDato}
                        onChange={(e) => setHipDato(e.target.value)}
                        placeholder="Dato clave de contexto (opcional)"
                        className="bg-oxford-blue border border-davy-gray/30 rounded px-4 py-2
                                   text-seasalt placeholder:text-davy-gray/50 focus:outline-none
                                   focus:border-amber-brand/50 text-sm"
                      />
                    </div>
                    <button
                      onClick={handleGenerateHipotesis}
                      disabled={!hipTema.trim() || generandoHip}
                      className="w-full py-2.5 bg-amber-brand text-oxford-blue rounded font-medium text-sm
                                 hover:bg-amber-brand/90 transition-colors
                                 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {generandoHip ? 'Generando hipótesis…' : '🔬 Generar Hipótesis'}
                    </button>
                  </div>
                  {hipError && <p className="text-red-400 text-sm mt-3">{hipError}</p>}
                </div>
              )}

            {/* ── TAB: Validador de Hipótesis y Pista (fase validacion) — Chunk 7B ── */}
            {activeTool === 'vhp' && phaseConfig.tabs.some((t) => t.key === 'vhp') && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-seasalt font-bold text-lg mb-1">
                    🧪 Validador de Hipótesis y Pista
                  </h2>
                  <p className="text-davy-gray text-sm">
                    Evalúa si un lead concreto que tienes a mano (una persona, un documento,
                    un dato, un testimonio) tiene capacidad real de sostener o refutar la
                    hipótesis elegida. El validador NO genera hipótesis nuevas: te dice si
                    avanzar con esa pista es viable, viable con reservas o no viable.
                  </p>
                </div>

                {!savedHipotesisElegida && (
                  <div className="bg-amber-brand/15 border border-amber-brand/40 rounded-lg p-4">
                    <p className="text-amber-brand text-sm mb-3">
                      Primero elige una hipótesis en el tab <strong>🔬 Generador de Hipótesis</strong>.
                      El VHP necesita una hipótesis elegida para evaluar el match con tu lead.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTool('hipotesis')}
                      className="bg-amber-brand hover:bg-amber-brand/90 text-oxford-blue text-sm font-semibold px-4 py-2 rounded transition-colors"
                    >
                      ➡️ Ir al Generador de Hipótesis
                    </button>
                  </div>
                )}

                {savedHipotesisElegida && (
                  <>
                    {/* Snapshot de la hipótesis elegida (read-only) */}
                    <div className="bg-oxford-blue border border-amber-brand/30 rounded-lg p-4">
                      <p className="text-xs uppercase tracking-wider text-amber-brand font-semibold mb-2">
                        ⭐ Hipótesis elegida (snapshot)
                      </p>
                      <h3 className="text-seasalt font-medium text-sm mb-2">
                        {savedHipotesisElegida.titulo}
                      </h3>
                      {savedHipotesisElegida.pregunta_clave && (
                        <p className="text-davy-gray text-xs mb-1">
                          <span className="text-blue-400/80">Pregunta clave:</span>{' '}
                          {savedHipotesisElegida.pregunta_clave}
                        </p>
                      )}
                      {savedHipotesisElegida.verificaciones_criticas &&
                        savedHipotesisElegida.verificaciones_criticas.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs text-blue-400 font-semibold mb-1">
                              🔍 Verificaciones críticas
                            </p>
                            <ul className="text-xs text-seasalt/80 space-y-0.5 list-disc list-inside">
                              {savedHipotesisElegida.verificaciones_criticas.map((v, i) => (
                                <li key={i}>{v}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                    </div>

                    {/* Formulario de lead */}
                    <div className="bg-space-cadet rounded-lg border border-davy-gray/30 p-5 space-y-4">
                      <h3 className="text-amber-brand font-semibold text-sm">
                        Lead concreto a evaluar
                      </h3>

                      <div>
                        <label className="block text-xs font-mono text-davy-gray uppercase tracking-wider mb-2">
                          Tipo de lead
                        </label>
                        <select
                          value={vhpTipoLead}
                          onChange={(e) => setVhpTipoLead(e.target.value as LeadTipo)}
                          className="w-full bg-oxford-blue border border-davy-gray/50 rounded px-3 py-2.5 text-seasalt text-sm focus:outline-none focus:border-amber-brand"
                        >
                          {(Object.keys(LEAD_TIPO_LABELS) as LeadTipo[]).map((k) => (
                            <option key={k} value={k}>
                              {LEAD_TIPO_LABELS[k]}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-mono text-davy-gray uppercase tracking-wider mb-2">
                          Descripción del lead <span className="text-red-400">*</span>
                        </label>
                        <textarea
                          value={vhpDescripcion}
                          onChange={(e) => setVhpDescripcion(e.target.value)}
                          rows={3}
                          maxLength={2000}
                          placeholder="¿Qué es concretamente este lead? Ej: 'Ex-funcionaria de Subsecretaría de Salud Pública 2018-2022, dispuesta a hablar off-the-record sobre la implementación del programa X'"
                          className="w-full bg-oxford-blue border border-davy-gray/50 rounded px-3 py-2.5 text-seasalt text-sm placeholder:text-davy-gray/50 focus:outline-none focus:border-amber-brand resize-y"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-mono text-davy-gray uppercase tracking-wider mb-2">
                          Nivel de acceso declarado
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {(Object.keys(LEAD_ACCESO_LABELS) as LeadAcceso[]).map((k) => (
                            <button
                              key={k}
                              type="button"
                              onClick={() => setVhpAcceso(k)}
                              className={`py-2 px-3 rounded text-xs font-medium border transition-colors ${
                                vhpAcceso === k
                                  ? LEAD_ACCESO_COLORS[k]
                                  : 'bg-oxford-blue border-davy-gray/30 text-davy-gray hover:text-seasalt'
                              }`}
                            >
                              {LEAD_ACCESO_LABELS[k]}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-davy-gray/70 mt-2 leading-relaxed">
                          <strong className="text-davy-gray">Confirmado</strong>: ya hablaste/ya
                          tienes el documento. <strong className="text-davy-gray">Probable</strong>:
                          contacto realista pendiente.{' '}
                          <strong className="text-davy-gray">Especulativo</strong>: idea sin
                          garantía de acceso.
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-mono text-davy-gray uppercase tracking-wider mb-2">
                          Notas <span className="text-davy-gray/50">(opcional)</span>
                        </label>
                        <textarea
                          value={vhpNotas}
                          onChange={(e) => setVhpNotas(e.target.value)}
                          rows={2}
                          maxLength={1000}
                          placeholder="Contexto adicional, riesgos conocidos, plazo..."
                          className="w-full bg-oxford-blue border border-davy-gray/50 rounded px-3 py-2.5 text-seasalt text-sm placeholder:text-davy-gray/50 focus:outline-none focus:border-amber-brand resize-y"
                        />
                      </div>

                      <button
                        onClick={handleValidarHipotesisPista}
                        disabled={validandoVhp || !vhpDescripcion.trim()}
                        className={`w-full py-3 rounded font-bold text-sm transition-all ${
                          validandoVhp || !vhpDescripcion.trim()
                            ? 'bg-davy-gray/30 text-davy-gray cursor-not-allowed'
                            : 'bg-amber-brand text-oxford-blue hover:bg-amber-brand/90 active:scale-[0.99]'
                        }`}
                      >
                        {validandoVhp ? 'Evaluando viabilidad…' : '🧪 Validar lead contra hipótesis'}
                      </button>

                      {vhpError && (
                        <div className="bg-red-900/20 border border-red-700 rounded p-3">
                          <p className="text-red-400 text-sm">{vhpError}</p>
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-davy-gray/70 italic">
                      Las validaciones con veredicto <strong>viable</strong> o{' '}
                      <strong>viable con reservas</strong> se promueven automáticamente al
                      Organizador de Fuentes (ODF) cuando avancés a la fase de Pesquisa.
                    </p>
                  </>
                )}
              </div>
            )}

            {/* ── TAB: Organizador de Fuentes Forenses (fase pesquisa) — Chunk 7 ── */}
            {activeTool === 'odf' && phaseConfig.tabs.some((t) => t.key === 'odf') && (
              <section className="space-y-6">
                {/* Header */}
                <div>
                  <h2 className="text-seasalt font-bold text-lg mb-1">
                    🗂️ Organizador de Fuentes Forenses
                  </h2>
                  <p className="text-davy-gray text-sm">
                    Registrá personas, documentos, datos y testimonios que van alimentando la
                    pesquisa. Cada fuente tiene estado y nivel de confianza para que podás ver el
                    progreso real de la investigación.
                  </p>
                </div>

                {/* Formulario */}
                <div className="bg-space-cadet rounded-lg border border-davy-gray/30 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-amber-brand font-semibold text-sm">
                      {odfEditandoId ? 'Editar fuente' : 'Agregar nueva fuente'}
                    </h3>
                    {odfEditandoId && (
                      <button
                        onClick={resetOdfForm}
                        className="text-xs text-davy-gray hover:text-seasalt"
                      >
                        Cancelar edición
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-davy-gray uppercase tracking-wider mb-2">
                      Tipo de fuente
                    </label>
                    <select
                      value={odfTipo}
                      onChange={(e) => setOdfTipo(e.target.value as Fuente['tipo'])}
                      className="w-full bg-oxford-blue border border-davy-gray/50 rounded px-3 py-2.5 text-seasalt text-sm focus:outline-none focus:border-amber-brand"
                    >
                      {Object.entries(FUENTE_TIPO_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-davy-gray uppercase tracking-wider mb-2">
                      Nombre o título <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={odfNombreTitulo}
                      onChange={(e) => setOdfNombreTitulo(e.target.value)}
                      placeholder={
                        odfTipo === 'persona'
                          ? 'Ej: María Pérez'
                          : odfTipo === 'documento'
                          ? 'Ej: Decreto 1234/2025'
                          : odfTipo === 'dato'
                          ? 'Ej: Estadística de natalidad INE 2024'
                          : 'Ej: Testimonio de ex-funcionario'
                      }
                      className="w-full bg-oxford-blue border border-davy-gray/50 rounded px-3 py-2.5 text-seasalt text-sm placeholder:text-davy-gray/50 focus:outline-none focus:border-amber-brand"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-davy-gray uppercase tracking-wider mb-2">
                      Rol / origen / procedencia
                    </label>
                    <input
                      type="text"
                      value={odfRolOrigen}
                      onChange={(e) => setOdfRolOrigen(e.target.value)}
                      placeholder={
                        odfTipo === 'persona'
                          ? 'Ej: Directora de Epidemiología, Minsal Chile'
                          : odfTipo === 'documento'
                          ? 'Ej: Publicado en Diario Oficial, 12-mar-2025'
                          : odfTipo === 'dato'
                          ? 'Ej: INE, serie histórica 2010-2024'
                          : 'Ej: Reunión off-the-record, abril 2026'
                      }
                      className="w-full bg-oxford-blue border border-davy-gray/50 rounded px-3 py-2.5 text-seasalt text-sm placeholder:text-davy-gray/50 focus:outline-none focus:border-amber-brand"
                    />
                  </div>

                  {/* Chunk 9C (C1): URL libre opcional */}
                  <div>
                    <label className="block text-xs font-mono text-davy-gray uppercase tracking-wider mb-2">
                      URL del documento o referencia <span className="text-davy-gray/50">(opcional)</span>
                    </label>
                    <input
                      type="text"
                      value={odfUrl}
                      onChange={(e) => setOdfUrl(e.target.value)}
                      placeholder="https://... o ruta interna, DOI, citacion de archivo"
                      className="w-full bg-oxford-blue border border-davy-gray/50 rounded px-3 py-2.5 text-seasalt text-sm placeholder:text-davy-gray/50 focus:outline-none focus:border-amber-brand"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-mono text-davy-gray uppercase tracking-wider mb-2">
                        Estado
                      </label>
                      <select
                        value={odfEstado}
                        onChange={(e) => setOdfEstado(e.target.value as Fuente['estado'])}
                        className="w-full bg-oxford-blue border border-davy-gray/50 rounded px-3 py-2.5 text-seasalt text-sm focus:outline-none focus:border-amber-brand"
                      >
                        {Object.entries(FUENTE_ESTADO_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-mono text-davy-gray uppercase tracking-wider mb-2">
                        Confianza
                      </label>
                      <select
                        value={odfConfianza}
                        onChange={(e) =>
                          setOdfConfianza(e.target.value as Fuente['confianza'])
                        }
                        className="w-full bg-oxford-blue border border-davy-gray/50 rounded px-3 py-2.5 text-seasalt text-sm focus:outline-none focus:border-amber-brand"
                      >
                        <option value="baja">Baja</option>
                        <option value="media">Media</option>
                        <option value="alta">Alta</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-davy-gray uppercase tracking-wider mb-2">
                      Notas <span className="text-davy-gray/50">(opcional)</span>
                    </label>
                    <textarea
                      value={odfNotas}
                      onChange={(e) => setOdfNotas(e.target.value)}
                      rows={3}
                      placeholder="Observaciones, contacto, próximos pasos..."
                      className="w-full bg-oxford-blue border border-davy-gray/50 rounded px-3 py-2.5 text-seasalt text-sm placeholder:text-davy-gray/50 focus:outline-none focus:border-amber-brand resize-y"
                    />
                  </div>

                  <button
                    onClick={handleGuardarFuente}
                    disabled={odfGuardando || !odfNombreTitulo.trim()}
                    className={`w-full py-3 rounded font-bold text-sm transition-all ${
                      odfGuardando || !odfNombreTitulo.trim()
                        ? 'bg-davy-gray/30 text-davy-gray cursor-not-allowed'
                        : 'bg-amber-brand text-oxford-blue hover:bg-amber-brand/90 active:scale-[0.99]'
                    }`}
                  >
                    {odfGuardando
                      ? 'Guardando...'
                      : odfEditandoId
                      ? 'Actualizar fuente'
                      : 'Agregar fuente al expediente'}
                  </button>

                  {odfError && (
                    <div className="bg-red-900/20 border border-red-700 rounded p-3">
                      <p className="text-red-400 text-sm">{odfError}</p>
                    </div>
                  )}
                </div>

                {/* Listado */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-seasalt font-semibold text-sm">Expediente de fuentes</h3>
                    <span className="text-davy-gray text-xs">
                      {(() => {
                        // Chunk 29 PASO 3: resumen de estado de las fuentes
                        if (currentFuentes.length === 0) return 'Sin fuentes cargadas';
                        const total = currentFuentes.length;
                        const verificadas = currentFuentes.filter((f) => f.estado === 'verificada').length;
                        const porContactar = currentFuentes.filter((f) => f.estado === 'por_contactar').length;
                        const conArchivo = currentFuentes.filter((f) => !!f.archivo_url).length;
                        const parts: string[] = [`${total} fuente${total !== 1 ? 's' : ''}`];
                        if (verificadas > 0) parts.push(`${verificadas} verificada${verificadas !== 1 ? 's' : ''}`);
                        if (porContactar > 0) parts.push(`${porContactar} por contactar`);
                        if (conArchivo > 0) parts.push(`${conArchivo} con archivo`);
                        return parts.join(' · ');
                      })()}
                    </span>
                  </div>

                  {currentFuentes.length === 0 ? (
                    <div className="bg-oxford-blue/50 border border-davy-gray/20 rounded-lg p-8 text-center">
                      <p className="text-davy-gray text-sm">
                        Todavía no hay fuentes en el expediente. Agregá la primera desde el
                        formulario de arriba.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {currentFuentes.map((f) => (
                        <div
                          key={f.id}
                          className={`bg-space-cadet rounded-lg border p-4 transition-colors ${
                            f.principal
                              ? 'border-amber-brand/60 hover:border-amber-brand'
                              : 'border-davy-gray/30 hover:border-amber-brand/30'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="text-xs text-davy-gray">
                                  {FUENTE_TIPO_LABELS[f.tipo] ?? f.tipo}
                                </span>
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded border ${
                                    FUENTE_ESTADO_COLORS[f.estado] ?? ''
                                  }`}
                                >
                                  {FUENTE_ESTADO_LABELS[f.estado] ?? f.estado}
                                </span>
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded border ${
                                    FUENTE_CONFIANZA_COLORS[f.confianza] ?? ''
                                  }`}
                                >
                                  Confianza: {f.confianza}
                                </span>
                                {/* Chunk 29 PASO 1: indicador de archivo adjunto */}
                                {f.archivo_url ? (
                                  <span className="text-xs text-green-400">📎 Con archivo</span>
                                ) : (
                                  <span className="text-xs text-davy-gray/50">Sin archivo</span>
                                )}
                                {/* Chunk 29 PASO 2: badge de fuente principal */}
                                {f.principal && (
                                  <span className="text-[10px] px-2 py-0.5 rounded border border-amber-brand/60 text-amber-brand bg-amber-brand/10">
                                    ★ Principal
                                  </span>
                                )}
                              </div>
                              <h4 className="text-seasalt font-semibold text-sm break-words">
                                {f.nombre_titulo}
                              </h4>
                              {f.rol_origen && (
                                <p className="text-davy-gray text-xs mt-0.5">{f.rol_origen}</p>
                              )}
                              {f.url && (
                                <a
                                  href={f.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-amber-brand text-xs hover:underline break-all inline-block mt-1"
                                >
                                  🔗 {f.url}
                                </a>
                              )}
                            </div>
                            <div className="flex gap-1 shrink-0">
                              {/* Chunk 29 PASO 2: toggle de fuente principal */}
                              <button
                                onClick={() => handleMarcarPrincipal(f.id)}
                                disabled={odfGuardando}
                                className={`text-xs px-2 py-1 transition-colors ${
                                  f.principal
                                    ? 'text-amber-brand hover:text-amber-brand/70'
                                    : 'text-davy-gray hover:text-amber-brand'
                                }`}
                                title={
                                  f.principal
                                    ? 'Fuente principal del expediente (click para desmarcar)'
                                    : 'Marcar como fuente principal'
                                }
                              >
                                {f.principal ? '★' : '☆'}
                              </button>
                              <button
                                onClick={() => handleEditarFuente(f)}
                                className="text-xs text-davy-gray hover:text-amber-brand px-2 py-1"
                                title="Editar"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => handleEliminarFuente(f.id)}
                                className="text-xs text-davy-gray hover:text-red-400 px-2 py-1"
                                title="Eliminar"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                          {f.notas && (
                            <p className="text-davy-gray/80 text-xs mt-2 italic">{f.notas}</p>
                          )}
                          {/* Chunk 15B + 16B: archivo adjunto con soporte V2 */}
                          <div className="mt-2">
                            <input
                              type="file"
                              id={`file-input-${f.id}`}
                              accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.doc,.docx"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleUploadArchivo(f.id, file);
                                e.target.value = '';
                              }}
                            />
                            {f.archivo_url ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <a
                                    href={f.archivo_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-amber-brand text-xs hover:underline break-all"
                                  >
                                    📄 {f.archivo_nombre || 'Archivo adjunto'}
                                  </a>
                                  {f.archivo_replaced_at && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-brand/10 border border-amber-brand/30 text-amber-brand">
                                      V2 activa - V1 archivada
                                    </span>
                                  )}
                                  <button
                                    onClick={() => handleDeleteArchivo(f.id, f.archivo_url!)}
                                    className="text-davy-gray hover:text-red-400 text-xs px-1"
                                    title="Eliminar archivo"
                                  >
                                    ✕
                                  </button>
                                </div>
                                {odfUploadingId === f.id ? (
                                  <span className="text-davy-gray text-xs animate-pulse">Subiendo...</span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => document.getElementById(`file-input-${f.id}`)?.click()}
                                    className="text-xs text-davy-gray hover:text-amber-brand transition-colors"
                                  >
                                    📎 Reemplazar archivo (V2)
                                  </button>
                                )}
                              </div>
                            ) : (
                              <>
                                {odfUploadingId === f.id ? (
                                  <span className="text-davy-gray text-xs animate-pulse">Subiendo...</span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => document.getElementById(`file-input-${f.id}`)?.click()}
                                    className="text-xs text-davy-gray hover:text-amber-brand transition-colors"
                                  >
                                    📎 Adjuntar archivo
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                          <p className="text-davy-gray/50 text-[10px] mt-2">
                            Registrada: {new Date(f.fecha_registro).toLocaleString('es-CL')}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  {odfUploadError && (
                    <div className="bg-red-500/10 border border-red-500/40 rounded p-3 mt-3">
                      <p className="text-red-400 text-sm">{odfUploadError}</p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ── TAB: Documento de Investigacion IP (fase pesquisa) — Chunk 18B ── */}
            {activeTool === 'borrador_ip' && phaseConfig.tabs.some((t) => t.key === 'borrador_ip') && (
              <div className="space-y-6">
                {/* Panel de contexto del expediente */}
                {(() => {
                  const dataObj = (project.data ?? {}) as Record<string, unknown>;
                  const hipElegida = dataObj.hipotesis_elegida as Record<string, unknown> | undefined;
                  const fuentes = (dataObj.fuentes as Array<Record<string, unknown>>) ?? [];
                  const fuentesConArchivo = fuentes.filter((f) => !!f.archivo_url);
                  const borradorIPRaw = dataObj.borrador_ip as Record<string, unknown> | undefined;
                  const borradorIPParsed = borradorIPRaw ? parseBorradorFromRaw(borradorIPRaw) : null;

                  return (
                    <>
                      {/* Contexto */}
                      <div className="bg-oxford-blue/50 rounded-lg border border-davy-gray/20 p-4 space-y-2">
                        <h4 className="text-amber-brand text-xs font-mono uppercase tracking-wider">
                          Contexto del expediente
                        </h4>
                        <div className="grid grid-cols-3 gap-3 text-sm">
                          <div>
                            <span className="text-davy-gray">Hipotesis elegida:</span>{' '}
                            <span className={hipElegida ? 'text-green-400' : 'text-red-400'}>
                              {hipElegida ? (hipElegida.titulo as string) : 'No elegida'}
                            </span>
                          </div>
                          <div>
                            <span className="text-davy-gray">Fuentes ODF:</span>{' '}
                            <span className="text-seasalt">{fuentes.length}</span>
                          </div>
                          <div>
                            <span className="text-davy-gray">Archivos adjuntos:</span>{' '}
                            <span className={fuentesConArchivo.length > 0 ? 'text-green-400' : 'text-davy-gray'}>
                              {fuentesConArchivo.length}
                            </span>
                          </div>
                        </div>
                        {fuentesConArchivo.length > 0 && (
                          <p className="text-green-400/70 text-xs">
                            El generador extraera el contenido de los archivos adjuntos automaticamente.
                          </p>
                        )}
                      </div>

                      {/* Hard block: sin hipotesis */}
                      {!hipElegida && (
                        <div className="bg-red-500/10 border border-red-500/40 rounded p-4">
                          <p className="text-red-400 text-sm font-semibold mb-1">
                            Falta elegir una hipotesis
                          </p>
                          <p className="text-davy-gray text-sm">
                            El Generador de Documento de Investigacion necesita una hipotesis elegida como ancla.
                            Volve al tab Generador de Hipotesis en la fase Validacion.
                          </p>
                        </div>
                      )}

                      {/* Formulario de generacion */}
                      {hipElegida && (
                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs font-mono text-davy-gray uppercase tracking-wider mb-2">
                              Notas adicionales para el generador (opcional)
                            </label>
                            <textarea
                              value={borradorIPNotas}
                              onChange={(e) => setBorradorIPNotas(e.target.value)}
                              placeholder="Contexto adicional, enfoque preferido, restricciones..."
                              rows={3}
                              className="w-full bg-oxford-blue border border-davy-gray/30 rounded px-4 py-2
                                         text-seasalt placeholder:text-davy-gray/50 focus:outline-none
                                         focus:border-amber-brand/50 text-sm resize-none"
                            />
                          </div>
                          <button
                            onClick={handleGenerateBorradorIP}
                            disabled={generandoBorradorIP}
                            className={`w-full py-3 rounded font-bold text-sm transition-all ${
                              generandoBorradorIP
                                ? 'bg-davy-gray/30 text-davy-gray cursor-not-allowed'
                                : 'bg-amber-brand text-oxford-blue hover:bg-amber-brand/90 active:scale-[0.99]'
                            }`}
                          >
                            {generandoBorradorIP
                              ? 'Extrayendo archivos y generando documento...'
                              : borradorIPParsed
                              ? 'Regenerar documento de investigacion'
                              : 'Generar documento de investigacion'}
                          </button>
                        </div>
                      )}

                      {/* Error */}
                      {genBorradorIPError && (
                        <div className="bg-red-500/10 border border-red-500/40 rounded p-3">
                          <p className="text-red-400 text-sm">{genBorradorIPError}</p>
                        </div>
                      )}

                      {/* Truncation warnings */}
                      {borradorIPTruncWarnings.length > 0 && (
                        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                          <span>⚠️</span>
                          <div>
                            <p className="font-medium mb-1">Documentos procesados parcialmente:</p>
                            <ul className="space-y-0.5">
                              {borradorIPTruncWarnings.map((w, i) => (
                                <li key={i}>{w}</li>
                              ))}
                            </ul>
                            <p className="text-xs mt-1 text-amber-700">
                              El borrador IP se genero con la porcion disponible.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Resultado: documento generado */}
                      {borradorIPParsed && (
                        <div className="space-y-4">
                          {/* Badge de modo */}
                          <div className="flex items-center gap-3">
                            <span
                              className={`text-xs px-2 py-0.5 rounded border ${
                                borradorIPRaw?.modo === 'evidencia' || (borradorIPParsed.modo === 'evidencia')
                                  ? 'bg-green-500/15 border-green-500/40 text-green-400'
                                  : 'bg-amber-brand/15 border-amber-brand/40 text-amber-brand'
                              }`}
                            >
                              {borradorIPRaw?.modo === 'evidencia' || (borradorIPParsed.modo === 'evidencia')
                                ? 'Modo evidencia'
                                : 'Modo diagnostico'}
                            </span>
                            <span className="text-davy-gray/60 text-xs">
                              {borradorIPParsed.metadata.extension_palabras} palabras
                            </span>
                            {typeof borradorIPRaw?.generadoEn === 'string' && (
                              <span className="text-davy-gray/60 text-xs">
                                Generado: {new Date(borradorIPRaw.generadoEn as string).toLocaleString('es-CL')}
                              </span>
                            )}
                          </div>

                          {/* Titulo + bajada */}
                          <div className="bg-oxford-blue/50 rounded-lg border border-davy-gray/20 p-5">
                            <h3 className="text-seasalt text-xl font-bold mb-2">
                              {borradorIPParsed.contenido.titulo}
                            </h3>
                            {borradorIPParsed.contenido.bajada && (
                              <p className="text-davy-gray text-sm italic">
                                {borradorIPParsed.contenido.bajada}
                              </p>
                            )}
                          </div>

                          {/* Lead */}
                          {borradorIPParsed.contenido.lead && (
                            <div className="bg-amber-brand/5 border-l-2 border-amber-brand/40 px-4 py-3">
                              <p className="text-seasalt text-sm leading-relaxed">
                                {borradorIPParsed.contenido.lead}
                              </p>
                            </div>
                          )}

                          {/* Cuerpo */}
                          {borradorIPParsed.contenido.cuerpo.map((sec, idx) => (
                            <div key={idx} className="space-y-2">
                              {sec.subtitulo && (
                                <h4 className="text-amber-brand/80 font-semibold text-sm">
                                  {sec.subtitulo}
                                </h4>
                              )}
                              {sec.parrafos.map((p, pidx) => (
                                <p key={pidx} className="text-seasalt/90 text-sm leading-relaxed">
                                  {p}
                                </p>
                              ))}
                            </div>
                          ))}

                          {/* Cierre */}
                          {borradorIPParsed.contenido.cierre && (
                            <div className="border-t border-davy-gray/20 pt-4">
                              <p className="text-seasalt/80 text-sm leading-relaxed italic">
                                {borradorIPParsed.contenido.cierre}
                              </p>
                            </div>
                          )}

                          {/* Metadata */}
                          <div className="bg-oxford-blue/50 rounded-lg border border-davy-gray/20 p-4 space-y-3">
                            <h4 className="text-amber-brand text-xs font-mono uppercase tracking-wider">
                              Metadata del documento
                            </h4>

                            {borradorIPParsed.metadata.fuentes_citadas.length > 0 && (
                              <div>
                                <span className="text-davy-gray text-xs">Fuentes citadas:</span>
                                <ul className="mt-1 space-y-0.5">
                                  {borradorIPParsed.metadata.fuentes_citadas.map((f, i) => (
                                    <li key={i} className="text-seasalt text-xs">• {f}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {borradorIPParsed.metadata.advertencias_verificacion.length > 0 && (
                              <div>
                                <span className="text-amber-brand text-xs">Advertencias de verificacion:</span>
                                <ul className="mt-1 space-y-0.5">
                                  {borradorIPParsed.metadata.advertencias_verificacion.map((a, i) => (
                                    <li key={i} className="text-amber-brand/70 text-xs">• {a}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {borradorIPParsed.metadata.verificaciones_criticas_resueltas.length > 0 && (
                              <div>
                                <span className="text-green-400 text-xs">Verificaciones resueltas:</span>
                                <ul className="mt-1 space-y-0.5">
                                  {borradorIPParsed.metadata.verificaciones_criticas_resueltas.map((v, i) => (
                                    <li key={i} className="text-green-400/70 text-xs">• {v}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {borradorIPParsed.metadata.verificaciones_criticas_pendientes.length > 0 && (
                              <div>
                                <span className="text-red-400 text-xs">Verificaciones pendientes:</span>
                                <ul className="mt-1 space-y-0.5">
                                  {borradorIPParsed.metadata.verificaciones_criticas_pendientes.map((v, i) => (
                                    <li key={i} className="text-red-400/70 text-xs">• {v}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>

                          {/* Notas editoriales */}
                          {borradorIPParsed.notas_editoriales && (
                            <div className="bg-oxford-blue/30 rounded border border-davy-gray/10 p-3">
                              <span className="text-davy-gray text-xs font-mono uppercase">Notas editoriales:</span>
                              <p className="text-davy-gray text-xs mt-1">
                                {borradorIPParsed.notas_editoriales}
                              </p>
                            </div>
                          )}

                          {/* Nota informativa */}
                          <div className="bg-amber-brand/5 border border-amber-brand/20 rounded p-3">
                            <p className="text-amber-brand/80 text-xs">
                              Este documento es el insumo para el traspaso a MetricPress.
                              Cuando asignes marca y genero, el Generador de Borrador de la fase Produccion
                              tomara esta investigacion como base de evidencia.
                            </p>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {/* ── TAB: Validador IP (fase pesquisa) — Chunk 19C ── */}
            {activeTool === 'validador_ip' && phaseConfig.tabs.some((t) => t.key === 'validador_ip') && (
              <div>
                {(() => {
                  const dataObj19c = (project?.data ?? {}) as Record<string, unknown>;
                  const borradorIPRaw19c = dataObj19c.borrador_ip as Record<string, unknown> | undefined;

                  if (!borradorIPRaw19c) {
                    return (
                      <div className="bg-red-500/10 border border-red-500/40 rounded p-4">
                        <p className="text-red-400 text-sm font-medium mb-1">
                          Genera el borrador IP en esta fase antes de usar el Validador IP.
                        </p>
                        <p className="text-davy-gray text-xs">
                          El Validador IP evalua el documento de investigacion generado en el tab
                          Documento de Investigacion. Sin borrador IP no hay texto que evaluar.
                        </p>
                      </div>
                    );
                  }

                  const parsedIP19c = parseBorradorFromRaw(borradorIPRaw19c);
                  const tituloIP = parsedIP19c?.contenido?.titulo ?? 'Sin titulo';
                  const modoIP = parsedIP19c?.modo ?? null;
                  const textoEsperadoIP = parsedIP19c ? buildBorradorTextoPlano(parsedIP19c) : null;
                  const textoDifiereIP = textoEsperadoIP !== null && ipValidadorTexto.trim() !== textoEsperadoIP.trim();

                  return (
                    <>
                      {/* Contexto del borrador IP */}
                      <div className="bg-green-500/10 border border-green-500/30 rounded p-3 mb-4">
                        <p className="text-green-400 text-xs">
                          Borrador IP disponible: <span className="font-medium text-seasalt">{tituloIP}</span>
                          {modoIP && (
                            <span className="ml-2 bg-blue-500/20 text-blue-300 text-xs px-2 py-0.5 rounded">
                              Modo: {modoIP}
                            </span>
                          )}
                        </p>
                      </div>

                      <p className="text-davy-gray text-sm mb-4">
                        Evalua el rigor periodistico, estructura, calidad de fuentes y modo de
                        operacion del borrador IP antes de decidir el traspaso a MetricPress.
                      </p>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs text-davy-gray">Texto a validar</label>
                          <button
                            type="button"
                            onClick={() => {
                              if (textoEsperadoIP) setIpValidadorTexto(textoEsperadoIP);
                            }}
                            className="text-xs border border-davy-gray/30 text-davy-gray rounded px-2 py-0.5 hover:text-seasalt hover:border-davy-gray/60"
                          >
                            Restaurar borrador IP
                          </button>
                        </div>
                        <textarea
                          value={ipValidadorTexto}
                          onChange={(e) => setIpValidadorTexto(e.target.value)}
                          placeholder="El borrador IP se carga automaticamente aqui…"
                          rows={8}
                          maxLength={10000}
                          className="w-full bg-oxford-blue border border-davy-gray/30 rounded px-4 py-2
                                     text-seasalt placeholder:text-davy-gray/50 focus:outline-none
                                     focus:border-amber-brand/50 text-sm resize-y"
                        />
                        {textoDifiereIP && (
                          <div className="flex items-start gap-2 rounded-md border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800 mb-3">
                            <span>⚠️</span>
                            <span>
                              El texto a evaluar no coincide con el borrador IP activo del
                              proyecto. El validador va a evaluar lo que ves en el campo,
                              no el borrador guardado. Si queres evaluar el borrador actual,
                              usa el boton &quot;Restaurar borrador IP&quot;.
                            </span>
                          </div>
                        )}
                        <button
                          onClick={handleValidarBorradorIP}
                          disabled={!ipValidadorTexto.trim() || ipValidandoBorrador}
                          className="w-full py-2.5 bg-amber-brand text-oxford-blue rounded font-medium text-sm
                                     hover:bg-amber-brand/90 transition-colors
                                     disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {ipValidandoBorrador ? 'Validando borrador IP…' : '✅ Validar borrador IP'}
                        </button>
                      </div>

                      {ipValidadorError && <p className="text-red-400 text-sm mt-3">{ipValidadorError}</p>}

                      {/* Panel de resultado */}
                      {ipResultadoValidacion && (
                        <div className="mt-6 space-y-4">
                          {/* Score + badge */}
                          <div className="flex items-center gap-4">
                            <span
                              className={`text-3xl font-bold ${
                                ipResultadoValidacion.score >= 4
                                  ? 'text-green-400'
                                  : ipResultadoValidacion.score >= 3
                                    ? 'text-yellow-400'
                                    : 'text-red-400'
                              }`}
                            >
                              {ipResultadoValidacion.score.toFixed(1)}/5
                            </span>
                            <span
                              className={`text-xs px-3 py-1 rounded-full font-medium ${
                                ipResultadoValidacion.apto_para_traspaso
                                  ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                              }`}
                            >
                              {ipResultadoValidacion.apto_para_traspaso
                                ? 'Apto para traspaso'
                                : 'Revisar antes de traspasar'}
                            </span>
                          </div>

                          {/* Resumen ejecutivo */}
                          {ipResultadoValidacion.resumen_ejecutivo && (
                            <p className="text-seasalt/80 text-sm">
                              {ipResultadoValidacion.resumen_ejecutivo}
                            </p>
                          )}

                          {/* Dimensiones */}
                          {ipResultadoValidacion.dimensiones.length > 0 && (
                            <div className="space-y-3">
                              <h4 className="text-xs font-semibold text-davy-gray uppercase tracking-wide">
                                Dimensiones evaluadas
                              </h4>
                              {ipResultadoValidacion.dimensiones.map((dim, i) => (
                                <div
                                  key={i}
                                  className="bg-oxford-blue rounded border border-davy-gray/15 p-3"
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-seasalt text-sm font-medium">
                                      {dim.nombre}
                                    </span>
                                    <span
                                      className={`text-sm font-bold ${
                                        dim.score >= 4
                                          ? 'text-green-400'
                                          : dim.score >= 3
                                            ? 'text-yellow-400'
                                            : 'text-red-400'
                                      }`}
                                    >
                                      {dim.score.toFixed(1)}/5
                                    </span>
                                  </div>
                                  <p className="text-davy-gray text-xs">{dim.observacion}</p>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Recomendaciones */}
                          {ipResultadoValidacion.recomendaciones.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-davy-gray uppercase tracking-wide mb-2">
                                Recomendaciones
                              </h4>
                              <ul className="space-y-1">
                                {ipResultadoValidacion.recomendaciones.map((rec, i) => (
                                  <li key={i} className="text-seasalt/80 text-sm flex items-start gap-2">
                                    <span className="text-amber-brand mt-0.5">→</span>
                                    <span>{rec}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* Chunk 23B: Historial de validaciones IP */}
                {(() => {
                  const valIpArr = ((project?.data?.validaciones_ip ?? []) as ValidacionIPEntry[]);
                  if (valIpArr.length === 0) return null;
                  const sorted = [...valIpArr].sort((a, b) =>
                    new Date(b.generadoEn).getTime() - new Date(a.generadoEn).getTime()
                  );
                  return (
                    <div className="mt-6 border border-davy-gray/20 rounded">
                      <button
                        type="button"
                        onClick={() => setShowHistorialIP(!showHistorialIP)}
                        className="w-full flex items-center justify-between px-4 py-3 text-sm text-davy-gray hover:text-seasalt transition-colors"
                      >
                        <span>Historial ({valIpArr.length} corrida{valIpArr.length !== 1 ? 's' : ''})</span>
                        <span>{showHistorialIP ? '▲' : '▼'}</span>
                      </button>
                      {showHistorialIP && (
                        <div className="border-t border-davy-gray/20 divide-y divide-davy-gray/10">
                          {sorted.map((entry, idx) => (
                            <div key={idx} className="px-4 py-2.5 flex items-center gap-4 text-sm">
                              <span className="text-davy-gray text-xs min-w-[140px]">
                                {new Date(entry.generadoEn).toLocaleString('es-CL', {
                                  day: 'numeric', month: 'short', year: 'numeric',
                                  hour: '2-digit', minute: '2-digit',
                                })}
                              </span>
                              <span className={`font-bold ${entry.score >= 3.0 ? 'text-green-400' : 'text-red-400'}`}>
                                {entry.score.toFixed(1)}/5
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                entry.apto_para_traspaso
                                  ? 'bg-green-500/20 text-green-400'
                                  : 'bg-red-500/20 text-red-400'
                              }`}>
                                {entry.apto_para_traspaso ? 'Apto ✓' : 'No apto ✗'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── TAB: Radar Editorial (fase pesquisa) ── */}
            {activeTool === 'radar' && phaseConfig.tabs.some((t) => t.key === 'radar') && (
              <div>
                <p className="text-davy-gray text-sm mb-4">
                  Auditá cobertura existente sobre tu tema. Detectá sesgos, falta de rigor y
                  oportunidades editoriales en textos de la competencia.
                </p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={radarMedio}
                      onChange={(e) => setRadarMedio(e.target.value)}
                      placeholder="Medio (obligatorio) — ej: La Tercera"
                      className="bg-oxford-blue border border-davy-gray/30 rounded px-4 py-2
                                 text-seasalt placeholder:text-davy-gray/50 focus:outline-none
                                 focus:border-amber-brand/50 text-sm"
                    />
                    <input
                      type="text"
                      value={radarUrl}
                      onChange={(e) => setRadarUrl(e.target.value)}
                      placeholder="URL (opcional)"
                      className="bg-oxford-blue border border-davy-gray/30 rounded px-4 py-2
                                 text-seasalt placeholder:text-davy-gray/50 focus:outline-none
                                 focus:border-amber-brand/50 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="date"
                      value={radarFecha}
                      onChange={(e) => setRadarFecha(e.target.value)}
                      className="bg-oxford-blue border border-davy-gray/30 rounded px-4 py-2
                                 text-seasalt placeholder:text-davy-gray/50 focus:outline-none
                                 focus:border-amber-brand/50 text-sm"
                    />
                    <input
                      type="text"
                      value={radarNotas}
                      onChange={(e) => setRadarNotas(e.target.value)}
                      placeholder="Notas propias (opcional)"
                      className="bg-oxford-blue border border-davy-gray/30 rounded px-4 py-2
                                 text-seasalt placeholder:text-davy-gray/50 focus:outline-none
                                 focus:border-amber-brand/50 text-sm"
                    />
                  </div>
                  <textarea
                    value={radarTexto}
                    onChange={(e) => setRadarTexto(e.target.value)}
                    placeholder="Pegá el texto del medio a auditar…"
                    rows={6}
                    maxLength={10000}
                    className="w-full bg-oxford-blue border border-davy-gray/30 rounded px-4 py-2
                               text-seasalt placeholder:text-davy-gray/50 focus:outline-none
                               focus:border-amber-brand/50 text-sm resize-y"
                  />
                  <button
                    onClick={handleAuditarRadar}
                    disabled={!radarMedio.trim() || !radarTexto.trim() || auditandoRadar}
                    className="w-full py-2.5 bg-amber-brand text-oxford-blue rounded font-medium text-sm
                               hover:bg-amber-brand/90 transition-colors
                               disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {auditandoRadar ? 'Auditando…' : '📡 Auditar Cobertura'}
                  </button>
                </div>
                {radarError && <p className="text-red-400 text-sm mt-3">{radarError}</p>}
              </div>
            )}

            {/* ── TAB: Validador de Tono del Borrador (fase revision) ── */}
            {activeTool === 'validador' &&
              phaseConfig.tabs.some((t) => t.key === 'validador') && (
                <div>
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded p-4">
                    <p className="text-blue-300 text-sm mb-2">
                      El borrador fue validado en fase Pesquisa (Validador IP).
                      Revisa el score antes de avanzar a Aprobado.
                    </p>
                    {(() => {
                      const valIpArrRev = ((project?.data?.validaciones_ip ?? []) as ValidacionIPEntry[]);
                      if (valIpArrRev.length === 0) {
                        return <p className="text-davy-gray text-xs">Sin validaciones IP registradas.</p>;
                      }
                      const ultima = valIpArrRev[valIpArrRev.length - 1];
                      return (
                        <p className="text-seasalt text-sm">
                          Ultimo score IP:{' '}
                          <span className={`font-bold ${ultima.score >= 3.0 ? 'text-green-400' : 'text-red-400'}`}>
                            {ultima.score.toFixed(1)}/5
                          </span>
                          {' — '}
                          <span className={ultima.apto_para_traspaso ? 'text-green-400' : 'text-red-400'}>
                            {ultima.apto_para_traspaso ? 'Apto para traspaso' : 'No apto'}
                          </span>
                        </p>
                      );
                    })()}
                  </div>
                </div>
              )}

            {/* ── Generador de Borrador (Chunk 8B-2: UI completa) ── */}
            {activeTool === 'borrador' && (
              <div className="space-y-6">
                {/* Header del tab */}
                <div className="border-b border-davy-gray/30 pb-4">
                  <h2 className="text-seasalt text-xl font-semibold flex items-center gap-2">
                    <span>✍️</span>
                    <span>Generador de Borrador</span>
                  </h2>
                  <p className="text-davy-gray text-sm mt-1">
                    Escribe el borrador completo del articulo final usando el expediente verificado:
                    hipotesis elegida + fuentes del ODF + iteraciones previas del Validador.
                  </p>
                </div>

                {/* ── Panel de contexto del expediente (siempre visible) ── */}
                {(() => {
                  const dataObj = (project?.data ?? {}) as Record<string, unknown>;
                  const hipElegida = dataObj.hipotesis_elegida as Record<string, unknown> | undefined;
                  const fuentesArr = (dataObj.fuentes as unknown[] | undefined) ?? [];
                  const vhpsArr =
                    (dataObj.validacion_hipotesis_pista as unknown[] | undefined) ?? [];
                  const valBorradorArr =
                    (dataObj.validaciones_borrador as unknown[] | undefined) ?? [];
                  const borradorPrevio = dataObj.borrador as Record<string, unknown> | undefined;

                  // Conteo de fuentes por estado
                  const fuentesPorEstado = {
                    verificada: 0,
                    contactada: 0,
                    por_contactar: 0,
                    descartada: 0,
                  };
                  fuentesArr.forEach((f) => {
                    const fr = f as Record<string, unknown>;
                    const est = String(fr.estado ?? 'por_contactar');
                    if (est in fuentesPorEstado) {
                      fuentesPorEstado[est as keyof typeof fuentesPorEstado] += 1;
                    }
                  });

                  const tieneHipotesis = !!hipElegida && typeof hipElegida === 'object';
                  const fuentesTotal = fuentesArr.length;
                  const tieneTraspaso = !!project?.tenantSlug && !!project?.templateSlug;

                  return (
                    <div className="bg-space-cadet/40 border border-davy-gray/30 rounded-lg p-5 space-y-4">
                      <h3 className="text-seasalt text-sm font-semibold uppercase tracking-wide">
                        Contexto del expediente
                      </h3>

                      {/* Hipotesis elegida */}
                      {tieneHipotesis ? (
                        <div className="bg-oxford-blue/60 border border-davy-gray/30 rounded p-4">
                          <p className="text-davy-gray text-xs uppercase tracking-wide mb-2">
                            Hipotesis elegida
                          </p>
                          <p className="text-seasalt text-sm font-medium mb-2">
                            {String(hipElegida?.titulo ?? '[sin titulo]')}
                          </p>
                          {hipElegida?.gancho ? (
                            <p className="text-davy-gray text-xs italic mb-2">
                              {String(hipElegida.gancho)}
                            </p>
                          ) : null}
                          {hipElegida?.pregunta_clave ? (
                            <p className="text-davy-gray text-xs">
                              <span className="text-amber-brand">Pregunta clave:</span>{' '}
                              {String(hipElegida.pregunta_clave)}
                            </p>
                          ) : null}
                          {Array.isArray(hipElegida?.verificaciones_criticas) ? (
                            <p className="text-davy-gray text-xs mt-2">
                              <span className="text-amber-brand">Verificaciones criticas:</span>{' '}
                              {(hipElegida.verificaciones_criticas as unknown[]).length}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <div className="bg-red-500/10 border border-red-500/40 rounded p-4">
                          <p className="text-red-400 text-sm font-medium mb-1">
                            ⚠️ Falta elegir una hipotesis
                          </p>
                          <p className="text-davy-gray text-xs">
                            El Generador de Borrador necesita una hipotesis elegida como ancla
                            estructural. Sin hipotesis no se puede generar el borrador. Volve a
                            la fase Validacion (retroceder el pipeline), genera hipotesis y elegi
                            una antes de continuar.
                          </p>
                        </div>
                      )}

                      {/* Tenant + template (sanity) */}
                      {!tieneTraspaso && (
                        <div className="bg-red-500/10 border border-red-500/40 rounded p-3">
                          <p className="text-red-400 text-xs">
                            ⚠️ Este project no tiene tenant ni template asignados. El traspaso a
                            MetricPress debio ocurrir antes de entrar a Produccion. Reporta este
                            estado: es un bug del pipeline.
                          </p>
                        </div>
                      )}

                      {/* Fuentes */}
                      {fuentesTotal > 0 ? (
                        <div className="bg-oxford-blue/60 border border-davy-gray/30 rounded p-4">
                          <p className="text-davy-gray text-xs uppercase tracking-wide mb-2">
                            Fuentes del ODF ({fuentesTotal})
                          </p>
                          <div className="flex flex-wrap gap-2 text-xs">
                            {fuentesPorEstado.verificada > 0 && (
                              <span className="bg-green-500/20 text-green-400 border border-green-500/40 px-2 py-1 rounded">
                                {fuentesPorEstado.verificada} verificadas
                              </span>
                            )}
                            {fuentesPorEstado.contactada > 0 && (
                              <span className="bg-blue-500/20 text-blue-400 border border-blue-500/40 px-2 py-1 rounded">
                                {fuentesPorEstado.contactada} contactadas
                              </span>
                            )}
                            {fuentesPorEstado.por_contactar > 0 && (
                              <span className="bg-davy-gray/30 text-davy-gray border border-davy-gray/40 px-2 py-1 rounded">
                                {fuentesPorEstado.por_contactar} por contactar
                              </span>
                            )}
                            {fuentesPorEstado.descartada > 0 && (
                              <span className="bg-red-500/20 text-red-400 border border-red-500/40 px-2 py-1 rounded">
                                {fuentesPorEstado.descartada} descartadas (no se citaran)
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="bg-amber-brand/10 border border-amber-brand/40 rounded p-3">
                          <p className="text-amber-brand text-xs">
                            ⚠️ El ODF esta vacio. Se puede generar igual, pero el borrador va a
                            quedar muy escueto y con muchas advertencias [VERIFICAR]. Te lo va a
                            confirmar antes de ejecutar.
                          </p>
                        </div>
                      )}

                      {/* VHP previas */}
                      {vhpsArr.length > 0 && (
                        <div className="text-davy-gray text-xs">
                          <span className="text-amber-brand">{vhpsArr.length}</span> validacion(es)
                          VHP previa(s) van a ir como contexto.
                        </div>
                      )}

                      {/* Iteraciones previas del Validador de Borrador */}
                      {valBorradorArr.length > 0 && (
                        <div className="bg-amber-brand/10 border border-amber-brand/40 rounded p-3">
                          <p className="text-amber-brand text-xs font-medium mb-1">
                            🔁 {valBorradorArr.length} iteracion(es) previa(s) del Validador de
                            Borrador
                          </p>
                          <p className="text-davy-gray text-xs">
                            Esta nueva version va a recibir las criticas anteriores y debe
                            corregirlas explicitamente.
                          </p>
                        </div>
                      )}

                      {/* Borrador previo (si existe) */}
                      {borradorPrevio && (
                        <div className="text-davy-gray text-xs italic">
                          Ya existe un borrador generado. Si regenerás, va a sobreescribir el
                          anterior.
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ── Form de generacion ── */}
                <div className="bg-space-cadet/40 border border-davy-gray/30 rounded-lg p-5 space-y-4">
                  <h3 className="text-seasalt text-sm font-semibold uppercase tracking-wide">
                    Notas adicionales del operador (opcional)
                  </h3>
                  <textarea
                    value={borradorOperadorNotas}
                    onChange={(e) => setBorradorOperadorNotas(e.target.value)}
                    placeholder="Contexto editorial, restricciones, enfoque preferido, indicaciones para el modelo..."
                    rows={3}
                    className="w-full bg-oxford-blue border border-davy-gray/50 rounded px-3 py-2.5 text-seasalt text-sm placeholder:text-davy-gray/50 focus:outline-none focus:border-amber-brand resize-y"
                  />

                  {(() => {
                    const dataObj = (project?.data ?? {}) as Record<string, unknown>;
                    const hipElegida = dataObj.hipotesis_elegida as
                      | Record<string, unknown>
                      | undefined;
                    const tieneHipotesis = !!hipElegida && typeof hipElegida === 'object';
                    const tieneTraspaso = !!project?.tenantSlug && !!project?.templateSlug;
                    const borradorPrevio = dataObj.borrador as Record<string, unknown> | undefined;
                    const borradorDesactualizado = borradorPrevio?.desactualizado === true;
                    const labelBoton = borradorDesactualizado
                      ? 'Regenerar con evidencia actualizada'
                      : borradorPrevio
                        ? 'Regenerar Borrador'
                        : 'Generar Borrador';
                    const disabled = !tieneHipotesis || !tieneTraspaso || generandoBorrador;

                    return (
                      <button
                        type="button"
                        onClick={async () => {
                          if (borradorPrevio) {
                            const ok = confirm(
                              'Esto va a sobreescribir el borrador anterior. ¿Continuar?'
                            );
                            if (!ok) return;
                          }
                          await handleGenerateBorrador();
                        }}
                        disabled={disabled}
                        className="w-full bg-amber-brand hover:bg-amber-brand/90 disabled:bg-davy-gray/30 disabled:text-davy-gray disabled:cursor-not-allowed text-oxford-blue font-semibold py-3 rounded transition-colors"
                      >
                        {generandoBorrador ? 'Generando borrador...' : labelBoton}
                      </button>
                    );
                  })()}

                  {genBorradorError && (
                    <div className="bg-red-500/10 border border-red-500/40 rounded p-3">
                      <p className="text-red-400 text-sm">{genBorradorError}</p>
                    </div>
                  )}
                </div>

                {/* ── Panel de resultado (solo si data.borrador existe) ── */}
                {(() => {
                  const dataObj = (project?.data ?? {}) as Record<string, unknown>;
                  const borradorRaw = dataObj.borrador as Record<string, unknown> | undefined;
                  if (!borradorRaw) return null;

                  const parsed = parseBorradorFromRaw(borradorRaw);
                  if (!parsed) {
                    return (
                      <div className="bg-red-500/10 border border-red-500/40 rounded p-4">
                        <p className="text-red-400 text-sm">
                          El borrador guardado tiene una estructura invalida. Regenera para
                          repararlo.
                        </p>
                      </div>
                    );
                  }

                  const { contenido: borrador, metadata, notas_editoriales, generadoEn } = parsed;

                  // Chunk 12C: banner de borrador desactualizado
                  const bannerDesactualizado = parsed.desactualizado === true;
                  const fuentesAlGenerar = parsed.fuentes_count_al_generar ?? 0;
                  const fuentesAhora = Array.isArray(
                    (project?.data as Record<string, unknown>)?.fuentes
                  )
                    ? ((project?.data as Record<string, unknown>).fuentes as unknown[]).length
                    : 0;

                  // Texto plano para copiar al portapapeles (modo a: solo cuerpo, sin metadata)
                  const textoPlano = buildBorradorTextoPlano(parsed);

                  const handleCopiar = async () => {
                    // Path moderno: navigator.clipboard.writeText (requiere contexto seguro HTTPS)
                    try {
                      await navigator.clipboard.writeText(textoPlano);
                      alert('Borrador copiado al portapapeles.');
                      return;
                    } catch {
                      // Fallback: focusear el textarea oculto y seleccionar su contenido
                      // para que el operador pueda hacer Ctrl+C manualmente.
                      const ta = document.getElementById(
                        'borrador-fallback-textarea'
                      ) as HTMLTextAreaElement | null;
                      if (ta) {
                        ta.focus();
                        ta.select();
                        alert(
                          'No se pudo copiar automaticamente al portapapeles. El borrador esta seleccionado en un campo oculto: presiona Ctrl+C (o Cmd+C en Mac) para copiarlo.'
                        );
                      } else {
                        alert(
                          'No se pudo copiar al portapapeles y el fallback no esta disponible. Copia manualmente desde el panel.'
                        );
                      }
                    }
                  };

                  return (
                    <div className="bg-space-cadet/40 border border-davy-gray/30 rounded-lg p-5 space-y-5">
                      {/* Chunk 12C: Banner de borrador desactualizado */}
                      {bannerDesactualizado && (
                        <div className="p-4 bg-yellow-500/10 border border-yellow-500/40 rounded">
                          <div className="flex items-start gap-3">
                            <div className="text-yellow-400 text-xl leading-none mt-0.5">!</div>
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-yellow-200 mb-1">
                                Borrador desactualizado
                              </p>
                              <p className="text-xs text-yellow-100/80">
                                Este borrador no refleja las fuentes mas recientes del ODF.
                                Generado con {fuentesAlGenerar} fuente(s),
                                ahora hay {fuentesAhora}.
                                Regeneralo para incorporar la evidencia nueva.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <h3 className="text-seasalt text-sm font-semibold uppercase tracking-wide">
                          Borrador generado
                        </h3>
                        <span className="text-davy-gray text-xs">
                          {new Date(generadoEn).toLocaleString('es-CL')}
                        </span>
                      </div>

                      {/* Titulo + bajada */}
                      <div>
                        <h4 className="text-seasalt text-2xl font-bold leading-tight mb-2">
                          {borrador.titulo}
                        </h4>
                        {borrador.bajada && (
                          <p className="text-davy-gray text-base italic">{borrador.bajada}</p>
                        )}
                      </div>

                      {/* Lead */}
                      {borrador.lead && (
                        <div className="bg-oxford-blue/60 border-l-4 border-amber-brand pl-4 py-3">
                          <p className="text-seasalt text-sm leading-relaxed">{borrador.lead}</p>
                        </div>
                      )}

                      {/* Cuerpo */}
                      {borrador.cuerpo.length > 0 && (
                        <div className="space-y-4">
                          {borrador.cuerpo.map((sec, idx) => (
                            <div key={idx}>
                              {sec.subtitulo && (
                                <h5 className="text-amber-brand text-sm font-semibold mb-2">
                                  {sec.subtitulo}
                                </h5>
                              )}
                              <div className="space-y-3">
                                {sec.parrafos.map((p, pidx) => (
                                  <p
                                    key={pidx}
                                    className="text-seasalt text-sm leading-relaxed"
                                  >
                                    {p}
                                  </p>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Cierre */}
                      {borrador.cierre && (
                        <div className="bg-oxford-blue/60 border-l-4 border-davy-gray pl-4 py-3">
                          <p className="text-seasalt text-sm leading-relaxed italic">
                            {borrador.cierre}
                          </p>
                        </div>
                      )}

                      {/* Metadata */}
                      <div className="border-t border-davy-gray/30 pt-4 space-y-3">
                        <h5 className="text-davy-gray text-xs uppercase tracking-wide">
                          Metadata
                        </h5>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="bg-oxford-blue/60 border border-davy-gray/40 text-davy-gray px-2 py-1 rounded">
                            {metadata.extension_palabras} palabras
                          </span>
                          {metadata.tipo_pieza && (
                            <span className="bg-oxford-blue/60 border border-davy-gray/40 text-davy-gray px-2 py-1 rounded">
                              {metadata.tipo_pieza}
                            </span>
                          )}
                          {metadata.tono_aplicado && (
                            <span className="bg-oxford-blue/60 border border-davy-gray/40 text-davy-gray px-2 py-1 rounded">
                              tono: {metadata.tono_aplicado}
                            </span>
                          )}
                        </div>

                        {metadata.fuentes_citadas.length > 0 && (
                          <div>
                            <p className="text-davy-gray text-xs mb-1">Fuentes citadas:</p>
                            <div className="flex flex-wrap gap-1">
                              {metadata.fuentes_citadas.map((f, i) => (
                                <span
                                  key={i}
                                  className="bg-green-500/10 text-green-400 border border-green-500/30 px-2 py-0.5 rounded text-xs"
                                >
                                  {f}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {metadata.advertencias_verificacion.length > 0 && (
                          <div>
                            <p className="text-amber-brand text-xs mb-1 font-medium">
                              ⚠️ Advertencias de verificacion ({metadata.advertencias_verificacion.length})
                            </p>
                            <ul className="space-y-1">
                              {metadata.advertencias_verificacion.map((a, i) => (
                                <li
                                  key={i}
                                  className="text-davy-gray text-xs bg-amber-brand/10 border border-amber-brand/30 rounded px-2 py-1"
                                >
                                  {a}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {metadata.verificaciones_criticas_resueltas.length > 0 && (
                          <div>
                            <p className="text-green-400 text-xs mb-1 font-medium">
                              ✅ Verificaciones criticas resueltas (
                              {metadata.verificaciones_criticas_resueltas.length})
                            </p>
                            <ul className="space-y-1">
                              {metadata.verificaciones_criticas_resueltas.map((v, i) => (
                                <li
                                  key={i}
                                  className="text-davy-gray text-xs bg-green-500/10 border border-green-500/30 rounded px-2 py-1"
                                >
                                  {v}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {metadata.verificaciones_criticas_pendientes.length > 0 && (
                          <div>
                            <p className="text-amber-brand text-xs mb-1 font-medium">
                              ⏳ Verificaciones criticas pendientes (
                              {metadata.verificaciones_criticas_pendientes.length})
                            </p>
                            <ul className="space-y-1">
                              {metadata.verificaciones_criticas_pendientes.map((v, i) => (
                                <li
                                  key={i}
                                  className="text-davy-gray text-xs bg-amber-brand/10 border border-amber-brand/30 rounded px-2 py-1"
                                >
                                  {v}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {/* Notas editoriales */}
                      {notas_editoriales && (
                        <div className="border-t border-davy-gray/30 pt-4">
                          <h5 className="text-davy-gray text-xs uppercase tracking-wide mb-2">
                            Notas editoriales del modelo
                          </h5>
                          <p className="text-davy-gray text-xs italic leading-relaxed">
                            {notas_editoriales}
                          </p>
                        </div>
                      )}

                      {/* Textarea oculto para fallback de copia (Chunk 9B - B2) */}
                      <textarea
                        id="borrador-fallback-textarea"
                        readOnly
                        value={textoPlano}
                        aria-hidden="true"
                        tabIndex={-1}
                        style={{
                          position: 'absolute',
                          left: '-9999px',
                          top: 'auto',
                          width: '1px',
                          height: '1px',
                          overflow: 'hidden',
                        }}
                      />

                      {/* Acciones */}
                      <div className="border-t border-davy-gray/30 pt-4 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => setExportadorAbierto(true)}
                          className="px-4 py-2 bg-amber-brand/20 text-amber-brand border border-amber-brand/40
                                     rounded hover:bg-amber-brand/30 transition-colors text-sm"
                        >
                          Exportar verificaciones para investigacion externa
                        </button>
                        <button
                          type="button"
                          onClick={handleCopiar}
                          className="bg-davy-gray/30 hover:bg-davy-gray/50 text-seasalt text-sm px-4 py-2 rounded transition-colors"
                        >
                          📋 Copiar al portapapeles
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── TAB: Generador de Prompt Visual (Chunk 14B: fase visual) ── */}
            {activeTool === 'prompt_visual' && phaseConfig.tabs.some((t) => t.key === 'prompt_visual') && (
              <div className="space-y-4">
                {/* Contexto del expediente */}
                {(() => {
                  const dataObj = (project.data ?? {}) as Record<string, unknown>;
                  const borradorRaw = dataObj.borrador as Record<string, unknown> | undefined;
                  const promptVisualRaw = dataObj.prompt_visual as Record<string, unknown> | undefined;
                  const hasBorrador = borradorRaw && typeof borradorRaw === 'object';
                  const borrContenidoExport = hasBorrador ? ((borradorRaw as Record<string, unknown>).contenido ?? (borradorRaw as Record<string, unknown>).borrador) as Record<string, unknown> | undefined : undefined;
                  const borradorTitulo = borrContenidoExport ? String(borrContenidoExport.titulo ?? '') : '';

                  return (
                    <>
                      {/* Panel de contexto */}
                      <div className="bg-oxford-blue/50 rounded-lg p-4 border border-davy-gray/20">
                        <h3 className="text-seasalt text-sm font-semibold mb-2">Contexto del expediente</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="text-davy-gray">Borrador:</span>{' '}
                            {borradorTitulo ? (
                              <span className="text-seasalt">{borradorTitulo}</span>
                            ) : (
                              <span className="text-red-400">Sin borrador</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Guard: sin borrador */}
                      {!hasBorrador && (
                        <div className="bg-red-500/10 border border-red-500/40 rounded p-4">
                          <p className="text-red-400 text-sm">
                            El proyecto no tiene borrador aprobado. Genera el borrador en la fase Produccion antes de continuar.
                          </p>
                        </div>
                      )}

                      {/* Error */}
                      {genPromptVisualError && (
                        <div className="bg-red-500/10 border border-red-500/40 rounded p-3">
                          <p className="text-red-400 text-sm">{genPromptVisualError}</p>
                        </div>
                      )}

                      {/* Boton generar */}
                      <button
                        type="button"
                        onClick={handleGenerarPromptVisual}
                        disabled={generandoPromptVisual || !hasBorrador}
                        className="px-6 py-3 bg-amber-brand text-oxford-blue font-semibold rounded
                                   hover:bg-amber-brand/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {generandoPromptVisual
                          ? 'Generando prompt visual...'
                          : promptVisualRaw
                            ? '🔄 Regenerar prompt visual'
                            : '🎨 Generar prompt visual'}
                      </button>

                      {/* Resultado */}
                      {promptVisualRaw && typeof promptVisualRaw === 'object' && (
                        <div className="space-y-4">
                          <div className="bg-space-cadet rounded-lg border border-davy-gray/30 p-5 space-y-4">
                            <h3 className="text-amber-brand font-semibold text-lg">Prompt visual generado</h3>

                            {[
                              { key: 'descripcion_imagen', label: 'Descripcion de la imagen' },
                              { key: 'estilo', label: 'Estilo' },
                              { key: 'paleta_mood', label: 'Paleta / Mood' },
                              { key: 'composicion', label: 'Composicion' },
                              { key: 'formato_proporciones', label: 'Formato y proporciones' },
                              { key: 'instruccion_uso', label: 'Instruccion de uso' },
                            ].map(({ key, label }) => {
                              const val = String(promptVisualRaw[key] ?? '');
                              if (!val) return null;
                              return (
                                <div key={key}>
                                  <p className="text-davy-gray text-xs font-semibold uppercase tracking-wider mb-1">
                                    {label}
                                  </p>
                                  <p className="text-seasalt text-sm whitespace-pre-wrap">{val}</p>
                                </div>
                              );
                            })}

                            {typeof promptVisualRaw.generadoEn === 'string' && (
                              <p className="text-davy-gray text-xs mt-2">
                                Generado: {new Date(promptVisualRaw.generadoEn).toLocaleString('es-CL')}
                              </p>
                            )}
                          </div>

                          {/* Boton copiar */}
                          <button
                            type="button"
                            onClick={() => {
                              const lines = [
                                promptVisualRaw.descripcion_imagen ? `Descripcion: ${promptVisualRaw.descripcion_imagen}` : '',
                                promptVisualRaw.estilo ? `Estilo: ${promptVisualRaw.estilo}` : '',
                                promptVisualRaw.paleta_mood ? `Paleta/Mood: ${promptVisualRaw.paleta_mood}` : '',
                                promptVisualRaw.composicion ? `Composicion: ${promptVisualRaw.composicion}` : '',
                                promptVisualRaw.formato_proporciones ? `Formato: ${promptVisualRaw.formato_proporciones}` : '',
                                promptVisualRaw.instruccion_uso ? `Uso: ${promptVisualRaw.instruccion_uso}` : '',
                              ].filter(Boolean).join('\n\n');
                              navigator.clipboard.writeText(lines).then(
                                () => alert('Prompt visual copiado al portapapeles'),
                                () => {
                                  const ta = document.createElement('textarea');
                                  ta.value = lines;
                                  ta.style.position = 'fixed';
                                  ta.style.left = '-9999px';
                                  document.body.appendChild(ta);
                                  ta.focus();
                                  ta.select();
                                  alert('No se pudo copiar automaticamente. Selecciona el texto y usa Ctrl+C.');
                                  document.body.removeChild(ta);
                                }
                              );
                            }}
                            className="px-4 py-2 bg-oxford-blue border border-davy-gray/40 text-seasalt text-sm rounded
                                       hover:border-amber-brand/60 transition-colors"
                          >
                            📋 Copiar prompt visual
                          </button>

                          {/* Nota informativa */}
                          <p className="text-davy-gray/60 text-xs">
                            Este prompt esta diseñado para usarse en herramientas de generacion de imagenes
                            (Midjourney, DALL-E, etc.). Pega el texto copiado en la herramienta de tu preferencia.
                            Toda imagen generada con IA debe declararse como tal en los creditos.
                          </p>
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* ── Seccion: Upload de imagen visual (Chunk 20A) ── */}
                <div className="mt-8 pt-6 border-t border-davy-gray/20">
                  <h3 className="text-seasalt text-sm font-semibold mb-2">Imagen visual generada</h3>
                  <p className="text-davy-gray text-xs mb-3">
                    Sube la imagen que generaste con la herramienta externa. Solo JPEG, PNG o WebP (max 10 MB).
                  </p>

                  {(() => {
                    const dataObj = (project.data ?? {}) as Record<string, unknown>;
                    const imgRaw = dataObj.imagen_visual as Record<string, unknown> | undefined;
                    const hasImage = imgRaw && typeof imgRaw === 'object' && typeof imgRaw.url === 'string';

                    return (
                      <>
                        {hasImage && (
                          <div className="mb-4 space-y-2">
                            <div className="relative inline-block">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={String(imgRaw.url)}
                                alt="Imagen visual del proyecto"
                                className="max-h-64 rounded border border-davy-gray/30"
                              />
                            </div>
                            <div className="flex items-center gap-3 text-xs text-davy-gray">
                              <span>{String(imgRaw.nombre ?? '')}</span>
                              {typeof imgRaw.subidaEn === 'string' && (
                                <span>Subida: {new Date(imgRaw.subidaEn).toLocaleString('es-CL')}</span>
                              )}
                            </div>
                          </div>
                        )}

                        <label className="inline-flex items-center gap-2 px-4 py-2 bg-oxford-blue border border-davy-gray/40 text-seasalt text-sm rounded hover:border-amber-brand/60 transition-colors cursor-pointer">
                          <span>{subiendoImagenVisual ? 'Subiendo...' : hasImage ? 'Reemplazar imagen' : 'Subir imagen'}</span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            disabled={subiendoImagenVisual}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleUploadImagenVisual(file);
                              e.target.value = '';
                            }}
                          />
                        </label>

                        {imagenVisualError && (
                          <div className="mt-2 bg-red-500/10 border border-red-500/40 rounded p-3">
                            <p className="text-red-400 text-sm">{imagenVisualError}</p>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* ── TAB: Vista Previa — Lectura Final (Chunk 20A: fase aprobado) ── */}
            {activeTool === 'vista_previa' && phaseConfig.tabs.some((t) => t.key === 'vista_previa') && (
              <div className="space-y-6">
                {(() => {
                  const dataObj = (project.data ?? {}) as Record<string, unknown>;
                  const borradorRaw = dataObj.borrador as Record<string, unknown> | undefined;
                  const imgRaw = dataObj.imagen_visual as Record<string, unknown> | undefined;
                  const hasImage = imgRaw && typeof imgRaw === 'object' && typeof imgRaw.url === 'string';

                  if (!borradorRaw || typeof borradorRaw !== 'object') {
                    return (
                      <div className="bg-red-500/10 border border-red-500/40 rounded p-4">
                        <p className="text-red-400 text-sm">
                          El proyecto no tiene borrador. Genera el borrador en la fase Produccion.
                        </p>
                      </div>
                    );
                  }

                  const parsed = parseBorradorFromRaw(borradorRaw);
                  if (!parsed) {
                    return (
                      <div className="bg-red-500/10 border border-red-500/40 rounded p-4">
                        <p className="text-red-400 text-sm">El borrador no tiene estructura valida.</p>
                      </div>
                    );
                  }

                  const { contenido: b, metadata: m } = parsed;
                  const wordCount = buildBorradorTextoPlano(parsed).split(/\s+/).filter(Boolean).length;

                  return (
                    <>
                      {/* Imagen visual */}
                      {hasImage && (
                        <div className="flex justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={String(imgRaw.url)}
                            alt="Imagen visual del proyecto"
                            className="max-h-80 rounded border border-davy-gray/30"
                          />
                        </div>
                      )}

                      {/* Borrador en formato tipografico */}
                      <article className="bg-seasalt/5 rounded-lg border border-davy-gray/20 p-8 max-w-3xl mx-auto">
                        {b.titulo && (
                          <h1 className="text-seasalt text-2xl font-bold mb-2 leading-tight">{b.titulo}</h1>
                        )}
                        {b.bajada && (
                          <p className="text-davy-gray text-lg italic mb-4 leading-relaxed">{b.bajada}</p>
                        )}
                        {b.lead && (
                          <p className="text-seasalt text-base font-medium mb-6 leading-relaxed">{b.lead}</p>
                        )}
                        {b.cuerpo.map((sec, idx) => (
                          <div key={idx} className="mb-5">
                            {sec.subtitulo && (
                              <h2 className="text-amber-brand text-lg font-semibold mb-2">{sec.subtitulo}</h2>
                            )}
                            {sec.parrafos.map((p, pIdx) => (
                              <p key={pIdx} className="text-seasalt/90 text-base leading-relaxed mb-3">{p}</p>
                            ))}
                          </div>
                        ))}
                        {b.cierre && (
                          <p className="text-seasalt/80 text-base italic mt-6 pt-4 border-t border-davy-gray/20 leading-relaxed">
                            {b.cierre}
                          </p>
                        )}
                      </article>

                      {/* Footer con stats */}
                      <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-davy-gray bg-oxford-blue/50 rounded p-4">
                        <div className="flex gap-4">
                          <span>{wordCount} palabras</span>
                          <span>{m.fuentes_citadas.length} fuentes citadas</span>
                          <span>{m.verificaciones_criticas_pendientes.length} verificaciones pendientes</span>
                        </div>
                        {parsed.generadoEn && (
                          <span>Borrador generado: {new Date(parsed.generadoEn).toLocaleString('es-CL')}</span>
                        )}
                      </div>

                      {/* Boton retroceder */}
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => handlePipelineAction('retreat')}
                          disabled={actionLoading}
                          className="px-4 py-2 text-sm text-davy-gray border border-davy-gray/30 rounded hover:text-seasalt hover:border-davy-gray/60 transition-colors disabled:opacity-50"
                        >
                          ← Volver a Visual
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* ── TAB: Exportador ZIP (Chunk 13B: fase exportado) ── */}
            {activeTool === 'exportador' && phaseConfig.tabs.some((t) => t.key === 'exportador') && (
              <div className="space-y-4">
                <h2 className="text-seasalt text-xl font-semibold">📦 Exportar proyecto completo</h2>
                <p className="text-davy-gray text-sm">
                  Descarga un archivo ZIP con el contenido del proyecto listo para archivar o compartir.
                  Incluye el JSON completo del proyecto, el borrador en Markdown, el pitch en Markdown,
                  las fuentes del ODF y las hipotesis generadas.
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    if (!project) return;
                    setExportandoZip(true);
                    setExportZipError(null);
                    try {
                      const res = await fetch(`/api/projects/${project.id}/export`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ format: 'zip' }),
                      });
                      if (!res.ok) {
                        const errJson = await res.json().catch(() => ({}));
                        throw new Error((errJson as Record<string, string>).error || 'Error generando ZIP');
                      }
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${project.publicId}-export.zip`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    } catch (err) {
                      setExportZipError(err instanceof Error ? err.message : 'Error desconocido');
                    } finally {
                      setExportandoZip(false);
                    }
                  }}
                  disabled={exportandoZip}
                  className="px-6 py-3 bg-amber-brand text-oxford-blue font-semibold rounded
                             hover:bg-amber-brand/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {exportandoZip ? 'Generando ZIP...' : 'Descargar ZIP'}
                </button>
                {exportZipError && (
                  <div className="bg-red-500/10 border border-red-500/40 rounded p-3">
                    <p className="text-red-400 text-sm">{exportZipError}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── Hipótesis Elegida (destacada) ── */}
        {savedHipotesisElegida && (
          <section className="bg-space-cadet rounded-lg border-2 border-amber-brand/60 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">⭐</span>
                <h2 className="text-amber-brand font-semibold">
                  Hipótesis elegida para investigación
                </h2>
              </div>
              <button
                onClick={handleCambiarEleccion}
                className="text-xs text-davy-gray hover:text-seasalt underline"
              >
                Cambiar elección
              </button>
            </div>
            {renderHipotesisCard(savedHipotesisElegida, -1, true)}
            {savedHipotesisElegida.elegidaEn && (
              <p className="text-xs text-davy-gray mt-3">
                Elegida:{' '}
                {new Date(savedHipotesisElegida.elegidaEn).toLocaleString('es-CL')}
              </p>
            )}
          </section>
        )}

        {/* ── Hipótesis Generadas (nuevo, Chunk 6) ── */}
        {savedHipotesis && savedHipotesis.hipotesis.length > 0 && (
          <section className="bg-space-cadet rounded-lg border border-davy-gray/20 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-seasalt font-semibold">
                🔬 Hipótesis Generadas ({savedHipotesis.hipotesis.length})
              </h2>
              <div className="text-right">
                <p className="text-davy-gray text-xs">
                  Tema: <span className="text-seasalt">{savedHipotesis.tema}</span>
                </p>
                {savedHipotesis.generadoEn && (
                  <p className="text-davy-gray text-xs">
                    {new Date(savedHipotesis.generadoEn).toLocaleDateString('es-CL', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {/* Chunk 12F: si hay hipotesis elegida, filtrar la elegida del listado
                  y agrupar las descartadas en un disclosure colapsable. Si no hay
                  elegida, mostrar el listado completo como antes. */}
              {(() => {
                if (!savedHipotesisElegida) {
                  // Sin elegida: listado completo sin filtrar
                  return savedHipotesis.hipotesis.map((h, idx) => (
                    <div key={idx}>{renderHipotesisCard(h, idx, false)}</div>
                  ));
                }

                // Con elegida: filtrar por titulo y agrupar descartadas
                const descartadas = savedHipotesis.hipotesis
                  .map((h, idx) => ({ h, idx }))
                  .filter(({ h }) => h.titulo !== elegidaKey);

                if (descartadas.length === 0) return null;

                return (
                  <details>
                    <summary className="cursor-pointer text-sm text-davy-gray hover:text-seasalt transition-colors">
                      Ver {descartadas.length} hipotesis descartada{descartadas.length !== 1 ? 's' : ''}
                    </summary>
                    <div className="mt-3 space-y-3 opacity-60">
                      {descartadas.map(({ h, idx }) => (
                        <div key={idx}>{renderHipotesisCard(h, idx, false)}</div>
                      ))}
                    </div>
                  </details>
                );
              })()}
            </div>

            {savedHipotesis.notaEditorial && (
              <div className="mt-4 pt-4 border-t border-davy-gray/20">
                <p className="text-davy-gray text-xs uppercase tracking-wider mb-1">
                  Nota Editorial
                </p>
                <p className="text-seasalt/80 text-sm">{savedHipotesis.notaEditorial}</p>
              </div>
            )}
          </section>
        )}

        {/* ── Validaciones VHP histórico (Chunk 7B) ── */}
        {savedVhp.length > 0 && (
          <section className="bg-space-cadet rounded-lg border border-davy-gray/20 p-6">
            <h2 className="text-seasalt font-semibold mb-4">
              🧪 Validaciones de Hipótesis y Pista ({savedVhp.length})
            </h2>
            <div className="space-y-3">
              {savedVhp.map((entry, idx) => {
                const verCfg =
                  VHP_VEREDICTO_LABELS[entry.ai_response.veredicto] ?? {
                    label: entry.ai_response.veredicto,
                    color: 'text-davy-gray',
                  };
                return (
                  <div
                    key={entry.id}
                    className="bg-oxford-blue rounded-lg border border-davy-gray/15 overflow-hidden"
                  >
                    <button
                      onClick={() =>
                        setExpandedVhp(expandedVhp === entry.id ? null : entry.id)
                      }
                      className="w-full p-4 text-left hover:bg-davy-gray/5 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-seasalt text-sm font-medium">
                              Iteración #{idx + 1}
                            </span>
                            <span className="text-xs text-davy-gray">
                              {LEAD_TIPO_LABELS[entry.lead_input.tipo] ?? entry.lead_input.tipo}
                            </span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded border ${
                                LEAD_ACCESO_COLORS[entry.lead_input.acceso] ?? ''
                              }`}
                            >
                              Acceso: {LEAD_ACCESO_LABELS[entry.lead_input.acceso]}
                            </span>
                            {entry.promovida_a_fuente && (
                              <span className="text-[10px] px-2 py-0.5 rounded border border-green-500/40 bg-green-500/10 text-green-400">
                                🗂️ Promovida al ODF
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-davy-gray/80 italic truncate">
                            «{entry.lead_input.descripcion}»
                          </p>
                          {entry.fecha_validacion && (
                            <p className="text-xs text-davy-gray/60 mt-0.5">
                              {new Date(entry.fecha_validacion).toLocaleString('es-CL')}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className={`font-bold ${verCfg.color}`}>
                            {entry.ai_response.viabilidad_score}/100
                          </span>
                          <span className={`text-xs ${verCfg.color}`}>{verCfg.label}</span>
                          <span className="text-davy-gray text-xs">
                            {expandedVhp === entry.id ? '▾' : '▸'}
                          </span>
                        </div>
                      </div>
                    </button>
                    {expandedVhp === entry.id && (
                      <div className="px-4 pb-4 border-t border-davy-gray/15 pt-3 space-y-4">
                        {/* Hipótesis snapshot */}
                        <div className="bg-space-cadet/60 border border-amber-brand/20 rounded p-3">
                          <p className="text-[10px] uppercase tracking-wider text-amber-brand font-semibold mb-1">
                            Hipótesis evaluada
                          </p>
                          <p className="text-seasalt text-sm">
                            {entry.hipotesis_snapshot.titulo}
                          </p>
                          {entry.hipotesis_snapshot.pregunta_clave && (
                            <p className="text-davy-gray text-xs mt-1">
                              <span className="text-blue-400/80">Pregunta clave:</span>{' '}
                              {entry.hipotesis_snapshot.pregunta_clave}
                            </p>
                          )}
                        </div>

                        {/* Lead completo */}
                        {entry.lead_input.notas && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-davy-gray font-semibold mb-1">
                              Notas del operador
                            </p>
                            <p className="text-seasalt/80 text-xs italic">
                              {entry.lead_input.notas}
                            </p>
                          </div>
                        )}

                        {/* Fortalezas */}
                        {entry.ai_response.fortalezas.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-green-400 font-semibold mb-1">
                              ✅ Fortalezas
                            </p>
                            <ul className="space-y-1 list-disc list-inside text-sm text-seasalt/80">
                              {entry.ai_response.fortalezas.map((f, i) => (
                                <li key={i}>{f}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Riesgos */}
                        {entry.ai_response.riesgos.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-red-400 font-semibold mb-1">
                              ⚠️ Riesgos
                            </p>
                            <ul className="space-y-1 list-disc list-inside text-sm text-seasalt/80">
                              {entry.ai_response.riesgos.map((r, i) => (
                                <li key={i}>{r}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Recomendaciones */}
                        {entry.ai_response.recomendaciones.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-amber-brand font-semibold mb-1">
                              🛠️ Recomendaciones operativas
                            </p>
                            <ul className="space-y-1 list-disc list-inside text-sm text-seasalt/80">
                              {entry.ai_response.recomendaciones.map((r, i) => (
                                <li key={i}>{r}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Preguntas clave */}
                        {entry.ai_response.preguntas_clave.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-blue-400 font-semibold mb-1">
                              ❓ Preguntas clave para el lead
                            </p>
                            <ul className="space-y-1 list-disc list-inside text-sm text-seasalt/80">
                              {entry.ai_response.preguntas_clave.map((q, i) => (
                                <li key={i}>{q}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Ángulos Legacy (retrocompat — solo lectura) ── */}
        {savedAngulosLegacy && savedAngulosLegacy.angulos.length > 0 && (
          <section className="bg-space-cadet rounded-lg border border-davy-gray/20 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-seasalt font-semibold">
                  Ángulos Generados (legacy)
                </h2>
                <p className="text-davy-gray/70 text-xs mt-1">
                  Generados antes de Chunk 6. Solo lectura.
                </p>
              </div>
              <div className="text-right">
                <p className="text-davy-gray text-xs">
                  Tema: <span className="text-seasalt">{savedAngulosLegacy.tema}</span>
                </p>
                {savedAngulosLegacy.generadoEn && (
                  <p className="text-davy-gray text-xs">
                    {new Date(savedAngulosLegacy.generadoEn).toLocaleDateString('es-CL', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {savedAngulosLegacy.angulos.map((a, idx) => (
                <div key={idx}>{renderHipotesisCard(a, idx, true)}</div>
              ))}
            </div>

            {savedAngulosLegacy.notaEditorial && (
              <div className="mt-4 pt-4 border-t border-davy-gray/20">
                <p className="text-davy-gray text-xs uppercase tracking-wider mb-1">
                  Nota Editorial
                </p>
                <p className="text-seasalt/80 text-sm">{savedAngulosLegacy.notaEditorial}</p>
              </div>
            )}
          </section>
        )}

        {/* ── Radar Editorial histórico ── */}
        {savedRadar.length > 0 && (
          <section className="bg-space-cadet rounded-lg border border-davy-gray/20 p-6">
            <h2 className="text-seasalt font-semibold mb-4">
              📡 Radar Editorial ({savedRadar.length})
            </h2>
            <div className="space-y-3">
              {savedRadar.map((entry) => (
                <div
                  key={entry.id}
                  className="bg-oxford-blue rounded-lg border border-davy-gray/15 overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setExpandedRadar(expandedRadar === entry.id ? null : entry.id)
                    }
                    className="w-full p-4 text-left hover:bg-davy-gray/5 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-seasalt font-medium text-sm">{entry.medio}</span>
                          {entry.fecha_publicacion && (
                            <span className="text-xs text-davy-gray">
                              · {entry.fecha_publicacion}
                            </span>
                          )}
                        </div>
                        {entry.url && (
                          <p className="text-xs text-davy-gray truncate">{entry.url}</p>
                        )}
                        {entry.notas_propias && (
                          <p className="text-xs text-davy-gray/80 italic truncate">
                            {entry.notas_propias}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span
                          className={`font-bold ${
                            VEREDICTO_LABELS[entry.veredicto]?.color ?? 'text-davy-gray'
                          }`}
                        >
                          {entry.puntuacion_global.toFixed(1)}/5
                        </span>
                        <span
                          className={`text-xs ${
                            VEREDICTO_LABELS[entry.veredicto]?.color ?? 'text-davy-gray'
                          }`}
                        >
                          {VEREDICTO_LABELS[entry.veredicto]?.label ?? entry.veredicto}
                        </span>
                        <span className="text-davy-gray text-xs">
                          {expandedRadar === entry.id ? '▾' : '▸'}
                        </span>
                      </div>
                    </div>
                  </button>
                  {expandedRadar === entry.id && (
                    <div className="px-4 pb-4 border-t border-davy-gray/15 pt-3">
                      {entry.resumen && (
                        <p className="text-seasalt/80 text-sm mb-3">{entry.resumen}</p>
                      )}
                      {entry.texto_analizado && (
                        <div className="bg-space-cadet border-l-2 border-davy-gray/30 pl-3 py-1 mb-3 text-xs text-davy-gray/80 italic">
                          «{entry.texto_analizado}…»
                        </div>
                      )}
                      {renderDimensions(entry.evaluacion)}
                      {entry.auditado_en && (
                        <p className="text-xs text-davy-gray mt-3">
                          Auditado: {new Date(entry.auditado_en).toLocaleString('es-CL')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Validaciones de Borrador histórico (fase revision) ── */}
        {savedValidacionesBorrador.length > 0 && (() => {
          // Chunk 9C (C2): lectura del puntero a la iteracion marcada como definitiva
          const definitivaId = (project?.data as Record<string, unknown> | undefined)
            ?.validacion_borrador_definitiva_id as string | undefined;
          return (
          <section className="bg-space-cadet rounded-lg border border-davy-gray/20 p-6">
            <h2 className="text-seasalt font-semibold mb-4">
              ✅ Validaciones del Borrador ({savedValidacionesBorrador.length})
            </h2>
            <div className="space-y-3">
              {savedValidacionesBorrador.map((entry, idx) => {
                const esDefinitiva = entry.id === definitivaId;
                return (
                <div
                  key={entry.id}
                  className="bg-oxford-blue rounded-lg border border-davy-gray/15 overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setExpandedBorrador(expandedBorrador === entry.id ? null : entry.id)
                    }
                    className="w-full p-4 text-left hover:bg-davy-gray/5 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-seasalt text-sm">
                          Iteración #{idx + 1}
                          {esDefinitiva && (
                            <span className="bg-green-500/20 text-green-400 border border-green-500/40 px-2 py-0.5 rounded text-xs ml-2">
                              ✅ Definitiva
                            </span>
                          )}
                          {entry.validado_en && (
                            <span className="text-davy-gray text-xs ml-2">
                              · {new Date(entry.validado_en).toLocaleString('es-CL')}
                            </span>
                          )}
                        </p>
                        {entry.texto_analizado && (
                          <p className="text-xs text-davy-gray/80 italic truncate mt-1">
                            «{entry.texto_analizado}…»
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span
                          className={`font-bold ${
                            VEREDICTO_LABELS[entry.veredicto]?.color ?? 'text-davy-gray'
                          }`}
                        >
                          {entry.puntuacion_global.toFixed(1)}/5
                        </span>
                        <span
                          className={`text-xs ${
                            VEREDICTO_LABELS[entry.veredicto]?.color ?? 'text-davy-gray'
                          }`}
                        >
                          {VEREDICTO_LABELS[entry.veredicto]?.label ?? entry.veredicto}
                        </span>
                        <span className="text-davy-gray text-xs">
                          {expandedBorrador === entry.id ? '▾' : '▸'}
                        </span>
                      </div>
                    </div>
                  </button>
                  {expandedBorrador === entry.id && (
                    <div className="px-4 pb-4 border-t border-davy-gray/15 pt-3">
                      {entry.resumen && (
                        <p className="text-seasalt/80 text-sm mb-3">{entry.resumen}</p>
                      )}
                      {renderDimensions(entry.evaluacion)}
                      {/* Chunk 9C (C2): acciones de curacion del historial */}
                      <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-davy-gray/30">
                        {!esDefinitiva && (
                          <button
                            type="button"
                            onClick={() => handleMarcarValidacionDefinitiva(entry.id)}
                            className="bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/40 text-xs px-3 py-1.5 rounded transition-colors"
                          >
                            ✅ Marcar como definitiva
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleEliminarValidacionBorrador(entry.id)}
                          className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/40 text-xs px-3 py-1.5 rounded transition-colors"
                        >
                          🗑️ Eliminar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </section>
          );
        })()}

        {/* ── Validación de Tono legacy (retrocompat — solo lectura) ── */}
        {savedValidacionLegacy && (
          <section className="bg-space-cadet rounded-lg border border-davy-gray/20 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-seasalt font-semibold">Validación de Tono (legacy)</h2>
                <p className="text-davy-gray/70 text-xs mt-1">
                  Generada antes de Chunk 6. Solo lectura.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`font-bold text-lg ${
                    VEREDICTO_LABELS[savedValidacionLegacy.veredicto]?.color ?? 'text-davy-gray'
                  }`}
                >
                  {savedValidacionLegacy.puntuacion_global.toFixed(1)}/5
                </span>
                <span
                  className={`text-sm ${
                    VEREDICTO_LABELS[savedValidacionLegacy.veredicto]?.color ?? 'text-davy-gray'
                  }`}
                >
                  {VEREDICTO_LABELS[savedValidacionLegacy.veredicto]?.label ??
                    savedValidacionLegacy.veredicto}
                </span>
              </div>
            </div>

            {savedValidacionLegacy.resumen && (
              <p className="text-seasalt/80 text-sm mb-4">{savedValidacionLegacy.resumen}</p>
            )}

            {renderDimensions(savedValidacionLegacy.evaluacion)}
          </section>
        )}
      </div>

      {/* Chunk 12B: Modal del exportador de pesquisa externa */}
      {exportadorAbierto && project && !!(project.data?.borrador) && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setExportadorAbierto(false)}
        >
          <div
            className="bg-oxford-blue border border-davy-gray/40 rounded-lg max-w-3xl w-full
                       max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-davy-gray/30">
              <h3 className="text-lg font-semibold text-seasalt">
                Exportar verificaciones para investigacion externa
              </h3>
              <p className="text-xs text-davy-gray mt-2">
                Copia este texto y pegalo en una conversacion nueva de Claude.ai. Claude.ai va a
                usar su busqueda web nativa para investigar las verificaciones pendientes y
                devolverte hallazgos con fuentes. Despues cargas esos hallazgos como fuentes
                en el ODF y el sistema regenera el borrador con la evidencia incorporada.
              </p>
            </div>

            <div className="flex-1 overflow-auto p-6">
              <textarea
                readOnly
                value={buildTextoExportadorPesquisa(
                  project,
                  parseBorradorFromRaw(project.data.borrador as Record<string, unknown>) as BorradorData
                )}
                className="w-full h-96 bg-oxford-blue/50 border border-davy-gray/30 rounded
                           p-4 text-seasalt text-xs font-mono resize-none focus:outline-none"
              />
            </div>

            <div className="p-6 border-t border-davy-gray/30 flex items-center justify-between">
              <button
                onClick={handleCopiarExportador}
                className="px-4 py-2 bg-amber-brand text-oxford-blue rounded font-semibold
                           hover:bg-amber-brand/90 transition-colors text-sm"
              >
                {exportadorCopiado ? 'Copiado' : 'Copiar al portapapeles'}
              </button>
              <button
                onClick={() => setExportadorAbierto(false)}
                className="px-4 py-2 text-davy-gray hover:text-seasalt transition-colors text-sm"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
