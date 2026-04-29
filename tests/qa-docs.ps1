$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$qaDoc = Join-Path $repoRoot 'docs\qa.md'

if (-not (Test-Path -LiteralPath $qaDoc)) {
    throw "Missing QA document: $qaDoc"
}

$content = Get-Content -LiteralPath $qaDoc -Raw
$requiredSections = @(
    '## Manual acceptance checklist',
    '## Test focus areas',
    '## Cross-platform risks',
    'Resize and layout behavior',
    'Copy, paste, and selection',
    'Process lifecycle and cleanup'
)

$missing = @()
foreach ($section in $requiredSections) {
    if ($content -notmatch [regex]::Escape($section)) {
        $missing += $section
    }
}

if ($missing.Count -gt 0) {
    throw ('QA doc is missing required sections: ' + ($missing -join ', '))
}

Write-Output 'QA documentation smoke test passed.'
