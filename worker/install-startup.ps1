param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference = 'Stop'
$taskConfig = Get-Content -LiteralPath $ConfigPath | ConvertFrom-Json
$taskPythonWindowless = Join-Path (Split-Path -Parent $taskConfig.python) 'pythonw.exe'
if(-not (Test-Path -LiteralPath $taskPythonWindowless)){ throw 'pythonw.exe not found' }
$taskAgent = Join-Path $taskConfig.workRoot 'runtime\agent.py'
if(-not (Test-Path -LiteralPath $taskAgent)){ throw 'Prepare the worker profile first' }
$taskStartup = [Environment]::GetFolderPath('Startup')
$taskShell = New-Object -ComObject WScript.Shell
$taskShortcut = $taskShell.CreateShortcut((Join-Path $taskStartup 'VJ 3D Converter.lnk'))
$taskShortcut.TargetPath = $taskPythonWindowless
$taskShortcut.Arguments = '"'+$taskAgent+'" --config "'+[System.IO.Path]::GetFullPath($ConfigPath)+'"'
$taskShortcut.WorkingDirectory = $taskConfig.workRoot
$taskShortcut.WindowStyle = 7
$taskShortcut.Description = 'VJ 3D: automatic local KN5 converter agent'
$taskShortcut.Save()
Write-Output 'Agente configurado para iniciar com a sessão do Windows.'
