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

### Chunk 17+ — Futuros (sin orden definitivo)

- Asset library per tenant con versionado y metadata obligatoria (declaracion IA, alt text, origen).
- Bitacora de Pesquisa Externa con trazabilidad de hallazgos por motor: workflow externo documentado en 14C. Feature de plataforma diferida: registrar cada exportacion con que motor se uso, que hallazgos se promovieron al ODF y cuales se descartaron. Implementar cuando la plataforma se abra a operadores externos.
