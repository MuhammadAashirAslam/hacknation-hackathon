# setup-wallet2.ps1
# One-time setup for the agent-side wallet (wallet-2) on port 3457.
# Run this once, then fund wallet-2 by paying the invoice it prints.
#
# Usage: powershell -ExecutionPolicy Bypass -File scripts/setup-wallet2.ps1

$wallet2Dir = "C:\Users\$env:USERNAME\.mdk-wallet-agent"

# ── 1. Init wallet-2 ────────────────────────────────────────────────────────
Write-Host "`n[wallet-2] Initializing at $wallet2Dir" -ForegroundColor Cyan

$existingConfig = Join-Path $wallet2Dir ".mdk-wallet\config.json"
if (Test-Path $existingConfig) {
    Write-Host "[wallet-2] Already initialized (config found). Skipping init." -ForegroundColor Yellow
} else {
    $env:USERPROFILE = $wallet2Dir
    New-Item -ItemType Directory -Force -Path $wallet2Dir | Out-Null
    $initOutput = npx @moneydevkit/agent-wallet@latest init 2>&1
    Write-Host $initOutput
    Write-Host "[wallet-2] IMPORTANT: Save the mnemonic from the output above." -ForegroundColor Red
}

# ── 2. Start daemon on port 3457 ────────────────────────────────────────────
Write-Host "`n[wallet-2] Starting daemon on port 3457..." -ForegroundColor Cyan
$env:USERPROFILE = $wallet2Dir
$env:MDK_WALLET_PORT = "3457"
Start-Process -NoNewWindow -FilePath "npx" -ArgumentList "@moneydevkit/agent-wallet@latest start --daemon" `
    -PassThru | Out-Null

Start-Sleep -Seconds 3

# ── 3. Check status ─────────────────────────────────────────────────────────
$env:USERPROFILE = $wallet2Dir
$env:MDK_WALLET_PORT = "3457"
$status = npx @moneydevkit/agent-wallet@latest status 2>&1
Write-Host "[wallet-2] Status: $status"

# ── 4. Generate funding invoice ─────────────────────────────────────────────
Write-Host "`n[wallet-2] Generating 500 sat funding invoice..." -ForegroundColor Cyan
$env:USERPROFILE = $wallet2Dir
$env:MDK_WALLET_PORT = "3457"
$invoice = npx @moneydevkit/agent-wallet@latest receive 500 2>&1
Write-Host $invoice

Write-Host "`n[ACTION REQUIRED]" -ForegroundColor Green
Write-Host "Pay the invoice above from wallet-1 (marketplace) OR any Lightning wallet."
Write-Host "Then run the smoke test:"
Write-Host "  node agentmarket/scripts/test-payment.js" -ForegroundColor White
Write-Host ""
Write-Host "Add to agentmarket/.env.local:"
Write-Host "  AGENT_WALLET_URL=http://localhost:3457" -ForegroundColor White
