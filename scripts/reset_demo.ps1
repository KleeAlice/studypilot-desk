$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$data = Join-Path $root 'data'
$answer = Read-Host 'This resets local demo data and keeps a side backup. Type RESET to continue'
if ($answer -cne 'RESET') {
    Write-Host 'Cancelled.'
    exit 0
}
$backup = $null
if (Test-Path -LiteralPath $data) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backup = Join-Path $root "data-reset-$stamp"
    Move-Item -LiteralPath $data -Destination $backup
    Write-Host "Existing data moved to $backup"
}
New-Item -ItemType Directory -Force -Path (Join-Path $data 'seeds') | Out-Null
if ($backup) {
    $seed = Join-Path $backup 'seeds\roadmap.json'
    if (Test-Path -LiteralPath $seed) {
        Copy-Item -LiteralPath $seed -Destination (Join-Path $data 'seeds\roadmap.json')
    }
}
Write-Host 'Reset complete. Data will be initialized on the next launch.'
