@echo off
setlocal EnableExtensions
title VDO Simples - Launcher

set "APP_DIR=%LOCALAPPDATA%\VdoSimples"

echo.
echo  =====================================
echo          VDO SIMPLES - INICIAR
echo  =====================================
echo.

REM Confere se a copia local esta completa. Se nao estiver, baixa novamente.
if not exist "%APP_DIR%\server.js" goto DOWNLOAD
if not exist "%APP_DIR%\package.json" goto DOWNLOAD
if not exist "%APP_DIR%\public\index.html" goto DOWNLOAD
goto CHECK_NODE

:DOWNLOAD
echo [1/4] Baixando os arquivos do VDO Simples...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $base=Join-Path $env:LOCALAPPDATA 'VdoSimples'; $zip=Join-Path $env:TEMP 'vdo-simples-main.zip'; $tmp=Join-Path $env:TEMP ('vdo-simples-'+[guid]::NewGuid().ToString()); if(Test-Path $base){Remove-Item $base -Recurse -Force}; New-Item -ItemType Directory -Force -Path $tmp | Out-Null; Invoke-WebRequest 'https://github.com/guifmartins1992-hub/vdo-simples/archive/refs/heads/main.zip' -OutFile $zip; Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force; $server=Get-ChildItem -LiteralPath $tmp -Filter 'server.js' -File -Recurse | Select-Object -First 1; if($null -eq $server){throw 'O arquivo server.js nao apareceu no ZIP baixado'}; $source=$server.Directory.FullName; New-Item -ItemType Directory -Force -Path $base | Out-Null; Get-ChildItem -LiteralPath $source -Force | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $base -Recurse -Force }; Remove-Item $zip -Force; Remove-Item $tmp -Recurse -Force; if(!(Test-Path (Join-Path $base 'server.js'))){throw 'Falha ao copiar server.js para a pasta local'}"
if errorlevel 1 (
    echo.
    echo ERRO: Nao foi possivel baixar os arquivos do GitHub.
    echo Confira sua internet e tente novamente.
    pause
    exit /b 1
)

if not exist "%APP_DIR%\server.js" (
    echo ERRO: server.js ainda nao foi encontrado em "%APP_DIR%".
    pause
    exit /b 1
)

:CHECK_NODE
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

if not exist "%APP_DIR%\node_modules\express" (
    echo [2/4] Instalando dependencias...
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
    echo [3/4] Instalando Cloudflare Tunnel...
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
        echo Feche e abra o launcher novamente para reconhecer o Cloudflare Tunnel.
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
echo Mantenha as duas janelas abertas durante a sessao.
echo O link publico aparecera na janela do Cloudflare Tunnel.
echo.
pause
