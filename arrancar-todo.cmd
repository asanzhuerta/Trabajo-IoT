@echo off
rem Doble clic para abrir todo el proyecto en Windows Terminal (ver arrancar-todo.ps1).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0arrancar-todo.ps1" %*
