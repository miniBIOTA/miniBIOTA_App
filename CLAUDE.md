# miniBIOTA App — Claude Code Wrapper

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
| `js/core.js` | Story dashboard, checklist, tasks, financials, sales, roadmap |
| `js/admin.js` | Site admin — species, biosphere, biomes, chronicles, announcements, staging |
| `main.js` | Electron entry point |
| `package.json` | Electron + electron-builder config |
| `assets/icon.ico` | App icon (miniBIOTA logo) |

**Script load order matters:** `config.js` → `core.js` → `admin.js`. Admin depends on `SUPABASE_URL`, `SUPABASE_KEY`, `HEADERS`, `api()` (config), and `escHtml()`, `systemMap` (core).

## Key Technical Notes

- **Supabase table name:** `biosphere_profile` (singular — NOT `biosphere_profiles`)
- **Storage buckets:** `images` (species, biomes, biosphere) and `chronicles-images` (chronicles)
- **Image uploads:** WebP conversion via Canvas API (1600px max, 85% quality) before upload
- **Biodiversity counts** (total extant species, active realms/biomes): read from stored DB values only — do not auto-calculate
- **`admLoaded` flag** is declared in `admin.js` but read in `showPage()` in `core.js` — works via shared global browser scope

## Planned Next Phases

- **Monitoring tab (9th tab):** Live biome telemetry and setpoint control. Connects directly to MQTT broker at `192.168.8.228:1883` (when on mB2.4 WiFi); falls back to Supabase `telemetry_snapshot` singleton. Shows 6 biome cards with bio temp, atmo temp, humidity, liquid temp, pump %, current setpoint. Setpoint control publishes directly to MQTT (`miniBIOTA/biome/{N}/setpoint`) and queues in Supabase `setpoint_commands`. Full spec in `M:\miniBIOTA\miniBIOTA_Brain\6. Engineering & Hardware\telemetry_pipeline_plan.md`.
- **Phase 3:** PWA at `minibiota.com/log` — mobile field logging (species, biome, photo, GPS → Supabase `observations`)
  - Needs: `log.html`, `manifest.json`, `service-worker.js`
- **Phase 4:** Capacitor-wrapped `.apk` for sideloaded Android install (no Play Store)

## Write Policy

Follow the cautious write model from Brain: confirm before writing to Supabase unless the session explicitly enables safe write mode.
