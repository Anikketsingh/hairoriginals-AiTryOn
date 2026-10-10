<#
.SYNOPSIS
  One-time lockdown for a HairOriginals try-on standee (Windows 10/11 Pro).

.DESCRIPTION
  Run from an elevated PowerShell while signed in as the ADMIN account,
  after the "Kiosk" user has been created and has signed in once (so its
  profile exists) and then signed out. See kiosk-setup/README.md.

  Machine-wide: Edge policies (DevTools off, URL allowlist, camera auto-
  allow, no downloads/printing/InPrivate), touch edge swipes off, power
  never sleeps, nightly 3 AM reboot, Windows Update kept out of opening hours.

  Kiosk user only: Task Manager / lock / Win-key shortcuts off,
  notifications off, touch keyboard auto-popup off, screensaver off,
  100% display scaling, and the kiosk launcher in Startup.

  Your admin account is NOT locked down. Escape hatch on the standee:
  plug in a keyboard, Ctrl+Alt+Del, Sign out, then sign in as admin.

.EXAMPLE
  .\setup-kiosk.ps1 -KioskUrl "https://tryon.example.com/kiosk" -SupabaseHost "abcd.supabase.co"

.EXAMPLE
  .\setup-kiosk.ps1 -Undo   # remove every policy this script set
#>
[CmdletBinding()]
param(
  [string]$KioskUrl,
  # Product and result images load from Supabase Storage.
  [string]$SupabaseHost,
  [string]$KioskUser = "Kiosk",
  [string]$RebootTime = "03:00",
  [switch]$Undo
)

$ErrorActionPreference = "Stop"

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run this from an elevated (Run as administrator) PowerShell."
}

$EdgePolicy = "HKLM:\SOFTWARE\Policies\Microsoft\Edge"
$KioskDir = "C:\Kiosk"
$HiveName = "KioskUserHive"
$HiveRoot = "Registry::HKEY_USERS\$HiveName"
$ProfilePath = "C:\Users\$KioskUser"
$TaskName = "HairOriginals Kiosk Nightly Reboot"

function Set-Reg([string]$Path, [string]$Name, $Value, [string]$Type = "DWord") {
  if (-not (Test-Path $Path)) { New-Item -Path $Path -Force | Out-Null }
  New-ItemProperty -Path $Path -Name $Name -Value $Value -PropertyType $Type -Force | Out-Null
}

function Set-RegList([string]$Path, [string[]]$Values) {
  if (Test-Path $Path) { Remove-Item -Path $Path -Recurse -Force }
  New-Item -Path $Path -Force | Out-Null
  for ($i = 0; $i -lt $Values.Count; $i++) {
    New-ItemProperty -Path $Path -Name ($i + 1).ToString() -Value $Values[$i] -PropertyType String -Force | Out-Null
  }
}

function Mount-KioskHive {
  $ntuser = Join-Path $ProfilePath "NTUSER.DAT"
  if (-not (Test-Path $ntuser)) {
    throw "No profile at $ProfilePath. Create the '$KioskUser' user, sign in as it once, sign out, then re-run."
  }
  & reg.exe load "HKU\$HiveName" $ntuser | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Couldn't load $ntuser. Make sure '$KioskUser' is signed out (not just locked)." }
}

function Dismount-KioskHive {
  [gc]::Collect(); [gc]::WaitForPendingFinalizers()
  & reg.exe unload "HKU\$HiveName" | Out-Null
}

# -------------------------------------------------------------
if ($Undo) {
  Write-Host "Removing kiosk lockdown..." -ForegroundColor Yellow
  if (Test-Path $EdgePolicy) { Remove-Item $EdgePolicy -Recurse -Force }
  Remove-ItemProperty "HKLM:\SOFTWARE\Policies\Microsoft\Windows\EdgeUI" -Name AllowEdgeSwipe -ErrorAction SilentlyContinue
  Remove-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" -Name HideFastUserSwitching -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Mount-KioskHive
  try {
    foreach ($p in @(
        "$HiveRoot\Software\Microsoft\Windows\CurrentVersion\Policies\System",
        "$HiveRoot\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer",
        "$HiveRoot\Software\Policies\Microsoft\Windows\Explorer")) {
      if (Test-Path $p) { Remove-Item $p -Recurse -Force }
    }
  } finally { Dismount-KioskHive }
  Remove-Item "$ProfilePath\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\launch-hidden.vbs" -ErrorAction SilentlyContinue
  Write-Host "Done. Reboot to apply." -ForegroundColor Green
  return
}

