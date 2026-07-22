param([Parameter(Mandatory=$true)][string]$TargetRepo)
$ErrorActionPreference = "Stop"
$Source = Join-Path (Split-Path $PSScriptRoot -Parent) "skills"
$Destination = Join-Path $TargetRepo ".claude\skills"
New-Item -ItemType Directory -Force -Path $Destination | Out-Null
Get-ChildItem $Source -Directory | ForEach-Object {
  $Target = Join-Path $Destination $_.Name
  if (Test-Path $Target) { throw "Refusing to overwrite existing skill: $Target" }
  Copy-Item $_.FullName $Target -Recurse
}
Write-Host "Installed SecB architecture skills to $Destination"
