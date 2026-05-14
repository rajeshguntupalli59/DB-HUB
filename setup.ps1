#!/usr/bin/env pwsh
# DB Hub — Customer Setup Script
# Run once after extracting the ZIP: .\setup.ps1

$ErrorActionPreference = "Stop"
$PSDefaultParameterValues = @{ "*:Encoding" = "utf8" }

Write-Host ""
Write-Host "  ██████╗ ██████╗     ██╗  ██╗██╗   ██╗██████╗" -ForegroundColor Cyan
Write-Host "  ██╔══██╗██╔══██╗    ██║  ██║██║   ██║██╔══██╗" -ForegroundColor Cyan
Write-Host "  ██║  ██║██████╔╝    ███████║██║   ██║██████╔╝" -ForegroundColor Cyan
Write-Host "  ██║  ██║██╔══██╗    ██╔══██║██║   ██║██╔══██╗" -ForegroundColor Cyan
Write-Host "  ██████╔╝██████╔╝    ██║  ██║╚██████╔╝██████╔╝" -ForegroundColor Cyan
Write-Host "  ╚═════╝ ╚═════╝     ╚═╝  ╚═╝ ╚═════╝ ╚═════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "  DB Hub — Self-hosted Database Platform" -ForegroundColor White
Write-Host "  Setup v1.0" -ForegroundColor DarkGray
Write-Host ""

$Root = $PSScriptRoot

# ── Step 1: Python check ───────────────────────────────────────────────────
Write-Host "[1/6] Checking Python..." -ForegroundColor Yellow
try {
    $pyver = python --version 2>&1
    Write-Host "      $pyver" -ForegroundColor Green
} catch {
    Write-Host "      ERROR: Python not found. Install Python 3.11+ from python.org" -ForegroundColor Red
    exit 1
}

# ── Step 2: Node.js check ──────────────────────────────────────────────────
Write-Host "[2/6] Checking Node.js..." -ForegroundColor Yellow
try {
    $nodever = node --version 2>&1
    Write-Host "      Node $nodever" -ForegroundColor Green
} catch {
    Write-Host "      WARNING: Node.js not found. Frontend will run from pre-built dist/." -ForegroundColor DarkYellow
    $SkipFrontend = $true
}

# ── Step 3: Python venv + deps ────────────────────────────────────────────
Write-Host "[3/6] Setting up Python environment..." -ForegroundColor Yellow
Push-Location "$Root\backend"
if (-not (Test-Path ".venv")) {
    python -m venv .venv | Out-Null
}
.venv\Scripts\pip install -r requirements.txt --quiet
Write-Host "      Dependencies installed." -ForegroundColor Green
Pop-Location

# ── Step 4: Generate .env ─────────────────────────────────────────────────
Write-Host "[4/6] Generating configuration..." -ForegroundColor Yellow
$EnvPath = "$Root\backend\.env"
if (Test-Path $EnvPath) {
    Write-Host "      .env already exists — skipping (delete it to regenerate)." -ForegroundColor DarkGray
} else {
    # Generate secure keys
    $SecretKey   = python -c "import secrets; print(secrets.token_hex(32))"
    $FernetKey   = python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

    $AnthropicKey = Read-Host "      Enter your Anthropic API key (or press Enter to skip)"

    @"
SECRET_KEY=$SecretKey
ACCESS_TOKEN_EXPIRE_MINUTES=1440
DATABASE_URL=sqlite:///./db_hub.sqlite3
ENCRYPTION_KEY=$FernetKey
ANTHROPIC_API_KEY=$AnthropicKey
"@ | Set-Content $EnvPath -Encoding utf8

    Write-Host "      Configuration written to backend\.env" -ForegroundColor Green
}

# ── Step 5: Frontend build ─────────────────────────────────────────────────
Write-Host "[5/6] Building frontend..." -ForegroundColor Yellow
if ($SkipFrontend) {
    if (Test-Path "$Root\frontend\dist\index.html") {
        Write-Host "      Using pre-built frontend." -ForegroundColor DarkGray
    } else {
        Write-Host "      ERROR: No pre-built frontend found and Node.js is missing." -ForegroundColor Red
        Write-Host "             Install Node.js 18+ and run: cd frontend && npm install && npm run build" -ForegroundColor Red
    }
} else {
    Push-Location "$Root\frontend"
    npm install --silent
    npm run build --silent
    Write-Host "      Frontend built." -ForegroundColor Green
    Pop-Location
}

# ── Step 6: Create start script ───────────────────────────────────────────
Write-Host "[6/6] Creating start shortcut..." -ForegroundColor Yellow
$StartScript = @"
# DB Hub — Start
Set-Location "`$PSScriptRoot\backend"
Write-Host "Starting DB Hub on http://localhost:8000 ..." -ForegroundColor Cyan
.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000
"@
$StartScript | Set-Content "$Root\start.ps1" -Encoding utf8
Write-Host "      start.ps1 created." -ForegroundColor Green

# ── Done ──────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ✓ Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor White
Write-Host "    1. Run: .\start.ps1" -ForegroundColor Cyan
Write-Host "    2. Open: http://localhost:8000" -ForegroundColor Cyan
Write-Host "    3. Enter your license key when prompted" -ForegroundColor Cyan
Write-Host "    4. Create your admin account" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Need help? Email: support@dbhub.io" -ForegroundColor DarkGray
Write-Host ""
