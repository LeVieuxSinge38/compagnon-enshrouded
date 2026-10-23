# Compile l'application Windows avec le compilateur C# intégré à Windows (aucune installation),
# puis la publie dans public/downloads/ pour que le serveur la distribue et la mette à jour.
#
#   powershell -ExecutionPolicy Bypass -File desktop\build.ps1 -WebView2 <dossier du paquet NuGet Microsoft.Web.WebView2 décompressé> [-Notes "Nouveautés…"] [-Highlights "Nouvelle fonction 1|Nouvelle fonction 2"]
#
# Pour publier une nouvelle version : augmenter AssemblyVersion et AssemblyFileVersion dans Program.cs, lancer ce script,
# puis `node outils/publier.js` (crée la version sur GitHub). Les PC reçoivent la mise à jour tout seuls.
param(
  [Parameter(Mandatory = $true)][string]$WebView2,
  [string]$Notes = "",
  # Nouvelles fonctionnalités seulement (séparées par |), affichées dans la fenêtre de mise à jour. Vide = petites corrections.
  [string]$Highlights = ""
)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path (Split-Path -Parent $here) 'public\downloads'
$build = Join-Path $env:TEMP 'compagnon-build'
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$fw = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'

New-Item -ItemType Directory -Force $build, $out | Out-Null
$core = Join-Path $WebView2 'lib\net462\Microsoft.Web.WebView2.Core.dll'
$winforms = Join-Path $WebView2 'lib\net462\Microsoft.Web.WebView2.WinForms.dll'
$loader = Join-Path $WebView2 'runtimes\win-x64\native\WebView2Loader.dll'
foreach ($f in $core, $winforms, $loader) { if (-not (Test-Path $f)) { throw "Fichier WebView2 introuvable : $f" } }

# Icône de secours (flamme) générée si app.ico manque ; app.ico = emblème officiel d'Enshrouded (Steam)
$ico = Join-Path $here 'app.ico'
if (-not (Test-Path $ico)) {
  Add-Type -AssemblyName System.Drawing
  $bmp = New-Object System.Drawing.Bitmap 256, 256
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush ([System.Drawing.Point]::new(0, 0)), ([System.Drawing.Point]::new(256, 256)), ([System.Drawing.Color]::FromArgb(43, 37, 54)), ([System.Drawing.Color]::FromArgb(18, 15, 23))
  $g.FillEllipse($bg, 8, 8, 240, 240)
  $flame = New-Object System.Drawing.Drawing2D.GraphicsPath
  $flame.AddBezier(128, 36, 200, 100, 206, 150, 184, 186)
  $flame.AddBezier(184, 186, 164, 222, 92, 222, 72, 186)
  $flame.AddBezier(72, 186, 50, 146, 84, 120, 104, 96)
  $flame.AddBezier(104, 96, 104, 120, 116, 132, 128, 36)
  $fb = New-Object System.Drawing.Drawing2D.LinearGradientBrush ([System.Drawing.Point]::new(128, 36)), ([System.Drawing.Point]::new(128, 222)), ([System.Drawing.Color]::FromArgb(255, 210, 120)), ([System.Drawing.Color]::FromArgb(255, 110, 40))
  $g.FillPath($fb, $flame)
  $g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 240, 200))), 108, 150, 40, 52)
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $png = $ms.ToArray()
  $fs = [System.IO.File]::Create($ico); $w = New-Object System.IO.BinaryWriter $fs
  $w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]1)          # en-tête ICO, 1 image
  $w.Write([byte]0); $w.Write([byte]0); $w.Write([byte]0); $w.Write([byte]0) # 256x256
  $w.Write([uint16]1); $w.Write([uint16]32); $w.Write([uint32]$png.Length); $w.Write([uint32]22)
  $w.Write($png); $w.Close()
  $g.Dispose(); $bmp.Dispose()
}

Copy-Item $core, $winforms, $loader $build -Force
$exe = Join-Path $build 'CompagnonEnshrouded.exe'
& $csc /nologo /target:winexe /platform:x64 /optimize+ /utf8output /codepage:65001 "/out:$exe" "/win32icon:$ico" `
  "/resource:$(Join-Path $here 'logo.png'),logo.png" "/r:$core" "/r:$winforms" "/r:$fw\System.Windows.Forms.dll" "/r:$fw\System.Drawing.dll" "/r:$fw\System.Web.Extensions.dll" "/r:$fw\System.IO.Compression.dll" "/r:$fw\System.IO.Compression.FileSystem.dll" `
  (Join-Path $here 'Program.cs')
if ($LASTEXITCODE -ne 0) { throw "La compilation a échoué." }

$version = (Select-String -Path (Join-Path $here 'Program.cs') -Pattern 'AssemblyVersion\("(\d+\.\d+\.\d+)').Matches[0].Groups[1].Value
$files = 'CompagnonEnshrouded.exe', 'Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll', 'WebView2Loader.dll'
foreach ($f in $files) { Copy-Item (Join-Path $build $f) $out -Force }
$zip = Join-Path $out 'CompagnonEnshrouded.zip'
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path ($files | ForEach-Object { Join-Path $build $_ }) -DestinationPath $zip
# JSON en UTF-8 sans BOM (lu par l'appli)
$json = [ordered]@{ version = $version; notes = $Notes; highlights = @($Highlights -split '\|' | ForEach-Object { $_.Trim() } | Where-Object { $_ }); files = $files; web = 'web.zip' } | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $out 'desktop.json'), $json, (New-Object Text.UTF8Encoding $false))
Remove-Item -Recurse -Force $build
Write-Host "Version $version publiée dans $out"
Get-ChildItem $out | Format-Table Name, Length