if (-not $KioskUrl -or -not $SupabaseHost) {
  throw "Pass -KioskUrl (e.g. https://tryon.example.com/kiosk) and -SupabaseHost (e.g. abcd.supabase.co)."
}
$uri = [Uri]$KioskUrl
if ($uri.Scheme -ne "https") { throw "KioskUrl must be https:// - the camera only works on secure origins." }
$origin = "https://$($uri.Host)"

# -- 1. Files -------------------------------------------------
Write-Host "[1/6] Installing launcher to $KioskDir" -ForegroundColor Cyan
New-Item -ItemType Directory -Path $KioskDir -Force | Out-Null
$bat = Get-Content (Join-Path $PSScriptRoot "start-kiosk.bat") -Raw
$bat = $bat.Replace("__KIOSK_URL__", $KioskUrl).Replace("__KIOSK_HOST__", $uri.Host)
Set-Content -Path "$KioskDir\start-kiosk.bat" -Value $bat -Encoding ASCII
Copy-Item (Join-Path $PSScriptRoot "launch-hidden.vbs") "$KioskDir\launch-hidden.vbs" -Force
# Kiosk user needs write access for the Edge profile folder.
& icacls.exe $KioskDir /grant "${KioskUser}:(OI)(CI)M" | Out-Null

# -- 2. Edge policies (machine-wide) --------------------------
Write-Host "[2/6] Edge policies" -ForegroundColor Cyan
Set-Reg $EdgePolicy DeveloperToolsAvailability 2      # no DevTools / F12 / Inspect
Set-Reg $EdgePolicy DownloadRestrictions 3            # block all downloads
Set-Reg $EdgePolicy PrintingEnabled 0
Set-Reg $EdgePolicy InPrivateModeAvailability 1       # InPrivate disabled
Set-Reg $EdgePolicy PasswordManagerEnabled 0
Set-Reg $EdgePolicy AutofillAddressEnabled 0
Set-Reg $EdgePolicy AutofillCreditCardEnabled 0
Set-Reg $EdgePolicy TranslateEnabled 0
Set-Reg $EdgePolicy HideFirstRunExperience 1
Set-Reg $EdgePolicy BrowserSignin 0
Set-Reg $EdgePolicy SyncDisabled 1
Set-Reg $EdgePolicy EdgeShoppingAssistantEnabled 0
Set-Reg $EdgePolicy EdgeCollectionsEnabled 0
Set-Reg $EdgePolicy HubsSidebarEnabled 0
Set-Reg $EdgePolicy ShowRecommendationsEnabled 0
Set-Reg $EdgePolicy UserFeedbackAllowed 0
Set-Reg $EdgePolicy StartupBoostEnabled 0             # so the watchdog's Edge process is the real one
Set-Reg $EdgePolicy BackgroundModeEnabled 0
Set-Reg $EdgePolicy AutoplayAllowed 1                 # attract-screen video
# Only our site (and its image storage) can load; everything else is blocked.
Set-RegList "$EdgePolicy\URLBlocklist" @("*")
Set-RegList "$EdgePolicy\URLAllowlist" @($uri.Host, $SupabaseHost)
# Camera granted to our site with no permission prompt.
Set-RegList "$EdgePolicy\VideoCaptureAllowedUrls" @($origin)

