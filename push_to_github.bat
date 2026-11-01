@echo off
echo ========================================================
echo   Uploading TNS06 (v2) to GitHub for Vercel
echo   Repository: https://github.com/rtgcist-glitch/tns06.git
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/3] Setting remote target to rtgcist-glitch...
git remote set-url origin https://rtgcist-glitch@github.com/rtgcist-glitch/tns06.git

echo [2/3] Adding files and committing...
git add .
git commit -m "feat: TNS06 v2 modern fintech UI, bug fixes, and Vercel serverless setup" >nul 2>&1

echo [3/3] Pushing to https://github.com/rtgcist-glitch/tns06.git ...
echo Please login with account rtgcist-glitch in the browser window if prompted.
git push -u origin main --force

echo.
if %ERRORLEVEL% EQU 0 (
    echo SUCCESS! Code pushed to GitHub. Ready for Vercel deployment.
) else (
    echo ERROR: Push failed. Please check your GitHub account permissions.
)
echo.
pause
