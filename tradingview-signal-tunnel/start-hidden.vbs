' ============================================================
'  Runs start-windows.bat with NO visible window.
'  Use this for "run at login": put a shortcut to this file in
'  your Startup folder (press Win+R, type  shell:startup ).
'  Stop it later via Task Manager -> end the "node.exe" task.
' ============================================================
Dim fso, sh, here
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")
here = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = here
' 0 = hidden window, False = don't wait for it to finish
sh.Run "cmd /c """ & here & "\start-windows.bat""", 0, False
