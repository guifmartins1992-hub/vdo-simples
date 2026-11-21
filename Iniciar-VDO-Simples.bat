@echo off
setlocal EnableExtensions
title VDO Simples - Launcher

echo.
echo  =====================================
echo          VDO SIMPLES - INICIAR
echo  =====================================
echo.

set "APP_DIR=%~dp0"

REM Se o launcher estiver sozinho, baixa a versao mais recente do GitHub.
if not exist "%APP_DIR%server.js" (
    set "APP_DIR=%LOCALAPPDATA%\VdoSimples"
    echo [1/4] Baixando o VDO Simples do GitHub...
    if not exist "%APP_DIR%" mkdir "%APP_DIR%"
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $zip=Join-Path $env:TEMP 'vdo-simples-main.zip'; Invoke-WebRequest 'https://github.com/guifmartins1992-hub/vdo-simples/archive/refs/heads/main.zip' -OutFile $zip; Expand-Archive -LiteralPath $zip -DestinationPath $env:TEMP -Force; $src=Join-Path $env:TEMP 'vdo-simples-main'; Copy-Item (Join-Path $src '*') '%APP_DIR%' -Recurse -Force; Remove-Item $zip -Force"
    if errorlevel 1 (
        echo.
        echo ERRO: Nao foi possivel baixar o projeto.
        pause
        exit /b 1
    )
)

if not exist "%APP_DIR%server.js" (
    echo ERRO: server.js nao foi encontrado.
    pause
    exit /b 1
)

REM Verifica Node.js e npm.
where node >nul 2>nul
if errorlevel 1 (
    echo Node.js nao encontrado. Instale a versao 20 ou superior:
    echo https://nodejs.org/
    echo Depois execute este launcher novamente.
    pause
    exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
    echo npm nao encontrado. Reinstale o Node.js: https://nodejs.org/
    pause
    exit /b 1
)

REM Instala as dependencias na primeira execucao.
if not exist "%APP_DIR%node_modules\express" (
    echo [2/4] Preparando dependencias. Aguarde...
    pushd "%APP_DIR%"
    call npm install
    if errorlevel 1 (
        popd
        echo ERRO ao instalar dependencias.
        pause
        exit /b 1
    )
    popd
) else (
    echo [2/4] Dependencias ja instaladas.
)

REM Instala o Cloudflare Tunnel se necessario e se o winget estiver disponivel.
where cloudflared >nul 2>nul
if errorlevel 1 (
    echo [3/4] Cloudflared nao encontrado. Tentando instalar pelo winget...
    where winget >nul 2>nul
    if errorlevel 1 (
        echo.
        echo Instale o Cloudflare Tunnel por:
        echo https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
        pause
        exit /b 1
    )
    winget install --id Cloudflare.cloudflared -e --accept-package-agreements --accept-source-agreements
    set "PATH=%PATH%;%LOCALAPPDATA%\Microsoft\WinGet\Links"
    where cloudflared >nul 2>nul
    if errorlevel 1 (
        echo.
        echo O Cloudflared foi instalado ou atualizado, mas nao foi localizado nesta janela.
        echo Feche e abra o launcher novamente.
        pause
        exit /b 1
    )
) else (
    echo [3/4] Cloudflare Tunnel encontrado.
)

echo [4/4] Iniciando servidor e link publico...
start "VDO Simples - Servidor" cmd /k "cd /d ""%APP_DIR%"" && npm start"
timeout /t 3 /nobreak >nul
start "VDO Simples - Link publico" cmd /k "cloudflared tunnel --url http://localhost:3000"

echo.
echo Pronto! Mantenha as duas janelas abertas durante a sessao.
echo O link publico aparecera na janela 'VDO Simples - Link publico'.
echo Envie esse link aos seus amigos.
echo.
echo Para encerrar: feche as duas janelas do VDO Simples.
echo.
pause
