@echo off
setlocal EnableExtensions
title VDO SIMPLES - VERSAO DE TESTE

set "APP_DIR=%LOCALAPPDATA%\VdoSimples-Testes"
set "REPO_ZIP=https://github.com/guifmartins1992-hub/vdo-simples/archive/refs/heads/testes.zip"
set "PORT=3001"

color 0A
cls
echo ============================================================
echo                    VERSAO DE TESTE
echo ============================================================
echo.
echo Esta instalacao usa a branch TESTES.
echo A versao estavel MAIN nao sera modificada.
echo.
echo Pasta: %APP_DIR%
echo Porta local: %PORT%
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js nao foi encontrado.
  echo Instale o Node.js 20 ou superior em https://nodejs.org/
  echo Depois execute este launcher novamente.
  pause
  exit /b 1
)

if not exist "%APP_DIR%\server.js" (
  echo Baixando a branch TESTES...
  if exist "%APP_DIR%" rmdir /s /q "%APP_DIR%"
  mkdir "%APP_DIR%" 2>nul
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ErrorActionPreference='Stop'; $zip=Join-Path $env:TEMP 'vdo-simples-testes.zip'; $extract=Join-Path $env:TEMP ('vdo-testes-'+[guid]::NewGuid().ToString()); Invoke-WebRequest -Uri '%REPO_ZIP%' -OutFile $zip; Expand-Archive -LiteralPath $zip -DestinationPath $extract -Force; $folder=Get-ChildItem $extract -Directory | Select-Object -First 1; if(-not $folder){throw 'Pasta extraida nao encontrada'}; Copy-Item (Join-Path $folder.FullName '*') '%APP_DIR%' -Recurse -Force; Remove-Item $zip -Force; Remove-Item $extract -Recurse -Force"
  if errorlevel 1 (
    echo.
    echo ERRO ao baixar a branch TESTES.
    pause
    exit /b 1
  )
)

if not exist "%APP_DIR%\node_modules" (
  echo Instalando dependencias...
  pushd "%APP_DIR%"
  call npm install
  if errorlevel 1 (
    popd
    echo ERRO ao instalar dependencias.
    pause
    exit /b 1
  )
  popd
)

set "CLOUDFLARED="
where cloudflared >nul 2>nul
if not errorlevel 1 set "CLOUDFLARED=cloudflared"
if not defined CLOUDFLARED if exist "%APP_DIR%\cloudflared.exe" set "CLOUDFLARED=%APP_DIR%\cloudflared.exe"

if not defined CLOUDFLARED (
  echo Baixando Cloudflare Tunnel...
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ErrorActionPreference='Stop'; Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile '%APP_DIR%\cloudflared.exe'"
  if errorlevel 1 (
    echo ERRO ao baixar o Cloudflare Tunnel.
    echo Instale cloudflared e execute novamente.
    pause
    exit /b 1
  )
  set "CLOUDFLARED=%APP_DIR%\cloudflared.exe"
)

echo.
echo Iniciando servidor da VERSAO DE TESTE...
start "VDO SIMPLES - VERSAO DE TESTE (SERVIDOR)" cmd /k "cd /d ""%APP_DIR%"" && set PORT=%PORT% && node server.js"

timeout /t 3 /nobreak >nul

echo Abrindo link publico pelo Cloudflare Tunnel...
echo.
echo IMPORTANTE: mantenha abertas as janelas do servidor e do tunnel.
echo Para encerrar, feche as duas janelas ou pressione Ctrl+C em cada uma.
echo.
start "VDO SIMPLES - VERSAO DE TESTE (TUNNEL)" cmd /k """%CLOUDFLARED%"" tunnel --url http://localhost:%PORT%"

echo ============================================================
echo                    VERSAO DE TESTE
echo ============================================================
echo.
echo O link publico aparecera na janela do Cloudflare Tunnel.
echo Envie esse link para a pessoa que vai testar com voce.
echo.
pause
endlocal
