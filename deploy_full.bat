@echo off
title Deploy Completo CRM WhatsApp + Chat (GitHub + Railway + Servidor)

:: ============================
:: Ruta raíz del proyecto
:: ============================
set "ROOT_DIR=C:\Users\PC\Desktop\whatsapp-bot\crm-whatsapp-flow"
cd /d "%ROOT_DIR%"

:: ============================
:: Log de ejecución
:: ============================
set "LOG_FILE=%ROOT_DIR%\deploy_log.txt"
echo ==== Deploy iniciado: %DATE% %TIME% ==== > "%LOG_FILE%"
echo ========================================== >> "%LOG_FILE%"

:: ============================
:: Pausa inicial
:: ============================
echo Verificando entorno...
pause

:: ============================
:: Comprobar Node
:: ============================
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js no esta instalado o no esta en el PATH
    pause
    exit /b
)

:: ============================
:: Comprobar Railway CLI
:: ============================
railway -v >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Railway CLI no esta instalado o no esta en el PATH
    pause
    exit /b
)

:: ============================
:: Instalar dependencias
:: ============================
echo Instalando dependencias...
npm install >> "%LOG_FILE%" 2>&1
if %errorlevel% neq 0 (
    echo ERROR instalando dependencias. Revisar deploy_log.txt
    pause
    exit /b
)
echo Dependencias listas.
echo ============================================

:: ============================
:: Inicializar Git si no existe
:: ============================
IF NOT EXIST ".git" (
    echo Inicializando repositorio Git...
    git init >> "%LOG_FILE%" 2>&1
    echo Repositorio Git creado.
)

:: ============================
:: Configurar remoto GitHub
:: ============================
git remote remove origin >nul 2>&1
git remote add origin https://github.com/websrapidascontacto-ops/whatsapp-bot2.git
echo Remoto configurado.
echo ============================================

:: ============================
:: Traer cambios del remoto
:: ============================
echo Actualizando repositorio desde GitHub...
git pull origin main --rebase >> "%LOG_FILE%" 2>&1
if %errorlevel% neq 0 echo ERROR haciendo pull. Revisar deploy_log.txt
echo Pull completado.
echo ============================================

:: ============================
:: Commit y push a GitHub
:: ============================
git add .
for /f "delims=" %%i in ('git status --porcelain') do set CHANGES=YES

IF DEFINED CHANGES (
    echo Se detectaron cambios, haciendo commit...
    git commit -m "Deploy Chat WhatsApp - %DATE% %TIME%" >> "%LOG_FILE%" 2>&1
    echo Commit realizado.
) ELSE (
    echo No hay cambios para commitear.
)

echo Enviando cambios a GitHub...
git push -u origin main --force >> "%LOG_FILE%" 2>&1
if %errorlevel% neq 0 echo ERROR haciendo push. Revisar deploy_log.txt
echo Código subido a GitHub.
echo ============================================

:: ============================
:: Deploy a Railway
:: ============================
echo Iniciando deploy en Railway...
railway up >> "%LOG_FILE%" 2>&1
if %errorlevel% neq 0 (
    echo ERROR ejecutando deploy en Railway. Revisar deploy_log.txt
    pause
    exit /b
)
echo Deploy en Railway completado ✅
echo ============================================

:: ============================
:: Iniciar servidor local
:: ============================
echo Iniciando servidor local...
node server.cjs
if %errorlevel% neq 0 (
    echo ERROR iniciando servidor. Revisar deploy_log.txt
    pause
    exit /b
)

echo ============================================
echo Deploy finalizado. Revisa "%LOG_FILE%" para detalles.
pause
