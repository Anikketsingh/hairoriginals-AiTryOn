# Setting up a try-on standee

This guide turns a Windows 10/11 Pro standee PC into a locked-down HairOriginals try-on kiosk. Plan on about 30 minutes per standee.

The standee runs no app code. It opens `https://<your-domain>/kiosk` in Microsoft Edge's full-screen kiosk mode. App updates reach every standee through normal Vercel deploys.

## What you need
- The standee, a USB keyboard and mouse (for setup only), and internet access (Wi-Fi or Ethernet).
- This `kiosk-setup` folder, copied to the standee by USB stick or download.
- Your production URL and your Supabase host (shown in the Supabase dashboard under Project Settings → API, for example `abcd1234.supabase.co`).
- Access to **Admin → Kiosks** in the admin panel (super admin).

## 1. Register the standee in the admin panel
1. Go to **Admin → Kiosks → Register a Kiosk**. Give it a name (e.g. "Phoenix Mall 1") and a location.
2. Write down the **enrollment code** that appears; you type it on the standee in step 6. It works once and expires after 24 hours. If it expires, click **Enrollment link** on that kiosk to get a new one.

## 2. Create the Kiosk Windows user
Do this signed in as the PC's existing **administrator** account, and give that account a strong password.

1. Open **Settings → Accounts → Other users → Add account**. Choose "I don't have this person's sign-in info", then "Add a user without a Microsoft account".
   - Username: `Kiosk`
   - Set a password. This must be a **standard user**, not an administrator.
2. Sign out, sign in as **Kiosk** once so Windows creates its profile, then sign out fully (don't just lock).
3. Sign back in as the administrator.

## 3. Run the lockdown script
Open **PowerShell as administrator** inside the `kiosk-setup` folder and run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
.\setup-kiosk.ps1 -KioskUrl "https://<your-domain>/kiosk" -SupabaseHost "<project>.supabase.co"
```

The script does the following:
- Installs the launcher in `C:\Kiosk` and starts it automatically when Kiosk signs in.
- Turns off Edge DevTools, F12 and Inspect, downloads, printing, InPrivate, and every website except yours.
- Gives your site camera access with no permission prompt.
- Turns off screen-edge swipes, Task Manager, lock, the Win key, notifications and the touch keyboard (for the Kiosk user).
- Stops the PC from sleeping, reboots it every night at 03:00, and keeps Windows Update restarts outside opening hours.

To undo all of this later: `.\setup-kiosk.ps1 -Undo`

## 4. Auto sign-in
1. Download **Autologon** from Microsoft Sysinternals: <https://learn.microsoft.com/sysinternals/downloads/autologon>
2. Run it and enter username `Kiosk`, domain `.` and the Kiosk password. Then click **Enable**. The password is stored encrypted.

## 5. BIOS: power on after a power cut
Restart the PC and enter the BIOS (usually with Del or F2 at boot). Find **"Restore on AC Power Loss"** (sometimes called "After Power Failure" or "AC Recovery") and set it to **Power On**. This makes the standee start up by itself when the mall turns the power back on.

## 6. Reboot and enroll
After a reboot, the standee should sign in as Kiosk and open full screen within about 30 seconds, showing **"This screen isn't registered yet"**.

1. Tap **Enter enrollment code**.
2. Type the code from step 1 using the USB keyboard, then tap **Register**.
3. The try-on attract screen appears.

You only do this once per PC.

## 7. Test
Work through this checklist:

- [ ] Two visitors in a row: the second sees nothing from the first.
- [ ] Leaving the screen idle shows "Still there?" and then resets.
- [ ] The camera opens with no permission pop-up.
- [ ] Scanning the result QR code on a phone opens and downloads the photo.
- [ ] Entering a phone number creates a lead in **Admin → Sales CRM** with a "Kiosk" badge.
- [ ] Alt+F4 closes Edge, and it comes back within 3 seconds.
- [ ] Alt+Tab, the Win key, F12, Ctrl+Shift+I and right-click/long-press do nothing useful.
- [ ] Swiping in from each of the four screen edges does nothing, and neither does pinch-zoom.
- [ ] Pulling the network cable shows "We'll be right back", and plugging it back in makes the kiosk recover by itself.
- [ ] Pulling the power cable, then plugging it back in, makes the standee boot straight back into the kiosk.
- [ ] **Admin → Kiosks** shows the standee as **Online**.

## Day-to-day
- **Updating the app:** just deploy. Standees load the new version on their next reload, which happens at the nightly reboot, after every 30 visitors, or from the staff menu.
- **Staff menu:** tap the top-left corner of the screen 5 times quickly. It shows the kiosk name and version and has a **Reload app** button. It cannot exit to Windows.
- **Getting to Windows for maintenance:** plug in a keyboard, press **Ctrl+Alt+Del**, choose **Sign out**, then sign in as the administrator.
- **Remote support:** install RustDesk, AnyDesk or Chrome Remote Desktop under the **administrator** account.
- **Lost or stolen standee:** go to **Admin → Kiosks → Revoke**. That standee stops working immediately.
- **Moving a kiosk to a new PC:** click **Re-enroll** to get a new link and use it on the new PC. The old PC stops working as soon as the new one enrolls.
- **Cost control:** each kiosk has a **Daily cap** in Admin → Kiosks. Once it is reached, the standee shows "That's all for today" until midnight IST.
