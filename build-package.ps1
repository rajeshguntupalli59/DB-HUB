#!/usr/bin/env pwsh
# DB Hub — Build Distribution Package
# Creates db-hub-v1.0.zip for customer delivery
#
# Usage: .\build-package.ps1

$ErrorActionPreference = "Stop"

$Version = "1.0"
$ZipName = "db-hub-v$Version.zip"
$TempDir = "$env:TEMP\db-hub-build"

Write-Host ""
Write-Host "Building DB Hub v$Version distribution package..." -ForegroundColor Cyan
Write-Host ""

# ── Build frontend first ───────────────────────────────────────────────────
Write-Host "[1/4] Building frontend..." -ForegroundColor Yellow
Push-Location "$PSScriptRoot\frontend"
npm install --silent
npm run build --silent
Write-Host "      Frontend built (dist/)." -ForegroundColor Green
Pop-Location

# ── Copy files to temp dir ─────────────────────────────────────────────────
Write-Host "[2/4] Assembling package..." -ForegroundColor Yellow
if (Test-Path $TempDir) { Remove-Item $TempDir -Recurse -Force }
New-Item -ItemType Directory -Path $TempDir | Out-Null

# Files/dirs to include
$Include = @(
    "backend",
    "frontend\dist",
    "frontend\package.json",
    "frontend\vite.config.js",
    "frontend\tailwind.config.js",
    "frontend\postcss.config.js",
    "frontend\index.html",
    "setup.ps1",
    "start.ps1"
)

# Dirs to exclude from backend
$ExcludeBackend = @(".venv", "__pycache__", "*.pyc", "db_hub.sqlite3", ".env")

foreach ($item in $Include) {
    $src = Join-Path $PSScriptRoot $item
    if (-not (Test-Path $src)) { continue }
    $dst = Join-Path $TempDir $item
    $dstParent = Split-Path $dst -Parent
    if (-not (Test-Path $dstParent)) { New-Item -ItemType Directory -Path $dstParent -Force | Out-Null }

    if (Test-Path $src -PathType Container) {
        Copy-Item $src $dst -Recurse -Force
    } else {
        Copy-Item $src $dst -Force
    }
}

# Remove excluded items from backend copy
Remove-Item "$TempDir\backend\.venv" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$TempDir\backend\__pycache__" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$TempDir\backend\db_hub.sqlite3" -Force -ErrorAction SilentlyContinue
Remove-Item "$TempDir\backend\.env" -Force -ErrorAction SilentlyContinue
Get-ChildItem "$TempDir\backend" -Filter "*.pyc" -Recurse | Remove-Item -Force

# Copy .env.example as the template (rename to .env.example in package)
Copy-Item "$PSScriptRoot\backend\.env.example" "$TempDir\backend\.env.example" -Force

Write-Host "      Package assembled." -ForegroundColor Green

# ── Create ZIP ─────────────────────────────────────────────────────────────
Write-Host "[3/4] Creating ZIP..." -ForegroundColor Yellow
$ZipPath = Join-Path $PSScriptRoot $ZipName
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
Compress-Archive -Path "$TempDir\*" -DestinationPath $ZipPath -CompressionLevel Optimal
Write-Host "      $ZipName created." -ForegroundColor Green

# ── Cleanup ────────────────────────────────────────────────────────────────
Write-Host "[4/4] Cleaning up..." -ForegroundColor Yellow
Remove-Item $TempDir -Recurse -Force
Write-Host "      Done." -ForegroundColor Green

# ── Report ─────────────────────────────────────────────────────────────────
$size = [math]::Round((Get-Item $ZipPath).Length / 1MB, 1)
Write-Host ""
Write-Host "  Package ready: $ZipName ($size MB)" -ForegroundColor Green
Write-Host "  Location: $ZipPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Deliver this ZIP to customers along with their license key." -ForegroundColor White
Write-Host "  Customer runs: .\setup.ps1" -ForegroundColor White
Write-Host ""
