# Exasol Studio installer for Windows — no Scoop required.
#
#   irm https://raw.githubusercontent.com/Sheetaldharshan200/Exasol-studio/main/scripts/install.ps1 | iex
#
# Downloads the LATEST published release's Windows setup and runs it. By
# default the NSIS installer runs silently (/S); pass -Interactive for the
# wizard. It installs per-user (no admin needed).
[CmdletBinding()]
param([switch]$Interactive)

$ErrorActionPreference = "Stop"
$repo  = "Sheetaldharshan200/Exasol-studio"
$asset = "ExasolStudio-Windows-64bit-setup.exe"
$url   = "https://github.com/$repo/releases/latest/download/$asset"
$dest  = Join-Path $env:TEMP $asset

Write-Host "> Downloading $asset (latest release)..." -ForegroundColor Green
Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing

Write-Host "> Running the installer..." -ForegroundColor Green
if ($Interactive) {
    Start-Process -Wait -FilePath $dest
} else {
    # NSIS silent, per-user install (no admin prompt).
    Start-Process -Wait -FilePath $dest -ArgumentList "/S"
}

Remove-Item $dest -ErrorAction SilentlyContinue
Write-Host "> Done. Find 'Exasol Studio' in the Start Menu." -ForegroundColor Green
