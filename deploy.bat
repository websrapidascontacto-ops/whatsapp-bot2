@echo off
title Subiendo Cambios a Railway - Webs Rapidas
echo ===========================================
echo   SUBIENDO CODIGO A GITHUB Y RAILWAY
echo ===========================================
echo.

:: Preparar los archivos
echo [+] Agregando archivos...
git add .

:: Crear el commit con fecha y hora actual
echo [+] Creando commit...
git commit -m "Actualizacion automatica %date% %time%"

:: Subir a GitHub
echo [+] Subiendo a GitHub (Main)...
git push origin main --force

echo.
echo ===========================================
echo   PROCESO TERMINADO CON EXITO ✅
echo ===========================================
echo Railway empezara el deploy en unos segundos.
pause