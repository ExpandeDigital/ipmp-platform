# IP+MP PLATFORM — HANDOFF DE SESIÓN
## Fecha: 10 de abril de 2026 — Cierre Fase 1 Chunks 1-3

---

## CONTEXTO DEL OPERADOR

Soy Cristian Jofré Donoso, periodista chileno, máster en marketing digital y analítica, fundador de Expande Digital Consultores SpA. Mi rol es Operador Técnico AI-Augmented: yo orquesto (subir, bajar, renombrar, pushear, deployar), vos producís todo el código. No toco código. Estoy en Chile, trabajo en Windows con PowerShell desde `C:\ipmp-platform\`.

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

**Créditos API**: ~USD 4.97 restantes de USD 5.00 iniciales.

---

## ESTRUCTURA DE ARCHIVOS (POST CHUNKS 1-3)

```
C:\ipmp-platform\
├── src/
│   ├── app/
│   │   ├── page.tsx                          ← Dashboard del Operador (v0.2.0 Fase 1)
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   ├── api/
│   │   │   ├── admin/init/                   ← POST seed de tenants + templates
│   │   │   ├── health/                       ← GET health check
│   │   │   ├── ai/generate/route.ts          ← POST generación IA (Chunk 1)
│   │   │   └── projects/route.ts             ← GET listar + POST crear projects (Chunk 3)
│   │   ├── tools/
│   │   │   ├── layout.tsx
│   │   │   └── angulos/
│   │   │       ├── page.tsx                  ← Generador de Ángulos (Chunk 2)
│   │   │       └── AngulosClient.tsx
│   │   └── projects/
│   │       ├── page.tsx                      ← Lista de Projects (Chunk 3)
│   │       ├── ProjectsClient.tsx
│   │       └── new/
│   │           ├── page.tsx                  ← Crear nuevo Project (Chunk 3)
│   │           └── NewProjectClient.tsx
│   ├── components/
│   │   └── Nav.tsx                           ← Navegación (Dashboard, Projects, Ángulos)
│   ├── db/
│   │   ├── index.ts                          ← Cliente DB con lazy singleton
│   │   ├── schema.ts                         ← 8 tablas Drizzle
│   │   ├── init-sql.ts
│   │   └── seed-data.ts                      ← 7 tenants + 13 templates
│   └── lib/
│       └── ai/
│           ├── provider.ts                   ← Capa abstracción modelo (Chunk 1)
│           ├── prompts.ts                    ← System prompts por herramienta (Chunk 1)
│           └── usage-tracker.ts              ← Logger consumo API (Chunk 1)
├── doc/
│   └── IP_MP_ESTADO_MAESTRO.md
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── next.config.ts
```

---

## LO QUE FUNCIONA EN PRODUCCIÓN

### Chunk 1 — Capa de IA
- `lib/ai/provider.ts`: singleton Anthropic, función `generate()` agnóstica de proveedor, `estimateCostUsd()`
- `lib/ai/prompts.ts`: registry de prompts por herramienta, `buildAngulosPrompt()` completo, placeholders para validador_tono y constructor_pitch
- `lib/ai/usage-tracker.ts`: registra cada llamada en tabla `consumption_logs` con costo estimado
- `/api/ai/generate`: endpoint POST seguro, valida tenant+template en DB, construye prompt, llama a Claude, loguea consumo, devuelve JSON

### Chunk 2 — Interfaz Visual
- Dashboard del Operador: estado del sistema (DB, tenants, templates, llamadas IA), grid de herramientas (Ángulos activa, 3 placeholders)
- Generador de Ángulos: selector de tenant + template, textarea de tema, genera 5-8 ángulos con tier/gancho/audiencia/tono/riesgo/fuentes, nota editorial
- Nav: barra superior con links a Dashboard, Projects, Generador de Ángulos

### Chunk 3 — Flujo de Projects
- `/api/projects` GET: lista projects con joins a tenants y templates
- `/api/projects` POST: crea project con publicId auto (TENANT-PREFIX-AÑO-XXXX)
- `/projects`: lista con filtros por tenant y estado, barra de pipeline visual por project
- `/projects/new`: formulario con selector de tenant (con brand variants), template (agrupado por familia), título, tesis, preview de publicId
- Primer project creado: `DREAMOMS-RP-2026-0001`

---

## BASE DE DATOS (8 TABLAS)

| Tabla | Registros | Notas |
|---|---|---|
| tenants | 7 | metricpress, investigapress, dreamoms, never-alone-again, decero-a-cien, expande-digital, codigo-maestro-soberano |
| templates | 13 | Slugs: reportaje-profundidad, nota-prensa, cronica-narrativa, entrevista, columna-opinion, editorial, carta-director, informe-tecnico, asesoria-legislativa, investigacion-forense, white-paper, minuta-ejecutiva, paper-academico |
| projects | 1+ | DREAMOMS-RP-2026-0001 creado |
| users | 0 | Pendiente |
| assets | 0 | Pendiente |
| revisions | 0 | Pendiente |
| exports | 0 | Pendiente |
| consumption_logs | 2+ | Registros de llamadas al Generador de Ángulos |

---

## SIGUIENTE: CHUNK 4

1. **Vista detalle `/projects/[id]`** — muestra project completo con pipeline visual interactivo
2. **API PATCH `/api/projects/[id]`** — avanzar/retroceder estado del project
3. **Vincular ángulos generados al project** — guardar output del Generador en el campo `data` del project
4. **Botón "Generar Ángulos" dentro del project** — que use el tenant y template del project automáticamente

## CHUNKS POSTERIORES

- Chunk 5: Segunda herramienta IA (Validador de Tono o Constructor de Pitch)
- Chunk 6: Sistema de revisión (express/profunda) antes de exportar
- Chunk 7: Exportación (los 5 botones de destino)

---

## REGLAS DE BLINDAJE (RECORDATORIO)

- Tenant codigo-maestro-soberano: NUNCA mencionar a Ignacio en outputs
- Asesoría Legislativa: toda referencia normativa con [VERIFICAR]
- API key nunca en frontend ni en chat
- Prompts y metodología = propiedad intelectual / secreto comercial de Expande Digital

---

*Documento interno — Expande Digital Consultores SpA*
