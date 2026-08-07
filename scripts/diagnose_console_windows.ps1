param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath,
  [int]$DurationSeconds = 600
)

$ErrorActionPreference = 'SilentlyContinue'
$watchedNames = @(
  'cmd.exe',
  'powershell.exe',
  'pwsh.exe',
  'conhost.exe',
  'wscript.exe',
  'cscript.exe',
  'python.exe',
  'pythonw.exe',
  'node.exe'
)

$subscription = Register-CimIndicationEvent -Query 'SELECT * FROM Win32_ProcessStartTrace' -SourceIdentifier 'StudyPilotConsoleWindowTrace'
$deadline = (Get-Date).AddSeconds($DurationSeconds)

try {
  while ((Get-Date) -lt $deadline) {
    $event = Wait-Event -SourceIdentifier 'StudyPilotConsoleWindowTrace' -Timeout 1
    if (-not $event) { continue }

    $trace = $event.SourceEventArgs.NewEvent
    $name = [string]$trace.ProcessName
    if ($watchedNames -notcontains $name.ToLowerInvariant()) {
      Remove-Event -EventIdentifier $event.EventIdentifier
      continue
    }

    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($trace.ProcessID)"
    $parent = Get-CimInstance Win32_Process -Filter "ProcessId = $($trace.ParentProcessID)"
    [PSCustomObject]@{
      Time = (Get-Date).ToString('o')
      Name = $name
      ProcessId = [int]$trace.ProcessID
      ParentProcessId = [int]$trace.ParentProcessID
      SessionId = [int]$trace.SessionID
      CommandLine = [string]$process.CommandLine
      ExecutablePath = [string]$process.ExecutablePath
      ParentName = [string]$parent.Name
      ParentCommandLine = [string]$parent.CommandLine
    } | ConvertTo-Json -Compress | Add-Content -LiteralPath $OutputPath -Encoding UTF8

    Remove-Event -EventIdentifier $event.EventIdentifier
  }
} finally {
  Unregister-Event -SourceIdentifier 'StudyPilotConsoleWindowTrace'
  Get-Event -SourceIdentifier 'StudyPilotConsoleWindowTrace' | Remove-Event
}
