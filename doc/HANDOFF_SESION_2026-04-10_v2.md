# IP+MP PLATFORM — HANDOFF DE SESIÓN
## Fecha: 10 de abril de 2026 — Cierre Chunk 4 + Decisión Arquitectónica

---

## CONTEXTO DEL OPERADOR

Soy Cristian Jofré Donoso, periodista chileno, máster en marketing digital y analítica, fundador de Expande Digital Consultores SpA. Mi rol es Operador Técnico AI-Augmented: yo orquesto (subir, bajar, renombrar, pushear, deployar), Claude produce todo el código. No toco código. Estoy en Chile, trabajo en Windows con PowerShell desde `C:\ipmp-platform\`.

## ESTILO DE TRABAJO (MANTENER EN PRÓXIMA SESIÓN)

- Claude actúa como CTO virtual: produce archivos completos listos para descargar
- Instrucciones paso a paso, una acción a la vez, con validación visual entre cada paso
- Tono directo, sin rodeos, técnicamente preciso pero accesible
- Cuando hay error, se diagnostica rápido y se da la solución concreta
- PowerShell viejo (Windows 5.x): no soporta `utf8NoBOM`, usar `[System.IO.File]::WriteAllText()` para archivos JSON
- Tres consolas PowerShell: dev server, git, y general
- Build local (`npm run build`) antes de cada push para atrapar errores
- Los archivos se descargan del chat y se colocan manualmente en las rutas indicadas

---

## PROYECTO: IP+MP Platform

Pipeline de investigación periodística (InvestigaPress) + producción de contenido medible (MetricPress) con IA. Herramienta interna del holding para producir activos comunicacionales de calidad institucional.

### DESCUBRIMIENTO CLAVE DE ESTA SESIÓN

InvestigaPress y MetricPress son dos fases distintas del mismo pipeline, NO dos sistemas separados:

- **InvestigaPress** = Fase de preparación estratégica. Opera SIN marca (tenant). Periodismo limpio y objetivo. Herramientas: Generador de Ángulos, Validador de Tono, Constructor de Pitch.
- **MetricPress** = Fase de ejecución y producción. Opera CON marca (tenant + template). Produce el contenido final adaptado + insumos técnicos (UTM, Schema, keywords, píxeles). Entrega el reportaje terminado listo para publicación.

**Flujo correcto:** Tesis → InvestigaPress (investiga sin sesgo) → Traspaso (elige marca + formato) → MetricPress (produce y mide).

---

## STACK DESPLEGADO

| Componente | Tecnología | Estado |
|---|---|---|
| Framework | Next.js 16.2.3 (App Router, Turbopack) | ✅ Deployed |
| Lenguaje | TypeScript | ✅ |
| Base de datos | PostgreSQL (Railway, plan Hobby) | ✅ Online |
| ORM | Drizzle ORM | ✅ |
| Estilos | Tailwind CSS (paleta: oxford-blue, space-cadet, amber-brand, seasalt, davy-gray) | ✅ |
| Hosting frontend | Vercel (plan Hobby) | ✅ Deployed |
| IA | Anthropic Claude API (Sonnet 4) | ✅ Activa |
| SDK | @anthropic-ai/sdk | ✅ Instalado |
| Repositorio | github.com/ExpandeDigital/ipmp-platform (privado) | ✅ |

**URLs de producción**:
- App: https://ipmp-platform.vercel.app
- Health: https://ipmp-platform.vercel.app/api/health

**Variables de entorno en Vercel**: `DATABASE_URL`, `ADMIN_TOKEN`, `ANTHROPIC_API_KEY` — las tres en All Environments.

**Créditos API**: ~USD 4.93 restantes de USD 5.00 iniciales.

---

## ESTRUCTURA DE ARCHIVOS (POST CHUNK 4)

```
C:\ipmp-platform\
├── src/
│   ├── app/
│   │   ├── page.tsx                          ← Dashboard del Operador
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   ├── api/
│   │   │   ├── admin/init/                   ← POST seed de tenants + templates
│   │   │   ├── health/                       ← GET health check
│   │   │   ├── ai/generate/route.ts          ← POST generación IA
│   │   │   └── projects/
│   │   │       ├── route.ts                  ← GET listar + POST crear projects
│   │   │       └── [id]/
│   │   │           └── route.ts              ← GET detalle + PATCH status/data (CHUNK 4)
│   │   ├── tools/
│   │   │   ├── layout.tsx
│   │   │   └── angulos/
│   │   │       ├── page.tsx
│   │   │       └── AngulosClient.tsx
│   │   └── projects/
│   │       ├── page.tsx                      ← Lista de Projects
│   │       ├── ProjectsClient.tsx
│   │       ├── new/
│   │       │   ├── page.tsx
│   │       │   └── NewProjectClient.tsx
│   │       └── [id]/
│   │           ├── page.tsx                  ← Detalle Project (CHUNK 4)
│   │           └── ProjectDetailClient.tsx   ← Pipeline + Ángulos integrados (CHUNK 4)
│   ├── components/
│   │   └── Nav.tsx
│   ├── db/
│   │   ├── index.ts
│   │   ├── schema.ts                        ← 8 tablas Drizzle
│   │   ├── init-sql.ts
│   │   └── seed-data.ts                     ← 7 tenants + 13 templates
│   └── lib/
│       └── ai/
│           ├── provider.ts                   ← Capa abstracción modelo
│           ├── prompts.ts                    ← REQUIERE REFACTORIZACIÓN (ver abajo)
│           └── usage-tracker.ts
├── doc/
│   └── HANDOFF_SESION_2026-04-10.md
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── next.config.ts
```

---

## LO QUE FUNCIONA EN PRODUCCIÓN

### Chunks 1-3 (completados antes de esta sesión)
- Capa de IA completa (provider, prompts, usage-tracker, endpoint)
- Dashboard del Operador
- Generador de Ángulos standalone en `/tools/angulos`
- Flujo de Projects: crear, listar, filtrar
- Nav con links a Dashboard, Projects, Generador

### Chunk 4 (completado en esta sesión)
- **API GET `/api/projects/[id]`** — detalle completo con joins, acepta UUID o publicId
- **API PATCH `/api/projects/[id]`** — avanzar/retroceder pipeline + merge de data
- **Vista `/projects/[id]`** — pipeline visual interactivo 8 fases con botones avanzar/retroceder
- **Generador de Ángulos integrado** en project detail (usa tenant+template automático, guarda en `data.angulos`)
- **Parsing defensivo** de ángulos con normalización de tiers (tier1_nacional→S, etc.) y manejo seguro de objetos en campo riesgo
- **Test exitoso**: 7 ángulos generados para DREAMOMS-RP-2026-0001 ("Impacto de la IA en el control prenatal en Chile")

---

## BASE DE DATOS (8 TABLAS)

| Tabla | Registros | Notas |
|---|---|---|
| tenants | 7 | metricpress, investigapress, dreamoms, never-alone-again, decero-a-cien, expande-digital, codigo-maestro-soberano |
| templates | 13 | 13 géneros periodísticos |
| projects | 1+ | DREAMOMS-RP-2026-0001 (status: validacion, data.angulos con 7 ángulos) |
| users | 0 | Pendiente |
| assets | 0 | Pendiente |
| revisions | 0 | Pendiente |
| exports | 0 | Pendiente |
| consumption_logs | 3+ | Registros de llamadas IA |

---

## SIGUIENTE: REFACTORIZACIÓN ARQUITECTÓNICA

### Decisión tomada: evolucionar, no refactorizar desde cero

Todo lo construido se mantiene. Los cambios son quirúrgicos:

### 1. Project nace solo con tesis (sin tenant/template obligatorio)
- **Archivo:** `src/db/schema.ts` — hacer `tenantId` y `templateId` nullable
- **Archivo:** `src/app/api/projects/route.ts` (POST) — aceptar creación sin tenant/template
- **Archivo:** `src/app/projects/new/NewProjectClient.tsx` — formulario simplificado: solo título + tesis
- **PublicId temporal:** `IP-AÑO-XXXX` (sin prefix de tenant)

### 2. Fases 1-3 son InvestigaPress (sin marca)
- **Archivo:** `src/lib/ai/prompts.ts` — reescribir `buildAngulosPrompt()` SIN contexto de tenant. Periodismo puro.
- **Agregar:** `buildValidadorTonoPrompt()` completo (reemplazar placeholder)
- **Agregar:** `buildConstructorPitchPrompt()` completo (reemplazar placeholder)
- **UI:** Generador de Ángulos con 3 campos (tema, audiencia, dato clave)
- **UI:** Validador de Tono como segunda herramienta en el project detail
- **UI:** Constructor de Pitch como tercera herramienta en el project detail

### 3. Traspaso InvestigaPress → MetricPress al avanzar a Producción
- **Archivo:** `src/app/projects/[id]/ProjectDetailClient.tsx` — cuando `action: 'advance'` y status pasa de `pesquisa` a `produccion`, mostrar modal/paso intermedio para elegir tenant + template
- **Archivo:** `src/app/api/projects/[id]/route.ts` — PATCH acepta `tenantId` + `templateId` como campos actualizables
- **PublicId se actualiza:** de `IP-2026-0001` a `DREAMOMS-RP-2026-0001`

### 4. Fases 4-8 son MetricPress (con marca)
- Sin cambios necesarios por ahora — la infraestructura ya soporta esto

### Mejoras al prompt del Generador de Ángulos (aprobadas)
- Rol: periodista investigativo puro (no comunicador de marca)
- 5 lentes de noticiabilidad (interés humano, impacto, conflicto, novedad, proximidad)
- 3-5 ángulos (no 5-8)
- Campos nuevos: `tipo` (noticia/análisis/opinión/contenido_marca), `verificacion` (hipotesis/dato_referencial/requiere_pesquisa), `pregunta_clave`
- Fuentes como cargo + institución + país
- Regla anti-fabricación explícita
- Contrapunto obligatorio (al menos 1 ángulo crítico)
- Separación editorial: noticia vs contenido de marca
- Blindaje dinámico por tenant (se inyecta en fase MetricPress, no en InvestigaPress)

---

## DOCUMENTOS DE REFERENCIA CARGADOS EN ESTA SESIÓN

1. `esto_es_lo_que_hace_investigapress.docx` — Describe las 3 herramientas IP: Ángulos, Validador Tono, Constructor Pitch
2. `esto_es_lo_que_hace_metricpress.docx` — Describe las 11 herramientas MP + flujo de traspaso + formato de entrega final

---

## REGLAS DE BLINDAJE (RECORDATORIO)

- Tenant codigo-maestro-soberano: NUNCA mencionar a Ignacio en outputs
- Asesoría Legislativa: toda referencia normativa con [VERIFICAR]
- API key nunca en frontend ni en chat
- Prompts y metodología = propiedad intelectual / secreto comercial de Expande Digital

---

*Documento interno — Expande Digital Consultores SpA*
