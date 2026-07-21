# Installing Exasol Studio

## macOS — Homebrew (recommended for developers)

```sh
brew tap sheetaldharshan200/tap https://github.com/Sheetaldharshan200/homebrew-tap
brew install --cask exasol-studio
```

- Upgrade: `brew upgrade --cask exasol-studio`
- Remove: `brew uninstall --cask exasol-studio` (add `--zap` to delete app data too)

Homebrew places the app in `/Applications` and, on this demo build, strips the
download quarantine flag so it launches without the Gatekeeper "unidentified
developer" prompt.

## macOS — DMG (manual)

Download `ExasolStudio-Mac-AppleSilicon.dmg` (Apple Silicon) or
`ExasolStudio-Mac-Intel.dmg` from the
[latest release](https://github.com/Sheetaldharshan200/Exasol-studio/releases/latest),
open it, and drag **Exasol Studio** into Applications.

Because this build is not yet Apple-notarized, first launch is blocked by
Gatekeeper. Either right-click the app → **Open** → **Open**, or clear the flag
once from a terminal:

```sh
xattr -dr com.apple.quarantine "/Applications/Exasol Studio.app"
```

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
