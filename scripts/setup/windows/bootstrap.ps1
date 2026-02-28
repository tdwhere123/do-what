param(
  [switch]$SkipInstall,
  [switch]$SkipDependencies
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..\..\..")
$doctorScript = Join-Path $scriptRoot "doctor.ps1"
$installScript = Join-Path $scriptRoot "install.ps1"

Write-Host "[do-what] Bootstrap starting..."
Write-Host "[do-what] Repo root: $repoRoot"

if (-not $SkipInstall) {
  & $doctorScript -FailOnMissing
  if ($LASTEXITCODE -ne 0) {
    if ($SkipDependencies) {
      throw "Dependencies missing and -SkipDependencies was provided."
    }
    Write-Host "[do-what] Missing dependencies detected. Installing..."
    & $installScript
    if ($LASTEXITCODE -ne 0) {
      throw "Environment installation failed."
    }
  }
}

Write-Host "[do-what] Running dependency install..."
$env:CI = "true"
& pnpm -C $repoRoot install --frozen-lockfile
if ($LASTEXITCODE -ne 0) {
  throw "pnpm install failed"
}

Write-Host "[do-what] Preparing sidecars..."
& pnpm -C $repoRoot --filter @different-ai/openwork run prepare:sidecar
if ($LASTEXITCODE -ne 0) {
  throw "prepare:sidecar failed"
}

Write-Host "[do-what] Bootstrap complete."
Write-Host "[do-what] Next: pnpm -C $repoRoot dev"
