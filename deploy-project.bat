@echo off
title Deploy Automático CRM WhatsApp + Chat (Railway)
echo ==============================================
echo       DEPLOY AUTOMÁTICO - CHAT WHATSAPP
echo ==============================================

:: Función para manejar errores
:checkError
if %errorlevel% neq 0 (
    echo ❌ Ocurrió un error en el paso anterior. Errorlevel=%errorlevel%
    echo Revisa arriba para más detalles.
    pause
    goto :eof
)
goto :eof

:: ============================
:: Instalar dependencias
:: ============================
echo Instalando dependencias...
npm install
call :checkError
echo ✅ Dependencias listas.
echo ============================================

:: ============================
:: Inicializar Git si no existe
:: ============================
IF NOT EXIST ".git" (
    echo Inicializando repositorio Git...
    git init
    call :checkError
    echo ✅ Repositorio Git creado.
)

:: ============================
:: Configurar remoto GitHub
:: ============================
git remote remove origin >nul 2>&1
git remote add origin https://github.com/websrapidascontacto-ops/whatsapp-bot2.git
call :checkError
echo ✅ Remoto configurado.
echo ============================================

:: ============================
:: Traer cambios del remoto
:: ============================
echo Actualizando repositorio desde GitHub...
git pull origin main --rebase
call :checkError
echo ✅ Pull completado.
echo ============================================

:: ============================
:: Commit solo si hay cambios
:: ============================
git add .
for /f "delims=" %%i in ('git status --porcelain') do set CHANGES=YES

IF DEFINED CHANGES (
    echo Se detectaron cambios, haciendo commit...
    git commit -m "Deploy Chat WhatsApp - %DATE% %TIME%"
    call :checkError
    echo ✅ Commit realizado.
) ELSE (
    echo No hay cambios para commitear.
)
echo ============================================

:: ============================
:: Push a GitHub
:: ============================
echo Enviando cambios a GitHub...
git push -u origin main --force
call :checkError
echo ✅ Código subido a GitHub.
echo ============================================

:: ============================
:: Deploy a Railway
:: ============================
echo Iniciando deploy en Railway...
railway up
call :checkError
echo ✅ Deploy en Railway completado.
echo ============================================

echo 🚀 Deploy finalizado correctamente.
pause
