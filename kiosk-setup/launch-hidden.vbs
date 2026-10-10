' Starts C:\Kiosk\start-kiosk.bat with no visible console window.
' Placed in the Kiosk user's Startup folder by setup-kiosk.ps1.
CreateObject("WScript.Shell").Run """C:\Kiosk\start-kiosk.bat""", 0, False
