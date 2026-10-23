# Fabrique les tuiles de la carte interactive (public/img/carte/{z}/{x}_{y}.jpg) à partir des 64 tuiles du wiki
# (Map:Embervale/Background, 8x8 de 1280 px, fichiers {colonne}_{ligne}.jpg, ligne 0 en haut).
# Tuiles de 320 px : le niveau z fait 320 x 2^z px, et le niveau 5 (10 240 px) est exactement la résolution du wiki,
# découpé sans redimensionnement (le plus net possible).
#   powershell -ExecutionPolicy Bypass -File outils\carte\tuiles.ps1 -Src <dossier des 64 tuiles> -Out public\img\carte
param([string]$Src, [string]$Out, [int]$MaxZoom = 5, [int]$Tile = 320, [long]$Quality = 85)
Add-Type -AssemblyName System.Drawing
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters 1
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), $Quality
function New-Gfx($bmp) { $g = [System.Drawing.Graphics]::FromImage($bmp); $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'; $g.SmoothingMode = 'HighQuality'; return $g }
function Cut($img, $x, $y, $path) {
  $tile = $img.Clone((New-Object System.Drawing.Rectangle $x, $y, $Tile, $Tile), $img.PixelFormat)
  $tile.Save($path, $enc, $ep); $tile.Dispose()
}

if (Test-Path $Out) { Remove-Item -Recurse -Force $Out }
for ($z = 0; $z -le $MaxZoom; $z++) {
  $size = $Tile * [math]::Pow(2, $z); $cell = $size / 8; $n = $size / $Tile
  $dir = Join-Path $Out $z; New-Item -ItemType Directory -Force $dir | Out-Null
  if ($cell -lt $Tile) {
    # Petits niveaux : on assemble l'image entière puis on la découpe
    $img = New-Object System.Drawing.Bitmap ([int]$size), ([int]$size)
    $g = New-Gfx $img
    for ($c = 0; $c -lt 8; $c++) { for ($r = 0; $r -lt 8; $r++) {
      $t = [System.Drawing.Image]::FromFile((Join-Path $Src "${c}_${r}.jpg"))
      $g.DrawImage($t, [int]($c * $cell), [int]($r * $cell), [int]$cell, [int]$cell); $t.Dispose() } }
    $g.Dispose()
    for ($x = 0; $x -lt $n; $x++) { for ($y = 0; $y -lt $n; $y++) { Cut $img ($x * $Tile) ($y * $Tile) (Join-Path $dir "${x}_${y}.jpg") } }
    $img.Dispose()
  } else {
    # Grands niveaux : chaque tuile du wiki est mise à l'échelle (rien à faire au niveau maximal) puis découpée
    $per = $cell / $Tile
    for ($c = 0; $c -lt 8; $c++) { for ($r = 0; $r -lt 8; $r++) {
      $t = [System.Drawing.Image]::FromFile((Join-Path $Src "${c}_${r}.jpg"))
      $img = New-Object System.Drawing.Bitmap ([int]$cell), ([int]$cell)
      $g = New-Gfx $img
      if ($t.Width -eq $cell) { $g.InterpolationMode = 'NearestNeighbor' }
      $g.DrawImage($t, 0, 0, [int]$cell, [int]$cell); $g.Dispose(); $t.Dispose()
      for ($i = 0; $i -lt $per; $i++) { for ($j = 0; $j -lt $per; $j++) {
        Cut $img ($i * $Tile) ($j * $Tile) (Join-Path $dir ("{0}_{1}.jpg" -f ($c * $per + $i), ($r * $per + $j))) } }
      $img.Dispose() } }
  }
  Write-Host ("niveau $z : " + (Get-ChildItem $dir).Count + " tuiles")
}
