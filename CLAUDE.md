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

### Chunk 11 — Integracion agenda-pitch (next priority)

Conectar la agenda de editores del Chunk 10 con el Constructor de Pitch existente. El objetivo es que cuando el operador esta armando un pitch en fase `produccion` para un project con `tenant` + `template` + `tier objetivo` definidos, el formulario del Constructor autopopule o sugiera el campo "medio destino" / "editor destino" desde `editores_agenda` filtrado por:

- `activo = true` (no proponer contactos soft-deleted).
- `tier` del editor matcheando el tier objetivo del pitch (idealmente <= al tier objetivo para permitir escalar hacia arriba).
- `tenants_relevantes` conteniendo el slug del tenant del project.
- Opcionalmente, `tipo_pieza_recomendado` conteniendo un identificador derivado de `template.family` (ej. family `prensa` matchea `reportaje`, `nota`, `entrevista`; family `opinion` matchea `columna`).

Alcance propuesto (a refinar al arrancar el chunk):
- Nuevo endpoint `GET /api/editores/sugerencias` que recibe `tenantSlug`, `tier`, `templateFamily` y devuelve el subset filtrado. Alternativa: filtrar en el client desde la lista completa si el volumen lo permite (<100 entries). Decision dependiente de como resulte la UX.
- Modificacion del tab de Constructor de Pitch en `ProjectDetailClient.tsx` para agregar un panel "Editores sugeridos" antes o dentro del form actual, con chips clickeables que autopopulan el campo destino.
- Posible refinamiento del prompt del Constructor para inyectar el nombre del editor elegido como contexto adicional cuando esta disponible.

Dependencias: Chunk 10 completo (listo). No requiere cambios en otras areas del pipeline.

### Chunk 12+ — Futuros (sin orden definitivo)

- Exportador basico para fase `exportado` (primer destino probable: `empaquetado_interno` como zip). Chunk dedicado.
- Upload real de documentos fuente en el ODF (a2 del Chunk 7): infraestructura de storage (Vercel Blob o S3), signed URLs, MIME validation, max file size, deletion contract. Chunk dedicado, probablemente el mas grande pendiente.
- Asset library per tenant con versionado y metadata obligatoria (declaracion IA, alt text, origen).
- Cleanup del map `VERIFICACION_COLORS` en `ProjectDetailClient.tsx`: eliminar la entrada `dato_referencial` que quedo huerfana despues del Chunk 9A D1 (se preservo para retrocompat de hipotesis legacy, pero se puede remover cuando se confirme que ya no quedan hipotesis antiguas con ese valor en produccion).
- Cleanup del canal de error del Validador de Borrador: posiblemente consolidar `borradorError` y `genBorradorError` en un solo namespace cuando la arquitectura de errores evolucione. Por ahora conviven sin problemas.
