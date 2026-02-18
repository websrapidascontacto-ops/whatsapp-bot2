@echo off
title Subiendo proyecto y desplegando a Railway
color 0A

echo ========================================
echo Subiendo proyecto a GitHub...
echo ========================================

set /p msg="Mensaje de commit: "

git add .
git commit -m "%msg%"
git push origin main
if %errorlevel% neq 0 (
    echo Error al hacer git push. Verifica tu conexión y rama.
    pause
    exit /b
)

echo.
echo ========================================
echo Desplegando proyecto a Railway...
echo ========================================

cd /d %~dp0
railway up
if %errorlevel% neq 0 (
    echo Error al desplegar en Railway. Verifica CLI y login.
    pause
    exit /b
)

echo.
echo ========================================
echo Deploy completado.
echo Abriendo app en el navegador...
echo ========================================

start https://whatsapp-bot2-production-0129.up.railway.app/chat/

pause
