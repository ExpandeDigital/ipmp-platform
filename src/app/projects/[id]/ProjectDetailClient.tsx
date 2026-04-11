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

interface PitchData {
  pitch: Record<string, unknown>;
  texto_completo: string;
  medio_destino: string;
  notas_estrategicas: string;
  angulo_titulo: string;
  generadoEn: string;
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
  borrador: BorradorBody;
  metadata: BorradorMetadata;
  notas_editoriales: string;
  generadoEn: string;
  notasOperador?: string;
  modo?: string;
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

type ActiveTool = 'hipotesis' | 'vhp' | 'odf' | 'pitch' | 'radar' | 'validador' | 'borrador';

interface PhaseConfig {
  tabs: { key: ActiveTool; label: string }[];
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

const FAMILY_LABELS: Record<string, string> = {
  prensa: 'Prensa',
  opinion: 'Opinión',
  institucional: 'Institucional',
  academico: 'Académico',
};

const PHASE_CONFIG: Record<string, PhaseConfig> = {
  draft: {
    tabs: [],
    info: 'Borrador recién creado. Avanza a Validación para generar hipótesis de investigación.',
  },
  validacion: {
    tabs: [
      { key: 'hipotesis', label: '🔬 Generador de Hipótesis' },
      { key: 'vhp', label: '🧪 Validador de Hipótesis y Pista' },
    ],
  },
  pesquisa: {
    tabs: [
      { key: 'odf', label: '🗂️ Organizador de Fuentes' },
      { key: 'pitch', label: '📨 Constructor de Pitch' },
      { key: 'radar', label: '📡 Radar Editorial' },
    ],
  },
  produccion: {
    tabs: [{ key: 'borrador', label: '✍️ Generador de Borrador' }],
  },
  visual: {
    tabs: [],
    placeholder: 'Generador de Visuales — fase futura',
  },
  revision: {
    tabs: [{ key: 'validador', label: '✅ Validador de Tono del Borrador' }],
  },
  aprobado: {
    tabs: [],
    info: 'Project aprobado. Listo para exportar.',
  },
  exportado: {
    tabs: [],
    placeholder: 'Exportador — fase futura',
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
    fecha_registro:
      typeof f.fecha_registro === 'string' && f.fecha_registro
        ? f.fecha_registro
        : new Date().toISOString(),
    origen,
    origen_validacion_id:
      typeof f.origen_validacion_id === 'string' ? f.origen_validacion_id : undefined,
  };
}

function parseBorradorFromRaw(raw: Record<string, unknown>): BorradorData | null {
  if (!raw || typeof raw !== 'object') return null;

  const borradorRaw = raw.borrador as Record<string, unknown> | undefined;
  if (!borradorRaw || typeof borradorRaw !== 'object') return null;

  const cuerpoRaw = Array.isArray(borradorRaw.cuerpo) ? borradorRaw.cuerpo : [];
  const cuerpo: BorradorSeccion[] = cuerpoRaw.map((s) => {
    const sec = s as Record<string, unknown>;
    return {
      subtitulo: typeof sec.subtitulo === 'string' ? sec.subtitulo : '',
      parrafos: Array.isArray(sec.parrafos) ? (sec.parrafos as unknown[]).map(String) : [],
    };
  });

  const borrador: BorradorBody = {
    titulo: typeof borradorRaw.titulo === 'string' ? borradorRaw.titulo : 'Sin titulo',
    bajada: typeof borradorRaw.bajada === 'string' ? borradorRaw.bajada : '',
    lead: typeof borradorRaw.lead === 'string' ? borradorRaw.lead : '',
    cuerpo,
    cierre: typeof borradorRaw.cierre === 'string' ? borradorRaw.cierre : '',
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

  return { borrador, metadata, notas_editoriales: notas, generadoEn, notasOperador, modo };
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
  const [tenantsList, setTenantsList] = useState<TenantOption[]>([]);
  const [templatesList, setTemplatesList] = useState<TemplateOption[]>([]);
  const [traspasoTenant, setTraspasoTenant] = useState('');
  const [traspasoTemplate, setTraspasoTemplate] = useState('');
  const [traspasoBrandVariant, setTraspasoBrandVariant] = useState('');
  const [traspasoLoading, setTraspasoLoading] = useState(false);
  const [traspasoError, setTraspasoError] = useState<string | null>(null);

  // Generador de Hipótesis
  const [hipTema, setHipTema] = useState('');
  const [hipAudiencia, setHipAudiencia] = useState('');
  const [hipDato, setHipDato] = useState('');
  const [generandoHip, setGenerandoHip] = useState(false);
  const [hipError, setHipError] = useState<string | null>(null);
  const [eligiendo, setEligiendo] = useState<number | null>(null);

  // Constructor de Pitch
  const [pitchAngulo, setPitchAngulo] = useState('');
  const [pitchMedio, setPitchMedio] = useState('');
  const [pitchTouched, setPitchTouched] = useState(false);
  const [construyendo, setConstruyendo] = useState(false);
  const [pitchError, setPitchError] = useState<string | null>(null);

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
  const [borradorTexto, setBorradorTexto] = useState('');
  const [validandoBorrador, setValidandoBorrador] = useState(false);
  const [borradorError, setBorradorError] = useState<string | null>(null);
  const [expandedBorrador, setExpandedBorrador] = useState<string | null>(null);

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
  const [odfGuardando, setOdfGuardando] = useState(false);
  const [odfError, setOdfError] = useState<string | null>(null);
  const [odfEditandoId, setOdfEditandoId] = useState<string | null>(null);

  // Active tool (default se reajusta por useEffect según fase)
  const [activeTool, setActiveTool] = useState<ActiveTool>('hipotesis');

  // Generador de Borrador — Chunk 8
  const [borradorOperadorNotas, setBorradorOperadorNotas] = useState('');
  const [generandoBorrador, setGenerandoBorrador] = useState(false);
  const [genBorradorError, setGenBorradorError] = useState<string | null>(null);

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

  // ── Prefill del Constructor de Pitch desde hipótesis elegida ──
  useEffect(() => {
    if (!project || pitchTouched) return;
    const raw = project.data?.hipotesis_elegida as Record<string, unknown> | undefined;
    if (raw && typeof raw === 'object' && raw.titulo) {
      const titulo = String(raw.titulo ?? '');
      const gancho = String(raw.gancho ?? '');
      const prefill = gancho ? `${titulo} — ${gancho}` : titulo;
      setPitchAngulo(prefill);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.data?.hipotesis_elegida]);

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
      setPitchTouched(false); // permitir re-prefill si elige otra
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

      const borradorPayload: BorradorData = {
        ...parsed,
        notasOperador: borradorOperadorNotas.trim() || undefined,
        modo: genJson.mode,
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

  // ── Validar borrador propio (fase revision) ──
  async function handleValidarBorrador() {
    if (!project || !borradorTexto.trim()) return;
    setValidandoBorrador(true);
    setBorradorError(null);

    try {
      const genBody: Record<string, unknown> = {
        tool: 'validador_tono',
        userMessage: borradorTexto.trim(),
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
      if (!res.ok) throw new Error(json.error || 'Error validando borrador');

      const result = json.result ?? {};
      const entry: ValidacionBorradorEntry = {
        id: genId(),
        texto_analizado: borradorTexto.trim().slice(0, 300),
        evaluacion: parseValidacionDimensions(result.evaluacion),
        puntuacion_global: Number(result.puntuacion_global ?? 0),
        veredicto: String(result.veredicto ?? 'requiere_revision'),
        resumen: String(result.resumen ?? ''),
        validado_en: new Date().toISOString(),
      };

      const currentRaw = project.data?.validaciones_borrador;
      const current: ValidacionBorradorEntry[] = Array.isArray(currentRaw)
        ? (currentRaw as ValidacionBorradorEntry[])
        : [];
      const next = [...current, entry];

      const patchRes = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { validaciones_borrador: next } }),
      });
      if (!patchRes.ok) {
        const pj = await patchRes.json();
        throw new Error(pj.error || 'Error guardando validación');
      }

      setBorradorTexto('');
      await fetchProject();
    } catch (err) {
      setBorradorError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setValidandoBorrador(false);
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

  // ── Organizador de Fuentes Forenses (ODF) — Chunk 7 ──
  function resetOdfForm() {
    setOdfTipo('documento');
    setOdfNombreTitulo('');
    setOdfRolOrigen('');
    setOdfEstado('por_contactar');
    setOdfConfianza('media');
    setOdfNotas('');
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

              {traspasoError && <p className="text-red-400 text-sm">{traspasoError}</p>}
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

            {/* ── Info (draft, aprobado) ── */}
            {phaseConfig.tabs.length === 0 && phaseConfig.info && (
              <div className="text-center py-10">
                {project.status === 'aprobado' ? (
                  <>
                    <div className="text-5xl mb-3">✓</div>
                    <p className="text-green-400 text-lg mb-4">{phaseConfig.info}</p>
                    <button
                      disabled
                      className="px-6 py-2 bg-amber-brand/20 border border-amber-brand/40 text-amber-brand rounded opacity-50 cursor-not-allowed"
                      title="Exportador — fase futura"
                    >
                      📤 Exportar (próximamente)
                    </button>
                  </>
                ) : (
                  <>
                    <div className="text-5xl mb-3">📝</div>
                    <p className="text-davy-gray">{phaseConfig.info}</p>
                  </>
                )}
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
                    <p className="text-amber-brand text-sm">
                      Primero elige una hipótesis en el tab <strong>🔬 Generador de Hipótesis</strong>.
                      El VHP necesita una hipótesis elegida para evaluar el match con tu lead.
                    </p>
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
                      {currentFuentes.length} fuente{currentFuentes.length !== 1 ? 's' : ''}
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
                          className="bg-space-cadet rounded-lg border border-davy-gray/30 p-4 hover:border-amber-brand/30 transition-colors"
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
                              </div>
                              <h4 className="text-seasalt font-semibold text-sm break-words">
                                {f.nombre_titulo}
                              </h4>
                              {f.rol_origen && (
                                <p className="text-davy-gray text-xs mt-0.5">{f.rol_origen}</p>
                              )}
                            </div>
                            <div className="flex gap-1 shrink-0">
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
                          <p className="text-davy-gray/50 text-[10px] mt-2">
                            Registrada: {new Date(f.fecha_registro).toLocaleString('es-CL')}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ── TAB: Constructor de Pitch (fase pesquisa) ── */}
            {activeTool === 'pitch' && phaseConfig.tabs.some((t) => t.key === 'pitch') && (
              <div>
                {savedHipotesisElegida && (
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded p-3 mb-4 text-xs text-blue-400">
                    💡 Prellenado desde hipótesis elegida. Podés editar el campo libremente.
                  </div>
                )}
                <p className="text-davy-gray text-sm mb-4">
                  Construí un pitch editorial listo para enviar a editores de medios.
                </p>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={pitchAngulo}
                    onChange={(e) => {
                      setPitchAngulo(e.target.value);
                      setPitchTouched(true);
                    }}
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
                  <p className="text-davy-gray text-sm mb-4">
                    Validá el tono, sesgo, precisión, claridad y ética periodística de tu
                    borrador antes de exportar. Cada análisis queda guardado en el historial de
                    iteraciones.
                  </p>
                  <div className="space-y-3">
                    <textarea
                      value={borradorTexto}
                      onChange={(e) => setBorradorTexto(e.target.value)}
                      placeholder="Pegá acá el texto del borrador a validar…"
                      rows={8}
                      maxLength={10000}
                      className="w-full bg-oxford-blue border border-davy-gray/30 rounded px-4 py-2
                                 text-seasalt placeholder:text-davy-gray/50 focus:outline-none
                                 focus:border-amber-brand/50 text-sm resize-y"
                    />
                    <button
                      onClick={handleValidarBorrador}
                      disabled={!borradorTexto.trim() || validandoBorrador}
                      className="w-full py-2.5 bg-amber-brand text-oxford-blue rounded font-medium text-sm
                                 hover:bg-amber-brand/90 transition-colors
                                 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {validandoBorrador ? 'Analizando borrador…' : '✅ Validar Borrador'}
                    </button>
                  </div>
                  {borradorError && <p className="text-red-400 text-sm mt-3">{borradorError}</p>}
                </div>
              )}

            {/* ── Generador de Borrador (Chunk 8B-1: placeholder, UI completa en 8B-2) ── */}
            {activeTool === 'borrador' && (
              <div className="bg-space-cadet/40 border border-davy-gray/30 rounded-lg p-8 text-center">
                <p className="text-seasalt text-lg mb-2">✍️ Generador de Borrador</p>
                <p className="text-davy-gray text-sm">
                  UI en construccion — Chunk 8B-2.
                </p>
                <p className="text-davy-gray/70 text-xs mt-4">
                  Backend listo (Chunk 8A). Handler y estado cableados (Chunk 8B-1). La interfaz completa
                  (panel de contexto, formulario, resultado) llega en el proximo sub-chunk.
                </p>
                {/* Wiring temporal para que TypeScript reconozca el uso de los estados del Chunk 8B-1.
                    El boton no se renderiza visiblemente; queda oculto hasta 8B-2. */}
                <button
                  type="button"
                  onClick={handleGenerateBorrador}
                  disabled={generandoBorrador}
                  className="hidden"
                  aria-hidden="true"
                  data-borrador-wiring="chunk8b1"
                >
                  {genBorradorError ? 'error' : 'wiring'}
                </button>
                <input
                  type="hidden"
                  value={borradorOperadorNotas}
                  onChange={(e) => setBorradorOperadorNotas(e.target.value)}
                />
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
              {savedHipotesis.hipotesis.map((h, idx) => (
                <div key={idx}>{renderHipotesisCard(h, idx, false)}</div>
              ))}
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

        {/* ── Pitch Guardado ── */}
        {savedPitch && (
          <section className="bg-space-cadet rounded-lg border border-davy-gray/20 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-seasalt font-semibold">📨 Pitch Editorial</h2>
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
                <p className="text-davy-gray text-xs uppercase tracking-wider mb-1">
                  Notas Estratégicas
                </p>
                <p className="text-seasalt/80 text-sm">{savedPitch.notas_estrategicas}</p>
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
        {savedValidacionesBorrador.length > 0 && (
          <section className="bg-space-cadet rounded-lg border border-davy-gray/20 p-6">
            <h2 className="text-seasalt font-semibold mb-4">
              ✅ Validaciones del Borrador ({savedValidacionesBorrador.length})
            </h2>
            <div className="space-y-3">
              {savedValidacionesBorrador.map((entry, idx) => (
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
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

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
    </main>
  );
}
