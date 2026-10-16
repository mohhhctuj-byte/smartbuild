$ErrorActionPreference = "Stop"

$envFile = Join-Path $PSScriptRoot "..\.env.local"
$envFile = [System.IO.Path]::GetFullPath($envFile)
if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
  throw "The project's .env.local file was not found."
}

$secureKey = Read-Host "Paste the NEW Anthropic API key (input stays hidden)" -AsSecureString
$keyPointer = [IntPtr]::Zero
$apiKey = $null
try {
  $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
  $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
  if (-not $apiKey.StartsWith("sk-ant-", [StringComparison]::Ordinal) -or $apiKey.Length -lt 30 -or $apiKey -match "[`r`n]") {
    throw "The value does not look like an Anthropic API key. Nothing was saved."
  }

  $lines = [System.Collections.Generic.List[string]]::new()
  $lines.AddRange([System.IO.File]::ReadAllLines($envFile))
  $keyLineIndexes = @(
    for ($i = 0; $i -lt $lines.Count; $i++) {
      if ($lines[$i] -match '^\s*ANTHROPIC_API_KEY\s*=') { $i }
    }
  )
  if ($keyLineIndexes.Count -gt 0) {
    $lines[$keyLineIndexes[0]] = "ANTHROPIC_API_KEY=$apiKey"
    for ($i = $keyLineIndexes.Count - 1; $i -ge 1; $i--) {
      $lines.RemoveAt($keyLineIndexes[$i])
    }
  } else {
    $lines.Add("ANTHROPIC_API_KEY=$apiKey")
  }

  [System.IO.File]::WriteAllLines($envFile, $lines, [System.Text.UTF8Encoding]::new($false))
  Write-Output "Anthropic key saved locally to .env.local. Its value was not displayed."
} finally {
  if ($keyPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
  }
  if ($secureKey) { $secureKey.Dispose() }
  $apiKey = $null
}
