@echo off
title Eleições RS 2026 — Mapa Eleitoral
echo =========================================================
echo  INICIANDO WEBGIS ELEIÇÕES RS 2026 — MAPA ELEITORAL
echo =========================================================
powershell -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
