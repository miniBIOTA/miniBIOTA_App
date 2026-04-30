$ErrorActionPreference = "Continue"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptRoot
$brainRoot = "M:\miniBIOTA\miniBIOTA_Brain"

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = "utf-8"

Write-Host "== miniBIOTA App Codex Session Start =="
Write-Host "Repo:  $repoRoot"
Write-Host "Brain: $brainRoot"
Write-Host ""

Write-Host "[1/3] Loading Brain session status..."
$pythonScript = @"
import sys
sys.path.insert(0, r"M:\miniBIOTA\miniBIOTA_Brain\_system")
try:
    from minibiota_tools import session_init, describe_write_policy
    state = session_init(agent_interface="codex")
    print(state["greeting"])
    print("")
    print(f"Write policy: {describe_write_policy()['write_mode']}")
    if state.get("supabase_connected"):
        print("SUPABASE: connected -- live tool calls are available")
    else:
        print("SUPABASE: offline (sandbox or network restriction)")
        print("  -> Live tool calls will fail until Supabase is reachable.")
        print("  -> Do NOT fall back to vault-only mode for tasks requiring live records.")
        print("  -> Retry the specific tool call after requesting network access.")
except Exception as exc:
    print(f"Could not load Brain tool layer: {exc}")
    print("Read Brain agent_memory.md manually before live-record work.")
"@
$pythonScript | python -
Write-Host ""

Write-Host "[2/3] Git status"
Set-Location $repoRoot
git status --short --branch
Write-Host ""

Write-Host "[3/3] Read these files first:"
Write-Host "- AGENTS.md"
Write-Host "- docs/agent_protocol.md"
Write-Host "- M:\miniBIOTA\miniBIOTA_Brain\_system\agent_memory.md"
Write-Host "- M:\miniBIOTA\miniBIOTA_Brain\11. App Operations\app_brief.md"
Write-Host "- M:\miniBIOTA\miniBIOTA_Brain\BRAIN_AGENT_PROTOCOL.md"
Write-Host "- Relevant app source files for the task"
Write-Host "- CLAUDE.md only if legacy Claude context is needed"
