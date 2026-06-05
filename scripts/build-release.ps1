param([string]$Version = "1.0.0")

$ErrorActionPreference = "Stop"
$root   = Split-Path $PSScriptRoot -Parent
$solDir = Join-Path $root "Solution"
$outDir = Join-Path $root "release"

# 1. Install npm deps (from the project root — controlsRoot layout)
Set-Location $root
npm install --silent

# 2. Build the solution (compiles TS + packages)
Set-Location $solDir
dotnet build --configuration Release

# 3. Copy the zip out with a clean, versioned name
New-Item -ItemType Directory -Force $outDir | Out-Null
$zip = Get-ChildItem "$solDir\bin\Release\*.zip" | Select-Object -First 1
if (-not $zip) {
    Write-Error "No zip was produced. Check the dotnet build output above."
}
$dest = Join-Path $outDir "LiquidProgress_${Version}_managed.zip"
Copy-Item $zip.FullName $dest -Force

Write-Host ""
Write-Host "Release artefact: $dest" -ForegroundColor Green
Set-Location $root
