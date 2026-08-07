Option Explicit

Dim shell, fileSystem, root, command
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

root = fileSystem.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = root
command = "cmd.exe /d /c """ & root & "\start.bat"""

' Window style 0 keeps the bootstrap console hidden. False returns immediately.
shell.Run command, 0, False
