@echo off
setlocal EnableExtensions

set "ProjectRoot=%~dp0"
set "ProjectRoot=%ProjectRoot:~0,-1%"
set "VenvDirectory=%ProjectRoot%\.hyperbot-cli-venv"
set "PythonCommand="

where py >nul 2>nul
if not errorlevel 1 set "PythonCommand=py -3"

if "%PythonCommand%"=="" (
  where python >nul 2>nul
  if not errorlevel 1 set "PythonCommand=python"
)

if "%PythonCommand%"=="" (
  echo Python 3 is required to run HyperBot CLI. 1>&2
  exit /b 1
)

if not exist "%VenvDirectory%\Scripts\python.exe" (
  echo Creating the HyperBot CLI virtual environment...
  %PythonCommand% -m venv "%VenvDirectory%" || exit /b 1
)

"%VenvDirectory%\Scripts\python.exe" "%ProjectRoot%\scripts\hyperbot_cli.py" %*
exit /b %ERRORLEVEL%
