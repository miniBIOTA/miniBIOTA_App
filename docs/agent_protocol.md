# App Agent Protocol

## Purpose
This protocol gives Codex the working rules for repo-native sessions in `miniBIOTA_App`. `AGENTS.md` is the active entry point. `CLAUDE.md` and `handoff_claude_*` files are retained only as legacy context from the earlier Claude workflow.

## Startup Procedure
1. Run the App startup helper when possible:

```powershell
powershell -ExecutionPolicy Bypass -File "_system/codex_session_start.ps1"
```

2. If working manually, read:
   - `AGENTS.md`
   - this file
   - `M:\miniBIOTA\miniBIOTA_Brain\_system\agent_memory.md`
   - `M:\miniBIOTA\miniBIOTA_Brain\BRAIN_AGENT_PROTOCOL.md`
3. Load only the app source files needed for the request.
4. Use Supabase or live app operations only when current structured records or runtime behavior are needed.
5. Read `CLAUDE.md` only when checking legacy context that has not yet been migrated into Codex-facing docs.

## Planning Before Writing
For medium or large tasks, plan before writing. Name:
- App files likely to change.
- Brain docs or records that may need updates.
- Supabase records, storage buckets, schema, or telemetry controls that may be touched.
- Verification expected before closeout.
- Any approval needed.

Tiny documentation edits can proceed after a short statement of intent when write mode allows it.

## Approval Before Writing
Always get explicit approval before:
- Database writes in confirm-before-write mode.
- Supabase schema changes or migrations.
- Supabase Storage writes/deletes.
- Telemetry control changes, setpoint writes, or anything that could affect the biosphere.
- Irreversible deletion or archival.
- Launching visible interactive apps when the user has not asked for it.

## App Architecture Rules
- Preserve the current plain HTML/CSS/JavaScript architecture unless the user explicitly scopes a refactor.
- Keep script load order in `index.html`: `config.js` -> `core.js` -> `admin.js` -> `calendar.js` -> `monitoring.js` -> `crm.js`.
- Be careful with shared browser globals. Several modules depend on globals from earlier scripts.
- Keep service-role behavior internal. Do not expose this app as a public web surface.
- SQL files under `migrations/` are manual migrations, not auto-applied scripts.
- Do not run real upload or DB write tests without user approval.

## Image Upload Rules
- Admin image uploads must convert to WebP through the Electron main-process pipeline.
- `services/image-upload.js` uses Sharp and uploads only WebP to Supabase Storage.
- No original-image fallback is allowed. Conversion/upload failure should show an error and store nothing.
- Buckets: `images` for species/biomes/biosphere; `chronicles-images` for chronicles.
- If upload succeeds but the DB write fails, delete the newly uploaded WebP object.
- If packaged builds cannot load Sharp, investigate electron-builder native module handling, likely `asarUnpack`.

## Supabase Rules
- `biosphere_profile` is singular.
- Biodiversity counts are stored values, not calculated app-side.
- `content_calendar` content fields may be conditionally included to avoid 400 errors before migrations are applied.
- Use Brain tool-layer or Supabase MCP for schema inspection when needed.
- Do not create dummy records or upload disposable files unless the user explicitly approves the live write.

## Telemetry Rules
- Monitoring can use direct MQTT at `192.168.8.228:1883` when on mB2.4 WiFi.
- Supabase `telemetry_snapshot` is the fallback singleton.
- Treat setpoint/control changes as live biosphere-affecting operations. Confirm before writing.

## Git Rules
- Preserve user edits. Never revert changes you did not make unless explicitly asked.
- Keep `node_modules/`, `dist/`, local outputs, logs, env files, and editor state out of git.
- Before commit, run `git status --short` and inspect the changed file list.
- Use concise commit messages describing the app/protocol change.

## Verification
For documentation-only work:
- Read every new or changed document end to end.
- Run `git diff --name-only`.
- Confirm no runtime files changed unless intentionally documented.

For code changes:
- Run `node --check` on changed JavaScript files when applicable.
- Run targeted npm scripts when they cover the changed behavior.
- Run `npm run build` for package/build changes when practical.
- Report any live Supabase, MQTT, upload, or interactive app checks that were skipped and why.

## Session Closeout
Before final response:
- List touched surfaces.
- Read changed docs or verify changed code.
- Check `git status --short`.
- Confirm whether app behavior changed.
- Confirm whether database/schema/storage/telemetry changed.
- Update Brain or repo docs if durable operating knowledge changed.
- Report unresolved questions.

Use this report shape:

```markdown
Changed files:
- path

Verification:
- check performed

Not changed:
- app behavior
- database/schema/storage/telemetry, unless explicitly changed

Unresolved questions:
- None
```
