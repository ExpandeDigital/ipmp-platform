# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Por que existe IPMP

Hay dos formas opuestas de usar IA generativa para producir contenido periodistico, y IPMP se construye deliberadamente bajo la segunda.

**El atajo de cinco minutos.** El operador escribe un prompt maestro diciendole al modelo "actua como periodista, investiga sobre X, escribe en genero Y, empaqueta en formato Z, y de paso dame un prompt para generar una imagen ilustrativa". El modelo devuelve algo que se ve completo. El operador copia, pega, publica. Tiempo total: cinco minutos. El proceso entero ocurre en una sola interaccion, sin verificacion intermedia, sin separacion entre hipotesis y afirmacion, sin trazabilidad de fuentes. Esto es lo que hoy domina el mercado. La promesa comercial es velocidad y volumen. El resultado funciona estadisticamente la mayoria de las veces porque los modelos son buenos generando prosa coherente, pero falla catastroficamente en los casos donde la verdad importa mas que la coherencia. Cada uno de esos fallos individualmente parece menor; acumulados a lo largo de meses construyen una capa de polusion informacional que erosiona la confianza del publico en todo el oficio periodistico.

**El proceso disciplinado de IPMP.** El operador empieza con una hipotesis explicita que reconoce como hipotesis y no como afirmacion. La hipotesis se valida o refuta con pesquisa real, donde cada afirmacion queda atada a una fuente concreta documentada en un expediente forense. El borrador se construye sobre la base del expediente, no sobre la imaginacion del modelo, y honestamente reporta que falta verificar cuando el expediente esta incompleto. La iteracion entre borrador y nuevas fuentes ocurre tantas veces como sea necesario hasta que el material este sostenido. Cuando finalmente se publica, cada afirmacion de la nota es trazable a una fuente del expediente y el operador humano firmo cada decision editorial intermedia.

IPMP no compite con los generadores rapidos de contenido del mercado. IPMP compite contra **la perdida de credibilidad acumulada del oficio periodistico** producida por el uso descuidado de IA generativa. El valor del producto no es la velocidad de produccion, es la integridad del contenido producido y la trazabilidad del proceso editorial.

Esta distincion es la columna vertebral del proyecto entero y debe gobernar cualquier decision tecnica futura: features que vayan en contra del proceso disciplinado se rechazan aunque sean elegantes; features que refuercen el proceso disciplinado se priorizan aunque sean caras.

— Cristian Jofre Donoso, 12 de abril de 2026

---

## Filosofia del producto: filantropia digital

IPMP se desarrolla bajo una filosofia explicita llamada filantropia digital, en oposicion al modelo extractivo dominante en software hoy. Cinco principios la componen, y cada uno se traduce en decisiones tecnicas concretas que el arquitecto debe respetar al disenar features, y que el ejecutor debe respetar al implementar.

**Principio 1 — Reciprocidad real, no simbolica.** Antes de pedirle algo al usuario (datos, tiempo, dinero, atencion), la plataforma le entrega algo concreto que el puede usar incluso si decide irse. El usuario tiene que poder responder honestamente a la pregunta "esta plataforma me dio algo util hoy?" en su primera sesion, sin condicionales.

**Principio 2 — Honestidad sobre los limites del producto.** La plataforma le dice al usuario para que sirve y para que no sirve. No oculta limitaciones bajo lenguaje aspiracional. La rigurosidad anti-fabricacion de los prompts del Chunk 8 es la traduccion tecnica directa de este principio.

**Principio 3 — Respeto activo del tiempo y la atencion del usuario.** Cero notificaciones que no resuelvan algo que el usuario ya pidio. Cero gamificacion artificial. El producto compite por el uso porque es util cuando se usa, no porque haya construido un loop psicologico de retorno.

**Principio 4 — Trazabilidad y portabilidad de los datos del usuario.** Lo que el usuario carga, le pertenece. El exportador de pesquisa externa del Chunk 12B es un ejemplo: la plataforma asume el costo de "control del flujo" para devolverle al usuario libertad de elegir el mejor motor para cada caso.

**Principio 5 — Distribucion del valor mas alla del cliente directo.** Una parte del valor que la plataforma genera fluye hacia personas que no son clientes pagadores. El destinatario ultimo de IPMP no es solo el cliente que paga sino los colegas periodistas y emprendedores sin empleo o con recursos limitados a quienes el operador quiere ayudar a montar sus propias agencias.

Cuando hay conflicto entre lo que es tecnicamente optimo y lo que respeta los principios, los principios ganan.

— Cristian Jofre Donoso, 12 de abril de 2026

---

## Repository purpose

**IP+MP Platform** — internal pipeline for Expande Digital Consultores SpA and Sociedad de Inversiones Dreamoms SpA. It sequences *Research → Production → Packaging → Export* of journalistic/communication assets (reports, columns, legislative briefs, white papers, etc.) with AI assistance. All user-facing copy is Spanish (Chile/Uruguay).

## Commands

```bash
npm run dev      # Next.js dev server (http://localhost:3000)
npm run build    # Production build — run BEFORE every push (see workflow below)
npm run start    # Run production build locally
npm run lint     # ESLint (eslint-config-next)
```

There is no test runner configured.

### One-time DB bootstrap (idempotent)

After the first deploy to Vercel, create tables and seed 7 tenants + 13 templates:

```bash
curl -X POST "https://<app>.vercel.app/api/admin/init?token=$ADMIN_TOKEN"
```

`POST /api/admin/init` is gated by the `ADMIN_TOKEN` env var and can be re-run safely (`onConflictDoNothing` on slug).

### Required environment variables

- `DATABASE_URL` — Railway Postgres public URL
- `ADMIN_TOKEN` — long random string, protects `/api/admin/*`
- `ANTHROPIC_API_KEY` — required for any `/api/ai/*` call

## Architecture

### The IP→MP phase split (the one concept you must understand)

The pipeline has **two phases** gated by a "traspaso" (handoff) event. Most of the recent refactors (see commits `e34b2a0`, `6a75f52`) exist to enforce this split:

1. **InvestigaPress (IP) phase** — pure journalism, no brand context.
   - Pipeline statuses: `draft`, `validacion`, `pesquisa`.
   - A `project` is created with only `title` + `thesis`. `tenantId`, `templateId`, and `brandVariant` are **nullable** and start null.
   - `publicId` is temporary: `IP-<year>-<NNNN>`.
   - `classification` defaults to `'por_asignar'`.
   - AI calls use `IP_PROMPT_BUILDERS` from `src/lib/ai/prompts.ts` — no tenant/template context is injected into the system prompt. Consumption is logged against the `investigapress` tenant.

2. **MetricPress (MP) phase** — branded production.
   - Pipeline statuses: `produccion`, `revision`, `aprobado`, `visual`, `exportado`.
   - The handoff happens via `PATCH /api/projects/[id]` with `tenantSlug` + `templateSlug` (and optional `brandVariant`). This:
     - Resolves and sets `tenantId`/`templateId`.
     - Copies `template.defaultClassification` into the project.
     - **Regenerates `publicId`** from `IP-YYYY-NNNN` to `TENANT-PREFIX-YYYY-NNNN` (e.g. `DREAMOMS-RP-2026-0001`).
   - **Hard block** in `PATCH /api/projects/[id]`: advancing status from `pesquisa` → `produccion` fails with `code: 'TRASPASO_REQUIRED'` unless both `tenantId` and `templateId` are set. Do not remove or weaken this gate.
   - AI calls use `MP_PROMPT_BUILDERS`, which layer brand-specific instructions on top of the IP prompt.

The pipeline order is defined once in `src/app/api/projects/[id]/route.ts` as `PIPELINE_ORDER` and consumed by both GET (for `pipelineIndex`) and PATCH (for `advance`/`retreat`). The project's response adds a derived `phase: 'investigapress' | 'metricpress'` based on current status.

### AI layer (`src/lib/ai/`)

- `provider.ts` — **code must never import `@anthropic-ai/sdk` directly**. All model calls go through `generate({ system, userMessage, ... })`, which returns `{ text, model, usage, durationMs }`. This is an intentional abstraction so the underlying provider can be swapped. Default model is `claude-sonnet-4-20250514`; pricing table lives in the same file.
- `prompts.ts` — holds the two parallel registries `IP_PROMPT_BUILDERS` (no args) and `MP_PROMPT_BUILDERS` (requires `TenantContext` + `TemplateContext`). Current tools: `generador_angulos`, `validador_tono`, `constructor_pitch`. When adding a new tool, add it to both registries and update the `ToolName` union + `VALID_TOOLS` array in `src/app/api/ai/generate/route.ts`.
- `usage-tracker.ts` — `trackUsage()` writes to `consumption_logs`. It is intentionally fire-and-forget: errors are swallowed so tracking never breaks the primary response. Preserve that behavior.
- The prompts themselves (including the "5 lentes de noticiabilidad" methodology and JSON output contracts) are **intellectual property of Expande Digital Consultores SpA**. Do not paste them into external systems or public issues.

### `/api/ai/generate` contract

