@echo off
setlocal EnableExtensions
title VDO Simples - Launcher

echo.
echo  =====================================
echo          VDO SIMPLES - INICIAR
echo  =====================================
echo.

set "APP_DIR=%~dp0"

REM Se nao estiver junto dos arquivos do projeto, baixa uma copia local.
if not exist "%APP_DIR%server.js" (
    echo [1/4] Baixando o VDO Simples do GitHub...
    set "APP_DIR=%LOCALAPPDATA%\VdoSimples"
    if not exist "%LOCALAPPDATA%\VdoSimples" mkdir "%LOCALAPPDATA%\VdoSimples"
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $zip=Join-Path $env:TEMP 'vdo-simples-main.zip'; $extract=Join-Path $env:TEMP 'vdo-simples-download'; if(Test-Path $extract){Remove-Item $extract -Recurse -Force}; Invoke-WebRequest 'https://github.com/guifmartins1992-hub/vdo-simples/archive/refs/heads/main.zip' -OutFile $zip; Expand-Archive -LiteralPath $zip -DestinationPath $extract -Force; $src=Join-Path $extract 'vdo-simples-main'; $dest=Join-Path $env:LOCALAPPDATA 'VdoSimples'; New-Item -ItemType Directory -Force -Path $dest | Out-Null; Get-ChildItem -LiteralPath $src -Force | Copy-Item -Destination $dest -Recurse -Force; Remove-Item $zip -Force; if(!(Test-Path (Join-Path $dest 'server.js'))){throw 'server.js nao foi copiado'}"
    if errorlevel 1 (
        echo.
        echo ERRO: Nao foi possivel baixar ou preparar os arquivos.
        echo Verifique sua conexao e tente novamente.
        pause
        exit /b 1
    )
    set "APP_DIR=%LOCALAPPDATA%\VdoSimples"
)

if not exist "%APP_DIR%server.js" (
    echo.
    echo ERRO: server.js nao foi encontrado em:
    echo "%APP_DIR%"
    echo.
    echo Tente apagar a pasta %%LOCALAPPDATA%%\VdoSimples e executar novamente.
    pause
    exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js nao encontrado. Instale a versao 20 ou superior:
    echo https://nodejs.org/
    pause
    exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
    echo npm nao encontrado. Reinstale o Node.js:
    echo https://nodejs.org/
    pause
    exit /b 1
)

if not exist "%APP_DIR%node_modules\express" (
    echo [2/4] Instalando dependencias. Aguarde...
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

where cloudflared >nul 2>nul
if errorlevel 1 (
    echo [3/4] Cloudflared nao encontrado. Tentando instalar pelo winget...
    where winget >nul 2>nul
    if errorlevel 1 (
        echo Instale o Cloudflare Tunnel:
        echo https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
        pause
        exit /b 1
    )
    winget install --id Cloudflare.cloudflared -e --accept-package-agreements --accept-source-agreements
    set "PATH=%PATH%;%LOCALAPPDATA%\Microsoft\WinGet\Links"
    where cloudflared >nul 2>nul
    if errorlevel 1 (
        echo.
        echo Feche esta janela e execute o launcher novamente para atualizar o PATH.
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
echo Para encerrar, feche as duas janelas do VDO Simples.
echo.
pause
