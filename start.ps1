param(
    [switch]$Dev,
    [switch]$Rebuild
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $root

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js 20+ was not found. Install Node.js first.'
}
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw 'Python 3.10+ was not found. Install Python first.'
}

$python = Join-Path $root '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) {
    Write-Host '[StudyPilot] Creating the Python virtual environment...'
    python -m venv .venv
}

& $python -c 'import fastapi, uvicorn, docx, pypdf' 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host '[StudyPilot] Installing Python dependencies...'
    & $python -m pip install wheel
    & $python -m pip install --no-build-isolation -e '.[dev]'
}

if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules\electron'))) {
    Write-Host '[StudyPilot] Installing desktop dependencies...'
    npm.cmd install
}

if ($Dev) {
    npm.cmd run dev
} else {
    $needsBuild = $Rebuild -or
        -not (Test-Path -LiteralPath (Join-Path $root 'dist\index.html')) -or
        -not (Test-Path -LiteralPath (Join-Path $root 'dist-electron\main.cjs'))
    if ($needsBuild) {
        Write-Host '[StudyPilot] Building the desktop application...'
        npm.cmd run build
    }
    Write-Host '[StudyPilot] Starting the desktop application...'
    & (Join-Path $root 'node_modules\.bin\electron.cmd') .
}
