param([switch]$Dev)

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
    Write-Host '[StudyPilot] Building and starting the desktop application...'
    npm.cmd run build
    & (Join-Path $root 'node_modules\.bin\electron.cmd') .
}
