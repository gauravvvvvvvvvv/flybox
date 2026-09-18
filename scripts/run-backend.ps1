$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
if (Test-Path ".venv\Scripts\Activate.ps1") {
  . ".\.venv\Scripts\Activate.ps1"
}
Set-Location "backend"
python -m uvicorn app.main:app --reload
