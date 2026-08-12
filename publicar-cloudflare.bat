@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo   Publicar Marketing Dashboard na Cloudflare Pages
echo   (sobe docs/ + functions/ para marketing-vesti.pages.dev)
echo ============================================================
echo.
echo Dica: rode "git pull" antes, para levar o data.json mais novo.
echo.
npx wrangler pages deploy docs --project-name marketing-vesti --branch main --commit-dirty=true
echo.
echo Pronto. Producao: https://marketing-vesti.pages.dev
pause
