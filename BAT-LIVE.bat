@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo Lan dau chay: dang cai thu vien, doi 1-2 phut...
  call pnpm install
)
echo Dang bat game DUONG LEN DINH PHAN XI PANG... Dong cua so nay la tat game.
echo Link cho TikTok LIVE Studio: http://lvh.me:3007/?view=overlay  (1080 x 1920)
set LIVE_MODE=1
set PORT=3007
start "" cmd /c "timeout /t 8 >nul & start http://localhost:3007"
:chay
call pnpm dev
echo.
echo [%date% %time%] Server bi tat, tu bat lai sau 5 giay... (dong cua so nay de tat han)
timeout /t 5 >nul
goto chay
