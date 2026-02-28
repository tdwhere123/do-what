param(
  [switch]$Json,
  [switch]$FailOnMissing
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Test-Command {
  param([Parameter(Mandatory = $true)][string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-VersionOutput {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [string]$Args = "--version"
  )
  try {
    $result = & $Command $Args 2>$null
    if ($LASTEXITCODE -eq 0 -and $result) {
      return ($result | Select-Object -First 1).ToString().Trim()
    }
  } catch {
    return $null
  }
  return $null
}

function Get-ActiveRustToolchain {
  if (-not (Test-Command "rustup")) {
    return $null
  }

  try {
    $result = & rustup show active-toolchain 2>$null
    if ($LASTEXITCODE -eq 0 -and $result) {
      return ($result | Select-Object -First 1).ToString().Trim()
    }
  } catch {
    return $null
  }

  return $null
}

function Test-WebView2 {
  $paths = @(
    "$env:ProgramFiles (x86)\\Microsoft\\EdgeWebView\\Application",
    "$env:ProgramFiles\\Microsoft\\EdgeWebView\\Application"
  )

  foreach ($base in $paths) {
    if ([string]::IsNullOrWhiteSpace($base)) { continue }
    if (Test-Path $base) {
      return $true
    }
  }

  return $false
}

function Test-VsBuildTools {
  $vsWhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\\Installer\\vswhere.exe"
  if (-not (Test-Path $vsWhere)) {
    return $false
  }

  try {
    $result = & $vsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
    if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($result)) {
      return $true
    }
  } catch {
    return $false
  }

  return $false
}

$nodeVersion = Get-VersionOutput -Command "node"
$pnpmVersion = Get-VersionOutput -Command "pnpm"
$bunVersion = Get-VersionOutput -Command "bun"
$rustcVersion = Get-VersionOutput -Command "rustc" -Args "-V"
$cargoVersion = Get-VersionOutput -Command "cargo" -Args "-V"
$rustToolchain = Get-ActiveRustToolchain

$deps = @(
  [ordered]@{ key = "winget"; name = "Windows Package Manager"; installed = (Test-Command "winget"); version = (Get-VersionOutput -Command "winget") },
  [ordered]@{ key = "node"; name = "Node.js"; installed = -not [string]::IsNullOrWhiteSpace($nodeVersion); version = $nodeVersion },
  [ordered]@{ key = "pnpm"; name = "pnpm"; installed = -not [string]::IsNullOrWhiteSpace($pnpmVersion); version = $pnpmVersion },
  [ordered]@{ key = "bun"; name = "Bun"; installed = -not [string]::IsNullOrWhiteSpace($bunVersion); version = $bunVersion },
  [ordered]@{ key = "rustc"; name = "Rust (rustc)"; installed = -not [string]::IsNullOrWhiteSpace($rustcVersion); version = $rustcVersion },
  [ordered]@{ key = "cargo"; name = "Cargo"; installed = -not [string]::IsNullOrWhiteSpace($cargoVersion); version = $cargoVersion },
  [ordered]@{ key = "rust-toolchain"; name = "Rust Default Toolchain"; installed = -not [string]::IsNullOrWhiteSpace($rustToolchain); version = $rustToolchain },
  [ordered]@{ key = "vsbuildtools"; name = "Visual Studio C++ Build Tools"; installed = (Test-VsBuildTools); version = $null },
  [ordered]@{ key = "webview2"; name = "WebView2 Runtime"; installed = (Test-WebView2); version = $null }
)

$missing = @($deps | Where-Object { -not $_.installed } | ForEach-Object { $_.key })
$result = [ordered]@{
  ok = ($missing.Count -eq 0)
  missing = $missing
  dependencies = $deps
}

if ($Json) {
  $result | ConvertTo-Json -Depth 6
} else {
  Write-Host "[do-what] Windows environment doctor"
  foreach ($dep in $deps) {
    $status = if ($dep.installed) { "OK" } else { "MISSING" }
    $version = if ($dep.version) { " - $($dep.version)" } else { "" }
    Write-Host (" - {0}: {1}{2}" -f $dep.name, $status, $version)
  }

  if ($missing.Count -eq 0) {
    Write-Host "[do-what] All required dependencies are available."
  } else {
    Write-Host ("[do-what] Missing dependencies: {0}" -f ($missing -join ", "))
    Write-Host "[do-what] Run scripts/setup/windows/install.ps1 to install missing dependencies."
  }
}

if ($FailOnMissing -and $missing.Count -gt 0) {
  exit 1
}
