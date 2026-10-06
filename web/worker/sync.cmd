@echo off
if "%~1"=="" goto menu
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync.ps1" %*
exit /b %errorlevel%
:menu
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync.ps1"
if %errorlevel%==10 exit /b 0
echo.
pause
goto menu
