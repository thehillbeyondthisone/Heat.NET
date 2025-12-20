@echo off
setlocal EnableDelayedExpansion
title HEAT.NET - The Home of Online Gaming
mode con: cols=80 lines=40
color 0C

:: ============================================================================
::  HEAT.NET Quick Launch Server
::  Hosts the site on your local network (LAN)
::  Compatible with Windows 10/11
:: ============================================================================

cls
echo.
echo    [31m $$\   $$\ $$$$$$$$\  $$$$$$\ $$$$$$$$\       $$\   $$\ $$$$$$$$\ $$$$$$$$\[0m
echo    [31m $$ ^|  $$ ^|$$  _____|$$  __$$\\__$$  __^|      $$$\  $$ ^|$$  _____^\__$$  __^|[0m
echo    [31m $$ ^|  $$ ^|$$ ^|      $$ /  $$ ^|  $$ ^|         $$$$\ $$ ^|$$ ^|         $$ ^|[0m
echo    [31m $$$$$$$$ ^|$$$$$\    $$$$$$$$ ^|  $$ ^|         $$ $$\$$ ^|$$$$$\       $$ ^|[0m
echo    [31m $$  __$$ ^|$$  __^|   $$  __$$ ^|  $$ ^|         $$ \$$$$ ^|$$  __^|      $$ ^|[0m
echo    [31m $$ ^|  $$ ^|$$ ^|      $$ ^|  $$ ^|  $$ ^|         $$ ^|\$$$ ^|$$ ^|         $$ ^|[0m
echo    [31m $$ ^|  $$ ^|$$$$$$$$\ $$ ^|  $$ ^|  $$ ^| $$\     $$ ^| \$$ ^|$$$$$$$$\    $$ ^|[0m
echo    [31m \__^|  \__^|\________^|\__^|  \__^|  \__^| \__^|    \__^|  \__^|\________^|   \__^|[0m
echo.
echo    [33m========================================================================[0m
echo    [37m              T H E   H O M E   O F   O N L I N E   G A M I N G[0m
echo    [33m========================================================================[0m
echo.
echo    [36m               Quick Launch Server - LAN Edition[0m
echo.

:: Get local IP address for LAN access
set "LOCAL_IP="
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    if not defined LOCAL_IP (
        set "LOCAL_IP=%%a"
        set "LOCAL_IP=!LOCAL_IP: =!"
    )
)

:: Fallback if we couldn't detect IP
if not defined LOCAL_IP (
    set "LOCAL_IP=localhost"
)

set PORT=8000

echo    [90m----------------------------------------------------------------------[0m
echo    [33m  Detecting available server runtime...[0m
echo    [90m----------------------------------------------------------------------[0m
echo.

:: Check for Python first (usually more reliable on Windows)
where python >nul 2>&1
if %errorlevel% equ 0 (
    set "RUNTIME=python"
    echo    [32m  [OK] Python detected[0m
    goto :found_runtime
)

:: Check for Python3
where python3 >nul 2>&1
if %errorlevel% equ 0 (
    set "RUNTIME=python3"
    echo    [32m  [OK] Python3 detected[0m
    goto :found_runtime
)

:: Check for Node.js
where node >nul 2>&1
if %errorlevel% equ 0 (
    set "RUNTIME=node"
    echo    [32m  [OK] Node.js detected[0m
    goto :found_runtime
)

:: No runtime found
echo    [31m  [ERROR] No suitable runtime found![0m
echo.
echo    [37m  Please install one of the following:[0m
echo    [36m    - Python 3.x  : https://www.python.org/downloads/[0m
echo    [36m    - Node.js     : https://nodejs.org/[0m
echo.
echo    [33m  Press any key to exit...[0m
pause >nul
exit /b 1

:found_runtime
echo.
echo    [90m----------------------------------------------------------------------[0m
echo    [33m  Starting HEAT.NET Server...[0m
echo    [90m----------------------------------------------------------------------[0m
echo.
echo    [37m  Server Type    :[0m [36m %RUNTIME%[0m
echo    [37m  Port           :[0m [36m %PORT%[0m
echo    [37m  Local Access   :[0m [32m http://localhost:%PORT%[0m
echo    [37m  LAN Access     :[0m [32m http://%LOCAL_IP%:%PORT%[0m
echo.
echo    [90m----------------------------------------------------------------------[0m
echo    [33m                        AVAILABLE PAGES[0m
echo    [90m----------------------------------------------------------------------[0m
echo.
echo    [36m  Main Site .........[0m [37mhttp://%LOCAL_IP%:%PORT%/site/[0m
echo    [36m  Games ..............[0m [37mhttp://%LOCAL_IP%:%PORT%/site/games.html[0m
echo    [36m  Store ..............[0m [37mhttp://%LOCAL_IP%:%PORT%/site/store.html[0m
echo    [36m  My Homebase ........[0m [37mhttp://%LOCAL_IP%:%PORT%/site/pages/myhomebase.html[0m
echo    [36m  HEAT Pager .........[0m [37mhttp://%LOCAL_IP%:%PORT%/site/pages/pager.html[0m
echo    [36m  Degrees ............[0m [37mhttp://%LOCAL_IP%:%PORT%/site/pages/degrees.html[0m
echo    [36m  Trophies ...........[0m [37mhttp://%LOCAL_IP%:%PORT%/site/pages/trophies.html[0m
echo.
echo    [90m----------------------------------------------------------------------[0m
echo    [37m  Share the LAN address with other devices on your network![0m
echo    [33m  Press Ctrl+C to stop the server.[0m
echo    [90m----------------------------------------------------------------------[0m
echo.

:: Change to script directory
cd /d "%~dp0"

:: Launch the appropriate server with LAN binding
if "%RUNTIME%"=="python" (
    python -m http.server %PORT% --bind 0.0.0.0
) else if "%RUNTIME%"=="python3" (
    python3 -m http.server %PORT% --bind 0.0.0.0
) else if "%RUNTIME%"=="node" (
    :: Create a temporary LAN server script
    echo const http = require('http'); > "%TEMP%\heat_server.js"
    echo const fs = require('fs'); >> "%TEMP%\heat_server.js"
    echo const path = require('path'); >> "%TEMP%\heat_server.js"
    echo const mimeTypes = {'.html':'text/html','.htm':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.svg':'image/svg+xml','.ico':'image/x-icon','.txt':'text/plain'}; >> "%TEMP%\heat_server.js"
    echo const server = http.createServer((req, res) =^> { >> "%TEMP%\heat_server.js"
    echo   let filePath = '.' + decodeURIComponent(req.url); >> "%TEMP%\heat_server.js"
    echo   if (filePath === './') filePath = './index.html'; >> "%TEMP%\heat_server.js"
    echo   const ext = path.extname(filePath).toLowerCase(); >> "%TEMP%\heat_server.js"
    echo   const contentType = mimeTypes[ext] ^|^| 'application/octet-stream'; >> "%TEMP%\heat_server.js"
    echo   fs.readFile(filePath, (err, content) =^> { >> "%TEMP%\heat_server.js"
    echo     if (err) { res.writeHead(404); res.end('404 Not Found'); } >> "%TEMP%\heat_server.js"
    echo     else { res.writeHead(200, {'Content-Type': contentType, 'Access-Control-Allow-Origin': '*'}); res.end(content); } >> "%TEMP%\heat_server.js"
    echo   }); >> "%TEMP%\heat_server.js"
    echo   console.log('[HEAT.NET] ' + req.method + ' ' + req.url); >> "%TEMP%\heat_server.js"
    echo }); >> "%TEMP%\heat_server.js"
    echo server.listen(%PORT%, '0.0.0.0', () =^> console.log('Server running on port %PORT%')); >> "%TEMP%\heat_server.js"
    node "%TEMP%\heat_server.js"
)

echo.
echo    [33m  Server stopped. Thanks for using HEAT.NET![0m
echo.
pause
