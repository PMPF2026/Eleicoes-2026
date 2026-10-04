@echo off
chcp 65001 > nul
title Publicar Mapa Eleitoral RS 2026 no GitHub

echo.
echo =========================================================
echo  ELEIÇÕES RS 2026 - MAPA ELEITORAL - Publicar no GitHub
echo =========================================================
echo.

REM Localizar Git
set "GIT_CMD=git"
where git >nul 2>nul
if %errorlevel% neq 0 (
    if exist "%LOCALAPPDATA%\GitHubDesktop\app-3.6.4\resources\app\git\cmd\git.exe" (
        set "GIT_CMD=%LOCALAPPDATA%\GitHubDesktop\app-3.6.4\resources\app\git\cmd\git.exe"
    ) else (
        echo [ERRO] Git nao foi encontrado no sistema!
        pause
        exit /b 1
    )
)

echo [OK] Git localizado: %GIT_CMD%
echo.

REM Verificar status do repositorio Git
if exist ".git" (
    echo [INFO] Repositorio Git detectado. Sincronizando...
    "%GIT_CMD%" add .
    "%GIT_CMD%" commit -m "update: Atualização do Mapa Eleitoral RS 2026"
    "%GIT_CMD%" push origin main
) else (
    echo [INFO] Inicializando repositorio Git...
    "%GIT_CMD%" init
    "%GIT_CMD%" remote add origin https://github.com/PMPF2026/Eleicoes-2026.git
    "%GIT_CMD%" branch -M main
    "%GIT_CMD%" add .
    "%GIT_CMD%" commit -m "feat: Versão inicial WebGIS Eleições RS 2026 - Mapa Eleitoral"
    "%GIT_CMD%" push -u origin main
)

echo.
echo =========================================================
echo  SUCESSO! Acesse:
echo  https://github.com/PMPF2026/Eleicoes-2026
echo =========================================================
echo.
pause
