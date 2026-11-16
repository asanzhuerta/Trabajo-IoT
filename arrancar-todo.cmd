@echo off
rem Doble clic para abrir todo el proyecto en Windows Terminal (ver arrancar-todo.ps1):
rem   Docker / MongoDB, Mosquitto, Subscriber, API, Node-RED y Mirar p1; cuando la API responde,
rem   abre el campograma (http://localhost:3000) en el navegador.
rem Siempre vacia antes la base de datos. Opciones (desde una consola): arrancar-todo.cmd -Conservar, -Jugador p8 o -SinNavegador
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0arrancar-todo.ps1" %*
