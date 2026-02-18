@echo off
title Deploy Automático CRM WhatsApp + Chat
echo ==============================================
echo       DEPLOY AUTOMÁTICO - CHAT WHATSAPP
echo ==============================================
echo.

:: ============================
:: Ir a la carpeta raíz
:: ============================
cd /d "C:\Users\PC\Desktop\whatsapp-bot\crm-whatsapp-flow" || (
    echo ERROR: No se pudo acceder a la carpeta raíz.
    pause
    exit /b
)
echo Carpeta raíz establecida.
echo.

:: ============================
:: Verificar Git
:: ============================
git status
if %errorlevel% neq 0 (
    echo Git no inicializado. Inicializando repositorio...
    git init
    if %errorlevel% neq 0 (
        echo ERROR al inicializar Git
        pause
        exit /b
    )
)
echo Git listo.
echo.

:: ============================
:: Configurar remoto GitHub
:: ============================
git remote remove origin >nul 2>&1
git remote add origin https://github.com/websrapidascontacto-ops/whatsapp-bot2.git
git remote -v
echo Remoto configurado.
echo.

:: ============================
:: Traer cambios del remoto
:: ============================
echo Actualizando repositorio desde GitHub...
git pull origin main --rebase
if %errorlevel% neq 0 (
    echo ERROR haciendo git pull
)
echo Pull completado.
echo.

:: ============================
:: Agregar y hacer commit
:: ============================
git add .
for /f "delims=" %%i in ('git status --porcelain') do set CHANGES=YES

IF DEFINED CHANGES (
    echo Cambios detectados. Haciendo commit...
    git commit -m "Deploy Chat WhatsApp - %DATE% %TIME%"
    if %errorlevel% neq 0 (
        echo ERROR haciendo commit
    )
    echo Commit realizado.
) ELSE (
    echo No hay cambios para commitear.
)
echo.

:: ============================
:: Push a GitHub
:: ============================
echo Enviando cambios a GitHub...
git push -u origin main --force
if %errorlevel% neq 0 echo ERROR haciendo push
echo Código subido a GitHub.
echo.

:: ============================
:: Instalar dependencias Node.js
:: ============================
echo Instalando dependencias...
npm install
if %errorlevel% neq 0 (
    echo ERROR instalando dependencias
    pause
    exit /b
)
echo Dependencias instaladas.
echo.

:: ============================
:: Ejecutar servidor
:: ============================
echo Iniciando servidor...
node server.cjs
if %errorlevel% neq 0 (
    echo ERROR ejecutando servidor. Revisa tu server.cjs
    pause
    exit /b
)
echo Servidor iniciado.
echo.

:: ============================
:: Abrir proyecto en navegador
:: ============================
echo Abriendo proyecto en el navegador...
start "" "https://whatsapp-bot2-production-0129.up.railway.app/chat"

echo ==============================================
echo Deploy completado ✅
pause
