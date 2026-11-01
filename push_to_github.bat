@echo off
chcp 65001 >nul
echo ========================================================
echo   กำลังอัปโหลดระบบกองทุน TNS06 (v2) ขึ้น GitHub สำหรับ Vercel
echo   Repository: https://github.com/rtgcist-glitch/tns06.git
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/3] ล้างบัญชี GitHub เดิม (wtryu568-prog) เพื่อเข้าสู่ระบบบัญชี rtgcist-glitch...
cmdkey /delete:LegacyGeneric:target=git:https://github.com >nul 2>&1
cmdkey /delete:git:https://github.com >nul 2>&1

echo [2/3] บันทึกไฟล์ล่าสุดลง Git...
git add .
git commit -m "feat: TNS06 v2 modern fintech UI, bug fixes, and Vercel serverless setup" >nul 2>&1

echo [3/3] กำลังส่งโค้ดขึ้น https://github.com/rtgcist-glitch/tns06.git ...
echo (หากมีหน้าต่าง GitHub เด้งขึ้นมา กรุณาล็อกอินด้วยบัญชี rtgcist-glitch)
git push -u origin main --force

echo.
if %ERRORLEVEL% EQU 0 (
    echo ✅ อัปโหลดขึ้น GitHub สำเร็จเรียบร้อยแล้ว! สามารถนำไป Deploy บน Vercel ได้ทันที
) else (
    echo ❌ เกิดข้อผิดพลาดในการอัปโหลด กรุณาตรวจสอบว่าล็อกอินบัญชี rtgcist-glitch ถูกต้อง
)
echo.
pause
