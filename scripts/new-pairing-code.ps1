$ErrorActionPreference = 'Stop'

Set-Location (Split-Path -Parent $PSScriptRoot)

docker compose --env-file .env -f infra/compose.yaml exec api utto-pairing-code
