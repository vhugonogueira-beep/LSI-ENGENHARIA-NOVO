@echo off
setlocal

:: LS Office ERP na internet pelo Cloudflare Tunnel.
:: Compila as telas, sobe o backend servindo tudo na porta 3001 e abre o tunel.
:: Passo a passo completo: docs\DEPLOY-CLOUDFLARE.md

SET NODE_BIN=C:\Users\MAC-LS-VICTOR-HUGO\AppData\Local\node-portable\node-v20.18.3-win-x64
SET PATH=%NODE_BIN%;%PATH%
SET PROJECT=%~dp0
:: Nome do tunel fixo criado no painel da Cloudflare. Vazio = endereco
:: temporario *.trycloudflare.com (muda a cada reinicio, bom para testar).
SET TUNEL=

echo ================================================
echo   LS Office ERP - Publicando na internet
echo ================================================
echo.

where cloudflared >nul 2>nul
if errorlevel 1 (
  echo [ERRO] cloudflared nao encontrado.
  echo Instale com:  winget install --id Cloudflare.cloudflared
  echo e abra este arquivo de novo.
  pause
  exit /b 1
)

cd /d "%PROJECT%"

echo [1] Compilando as telas...
call node node_modules\vite\bin\vite.js build > ls-build.log 2>&1
if errorlevel 1 (
  echo [ERRO] A compilacao falhou. Veja ls-build.log
  pause
  exit /b 1
)

echo [2] Iniciando o servidor (porta 3001, telas + API)...
start "LS Servidor" /min cmd /c "cd /d %PROJECT% && set PATH=%NODE_BIN%;%PATH% && set NODE_ENV=production && node node_modules\tsx\dist\cli.mjs src\backend\server.ts > ls-backend.log 2>&1"
ping 127.0.0.1 -n 6 >nul

echo [3] Abrindo o tunel Cloudflare...
if "%TUNEL%"=="" (
  echo     Endereco temporario: procure a linha "https://...trycloudflare.com" abaixo.
  echo.
  cloudflared tunnel --url http://localhost:3001
) else (
  cloudflared tunnel run %TUNEL%
)
