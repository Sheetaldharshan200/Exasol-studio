# Installing Exasol Studio

The main way is the **installer** — download one file and open it. The
**command line** is a backup for locked-down machines where you can't run the
installer. No Homebrew tap or Scoop bucket to add for either path.

## 1. Installer (main path) — download and open

Get the one file for your machine from
[Releases](https://github.com/Sheetaldharshan200/Exasol-studio/releases/latest):

| Platform | File | Then |
|---|---|---|
| macOS — Apple Silicon | `ExasolStudio-Mac-AppleSilicon.dmg` | Open, drag into **Applications** |
| macOS — Intel | `ExasolStudio-Mac-Intel.dmg` | Open, drag into **Applications** |
| Windows | `ExasolStudio-Windows-64bit-setup.exe` | Run it (installs per-user, no admin) |
| Linux | `ExasolStudio-Linux-64bit.AppImage` / `.deb` / `.rpm` | `chmod +x` and run, or `apt`/`yum` install |

On macOS, because this demo build isn't Apple-notarized, first launch is blocked
by Gatekeeper. Right-click the app → **Open** → **Open** (once), or clear the
flag from a terminal:

```sh
xattr -dr com.apple.quarantine "/Applications/Exasol Studio.app"
```

## 2. Command line (backup) — no admin, one command

For a locked-down machine, a blocked installer, or just to try it quickly. Both
install into your **user space** and need **no admin rights** — one command
each, no separate tap/bucket step.

**macOS** (needs [Homebrew](https://brew.sh)):
```sh
brew install --cask sheetaldharshan200/tap/exasol-studio
```
- Upgrade: `brew upgrade --cask exasol-studio`
- Remove: `brew uninstall --cask exasol-studio` (add `--zap` to delete app data too)

A fully-qualified cask name (`owner/tap/token`) makes Homebrew **auto-add the
tap and install in one step**, so `brew upgrade` works normally — no separate
`brew tap` line. The cask strips the download quarantine flag, so it launches
without the Gatekeeper prompt on this unsigned demo build.

**Windows** (needs [Scoop](https://scoop.sh)):
```powershell
scoop install https://raw.githubusercontent.com/Sheetaldharshan200/homebrew-tap/HEAD/bucket/exasol-studio.json
```
- Update: `scoop update exasol-studio`
- Remove: `scoop uninstall exasol-studio`

Scoop installs a single manifest by URL — no `scoop bucket add`. It runs the
app's installer silently; on this unsigned demo build SmartScreen may warn on
first launch (**More info → Run anyway**).

### Don't have Homebrew / Scoop? (one-time, no admin)

- **macOS:** `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`
- **Windows:** `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned; irm get.scoop.sh | iex`
- **Windows WinGet** is already built into Windows 10/11 (`winget --version`) and
  becomes the recommended CLI once the installer is code-signed.

## The friction, and the real fix

The admin/Gatekeeper prompts are **not** about how you install — they come from
the app not being **code-signed with an Apple Developer ID and notarized**.
Homebrew is not a bypass; it quarantines casks by default like any download.
This demo cask works around it by stripping the quarantine flag on install.

To make **every** path (DMG drag-install, Homebrew, and silent MDM deployment)
promptless, the release must be signed + notarized:

1. Join the Apple Developer Program and create a **Developer ID Application**
   certificate (and a **Developer ID Installer** cert if shipping a `.pkg`).
2. Add these repository secrets: `APPLE_CERTIFICATE`,
   `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`,
   `APPLE_PASSWORD` (an app-specific password), `APPLE_TEAM_ID`.
3. Uncomment the `APPLE_*` env block in `.github/workflows/release-app.yml`
   (tauri-action notarizes automatically when those vars are present).
4. Delete the `postflight` quarantine-strip block from the cask — Gatekeeper
   will pass on its own.

## Enterprise fleets (for later)

Once notarized, a **signed `.pkg`** deployed through an MDM (Jamf, Intune,
Kandji) installs silently to `/Applications` with zero end-user prompt — the
standard way IT rolls a desktop app out to a managed fleet. The Homebrew tap
above covers individual developer machines.
