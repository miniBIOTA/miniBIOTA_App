param(
    [switch]$StageAll,
    [string]$CommitMessage,
    [switch]$Push
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptRoot

Set-Location $repoRoot

Write-Host "== miniBIOTA App Codex Session Close =="
Write-Host "Repo: $repoRoot"
Write-Host ""

Write-Host "[1/3] Git status"
git status --short
Write-Host ""

Write-Host "[2/3] Reminder"
Write-Host "If app behavior, schema assumptions, telemetry behavior, or cross-domain state changed,"
Write-Host "update the relevant Brain docs before closing."
Write-Host ""

Write-Host "[3/3] Git actions"
if ($StageAll) {
    Write-Host "Running: git add ."
    git add .
    Write-Host ""
} else {
    Write-Host "Skipping git add. Pass -StageAll to stage changes."
}

if ($CommitMessage) {
    Write-Host "Running: git commit -m `"$CommitMessage`""
    git commit -m $CommitMessage
    Write-Host ""
} else {
    Write-Host "Skipping commit. Pass -CommitMessage to create a commit."
}

if ($Push) {
    if (-not $CommitMessage) {
        throw "Cannot push without a commit in this helper. Pass -CommitMessage and usually -StageAll."
    }
    Write-Host "Running: git push"
    git push
} else {
    Write-Host "Skipping push. Pass -Push to push the current branch."
}
