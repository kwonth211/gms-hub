@echo off
rem megaphone collector loop: restart 3 s after it exits (it quits by itself when memory grows)
rem test mode: while %USERPROFILE%\.config\gms-hub\mega-dry exists nothing is uploaded (reads and option clicks only)
cd /d "%~dp0"
:loop
if exist "%USERPROFILE%\.config\gms-hub\mega-dry" (
  node mega-collector.mjs --dry --options >> "%USERPROFILE%\gms-hub-samples\mega-collector.log" 2>&1
) else (
  node mega-collector.mjs >> "%USERPROFILE%\gms-hub-samples\mega-collector.log" 2>&1
)
ping -n 4 127.0.0.1 >nul
goto loop
