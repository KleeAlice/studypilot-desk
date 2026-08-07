param(
  [Parameter(Mandatory = $true)][int]$StartX,
  [Parameter(Mandatory = $true)][int]$StartY,
  [Parameter(Mandatory = $true)][int]$EndX,
  [Parameter(Mandatory = $true)][int]$EndY,
  [int]$Steps = 12
)

$nativeMouseSource = @"
using System;
using System.Runtime.InteropServices;

public static class StudyPilotNativeMouse
{
    [DllImport("user32.dll")]
    public static extern bool SetProcessDpiAwarenessContext(IntPtr dpiContext);

    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int x, int y);

    [DllImport("user32.dll")]
    public static extern void mouse_event(
        uint flags,
        uint dx,
        uint dy,
        uint data,
        UIntPtr extraInfo
    );
}
"@

Add-Type -TypeDefinition $nativeMouseSource
[void][StudyPilotNativeMouse]::SetProcessDpiAwarenessContext([IntPtr]::new(-4))

$leftDown = 0x0002
$leftUp = 0x0004
$safeSteps = [Math]::Max(1, $Steps)

[void][StudyPilotNativeMouse]::SetCursorPos($StartX, $StartY)
Start-Sleep -Milliseconds 100
[StudyPilotNativeMouse]::mouse_event($leftDown, 0, 0, 0, [UIntPtr]::Zero)

try {
  for ($index = 1; $index -le $safeSteps; $index += 1) {
    $ratio = $index / $safeSteps
    $x = [Math]::Round($StartX + (($EndX - $StartX) * $ratio))
    $y = [Math]::Round($StartY + (($EndY - $StartY) * $ratio))
    [void][StudyPilotNativeMouse]::SetCursorPos($x, $y)
    Start-Sleep -Milliseconds 30
  }
} finally {
  [StudyPilotNativeMouse]::mouse_event($leftUp, 0, 0, 0, [UIntPtr]::Zero)
}
