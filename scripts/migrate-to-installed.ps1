param(
    [string]$SourceData,
    [string]$DestinationData,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not $SourceData) {
    $SourceData = Join-Path $root 'data'
}
if (-not $DestinationData) {
    $DestinationData = Join-Path $env:APPDATA 'StudyPilot Desk\data'
}

$source = [System.IO.Path]::GetFullPath($SourceData)
$destination = [System.IO.Path]::GetFullPath($DestinationData)
if (-not (Test-Path -LiteralPath $source -PathType Container)) {
    throw "Source data directory was not found: $source"
}
if ($source -eq $destination) {
    throw 'Source and destination data directories must be different.'
}

$destinationExists = Test-Path -LiteralPath $destination
$destinationHasFiles = $destinationExists -and @(
    Get-ChildItem -LiteralPath $destination -Force -ErrorAction SilentlyContinue
).Count -gt 0
if ($destinationHasFiles -and -not $Force) {
    throw "Installed data already exists. Re-run with -Force to create a backup before migration: $destination"
}

if ($destinationHasFiles) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backup = "$destination.backup-$stamp"
    Copy-Item -LiteralPath $destination -Destination $backup -Recurse
    Write-Host "[StudyPilot] Existing installed data backed up to: $backup"
}

New-Item -ItemType Directory -Path $destination -Force | Out-Null
Copy-Item -Path (Join-Path $source '*') -Destination $destination -Recurse -Force
Write-Host "[StudyPilot] Learning data migrated to: $destination"
