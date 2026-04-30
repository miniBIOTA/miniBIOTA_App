# miniBIOTA App - Legacy Claude Context

> Legacy note: miniBIOTA_App now uses Codex as the primary operating interface. This file is retained for historical Claude context only; active Codex rules live in `AGENTS.md` and `docs/agent_protocol.md`.

## Role
You are working on the miniBIOTA desktop app and mobile logging tools. This repo contains the code. Context, schema knowledge, and strategy live in Brain.

## Before Starting

Read these Brain files first:
- `M:\miniBIOTA\miniBIOTA_Brain\_system\agent_memory.md` — current system state, Supabase schema, watchouts
- `M:\miniBIOTA\miniBIOTA_Brain\BRAIN_AGENT_PROTOCOL.md` — operating rules shared across all agents

For Supabase schema questions (tables, columns, RLS): use the Supabase MCP plugin or `minibiota_tools.py` at `M:\miniBIOTA\miniBIOTA_Brain\_system\minibiota_tools.py`.

## What This Repo Is

Electron desktop app for internal miniBIOTA operations. Connects directly to Supabase via service_role key (bypasses RLS — internal tool only).

**Launch:** `npm start` from this folder, or double-click the desktop shortcut `miniBIOTA.lnk`.
**Build distributable `.exe`:** `npm run build` → outputs to `dist/`.

## File Structure

| File | Purpose |
|---|---|
| `index.html` | Full HTML shell — all page tabs and content divs |
| `css/dashboard.css` | All styles |
| `js/config.js` | Supabase credentials + `api()` fetch helper |
| `js/core.js` | Story dashboard, checklist, tasks, financials, roadmap |
| `js/crm.js` | CRM tab — contacts, pipeline, activities, modals, overdue badge/banner |
| `js/admin.js` | Site admin — species, biosphere, biomes, chronicles, announcements, staging |
| `js/calendar.js` | Content calendar |
| `js/monitoring.js` | Live biome telemetry (MQTT + Supabase fallback) |
| `main.js` | Electron entry point |
| `services/image-upload.js` | Backend image pipeline: Sharp WebP conversion + Supabase Storage upload |
| `package.json` | Electron + electron-builder config |
| `assets/icon.ico` | App icon (miniBIOTA logo) |
| `migrations/` | SQL migration files (run manually in Supabase SQL Editor) |

**Script load order matters:** `config.js` → `core.js` → `admin.js` → `calendar.js` → `monitoring.js` → `crm.js`. Each depends on globals from earlier scripts (`SUPABASE_URL`, `HEADERS`, `api()`, `escHtml()`, `TODAY`, `fmtUSD()`).

## Key Technical Notes

- **Supabase table name:** `biosphere_profile` (singular — NOT `biosphere_profiles`)
- **Storage buckets:** `images` (species, biomes, biosphere) and `chronicles-images` (chronicles)
- **Image uploads:** Renderer sends image bytes to Electron main via IPC; `services/image-upload.js` converts with Sharp to WebP (1600px max, quality 82), strips metadata, uploads only WebP to Supabase Storage, and returns an error with no original fallback if conversion/upload fails.
- **Image storage hygiene:** Admin upload flows delete newly uploaded WebP files if the follow-up database write fails, preventing orphaned bucket objects.
- **Biodiversity counts** (total extant species, active realms/biomes): read from stored DB values only — do not auto-calculate
- **`admLoaded` flag** is declared in `admin.js` but read in `showPage()` in `core.js` — works via shared global browser scope
- **Content calendar modal** is tabbed (Details / Content / Production). New content fields (`thumbnail_text`, `publish_title`, `video_description`, `script`) use conditional payload inclusion — they're only sent if non-empty, avoiding 400 errors before the migration runs. Migration: `migrations/003_content_calendar_content_fields.sql`.

## Planned Next Phases

- **Phase 3:** PWA at `minibiota.com/log` — mobile field logging (species, biome, photo, GPS → Supabase `observations`)
  - Needs: `log.html`, `manifest.json`, `service-worker.js`
- **Phase 4:** Capacitor-wrapped `.apk` for sideloaded Android install (no Play Store)

## Completed Phases

- **CRM tab** (replaced Sales Pipeline): contacts, pipeline kanban, activities with overdue tracking. Tables: `crm_contacts`, `crm_activities`, `partner_opportunities.contact_id`. Migration: `migrations/002_crm_schema.sql`.
- **Monitoring tab (9th tab):** Live biome telemetry and setpoint control. Connects directly to MQTT broker at `192.168.8.228:1883` (when on mB2.4 WiFi); falls back to Supabase `telemetry_snapshot` singleton.

## Legacy Session Close-Out Protocol

Active closeout rules now live in `AGENTS.md` and `docs/agent_protocol.md`. The notes below are retained only as historical context from the prior Claude workflow.

At the end of every session — before confirming completion to the user — run through this checklist:

**1. Update CLAUDE.md**
- Add any new files to the File Structure table
- Update script load order if it changed
- Move completed phases from Planned → Completed
- Add any new Key Technical Notes discovered (gotchas, constraints, non-obvious patterns)

**2. Update or create memory files**
- New tables, columns, or schema decisions → project memory
- New behavioral feedback from the user (corrections, confirmations, preferences) → feedback memory
- New external resources or tools referenced → reference memory
- User context updates (role, expertise, goals) → user memory
- Always check existing memories for staleness — update or remove outdated entries

**3. Reflect and extract lessons**
- What worked well this session? Capture as confirmed feedback if non-obvious.
- What caused friction or rework? Save as a watchout.
- Did any assumption prove wrong? Update or add a memory to prevent repeating it.
- Are there patterns in the user's preferences worth encoding?

**4. Index**
- Add any new memory files to `MEMORY.md` with a one-line hook

Do this proactively — do not wait for the user to ask.

## Write Policy

Follow the cautious write model from Brain: confirm before writing to Supabase unless the session explicitly enables safe write mode.
