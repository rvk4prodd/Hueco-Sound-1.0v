@echo off
title Liner Mobile - Servidor do Celular
cd /d "%~dp0"
echo ===================================================
echo     INICIANDO O LINER MOBILE (SPOTIFY ANDROID)
echo ===================================================
echo.
echo Abrindo o servidor Expo com cache limpo...
echo Em instantes o QR Code aparecera abaixo.
echo.
npx expo start -c
pause
