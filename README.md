# miniBIOTA App

Internal Electron desktop app for miniBIOTA operations: story dashboard, weekly checklist, content calendar, tasks, financials, CRM, roadmap, site admin, and monitoring.

## Start A Codex Session

```powershell
powershell -ExecutionPolicy Bypass -File "_system/codex_session_start.ps1"
```

Then read the files listed by the helper, especially `AGENTS.md`, `docs/agent_protocol.md`, Brain `agent_memory.md`, and the relevant app source files.

## Run The App

```powershell
npm start
```

Build the Windows distributable:

```powershell
npm run build
```

Run the noninteractive telemetry sample export:

```powershell
npm run telemetry:export:sample
```

## Repository Shape

| Path | Purpose |
|---|---|
| `AGENTS.md` | Codex entry point and repo operating rules |
| `docs/agent_protocol.md` | Detailed Codex workflow for App sessions |
| `CLAUDE.md` | Legacy Claude context, retained for reference only |
| `index.html` | Electron renderer shell |
| `css/` | App styles |
| `js/` | Renderer modules |
| `main.js` | Electron main process |
| `preload.js` | IPC bridge |
| `services/` | Main-process service helpers |
| `migrations/` | Manual Supabase SQL migrations |
| `tools/` | Local utility scripts |
| `_system/` | Codex session helpers |

## GitHub

Remote:

`https://github.com/miniBIOTA/miniBIOTA_App.git`

Track source files, migrations, docs, and helper scripts. Keep `node_modules/`, build outputs, logs, local env files, and generated tool outputs out of git.

## Brain Link

This domain reports to the Strategy Agent through:

`M:\miniBIOTA\miniBIOTA_Brain\11. App Operations\app_brief.md`

Update that brief when app behavior, schema assumptions, operational status, risks, blockers, or cross-domain dependencies change.
