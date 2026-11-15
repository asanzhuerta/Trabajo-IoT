@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo No se ha encontrado Node.js. Instalalo desde https://nodejs.org y vuelve a intentarlo.
  pause
  exit /b 1
)
echo Iniciando campograma local (Mosquitto: localhost:1883)...
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3000"
node server.js
pause
