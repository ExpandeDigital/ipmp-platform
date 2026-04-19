/**
 * IP+MP Platform — API de Project Individual
 *
 * GET   /api/projects/[id]   → Detalle completo de un project (por UUID o publicId)
 * PATCH /api/projects/[id]   → Actualizar status, data, tenant, template
 *
 * El parámetro [id] acepta tanto UUID como publicId (ej: IP-2026-0001 o DREAMOMS-RP-2026-0001)
 *
 * REFACTORIZACIÓN 5a (Abril 2026):
 *   - LEFT JOIN: tenant y template pueden ser null (fase InvestigaPress)
 *   - PATCH acepta tenantSlug + templateSlug para traspaso IP→MP
 *   - Al asignar tenant+template, se regenera publicId de IP-XXXX a TENANT-PREFIX-XXXX
 *   - Bloqueo: no puede avanzar de pesquisa a produccion sin tenant+template asignados
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { projects, tenants, templates, editoresAgenda } from '@/db/schema';
import { eq, like, count } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

// ── Chunk 18A: requisitos minimos por familia para exportar ──
const EXPORT_REQUIREMENTS: Record<string, { min_palabras: number }> = {
  prensa:        { min_palabras: 800 },
  opinion:       { min_palabras: 400 },
  institucional: { min_palabras: 1000 },
  academico:     { min_palabras: 1500 },
};
const EXPORT_DEFAULT_REQ = { min_palabras: 500 };

interface ExportCondition {
  id: string;
  passed: boolean;
  descripcion: string;
  soft?: boolean;
}

function evaluateExportGate(
  templateFamily: string | null | undefined,
  data: Record<string, unknown>
): { passed: boolean; hardPassed: boolean; c4Passed: boolean; conditions: ExportCondition[] } {
  const borrador = data.borrador as Record<string, unknown> | undefined;

  if (!borrador) {
    return {
      passed: false,
      hardPassed: false,
      c4Passed: false,
      conditions: [
        {
          id: 'C0',
          passed: false,
          descripcion: 'No existe borrador generado por la plataforma. ' +
            'Genera el borrador en la fase Produccion antes de exportar.',
        },
      ],
    };
  }

  const metadata = borrador?.metadata as Record<string, unknown> | undefined;

  const family = templateFamily ?? 'default';
  const req = EXPORT_REQUIREMENTS[family] ?? EXPORT_DEFAULT_REQ;

  const extension = (metadata?.extension_palabras as number) ?? 0;
  const fuentesCitadas = (metadata?.fuentes_citadas as unknown[]) ?? [];
  const desactualizado = borrador?.desactualizado === true;

  // Chunk 24A: C4 usa validaciones_ip en vez del validador MP
  const validacionesIP = (data.validaciones_ip ?? []) as Array<{
    score: number; apto_para_traspaso: boolean;
  }>;
  const ultimaValidacionIP = validacionesIP.length > 0
    ? validacionesIP[validacionesIP.length - 1]
    : null;
  const c4Passed = (ultimaValidacionIP?.score ?? 0) >= 3.5;
  const c4Actual = ultimaValidacionIP
    ? ultimaValidacionIP.score.toFixed(1)
    : 'sin validacion IP';

  const conditions: ExportCondition[] = [
    {
      id: 'C1',
      passed: extension >= req.min_palabras,
      descripcion: `Borrador debe tener al menos ${req.min_palabras} palabras (actual: ${extension})`,
    },
    {
      id: 'C2',
      passed: fuentesCitadas.length >= 1,
      descripcion: `Borrador debe citar al menos 1 fuente del ODF (actual: ${fuentesCitadas.length})`,
    },
    {
      id: 'C3',
      passed: !desactualizado,
      descripcion: 'El borrador debe estar actualizado respecto a las fuentes del ODF',
    },
    {
      id: 'C4',
      passed: c4Passed,
      descripcion: `Validacion IP con score >= 3.5 recomendada (actual: ${c4Actual})`,
      soft: true,
    },
  ];

  const hardConditions = conditions.filter((c) => !c.soft);
  const hardPassed = hardConditions.every((c) => c.passed);

  return {
    passed: hardPassed && c4Passed,
    hardPassed,
    c4Passed,
    conditions,
  };
}

// ── Pipeline: orden válido de estados ────────────────
const PIPELINE_ORDER = [
  'draft',
  'validacion',
  'hito_1',
  'pesquisa',
  'produccion',
  'revision',
  'aprobado',
  'visual',
  'exportado',
] as const;

type PipelineStatus = (typeof PIPELINE_ORDER)[number];

// ── Fases InvestigaPress (sin marca) ─────────────────
const IP_PHASES: PipelineStatus[] = ['draft', 'validacion', 'hito_1', 'pesquisa'];

// ── Helper: buscar project por UUID o publicId ───────
async function findProject(idParam: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);

  const condition = isUuid
    ? eq(projects.id, idParam)
    : eq(projects.publicId, idParam);

  // LEFT JOIN: tenant y template pueden ser null en fase InvestigaPress
  const rows = await db
    .select({
      id: projects.id,
      publicId: projects.publicId,
      title: projects.title,
      status: projects.status,
      thesis: projects.thesis,
      classification: projects.classification,
      brandVariant: projects.brandVariant,
      data: projects.data,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      tenantId: projects.tenantId,
      templateId: projects.templateId,
      tenantSlug: tenants.slug,
      tenantName: tenants.name,
      tenantSystemPrompt: tenants.systemPromptBase,
      templateSlug: templates.slug,
      templateName: templates.name,
      templateFamily: templates.family,
      templatePrefix: templates.idPrefix,
      templateReviewLevel: templates.reviewLevel,
      editorId: projects.editorId,
      editorNombre: editoresAgenda.nombre,
      editorApellido: editoresAgenda.apellido,
      editorMedio: editoresAgenda.medio,
    })
    .from(projects)
    .leftJoin(tenants, eq(projects.tenantId, tenants.id))
    .leftJoin(templates, eq(projects.templateId, templates.id))
    .leftJoin(editoresAgenda, eq(projects.editorId, editoresAgenda.id))
    .where(condition)
    .limit(1);

  return rows[0] ?? null;
}

// ── GET: Detalle de un project ───────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await findProject(id);

    if (!project) {
      return NextResponse.json(
        { error: `Project no encontrado: ${id}` },
        { status: 404 }
      );
    }

    // No exponer systemPrompt en la respuesta (propiedad intelectual)
    const { tenantSystemPrompt, ...safeProject } = project;

    // Determinar fase actual: InvestigaPress o MetricPress
    const isIPPhase = IP_PHASES.includes(project.status as PipelineStatus);

    return NextResponse.json({
      project: {
        ...safeProject,
        phase: isIPPhase ? 'investigapress' : 'metricpress',
        hasTenant: !!project.tenantId,
        hasTemplate: !!project.templateId,
        pipelineIndex: PIPELINE_ORDER.indexOf(project.status as PipelineStatus),
        pipelineTotal: PIPELINE_ORDER.length,
        pipelinePhases: PIPELINE_ORDER,
      },
    });
  } catch (error) {
    console.error('[GET /api/projects/[id]] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    );
  }
}

// ── PATCH: Actualizar project ────────────────────────
interface PatchBody {
  action?: 'advance' | 'retreat';
  data?: Record<string, unknown>;
  // Traspaso IP→MP: asignar tenant y template
  tenantSlug?: string;
  templateSlug?: string;
  brandVariant?: string;
  // Soft gate C4: operador confirma exportar sin score suficiente
  c4Acknowledged?: boolean;
  // Chunk 28: asignacion de editor al proyecto (null = desasignar)
  editorId?: string | null;
  // Chunk 31C-2: edicion del enunciado en fase draft. Si cambian title
  // o thesis y existe data.gate_1a, se archiva el ultimoResultado al
  // historial y se resetea el estado del gate a 'pendiente' atomicamente.
  title?: string;
  thesis?: string | null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await findProject(id);

    if (!project) {
      return NextResponse.json(
        { error: `Project no encontrado: ${id}` },
        { status: 404 }
      );
    }

    const body: PatchBody = await request.json();
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    // ── Chunk 28: asignacion de editor ──
    if (body.editorId !== undefined) {
      if (body.editorId === null) {
        updates.editorId = null;
      } else if (typeof body.editorId === 'string' && body.editorId.length > 0) {
        const [editor] = await db
          .select({ id: editoresAgenda.id })
          .from(editoresAgenda)
          .where(eq(editoresAgenda.id, body.editorId))
          .limit(1);

        if (!editor) {
          return NextResponse.json(
            { error: `Editor no encontrado: ${body.editorId}` },
            { status: 404 }
          );
        }
        updates.editorId = editor.id;
      }
    }

    // ── Chunk 31C-2: edicion de title / thesis con auto-reset del Gate 1a ──
    // El enunciado del proyecto (title + thesis) se puede editar desde
    // la fase draft (tipicamente tras correccion sugerida por el Gate 1a).
    // Cuando cambia el enunciado y existe data.gate_1a, archivamos el
    // ultimoResultado al historial y reseteamos el estado a 'pendiente'
    // atomicamente, de modo que el hard gate GATE_1A_REQUIRED vuelva a
    // bloquear el avance hasta re-ejecucion y re-aprobacion contra el
    // enunciado nuevo.
    //
    // Solo permitimos editar title / thesis en fase draft. En fases
    // posteriores el enunciado es inmutable (el borrador y las fuentes
    // del expediente dependen de el).
    let enunciadoCambio = false;
    if (body.title !== undefined || body.thesis !== undefined) {
      if (project.status !== 'draft') {
        return NextResponse.json(
          {
            error: 'El titulo y la tesis solo se pueden editar en fase Borrador (draft). Retrocede el pipeline si necesitas corregir el enunciado.',
            code: 'ENUNCIADO_INMUTABLE',
          },
          { status: 400 }
        );
      }

      if (body.title !== undefined) {
        const nuevoTitle = String(body.title).trim();
        if (nuevoTitle.length === 0) {
          return NextResponse.json(
            { error: 'El titulo no puede quedar vacio.' },
            { status: 400 }
          );
        }
        if (nuevoTitle.length > 500) {
          return NextResponse.json(
            { error: 'El titulo supera el maximo de 500 caracteres.' },
            { status: 400 }
          );
        }
        if (nuevoTitle !== project.title) {
          updates.title = nuevoTitle;
          enunciadoCambio = true;
        }
      }

      if (body.thesis !== undefined) {
        const nuevaThesis = body.thesis === null ? null : String(body.thesis).trim();
        const thesisActual = project.thesis ?? null;
        const thesisNormalizada = nuevaThesis === '' ? null : nuevaThesis;
        if (thesisNormalizada !== thesisActual) {
          updates.thesis = thesisNormalizada;
          enunciadoCambio = true;
        }
      }
    }

    // ── Traspaso: asignar tenant + template ──
    if (body.tenantSlug) {
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.slug, body.tenantSlug))
        .limit(1);

      if (!tenant) {
        return NextResponse.json(
          { error: `Tenant no encontrado: ${body.tenantSlug}` },
          { status: 404 }
        );
      }
      updates.tenantId = tenant.id;

      if (body.brandVariant !== undefined) {
        updates.brandVariant = body.brandVariant || null;
      }
    }

    if (body.templateSlug) {
      const [template] = await db
        .select()
        .from(templates)
        .where(eq(templates.slug, body.templateSlug))
        .limit(1);

      if (!template) {
        return NextResponse.json(
          { error: `Plantilla no encontrada: ${body.templateSlug}` },
          { status: 404 }
        );
      }
      updates.templateId = template.id;
      updates.classification = template.defaultClassification;
    }

    // ── Regenerar publicId si se asignaron AMBOS (traspaso completo) ──
    if (body.tenantSlug && body.templateSlug) {
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.slug, body.tenantSlug))
        .limit(1);
      const [template] = await db
        .select()
        .from(templates)
        .where(eq(templates.slug, body.templateSlug))
        .limit(1);

      if (tenant && template) {
        const year = new Date().getFullYear();
        const prefix = `${tenant.slug.toUpperCase()}-${template.idPrefix}-${year}-`;
        const [existing] = await db
          .select({ count: count() })
          .from(projects)
          .where(like(projects.publicId, `${prefix}%`));
        const nextNumber = (Number(existing.count) + 1).toString().padStart(4, '0');
        updates.publicId = `${prefix}${nextNumber}`;
      }
    }

    // ── Avanzar/retroceder pipeline ──
    if (body.action) {
      const currentIndex = PIPELINE_ORDER.indexOf(project.status as PipelineStatus);

      if (body.action === 'advance') {
        if (currentIndex >= PIPELINE_ORDER.length - 1) {
          return NextResponse.json(
            { error: 'El project ya está en el estado final (exportado)' },
            { status: 400 }
          );
        }

        const nextStatus = PIPELINE_ORDER[currentIndex + 1];

        // ── Chunk 31C-1: Gate 1a — no avanzar a validacion sin supuestos factuales aprobados ──
        // El operador debe haber ejecutado la Revision de supuestos en
        // fase draft y aprobado el veredicto antes de poder generar
        // hipotesis. Motivado por el hallazgo A del Chunk 31: sin gate
        // de auditoria pre-pesquisa, un enunciado con supuestos
        // factuales erroneos contamina todo el pipeline aguas abajo.
        if (nextStatus === 'validacion') {
          const currentData = (project.data as Record<string, unknown> | null) ?? {};
          const gate1a = currentData.gate_1a as Record<string, unknown> | undefined;
          if (!gate1a || gate1a.estado !== 'aprobado') {
            return NextResponse.json(
              {
                error: 'Debes completar la Revision de supuestos factuales antes de generar hipotesis. Ejecuta el Gate 1a en la fase Borrador y aprueba el veredicto.',
                code: 'GATE_1A_REQUIRED',
              },
              { status: 400 }
            );
          }
        }

        // ── Chunk 31D: no avanzar a hito_1 sin hipótesis elegida ──
        if (nextStatus === 'hito_1') {
          const currentData = (project.data as Record<string, unknown> | null) ?? {};
          const hipotesisElegida = currentData.hipotesis_elegida;
          if (!hipotesisElegida || typeof hipotesisElegida !== 'object') {
            return NextResponse.json(
              {
                error: 'Debes elegir una hipotesis antes de avanzar al Hito 1. Vuelve al Generador de Hipotesis y selecciona una del listado.',
                code: 'HIPOTESIS_ELEGIDA_REQUIRED',
              },
              { status: 400 }
            );
          }
        }

        // ── Chunk 31D: no avanzar a pesquisa sin aprobar el Hito 1 ──
        if (nextStatus === 'pesquisa') {
          const currentData = (project.data as Record<string, unknown> | null) ?? {};
          const hito1 = currentData.hito_1 as Record<string, unknown> | undefined;
          if (!hito1 || hito1.estado !== 'aprobado') {
            return NextResponse.json(
              {
                error: 'Debes completar la validacion de hipotesis elegida (Hito 1) antes de abrir pesquisa. Ejecuta el Hito 1 y aprueba el veredicto correctivo.',
                code: 'HITO_1_REQUIRED',
              },
              { status: 400 }
            );
          }
        }

        // ── Chunk 31L-1: no avanzar a produccion sin fuentes en el ODF ──
        // Hard gate backend que reemplaza el soft gate (confirm frontend) previo.
        // Condicion mas basica que BORRADOR_IP_REQUIRED y TRASPASO_REQUIRED: si
        // el expediente esta vacio, ni siquiera tiene sentido generar borrador IP
        // ni hacer traspaso. Por eso se evalua primero en la transicion.
        if (nextStatus === 'produccion') {
          const mergedDataForFuentes = ((updates.data ?? project.data) ?? {}) as Record<string, unknown>;
          const fuentes = Array.isArray(mergedDataForFuentes.fuentes)
            ? (mergedDataForFuentes.fuentes as unknown[])
            : [];
          if (fuentes.length === 0) {
            return NextResponse.json(
              {
                error: 'Necesitas al menos una fuente en el expediente (ODF) para avanzar a Produccion.',
                code: 'FUENTES_REQUIRED',
              },
              { status: 400 }
            );
          }
        }

        // ── Chunk 18C: no avanzar a produccion sin borrador IP ──
        if (nextStatus === 'produccion') {
          const mergedDataForIP = ((updates.data ?? project.data) ?? {}) as Record<string, unknown>;
          if (!mergedDataForIP.borrador_ip) {
            return NextResponse.json(
              {
                error: 'Debes generar el Documento de Investigacion en la fase Pesquisa antes de traspasar a MetricPress',
                code: 'BORRADOR_IP_REQUIRED',
              },
              { status: 400 }
            );
          }
        }

        // ── BLOQUEO: no avanzar a produccion sin tenant+template ──
        if (nextStatus === 'produccion') {
          // Verificar si ya tiene tenant+template (puede venir en este mismo PATCH o ya estar asignado)
          const willHaveTenant = updates.tenantId || project.tenantId;
          const willHaveTemplate = updates.templateId || project.templateId;

          if (!willHaveTenant || !willHaveTemplate) {
            return NextResponse.json(
              {
                error: 'Traspaso requerido: para avanzar a Producción necesitás asignar tenant y template (traspaso InvestigaPress → MetricPress)',
                code: 'TRASPASO_REQUIRED',
              },
              { status: 400 }
            );
          }
        }

        // ── Chunk 18A: hard block para exportar sin cumplir requisitos ──
        if (nextStatus === 'exportado') {
          const mergedData = ((updates.data ?? project.data) ?? {}) as Record<string, unknown>;
          const gate = evaluateExportGate(project.templateFamily, mergedData);

          // C1-C3 son hard blocks — siempre bloquean
          if (!gate.hardPassed) {
            return NextResponse.json(
              {
                error: 'El proyecto no cumple los requisitos minimos para exportar',
                code: 'EXPORT_GATE_FAILED',
                conditions: gate.conditions,
              },
              { status: 400 }
            );
          }

          // C4 es soft gate — bloquea solo si no fue acknowledged
          if (!gate.c4Passed) {
            if (body.c4Acknowledged === true) {
              console.warn(
                `[PATCH /api/projects/${id}] Export con C4 acknowledged — score IP insuficiente, operador confirmo`
              );
            } else {
              return NextResponse.json(
                {
                  error: 'Validacion IP con score insuficiente. Confirma para exportar.',
                  code: 'C4_ACK_REQUIRED',
                  conditions: gate.conditions,
                },
                { status: 400 }
              );
            }
          }
        }

        updates.status = nextStatus;
      } else if (body.action === 'retreat') {
        if (currentIndex <= 0) {
          return NextResponse.json(
            { error: 'El project ya está en el estado inicial (draft)' },
            { status: 400 }
          );
        }
        updates.status = PIPELINE_ORDER[currentIndex - 1];
      }
    }

    // ── Merge de data (no reemplaza, mergea al nivel raíz) ──
    if (body.data && typeof body.data === 'object') {
      const currentData = (project.data as Record<string, unknown>) ?? {};
      updates.data = { ...currentData, ...body.data };
    }

    // ── Chunk 31C-2: auto-archivo del Gate 1a cuando el enunciado cambio ──
    // Si title o thesis cambiaron y existe data.gate_1a con ultimoResultado,
    // archivamos el ultimoResultado al historial y reseteamos el estado a
    // 'pendiente'. Esto es atomico: al mismo PATCH que cambia el enunciado
    // le corresponde la invalidacion del veredicto previo.
    if (enunciadoCambio) {
      const baseData =
        (updates.data as Record<string, unknown> | undefined) ??
        ((project.data as Record<string, unknown>) ?? {});
      const gate1aActual = baseData.gate_1a as Record<string, unknown> | undefined;

      if (gate1aActual) {
        const historialPrevio = Array.isArray(gate1aActual.historial)
          ? (gate1aActual.historial as Array<Record<string, unknown>>)
          : [];
        const ultimoResultado = gate1aActual.ultimoResultado as Record<string, unknown> | null | undefined;

        const nuevoHistorial = ultimoResultado
          ? [...historialPrevio, ultimoResultado]
          : historialPrevio;

        const gate1aReseteado = {
          estado: 'pendiente',
          ultimoResultado: null,
          aprobadoEn: null,
          historial: nuevoHistorial,
        };

        updates.data = {
          ...baseData,
          gate_1a: gate1aReseteado,
        };
      }
    }

    // ── Chunk 31D: auto-archivo del Hito 1 cuando cambia la hipótesis elegida ──
    // Si el PATCH toca data.hipotesis_elegida (eleccion nueva o cambio a null
    // via handleCambiarEleccion) y existe data.hito_1 con ultimoResultado,
    // archivamos ultimoResultado en historial[] y reseteamos estado a
    // 'pendiente'. Patrón atomico equivalente al auto-reset del gate_1a
    // (Chunk 31C-2): es imposible que el Hito 1 quede aprobado contra una
    // hipotesis que ya cambio.
    const hipotesisCambio =
      body.data &&
      typeof body.data === 'object' &&
      'hipotesis_elegida' in (body.data as Record<string, unknown>);

    if (hipotesisCambio) {
      const baseData =
        (updates.data as Record<string, unknown> | undefined) ??
        ((project.data as Record<string, unknown>) ?? {});
      const hito1Actual = baseData.hito_1 as Record<string, unknown> | undefined;

      if (hito1Actual) {
        const historialPrevio = Array.isArray(hito1Actual.historial)
          ? (hito1Actual.historial as Array<Record<string, unknown>>)
          : [];
        const ultimoResultado = hito1Actual.ultimoResultado as Record<string, unknown> | null | undefined;

        const nuevoHistorial = ultimoResultado
          ? [...historialPrevio, ultimoResultado]
          : historialPrevio;

        const hito1Reseteado = {
          estado: 'pendiente',
          ultimoResultado: null,
          aprobadoEn: null,
          historial: nuevoHistorial,
        };

        updates.data = {
          ...baseData,
          hito_1: hito1Reseteado,
        };
      }
    }

    // ── Auto-promoción VHP → ODF (transición validacion → pesquisa) ──
    // Cuando el operador avanza de validacion a pesquisa, recorremos
    // data.validaciones_hipotesis[] y promovemos a data.fuentes[] cada
    // validación con veredicto viable o viable_con_reservas que aún no
    // haya sido promovida. Las marcamos con promovida_a_fuente = true.
    let fuentesPromovidasCount = 0;
    if (
      body.action === 'advance' &&
      (project.status as PipelineStatus) === 'validacion'
    ) {
      // Trabajamos sobre el data ya mergeado, si existe; si no, sobre el actual
      const baseData =
        (updates.data as Record<string, unknown> | undefined) ??
        ((project.data as Record<string, unknown>) ?? {});

      const validaciones = Array.isArray(baseData.validaciones_hipotesis)
        ? (baseData.validaciones_hipotesis as Array<Record<string, unknown>>)
        : [];

      const fuentesActuales = Array.isArray(baseData.fuentes)
        ? (baseData.fuentes as Array<Record<string, unknown>>)
        : [];

      if (validaciones.length > 0) {
        const nuevasFuentes: Array<Record<string, unknown>> = [];

        const validacionesActualizadas = validaciones.map((v) => {
          if (v.promovida_a_fuente === true) return v;

          const ai = (v.ai_response as Record<string, unknown>) ?? {};
          const veredicto = String(ai.veredicto ?? '');
          const esViable =
            veredicto === 'viable' || veredicto === 'viable_con_reservas';
          if (!esViable) return v;

          const lead = (v.lead_input as Record<string, unknown>) ?? {};
          const tipoLeadRaw = String(lead.tipo ?? '');
          const tipoFuente: 'persona' | 'documento' | 'dato' | 'testimonio' =
            tipoLeadRaw === 'persona'
              ? 'persona'
              : tipoLeadRaw === 'documento'
                ? 'documento'
                : tipoLeadRaw === 'dato_publico'
                  ? 'dato'
                  : tipoLeadRaw === 'testimonio'
                    ? 'testimonio'
                    : 'documento';

          const confianzaFuente: 'baja' | 'media' | 'alta' =
            veredicto === 'viable' ? 'alta' : 'media';

          const descripcion = String(lead.descripcion ?? '').trim();
          const acceso = String(lead.acceso ?? '');
          const nombreCorto =
            descripcion.length > 120
              ? descripcion.slice(0, 117).trim() + '...'
              : descripcion || 'Lead promovido desde VHP';

          const validacionId = typeof v.id === 'string' ? v.id : '';

          const nuevaFuente: Record<string, unknown> = {
            id: globalThis.crypto.randomUUID(),
            tipo: tipoFuente,
            nombre_titulo: nombreCorto,
            rol_origen: `Promovido desde VHP — acceso ${acceso || 'no declarado'}`,
            estado: 'por_contactar',
            confianza: confianzaFuente,
            notas: String(lead.notas ?? ''),
            fecha_registro: new Date().toISOString(),
            origen: 'vhp',
            origen_validacion_id: validacionId,
          };

          nuevasFuentes.push(nuevaFuente);
          return { ...v, promovida_a_fuente: true };
        });

        if (nuevasFuentes.length > 0) {
          fuentesPromovidasCount = nuevasFuentes.length;
          updates.data = {
            ...baseData,
            validaciones_hipotesis: validacionesActualizadas,
            fuentes: [...fuentesActuales, ...nuevasFuentes],
          };
        }
      }
    }

    // Chunk 12C: auto-invalidacion del borrador cuando se cargan fuentes nuevas
    // al ODF. Si el borrador existe y la cantidad de fuentes aumento respecto al
    // estado anterior, marcamos el borrador como desactualizado.
    if (updates.data && typeof updates.data === 'object') {
      const mergedData = updates.data as Record<string, unknown>;
      const currentData = (project.data as Record<string, unknown>) ?? {};
      const fuentesAntes = Array.isArray(currentData.fuentes)
        ? (currentData.fuentes as unknown[]).length
        : 0;
      const fuentesDespues = Array.isArray(mergedData.fuentes)
        ? (mergedData.fuentes as unknown[]).length
        : 0;
      const borradorExiste =
        mergedData.borrador != null && typeof mergedData.borrador === 'object';

      if (borradorExiste && fuentesDespues > fuentesAntes) {
        mergedData.borrador = {
          ...(mergedData.borrador as Record<string, unknown>),
          desactualizado: true,
        };
      }
    }

    // Ejecutar update
    const [updated] = await db
      .update(projects)
      .set(updates)
      .where(eq(projects.id, project.id))
      .returning();

    const isIPPhase = IP_PHASES.includes(updated.status as PipelineStatus);

    return NextResponse.json({
      success: true,
      project: {
        id: updated.id,
        publicId: updated.publicId,
        status: updated.status,
        data: updated.data,
        classification: updated.classification,
        updatedAt: updated.updatedAt,
        editorId: updated.editorId,
        phase: isIPPhase ? 'investigapress' : 'metricpress',
        hasTenant: !!updated.tenantId,
        hasTemplate: !!updated.templateId,
        pipelineIndex: PIPELINE_ORDER.indexOf(updated.status as PipelineStatus),
        pipelineTotal: PIPELINE_ORDER.length,
      },
      fuentes_promovidas_count: fuentesPromovidasCount,
    });
  } catch (error) {
    console.error('[PATCH /api/projects/[id]] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    );
  }
}