# -- 3. Windows machine policies ------------------------------
Write-Host "[3/6] Windows policies" -ForegroundColor Cyan
# Touch swipes from the screen edges open Task View / notifications - off.
Set-Reg "HKLM:\SOFTWARE\Policies\Microsoft\Windows\EdgeUI" AllowEdgeSwipe 0
Set-Reg "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" HideFastUserSwitching 1
Set-Reg "HKLM:\SOFTWARE\Policies\Microsoft\Windows\CloudContent" DisableWindowsConsumerFeatures 1
Set-Reg "HKLM:\SOFTWARE\Policies\Microsoft\Windows\CloudContent" DisableSoftLanding 1
# Windows Update: never auto-restart while someone is signed in; nightly reboot handles it.
Set-Reg "HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU" NoAutoRebootWithLoggedOnUsers 1
Set-Reg "HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings" ActiveHoursStart 8
Set-Reg "HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings" ActiveHoursEnd 23

# -- 4. Power + nightly reboot --------------------------------
Write-Host "[4/6] Power settings + nightly reboot at $RebootTime" -ForegroundColor Cyan
& powercfg.exe /change monitor-timeout-ac 0
& powercfg.exe /change standby-timeout-ac 0
& powercfg.exe /change hibernate-timeout-ac 0
& powercfg.exe /hibernate off
$action = New-ScheduledTaskAction -Execute "shutdown.exe" -Argument "/r /f /t 0"
$trigger = New-ScheduledTaskTrigger -Daily -At $RebootTime
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -User "SYSTEM" -RunLevel Highest -Force | Out-Null

# -- 5. Kiosk-user lockdown (its own registry hive) -----------
Write-Host "[5/6] Locking down the '$KioskUser' user" -ForegroundColor Cyan
Mount-KioskHive
try {
  $sys = "$HiveRoot\Software\Microsoft\Windows\CurrentVersion\Policies\System"
  Set-Reg $sys DisableTaskMgr 1
  Set-Reg $sys DisableLockWorkstation 1
  Set-Reg $sys DisableChangePassword 1
  # NOTE: "Sign out" on Ctrl+Alt+Del is deliberately left enabled - it is the
  # staff escape hatch back to the admin account.
  Set-Reg "$HiveRoot\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer" NoWinKeys 1
  Set-Reg "$HiveRoot\Software\Policies\Microsoft\Windows\Explorer" DisableNotificationCenter 1
  Set-Reg "$HiveRoot\Software\Microsoft\Windows\CurrentVersion\PushNotifications" ToastEnabled 0
  # Kiosk has its own on-screen keypad; stop the Windows touch keyboard popping up.
  Set-Reg "$HiveRoot\Software\Microsoft\TabletTip\1.7" EnableDesktopModeAutoInvoke 0
  Set-Reg "$HiveRoot\Software\Microsoft\TabletTip\1.7" TipbandDesiredVisibility 0
  # Sticky/Filter keys hotkey prompts off.
  Set-Reg "$HiveRoot\Control Panel\Accessibility\StickyKeys" Flags "506" String
  Set-Reg "$HiveRoot\Control Panel\Accessibility\Keyboard Response" Flags "122" String
  # No screensaver; 100% scaling so the kiosk layout renders at true pixels.
  Set-Reg "$HiveRoot\Control Panel\Desktop" ScreenSaveActive "0" String
  Set-Reg "$HiveRoot\Control Panel\Desktop" LogPixels 96
  Set-Reg "$HiveRoot\Control Panel\Desktop" Win8DpiScaling 1
} finally {
  Dismount-KioskHive
}

# -- 6. Autostart ---------------------------------------------
Write-Host "[6/6] Autostart for '$KioskUser'" -ForegroundColor Cyan
$startup = "$ProfilePath\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup"
New-Item -ItemType Directory -Path $startup -Force | Out-Null
Copy-Item "$KioskDir\launch-hidden.vbs" "$startup\launch-hidden.vbs" -Force
# Manual launcher on the Kiosk desktop too (for testing).
$desktop = "$ProfilePath\Desktop"
if (Test-Path $desktop) { Copy-Item "$KioskDir\start-kiosk.bat" "$desktop\Start Kiosk.bat" -Force }

Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host "Remaining manual steps (see README): Autologon for '$KioskUser', BIOS 'power on after AC loss', reboot."
