@echo off
REM ============================================================
REM HairOriginals Kiosk launcher + watchdog
REM
REM Opens the try-on kiosk full screen in Microsoft Edge kiosk mode and
REM relaunches it within a few seconds if it is ever closed or crashes.
REM setup-kiosk.ps1 copies this to C:\Kiosk\ and fills in KIOSK_URL.
REM Started hidden at logon by launch-hidden.vbs (no console window).
REM ============================================================

set KIOSK_URL=__KIOSK_URL__
set KIOSK_HOST=__KIOSK_HOST__
set EDGE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe
set PROFILE=C:\Kiosk\EdgeProfile

REM Wait (up to ~2 minutes) for the network after boot, so Edge doesn't
REM open on a "no internet" error page. The kiosk page itself recovers from
REM later drops on its own.
set /a TRIES=0
:waitnet
ping -n 1 -w 2000 %KIOSK_HOST% >nul 2>&1
if %errorlevel%==0 goto loop
set /a TRIES+=1
if %TRIES% GEQ 40 goto loop
timeout /t 3 /nobreak >nul
goto waitnet

:loop
"%EDGE%" --kiosk "%KIOSK_URL%" --edge-kiosk-type=fullscreen ^
  --user-data-dir="%PROFILE%" ^
  --no-first-run --no-default-browser-check ^
  --disable-pinch --overscroll-history-navigation=0 ^
  --autoplay-policy=no-user-gesture-required
REM Edge exited (closed, crashed, or killed) - bring it straight back.
timeout /t 3 /nobreak >nul
goto loop