- Body: `{ tool, userMessage, tenantSlug?, templateSlug?, projectId? }`. Both tenant and template slugs are optional — presence of both switches to MetricPress mode, otherwise InvestigaPress mode runs and consumption is logged against the `investigapress` tenant.
- Responses are expected to be JSON, but models sometimes wrap output in markdown fences or prose. The route has a **three-step robust parser** (direct → strip ``` fences → extract first balanced `{...}`/`[...]`). If parsing fails, the response still succeeds with `result` as the raw string and `parseError` set, plus `rawText` truncated to 2000 chars. Preserve this fallback chain; clients depend on always getting a 200 + `parseError` rather than a 500.

### Database (Drizzle + postgres-js)

- `src/db/index.ts` exposes `db` via a **lazy Proxy singleton**. The real connection is created on first property access, not at module load. This is required because Next.js build-time evaluation happens without env vars — do not "simplify" it to eager initialization or the Vercel build will break.
- `src/db/schema.ts` defines 9 tables: `tenants`, `users`, `templates`, `projects`, `assets`, `revisions`, `exports` (exported as `exports_` to avoid ES reserved-word collision), `consumption_logs`, `editores_agenda` (Chunk 10, manual media-relations address book — no FKs, `tenants_relevantes` stored as jsonb array of tenant slugs). On `projects`, `tenantId` and `templateId` are **nullable by design** (see IP phase above) — do not add `.notNull()` to them.
- `src/db/init-sql.ts` contains raw `CREATE TABLE` DDL used by `/api/admin/init`. Drizzle migrations are **not** in use; schema changes require updating both `schema.ts` and `init-sql.ts` together (plus a manual ALTER if data exists in production). The `drizzle/` directory exists but is empty.
- `src/db/seed-data.ts` holds the canonical 7 tenants + 13 templates. `slug` is the idempotency key.

### `publicId` generation

Two code paths, both count existing rows matching a LIKE prefix and append a zero-padded sequence:

- **IP mode** (POST `/api/projects` without `tenantSlug`/`templateSlug`): `IP-<year>-<NNNN>`.
- **MP mode** (POST with both, or PATCH handoff): `<TENANT_UPPER>-<TEMPLATE_PREFIX>-<year>-<NNNN>`, where `TEMPLATE_PREFIX` comes from `templates.idPrefix` (e.g. `RP` for Reportaje, `ASL` for Asesoría Legislativa).

This is racy under concurrent creates but acceptable for the current volume (6-8 projects/month per the project docs). Don't refactor it into a sequence unless that volume assumption changes.

### Frontend layout (App Router)

- `src/app/page.tsx` — operator dashboard (status of DB, tenants, templates, IA calls).
- `src/app/projects/` — list, new, and `[id]/ProjectDetailClient.tsx` (the large client component that drives pipeline transitions and the IP→MP handoff UI).
- `src/app/tools/angulos/` — standalone tool UI for Generador de Ángulos; newer tools should use the same page + `*Client.tsx` split.
- `src/components/Nav.tsx` — top nav.
- Path alias `@/*` maps to `src/*` (see `tsconfig.json`).

## Branding rules (enforced in prompts and outputs)

From `doc/IP_MP_ESTADO_MAESTRO.md`:

- Tenant `codigo-maestro-soberano`: **never** mention "Ignacio" in any generated output. Treat as a methodology, not a personal legacy.
- Template `asesoria-legislativa`: every normative/legal reference must be marked `[VERIFICAR]`. A human verification step is mandatory before export.
- AI-generated imagery must be declared as such in metadata/credits and must not represent real people.
- The API key never appears in frontend code, chat, or commits.

## Deployment workflow

The operator does not write code — Claude produces full files, the operator drops them into `C:\ipmp-platform\`, runs `npm run build` locally to catch errors, then `git push`. Vercel auto-deploys main. Keep this in mind when structuring changes: prefer small, self-contained file replacements over multi-file refactors that require ordering.

Environment is Windows + bash (Git Bash / WSL-style). Use Unix paths and forward slashes in scripts; avoid PowerShell-only idioms unless the operator explicitly asks.

## Further reading in-repo

- `README.md` — stack + initial tenants/templates overview
- `RUNBOOK.md` — step-by-step operational manual (Railway, Vercel, init endpoint)
- `doc/IP_MP_ESTADO_MAESTRO.md` — master state document: pipeline phases, 12-document packaging spec, blindaje rules, tool roadmap
- `doc/HANDOFF_SESION_2026-04-10.md` — last session handoff with chunk-by-chunk status

## Hallazgos de validación — Chunk 6 (10 abril 2026)

End-to-end validation in production using a real case (`DREAMOMS-ASL-2026-0001`, a legislative brief on declining birth rates in Chile). The pipeline works as designed, but surfaced six architectural findings worth preserving for future chunks. None of these are bugs in Chunk 6 — they are scope revelations and known gaps.

### a) Brand–hypothesis dissonance after traspaso

When a project is born in IP mode (no tenant) and generates hypotheses via `buildAngulosPrompt()` (no brand context), and the operator later does the traspaso to MP by assigning tenant + template, the original hypotheses are **not** reinterpreted under the brand lens. Observed consequence: the Constructor de Pitch prefills from a brand-neutral hypothesis but then runs under the MP prompt with brand context, producing pitches that the Validador de Tono later flags as "misaligned with the brand voice" (seen concretely with Dreamoms + a purely economic framing targeted at Diario Financiero). Not a Chunk 6 bug — an architectural revelation to resolve in a later chunk. See Chunk 8 design note in the Roadmap below.

### b) Residual `dato_referencial` category in the prompt

The new `buildAngulosPrompt()` still lets the model self-categorize hypotheses as `"dato_referencial"` (observed in hypothesis 4 of the natalidad case). That value is a leftover from the pre-Chunk 6 framework and acts as a Trojan horse for fabrication: it implies the model has backing data when in fact it cannot verify anything. The next prompt refinement should drop the category entirely and force all hypotheses into `"requiere_pesquisa"`. Tracked for Chunk 9.

### c) No feedback loop from Validador to Generador

The Validador de Borrador produces actionable findings (bias, precision, brand alignment, ethics), but those findings are not injected into the context of the next generator run on the same project. Opportunity for Chunk 8: the Generador de Borrador should receive `data.validaciones_borrador[]` as part of its input context so it can iterate on the previous verdict instead of starting from scratch.

### d) Verificaciones críticas are visual-only

The checkboxes rendered inside each hypothesis card for `verificaciones_criticas` are decorative — there is no persisted check state, no lifecycle, no link to sources. Chunk 7 (ODF) must upgrade them to a real system: states (`pendiente` / `en_curso` / `confirmada` / `descartada`), association to sources from the ODF, and a visible counter on the pipeline bar.

### e) Missing soft gates on pipeline transitions

The only hard gate today is `TRASPASO_REQUIRED` between `pesquisa` → `produccion`. Other transitions silently accept anything. Opportunity: add non-blocking warnings. Examples: advancing `validacion` → `pesquisa` without a `hipotesis_elegida` should prompt "no elegiste ninguna hipótesis, ¿seguro?"; once Chunk 7 ships, advancing `pesquisa` → `produccion` without any entries in `data.fuentes` should warn similarly. Keep them as confirmable warnings, not hard blocks — the only hard block should remain TRASPASO.

### f) Revision phase currently validates the wrong text

The Validador de Tono in `revision` is designed to audit the borrador produced by the Generador de Borrador in `produccion`. Since Chunk 8 does not exist yet, operators are pasting the pitch (built in `pesquisa`) into the validator as a workaround. This auto-resolves when Chunk 8 lands. Until then, consider adding a visual note inside the Validador de Borrador tab: "in normal operation this tool audits the borrador generated in the produccion phase".

## Hallazgos de validacion — Chunk 7 (11 abril 2026)

End-to-end validation in production of the two tools shipped in Chunk 7 (ODF + VHP). Both tools were built in the same operator session (Parte A: ODF, Parte B: VHP) and validated against a freshly-created throwaway project running the full pipeline draft -> validacion -> pesquisa with hypothesis generation, election, and the VHP-to-ODF auto-promotion on the validacion -> pesquisa advance. Everything works as designed. Three usability findings surfaced during validation, none of them bugs in Chunk 7 code — they are either scope revelations for future iteration or preexisting gaps from Chunk 6 that the testing process exposed.

### a) ODF captures source metadata only, not source content

The ODF form as shipped persists `tipo`, `nombre_titulo`, `rol_origen`, `estado`, `confianza`, `notas` and `fecha_registro`. It does NOT offer a URL field nor a file upload input. For a forensic investigation platform, a documentary source without access to the document itself is half a source. Two distinct sub-gaps to resolve separately in later chunks:

- **(a1) Free-text URL field per fuente** — trivial to add (one string input bound to a new optional `url` field in the `Fuente` interface, retrocompat-safe because it is optional). Does not require storage infrastructure. Appropriate for Chunk 9.
- **(a2) Real file upload to object storage** — non-trivial. Requires Vercel Blob or S3-equivalent, signed URL lifecycle, MIME validation, max file size policy, and a deletion contract (what happens to the file when the fuente is deleted). This likely belongs to a dedicated chunk or as part of the "Asset Library per tenant" already mentioned in `doc/IP_MP_ESTADO_MAESTRO.md` section 7. Not Chunk 9 scope.

### b) Validador del Borrador historial has no curation affordances (preexisting Chunk 6 gap exposed during Chunk 7 testing)

This finding is NOT caused by Chunk 7 — it was uncovered while the operator was testing the VHP flow and happened to open an unrelated project in `revision` phase (project on Codigo Maestro Soberano with 3 accumulated iterations of the borrador validator). The Validador de Tono del Borrador in `revision` persists every analysis as a new item in `data.validaciones_borrador[]` with no way to: (1) mark one of the iterations as the operator's canonical verdict, (2) delete obsolete iterations (no_publicable ones from earlier draft versions that have since been rewritten). Consequence: the history grows unbounded and the "final" verdict for the project is not machine-readable.

Proposed fix for Chunk 9 (inherits the pattern from Chunk 6 `hipotesis_elegida` and from Chunk 7 ODF delete):
- Add two buttons per historial entry: "Marcar como definitiva" (persists the entry id into `data.validacion_borrador_definitiva_id`) and "Eliminar" (removes the entry with confirm dialog).
- Surface the chosen entry with a visible badge in the historial and in the pipeline bar cell of `revision` (mirroring the `elegida` badge of Chunk 6).

Related to but distinct from finding (f) of Chunk 6 (the Validador de Tono currently audits the wrong text because Chunk 8 does not yet exist). Both findings live in the same module and should be tracked together.

### c) VHP locked tab shows a guidance message but no navigation shortcut

When an operator enters the VHP tab in fase `validacion` without having elected a hypothesis yet, the tab renders a yellow informational box with the text "Primero elegi una hipotesis en el tab Generador de Hipotesis. El VHP necesita una hipotesis elegida para evaluar el match con tu lead." This is Option 1 of the UX decision made at design time (tab always visible with guidance placeholder vs. tab hidden until precondition met). The message mentions the target tab by name and in bold, but does NOT include a clickable button that calls `setActiveTool('hipotesis')` to jump back. The operator must click the sibling tab manually in the top tab bar.

Trivial to resolve in Chunk 9: add a secondary button below the message bound to `setActiveTool('hipotesis')`. 4 lines of JSX. Consistent with the "guide the operator to the unblock action" principle.

### Notes on the successful validation run

- The VHP to ODF auto-promotion was validated end-to-end: a lead validated with veredicto `viable_con_reservas` on an acceso `probable` (which correctly capped the score per the score-ceiling rule in the prompt) was automatically persisted as a fuente in `data.fuentes[]` at the moment of the `validacion -> pesquisa` advance, with `origen: 'vhp'` and `origen_validacion_id` linking back to the validation entry. The idempotency flag `promovida_a_fuente` correctly prevented duplication on retreat/advance cycles.
- The score-ceiling rule added to the VHP prompt (`especulativo` max 60, `probable` max 80, `confirmado` full 0-100) shipped and is enforced by the model. Anti-fabrication principle preserved from Chunk 6.
- The brand-alignment layer in the MetricPress VHP prompt was implemented as injected findings inside `riesgos` and `recomendaciones` rather than as a new JSON key, keeping the IP and MP contracts identical and simplifying the frontend parser. Guardrail "brand context cannot inflate the score" is explicit in the prompt.
- Orden de tabs in fase `pesquisa` shipped as `[odf, pitch, radar]` — ODF first, to match the mental model that `pesquisa` logically starts by cataloging sources.

## Hallazgos de validacion — Chunk 8 (11 abril 2026)

End-to-end validation in production of the Generador de Borrador, the main tool of the `produccion` phase. Built and shipped in three sub-chunks (8A backend, 8B-1 frontend wiring, 8B-2 frontend UI) over a single operator session, then validated against a real (non-synthetic) project running the full pipeline draft -> validacion -> pesquisa -> traspaso -> produccion -> visual, including the regenerate cycle and the copy-to-clipboard + advance-to-visual actions. Everything works as designed. Three findings of minor scope surfaced during validation, none of them bugs in Chunk 8 code — they are scope revelations and refinements for future iteration.

### a) Borrador length self-limits below the declared range when evidence is sparse

The MP prompt for `generador_borrador` declares an extension range per template family (prensa 800-2000 words, opinion 500-900, institucional 1500-3500, academico 2000-4500). During the smoke test of Chunk 8A with a synthetic project that had only 2 ODF sources (one contactada with thin notes, one por_contactar) and zero resolved verificaciones criticas, the model produced a 487-word draft for a `reportaje-profundidad` (familia prensa). The minimum of the declared range is 800.

This is NOT a bug. It is the model correctly subordinating the extension rule to the anti-fabrication rule (which is rule #1 of the prompt): with only 2 thin sources and zero resolved checks, generating 1500 words would have required inflation, speculation or interpretation beyond the documented evidence. The 487-word output is dense in documented evidence and honest in `[VERIFICAR]` warnings. Anti-fabrication is preserved.

The refinement for Chunk 9 is to make the subordination explicit in the prompt. Add a note to the extension rule along the lines of: "the word range is a target, not a hard requirement. If the expediente has sparse documented evidence, the borrador can fall below the minimum of the range. It is preferable to ship a short and honest borrador than a long and speculative one. When the extension falls below the range, mention it explicitly in `notas_editoriales` and explain why."

This gives the model explicit permission to do what it already does correctly, and it forces the decision to be logged in the editorial notes for the operator's review.

### b) Operator notes textarea is not persisted between regenerations

The form of the Generador de Borrador exposes a textarea where the operator can write additional notes that get injected into the `userMessage`. Currently the textarea is bound to the local React state `borradorOperadorNotas` (Chunk 8B-1), which lives only in component memory: if the operator regenerates the borrador, the notes are sent again with the new request, but if the operator navigates away from the tab and comes back (or refreshes the page), the textarea is empty even though the previous borrador may have been generated using those notes.

The persisted `data.borrador` does carry the `notasOperador` field in its payload, but the form does NOT prefill the textarea from `data.borrador.notasOperador` on mount. As a result, the operator loses the context of which notes shaped the existing borrador.

Proposed fix for Chunk 9 (trivial): on mount of the borrador tab, if `data.borrador?.notasOperador` exists and the local state is still empty, prefill the textarea with that value. This is the same prefill pattern that the Constructor de Pitch already uses with `hipotesis_elegida`.

### c) "Copiar al portapapeles" uses navigator.clipboard with no graceful degradation in non-secure contexts

The Copiar button in the Chunk 8B-2 UI calls `navigator.clipboard.writeText` and shows a generic `alert()` on failure. In production over HTTPS this works. But the API is gated to secure contexts and a few corner cases can break it: iframes without the clipboard-write permission, browsers with the API disabled by user policy, or older mobile browsers. The current fallback is "alert and tell the operator to copy manually from the panel" — which is correct in spirit but offers no actual mechanism to copy from the panel without a manual text selection.

Not a Chunk 8 bug. The decision to use `navigator.clipboard` as the primary path is correct (it is the modern API and 99% of cases will work). The refinement for Chunk 9 is to add a hidden `<textarea>` that holds the plain-text version of the borrador and, on copy failure, focus + select that textarea so the operator can use Ctrl+C as a one-keystroke fallback. Five lines of JSX.

### Notes on the successful validation run

- The full flow draft -> validacion -> pesquisa -> traspaso -> produccion -> visual was exercised end-to-end with a real (non-synthetic) project. The Generador de Borrador rendered the contexto del expediente panel correctly, the form button labels and disabled states reflected the soft gate matrix (postura C: hipotesis hard-block, fuentes warning), the regenerate cycle dispatched the confirm dialog, the copy-to-clipboard pasted plain text without metadata or markdown contamination, and the avanzar-a-visual button moved the project to the next phase via `handlePipelineAction('advance')` without breaking the pipeline state.
- Decision Architectural A held in production: the borrador was generated exclusively from `hipotesis_elegida` + `fuentes` (ODF) + `validacion_hipotesis_pista` (VHP) + `validaciones_borrador` (iterations) + `notasOperador` + `tenant` + `template`. The `data.pitch` is never read by the handler. No brand-voice drift was observed during the validation, confirming that the pitch had no business contaminating the borrador and that the architectural separation is operationally sound.
- The hard-block on `hipotesis_elegida` was visually verified by retreating the project to validacion, clearing the elected hypothesis with "Cambiar eleccion", and re-advancing to produccion: the borrador tab correctly rendered the red block "Falta elegir una hipotesis" and disabled the generate button.
- The MP-only hard-block of the endpoint (Chunk 8A) was indirectly validated: the frontend handler always sends `tenantSlug + templateSlug` because the traspaso gate guarantees they exist in fase produccion, so the 400 error path on the endpoint is unreachable from the UI. It remains as defense-in-depth for direct API consumers (curl, future MCP clients, integration tests).
- The `genBorradorError` namespace separation (Chunk 8B-1) prevented a name collision with the preexisting `borradorError` of the Validador de Tono del Borrador. Both error channels coexist in the same component without interference. This is a pattern worth replicating in future chunks: when a new tool needs an error state and the natural name is already taken by a sibling tool, prefix with the tool family (`gen` for generators, `val` for validators) rather than reusing the channel.
- Token usage in the smoke test was 4185 input + 1628 output for the synthetic case, which lands at roughly USD 0.04 per generation with Sonnet 4. Real cases with richer expedientes will use more tokens but should remain under USD 0.10 per borrador. Sustainable for the projected volume of 6-8 projects per month.
- Latency was 27.2 seconds in the smoke test. Acceptable for a one-shot full-draft generation. No need to introduce streaming UI for now.

## Hallazgos de validacion — Chunk 9 (11 abril 2026)

Chunk 9 (refinements) shipped in four sub-chunks executed over a single operator session, each validated visually in production before advancing to the next:

- 9A: prompt refinements only (no UI changes). Smoke tested by inspection of the updated prompts and by generating a test hypothesis after deploy.
- 9B: UX refinements of the Borrador tab and VHP navigation button. Validated visually with a real project.
- 9C: URL field in ODF, curation of the Validador de Borrador history, and soft gates on pipeline transitions. Validated visually with a real project exercising create/edit/delete of sources with URLs, marking and removing validation iterations, and triggering both soft gates.
- 9D: tesis optional + cleanup of legacy /tools/angulos route. Validated by confirming the placeholder renders on projects without thesis and that the build is clean after deleting the tools directory.

Two findings worth preserving emerged during Chunk 9 execution, both operational rather than architectural:

### a) Next.js 16 stale typegen after structural route deletion

When deleting a full route directory in Next.js 16 with Turbopack (in this case `src/app/tools/angulos/` including its `layout.tsx`), the first `npm run build` after the deletion fails with a TypeScript error of the form:

```
Type error: Type 'Route' does not satisfy the constraint '"/"'.
  Type 'LayoutRoutes' is not assignable to type '"/"'.
    Type '"/tools/angulos"' is not assignable to type '"/"'.
```

This is NOT a code bug. The typegen artifact at `.next/dev/types/validator.ts` still references `LayoutRoutes` from the deleted route because the incremental cache does not auto-invalidate on structural deletions of layouts. The fix is `rm -rf .next && npm run build` to force a clean typegen regeneration.

Operational lesson: any chunk that deletes a layout file (or a full route directory containing one) should explicitly include a clean rebuild step in its prompt. This prevents confusion during execution: if the build fails with a LayoutRoutes type error after a structural deletion, the reflex is to clean `.next` before diagnosing deeper. Not a refinement to track — just a workflow rule documented here for future chunks touching route structure.

### b) F1 was already partially implemented before Chunk 9

The item F1 (pipeline sin tesis obligatoria) was declared as a pending refinement based on the assumption that the create-project form still required thesis. The reconnaissance pass of Chunk 9D revealed that the form already accepted thesis optional since an earlier chunk (likely 5c): the label already read "(recomendado)", the validator only enforced title, the request body sent `thesis: undefined` when empty, the POST endpoint already accepted thesis nullable, and the INSERT already used `thesis ?? null`.

The only real work left for F1 was cosmetic and informational:
- Replacing the short-circuit render of thesis in `ProjectDetailClient.tsx` with a ternary that shows an informational placeholder when `project.thesis` is null/empty, telling the operator that hypotheses can be generated first and the thesis can emerge from the chosen one.
- Polishing the label from "(recomendado)" to "(opcional)" and updating the helper text to match the new framing.

Operational lesson: the Roadmap can drift from the real state of the code across many chunks. The reconnaissance pass before executing a refinement is not optional — it validates whether the refinement is still needed. In this case, the reconnaissance saved the chunk from overwriting a working form with identical work.

### Notes on the successful Chunk 9 execution

- The Chunk 9 was pre-divided into 4 sub-chunks during triage to keep each commit atomic and each prompt manageable. The division proved sound: 9A and 9B were small, 9C was the large one with 13 `str_replace` edits distributed across distinct blocks of `ProjectDetailClient.tsx`, and 9D closed with the refactor-adjacent work. No sub-chunk required rework.
- Decision C (mixed soft gates) from Chunk 8 was propagated to the pipeline transitions in 9C E1: `validacion -> pesquisa` without elected hypothesis triggers a confirm, `pesquisa -> produccion` with empty ODF triggers a confirm. Both coexist with the existing hard-block of `TRASPASO_REQUIRED` without interference.
- The refactor of the Generador de Borrador extension rule in 9A A1 explicitly subordinated the word range target to the anti-fabrication rule and added a declaration obligation in `notas_editoriales`. Validated in production on a real draft: when the evidence was thin, the model correctly declared the undershoot explicitly. The refinement worked as designed.
- The `dato_referencial` category removal in 9A D1 was complemented by preserved backward compatibility: legacy hypotheses persisted in `data.hipotesis` or `data.hipotesis_elegida` with the old category value continue to render because `parseHipotesisFromRaw` accepts any string for `verificacion`. Only new hypotheses generated after 9A deploy use the reduced set.
- The curation of the Validador de Borrador history in 9C C2 implemented the pattern proposed in the Chunk 7 finding "b": a dedicated field `data.validacion_borrador_definitiva_id` points to the chosen iteration, deletion of the chosen entry atomically clears the pointer in the same PATCH, and the chosen entry displays a green "Definitiva" badge. Pattern worth replicating for any future list of AI-generated artifacts that need a "canonical choice" affordance.
- Operational incident during Chunk 9D: the first `npm run build` after deleting `src/app/tools/` failed due to stale typegen cache (see finding "a" above). Claude Code correctly diagnosed the issue and proposed `rm -rf .next && npm run build` as the fix, but because the operator had no direct way to audit the intermediate state, the correct protocol was to stop and report instead of improvising. The fix itself was idiomatic and correct; the process lesson is that any action outside the original prompt requires explicit stop-and-report, even when the technical decision is sound.

## Hallazgos de validacion — Chunk 10 (11 abril 2026)

Chunk 10 (Agenda de Editores manual) shipped in three sub-chunks executed over a single operator session, each validated before advancing to the next:

- 10A: schema editores_agenda + CRUD API (GET/POST/PATCH). Validated via curl smoke test end-to-end against Railway after POST /api/admin/init: GET empty list, POST create, GET with one entry, PATCH soft-delete via activo:false, PATCH marcarVerificado:true. All 5 curls returned the expected shape and all field-level assertions passed (jsonb round-trip, nullable persistence, updatedAt advance on PATCH, ultimaVerificacion only set with explicit flag, activo preserved across subsequent partial PATCH).
- 10B: UI CRUD at /admin/editores (server component page + single-file client component with inline editing). Validated visually in production: Nav link renders and highlights active state, list renders with correct shape (tier badge, tenant chips, piezas line, ultima verificacion line), inactive toggle hides/shows soft-deleted entries, new editor form creates real entry with optimistic update, tenant checkboxes populated dynamically from the tenants table via server-side query. The remaining handlers (inline Edit, Verificar hoy, Desactivar/Reactivar) are implemented per spec and will get their first functional exercise on the operator's next real media-relations work session — not blockers for closing the chunk.
- 10C: this documentation update.

Three findings worth preserving emerged during Chunk 10 execution, all architectural rather than operational:

### a) Date to ISO string serialization at the server-to-client boundary

When a Next.js 15/16 App Router page loads data via a server-side Drizzle query and passes it as a prop to a client component whose interface matches the JSON shape returned by the REST API, TypeScript correctly rejects the direct assignment because Drizzle returns `Date` objects for `timestamp` columns while `fetch().json()` returns ISO strings after traversing the JSON boundary. The incident surfaced on the first `npm run build` of 10B with a `Date | null` vs `string | null` error on `ultimaVerificacion`.

The resolution applied was to serialize the three timestamp fields (`ultimaVerificacion`, `createdAt`, `updatedAt`) to ISO strings in `page.tsx` before passing the list to the client component, using a `.map()` with `.toISOString()` and the nullable guard for the optional one. This keeps a single `Editor` interface in the client, consistent with both the SSR initial props and the subsequent API responses, at the cost of a lightweight transformation on the server side.

Pattern worth replicating for any future page that hydrates an initial list from SSR and then refreshes it via client-side fetch against the same API. The alternative (two interfaces `EditorServer` with `Date` and `EditorClient` with `string`) is strictly worse because it duplicates shape definitions and forces casts at every boundary. The serialization-at-boundary pattern is the canonical Next.js App Router idiom and should be adopted as the repo convention when the same shape bridges SSR and API.

Deferred micro-debt: if a future chunk adds a second SSR-hydrated list with `Date` fields, the one-off `.map()` transformation should be factored into a shared helper (e.g. `src/lib/serialize.ts` with a `serializeTimestamps<T>(row: T): T` helper). Not worth factoring for a single caller — premature abstraction.

### b) First admin route segment — no shared layout yet

Chunk 10B introduced `/src/app/admin/` as a segment. The first page under that segment is `/admin/editores`. The decision taken was NOT to create a shared `admin/layout.tsx` yet, because with only one admin route the layout would be abstraction without consumers — the Nav is already provided by the page itself and there is no shared chrome to factor.

When the second admin route appears in a future chunk (likely /admin/tenants or /admin/users or an admin dashboard index), the shared layout becomes justified and should be factored at that moment, not before. Rule: do not invent abstractions for a single caller.

This is the same discipline that prevented a premature `/admin/editores/new` + `/admin/editores/[id]` route split in 10B. The single-page CRUD with inline editing was chosen over the three-route mirror of `/projects` because the operator's real-world use of the editors agenda is "see all, edit fast, move on" rather than "deep-dive into one entity for a long session". The ergonomic match to the use case dominates over consistency with a pattern designed for a different use case.

### c) No DELETE in the API by design, soft-delete as the only reversibility affordance

Chunk 10A explicitly decided against a DELETE endpoint. The only way to remove an editor from the active set is `PATCH /api/editores/[id]` with `{ activo: false }`, and the only way to restore it is the inverse PATCH. The UI reinforces this: the "Desactivar" button soft-deletes without confirmation, and the "Mostrar inactivos" toggle acts as the undo affordance by making the full set visible and exposing the "Reactivar" button on each inactive entry.

The decision follows the Chunk 9 principle that soft gates are preferable to hard gates when the risk is recoverable. A hard DELETE is irreversible and would require confirmation modals, trash can semantics, retention windows, and other ceremony. A soft-delete is reversible by construction, has no risk, and needs zero ceremony.

The empirical consequence is that the smoke test registry `75dfa942-1ac1-41b8-85c8-2e3e3ab293fb` ("Smoke Test" / "Diario de Prueba") remains persisted in production as a historical marker of the first CRUD exercise. If it ever becomes necessary to actually delete rows from `editores_agenda`, the intended path is a manual SQL DELETE against Railway rather than exposing a DELETE endpoint. That path remains operator-only and outside the application surface.

### Notes on the successful Chunk 10 execution

- The three sub-chunks shipped cleanly: `8523e74` (10A schema + API), `3f31a66` (10B UI), and this commit (10C docs).
- Chunk 10A execution caught one real architectural decision on the fly: nullable-vs-notNull for jsonb arrays. The decision taken was `.notNull().default([])` for both `tenants_relevantes` and `tipo_pieza_recomendado`, which is stricter than the convention used in older tables (`tenants.brand_variants`, `templates.required_visual_slots`, etc. are nullable jsonb with default). The rationale: reading code that consumes these fields is simpler if the shape is guaranteed to be an array (no `?? []` everywhere), and INSERT code at the API layer already coerces to array anyway. The older tables remain nullable for retrocompat but new tables should default to `.notNull().default([])` for jsonb arrays unless there is a specific reason otherwise.
- The first `POST /api/admin/init` attempt against production returned `{"error":"Unauthorized"}` with a token that did match the Vercel env var. The second attempt immediately after returned `{"success":true, ...}` with the exact same token and the exact same command. No root cause was identified — possibly edge node propagation of the env var after the deploy, possibly latency in a token cache. Documented here as noise rather than bug. If it happens again in a future chunk, treat it as diagnosable; if it stays a one-off, ignore.
- The smoke test of Chunk 10A exercised all four CRUD primitives (list, create, partial update, soft-delete) and the field-level semantics (jsonb round-trip, nullable persistence, updatedAt auto-advance, marcarVerificado flag). No regressions on the pre-existing 8 tables.
- The UI of Chunk 10B validated visually: the nav link, the header, the barra superior with visible/hidden counter, the form collapse/expand, the tenant checkboxes populated dynamically from `tenants` table, the optimistic update after create, and the shape of the tarjeta cards in the active and inactive states. The five remaining handlers (inline Edit save, Verificar hoy, Desactivar, Reactivar, and the re-sort on tier change) were not exercised explicitly in the validation session — they will get their first functional exercise on the next real media-relations work session. The code is straightforward and follows the patterns exercised by other handlers, so this is acceptable deferred validation, not blocker.

## Hallazgos de validacion — Chunk 11 (12 abril 2026)

Chunk 11 fue ejecutado en una sesion intermedia entre el cierre del Chunk 10 y la sesion del 12 abril, sin sub-chunk documental al momento del cierre. La documentacion retroactiva de los hallazgos se hace en el sub-chunk 12A. Solo un hallazgo importante emerge del Chunk 11 visto en retrospectiva, y es lo que motiva el alcance del Chunk 12 entero.

### a) La integracion agenda-pitch resuelve un problema operativo correctamente, pero queda subordinada a un bug arquitectonico mayor del Constructor de Pitch del Chunk 6

El Chunk 11 implementa correctamente lo que su alcance original prometia: un panel de sugerencias de editores que filtra la agenda del Chunk 10 por tenant, tier y tipo de pieza, con relajacion progresiva en tres buckets de calidad de match. El operador puede elegir un editor sugerido del panel y el `pitchMedio` se autopopula al instante.

Sin embargo, al usarlo con casos reales en la sesion del 12 abril, el operador observa que los pitches generados contienen afirmaciones especificas sobre fuentes, datos historicos, citas academicas y referencias institucionales que no aparecen en ninguna parte del expediente del project. El modelo las fabrica y las marca con `[POR VERIFICAR]` para taparlas. La causa raiz no es el Chunk 11 ni su panel de sugerencias: es que el Constructor de Pitch del Chunk 6 nunca fue diseñado para consumir el expediente. El handler `handleConstruirPitch` solo le pasa al modelo el angulo libre que el operador escribio + opcionalmente la tesis del project + el medio destino. No lee `data.hipotesis_elegida`, no lee `data.fuentes`, no lee `data.borrador`. El prompt del Constructor de Pitch en `prompts.ts` instruye al modelo a usar `[POR VERIFICAR]` para cualquier dato que no este confirmado, pero no se le da nada con que cumplirlo.

El Chunk 11 entonces resuelve un problema real (saber a quien pitchearle) pero queda subordinado a un bug arquitectonico mas profundo: el Pitch genera contenido especulativo porque opera sin contexto del expediente. La integracion agenda-pitch del Chunk 11 es necesaria pero insuficiente. El Chunk 12 lo resuelve invirtiendo la dependencia entre Borrador y Pitch: el Pitch pasa a fase produccion despues del Validador del Borrador, su prompt se refactoriza para consumir el borrador validado como base canonica, y la metadata del editor elegido del Chunk 11B se preserva intacta como dato adicional opcional.

Decision arquitectonica que esto produce: el orden Borrador -> Pitch (no Pitch -> Borrador) es coherente con la decision registrada en el Chunk 8 de que el Borrador NO debe leer del pitch viejo bajo ninguna circunstancia. Cada artefacto tiene un consumidor rio abajo, no rio arriba.

### Notas sobre la falta de sub-chunk documental al momento del cierre del Chunk 11

El Chunk 11 cerro a nivel codigo con dos commits limpios (`7596b71` y `51ce578`) pero la sesion no llego a producir un sub-chunk `docs(chunk11)`. Esto es deuda documental que se resuelve en el sub-chunk 12A retroactivamente. Lo registramos como hallazgo operacional para futuros chunks: el sub-chunk documental no es opcional, debe ser parte del cierre de cada chunk antes de cerrar la sesion. Cuando una sesion se queda sin tiempo o el operador asume que la documentacion se va a hacer "despues", ese despues no llega y la siguiente sesion abre con un CLAUDE.md desfasado. Esto produce friccion durante el reconocimiento del estado real del repo y puede llevar a planificar sobre supuestos incorrectos.

## Hallazgos de validacion — Chunk 12 (12 abril 2026)

Chunk 12 (Pesquisa Aplicada y Realineacion del Pipeline Editorial) es el chunk mas grande del proyecto hasta la fecha: 7 sub-chunks (12A-12G) ejecutados en una sola sesion larga. El chunk resuelve el bug arquitectonico fundamental del Constructor de Pitch e introduce el loop de pesquisa externa que cierra el ciclo investigativo del pipeline. Seis hallazgos emergieron durante la ejecucion.

### a) Bug arquitectonico del Constructor de Pitch del Chunk 6 — resuelto en 12E

El Constructor de Pitch original (Chunk 6) nunca fue disenado para consumir el expediente del project. El handler `handleConstruirPitch` solo pasaba al modelo el angulo libre que el operador escribia + opcionalmente la tesis + el medio destino. No leia `data.hipotesis_elegida`, no leia `data.fuentes`, no leia `data.borrador`. El prompt instruia al modelo a usar `[POR VERIFICAR]` para datos sin confirmar, pero no le daba evidencia con que reemplazar esos placeholders. Resultado: pitches con afirmaciones especificas fabricadas por el modelo, cubiertas bajo el paraguas cosmético de `[POR VERIFICAR]`.

La resolucion en 12E invierte la dependencia: el Constructor de Pitch ahora vive en fase `produccion` (despues del Generador de Borrador, no antes), su handler consume `data.borrador` como base canonica (titulo, bajada, lead, cuerpo, cierre, fuentes citadas, verificaciones resueltas y pendientes), y su prompt prohibe agregar datos que no esten en el borrador. La inversion Borrador→Pitch es coherente con la decision del Chunk 8 de que el Borrador NO debe leer del Pitch: cada artefacto tiene un consumidor rio abajo, no rio arriba.

### b) Loop de evidencia del borrador — introducido en 12C

El Chunk 12C introduce el mecanismo de auto-invalidacion del borrador: cuando se cargan fuentes nuevas al ODF via PATCH, el backend detecta automaticamente que `fuentes.length` aumento y setea `data.borrador.desactualizado = true` en el mismo PATCH atomico. El frontend muestra un banner amarillo con el contador ("generado con N fuentes, ahora hay M") y el boton de generar cambia a "Regenerar con evidencia actualizada". Un soft gate confirmable bloquea el avance `produccion -> visual` con borrador desactualizado. Este mecanismo cierra el loop de pesquisa: el operador exporta las verificaciones pendientes via el exportador del 12B, investiga con Claude.ai, carga los hallazgos como fuentes en el ODF, el borrador se invalida automaticamente, y al regenerar el prompt del 12D opera en modo "evidencia disponible" citando las fuentes en vez de marcar todo con `[VERIFICAR]`.

### c) Modo de operacion diagnostico vs evidencia disponible — introducido en 12D

El prompt del Generador de Borrador ahora detecta automaticamente si el ODF tiene fuentes verificadas/contactadas o no, y opera en dos modos distintos. En modo diagnostico (ODF vacio o sin fuentes sustantivas), el borrador es corto, cauteloso y lleno de marcas `[VERIFICAR]` — su valor es operativo, no editorial. En modo evidencia disponible (ODF con al menos una fuente verificada o contactada), el borrador cita fuentes explicitamente en lenguaje afirmativo y solo marca `[VERIFICAR PENDIENTE]` lo que ninguna fuente respalda. La regla anti-fabricacion es absoluta en ambos modos; lo que cambia es la proporcion entre afirmaciones respaldadas y marcas de verificacion. El modo elegido se declara explicitamente en `notas_editoriales` del JSON de salida.

### d) Clausula de detencion validada operacionalmente

La clausula de detencion por ajuste de alcance, introducida formalmente en el Chunk 12, fue activada dos veces durante la sesion y en ambos casos funciono correctamente: Claude Code paro antes de ejecutar, reporto la discrepancia, y espero confirmacion explicita. El primer caso fue cuando el commit de CLAUDE.md se intento desde el worktree en vez del directorio principal. El segundo caso fue cuando se detecto que el codigo de 12E no habia sido committed antes de intentar commitear las docs de 12G. En ambos casos, la detencion previno un commit roto o incompleto. La clausula se adopta como practica permanente del proyecto.

### e) Principio operativo "asiste, no automatiza"

La decision de disenar el exportador de pesquisa externa del 12B como un modal que copia un prompt pre-formateado (en vez de llamar directamente a Claude.ai via API) cristaliza un principio que estaba implicito desde el Chunk 8: la plataforma asiste al operador en cada paso pero no automatiza la cadena completa. El operador decide cuando investigar, que fuentes cargar, y cuando regenerar el borrador. Cada decision editorial es humana y trazable. Este principio es la traduccion tecnica del "proceso disciplinado" descrito en la seccion "Por que existe IPMP" y debe gobernar cualquier feature futura que toque el ciclo investigativo.

### f) Deuda tecnica: codigo muerto post-12E

El refactor del Constructor de Pitch en 12E dejo codigo muerto en `ProjectDetailClient.tsx`: los estados `pitchAngulo`, `pitchTouched`, y el `useEffect` de prefill desde `hipotesis_elegida` ya no se usan desde la UI ni desde el handler (que ahora consume `data.borrador`). Los estados siguen declarados y el useEffect sigue disparandose al cargar un project, pero su efecto es inofensivo (setea un state que nadie lee). Este codigo muerto se limpia en el Chunk 13+ junto con el cleanup del map `VERIFICACION_COLORS` (dato_referencial huerfano desde Chunk 9A D1). No es urgente pero es deuda tecnica documentada.

### Notas sobre la ejecucion del Chunk 12

- Los 7 sub-chunks se ejecutaron en una sola sesion larga de Claude Code sin rework. El orden fue 12A (cierre retroactivo Chunk 11), 12B (exportador + idioma neutro), 12C (auto-invalidacion borrador), 12D (modo evidencia en prompt), 12E (refactor pitch a produccion), 12F (disclosure hipotesis descartadas), 12G (este cierre documental).
- La regla de idioma neutro (`IDIOMA_NEUTRO_RULE`) del 12B se inyecto en 5 funciones build* IP + 1 funcion build*MP (buildGeneradorBorradorPromptMP). Las 4 funciones build*MP restantes heredan la regla automaticamente del base via `const basePrompt = build*()`. El stub IP de buildGeneradorBorradorPrompt se salto porque es un mensaje de error, no un prompt real.
- El incidente del CLAUDE.md desfasado entre sesiones (descubierto en 12A) motivo la creacion de la seccion "Workflow operativo entre sesiones" con las dos disciplinas de "una sesion un chunk" y "snapshot del estado del repo al inicio de cada chat". Ambas disciplinas se validaron empiricamente en la sesion del Chunk 12.

## Hallazgos de validacion — Chunk 15 (12 abril 2026)

### a) Vercel Blob operativo en plan Hobby

El store ipmp-platform-blob fue creado en la sesion del Chunk 15
en region IAD1. El plan Hobby incluye 500MB storage y 1GB transfer
mensual, suficiente para el volumen proyectado de 6-8 projects por mes.
El store fue creado con access privado (default de Vercel). El endpoint
de upload requirio ajuste: access 'public' falla en stores privados,
access 'private' genera URLs con token temporal que son igualmente
accesibles via link directo. Hallazgo operativo: al crear un Blob store
nuevo en Vercel, verificar el tipo de acceso (publico vs privado) antes
de codificar el endpoint, para evitar el fix post-deploy del 15B.

### b) Upload validado en campo con PDF real

El sub-chunk 15B implemento la UI de upload en cada card de fuente del
ODF. Validado en campo con el project del candombe: archivo
Paper_Origenes_del_Candombe_V2.pdf subido correctamente al Vercel Blob,
link visible en la card de la fuente, boton de eliminacion operativo.
Los tres tipos de archivo probados (Python script, PDF, Word) fallaron
inicialmente por el error de access publico en store privado (ver
hallazgo a). Una vez aplicado el fix de access privado, el upload
funciono en el primer intento.

### c) Contrato de deletion best-effort

El sub-chunk 15C implemento el contrato de deletion: cuando el operador
elimina una fuente del ODF con archivo adjunto, el blob se elimina
primero via DELETE a /api/fuentes/delete-blob. El try/catch es
intencional y documentado: si el delete del blob falla, la fuente
se elimina igual para no bloquear al operador. Los blobs huerfanos
son recuperables manualmente desde el dashboard de Vercel. Esta
decision sigue el principio de no bloquear el flujo editorial por
fallos de infraestructura de storage.

## Hallazgos de validacion — Chunk 14 (12 abril 2026)

### a) Reordenamiento del pipeline validado en produccion

El sub-chunk 14A movio la fase 'visual' desde su posicion anterior
(entre 'produccion' y 'revision') a su posicion correcta (entre
'aprobado' y 'exportado'). El cambio requirio dos ediciones:
PIPELINE_ORDER en route.ts (una linea) y el soft gate de 12C en
ProjectDetailClient.tsx (cambio de target 'produccion->visual' a
'produccion->revision'). El pipeline bar renderizado desde
project.pipelinePhases confirmo el nuevo orden en produccion via
hard refresh despues del deploy.

Hallazgo operativo: la validacion local con npm run start fallo por
ERR_CONNECTION_REFUSED en el browser. El servidor de produccion Next.js
requiere que la terminal de Git Bash permanezca abierta y que se use
la IP de red (192.168.x.x:3000) en vez de localhost cuando el browser
rechaza la conexion local. Para futuros chunks: validar directamente
en Vercel despues del push cuando la validacion local sea impractica.

### b) Tab Visual: generador de prompt estructurado validado en campo

El sub-chunk 14B implemento el tab Visual como generador de prompt
estructurado (no generador de imagen). Validado en campo con el project
del candombe: el modelo recibio el borrador aprobado y produjo un JSON
con las 6 claves del contrato (descripcion_imagen, estilo,
paleta_mood, composicion, formato_proporciones, instruccion_uso).
La regla anti-fabricacion se respeto: todos los elementos visuales
descritos estan presentes en el borrador. El estilo elegido
(fotografia_documental) fue coherente con el genero academico del
template. El prompt de salida es directamente usable en Midjourney
con el parametro --ar del formato recomendado.

Decision de diseno confirmada: el tab Visual opera sobre el borrador
aprobado, no sobre el borrador en produccion. Esta decision es
arquitectonicamente correcta porque garantiza que el prompt visual
refleja el contenido editorial definitivo, no un borrador en revision.

### c) Decision 14C documentada: Bitacora de Pesquisa Externa como workflow externo

La Bitacora de Pesquisa Externa NO es una feature de IPMP. Es un
workflow externo donde el Investigador Senior AI vive en Claude.ai MAX
con busqueda web activa. El flujo operativo es: IPMP exporta el
documento de pesquisa via el exportador ZIP del 13B, el operador lo
lleva a Claude.ai MAX manualmente, Claude.ai MAX verifica y contrasta,
el operador carga la fuente verificada al ODF de IPMP manualmente.
El costo corre contra la suscripcion MAX de tarifa plana, no contra
la API Console por token. Esta decision es coherente con el Principio 4
de filantropia digital (portabilidad) y con el principio "asiste, no
automatiza" del Chunk 12. No hay nada que construir en IPMP para este
workflow.

## Hallazgos de validacion — Chunk 13 (12 abril 2026)

### a) Cleanup codigo muerto post-12E ejecutado sin fricciones

Los cinco elementos huerfanos identificados tras el refactor del 12E fueron eliminados limpiamente en el sub-chunk 13A: los estados pitchAngulo y pitchTouched, el useEffect de prefill desde hipotesis, la referencia a setPitchTouched en handleCambiarEleccion, y la entrada dato_referencial en VERIFICACION_COLORS. El grep post-cleanup confirmo cero referencias funcionales restantes. Costo: 16 deleciones, 2 inserciones. Build limpio.

### b) Exportador ZIP: diseno validado en campo con project real

El sub-chunk 13B implemento el exportador basico de fase exportado usando jszip. La validacion de campo con el project del candombe (publicId MetricPress) confirmo que la estructura del ZIP es legible e interpretable por un operador sin contexto tecnico previo. Los cinco archivos exportados correctamente:

- proyecto.json: expediente completo del project con todos los campos de data.
- borrador.md: borrador en markdown con estructura de secciones, fiel al estado persistido incluyendo marcadores de verificacion pendientes.
- pitch.md: pitch editorial completo con texto_completo, medio_destino y notas_estrategicas.
- fuentes-odf.json: array completo de fuentes del ODF con confianza, rol y metadata.
- hipotesis.json: objeto completo de hipotesis con los cuatro angulos generados, tipo, audiencia y verificaciones criticas.

El exportador es fiel al estado real del project: no embellece ni normaliza datos pendientes. Cuando el operador actualice una fuente en el ODF, el proximo ZIP reflejara automaticamente la fuente actualizada sin cambios en el endpoint.

### c) Hallazgo de producto: el ZIP como unidad de portabilidad editorial

La validacion de campo revelo que el ZIP exportado funciona como carpeta maestra autosuficiente del project: un segundo operador sin acceso a la plataforma puede reconstruir el estado editorial completo leyendo los cinco archivos. Esto es coherente con el Principio 4 de filantropia digital (portabilidad de datos del usuario) y confirma que el diseno del endpoint es correcto.

## Workflow operativo entre sesiones

Aprendizaje meta del cierre tardio del Chunk 11 documentado retroactivamente en el sub-chunk 12A. Dos disciplinas que se adoptan a partir del Chunk 12 para prevenir drift entre sesiones:

### Disciplina 1 — Una sesion, un chunk

Cada chunk arranca en un chat nuevo de Claude.ai con `CLAUDE.md` actualizado del repo adjunto al inicio. Cuando el chunk cierra (commit documental incluido), el chat se archiva. Un chat = un chunk. Esto evita la mezcla de contextos entre chunks distintos y garantiza que cada nueva instancia de Claude arranca con el estado real del repo, no con una version intermedia de la memoria de conversaciones anteriores.

### Disciplina 2 — Snapshot del estado del repo al inicio de cada chat

Antes de empezar a planificar un chunk nuevo, el operador corre tres comandos en Git Bash desde el directorio del repo (`cd /c/ipmp-platform`) y los pega como mensaje temprano del chat despues del CLAUDE.md adjunto:

```bash
git log --oneline -10
git status
git rev-parse HEAD
```

El primer comando da el contexto historico reciente. El segundo confirma working tree limpio. El tercero confirma el HEAD exacto sobre el cual la sesion va a planificar. Si hubiera codigo no documentado (commits en `main` que no figuran en CLAUDE.md), aparece inmediatamente en el snapshot y se puede investigar antes de planificar. Si el operador olvida correr este snapshot, la nueva instancia de Claude debe pedirlo explicitamente antes de proponer cualquier chunk nuevo.

## Roadmap

Confirmed chunk ordering after Chunk 6 validation (10 abril 2026). Each chunk should preserve the Chunk 6 retrocompat contract: projects created under older chunks must keep rendering without writes to any of the new `data.*` keys.

### Chunk 7 — VHP + ODF [COMPLETADO 11 abril 2026]

Cerrado en una sola sesion de trabajo, desplegado en produccion en 2 commits:
- `8c20734` feat(chunk7a): ODF — CRUD puro de fuentes forenses en fase `pesquisa`, con badge contador en la pipeline bar y retrocompat sobre `data.fuentes[]`.
- `a69160a` feat(chunk7b): VHP — herramienta IA en fase `validacion`, con auto-promocion backend-atomic de leads validados a `data.fuentes[]` en la transicion `validacion -> pesquisa`, y nuevo campo `origen: 'vhp'` en `Fuente` para trazabilidad.

Hallazgos de validacion: ver seccion "Hallazgos de validacion — Chunk 7 (11 abril 2026)" mas arriba.

### Chunk 8 — Generador de Borrador [COMPLETADO 11 abril 2026]

Cerrado en una sola sesion de trabajo dividida en tres sub-chunks secuenciales, desplegados en produccion y validados visual + funcionalmente end-to-end por el operador:

- `87ce56c` feat(chunk8a): backend del Generador de Borrador. Nueva tool `generador_borrador` en la capa de IA, MetricPress-only (hard-block en `route.ts` si falta tenant + template). Nuevo prompt `buildGeneradorBorradorPromptMP` con regla anti-fabricacion absoluta, regla de citacion de fuentes desde el ODF (no citar fuentes en estado descartada, citar fuentes en estado por_contactar solo como pendientes), regla de iteracion sobre `validaciones_borrador[]` previas, estructura de cuerpo segun `template.family`, y regla de blindaje de marca subordinada al rigor.

- `5fd957d` feat(chunk8b1): cableado del frontend. Tipos `BorradorSeccion / BorradorBody / BorradorMetadata / BorradorData`, parser defensivo `parseBorradorFromRaw`, estado React (`borradorOperadorNotas`, `generandoBorrador`, `genBorradorError` con prefijo de namespace para evitar colision con el `borradorError` del Validador de Tono), handler `handleGenerateBorrador` con soft gate mixto (hipotesis hard-block, fuentes warning confirmable), tab `'borrador'` agregado a `PHASE_CONFIG.produccion`, y placeholder visual con wiring temporal.

- `18a55d6` feat(chunk8b2): UI completa del tab. Panel de contexto del expediente (tarjeta de hipotesis elegida, contadores de fuentes por estado con badges de color, avisos de VHP previas y de iteraciones previas del Validador), form de generacion con textarea de notas opcionales y boton dinamico Generar/Regenerar, panel de resultado con titulo + bajada + lead destacado + cuerpo en secciones + cierre + metadata con badges + listas de verificaciones criticas resueltas/pendientes + advertencias [VERIFICAR] + notas editoriales del modelo, boton "Copiar al portapapeles" en modo texto plano (titulo + bajada + lead + cuerpo + cierre, sin metadata ni markdown), y boton "Avanzar a Visual" que invoca `handlePipelineAction('advance')`.

Decision arquitectonica registrada (Opcion A del open question previo): el Generador de Borrador NO reinterpreta el pitch viejo y NO lee `data.pitch` bajo ninguna circunstancia. El pitch es para editores externos, el borrador es para la audiencia final. Son artefactos con propositos distintos. La validacion en produccion confirmo que la separacion es operativamente sana: ningun brand-voice drift observado.

Hallazgos de validacion: ver seccion "Hallazgos de validacion — Chunk 8 (11 abril 2026)" mas arriba.

### Chunk 9 — Refinements [COMPLETADO 11 abril 2026]

Cerrado en una sola sesion de trabajo dividida en cuatro sub-chunks secuenciales, cada uno con build limpio + commit + push + validacion visual por el operador antes de avanzar al siguiente:

- `7d740bf` feat(chunk9a): refinamientos de prompts. A1 subordinacion explicita de la regla de extension del `generador_borrador` a la regla anti-fabricacion + obligacion de declarar en `notas_editoriales` cuando la extension real queda por debajo del rango minimo de la familia. D1 eliminacion de la categoria `dato_referencial` del prompt de `buildAngulosPrompt`, con nota explicita que prohibe su uso por actuar como atajo de fabricacion. Toca solo `prompts.ts`.

- `194ca07` feat(chunk9b): refinamientos de UX del Borrador y navegacion del VHP. B1 prefill del textarea `borradorOperadorNotas` desde `data.borrador.notasOperador` al montar el tab, patron identico al prefill del Constructor de Pitch. B2 fallback de copia al portapapeles: textarea oculto + focus + select + alert con instruccion de Ctrl+C cuando `navigator.clipboard.writeText` falla. C3 boton secundario "Ir al Generador de Hipotesis" debajo del mensaje del placeholder VHP bloqueado. Toca solo `ProjectDetailClient.tsx`.

- `9042321` feat(chunk9c): URL en ODF, curacion del historial Validador, soft gates pipeline. C1 campo `url` opcional por `Fuente` en ODF: nuevo input en el form entre rol/origen y grid de estado/confianza, link clickeable en el listado con `target=_blank`. C2 curacion del historial del Validador de Borrador: dos handlers nuevos (`handleMarcarValidacionDefinitiva`, `handleEliminarValidacionBorrador`), nuevo campo `data.validacion_borrador_definitiva_id`, badge verde "Definitiva" en el header de la tarjeta marcada, fila de botones dentro del panel expandido, eliminacion de la entrada definitiva limpia el puntero atomicamente en el mismo PATCH. E1 soft gates confirmables en `handlePipelineAction`: avanzar `validacion -> pesquisa` sin hipotesis elegida dispara confirm, avanzar `pesquisa -> produccion` con fuentes vacias dispara confirm, ambos coexisten con el hard-block `TRASPASO_REQUIRED`. Toca solo `ProjectDetailClient.tsx`.

- `4fe106a` feat(chunk9d): pipeline sin tesis obligatoria y cleanup de ruta legacy. F1 placeholder informativo en el render de `project.thesis` cuando es null/vacio ("Aun no hay tesis definida. Puedes generar hipotesis en la fase Validacion y la tesis va a emerger de la hipotesis que elijas."), polish del label del form a "(opcional)" y del helper text en espaniol neutro. Hallazgo del reconocimiento: F1 ya estaba 80% implementado a nivel backend y validacion de form desde chunks anteriores, el trabajo real fue solo cosmetico. G1 eliminacion del directorio `src/app/tools/` entero: borra `tools/angulos/page.tsx`, `tools/angulos/AngulosClient.tsx`, `tools/angulos/layout.tsx` y los dos directorios contenedores. Remueve el link a `/tools/angulos` del array `links` en `Nav.tsx`. El build inicial fallo por stale typegen de Next.js 16 con Turbopack; fix aplicado con `rm -rf .next && npm run build` y documentado como hallazgo operacional (ver seccion "Hallazgos de validacion — Chunk 9 (11 abril 2026)" mas arriba).

Hallazgos de validacion: ver seccion "Hallazgos de validacion — Chunk 9 (11 abril 2026)" mas arriba.

### Chunk 10 — Agenda de Editores manual [COMPLETADO 11 abril 2026]

Cerrado en una sola sesion de trabajo dividida en tres sub-chunks secuenciales, cada uno con validacion antes del siguiente:

- `8523e74` feat(chunk10a): schema `editores_agenda` + CRUD API. Nueva tabla en Drizzle + init-sql.ts con 15 columnas (`id`, `nombre`, `apellido`, `medio`, `seccion`, `tier`, `tenants_relevantes` jsonb array, `tipo_pieza_recomendado` jsonb array, `email`, `telefono`, `notas`, `ultima_verificacion`, `activo`, `created_at`, `updated_at`) + dos indices (`idx_editores_activo`, `idx_editores_tier`). Dos endpoints nuevos: `GET`/`POST /api/editores` y `GET`/`PATCH /api/editores/[id]`. Sin DELETE por diseno: soft-delete via `PATCH { activo: false }`, marcar verificado via `PATCH { marcarVerificado: true }`. Tenants referenciados por slug dentro del jsonb, sin FK. Smoke test en produccion validando los cuatro primitivos del CRUD + las semanticas de nullable, jsonb round-trip, updatedAt auto-advance, y preservacion de campos ausentes en PATCH parcial.

- `3f31a66` feat(chunk10b): UI CRUD en `/admin/editores`. Nueva ruta admin (primera del segmento `/admin/*`): `page.tsx` como server component que resuelve en paralelo la lista de tenants disponibles (poblando los checkboxes del form) y la lista inicial de editores (listado), y `EditoresClient.tsx` como client component con todo el CRUD en una sola pagina. Decision de diseno: listado + form de alta colapsable + edicion inline por fila (acordeon), en lugar del patron de tres rutas (`/new`, `/[id]`) usado por `/projects`. El volumen esperado (<100 entradas) y la ergonomia del operador en un CRUD de contactos (ver todo, editar rapido, salir) justifican la pagina unica. Toggle "Mostrar inactivos" como undo natural del soft-delete, sin confirmacion adicional, alineado con el principio de Chunk 9 de soft gates sobre hard gates cuando el riesgo es recuperable. Acciones por tarjeta: Editar inline, Verificar hoy, Desactivar/Reactivar condicional. Link "Editores" agregado a `Nav.tsx` como tercer item. Validado visualmente en produccion.

- `e2179fc` docs(chunk10): cierre documental del Chunk 10 (esta edicion). Hallazgos de validacion agregados arriba.

Decision arquitectonica registrada: los jsonb arrays en `editores_agenda` son `.notNull().default([])` (no nullable), contrario a la convencion de las tablas antiguas (`tenants.brand_variants`, `templates.required_visual_slots`) que son jsonb nullable con default. La razon es que el codigo consumidor es mas simple si la shape esta garantizada como array, y las tablas nuevas adoptan esta convencion. Las tablas antiguas se mantienen nullable por retrocompat.

Hallazgos de validacion: ver seccion "Hallazgos de validacion — Chunk 10 (11 abril 2026)" mas arriba.

### Chunk 11 — Integracion agenda-pitch [COMPLETADO entre 11 y 12 abril 2026]

Cerrado en una sesion intermedia entre el cierre del Chunk 10 (`182023f`) y la sesion del 12 abril donde se descubrieron los hallazgos del Chunk 12. Dos sub-chunks secuenciales mergeados directamente a `main`, sin sub-chunk documental hasta el cierre retroactivo del Chunk 12A:

- `7596b71` feat(chunk11a): endpoint sugerencias de editores con relajacion progresiva. Nuevo endpoint `GET /api/editores/sugerencias?tenantSlug={slug}&tier={n}&templateFamily={family}`. Filtro duro en SQL via Drizzle: `activo = true AND tier <= tierObjetivo`. Sobre el subset filtrado, clasificacion in-memory en tres buckets (relajacion progresiva): `exacto` (tenants_relevantes incluye tenantSlug AND tipo_pieza_recomendado matchea templateFamily), `sin_tipo` (solo tenant), `sin_tenant` (solo tipo). Los que no cumplen ni tenant ni tipo quedan fuera del resultado. Match case-insensitive bidireccional con `.includes()` (sin normalizacion de acentos: las entradas canonicas las define el operador). Mapeo `FAMILY_TO_TIPOS`: prensa -> reportaje/nota/entrevista/cronica/investigacion, opinion -> columna/opinion/editorial/tribuna, institucional -> comunicado/institucional/declaracion, academico -> paper/academico/analisis/ensayo. Response shape: `{ success, sugerencias: [{editor, match}], meta: { tenantSlug, tier, templateFamily, totalExacto, totalSinTipo, totalSinTenant } }`.

- `51ce578` feat(chunk11b): panel de sugerencias de editores en Constructor de Pitch. UI completa del consumidor del endpoint 11A. Estado React local en `ProjectDetailClient.tsx`: `tierObjetivo` (default 1), `sugerencias[]`, `sugerenciasMeta`, `sugerenciasLoading`, `sugerenciasError`, `editorElegidoId`, `editorElegidoNombre`, `editorElegidoMedio`. Hidratacion inicial: `useEffect` que lee `data.pitch.tierObjetivo` cuando `project?.id` cambia (deps array intencional con eslint-disable para que un refetch del mismo project no resetee el tier que el operador acaba de cambiar manualmente). Fetch automatico con debounce de 300ms cuando cambian `tenantSlug`, `templateFamily` o `tierObjetivo`. Toggle handler `handleElegirEditor`: click en una card elige el editor (setea los tres campos snapshot + `pitchMedio`); click en la misma card lo deselecciona. Persistencia: cuatro campos nuevos en `data.pitch` (`tierObjetivo`, `editorId`, `editorNombreSnapshot`, `editorMedioSnapshot`) que viajan en el `pitchPayload` cuando se construye el pitch. JSX condicional al `project.hasTenant && project.templateFamily`: dropdown de tier con cuatro opciones (Tier 1 Nacional/Internacional, Tier 2 Regional, Tier 3 Sectorial, Tier 4 Nicho/Comunitario), contador de resultados, listado agrupado por nivel de match (Match exacto / Tipo no confirmado / Tenant no listado).

Decision arquitectonica registrada: la relajacion progresiva por buckets fue elegida sobre scoring numerico por dos razones — (a) explicabilidad: un editor en el bucket "sin_tipo" significa exactamente "es de tu tenant pero no es su tipo de pieza habitual", lo cual el operador interpreta al instante; (b) simplicidad: el frontend recibe un array ya ordenado y solo tiene que renderizarlo, sin ordenamiento adicional. El match case-insensitive bidireccional con `.includes()` tolera variantes de cómo el operador escribió los tipos sin imponer un controlled vocabulary rigido, alineado con la filosofia de Chunk 10 de no automatizar el juicio del operador.

Hallazgos de validacion: ver seccion "Hallazgos de validacion — Chunk 11 (12 abril 2026)" mas arriba.

### Chunk 12 — Pesquisa Aplicada y Realineacion del Pipeline Editorial [COMPLETADO 12 abril 2026]

Cerrado en una sola sesion de trabajo dividida en siete sub-chunks secuenciales. El chunk mas grande del proyecto: resuelve el bug arquitectonico del Constructor de Pitch, introduce el loop de pesquisa externa, y establece la filosofia del producto.

- `3b2702c` docs(chunk12a/chunk11): cierre retroactivo del Chunk 11. Documenta los hallazgos del Chunk 11 (bug del Pitch descubierto en retrospectiva), marca Chunk 11 como COMPLETADO, introduce la seccion "Workflow operativo entre sesiones" con las dos disciplinas (una sesion un chunk + snapshot del repo al inicio).

- `6e8474a` feat(chunk12b): exportador de pesquisa externa + bonus idioma neutro en prompts. Modal en el tab del Borrador con prompt pre-formateado para Claude.ai (6 bloques: encabezado, datos del project, verificaciones criticas pendientes, advertencias, instrucciones, idioma+geografia). Constante `IDIOMA_NEUTRO_RULE` inyectada en los 5 prompts build* IP + buildGeneradorBorradorPromptMP. Las 4 funciones build*MP restantes heredan via `const basePrompt = build*()`.

- `5ddcba3` feat(chunk12c): auto-invalidacion del borrador y soft gate de avance. Backend: deteccion automatica de aumento de fuentes en el PATCH + flag `data.borrador.desactualizado = true`. Frontend: dos campos nuevos en BorradorData (`fuentes_count_al_generar`, `desactualizado`), banner amarillo con contador, label dinamico del boton ("Regenerar con evidencia actualizada"), soft gate confirmable en `produccion -> visual` con borrador desactualizado.

- `f2fa14d` feat(chunk12d): refinamiento prompt Generador de Borrador modo evidencia. Nueva seccion "REGLA DE MODO DE OPERACION" en buildGeneradorBorradorPromptMP: modo 1 diagnostico (ODF vacio, borrador cauteloso con muchos `[VERIFICAR]`) vs modo 2 evidencia disponible (ODF con fuentes verificadas/contactadas, borrador afirmativo citando fuentes). Deteccion automatica del modo. Declaracion obligatoria en `notas_editoriales`.

- `3d7303a` feat(chunk12e): refactor constructor pitch a fase produccion consume borrador validado. Pitch movido de fase `pesquisa` a `produccion` en PHASE_CONFIG (despues del Borrador). Handler refactorizado: guard de borrador validado, userMessage construido desde borrador.titulo/bajada/lead/cuerpo/cierre + metadata.fuentes_citadas + verificaciones. Prompt reescrito: "transforma este borrador en un pitch", regla anti-fabricacion absoluta, `[PENDIENTE]` reemplaza `[POR VERIFICAR]`. Integracion agenda-pitch del Chunk 11B preservada intacta.

- `393b376` feat(chunk12f): ocultar hipotesis descartadas tras eleccion en listado. IIFE en el .map() del listado de hipotesis: si hay elegida, las descartadas se agrupan en `<details>` colapsable con `opacity-60`. Sin elegida, listado completo como antes.

- `3e6e129` docs(chunk12g): cierre documental del Chunk 12. Secciones filosoficas "Por que existe IPMP" y "Filosofia del producto: filantropia digital" agregadas al inicio de CLAUDE.md. Hallazgos del Chunk 12 (bug del Pitch, loop de evidencia, modo diagnostico/evidencia, clausula de detencion, principio "asiste no automatiza", deuda tecnica codigo muerto). Chunk 12 marcado COMPLETADO en el Roadmap.

Decision arquitectonica registrada: la inversion de dependencia Borrador→Pitch es la decision mas importante del Chunk 12. El Borrador se construye desde el expediente (hipotesis + fuentes + validaciones). El Pitch se construye desde el Borrador. Cada artefacto tiene un consumidor rio abajo, nunca rio arriba. Esta cadena unidireccional es la traduccion tecnica del "proceso disciplinado" descrito en "Por que existe IPMP".

Hallazgos de validacion: ver seccion "Hallazgos de validacion — Chunk 12 (12 abril 2026)" mas arriba.

### Chunk 13 — Cleanup tecnico y exportador basico [COMPLETADO 12 abril 2026]

- **13A** `f626ed9` refactor(chunk13a): cleanup codigo muerto post-12E estados pitch y color huerfano.
- **13B** `9d74c15` feat(chunk13b): exportador basico ZIP fase exportado.
- **13C** `79beaa1` docs(chunk13c): cierre documental Chunk 13.

### Chunk 14 — Reordenamiento Visual y Generador de Prompt [COMPLETADO 12 abril 2026]

- **14A** `a0b9595` feat(chunk14a): mover fase visual al final del pipeline post-aprobado.
- **14B** `3b4b6e2` feat(chunk14b): tab Visual generador de prompt estructurado fase visual.
- **14C** Sin codigo — decision documentada en hallazgos 14G (Bitacora como workflow externo).
- **14G** `c50b4d7` docs(chunk14g): cierre documental Chunk 14.

Decision arquitectonica registrada: el tab Visual opera como generador
de prompt estructurado, no como generador de imagen. La posicion
correcta en el pipeline es despues de 'aprobado' y antes de 'exportado'.
El prompt generado incluye 6 claves derivadas del borrador aprobado y
es directamente usable en herramientas externas de generacion de imagen.
El modelo actua como director de arte periodistico: no inventa elementos
visuales ausentes del borrador.

### Chunk 15 — Upload de documentos fuente en el ODF [COMPLETADO 12 abril 2026]

- **15A** `8097519` feat(chunk15a): infraestructura Vercel Blob endpoints upload y delete fuentes.
- **15B** `058d4e1` feat(chunk15b): UI upload archivos por fuente ODF integrado con Vercel Blob.
- **15B fix** `7865763` fix(chunk15b): cambiar access blob a private compatible con store configuracion.
- **15C** `fa01e09` feat(chunk15c): contrato deletion blob al eliminar fuente ODF best-effort.
- **15G** `21b455a` docs(chunk15g): cierre documental Chunk 15.

Decision arquitectonica registrada: el upload de archivos usa Vercel Blob
con access privado. Las URLs generadas tienen token temporal incorporado
y son directamente accesibles via link sin infraestructura adicional de
signed URLs. El contrato de deletion es best-effort: el blob se elimina
antes que la fuente, pero si falla, la fuente se elimina igual. Los blobs
huerfanos son recuperables desde el dashboard de Vercel.

### Chunk 16 — Actualizacion de fuentes V2 en el ODF [COMPLETADO 12 abril 2026]

- 16A Sin codigo — decision documentada: los dos canales de error
  borradorError y genBorradorError son disjuntos, viven en tabs
  distintos, y el prefijo gen ya los distingue. La consolidacion
  en un objeto errors seria abstraccion prematura sin consumidor
  que la justifique. El patron de namespace por prefijo (gen* para
  generadores, sin prefijo para validadores) documentado en Chunk 8
  se mantiene como convencion activa.

- `d388d50` feat(chunk16b): actualizacion fuentes V2 con historial V1
  en ODF. Interfaz Fuente: 4 campos opcionales nuevos (archivo_url_v1,
  archivo_nombre_v1, archivo_size_v1, archivo_replaced_at).
  parseFuenteFromRaw: parsing de los 4 campos con type guards.
  handleUploadArchivo: backup de campos actuales a _v1 ocurre solo
  despues de upload exitoso — si falla, fuente queda intacta.
  UI card ODF: boton "Reemplazar archivo (V2)" cuando ya existe archivo,
  badge "V2 activa - V1 archivada" cuando archivo_replaced_at existe.
  Nota: archivo_size_v1 queda undefined en el primer reemplazo porque
  archivo_size no se persistia en el upload inicial (Chunk 15). Se
  populara automaticamente en reemplazos sucesivos.

- **16G** `ade2cc8` docs(chunk16g): cierre documental Chunk 16.

Decision arquitectonica registrada: el contrato de V2 es aditivo, no
destructivo. El blob V1 no se elimina — queda referenciado en
archivo_url_v1 para trazabilidad forense. Solo el archivo activo
(archivo_url) es visible al operador. El V1 es recuperable desde
el dashboard de Vercel Blob si se necesita.

### Chunk 17 — Asset Library per tenant [COMPLETADO 12 abril 2026]

- **17A** `c31badc` feat(chunk17a): tabla tenant_assets + API completo
  Asset Library. Schema: 14 columnas con declaracion_ia (boolean
  notNull), alt_text (text notNull), origen (text notNull) como
  metadata obligatoria. Endpoints: GET por tenantSlug, POST upload
  blob (access privado, patron identico a /api/fuentes/upload),
  POST registro con validacion de metadata obligatoria en el API
  (no solo en UI), PATCH metadata, PATCH deactivate con blob delete
  best-effort. Tabla creada via /api/admin/init (IF NOT EXISTS).
  Dos indices: idx_tenant_assets_tenant, idx_tenant_assets_activo.

- **17B** `6991685` feat(chunk17b): UI Asset Library en /admin/assets.
  Server component page.tsx con fetch de tenants para selector.
  Client component AssetLibraryClient.tsx: selector de tenant,
  formulario upload en dos pasos (POST /upload blob -> POST registro
  con metadata), grilla responsive con thumbnail para imagenes e
  icono para PDFs/otros, badge amarillo "Generado con IA", acciones
  Ver archivo (nueva pestana) y Desactivar con confirm dialog,
  estado vacio cuando no hay assets. Nav.tsx: link "Assets" agregado
  al array links apuntando a /admin/assets.

- **17G** `bc7a5fd` docs(chunk17g): cierre documental Chunk 17.

Decision arquitectonica registrada: la tabla tenant_assets es una
entidad separada de la tabla assets existente. La tabla assets
(Chunks 1-6) modela slots visuales por proyecto con semantica
editorial forense: FK a projects.id, campos tipo (hero_narrativa,
still_marca), origin (ia_generated, real_photo), representsRealPerson,
consentDocUrl. La tabla tenant_assets modela una biblioteca
reutilizable de recursos por tenant, independiente del pipeline de
proyectos: FK a tenants.id, campos de metadata periodistica
obligatoria (declaracion_ia, alt_text, origen). Ambas coexisten sin
colision. Patron documentado: cuando dos entidades comparten el
dominio de archivos pero tienen ciclos de vida y consumidores
distintos, se crean tablas separadas antes que modificar una tabla
existente con FK activas.

Los tres campos de metadata obligatoria (declaracion_ia, alt_text,
origen) son obligatorios en el API, no solo en la UI. Rechaza con
400 si falta cualquiera. Esta decision implementa directamente la
regla de branding del CLAUDE.md: los assets generados con IA deben
declararse como tales en metadata y creditos.

El upload en dos pasos (POST /upload blob -> POST /tenant-assets
registro) es un contrato explicito de la UI. Si el Paso A tiene
exito pero el Paso B falla, el blob queda huerfano recuperable
desde el dashboard de Vercel Blob. Mismo contrato best-effort del
Chunk 15, no se introduce logica de rollback porque la complejidad
no esta justificada para el volumen actual.

### Chunk 18 — Flujo canonico IPMP y gates de pipeline [COMPLETADO 13 abril 2026]

- **18A** `28ebf10` feat(chunk18a): gate de exportacion por
  completitud del genero. Hard block antes de avanzar a exportado.
  Cinco condiciones verificadas contra parametros del template:
  C1 extension_palabras >= minimo por familia, C2 fuentes_citadas
  >= 1, C3 borrador no desactualizado, C4 validacion definitiva
  score >= 3.5, C5 pitch posterior al borrador. Constante
  EXPORT_REQUIREMENTS por familia (prensa 800, opinion 400,
  institucional 1000, academico 1500). Panel UI con check/X
  por condicion, boton Cerrar.

- **18A-fix** `74bd959` feat(chunk18a-fix): gate bloquea
  correctamente con borrador null. Guard C0 al inicio de
  evaluateExportGate: si data.borrador es null, retorna
  passed: false con condicion C0 descriptiva sin evaluar C1-C5.
  C5 con descripcion condicional explicita para pitch null,
  borrador sin fecha, pitch anterior, pitch posterior.

- **18B** `c8a81d6` feat(chunk18b): generador borrador IP en
  fase pesquisa con extraccion de archivos ODF. Nuevo endpoint
  POST /api/fuentes/extract-content (mammoth para docx,
  pdf-parse para pdf, utf-8 para txt, best-effort, trunca a
  12000 chars). Nuevo builder buildGeneradorBorradorIPPrompt()
  en prompts.ts: modo diagnostico (600-900 palabras, [VERIFICAR])
  vs modo evidencia (1500-2500 palabras, cita fuentes por nombre),
  deteccion automatica segun fuentesConContenido.length.
  Nueva tool generador_borrador_ip en ToolName, IP_PROMPT_BUILDERS
  y VALID_TOOLS. Tab Borrador IP en PHASE_CONFIG.pesquisa con
  handler handleGenerateBorradorIP: extrae archivos ODF en paso 1,
  genera en paso 2, guarda en data.borrador_ip (separado de
  data.borrador MP) en paso 3.

- **18C** `b3fafea` feat(chunk18c): gate borrador IP requerido,
  MP consume IP, pitch movido post-visual. Tres cambios:
  (A) Hard block BORRADOR_IP_REQUIRED en route.ts antes de
  TRASPASO_REQUIRED: no se puede avanzar a produccion sin
  data.borrador_ip. (B) handleGenerateBorrador (MP) inyecta
  data.borrador_ip al inicio del userMessage como contexto
  prioritario con instruccion de usarlo como base y fuente de
  verdad, aplicando genero/voz/estructura del template sobre el.
  (C) Tab pitch movido de PHASE_CONFIG.produccion a
  PHASE_CONFIG.visual, despues del Generador de Prompt Visual.

- **18G** `34947f6` docs(chunk18g): cierre documental Chunk 18.

Decision arquitectonica registrada: el flujo canonico IPMP
queda establecido en el Chunk 18 como cadena unidireccional
de artefactos con gates obligatorios en cada transicion:

  hipotesis elegida
    → fuentes ODF con archivos adjuntos
    → borrador IP (generado por la plataforma desde los archivos)
    → [gate BORRADOR_IP_REQUIRED]
    → validacion IP (score >= 3.5 para exportar)
    → traspaso: operador elige marca + genero
    → [gate TRASPASO_REQUIRED]
    → borrador MP (toma IP como base, aplica genero y marca)
    → revision (informativa: muestra score IP)
    → aprobado → Vista Previa
    → prompt visual + imagen externa
    → [gate EXPORT_GATE_FAILED: 4 condiciones C1-C4]
    → exportado: ZIP con 3 .docx + imagen + proyecto.json

Cada artefacto tiene un consumidor rio abajo, nunca rio arriba.
El operador decide cuando generar cada artefacto y firma cada
transicion. La plataforma asiste, no automatiza.

El Generador de Borrador IP es el nucleo del producto: lee el
contenido de los archivos adjuntos del ODF (docx/pdf/txt via
extract-content), genera el documento de investigacion en modo
evidencia cuando hay archivos, en modo diagnostico cuando no hay.
El modo diagnostico es el estado correcto cuando el expediente
esta incompleto — no un error. El borrador MP toma ese documento
y aplica el tratamiento periodistico del genero elegido en el
traspaso. La plataforma hace internamente lo que antes requeria
herramientas externas (Cowork/Opus).

La separacion InvestigaPress/MetricPress queda operativamente
completa: IP produce el periodismo puro sin marca, MP produce
el insumo final con marca y genero. El traspaso es el momento
de la decision editorial, no de la creacion.

### Chunk 19 — UX polish, integridad del validador, validador IP, deuda tecnica [COMPLETADO 13 abril 2026]

- **19A** `25334f9` feat(chunk19a): UX polish — template descriptions,
  thesis subordination, pitch-stale badge. Tres cambios en
  ProjectDetailClient.tsx: (1) constante TEMPLATE_DESCRIPTIONS con
  13 slugs reales del seed-data, descripcion renderizada bajo el
  select de template en el modal de traspaso. (2) thesis subordinada
  con opacity-50 cuando existe hipotesis_elegida, badge verde "Activa"
  en hipotesis elegida, cuatro ramas de renderizado. (3) banner amber
  informativo en el tab de pitch cuando pitch.generadoEn < borrador.generadoEn,
  sin bloquear el form.

- **19B** `5eb62ba` feat(chunk19b): validador binding borrador activo —
  prefill, banner divergencia, restaurar. Helper buildBorradorTextoPlano()
  extraido como funcion reutilizable (reemplaza inline del boton copiar).
  useEffect prefill de borradorTexto desde MP -> IP -> vacio con dep
  [project?.id]. Banner orange cuando textarea difiere del borrador
  activo (comparacion con .trim()). Boton "Restaurar borrador" que
  re-ejecuta el prefill. Sin boton ni banner cuando no hay borrador activo.
  Resuelve GRAVE-1 de la auditoria del Chunk 17.

- **19C** `dc0bedc` feat(chunk19c): validador tono IP en fase pesquisa —
  tool validador_tono_ip, tab UI, score apto_para_traspaso. Nueva tool
  validador_tono_ip en ToolName, IP_PROMPT_BUILDERS, MP_PROMPT_BUILDERS
  y VALID_TOOLS. Prompt con 4 dimensiones IP sin brand-alignment: rigor
  periodistico, extension y estructura, calidad de fuentes citadas, modo
  de operacion declarado. JSON con apto_para_traspaso (score >= 3.0).
  Tab "Validador IP" en PHASE_CONFIG.pesquisa despues del Borrador IP.
  Estados React con prefijo ip. Handler handleValidarBorradorIP sin
  tenant/template (modo IP puro). Resultado efimero en React, sin
  persistencia en data. UI identica en estructura al validador MP con
  labels adaptados.

- **19D** `1bfc9ec` feat(chunk19d): rename borrador.borrador a
  borrador.contenido con retrocompat dual-read. Archivos tocados:
  ProjectDetailClient.tsx, export/route.ts. BorradorData.borrador
  renombrado a BorradorData.contenido; campo legacy borrador? opcional
  preservado para retrocompat TypeScript. parseBorradorFromRaw con
  lectura dual raw.contenido ?? raw.borrador — proyectos existentes
  con clave vieja siguen funcionando sin migracion. buildBorradorTextoPlano
  usa data.contenido. ~25 accesos TypeScript actualizados. export/route.ts
  borradorToMarkdown con lectura dual. Pitch guard y export context panel
  corregidos (bug preexistente: leian titulo en nivel incorrecto). Grep
  post-cambio confirma cero referencias al nesting viejo en lectura y
  escritura.

Decision arquitectonica registrada: el rename usa lectura dual sin
migracion de base de datos. Los proyectos existentes en Railway con
data.borrador.borrador se leen correctamente via raw.contenido ?? raw.borrador.
Los proyectos nuevos persisten con data.borrador.contenido. La clave
vieja queda como campo opcional en la interfaz TypeScript hasta que
todos los proyectos existentes sean regenerados naturalmente. No hay
ALTER TABLE ni script de update masivo.

### Chunk 20 — Exportador Word, Vista Previa, UX pipeline [COMPLETADO 13 abril 2026]

- **fix(extract-content)** `2066e2f` limite de truncacion de
  archivos adjuntos aumentado de 12.000 a 50.000 caracteres.
  Respuesta expandida con metadata: charCount, truncated,
  originalLength. Banner amber en UI cuando un archivo fue
  procesado parcialmente. Resuelve cuello de botella real
  detectado con documento de investigacion de 22.163 caracteres.

- **fix(ai-generate)** `9d310c0` limite de userMessage en
  /api/ai/generate aumentado de 10.000 a 120.000 caracteres.
  Cubre documentos de investigacion con multiples fuentes
  adjuntas sin exceder la ventana de contexto del modelo
  (Claude Sonnet: 200K tokens). Resuelve segundo cuello de
  botella del pipeline end-to-end con documentos reales.

- **20A** `5329ac5` feat(chunk20a): tres features en
  ProjectDetailClient.tsx y export/route.ts:
  (1) Labels descriptivos con subtitulo en text-xs italic
  en todos los tabs modificados del pipeline: "Borrador IP —
  Documento de Investigacion", "Validador IP — Score
  pre-traspaso", "Borrador Final — Insumo Periodistico",
  "Validador — Control de Calidad", "Prompt Visual —
  Instruccion para IA", "Pitch — Propuesta para Editor".
  (2) Upload de imagen generada externamente en tab Prompt
  Visual: input file (jpg/png/webp, max 10MB), handler
  handleUploadImagenVisual via /api/fuentes/upload, persiste
  en data.imagen_visual, thumbnail preview con opcion
  Reemplazar/Eliminar. Nuevo tipo ImagenVisualData.
  (3) Tab "Vista Previa — Lectura Final" en fase aprobado:
  renderiza el insumo periodistico completo sin chrome
  tecnico (titulo, bajada, lead, cuerpo, cierre), thumbnail
  de imagen si existe, footer con palabras/fuentes/score,
  boton retroceso a Produccion con confirm.

- **fix(export)** `ab771e4` tres fixes en export/route.ts y
  ProjectDetailClient.tsx:
  (A) Imagen en ZIP via @vercel/blob SDK: reemplaza fetch()
  directo por blobGet() con autenticacion automatica via
  BLOB_READ_WRITE_TOKEN, helper streamToBuffer() para
  convertir ReadableStream a Buffer compatible con JSZip.
  Best-effort: ZIP se genera sin imagen si el fetch falla.
  (B) Archivos Word (.docx) en ZIP: instalado paquete docx,
  cuatro builders (buildBorradorDocx, buildPitchDocx,
  buildFuentesDocx, buildHipotesisDocx). borrador.docx con
  encabezado meta, titulo H1, bajada italic con borde, lead
  con fondo sutil, cuerpo justificado, cierre con borde,
  footer IPMP. pitch.docx con asunto, cuerpo, detalles de
  envio. fuentes.docx tabla 5 columnas con header azul y
  filas alternas. hipotesis.docx con campos y verificaciones
  numeradas. proyecto.json se mantiene como expediente
  tecnico. ZIP ahora contiene 7 archivos para este proyecto.
  (C) Boton "Avanzar a Visual" eliminado del tab Borrador MP
  en fase produccion — redundante con la barra del pipeline.

- **feat(export)** `0165145` nombres de archivos del ZIP con
  genero periodistico y titulo: helper buildNombreArchivo()
  que sanitiza templateName (normaliza NFD, elimina acentos
  y caracteres especiales) y titulo (truncado a 50 chars en
  palabra completa). Ejemplos: "Cronica narrativa — El
  ascenso silencioso Claude AI duplica.docx", "Cronica
  narrativa — Pitch editorial.docx".

Decision arquitectonica registrada: el exportador del Chunk
20 es un exportador de producto terminado, no de estado. Los
cuatro archivos Word representan los artefactos editoriales
del pipeline en formato apto para stakeholders sin acceso a
la plataforma. El proyecto.json preserva el expediente
tecnico completo para trazabilidad. Esta arquitectura
implementa el Principio 4 de filantropia digital:
portabilidad total de los datos del usuario.

Gap arquitectonico identificado y resuelto: el pipeline
carecia de una instancia de lectura del insumo final antes
de exportar. La Vista Previa en fase aprobado cierra ese gap.
Gap de imagen externa resuelto: la imagen generada en
herramientas externas (Manus, Midjourney) ahora tiene hogar
en el pipeline via upload en tab Prompt Visual.

### Chunk 21 — Dashboard de consumo por tenant [COMPLETADO 13 abril 2026]

- **21A** `e24e82c` feat(chunk21a): GET /api/admin/consumo endpoint
  con filtros tenant/year/month, GROUP BY mes+tenant+tool,
  aggregacion tokens y costo USD desde consumption_logs.
  Auth via query param token vs ADMIN_TOKEN (mismo patron
  que /api/admin/init). Response shape: ok, filters, summary
  (totalInputTokens, totalOutputTokens, totalTokens,
  totalEstimatedCost, rowCount), rows con mes/tenantId/
  toolName/inputTokens/outputTokens/totalTokens/estimatedCost.

- **21B** `95063d7` feat(chunk21b): UI dashboard /admin/consumo.
  Server component page.tsx con fetch de tenants para selector.
  Client component ConsumoClient.tsx con tres filtros (tenant,
  ano, mes), cuatro tarjetas de resumen, tabla de detalle con
  7 columnas. Auth: adminToken pasado como prop desde server
  component (mismo patron que /admin/editores y /admin/assets).
  tenantNameMap resuelve UUID a nombre legible en la tabla.
  Link "Consumo" agregado a Nav.tsx.

- **21G** Este cierre documental.

Decision arquitectonica registrada: el dashboard de consumo lee
de consumption_logs sin modificar el contrato de trackUsage()
(fire-and-forget). El costo USD ya estaba persistido por
usage-tracker.ts desde el Chunk 6. El endpoint es read-only
y no introduce writes adicionales. La auth via query param
token es consistente con los demas endpoints /api/admin/*.
La decision de pasar adminToken como prop desde el server
component (en vez de crear un proxy o middleware) sigue el
patron establecido en Chunks 10 y 17 para rutas admin
protegidas sin sistema de login.

### Chunk 22+ — Futuros (sin orden definitivo)

- Filtros en listado de proyectos (Chunk 22): filtro por
  status, tenantId y busqueda por titulo. Editor elegido
  incluido en pitch.docx del ZIP.

- verificaciones_criticas como sistema real (Chunk 24):
  estados persistidos (pendiente/en_curso/confirmada/
  descartada), asociacion a fuentes del ODF, contador
  en pipeline bar.

- Brand-hypothesis reinterpretation post-traspaso (Chunk 25):
  boton reinterpretar hipotesis bajo marca en modal de
  traspaso, campo hipotesis_elegida_brand adicional.

- Auth + apertura a operadores externos (Chunk 28+):
  login por usuario, roles, onboarding. Requiere sesion
  de planificacion propia antes de implementar.

- Deuda tecnica activa: DT-1 campo legacy borrador? en
  BorradorData (eliminar cuando todos los proyectos
  existentes hayan regenerado), DT-2 pitch.pitch vs
  texto_completo, DT-3 tabla assets muerta, DT-4 tabla
  revisions muerta.

## Hallazgos de validacion — Chunk 19 (13 abril 2026)

Chunk 19 cerro los seis futuros documentados al cierre del Chunk 18,
en cuatro sub-chunks secuenciales sin rework. Un hallazgo arquitectonico
emergio durante la ejecucion.

### a) Bug preexistente en pitch guard y export context panel

El Chunk 19D descubrio que el pitch guard (IIFE en el listado de
hipotesis) y el panel de contexto del exportador leian borrRaw.titulo
donde borrRaw es el envelope data.borrador. El titulo vive en
data.borrador.borrador.titulo (clave vieja) o data.borrador.contenido.titulo
(clave nueva), nunca en el nivel del envelope. El check era siempre
undefined, lo que significa que el pitch guard evaluaba la condicion
de borrador disponible incorrectamente. Corregido en 19D con lectura
dual en el nivel correcto. Hallazgo: la clausula de detencion del
prompt pidio grep exhaustivo, lo que permitio que Claude Code
encontrara este bug preexistente que no era parte del scope declarado.

### b) buildBorradorTextoPlano como refactor bonus del 19B

El Chunk 19B extrajo la construccion de texto plano del borrador como
funcion reutilizable buildBorradorTextoPlano(). Esta funcion fue
consumida inmediatamente en tres lugares: el boton "Copiar al
portapapeles" del tab Borrador, el prefill del Validador de Borrador
(19B), y el prefill del Validador IP (19C). La extraccion elimino
duplicacion y garantizo que los tres consumidores producen texto
identico.

### c) GRAVE-1 resuelto operativamente

El hallazgo GRAVE-1 de la auditoria del Chunk 17 (validador evalua
texto externo sin advertir) queda resuelto operativamente en el 19B:
el textarea se prefilla desde el borrador activo, el banner orange
advierte si el operador lo modifica, y el boton Restaurar permite
volver al borrador guardado. No hay hard block — el operador puede
validar texto externo si lo decide conscientemente. La plataforma
asiste, no automatiza.

### d) CRITICO-2 resuelto parcialmente en 19A

La subordinacion visual de thesis a hipotesis_elegida (CRITICO-2 de
la auditoria del Chunk 17) queda resuelta en el 19A. La thesis sigue
visible pero con jerarquia visual subordinada (opacity-50, label
"Tesis original"). La hipotesis elegida aparece prominente con badge
"Activa". El campo thesis sigue en el schema sin cambios — la
resolucion es puramente visual sin tocar datos.

## Hallazgos de validacion — Chunk 18 (13 abril 2026)

Chunk 18 (Gate de Exportacion + Borrador IP + Correcciones de Flujo)
shipped en cuatro sub-chunks ejecutados en una sola sesion de trabajo.
El chunk cierra el gap arquitectonico central identificado en la
auditoria del Chunk 17: el exportador del Chunk 13B era un exportador
de estado, no de producto terminado. Cinco hallazgos emergieron.

### a) El exportador era de estado, no de producto — ahora hay gate

Antes del Chunk 18A, el pipeline permitia avanzar a fase exportado
sin verificar si el contenido cumplia los estandares minimos del
genero elegido. El unico hard block era TRASPASO_REQUIRED en
pesquisa -> produccion. El gate de exportacion EXPORT_GATE_FAILED
introduce cinco condiciones verificadas contra parametros del template
(extension minima, fuentes citadas, borrador actualizado, validacion
definitiva, pitch posterior al borrador). Solo cuando las cinco
condiciones se cumplen el ZIP representa un insumo periodistico
terminado. El fix 18A-fix agrego un guard C0 para el caso de
borrador null (proyecto que llego a exportado sin generar borrador),
cerrando un edge case donde las cinco condiciones se evaluaban sobre
undefined y pasaban silenciosamente.

### b) Borrador IP resuelve la dependencia Cowork sin automatizar

El Generador de Borrador IP (18B) resuelve el problema de que el
operador necesitaba salir de IPMP para generar el documento de
investigacion en Claude.ai MAX. Ahora el borrador IP se genera
dentro de la plataforma en fase pesquisa, consumiendo las fuentes
del ODF incluyendo el texto extraido de archivos adjuntos (docx,
pdf, texto plano via el endpoint /api/fuentes/extract-content).
El borrador IP opera en dos modos (diagnostico vs evidencia
disponible) heredados del prompt del Chunk 12D. La extraccion de
contenido es best-effort: si falla, el borrador se genera sin ese
contenido, coherente con el principio de no bloquear el flujo
editorial por fallos de infraestructura.

### c) Seis puntos de friccion de la auditoria del Chunk 17 — estado de resolucion

De los seis solapamientos detectados en la auditoria de
METRICPRESS-AC-2026-0001 (Chunk 17 hallazgo c):

- CRITICO-1 (pitch anterior al borrador): resuelto por el gate C5
  del 18A y por el movimiento del pitch a fase visual en 18C-C.
  El pitch ahora se genera despues del borrador aprobado por
  construccion del pipeline.
- CRITICO-2 (thesis vs hipotesis_elegida): parcialmente mitigado.
  La thesis sigue visible pero el borrador IP y MP se construyen
  desde hipotesis_elegida. Resolucion completa diferida a Chunk 19+.
- GRAVE-1 (validador evalua texto externo): no resuelto en Chunk 18.
  Diferido a Chunk 19+ como feature de binding entre validador y
  borrador activo.
- GRAVE-2 (data.borrador.borrador nesting): no resuelto en Chunk 18.
  El nesting se mantiene por retrocompat con proyectos existentes.
  Diferido a Chunk 19+.
- MODERADO-1 (fuentes_citadas vacia): parcialmente mitigado por el
  gate C2 que requiere al menos una fuente citada para exportar.
- MODERADO-2 (pitch.pitch vs pitch.texto_completo): no resuelto.
  Diferido a Chunk 19+.

### d) El traspaso como decision editorial, no administrativa

El gate BORRADOR_IP_REQUIRED (18C-A) refuerza que el traspaso de
IP a MP es una decision editorial informada: el operador debe haber
generado el documento de investigacion antes de asignar tenant y
template. La secuencia forzada es: investigar (pesquisa con ODF) ->
documentar (borrador IP) -> decidir destino editorial (traspaso) ->
producir (borrador MP que consume el IP como contexto). Esta cadena
unidireccional extiende el principio del Chunk 12: cada artefacto
tiene un consumidor rio abajo, nunca rio arriba.

### e) Pitch movido a post-visual por coherencia de dependencias

El Constructor de Pitch se movio de fase produccion a fase visual
(18C-C) porque su prompt consume el borrador aprobado como base
canonica. En produccion, el borrador aun no esta aprobado — puede
cambiar en revision. En visual, el borrador ya paso por revision y
aprobacion, garantizando que el pitch refleja el contenido editorial
definitivo. Este movimiento tambien resuelve CRITICO-1 de la
auditoria: es imposible que el pitch sea anterior al borrador
porque el pipeline fuerza la secuencia produccion -> revision ->
aprobado -> visual (donde se genera el pitch) -> exportado.

### Notas sobre la ejecucion del Chunk 18

- Los cuatro sub-chunks con codigo (18A, 18A-fix, 18B, 18C) se
  ejecutaron sin rework. El 18B fue el mas grande: nuevo endpoint,
  nuevo prompt builder, registro en ambos registries, y UI completa
  del tab con extraccion de archivos.
- El endpoint /api/fuentes/extract-content usa require() para
  pdf-parse en vez de dynamic import porque TypeScript no resuelve
  el default export de pdf-parse via import(). Documentado con
  eslint-disable para @typescript-eslint/no-require-imports.
- El borrador IP y el borrador MP comparten la misma interfaz
  BorradorData y el mismo parser parseBorradorFromRaw. Se persisten
  en campos separados (data.borrador_ip vs data.borrador) para
  evitar colision y preservar ambos artefactos simultaneamente.
- La inyeccion del borrador IP en el userMessage del borrador MP
  (18C-B) sigue el patron de contexto aditivo: se agrega al inicio
  del mensaje con instruccion explicita de usarlo como base, sin
  modificar la estructura del prompt del sistema.
- El pipeline validado end-to-end tiene 11 pasos: crear proyecto ->
  generar hipotesis -> elegir hipotesis -> cargar fuentes ODF ->
  generar borrador IP -> traspaso -> generar borrador MP -> validar
  -> aprobar -> generar prompt visual + pitch -> exportar ZIP.

## Hallazgos de validacion — Chunk 17 (12 abril 2026)

Chunk 17 (Asset Library per tenant) shipped en dos sub-chunks
ejecutados en una sola sesion de trabajo, mas una auditoria de
pipeline sobre un export real (METRICPRESS-AC-2026-0001) que
genero hallazgos arquitectonicos de alta relevancia para el Chunk 18.

- 17A: schema + API. Build limpio. Tabla creada via /api/admin/init.
- 17B: UI. Validado visualmente en produccion: selector de tenant,
  upload de imagen (thumbnail visible) y PDF (icono visible),
  badge IA, accion ver archivo y desactivar con confirm dialog.

### a) Separacion tabla assets vs tenant_assets

El reconocimiento de 17A detecto que la tabla assets existente tiene
estructura incompatible con la Asset Library per tenant: FK a
projects.id y campos de semantica editorial forense. Se creo
tenant_assets como tabla separada. Patron documentado: no modificar
tablas existentes con FK activas cuando el nuevo concepto tiene ciclo
de vida distinto.

### b) Path de endpoints Blob

El prompt inicial referencio /api/sources/ como path de los endpoints
Blob. El reconocimiento corrigio el path real: /api/fuentes/
(establecido en Chunk 15). La clausula de detencion funciono como
fue disenada.

### c) Auditoria de pipeline — solapamientos detectados en METRICPRESS-AC-2026-0001

Durante la sesion del Chunk 17, se realizo una auditoria de un export
real de la plataforma (METRICPRESS-AC-2026-0001, paper academico sobre
origenes del candombe). La auditoria identifico seis solapamientos o
confusiones en el modelo de datos del pipeline:

CRITICO-1 — Pitch anterior al borrador: los timestamps del export
mostraron pitch.generadoEn (12:07) anterior a borrador.generadoEn
(14:32). El constructor de pitch se ejecuto desde la hipotesis elegida
sin borrador existente, produciendo datos fabricados que no estaban
en ninguna fuente del ODF. No hay indicador en la UI que advierta
cuando el pitch es anterior al borrador. Fix programado en 18A
(condicion 5 del gate de exportacion).

CRITICO-2 — thesis vs hipotesis_elegida: el campo thesis del proyecto
y el titulo de hipotesis_elegida coexisten visualmente como si fueran
igualmente activos. Desde que se elige una hipotesis, thesis es
funcionalmente obsoleta pero permanece visible. El borrador se
construye desde hipotesis_elegida, no desde thesis.

GRAVE-1 — Validador evalua texto externo como borrador: la validacion
definitiva del export tenia score 5 (publicable) sobre un borrador de
542 palabras en modo diagnostico. El validador recibio el contenido
del paper V2 corregido externamente — no el borrador de la plataforma.
El validador no distingue ni advierte cuando el texto que recibe
difiere del borrador activo del proyecto.

GRAVE-2 — data.borrador.borrador (nesting): la ruta real al titulo
del borrador es data.borrador.borrador.titulo. El nesting del mismo
nombre es un accidente de implementacion. Renombrar el objeto interno
a data.borrador.contenido reduce el riesgo de bugs silenciosos en
handlers que lean un nivel incorrecto.

MODERADO-1 — fuentes_citadas vacia con fuentes en ODF: el banner de
borrador desactualizado no especifica que el borrador no cita ninguna
de las fuentes actuales del ODF. El operador puede asumir que el
borrador incorporo las fuentes porque las ve en el ODF.

MODERADO-2 — pitch.pitch vs pitch.texto_completo: el pitch tiene dos
representaciones del mismo contenido. texto_completo es el canonico
(exportado, visible al editor). Los campos estructurados de pitch.pitch
son solo metadatos de generacion.

### d) Gap arquitectonico central identificado en la auditoria

El exportador del Chunk 13B es un exportador de estado, no de producto
terminado. Empaqueta lo que hay en el proyecto al momento de llegar a
fase exportado sin verificar si el contenido cumple los estandares
minimos del genero elegido. El pipeline tiene un unico hard block
(TRASPASO_REQUIRED en pesquisa -> produccion). Todo lo demas, incluido
exportar con borrador de 542 palabras en modo diagnostico, es un soft
gate confirmable o no tiene gate.

El gap se cierra con el gate de exportacion del Chunk 18A: verificacion
de cinco condiciones contra parametros del template antes de permitir
el avance a exportado. Solo cuando esas cinco condiciones se cumplen
el ZIP representa un insumo periodistico terminado.

El genero elegido al crear el proyecto (paper academico, cronica,
reportaje, etc.) ya entra correctamente al prompt del generador de
borrador: aplica estructura, tono y rango de extension. Pero sin
fuentes reales en el ODF, el genero solo puede dar forma al esqueleto.
El producto terminado que el operador espera ver requiere primero
poblar el ODF con evidencia verificada, luego regenerar el borrador
desde esa evidencia, y finalmente que el gate 18A valide que el
resultado cumple los estandares antes de permitir el export.

## Hallazgos de validacion — Chunk 20 (13 abril 2026)

Chunk 20 cierra el gap del exportador (estado → producto
terminado) y resuelve dos cuellos de botella criticos
detectados en validacion end-to-end con documentos reales.

### a) Dos limites bloqueaban el pipeline con documentos reales

La validacion con el documento Investigacion_Claude_AI_
Participacion_Mercado.docx (43.800 bytes, 22.163 chars
extraidos) detecto dos limites hardcodeados que bloqueaban
el flujo canonico completo:

Limite 1 — extract-content: truncaba a 12.000 chars. El
documento de 22.163 chars llegaba al modelo al 54%. El
operador no tenia indicador de que el documento fue cortado.
Fix: limite aumentado a 50.000 chars + metadata de
truncacion en la respuesta + banner informativo en UI.

Limite 2 — /api/ai/generate: rechazaba userMessage mayor
a 10.000 chars con error "Campos requeridos: tool, userMessage
(max 10.000 chars)". El contenido extraido del documento
superaba ese limite antes de llegar al modelo. Fix: limite
aumentado a 120.000 chars (aprox 90K tokens, dentro de la
ventana de Sonnet).

Aprendizaje: los limites de desarrollo (10K-12K chars) no
reflejaban los volumenes reales de investigacion periodistica.
La clausula de detencion no aplica a limites numericos — el
operador debe poder correr el pipeline con documentos reales
sin ajustes manuales.

### b) Gap de comprension del pipeline: sesion de clarificacion

La sesion del Chunk 20 incluyo una clarificacion extensa del
pipeline para el operador: hipotesis vs borrador IP vs borrador
MP vs fuente ODF. Este gap de comprension es un hallazgo de
producto: el pipeline necesita labels mas descriptivos (resuelto
en 20A) y una Vista Previa del insumo final antes de exportar
(resuelto en 20A). La Vista Previa en fase aprobado cierra la
pregunta operativa "que es exactamente lo que voy a exportar".

### c) La imagen generada externamente no tenia hogar

El flujo operativo del Chunk 14 establece que IPMP genera el
prompt visual pero no la imagen — la imagen se genera en
herramientas externas. Sin embargo, no habia manera de
reincorporar esa imagen al pipeline para incluirla en el ZIP.
El upload en el tab Prompt Visual cierra ese circuito. El ZIP
ahora es un paquete editorial completo: texto periodistico +
pitch + fuentes + hipotesis + imagen + expediente tecnico.

### d) ZIP como entregable para stakeholders

La conversion de .md y .json a .docx con nombres descriptivos
(genero + titulo) responde al hallazgo operativo de que el ZIP
era tecnicamente correcto pero poco amigable para stakeholders
sin acceso a la plataforma. Un editor externo puede abrir
"Cronica narrativa — El ascenso silencioso.docx" sin contexto
tecnico previo. El naming con genero periodistico implementa
el Principio 4 de filantropia digital: portabilidad real.

## Hallazgos de validacion — Chunk 21 (13 abril 2026)

Chunk 21 (Dashboard de Consumo por Tenant) shipped en dos sub-chunks
ejecutados en la misma sesion de trabajo del Chunk 20, sin rework.
El endpoint lee de consumption_logs (persistencia fire-and-forget
del Chunk 6) y la UI sigue el patron server+client de las paginas
admin existentes. Tres hallazgos menores.

### a) Trazabilidad de costos operativa desde el dia uno

El campo costUsd en consumption_logs fue persistido desde el primer
insert del Chunk 6, calculado por estimateCostUsd() en provider.ts
con la tabla de precios de Sonnet 4 y Haiku 4.5. El dashboard del
Chunk 21 simplemente agrega esos valores con SUM(cost_usd::numeric).
No fue necesario recalcular ni backfill. Hallazgo operativo: la
decision del Chunk 6 de persistir el costo estimado en cada insert
(en vez de calcularlo al vuelo en el dashboard) resulto ser la
decision correcta porque permite cambiar la tabla de precios en
provider.ts sin alterar los costos historicos ya registrados.

### b) Auth sin proxy ni middleware

La UI del dashboard pasa adminToken como prop desde el server
component al client component. El client lo incluye como query
param en cada fetch a /api/admin/consumo. No hay proxy ni
middleware ni cookie de sesion. Este patron es identico al usado
en /admin/editores y /admin/assets. Es aceptable mientras el
unico operador sea el titular de la plataforma. Cuando se abra
a operadores externos (Chunk 28+), todas las rutas admin
necesitaran migrarse a un sistema de auth real con sesion.

### c) Resolucion de tenantId a nombre legible

El endpoint devuelve tenantId (UUID) en cada row porque el
GROUP BY opera sobre la columna raw. La UI resuelve el UUID
a nombre legible mediante un Map construido en el client
desde la lista de tenants pasada por el server component.
Alternativa descartada: hacer JOIN con tenants en el endpoint.
Razon: el JOIN complicaria el GROUP BY y la lista de tenants
ya esta disponible en el client para los selectores de filtro.
La resolucion client-side con Map es O(1) por row y no requiere
infraestructura adicional.

## Hallazgos de validacion — Chunk 22 (13 abril 2026)

### a) Chunk 22A — Filtros en listado de proyectos

ProjectsClient.tsx ya tenia filtros de tenant y status
implementados desde chunks anteriores. El Chunk 22A agrego
la busqueda por titulo (input + boton Buscar + boton limpiar
con activacion por Enter o click) y corrigio el orden de
PIPELINE_PHASES al orden canonico post-14A:
draft, validacion, pesquisa, produccion, revision, aprobado,
visual, exportado. Se agrego flex-wrap al contenedor de
filtros para soporte en pantallas angostas.
Un solo archivo modificado: ProjectsClient.tsx.
Commit: 1809615.

### b) Chunk 22B — Editor en pitch.docx (hallazgo: ya implementado)

El objetivo del 22B era agregar el editor elegido al pitch.docx
del ZIP exportado. El reconocimiento de Claude Code determino
que el feature ya estaba implementado desde el Chunk 12E:
pitchMedio (estado React local en ProjectDetailClient.tsx)
se persiste en data.pitch.medio_destino al generar el pitch
(linea 2083). buildPitchDocx en export/route.ts ya renderiza
ese campo bajo el H2 Detalles de envio despues del cuerpo del
pitch. La seccion se omite silenciosamente si el campo esta
vacio. No se realizaron cambios de codigo. El feature funciona
correctamente cuando el operador tiene editores cargados en
la Agenda y genera el pitch con un editor asignado.

### Chunk 23 — Validador IP persistencia, historial y soft gate [COMPLETADO 13 abril 2026]

- **23A** [COMMIT_23A] feat(chunk23a): persistencia validaciones_ip
  en data del proyecto. Interface ValidacionIPEntry (generadoEn,
  score, apto_para_traspaso, dimensiones[], recomendaciones[]).
  PATCH endpoint acepta validacionesIp via merge de body.data.
  handleValidarBorradorIP hace append al array acumulativo.
  Fire-and-forget: fallo de PATCH loguea con console.error pero
  no bloquea el UX. 23A y 23B commiteados juntos.

- **23B** [COMMIT_23AB] feat(chunk23b): historial de iteraciones
  Validador IP. Panel colapsable "Historial (N corridas)" en tab
  Validador IP. Orden cronologico inverso. Fila compacta: fecha
  formateada, score con color verde/rojo segun umbral 3.0, badge
  Apto/No apto. Sin renderizado si array vacio.

- **23C** [COMMIT_23C] feat(chunk23c): soft gate pre-traspaso.
  Banner amber con checkbox de confirmacion si score < 3.0 o sin
  validar; boton Confirmar deshabilitado hasta ack del operador.
  Banner blue informativo si borrador_ip en modo diagnostico.
  Estado traspasoScoreAck resetea al abrir el modal.

- **23G** [COMMIT_23G] docs(chunk23g): cierre documental Chunk 23.

Decision arquitectonica registrada: el soft gate del traspaso es
un gate informado, no un hard block. El operador puede traspasar
con score bajo pero firma la decision con un checkbox explicito.
Esto implementa el Principio 2 de filantropia digital (honestidad
sobre los limites del producto) sin quitarle autonomia editorial
al operador. Los hard blocks (BORRADOR_IP_REQUIRED, TRASPASO_REQUIRED)
protegen la integridad del pipeline; los soft gates protegen la
calidad sin reemplazar el juicio humano.

## Hallazgos de validacion — Chunk 23 (13 abril 2026)

### a) validaciones_ip como primer array acumulativo del pipeline

Los artefactos anteriores del pipeline (borrador_ip, borrador,
pitch, etc.) son documentos singulares que se sobreescriben.
data.validaciones_ip[] es el primer artefacto acumulativo: cada
corrida agrega una entrada, nunca reemplaza. Este patron es
distinto al de los demas campos de data y puede servir como modelo
para futuros historiales (ej: historial de scores del validador MP,
historial de borradores). La decision de agregar en vez de reemplazar
es deliberada: el operador necesita ver la evolucion del score entre
iteraciones de fuentes para entender el impacto de cada carga de
evidencia.

### b) El soft gate de score resuelve el tension entre calidad y autonomia

Los gates anteriores del pipeline son hard blocks que el operador
no puede bypasear sin cumplir la condicion (BORRADOR_IP_REQUIRED,
TRASPASO_REQUIRED, EXPORT_GATE_FAILED). El soft gate de score del
Chunk 23 introduce una categoria nueva: condicion recomendada pero
no obligatoria, con firma explicita del operador. El checkbox de
confirmacion es la traduccion tecnica del principio de que la
plataforma asiste al operador, no automatiza sus decisiones. Un
score de 2.8/5.0 puede ser aceptable para un genero de opinion; un
score de 2.8/5.0 es insuficiente para un reportaje de investigacion.
El operador sabe cual es cual; la plataforma solo asegura que la
decision sea consciente.

### Chunk 24 — Eliminacion Pitch, Validador MP y reemplazo C4 [COMPLETADO 13 abril 2026]

- **24A** `c66fdf8` feat(chunk24a): C4 del gate usa validaciones_ip,
  eliminar C5. C4 ahora lee el ultimo entry de data.validaciones_ip
  (score >= 3.5). Mensaje descriptivo actualizado. C5 (pitch posterior
  al borrador) eliminada — el gate queda con 4 condiciones (C1-C4).

- **24B** `ab6b872` feat(chunk24b): eliminar tab Validador de Tono MP
  de fase revision. Tab reemplazado por panel informativo que muestra
  el ultimo score IP. Estados borradorTexto, validandoBorrador,
  borradorError eliminados. useEffect prefill y handler
  handleValidarBorrador eliminados. Historial validaciones_borrador
  y handlers de curacion conservados por datos historicos existentes.

- **24C** `44826b2` feat(chunk24c): eliminar Constructor de Pitch de
  UI (fase visual) y pitch.docx del ZIP. 13 estados React eliminados,
  2 useEffects, 2 handlers (handleConstruirPitch, handleElegirEditor).
  buildPitchDocx eliminado de export/route.ts. ZIP queda con 3 .docx
  (borrador, fuentes, hipotesis) + proyecto.json + imagen-visual.

- **24G** [CONSOLIDADO RETROACTIVAMENTE EN CHUNK 30A] El cierre
  documental del Chunk 24 no tuvo commit dedicado en su momento.
  El contenido de los hallazgos y el roadmap entry fueron
  escritos en sesiones posteriores (Chunks 25+) y quedan
  consolidados formalmente por el Chunk 30A. Ver seccion
  "## Hallazgos de validacion — Chunk 24" mas abajo.

Decision arquitectonica registrada: el Validador IP (pesquisa) es
el unico validador del pipeline. Su score rige C4 del gate de
exportacion (umbral >= 3.5). El Validador de Tono MP y el
Constructor de Pitch son eliminados por no agregar valor operativo
real al flujo canonico. El pipeline queda mas corto y directo:
pesquisa (con validacion IP) -> traspaso -> produccion -> revision
(informativa) -> aprobado -> visual -> exportado. El ZIP exportado
contiene 3 artefactos editoriales en lugar de 4.

## Hallazgos de validacion — Chunk 24 (13 abril 2026)

### a) El Validador IP absorbe la responsabilidad de calidad del pipeline

La eliminacion del Validador de Tono MP concentra la validacion de
calidad en la fase pesquisa, antes del traspaso. Esto es coherente
con la arquitectura del Chunk 18: si el borrador IP es solido, el
borrador MP hereda esa solidez. Validar despues del traspaso era
redundante y creaba confusion operativa (dos validadores con
criterios distintos).

### b) El Pitch era el artefacto con menor trazabilidad del pipeline

El Constructor de Pitch operaba sobre el borrador pero producia un
documento de naturaleza comercial (propuesta a editor) desacoplado
del rigor periodistico del expediente. Su eliminacion simplifica el
ZIP a 3 artefactos puramente editoriales y elimina la condicion C5
del gate, que era la mas dificil de satisfacer automaticamente.

### c) Flujo canonico actualizado post-Chunk 24

  hipotesis elegida
    -> fuentes ODF con archivos adjuntos
    -> borrador IP [gate BORRADOR_IP_REQUIRED]
    -> validacion IP (score >= 3.5 para exportar)
    -> traspaso: marca + genero [gate TRASPASO_REQUIRED]
    -> borrador MP (toma IP como base)
    -> revision (informativa: muestra score IP)
    -> aprobado -> Vista Previa
    -> prompt visual + imagen externa
    -> [gate EXPORT_GATE_FAILED: 4 condiciones C1-C4]
    -> exportado: ZIP con 3 .docx + imagen + proyecto.json

### Chunk 25 — Fix 529 y C4 soft gate [COMPLETADO 15 abril 2026]

- **25A** `d6cf579` fix(ai): retry backoff exponencial 529 +
  Cache-Control no-store en /api/ai/generate.
  provider.ts: withRetry() con 3 reintentos, delays 1s/2s/4s,
  detecta overloaded_error por status 529, error.type y mensaje.
  route.ts: NO_CACHE_HEADERS = { Cache-Control: no-store } en
  todos los return NextResponse.json() del endpoint.

- **25B** `e7f7747` fix(export): C4 del gate de exportacion pasa
  a soft gate en backend. ExportCondition interface agrega campo
  soft?: boolean. evaluateExportGate() retorna hardPassed y c4Passed
  separados. Advance a exportado: C1-C3 hard block con
  EXPORT_GATE_FAILED; C4 separado con C4_ACK_REQUIRED si falla y
  c4Acknowledged !== true en el body del PATCH.

- **25C** `1df22d0` fix(export): C4 soft gate UI en
  ProjectDetailClient.tsx. Estado c4Ack agregado, resetea al cerrar
  y tras advance exitoso. Panel: borde amber cuando solo C4 falla,
  icono warning amber en vez de X roja, checkbox de confirmacion
  con texto descriptivo. Boton Exportar habilitado cuando C1-C3
  pasan y (C4 pasa O c4Ack es true). handlePipelineAction envia
  c4Acknowledged: true cuando c4Ack activo en fase visual.

Decision arquitectonica registrada: C4 (validacion IP score >= 3.5)
es una condicion de calidad recomendada, no un hard block. El operador
puede exportar con score insuficiente firmando la decision con un
checkbox explicito. Esto es coherente con el Principio 2 de
filantropia digital y con la decision del Chunk 23 (soft gate en
el traspaso). Los hard blocks del pipeline son y siguen siendo:
BORRADOR_IP_REQUIRED, TRASPASO_REQUIRED, y C1-C3 del gate de
exportacion.

## Hallazgos de validacion — Chunk 25 (15 abril 2026)

### a) El error 529 era un problema de cache de Vercel, no de Anthropic

El request_id identico entre reintentos confirmo que Vercel servia
la respuesta de error cacheada sin llegar al runtime. Cache-Control:
no-store en todas las respuestas del endpoint es la solucion
estructural. El retry con backoff es resiliencia adicional para
sobrecargas reales de Anthropic.

### b) Dos cortes epistemicos en paralelo en todo output de IPMP

Todo contenido producido por IPMP tiene dos cortes que se aplican
en paralelo: (1) el expediente ODF cargado por el operador, cuya
fecha es la del documento mas reciente cargado; (2) el conocimiento
base de Claude con corte agosto 2025. El expediente ODF gana siempre
en caso de conflicto. La actualidad del brief es responsabilidad del
expediente, no del modelo. El operador es el periodista; Claude es
el redactor.

### Chunk 26 — Filtros del Project Listing con persistencia URL [COMPLETADO 15 abril 2026]

- **26A** `eb900fe` feat(chunk26a): filtros listing con persistencia
  URL — fase, debounce titulo, limpiar.
  ProjectsClient.tsx: useSearchParams + useRouter + usePathname
  importados. Estados filterTenant, filterStatus, filterTitle,
  titleInput, filterPhase inicializan desde URL params (?tenant=,
  ?status=, ?q=, ?phase=). Funcion updateURL sincroniza estado React
  con query params via router.replace sin scroll. Debounce 300ms en
  input titulo reemplaza boton Buscar y onKeyDown Enter. Select de
  fase nuevo (InvestigaPress / MetricPress) con filtrado client-side
  via INVESTIGAPRESS_STATUSES y METRICPRESS_STATUSES. Boton Limpiar
  filtros aparece solo cuando hay filtro activo, resetea todos los
  estados y limpia la URL. Filtrado sigue siendo 100% client-side.

Decision arquitectonica registrada: el filtrado del listing se
mantiene client-side. El volumen de proyectos actual no justifica
mover la logica a SQL. Los query params sirven exclusivamente para
persistencia y compartibilidad de URL, no viajan al backend. Si el
volumen crece a 500+ proyectos, migrar a server-side filtering en
GET /api/projects con ILIKE y WHERE IN en Drizzle.

## Hallazgos de validacion — Chunk 26 (15 abril 2026)

### a) El filtro de fase es el mas valioso operativamente

Con el pipeline dividido en InvestigaPress y MetricPress, el operador
necesita ver rapidamente que proyectos estan en investigacion activa
vs en produccion editorial. El filtro de fase resuelve esto en un
click sin necesidad de recordar que statuses pertenecen a cada fase.

### b) La persistencia en URL habilita flujos de trabajo nuevos

El operador puede guardar como bookmark "/projects?phase=investigapress"
para tener siempre el listado de proyectos IP activos. Puede compartir
el link filtrado con un colaborador. El boton de retroceso del browser
funciona correctamente entre estados de filtro.

### Chunk 27 — Dashboard de estado del pipeline [COMPLETADO 15 abril 2026]

- **27A** `b71f248` feat(chunk27ab): metricas listing — linea de
  contadores sobre proyectos filtrados: total · en investigacion ·
  en produccion · listos para exportar. Calculados sobre el array
  filtered (post-filtros), no sobre el total del server.

- **27B** `b71f248` feat(chunk27ab): health dot por status en cada
  card del listing. Dot 8px (w-2 h-2 rounded-full) con color segun
  status: rojo (draft), amber (pesquisa, visual), verde (aprobado,
  exportado), gris (resto). Tooltip via title="..." con descripcion
  del estado. Insertado antes del publicId en el row header de la
  card sin alterar layout.

- **27C** descartado — expansion inline de card. Complejidad no
  justificada en esta fase. Queda como deuda futura cuando el
  volumen de proyectos requiera preview sin navegar.

Decision arquitectonica registrada: la visibilidad ejecutiva del
pipeline se implementa en la capa de listing (client-side, sobre
datos ya disponibles) sin agregar endpoints ni campos nuevos al
backend. El health dot usa solo el campo status, disponible en el
listing, sin necesidad de cargar el objeto data completo. Si en el
futuro se necesita salud basada en score IP o dias sin actividad,
el listing debera incluir campos adicionales del SELECT de Drizzle.

## Hallazgos de validacion — Chunk 27 (15 abril 2026)

### a) La linea de metricas como orientacion rapida del pipeline

Con cuatro numeros en una sola linea el operador puede evaluar el
estado global del portfolio en menos de un segundo: cuantos proyectos
hay en investigacion activa, cuantos en produccion editorial, y
cuantos estan bloqueando la cola de exportacion. No requiere
interaccion — la informacion esta siempre visible.

### b) El health dot es informacion sin friccion

Un dot de 8px no interrumpe el escaneo visual del listing pero
permite detectar proyectos problematicos (rojo) o pendientes de
accion (amber) sin abrir cada proyecto individualmente. El tooltip
da contexto suficiente para saber que accion tomar.

### Chunk 28 — Asignacion de editor a proyecto [COMPLETADO 15 abril 2026]

- **28A** `ac6b0cc` feat(chunk28): asignacion de editor a proyecto —
  schema, API, UI selector, card display.
  schema.ts: campo editorId uuid nullable con FK a editoresAgenda.
  init-sql.ts: ALTER TABLE projects ADD COLUMN IF NOT EXISTS
  editor_id UUID REFERENCES editores_agenda(id) + INDEX idempotente.
  GET /api/projects/[id]: LEFT JOIN a editoresAgenda, campos
  editorId/editorNombre/editorApellido/editorMedio en response.
  PATCH /api/projects/[id]: acepta editorId (UUID o null), valida
  existencia en editoresAgenda antes de asignar.
  GET /api/projects (listing): LEFT JOIN a editoresAgenda, campos
  editorId/editorNombre/editorApellido en response.
  ProjectDetailClient.tsx: estado editoresList cargado desde
  GET /api/editores al montar, filtrado por activo (excepto editor
  ya asignado). Select inline con feedback Guardando/Guardado/error.
  ProjectsClient.tsx: campo editorNombre visible en columna derecha
  de card con text-amber-brand/70, solo si hay editor asignado.

Decision arquitectonica registrada: el editor asignado al proyecto
es distinto del concepto historico de data.pitch.editorId (Chunk 11B,
eliminado en Chunk 24C). El nuevo campo es responsabilidad editorial
del proyecto, no destino comercial del pitch. La FK a editoresAgenda
garantiza integridad referencial. El selector filtra editores
inactivos excepto el ya asignado, para evitar desasignaciones
accidentales al abrir proyectos con editores desactivados.

## Hallazgos de validacion — Chunk 28 (15 abril 2026)

### a) El ALTER TABLE idempotente como patron de migracion del repo

El repo no usa Drizzle migrations en produccion — usa init-sql.ts
con CREATE TABLE IF NOT EXISTS. Para agregar columnas a tablas
existentes, el patron establecido en este chunk es ALTER TABLE
... ADD COLUMN IF NOT EXISTS, agregado al final de init-sql.ts
y aplicado via POST /api/admin/init. Es idempotente y reproducible.
Este patron debe usarse en todos los chunks futuros que requieran
cambios de schema en tablas existentes.

### b) La asignacion de editor habilita el modelo de colaboracion

Con editor_id en projects, la plataforma puede en el futuro filtrar
el listing por editor asignado, enviar notificaciones al editor,
y generar reportes de carga de trabajo por editor. El Chunk 28
establece la infraestructura; las features de colaboracion avanzada
se construyen encima sin cambios de schema.

### Chunk 29 — ODF mejoras UX: indicador adjunto, fuente principal, header stats [COMPLETADO 15 abril 2026]

- **29A** `f383fd1` feat(chunk29): ODF mejoras UX — indicador adjunto,
  fuente principal, header con stats.
  Interface Fuente: campo principal?: boolean agregado.
  parseFuenteFromRaw: parseo estricto (=== true) para principal.
  handleMarcarPrincipal: marca/desmarca fuente principal, garantiza
  unicidad (limpia principal:false en todas las demas al marcar una).
  Card de fuente: borde amber-brand/60 cuando principal, badge
  "Principal" en amber, boton toggle estrella vacia/llena antes
  de editar, indicador adjunto (icono 📎 verde / texto gris discreto)
  en row de badges junto a confianza.
  Header del listado ODF: reemplaza contador simple por string
  "N fuentes · X verificadas · Y por contactar · Z con archivo",
  omite counts en 0. Sin fuentes muestra "Sin fuentes cargadas".
  Sin cambios en backend — persistirFuentes con PATCH merge existente
  es suficiente para persistir el campo principal.

Decision arquitectonica registrada: el campo principal se persiste
dentro del objeto fuente en data.fuentes[] sin columna nueva en la
tabla. La unicidad (solo una fuente principal por proyecto) se
garantiza en el handler del frontend al momento de marcar, no en
el backend. Si en el futuro se necesita consultar la fuente principal
desde el backend (ej: para el generador de borrador), agregar logica
de extraccion en el prompt builder que lea data.fuentes.find(f =>
f.principal === true).

## Hallazgos de validacion — Chunk 29 (15 abril 2026)

### a) El header de stats del ODF como semaforo de calidad del expediente

El string "N fuentes · X verificadas · Y por contactar · Z con archivo"
le da al operador una lectura instantanea del estado del expediente
sin abrir cada fuente. Un expediente con 5 fuentes pero 0 verificadas
y 0 con archivo es visualmente distinto de uno con 5 verificadas y
4 con archivo. Esta informacion es el input natural para decidir si
el expediente esta listo para generar el borrador IP.

### b) La fuente principal como ancla editorial del expediente

Marcar una fuente como principal es una decision editorial explicita
del operador: esta es la fuente que sostiene la hipotesis central.
El borde amber y el badge hacen esa decision visible a simple vista.
En el futuro, el prompt del generador de borrador puede priorizar
la fuente principal para estructurar la apertura del texto.

### Chunk 30 — Higiene tecnica y cierre documental retroactivo [PARCIAL 15 abril 2026]

- **30A** `5b51a70` docs(chunk30a): cierre retroactivo del marcador
  24G. La linea del marcador "[PENDIENTE] docs(chunk24g)" en el
  Roadmap del Chunk 24 era factualmente falsa: el contenido
  documental ya estaba presente en CLAUDE.md (escrito en sesiones
  posteriores al cierre de codigo del Chunk 24). 30A consolida
  formalmente la deuda documental marcando la linea como
  "CONSOLIDADO RETROACTIVAMENTE EN CHUNK 30A".

- **30B** `29462ec` chore(chunk30b): eliminacion total de residuos
  del Constructor de Pitch. 15 ediciones distribuidas en 5 archivos.
  Cierra superficie de ataque silenciosa via API (constructor_pitch
  era invocable via POST /api/ai/generate aunque la UI ya no lo
  expusiera). Decision arquitectonica del operador: cleanup total
  (1a) sin retrocompat para data.pitch persistido en proyectos
  legacy. Decisiones secundarias D.1 (cortar dependencia
  data.pitch.medio_destino del Prompt Visual) y H.2 (preservar
  endpoint /api/editores/sugerencias actualizando comentario JSDoc
  porque habilita el selector de editor del Chunk 28). Build
  verificado: 5.1s compile, 7.3s TypeScript, 26 rutas, 0 warnings,
  0 errors.

- **30C** [DIFERIDO 15 abril 2026] DROP TABLE de assets (DT-3) y
  revisions (DT-4). Reconocimiento del PASO 0 completado y validado:
  cero imports vivos, cero uso via Drizzle, cero superficies
  inesperadas. Plan de eliminacion documentado: 3 ediciones en
  init-sql.ts (eliminar CREATE TABLE bloques + insertar DROP TABLE
  IF EXISTS CASCADE antes del backtick final del template string)
  + 6 ediciones en schema.ts (definiciones, relations, references
  en projectsRelations, comentario header). Diferido por decision
  del operador: requiere coordinacion con backup de Railway y
  ejecucion manual de POST /api/admin/init post-deploy. Verificacion
  pendiente: SELECT COUNT(*) sobre assets y revisions en Railway
  para confirmar que estan vacias antes del DROP CASCADE.

- **30D** [DIFERIDO 15 abril 2026] Eliminacion del campo legacy
  borrador? en BorradorData (DT-1). Diferido en bloque junto con
  30C: requiere endpoint temporal /api/admin/legacy-audit (decision
  2b del operador) que cuente proyectos con borrador en formato
  antiguo antes de aprobar la eliminacion del campo. No iniciado.

- **30E** [CONSOLIDADO INLINE 15 abril 2026] Este bloque de cierre
  documental cumple la funcion del sub-chunk 30E originalmente
  planificado. Captura el estado parcial del Chunk 30 al cierre
  de sesion del 15 de abril.

Decision arquitectonica registrada: el Chunk 30 se cierra parcial.
30A y 30B son commits estables en origin/main. 30C y 30D quedan
como deuda con plan validado, listas para retomar en sesion
proxima sin trabajo de re-reconocimiento. Mantener separados
los chunks de codigo y los de coordinacion con Railway es
coherente con el principio de minimizar superficie de riesgo
en deploys de schema.

## Hallazgos de validacion — Chunk 30 (15 abril 2026)

### a) La superficie de ataque silenciosa del registry de tools

El descubrimiento de mayor valor del Chunk 30B fue identificar
que constructor_pitch seguia siendo invocable via POST a
/api/ai/generate aunque ningun cliente lo llamara. El registro
de un tool en VALID_TOOLS + ToolName + builders es lo que define
la superficie publica de la API de IA, no la presencia o ausencia
de UI. Eliminar UI sin eliminar el registry deja la superficie
abierta. Patron a seguir en futuras eliminaciones de tools:
quitar primero del registry (cierra la superficie), despues del
codigo de prompt, despues de la UI. El orden inverso deja
ventanas de exposicion.

### b) La asimetria visual como senal honesta de deuda

El dashboard de page.tsx quedo con 3 hijos en un grid
md:grid-cols-2 tras eliminar el placeholder del Constructor de
Pitch. La opcion de rebalancear a md:grid-cols-3 fue
explicitamente descartada: rebalancear hubiera ocultado que
los otros dos placeholders ("Validador de Tono" obsoleto desde
24B, "Analizador de Sentimiento" nunca construido) y el href
roto de "Generador de Angulos" hacia /tools/angulos (eliminado
en 9D) tambien son deuda. La asimetria es informacion: le dice
al operador que esa seccion necesita revision integral. Pintar
sobre el problema viola el Principio 2 de filantropia digital
(honestidad sobre los limites del producto).

### c) DT-5 emergente: tabla users huerfana

Reconocimiento adicional durante el PASO 0 de 30C revelo que
la tabla users (schema.ts:53) es codigo muerto a nivel TypeScript
(cero imports en src/) pero tiene FKs entrantes vivas:
projects.createdBy (sigue activa) y revisions.reviewerId (se
auto-elimina con el DROP CASCADE de revisions cuando 30C se
ejecute). Decision: NO incluida en 30C, queda como DT-5 para
sub-chunk dedicado. La eliminacion de users requiere decision
arquitectonica previa: se preserva por si el Chunk "Auth +
apertura a operadores externos" (Chunk 22+ futuros) se reactiva,
o se elimina como codigo muerto definitivo. Esa decision no
se toma de oficio.

### d) La metodologia aguanta los obstaculos de infraestructura

El Chunk 30B atraveso multiples obstaculos no relacionados al
contenido del trabajo: dos errores 500 de la API de Anthropic
con request_id repetido (sintoma identico al bug de Vercel cache
diagnosticado en 25A, esta vez del lado del proveedor), una
sesion de Claude Code envenenada por contexto previo que
fabrico una salida de npm run build que nunca ocurrio
(paradoja: el ejecutor que construye IPMP cometio el pecado
contra el cual IPMP fue disenado), bracketed paste de Git Bash
corrompiendo heredocs multilinea, navegacion accidental fuera
del directorio del repo. La metodologia aguanto porque cada
obstaculo gatillo una detencion explicita en lugar de un avance
a ciegas. La regla operativa que se desprende: cuando el
ejecutor afirma haber visto datos que no aparecen en el
contexto de la conversacion, detenerse y verificar antes de
firmar. La cadena de custodia de los datos es responsabilidad
del operador, no del ejecutor.

### e) El reconocimiento previo como inversion no perdida

El PASO 0 del Chunk 30C quedo completo y validado aunque el
PASO 1 se diferio. El trabajo intelectual (reconocimiento, plan
de eliminacion con anclas textuales, deteccion de DT-5 emergente,
verificacion preventiva de imports huerfanos) esta documentado
en este Chunk 30E y en el historial de la sesion. La proxima
sesion retoma 30C sin trabajo de re-reconocimiento: solo
ejecuta el PASO 1 y coordina el deploy a Railway. Patron
generalizable: cuando una sesion no llega a cerrar un chunk
de codigo pero si completo el reconocimiento, documentar el
reconocimiento explicitamente preserva el valor para la sesion
proxima.

## Hallazgos de validacion — Chunk 31C-1 (17 abril 2026)

Validacion end-to-end del backend del Gate 1a en produccion
(commit caccbb1), ejecutada via curl contra un proyecto real en
fase draft (IP-2026-0004, "Seremis fugases en el gobierno de Kast").
No se ejecuto el Test 3 de unlock happy path para no mutar un
proyecto con editor asignado y trabajo en curso; se valida
asimetricamente el predicate negativo (Test 1) con la garantia
booleana de que el positivo es su complemento simetrico.

### a) Hard gate GATE_1A_REQUIRED opera correctamente

Test 1: PATCH /api/projects/IP-2026-0004 con body { action: 'advance' }
contra proyecto en fase draft sin data.gate_1a. Respuesta HTTP 400
con body que incluye `"code":"GATE_1A_REQUIRED"` y mensaje en
espanol neutro apuntando al operador a ejecutar el Gate 1a. Deploy
Vercel operativo, bloqueo efectivo en produccion.

### b) Endpoint IA /api/ai/generate con tool 'gate_1a' devuelve JSON estructurado limpio

Test 2: POST /api/ai/generate con tool: 'gate_1a' y userMessage
`"TITULO: Investigar el Hospital Arica 100\nTESIS: El proyecto
hospitalario conocido como Hospital Arica 100 presenta demoras
significativas."` (replicando el enunciado del Hallazgo A del
Chunk 31). Respuesta HTTP 200 con result estructurado:
- 2 supuestos detectados, ambos con veredicto 'dudoso'.
- veredicto_global: 'requiere_correccion' (regla "dos o mas dudosos
  elevan el veredicto" aplicada correctamente).
- parseError: null (JSON bien formado, sin fallbacks del parser de
  tres pasos).
- Usage: 1776 tokens input / 305 output, duracion 5.7s (consistente
  con otras tools IP).

El modelo aplico correctamente la disciplina anti-fabricacion: no
afirmo certezas sobre "Hospital Arica 100", flaggo como dudoso con
justificacion explicita de incertidumbre sobre la denominacion y
existencia de la entidad. Comportamiento deseado por diseno del
prompt.

### c) Registry y validacion de tool funcionan correctamente

Implicito en Test 2: 'gate_1a' fue aceptado por VALID_TOOLS,
routeado a IP_PROMPT_BUILDERS (no se paso tenantSlug ni
templateSlug), buildGate1aPrompt() ejecutado, trackUsage() logueo
consumo contra el tenant 'investigapress'. Sin errores 400/404/500.

## Hallazgos de validacion — Chunk 31C-2 (pendiente)

[PENDIENTE VALIDACION VISUAL]

La validacion visual del frontend (commit 7a21f00) queda pendiente
de ejercicio por el operador. Las pruebas sugeridas para cuando se
ejecute, en orden de prioridad:

1. Happy path: proyecto nuevo con enunciado auditable -> tab Gate 1a
   default activa -> ejecutar -> ver supuestos tipificados -> aprobar
   (con confirm de riesgo si aplica) -> badge verde -> avanzar pipeline
   -> tab desaparece, aparece Generador de Hipotesis.

2. Path de correccion (valida el auto-reset U1): proyecto con Gate 1a
   aprobado -> editar enunciado inline -> guardar -> verificar que el
   badge de aprobacion desaparece, estado vuelve a 'pendiente', historial
   archiva la ejecucion previa, boton vuelve a "Ejecutar" (no
   "Re-ejecutar").

3. Path de bloqueo duro desde UI: proyecto nuevo sin ejecutar Gate ->
   click Avanzar -> alert GATE_1A_REQUIRED -> tab gate_1a queda
   seleccionada automaticamente.

4. Path de inmutabilidad en fases posteriores: proyecto en validacion
   o posterior -> intento de edicion de enunciado (si hay UI para ello
   en otro lugar) falla con ENUNCIADO_INMUTABLE.

Esta seccion se completa con los resultados concretos cuando el
operador ejerza la validacion visual. No se marca el Chunk 31C como
"totalmente validado" hasta entonces.

### Chunk 31 — Disciplina editorial del pipeline IP: del Hito 1 al producto limpio [EN CURSO abril 2026]

- **31A** `e631a2c` chore(chunk31a): eliminar seccion Herramientas de
  Produccion del dashboard. Bloque de tres tarjetas obsoletas en
  src/app/page.tsx eliminado (Generador de Angulos con href roto a
  /tools/angulos, Validador de Tono placeholder obsoleto desde 24B,
  Analizador de Sentimiento nunca construido). Import Link huerfano
  eliminado. JSDoc actualizado. Resuelve hallazgo 30(b).

- **31B** [DOCUMENTAL] Mapa canonico del pipeline IP y diagnostico
  arquitectonico. Registra las decisiones de diseno del Chunk 31
  completo, incluyendo la reestructuracion del pipeline con Gate 1a
  y Hito 1. Sin codigo. Este bloque cumple la funcion del 31B.

- **31C-1** `caccbb1` feat(chunk31c-1): Gate 1a backend — prompt,
  tool registry y hard gate GATE_1A_REQUIRED. Tres archivos tocados.
  (a) src/lib/ai/prompts.ts: nuevo builder buildGate1aPrompt() en
  IP_PROMPT_BUILDERS con wrapper neutro en MP_PROMPT_BUILDERS (patron
  de validador_tono_ip y generador_borrador_ip). Extension del union
  ToolName con 'gate_1a'. El prompt audita supuestos factuales en
  cuatro categorias (nombre_propio, denominacion_oficial, fecha,
  existencia_entidad) con regla anti-fabricacion explicita: reserva
  "confirmado" solo con certeza alta, reserva "falso" solo con
  certeza alta de error, default a "dudoso". Regla del veredicto
  global: dos o mas supuestos "dudoso" elevan el veredicto a
  "requiere_correccion". (b) src/app/api/ai/generate/route.ts:
  'gate_1a' agregado al array VALID_TOOLS. No se agrega a
  MP_ONLY_TOOLS porque el Gate 1a funciona tanto en modo IP como
  con tenant (el wrapper MP ignora el contexto). (c) src/app/api/
  projects/[id]/route.ts: nuevo hard gate insertado antes de
  BORRADOR_IP_REQUIRED en la transicion draft -> validacion.
  Devuelve { error, code: 'GATE_1A_REQUIRED', status: 400 } cuando
  data.gate_1a.estado !== 'aprobado'. Simetrico con TRASPASO_REQUIRED,
  BORRADOR_IP_REQUIRED, EXPORT_GATE_FAILED, C4_ACK_REQUIRED.
  Validado end-to-end en produccion con curls contra proyecto real
  en fase draft (Tests 1 y 2).

- **31C-2** `7a21f00` feat(chunk31c-2): Gate 1a frontend con edicion
  de enunciado y auto-reset backend atomico. Dos archivos tocados.
  (a) src/app/api/projects/[id]/route.ts: PatchBody extendido con
  title?: string y thesis?: string | null. Bloque de edicion
  insertado tras el bloque de asignacion de editor (Chunk 28):
  la edicion solo se permite en fase draft, devuelve
  { code: 'ENUNCIADO_INMUTABLE', status: 400 } en fases posteriores.
  Validaciones de forma: title no puede ser vacio ni superar 500
  caracteres, thesis vacio se normaliza a null. Bloque de auto-reset
  atomico del gate_1a insertado inmediatamente despues del merge de
  data: si title o thesis cambiaron y existe data.gate_1a, archiva
  ultimoResultado en historial[], resetea estado a 'pendiente' y
  limpia aprobadoEn. Operacion atomica en el mismo PATCH: es
  imposible que el enunciado cambie sin que el gate se invalide.
  (b) src/app/projects/[id]/ProjectDetailClient.tsx: interfaces
  Gate1aSupuesto / Gate1aResultado / Gate1aData y types auxiliares.
  Extension del union ActiveTool con 'gate_1a' como primer elemento
  y default de useState a 'gate_1a'. Tab nuevo en
  PHASE_CONFIG.draft (la fase dejo de estar vacia). Constantes
  GATE_1A_CATEGORIA_LABELS, GATE_1A_VEREDICTO_LABELS y
  GATE_1A_GLOBAL_LABELS para rendering. Ocho estados React locales
  (loading, error, aprobando, editandoEnunciado, editTitle,
  editThesis, guardandoEnunciado, verHistorial). Cuatro handlers:
  handleEjecutarGate1a (llamada IA + persistencia de ultimoResultado
  con archivado client-side del resultado previo si existe);
  handleAprobarGate1a (PATCH con estado 'aprobado' y aprobadoEn;
  confirm de asuncion de riesgo si veredicto_global es
  'requiere_correccion'); handleAbrirEdicionEnunciado /
  handleCancelarEdicionEnunciado (toggle del form inline);
  handleGuardarEnunciado (PATCH con title/thesis, el backend se
  encarga del auto-reset). Manejo de GATE_1A_REQUIRED y
  ENUNCIADO_INMUTABLE en el if-chain de handlePipelineAction; el
  primero ademas fuerza setActiveTool('gate_1a') para empujar al
  operador a la tab correspondiente. Tab render completo:
  introduccion explicativa cuando no hay resultado, badge verde de
  aprobacion, panel de enunciado con edicion inline, botones
  contextuales (Ejecutar / Re-ejecutar / Aprobar), veredicto global
  con color y descripcion, lista de supuestos tipificados por
  categoria con chip de veredicto, correccion sugerida en caso de
  veredicto falso, historial colapsable de revisiones previas.
  +562 / -4 lineas netas. Validacion visual pendiente.

- **31C-3** [DOCUMENTAL] Cierre del Chunk 31C. Registra SHAs
  (e631a2c, caccbb1, 7a21f00), decisiones arquitectonicas U1/U2/U3,
  patron de auto-reset atomico como patron reutilizable, y
  contratos nuevos del backend. Este bloque cumple la funcion
  del 31C-3.

#### Mapa canonico del pipeline InvestigaPress — estado actual y reestructuracion

##### Las 4 pestanas del detalle de proyecto (fase IP, pre-traspaso)

El detalle de proyecto en fase IP presenta cuatro pestanas al operador.
Cada una tiene una funcion distinta en el pipeline. La jerarquia entre
ellas no estaba documentada antes de este chunk — esta seccion la fija.

**Pestana 1 — Organizador de Fuentes Forenses (ODF).**
Funcion: data entry del expediente forense. Punto de entrada unico
para toda fuente que el operador levanto en trabajo de campo,
investigacion web, entrevistas, o cualquier motor externo (incluyendo
agentes de Sala de Redaccion). Cada fuente se cataloga con tipo,
titulo, rol/origen, estado, confianza, notas, URL opcional y archivo
adjunto opcional. Persiste en data.fuentes[]. Chunks 7, 16, 29.
Produce: expediente forense (array de fuentes catalogadas).
Viaja al traspaso: si — data.fuentes[] es insumo del borrador IP
y del export.

**Pestana 2 — Documento de Investigacion (Generador de Borrador IP).**
Funcion: generacion asistida del borrador IP a partir del expediente
forense + hipotesis elegida + notas editoriales del operador. El
disparo es manual (boton "Generar documento de investigacion"). No es
automatico: el operador decide cuando el expediente esta listo para
generar, y puede inyectar contexto editorial via el campo de notas
adicionales. Chunks 18, 20.
Produce: borrador IP (data.borrador.contenido).
Viaja al traspaso: si — el borrador IP es la base que MetricPress
transforma en producto editorial publicable.

**Pestana 3 — Validador IP.**
Funcion: evaluacion de calidad del borrador IP generado en la
Pestana 2. No valida los insumos (fuentes del ODF) sino el artefacto
generado a partir de ellos. Produce veredicto con score, hallazgos y
sugerencias. Historial acumulativo en data.validaciones_ip[]. Soft
gate por score (Chunk 23): el operador puede avanzar con verdict bajo
si confirma. Chunk 19C, 23, 25.
Produce: veredicto de calidad (data.validaciones_ip[]).
Viaja al traspaso: si — el historial de validaciones es parte del
expediente de calidad del proyecto.

**Pestana 4 — Radar Editorial.**
Funcion: auditoria de cobertura existente de otros medios sobre el
mismo tema. Opera sobre contenido externo (articulos publicados por
otros), no sobre el expediente propio ni sobre el borrador IP. Es
inteligencia competitiva editorial: detecta sesgos, faltas de rigor
y oportunidades editoriales en la competencia.
Produce: analisis de cobertura externa.
Viaja al traspaso: no como insumo obligatorio. Es contexto editorial
opcional para el operador.

**Jerarquia y obligatoriedad para el traspaso IP a MP:**

| Pestana | Obligatoriedad | Tipo de gate |
|---------|---------------|-------------|
| 1. ODF (fuentes) | Obligatoria (minimo 1 fuente) | Hard gate |
| 2. Documento de Investigacion | Obligatoria (borrador IP generado) | Hard gate (BORRADOR_IP_REQUIRED, Chunk 18) |
| 3. Validador IP | Recomendada (soft gate por score) | Soft gate (Chunk 23) |
| 4. Radar Editorial | Opcional siempre | Sin gate |

##### Flujo canonico del pipeline IP — version reestructurada (Chunk 31)

El pipeline IP previo al Chunk 31 tenia un hueco arquitectonico entre
la eleccion de hipotesis y la apertura de pesquisa: no existia ningun
mecanismo formal para auditar la hipotesis elegida antes de invertir
trabajo de pesquisa. El Chunk 31 cierra ese hueco con dos gates nuevos.

**Pipeline IP previo (Chunks 1-30):**

    creacion (titulo + tesis)
      -> generacion de hipotesis (5 candidatas)
      -> eleccion de hipotesis
      -> pesquisa (ODF + fuentes)
      -> borrador IP
      -> validador IP
      -> traspaso IP -> MP

**Pipeline IP reestructurado (Chunk 31+):**

    creacion (titulo + tesis)
      -> Gate 1a: sanity check de supuestos factuales (llamada IA, bloqueante)
      -> generacion de hipotesis (5 candidatas)
      -> eleccion de hipotesis
      -> Hito 1: validacion de hipotesis elegida (llamada IA, bloqueante)
          salida 1: veredicto correctivo (hard gate — bloquea si hipotesis defectuosa)
          salida 2: sugerencia optimizadora (informativa — muestra angulo mejor si existe)
      -> pesquisa (ODF + fuentes)
      -> borrador IP
      -> validador IP
      -> traspaso IP -> MP

**Gate 1a — Sanity check de supuestos factuales.**
Corre automaticamente al crear proyecto, antes de generar hipotesis.
Es bloqueante: el operador ve un panel "Revision de supuestos" con
los hallazgos y debe aprobar o corregir antes de ver las hipotesis
generadas. Verifica supuestos factuales del enunciado: nombres propios
institucionales, denominaciones oficiales, fechas, existencia de
entidades referenciadas. No audita calidad periodistica — solo que
la pregunta no parta de un supuesto falso.
Implementacion: llamada IA real. Justificada por volumen bajo del
producto (maximo 4 documentos por semana, ~16 llamadas adicionales
al mes). El costo es irrelevante frente al valor de que ningun
proyecto arranque desde un supuesto factual erroneo.

**Hito 1 — Validacion de hipotesis elegida.**
Corre despues de que el operador elige una hipotesis, antes de abrir
pesquisa. Es bloqueante. Introduce un estado nuevo en pipelineStatus:
hito_1. Tiene dos salidas separadas:
- Veredicto correctivo (hard gate): evalua si la hipotesis es
  coherente, falsable, factualmente viable como pregunta de
  investigacion. Si no lo es, bloquea avance hasta reformulacion.
- Sugerencia optimizadora (informativa): evalua si hay un angulo
  adyacente con mas potencia periodistica. Se registra, se muestra
  al operador, pero no bloquea. El operador decide si reformular
  o proceder con lo que tiene.
Los dos criterios estan separados por diseno. El correctivo pregunta
"esta hipotesis no deberia avanzar". El optimizador pregunta "esta
hipotesis podria ser mejor". Mezclarlos degrada ambos.

##### Distincion entre registro forense interno y producto editorial publicable

El pipeline IP produce dos tipos de artefacto que deben ser
estructuralmente distintos. Esta distincion no estaba formalizada
antes del Chunk 31.

**Registro forense interno.** Documento destinado al equipo editorial
y a la cadena de custodia. Registra como se llego al resultado:
hipotesis original, reformulaciones, fuentes descartadas, cambios
de angulo, verificaciones fallidas. Sirve para auditoria editorial,
defensa ante errores de publicacion, y trazabilidad del proceso.
Vive en el expediente del proyecto (data.fuentes[],
data.validaciones_ip[], data.validacion_hipotesis, historial de
generaciones). No se publica.

**Producto editorial publicable.** Lo que lee el cliente final o el
publico. No contiene cicatrices del proceso. Si la hipotesis fue
reformulada, el producto final presenta la hipotesis correcta desde
la primera linea — no explica como se llego a ella. Si una fuente
fue descartada, el producto final no la menciona. El producto es
limpio, directo, y asume que el lector no es parte de la
investigacion.

La separacion se implementa en dos capas:
1. En los prompts de generacion (buildBorradorIP, prompts MP): el
   prompt debe instruir al modelo a producir texto editorial limpio,
   no bitacora forense. Sub-chunk 31F.
2. En el export: el ZIP de export puede incluir ambos artefactos
   (registro forense como anexo, producto editorial como pieza
   principal), pero nunca mezclados en el mismo documento.

#### Hallazgos que motivan el Chunk 31

##### Hallazgo A — Hipotesis mal planteada detectada fuera de la plataforma (16 abril 2026)

El operador creo un proyecto en IPMP con titulo y pregunta de
investigacion, genero 5 hipotesis, eligio una, y la llevo a Sala
de Redaccion (ecosistema de 22 agentes especializados en Claude
Projects, orquestados como sistema multi-agente) para construir la
fuente primaria a partir de investigacion con search. Los agentes
de Sala de Redaccion detectaron dos problemas:
1. La hipotesis estaba mal planteada desde la creacion del proyecto.
2. La noticiabilidad tenia un angulo mas poderoso que la hipotesis
   inicial.

El pipeline IP no tenia ningun gate de auditoria entre la eleccion
de hipotesis y la apertura de pesquisa. La deteccion ocurrio fuera
de la plataforma, por agentes externos. El hallazgo motiva la
creacion del Hito 1 como gate formal dentro del pipeline.

##### Hallazgo B — Producto editorial arrastra cicatrices del proceso forense (17 abril 2026)

Analisis de dos documentos reales producidos por IPMP para el caso
"Hospital Arica 100" (proyecto METRICPRESS-VF-2026-0003 y
INVESTIGAPRESS-ASL-2026-0001):

El borrador IP (Verificacion Forense, 195 lineas) dedica las primeras
~40 lineas a explicar por que el proyecto no se llama como se suponia.
El titulo mismo arrastra la confusion: "Proyecto Hospital Arica 100:
Investigacion de Existencia Formal". La seccion 2 completa se titula
"Hallazgo Principal: Resolucion de la Confusion Terminologica".

El policy brief (producto editorial publicable) hereda la cicatriz:
su subtitulo es "La denominacion 'Hospital Arica 100' no existe
oficialmente". El primer parrafo arranca explicando la confusion
terminologica. Un lector de asesoria legislativa no abre un brief
para enterarse de que el periodista se confundio con un nombre.

Diagnostico: los prompts de generacion no distinguen entre registro
forense (donde la cicatriz tiene valor documental) y producto
editorial (donde la cicatriz es anti-valor). El producto final
contiene trabajo editorial de alta calidad enterrado debajo de
una narrativa de auto-aclaracion.

Conexion entre hallazgos A y B: si el Gate 1a hubiera existido al
crear el proyecto Arica 100, habria detectado que "Hospital Arica
100" no es una denominacion oficial y habria pedido correccion antes
de generar hipotesis. El producto final nunca habria necesitado
explicar la confusion porque la confusion nunca habria entrado al
pipeline.

#### Plan de sub-chunks del Chunk 31

| Sub-chunk | Nombre | Tipo | Dependencia |
|-----------|--------|------|-------------|
| 31A | Eliminacion seccion Herramientas de Produccion del dashboard | Codigo | Ninguna. CERRADO (e631a2c). |
| 31B | Mapa canonico del pipeline IP y diagnostico arquitectonico | Documental | Ninguna. Este bloque. |
| 31C | Gate 1a: sanity check de supuestos factuales | Codigo | 31B (requiere mapa canonico como contrato). |
| 31D | Hito 1: validacion de hipotesis elegida | Codigo | CERRADO. 31D-1 (04c4dd9), 31D-2 (82de623), 31D-3 (este commit). Validado E2E con IP-2026-0005. |
| 31E | Verificaciones criticas como sistema real | Codigo | 31D (verificaciones se apoyan en hipotesis ya validada). |
| 31F | Separacion forense/editorial en prompts | Codigo | 31D (requiere estados del pipeline estabilizados). |
| 31G | Importador de borrador IP externo | Codigo | Candidato, no compromiso. Depende de decision futura sobre puenteo con Sala de Redaccion. |
| 31H | Cierre documental del Chunk 31 | Documental | Todos los anteriores. |
| 31I | Exportador de enunciado para correccion externa | Candidato | Abierto por hallazgo del expediente ARICA-100-VF-2026-0001 en sesion del 31D. |

#### Decisiones arquitectonicas registradas — Chunk 31

1. El pipeline IP se reestructura con dos gates nuevos (Gate 1a y
   Hito 1) entre creacion y pesquisa. Ambos bloqueantes. Ambos con
   llamada IA real. Justificado por volumen bajo (max 4 docs/semana).

2. Gate 1a corre post-creacion, pre-generacion de hipotesis. Es
   sanity check de supuestos factuales. UI bloqueante: panel
   "Revision de supuestos" que el operador debe aprobar o corregir
   antes de ver hipotesis generadas.

3. Hito 1 corre post-eleccion, pre-pesquisa. Tiene dos salidas
   separadas: veredicto correctivo (hard gate) y sugerencia
   optimizadora (informativa). Los dos criterios no se mezclan.

4. Ambos gates viven en fase IP. MP no valida hipotesis — MP valida
   alineacion con marca y empaquetado editorial. La separacion
   IP/MP se preserva intacta.

5. Estado nuevo en pipelineStatus: hito_1. Se inserta entre
   validacion (donde se eligen hipotesis) y pesquisa.

6. La seccion "Herramientas de Produccion" del dashboard fue
   eliminada (31A). Las herramientas vivas se invocan desde el
   detalle de proyecto, no desde el dashboard.

7. El producto editorial publicable y el registro forense interno
   son artefactos estructuralmente distintos. Los prompts deben
   producir producto editorial limpio, no bitacora forense. La
   separacion se implementa en prompts (31F) y en export.

#### Decisiones arquitectonicas cerradas durante la implementacion del Chunk 31C

Durante la sesion de implementacion del 31C (entre el mapa canonico
del 31B y los commits del 31C-1 y 31C-2), se cerraron tres decisiones
arquitectonicas que no estaban fijadas en el 31B. Se documentan aqui
como referencia para futuros chunks y para lectores que auditen el
codigo sin el historial de la sesion.

**U1 — Deteccion de enunciado desactualizado respecto al gate.**
Resuelta a nivel backend, no UI. Cuando el operador edita title o
thesis via PATCH /api/projects/[id], el backend auto-archiva el
ultimoResultado del gate_1a en historial[] y resetea estado a
'pendiente' atomicamente en el mismo PATCH. Alternativa considerada:
badge cliente "enunciado desactualizado" comparando
project.title vs gate_1a.ultimoResultado.enunciado_evaluado.title.
La alternativa fue descartada porque genera el estado intermedio
"gate aprobado pero enunciado cambio" que es ambiguo para el operador
y requiere logica de render condicional. La solucion backend garantiza
que ese estado intermedio no puede existir: al momento de cualquier
cambio de enunciado, el gate pierde la aprobacion. Es imposible
avanzar con enunciado divergente del evaluado.

Patron equivalente al auto-reset de data.borrador.desactualizado del
Chunk 12C, pero ejecutado en backend (atomico dentro del mismo PATCH)
en vez de en cliente (comparacion en tiempo de render).

**U2 — Edicion inline del enunciado vs redireccion a form externo.**
Resuelta a favor de edicion inline dentro del panel del Gate 1a.
Alternativa considerada: link "Editar enunciado" que navega al form
existente de edicion del proyecto. La alternativa fue descartada
porque (a) requeria confirmar la existencia de tal form (no estaba
mapeado), (b) introducia context-switch que rompia el flujo del
operador cuando tenia la correccion_sugerida del modelo a la vista,
(c) exigiria un camino de regreso que mantenga el contexto del gate.
La edicion inline resuelve las tres: el operador nunca sale del panel,
tiene la correccion sugerida a la vista mientras edita, y un banner
amarillo explicito le avisa que guardar va a invalidar el gate.

**U3 — Estado del soft gate de Chunk 9C (advance validacion ->
pesquisa sin hipotesis elegida) con Gate 1a insertado.**
Resuelta: queda intacto. El soft gate 9C sigue vigente y operativo.
El Chunk 31D lo reemplazara con Hito 1 como hard gate formal en el
mismo tramo del pipeline (con estado nuevo hito_1 en pipelineStatus).
Decision motivada por disciplina de migracion: un chunk migra una
responsabilidad por vez.

#### Patron arquitectonico: auto-reset atomico en PATCH (Chunks 12C, 31C-2)

El patron de auto-reset atomico es una respuesta arquitectonica al
problema generico "cuando el campo A cambia, el campo derivado B
debe invalidarse". Se implementa en backend dentro del handler PATCH,
sobre el data mergeado, en la misma transaccion de escritura. Dos
ejemplos canonicos en el producto:

- Chunk 12C: cuando fuentes.length aumenta, data.borrador.desactualizado
  se setea a true automaticamente.
- Chunk 31C-2: cuando title o thesis cambian, data.gate_1a archiva el
  ultimoResultado en historial[] y resetea estado a 'pendiente'.

El patron es preferible a la alternativa de "deteccion en cliente via
comparacion en render" por tres razones:

1. Atomicidad: es imposible que exista un estado intermedio donde A
   ya cambio y B aun refleja el valor viejo. La ventana de inconsistencia
   es cero.

2. Autoridad: el backend es la unica fuente de verdad del estado del
   proyecto. Cualquier cliente (UI actual, UI futura, curl, script de
   terceros) obtiene el mismo resultado sin depender de logica de
   render.

3. Trazabilidad: si el reset implica archivar el valor viejo (como en
   31C-2 donde ultimoResultado va a historial[]), queda auditable en
   el data del proyecto sin depender de logs externos.

Conviene aplicar este patron cuando: (a) hay una relacion causal clara
entre dos campos del mismo row, (b) el campo derivado tiene consecuencias
en hard gates o UX, (c) el campo fuente se modifica con alguna frecuencia.

No conviene aplicar este patron cuando: (a) la relacion causal es
difusa (ej. "cuando cambia algo en fuentes, invalidar algo en pitch"),
(b) el costo computacional del reset es alto (ej. regenerar un resumen),
(c) el operador tiene razones legitimas para mantener ambos valores
desincronizados.

#### Contratos nuevos del backend registrados en el Chunk 31C

Los siguientes contratos son estables y pueden ser consumidos por
clientes futuros:

**Tool 'gate_1a' en /api/ai/generate.** Acepta userMessage con formato
`TITULO: <string>\nTESIS: <string opcional>`. Devuelve en result:
`{ supuestos: Gate1aSupuesto[], veredicto_global: 'sano' |
'requiere_correccion', resumen: string }`. Cada supuesto tiene
{ id, enunciado, categoria, veredicto, justificacion,
correccion_sugerida }. Categorias enumeradas: nombre_propio,
denominacion_oficial, fecha, existencia_entidad. Veredictos
enumerados: confirmado, dudoso, falso. Loguea consumo contra el
tenant 'investigapress'.

**Campo data.gate_1a en projects.** Shape persistida:
`{ estado: 'pendiente' | 'en_revision' | 'aprobado',
ultimoResultado: Gate1aResultado | null, aprobadoEn: ISO string |
null, historial: Gate1aResultado[] }`. Gate1aResultado incluye
enunciado_evaluado: { title, thesis } como snapshot del enunciado
al momento de la ejecucion (retrocompat con lectores que necesiten
reconstruir sobre que se ejecuto la revision).

**Code GATE_1A_REQUIRED en PATCH /api/projects/[id].** Devuelto con
status 400 cuando body.action === 'advance' y project.status ===
'draft' y data.gate_1a.estado !== 'aprobado'. El cliente debe mostrar
el error al operador y redirigirlo a la tab gate_1a.

**Code ENUNCIADO_INMUTABLE en PATCH /api/projects/[id].** Devuelto
con status 400 cuando body contiene title o thesis y
project.status !== 'draft'. El cliente debe mostrar el error. No es
recuperable sin retroceso del pipeline.

**Body title y thesis en PATCH /api/projects/[id].** Solo aceptados
en fase draft. Ediciones atomicas: si alteran el enunciado y existe
data.gate_1a, el backend archiva ultimoResultado en historial y
resetea estado a 'pendiente' en el mismo PATCH.

#### Estado del pipeline con Chunk 31D cerrado (18 abril 2026)

El Chunk 31D (Hito 1 — Validacion de hipotesis elegida) cerro en tres
sub-chunks ejecutados en una sola sesion larga:

- **31D-1** `04c4dd9` feat(chunk31d-1): Hito 1 backend — estado pipeline,
  gates, prompt y tool registry. Cinco archivos tocados: schema.ts (enum
  projects.status +hito_1), init-sql.ts (CHECK inline +hito_1 + bloque
  idempotente ALTER CONSTRAINT al final), api/projects/[id]/route.ts
  (PIPELINE_ORDER +hito_1 entre validacion y pesquisa, IP_PHASES +hito_1,
  dos hard gates nuevos HIPOTESIS_ELEGIDA_REQUIRED y HITO_1_REQUIRED,
  auto-reset atomico de data.hito_1 cuando cambia hipotesis_elegida),
  lib/ai/prompts.ts (buildHito1Prompt, ToolName +hito_1, registries IP+MP),
  api/ai/generate/route.ts (VALID_TOOLS +hito_1). +194/-3 netas.

- **31D-2** `82de623` feat(chunk31d-2): Hito 1 frontend — tab, handlers,
  codigos de error y retiro soft gate 9C. Un solo archivo:
  ProjectDetailClient.tsx. Extension del ActiveTool union, 7 interfaces
  TypeScript para Hito1 (Hito1Correctivo, Hito1Optimizadora, Hito1Resultado,
  Hito1Data, types auxiliares), entrada PHASE_CONFIG.hito_1 con tab unica,
  4 estados React (ejecutando/aprobando/error/verHistorial), handlers
  handleEjecutarHito1 y handleAprobarHito1, eliminacion del bloque soft
  gate 9C con comentario audit trail, dos codigos nuevos en el if-chain
  de handlePipelineAction (HIPOTESIS_ELEGIDA_REQUIRED redirige a tab
  hipotesis, HITO_1_REQUIRED redirige a tab hito_1), render completo del
  tab con dos paneles visualmente distintos (correctivo semaforizado
  verde/amber/rojo segun veredicto, optimizadora azul informativa),
  historial colapsable de revisiones previas. +377/-12 netas.

- **31D-3** [DOCUMENTAL] Este bloque. Cierre documental del Chunk 31D
  completo incluyendo decisiones arquitectonicas, patrones nuevos,
  validacion empirica y hallazgos emergentes.

#### Decisiones arquitectonicas del Chunk 31D

**D1 — Estado hito_1 entre validacion y pesquisa.** Insertado con valor
literal 'hito_1' en PIPELINE_ORDER, IP_PHASES, enum Drizzle de
projects.status, CHECK constraint de la columna en Postgres. El nombre
del campo persistido tambien es data.hito_1 por paralelismo exacto con
data.gate_1a (Chunk 31C), data.borrador (Chunk 8), data.borrador_ip
(Chunk 18). El nombre del estado es el nombre del campo, convencion
consistente.

**D2 — UI de una sola tab con dos paneles visualmente separados.** No
dos tabs, no dos componentes. Una tab unica con dos paneles renderizados
secuencialmente: Correctivo arriba (semaforizado), Optimizadora abajo
(azul fijo). La jerarquia semantica del 31B (correctivo bloquea,
optimizadora informa) se traduce a jerarquia visual consistente. Precedente
del Chunk 31C-2 (Gate 1a con una sola tab aunque muestra multiples
supuestos). Mezclar los dos criterios en un solo panel diluiria el diseño.

**D3 — Aprobacion directa sin confirm cuando veredicto correctivo es
'coherente'.** Si las tres dimensiones (coherencia, falsabilidad, viabilidad
factual) pasan, la aprobacion es directa. Si una o dos fallan
('requiere_reformulacion') o todas fallan ('inviable'), se dispara un
confirm() del navegador citando el veredicto literal para firma explicita
de asuncion de riesgo. Patron simetrico al Gate 1a del 31C-2.

**D4 — Auto-reset atomico de data.hito_1 al cambiar hipotesis_elegida.**
Cuando el body.data del PATCH contiene la key 'hipotesis_elegida' (cualquier
valor incluido null via handleCambiarEleccion), el backend archiva
data.hito_1.ultimoResultado en data.hito_1.historial[] y resetea
data.hito_1.estado a 'pendiente' en el mismo PATCH atomico. Simetrico
con el auto-reset del gate_1a del Chunk 31C-2 (reaccionando a cambios
en title/thesis). Patron arquitectonico consolidado: auto-reset atomico
en PATCH como respuesta generica al problema "cuando el campo A cambia,
el campo derivado B debe invalidarse".

**D5 — Hard gates nuevos reemplazan soft gate 9C.** Dos hard gates en
backend (HIPOTESIS_ELEGIDA_REQUIRED en validacion→hito_1,
HITO_1_REQUIRED en hito_1→pesquisa) son superiores operativa y
arquitectonicamente al soft gate 9C (confirm frontend en
validacion→pesquisa). Razones: (a) los hard gates operan a nivel backend
con codigo de error explicito y mensaje accionable, (b) el frontend se
limita a mostrar alert + redirigir al tab apropiado (setActiveTool),
(c) no hay doble barrera confusa, (d) cualquier cliente (UI actual,
cliente externo, curl) obtiene el mismo bloqueo. Ver "Revision formal
de la decision U3 del Chunk 31C" mas abajo.

**D6 — Gates hard con redireccion a tab especifica.** HIPOTESIS_ELEGIDA_REQUIRED
redirige via setActiveTool('hipotesis') porque la accion correctiva
(elegir hipotesis) esta en una tab anterior a la actual. HITO_1_REQUIRED
redirige a setActiveTool('hito_1') porque la accion correctiva (ejecutar
y aprobar Hito 1) esta en la tab actual. Patron: el gate redirige donde
esta la accion que desbloquea, no donde disparo el error.

**D7 — Separacion conceptual: fases que dependen del modelo vs fases
que dependen del operador.** El Gate 1a y el Hito 1 operan sobre
conocimiento de entrenamiento de Claude Sonnet 4 (corte ~abril 2025).
Ambos evaluan FORMA (coherencia del enunciado, estructura epistemologica
de la hipotesis), no CONTENIDO FACTUAL actualizado. Las fases que
dependen de contenido factual actualizado (ODF, Borrador IP en modo
evidencia disponible, Borrador MP, Validador IP) consumen data.fuentes[]
poblada por el operador con trabajo editorial externo. La plataforma
asiste en cada paso pero no sustituye la responsabilidad editorial del
operador. Consistente con el principio "asiste, no automatiza" del
Chunk 12E y con la conexion de cortes epistemicos del Chunk 25b.

**D8 — Prompt del Hito 1 con dos criterios separados por diseño.** El
system prompt del Hito 1 explicita que correctivo y optimizadora son
capas ortogonales: el correctivo pregunta "esta hipotesis no deberia
avanzar", el optimizador pregunta "esta hipotesis podria ser mejor".
Mezclarlos degrada ambos. El prompt fuerza output JSON estricto con
dos sub-objetos separados (correctivo + optimizadora) y un resumen
que integra ambos sin mezclarlos. Validado empiricamente con el test
2 del 31D-1 (Hospital Arica 100) y la ejecucion productiva de
IP-2026-0005.

#### Patron reutilizable registrado: ALTER CONSTRAINT en init-sql.ts

Antes del 31D-1, el unico patron de modificacion de schema en init-sql.ts
era ALTER TABLE ADD COLUMN IF NOT EXISTS (Chunk 28). El Chunk 31D-1
introduce el patron de modificacion de CHECK constraints:

    ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
    ALTER TABLE projects ADD CONSTRAINT projects_status_check
      CHECK (status IN ( ... lista actualizada ... ));

Caracteristicas:
- Idempotente: re-ejecutar regenera exactamente la misma constraint.
- Atomico: DROP + ADD en secuencia, sin ventana donde la tabla quede
  sin la constraint en un deploy productivo.
- Nombre canonico confirmado: 'projects_status_check' (convencion
  estandar de Postgres aplicada a la columna 'status' de la tabla
  'projects'). Verificado pre-deploy en Railway via SELECT a
  pg_constraint.
- Sin bloque DO $$ dinamico porque el nombre es conocido y estable.

Uso esperado en chunks futuros: cualquier modificacion del enum de
status (agregar estados nuevos, deprecar estados existentes) o de
cualquier otra columna con CHECK de valores enumerados sigue este
patron.

Verificacion del nombre antes de usar el patron: si la tabla/columna
nunca se modifico, el nombre convencional aplica. Si hay dudas, query
diagnostica:

    SELECT conname, pg_get_constraintdef(oid)
    FROM pg_constraint
    WHERE conrelid = '<tabla>'::regclass
      AND contype = 'c';

#### Revision formal de la decision U3 del Chunk 31C

La decision U3 del 31C (registrada en la seccion "Decisiones arquitectonicas
cerradas durante la implementacion del Chunk 31C") establecio que el soft
gate 9C (confirm frontend al avanzar validacion→pesquisa sin hipotesis
elegida) quedaba intacto y seria reemplazado en el Chunk 31D por un hard
gate formal. Esa revision fue ejecutada en el 31D-2 edicion 6a:

- Eliminado: el bloque de 11 lineas en handlePipelineAction (aprox
  lineas 1149-1159 pre-31D-2) que disparaba un confirm() con el texto
  "No elegiste ninguna hipotesis. La fase Pesquisa funciona mejor con
  una hipotesis ancla. ¿Avanzar igual?".
- Reemplazado por: comentario audit trail de 3 lineas citando el hard
  gate del backend como sustituto.
- El hard gate HIPOTESIS_ELEGIDA_REQUIRED del 31D-1 opera en la
  transicion validacion→hito_1 (nueva, post-31D) en lugar de
  validacion→pesquisa (la anterior, pre-31D).

Validado empiricamente en IP-2026-0005: al hacer click Avanzar desde
fase validacion sin hipotesis elegida, aparece alert con mensaje del
hard gate y la tab activa cambia a Generador de Hipotesis. NO aparece
el confirm viejo. El retiro del 9C se comporta como fue diseñado.

La decision U3 queda marcada como REVISADA EN 31D-2. Ninguna accion
pendiente.

#### Validacion end-to-end empirica con IP-2026-0005

Durante la sesion del 18 abril 2026, el Chunk 31D completo (31D-1 + 31D-2)
fue validado end-to-end con un proyecto real creado especificamente
para ese fin: IP-2026-0005 "COMISION PRESIDENCIAL ARICA 100". Los seis
hitos del pipeline canonico IP fueron ejercitados visualmente:

- **Hito A — Creacion en draft**: OK. Pipeline bar renderiza el cuadrito
  'hito_1' entre Validacion y Pesquisa, confirmando que el PIPELINE_ORDER
  nuevo del 31D-1 se propaga correctamente al frontend via el campo
  pipelinePhases del GET /api/projects/[id].
- **Hito B — Gate 1a (31C)**: OK. Veredicto 'requiere_correccion' sobre
  dos supuestos dudosos (denominacion, estatus politica de Estado).
  Aprobado con confirm de riesgo. Gate 1a del 31C no presenta regresiones.
- **Hito C — Hard gate HIPOTESIS_ELEGIDA_REQUIRED + retiro 9C**: OK.
  Alert con mensaje del hard gate, redireccion a tab hipotesis, NO
  aparicion del confirm viejo 9C. Validacion empirica del diseño D5/D6.
- **Hito D — Generacion + eleccion + transicion a hito_1**: OK. La tab
  "Hito 1 - Validacion de Hipotesis" se activa automaticamente, panel
  introductorio visible, botones contextuales operativos.
- **Hito E — Ejecucion Hito 1**: OK. Veredicto correctivo 'coherente'
  (tres dimensiones en verde), optimizadora informando 'existe_angulo_mejor:
  false'. Render semaforizado verde del panel correctivo. Render azul
  de la optimizadora. Parser JSON limpio (parseError null). Validacion
  empirica del diseño D2/D8.
- **Hito F — Aprobacion + transicion a pesquisa**: OK. Aprobacion directa
  sin confirm (veredicto coherente). Transicion limpia a fase pesquisa.
  Tab activa cambia a Organizador de Fuentes. Hard gate HITO_1_REQUIRED
  satisfecho implicitamente.

Caminos no ejercitados explicitamente pero cubiertos por simetria logica
del codigo:
- Path 3 (confirm de asuncion de riesgo con veredicto no-coherente): la
  rama de codigo `if (veredicto !== 'coherente') confirm(...)` es
  simetrica con el Gate 1a y fue validada en aquel. La invocacion en el
  Hito 1 sigue el mismo patron.
- Path 4 (auto-reset atomico al cambiar hipotesis elegida): el bloque
  de 31D-1 Edicion 3d fue validado en los curls iniciales de la sesion
  via comparacion de estado pre/post. Simetria exacta con el auto-reset
  del gate_1a del 31C-2.
- Path 4-bis (hard gate HITO_1_REQUIRED desde UI): la estructura de
  codigo en route.ts y en handlePipelineAction es simetrica con
  HIPOTESIS_ELEGIDA_REQUIRED. Misma logica, mismo patron de alert +
  setActiveTool.

El proyecto IP-2026-0005 queda persistido en Railway como registro
del primer caso productivo que ejercito el pipeline canonico del 31D.

#### Hallazgo operativo: caracter \n invisible en ADMIN_TOKEN

Durante la sesion del 18 abril 2026, al intentar ejecutar POST
/api/admin/init con el nuevo ADMIN_TOKEN rotado (proceso disparado
por exposicion accidental del token viejo en canal de chat con el
asistente arquitecto), el endpoint devolvia persistentemente
{"error":"Unauthorized"} aunque el token tipeado era el correcto.

Diagnostico final: el token guardado en Vercel Environment Variables
contenia un caracter \n (newline) al final, introducido por un paste
desde la salida de un comando tipo `openssl rand -hex 32` o
`cat /dev/urandom | head -c 40` que incluye newline implicito. Vercel
detecto la anomalia y mostro el warning "This value starts and ends
with whitespace and has return characters." en la UI de edicion.

El endpoint comparaba el token de la URL (limpio) contra process.env.
ADMIN_TOKEN (con '\n' al final) y nunca matcheaba. Al eliminar el
Enter final del campo Value en Vercel, guardar, y esperar redeploy
automatico, el endpoint respondio success.

Aprendizaje operativo registrado para futuras rotaciones de secretos:

1. Cuando se genera un token con herramientas Unix que emiten salida
   con newline implicito (la mayoria), evitar seleccion por "toda la
   linea" — seleccionar solo los caracteres del token.
2. Vercel muestra warning visible cuando detecta whitespace anomalo
   en el valor guardado. El warning es informativo, no bloqueante, pero
   debe ser atendido antes de considerar el secret como "bien guardado".
3. Cuando un endpoint protegido por token devuelve Unauthorized
   persistentemente con lo que parece ser el token correcto, inspeccionar
   el campo Value en Vercel buscando whitespace invisible antes de
   asumir un bug del endpoint.

#### Hallazgo emergente: loop Gate 1a → motor externo → correccion de enunciado

Durante la validacion empirica con IP-2026-0005, el operador construyo
fuera de la plataforma (usando su ecosistema de agentes con web search
activo) un expediente de verificacion forense formal:

    EXPEDIENTE_ARICA_100_VF-2026-0001.docx
    Titulo: "EXPEDIENTE DE VERIFICACION FORENSE"
    Fecha: 18 abril 2026
    Agente ejecutor: verificador-forense (Sala de Investigacion y Redaccion)

El expediente resuelve con precision documental los dos supuestos que
el Gate 1a del 31C habia flaggeado como 'dudoso':

- Supuesto 1 (denominacion): VEREDICTO INCORRECTO. La denominacion
  correcta es "Comision Asesora Presidencial para la conmemoracion del
  centenario del Tratado de Lima", no "Comision Presidencial Arica 100".
  La palabra "Asesora" no es decorativa — define la naturaleza juridica
  como organo consultivo, no ejecutivo.
- Supuesto 2 (politica de Estado): VEREDICTO PARCIALMENTE CORRECTO. El
  Presidente Boric califico el informe como "politica de Estado" en
  declaracion publica, pero no existe instrumento juridico vinculante
  que formalice esa designacion. La expresion fue aspiracional, no
  juridico-formal.

El expediente incluye redaccion sugerida del enunciado corregida,
clasificacion de confianza porcentual de cada hallazgo, 13 fuentes
especificas nombradas con sus fechas de publicacion, y un dictamen
accionable.

**Lo que este hallazgo revela**: existe un loop operativo valioso que
el pipeline IPMP actual no formaliza:

    Crear proyecto → Gate 1a flaggea supuestos dudosos →
      → Operador exporta enunciado a motor externo con search →
      → Vuelve con expediente de correccion del enunciado →
      → Edita enunciado en IPMP (dispara auto-reset atomico 31C-2) →
      → Re-ejecuta Gate 1a → ahora pasa 'sano' →
      → Continua pipeline con enunciado editorialmente validado

El Chunk 12B creo un exportador de pesquisa externa pero analogo no
existe para la etapa de correccion de enunciado. El Gate 1a sabe detectar
dudosos pero no puede resolverlos (no tiene web search). El loop queda
hoy en el operador, sin soporte formal de la plataforma.

**Candidato a Chunk 31I — Exportador de enunciado para correccion
externa.** Deuda arquitectonica documentada formalmente. No es parte
del alcance del Chunk 31D. Abre material para el roadmap de sub-chunks
futuros.

El expediente EXPEDIENTE_ARICA_100_VF-2026-0001.docx queda anclado
como el primer caso real documentado del loop Gate 1a ↔ motor externo,
insumo editorial para el diseño eventual del 31I.

#### Contratos nuevos del backend registrados en el Chunk 31D

**Tool 'hito_1' en /api/ai/generate.** Acepta userMessage con formato
'TITULO: <str>\nTESIS: <str o "(no declarada)">\nHIPOTESIS ELEGIDA:\n
<serializacion>'. Devuelve en result:
`{ correctivo: Hito1Correctivo, optimizadora: Hito1Optimizadora,
resumen: string }`. Hito1Correctivo tiene:
`{ veredicto: 'coherente'|'requiere_reformulacion'|'inviable',
dimensiones: { coherencia, falsabilidad, viabilidad_factual }
(cada una con pasa: boolean, justificacion: string),
problemas_detectados: string[], reformulacion_sugerida: string | null }`.
Hito1Optimizadora tiene:
`{ existe_angulo_mejor: boolean, angulo_sugerido: string | null,
justificacion: string, trade_offs: string[] }`. Loguea consumo contra
el tenant 'investigapress'. Costo tipico: ~USD 0.015 por invocacion
(Sonnet 4, ~1800 input + ~600 output tokens). Latencia tipica: 10-15
segundos.

**Campo data.hito_1 en projects.** Shape persistida:
`{ estado: 'pendiente' | 'en_revision' | 'aprobado',
ultimoResultado: Hito1Resultado | null, aprobadoEn: ISO string | null,
historial: Hito1Resultado[] }`. Hito1Resultado incluye hipotesis_evaluada:
HipotesisElegida como snapshot completo para trazabilidad.

**Code HIPOTESIS_ELEGIDA_REQUIRED en PATCH /api/projects/[id].** Devuelto
con status 400 cuando body.action === 'advance' y project.status ===
'validacion' y data.hipotesis_elegida no existe o no es objeto. El
cliente debe mostrar alert con json.error y ejecutar setActiveTool
('hipotesis') para redirigir al generador.

**Code HITO_1_REQUIRED en PATCH /api/projects/[id].** Devuelto con
status 400 cuando body.action === 'advance' y project.status ===
'hito_1' y data.hito_1.estado !== 'aprobado'. El cliente debe mostrar
alert con json.error y ejecutar setActiveTool('hito_1') para redirigir
al tab correspondiente.

**Auto-reset atomico de data.hito_1 en PATCH /api/projects/[id].** Se
dispara cuando el body.data contiene la key 'hipotesis_elegida' (cualquier
valor, incluido null). Archiva data.hito_1.ultimoResultado en
data.hito_1.historial[] y resetea data.hito_1.estado a 'pendiente',
data.hito_1.aprobadoEn a null, data.hito_1.ultimoResultado a null.
Operacion atomica en el mismo PATCH. Convive con el auto-reset del
gate_1a del 31C-2 — ambos bloques operan sobre updates.data tomando el
ultimo valor merged, orden seguro.

