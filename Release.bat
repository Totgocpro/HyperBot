@echo off
setlocal EnableExtensions

set "ProjectRoot=%~dp0"
set "ProjectRoot=%ProjectRoot:~0,-1%"

call "%ProjectRoot%\HyperBot.bat" start --logs %*
exit /b %ERRORLEVEL%
