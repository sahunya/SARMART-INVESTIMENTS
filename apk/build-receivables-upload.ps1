Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$source = 'C:\Users\ADMIN\Desktop\cont.xlsx'
$output = 'C:\Users\ADMIN\Documents\apk\cont-receivables-simple-upload.csv'
$stream = [System.IO.File]::Open($source, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
$zip = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Read, $false)

function Read-ZipText($entry) {
  $reader = [System.IO.StreamReader]::new($entry.Open())
  try { $reader.ReadToEnd() } finally { $reader.Dispose() }
}

$shared = @()
$sharedEntry = $zip.Entries | Where-Object FullName -eq 'xl/sharedStrings.xml'
if ($sharedEntry) {
  [xml]$sharedXml = Read-ZipText $sharedEntry
  $shared = @($sharedXml.sst.si | ForEach-Object { $_.InnerText })
}

[xml]$sheetXml = Read-ZipText ($zip.Entries | Where-Object FullName -eq 'xl/worksheets/sheet1.xml')
$rows = [System.Collections.Generic.List[object]]::new()
$customer = ''
foreach ($row in $sheetXml.worksheet.sheetData.row) {
  $cells = @{}
  foreach ($cell in $row.c) {
    $column = ([regex]::Match($cell.r, '^[A-Z]+')).Value
    $value = $cell.v
    if ($cell.t -eq 's' -and $null -ne $value) { $value = $shared[[int]$value] }
    $cells[$column] = $value
  }
  $name = ([string]$cells['A']).Trim()
  if ($name) { $customer = $name }
  $amountText = [string]$cells['B']
  $amount = 0.0
  if (-not $customer -or -not [double]::TryParse(($amountText -replace '[^0-9.-]', ''), [ref]$amount)) { continue }
  $rows.Add([pscustomobject]@{
    Type = 'Receivable'
    'Supplier name' = $customer
    Contact = ''
    Amount = $amount
    Notes = ([string]$cells['C']).Trim()
  })
}

$zip.Dispose()
$stream.Dispose()
$rows | Export-Csv -LiteralPath $output -NoTypeInformation -Encoding utf8
Write-Output "Created $($rows.Count) rows at $output"
