# miniBIOTA App - Codex Agent Entry Point

## What This Repo Is
`miniBIOTA_App` is the internal Electron desktop app for miniBIOTA operations. It provides the Story Dashboard, Weekly Checklist, Content Calendar, Tasks, Financials, CRM, Roadmap, Site Admin, and Monitoring surfaces.

Codex is the primary operating interface for this repo moving forward. `CLAUDE.md` and older `handoff_claude_*` files remain as legacy context only; active operating rules belong in `AGENTS.md`, `docs/agent_protocol.md`, Brain Markdown, or Supabase when the record is structured.

## Tech Stack
- Electron desktop app.
- Plain HTML/CSS/JavaScript renderer files.
- Direct Supabase access through service-role credentials in `js/config.js`; this is an internal tool only.
- MQTT telemetry in `js/monitoring.js`.
- Backend-like Electron IPC in `main.js` / `preload.js`.
- Sharp image processing in `services/image-upload.js`.
- SQL migrations in `migrations/`, run manually in Supabase SQL Editor.
- Brain tool layer at `M:\miniBIOTA\miniBIOTA_Brain\_system\minibiota_tools.py`.
- Brain strategy brief at `M:\miniBIOTA\miniBIOTA_Brain\11. App Operations\app_brief.md`.

## Startup Sequence
For a full Codex bootstrap, run:

```powershell
powershell -ExecutionPolicy Bypass -File "_system/codex_session_start.ps1"
```

If working manually:

1. Read `AGENTS.md`.
2. Read `docs/agent_protocol.md`.
3. Read `M:\miniBIOTA\miniBIOTA_Brain\_system\agent_memory.md`.
4. Read `M:\miniBIOTA\miniBIOTA_Brain\11. App Operations\app_brief.md`.
5. Read `M:\miniBIOTA\miniBIOTA_Brain\BRAIN_AGENT_PROTOCOL.md`.
6. Load the lightest app file or Brain context that can safely answer the request.
7. Read `CLAUDE.md` only when checking legacy context that has not yet been migrated into Codex-facing docs.

## Source Of Truth
Use this hierarchy when sources disagree:

1. User direction in the current session.
2. `AGENTS.md` and `docs/agent_protocol.md` for App Agent operating rules.
3. Brain `11. App Operations/app_brief.md` for strategy-level current app state.
4. Brain protocol/memory for cross-domain constraints and current system state.
5. App source files for runtime behavior.
6. Supabase for structured/queryable records and schema truth.
7. `CLAUDE.md` or `handoff_claude_*` only as legacy context.

Chat history and private model memory are never source of truth. Durable project memory belongs in Markdown in this repo/vault, in Brain, or in Supabase when it is structured data.

## File Structure
| File / Folder | Purpose |
|---|---|
| `index.html` | Full HTML shell: tabs, modals, and content containers |
| `css/dashboard.css` | App styling |
| `js/config.js` | Supabase constants and `api()` helper |
| `js/core.js` | Story dashboard, checklist, tasks, financials, roadmap |
| `js/crm.js` | CRM tab: contacts, pipeline, activities, overdue UI |
| `js/admin.js` | Site admin: species, biosphere, biomes, chronicles, announcements, staging |
| `js/calendar.js` | Content calendar |
| `js/monitoring.js` | Live biome telemetry and setpoint control |
| `main.js` | Electron entry point and IPC handlers |
| `preload.js` | Renderer-safe IPC bridge |
| `services/image-upload.js` | Sharp WebP conversion and Supabase Storage upload |
| `migrations/` | Manual Supabase SQL migrations |
| `tools/` | Local maintenance and export scripts |

Script load order matters in `index.html`: `config.js` -> `core.js` -> `admin.js` -> `calendar.js` -> `monitoring.js` -> `crm.js`.

## Key Technical Notes
- Supabase table name is `biosphere_profile` singular, not `biosphere_profiles`.
- Storage buckets are `images` for species/biomes/biosphere and `chronicles-images` for chronicles.
- Image uploads go renderer -> preload IPC -> Electron main -> `services/image-upload.js` -> Sharp WebP -> Supabase Storage. There is no original-file fallback.
- If a WebP upload succeeds but the follow-up DB write fails, admin upload flows should delete the newly uploaded object to avoid orphaned storage files.
- Biodiversity counts are read from stored DB values only; do not auto-calculate them in the app.
- `admLoaded` is declared in `admin.js` but read in `showPage()` in `core.js` through shared browser global scope.
- Content calendar content fields use conditional payload inclusion so empty unmigrated fields do not cause 400 errors.
- Monitoring connects directly to MQTT at `192.168.8.228:1883` on the mB2.4 WiFi and falls back to the Supabase `telemetry_snapshot` singleton.

## Run Commands
```powershell
npm start
npm run build
npm run telemetry:export:sample
```

Use `npm start` for interactive desktop testing only when the user expects the app to launch. Use the smallest meaningful noninteractive check for documentation or targeted code changes.

## Supabase And Safety
This app has service-role access and can affect live operational records. Before modifying Supabase records, schema, storage objects, telemetry controls, or anything that can affect the living biosphere, explain the intended change and get confirmation unless the session explicitly enables safe write mode for that action.

Do not create dummy database or storage writes to inspect behavior. Read source, function signatures, or schema instead.

## Brain Relationship
This repo reports to the Strategy Agent through:

`M:\miniBIOTA\miniBIOTA_Brain\11. App Operations\app_brief.md`

Update that brief at session end when app behavior, schema assumptions, operational status, risks, blockers, or cross-domain dependencies change. Keep implementation detail and code context in this repo.

## Write Policy
Respect `MINIBIOTA_WRITE_MODE` from Brain when available:

| Mode | Behavior |
|---|---|
| `read-only` | No writes anywhere |
| `confirm-before-write` | Confirm with the user before writes |
| `safe-write` | Writes may proceed after stating what will change |

For this repo, tell the user what files you intend to change before editing. Keep edits scoped to the active request and preserve user changes.

## Verification
For documentation-only sessions:
- Read every new or changed doc end to end.
- Run `git diff --name-only` or equivalent.
- Confirm no app behavior, schema, or database records changed.

For implementation sessions:
- Run the smallest meaningful check available, such as `node --check` on changed JS files.
- For Electron runtime changes, run `npm start` only when interactive app launch is expected.
- For build/package changes, run `npm run build` when practical.
- For route/tab/UI changes, verify the affected tab behavior manually or with the most practical smoke test.

## Session Closeout Report
Close every session with:

```markdown
Changed files:
- path

Verification:
- command or read-through performed

Not changed:
- app behavior/database/schema/etc. as relevant

Unresolved questions:
- item or "None"
```

Update `M:\miniBIOTA\miniBIOTA_Brain\11. App Operations\app_brief.md` when the session changes durable cross-domain state, schema assumptions, operating rules, or app status other agents must know.
