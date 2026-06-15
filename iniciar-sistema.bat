@echo off
setlocal

SET NODE_BIN=C:\Users\MAC-LS-VICTOR-HUGO\AppData\Local\node-portable\node-v20.18.3-win-x64
SET PATH=%NODE_BIN%;%PATH%
SET PROJECT=%~dp0

echo ================================================
echo   LS Office ERP - Iniciando Sistema
echo ================================================
echo.

:: Verificar se Node.js existe
if not exist "%NODE_BIN%\node.exe" (
  echo [ERRO] Node.js nao encontrado em: %NODE_BIN%
  echo Execute o setup primeiro.
  pause
  exit /b 1
)

:: Verificar se node_modules existe
if not exist "%PROJECT%node_modules" (
  echo [INFO] Instalando dependencias...
  cd /d "%PROJECT%"
  npm install
)

echo [1] Iniciando Backend ^(porta 3001^)...
start "LS Backend" /min cmd /c "cd /d %PROJECT% && set PATH=%NODE_BIN%;%PATH% && node node_modules\tsx\dist\cli.mjs src\backend\server.ts"

timeout /t 3 /nobreak >nul

echo [2] Iniciando Frontend ^(porta 5173^)...
start "LS Frontend" /min cmd /c "cd /d %PROJECT% && set PATH=%NODE_BIN%;%PATH% && node node_modules\vite\bin\vite.js --host"

timeout /t 4 /nobreak >nul

echo.
echo ================================================
echo   Sistema iniciado com sucesso!
echo ================================================
echo.
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:3001/api/health
echo.
echo   Abrindo o sistema no navegador...
start http://localhost:5173

echo.
echo Pressione qualquer tecla para fechar esta janela
echo (os servidores continuarao rodando em background)
pause >nul
