param(
  [switch]$IncludeOptional
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$doctorScript = Join-Path $scriptRoot "doctor.ps1"

function Test-Command {
  param([Parameter(Mandatory = $true)][string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Refresh-Path {
  $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machinePath;$userPath"
}

function Install-WingetPackage {
  param(
    [Parameter(Mandatory = $true)][string]$Id,
    [string]$Override
  )

  $attempts = @(
    @(
      "install",
      "--id", $Id,
      "--exact",
      "--silent",
      "--accept-package-agreements",
      "--accept-source-agreements",
      "--disable-interactivity"
    ),
    @(
      "install",
      "--id", $Id,
      "--exact",
      "--source", "winget",
      "--silent",
      "--accept-package-agreements",
      "--accept-source-agreements",
      "--disable-interactivity"
    ),
    @(
      "install",
      "--id", $Id,
      "--exact",
      "--source", "winget",
      "--scope", "user",
      "--silent",
      "--accept-package-agreements",
      "--accept-source-agreements",
      "--disable-interactivity"
    )
  )

  if (-not [string]::IsNullOrWhiteSpace($Override)) {
    for ($i = 0; $i -lt $attempts.Count; $i++) {
      $attempts[$i] += @("--override", $Override)
    }
  }

  $errors = New-Object System.Collections.Generic.List[string]

  for ($i = 0; $i -lt $attempts.Count; $i++) {
    $args = $attempts[$i]
    Write-Host "[do-what] Installing $Id via winget (attempt $($i + 1)/$($attempts.Count))..."
    $output = & winget @args 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -eq 0) {
      return
    }

    $hexCode = ('0x{0:X8}' -f ([int32]$exitCode))
    $snippet = ($output | Select-Object -First 4) -join " | "
    $errors.Add("attempt=$($i + 1), exit=$exitCode ($hexCode), output=$snippet")
  }

  throw "winget install failed for $Id. Details: $($errors -join ' ; ')"
}

function Ensure-BunOnPath {
  $bunBin = Join-Path $env:USERPROFILE ".bun\bin"
  if (Test-Path $bunBin) {
    $pathParts = $env:Path.Split(";")
    if ($pathParts -notcontains $bunBin) {
      $env:Path = "$bunBin;$env:Path"
    }
  }
}

function Install-BunFallback {
  $tmpScript = Join-Path $env:TEMP "do-what-bun-install.ps1"
  Write-Host "[do-what] Falling back to Bun official installer..."
  Invoke-WebRequest -Uri "https://bun.sh/install.ps1" -OutFile $tmpScript -UseBasicParsing
  & powershell -NoProfile -ExecutionPolicy Bypass -File $tmpScript
  if ($LASTEXITCODE -ne 0) {
    throw "Bun fallback installer failed (exit=$LASTEXITCODE)"
  }
  Ensure-BunOnPath
  if (-not (Test-Command "bun")) {
    throw "Bun installer completed but bun is still not in PATH. Restart terminal and retry."
  }
}

function Ensure-Pnpm {
  if (Test-Command "pnpm") {
    return
  }

  if (Test-Command "corepack") {
    Write-Host "[do-what] Enabling pnpm via corepack..."
    & corepack enable
    & corepack prepare pnpm@10.30.2 --activate
    Refresh-Path
  }

  if (-not (Test-Command "pnpm")) {
    Install-WingetPackage -Id "pnpm.pnpm"
    Refresh-Path
  }
}

function Ensure-RustToolchain {
  if (-not (Test-Command "rustup")) {
    Install-WingetPackage -Id "Rustlang.Rustup"
    Refresh-Path
  }

  $active = $null
  try {
    $active = & rustup show active-toolchain 2>$null
    if ($LASTEXITCODE -ne 0) {
      $active = $null
    }
  } catch {
    $active = $null
  }

  if (-not $active) {
    Write-Host "[do-what] Configuring Rust default toolchain (stable)..."
    & rustup default stable
    if ($LASTEXITCODE -ne 0) {
      throw "rustup default stable failed (exit=$LASTEXITCODE)"
    }
  }

  try {
    & rustc -V | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "rustc verification failed"
    }
    & cargo -V | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "cargo verification failed"
    }
  } catch {
    throw "Rust toolchain is still unavailable after setup. Restart terminal and rerun setup."
  }
}

if (-not (Test-Path $doctorScript)) {
  throw "doctor.ps1 not found at $doctorScript"
}

if (-not (Test-Command "winget")) {
  throw "winget is required but not found in PATH. Install App Installer from Microsoft Store first."
}

$doctorRaw = & $doctorScript -Json
$doctor = $doctorRaw | ConvertFrom-Json
$missing = @($doctor.missing)

if ($missing.Count -eq 0) {
  Write-Host "[do-what] No missing dependencies."
  exit 0
}

if ($missing -contains "node") {
  Install-WingetPackage -Id "OpenJS.NodeJS.LTS"
  Refresh-Path
}

if ($missing -contains "bun") {
  try {
    Install-WingetPackage -Id "Oven-sh.Bun"
    Refresh-Path
  } catch {
    Write-Host "[do-what] winget failed for Bun, trying fallback installer."
    Install-BunFallback
    Refresh-Path
  }
}

if (($missing -contains "rustc") -or ($missing -contains "cargo")) {
  Install-WingetPackage -Id "Rustlang.Rustup"
  Refresh-Path
}

if (($missing -contains "rustc") -or ($missing -contains "cargo") -or ($missing -contains "rust-toolchain")) {
  Ensure-RustToolchain
}

if ($missing -contains "vsbuildtools") {
  Install-WingetPackage -Id "Microsoft.VisualStudio.2022.BuildTools" -Override "--quiet --wait --norestart --nocache --add Microsoft.VisualStudio.Workload.VCTools"
  Refresh-Path
}

if ($missing -contains "webview2") {
  Install-WingetPackage -Id "Microsoft.EdgeWebView2Runtime"
  Refresh-Path
}

Ensure-Pnpm

$doctorRawAfter = & $doctorScript -Json
$doctorAfter = $doctorRawAfter | ConvertFrom-Json
$missingAfter = @($doctorAfter.missing)

if ($missingAfter.Count -gt 0) {
  Write-Host ("[do-what] Still missing after installation: {0}" -f ($missingAfter -join ", "))
  exit 1
}

Write-Host "[do-what] Environment installation complete."
