param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath,
  [int]$DurationSeconds = 600
)

$ErrorActionPreference = 'SilentlyContinue'

Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class VisibleWindowProbe {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
'@

$watchedNames = @(
  'cmd',
  'powershell',
  'pwsh',
  'conhost',
  'python',
  'pythonw',
  'node',
  'windowsterminal'
)
$seen = @{}
$deadline = (Get-Date).AddSeconds($DurationSeconds)

while ((Get-Date) -lt $deadline) {
  [VisibleWindowProbe]::EnumWindows({
    param($handle, $unused)
    if (-not [VisibleWindowProbe]::IsWindowVisible($handle)) { return $true }

    [uint32]$processId = 0
    [void][VisibleWindowProbe]::GetWindowThreadProcessId($handle, [ref]$processId)
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId"
    if (-not $process) { return $true }

    $baseName = [IO.Path]::GetFileNameWithoutExtension([string]$process.Name).ToLowerInvariant()
    if ($watchedNames -notcontains $baseName) { return $true }

    $key = "$processId`:$($handle.ToInt64())"
    if ($seen.ContainsKey($key)) { return $true }
    $seen[$key] = $true

    $titleBuffer = New-Object Text.StringBuilder 512
    [void][VisibleWindowProbe]::GetWindowText($handle, $titleBuffer, $titleBuffer.Capacity)
    $parent = Get-CimInstance Win32_Process -Filter "ProcessId = $($process.ParentProcessId)"
    [PSCustomObject]@{
      Time = (Get-Date).ToString('o')
      WindowHandle = $handle.ToInt64()
      WindowTitle = $titleBuffer.ToString()
      Name = [string]$process.Name
      ProcessId = [int]$process.ProcessId
      ParentProcessId = [int]$process.ParentProcessId
      CommandLine = [string]$process.CommandLine
      ParentName = [string]$parent.Name
      ParentCommandLine = [string]$parent.CommandLine
    } | ConvertTo-Json -Compress | Add-Content -LiteralPath $OutputPath -Encoding UTF8
    return $true
  }, [IntPtr]::Zero)
  Start-Sleep -Milliseconds 100
}
