# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
   - Pipeline statuses: `produccion`, `visual`, `revision`, `aprobado`, `exportado`.
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
- `src/db/schema.ts` defines 8 tables: `tenants`, `users`, `templates`, `projects`, `assets`, `revisions`, `exports` (exported as `exports_` to avoid ES reserved-word collision), `consumption_logs`. On `projects`, `tenantId` and `templateId` are **nullable by design** (see IP phase above) — do not add `.notNull()` to them.
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

### Chunk 9 — Refinements

- Local `.env.local` setup for development (pending since 10 abril 2026 when localhost validation was skipped in favor of production validation).
- Cleanup of the legacy `/tools/angulos` route — either drop it from the nav, or refactor to the current IP/MP model.
- Soft gates on pipeline transitions (finding "e").
- Remove the `dato_referencial` category from the prompt (finding "b").
- UX polish driven by real usage feedback.
- Basic exporter implementation for the `exportado` phase.
- Campo URL libre por fuente en ODF (finding "a1" del Chunk 7) — input opcional de texto, sin infraestructura de storage.
- Curacion del historial del Validador de Borrador (finding "b" del Chunk 7, preexistente de Chunk 6) — boton "Marcar como definitiva" + boton "Eliminar" por entrada, patron identico al de `hipotesis_elegida`.
- Boton de navegacion en el placeholder del tab VHP bloqueado (finding "c" del Chunk 7) — secondary button debajo del mensaje que dispare `setActiveTool('hipotesis')`.
- Refinamiento de la regla de extension del prompt de `generador_borrador` (finding "a" del Chunk 8) — hacer explicito en el prompt MP que el rango de palabras es un objetivo, no un requisito duro. Si el expediente tiene poca evidencia documentada, el borrador puede quedar por debajo del minimo del rango y debe declararlo explicitamente en `notas_editoriales`.
- Prefill del textarea de notas del operador en el Generador de Borrador (finding "b" del Chunk 8) — al montar el tab, si `data.borrador?.notasOperador` existe y el estado local esta vacio, prefill con ese valor. Patron identico al prefill del Constructor de Pitch desde `hipotesis_elegida`.
- Fallback de copia al portapapeles en el Generador de Borrador (finding "c" del Chunk 8) — agregar un `<textarea>` oculto con la version texto plano del borrador y, en caso de fallo de `navigator.clipboard.writeText`, focusear y seleccionar ese textarea para que el operador pueda hacer Ctrl+C manualmente.
- Pipeline puede arrancar sin tesis obligatoria (decision tomada el 11 abril 2026) — modificar el formulario de creacion de project para hacer `thesis` opcional y agregar un placeholder en el detail view tipo "Aun no hay tesis. Genera hipotesis primero, eligi una, y la tesis se infiere de ella". Refleja un flujo de trabajo periodistico real: a veces el operador arranca con un documento o un dato, no con una tesis.
