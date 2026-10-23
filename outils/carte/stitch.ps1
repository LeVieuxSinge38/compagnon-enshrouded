# Assemble les 64 tuiles du wiki (8x8 de 1280 px) en une image de carte de 2560 px
param([string]$Dir)
Add-Type -AssemblyName System.Drawing
$size = 2560; $cell = $size / 8
$map = New-Object System.Drawing.Bitmap $size, $size
$gfx = [System.Drawing.Graphics]::FromImage($map)
$gfx.InterpolationMode = 'HighQualityBicubic'
for ($col = 0; $col -lt 8; $col++) {
  for ($row = 0; $row -lt 8; $row++) {
    $img = [System.Drawing.Image]::FromFile("$Dir\tiles\${col}_${row}.jpg")
    $gfx.DrawImage($img, [int]($col * $cell), [int]($row * $cell), [int]$cell, [int]$cell)
    $img.Dispose()
  }
}
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters 1
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 82L
$map.Save("$Dir\map.jpg", $enc, $ep)
# Aperçu avec 3 points de test (coordonnées du wiki : y vers le haut, 0..10240)
$prev = New-Object System.Drawing.Bitmap 640, 640
$gp = [System.Drawing.Graphics]::FromImage($prev)
$gp.InterpolationMode = 'HighQualityBicubic'
$gp.DrawImage($map, 0, 0, 640, 640)
$red = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::Red)
foreach ($pt in @(@(4065, 1264), @(2955, 2209), @(3017, 1621))) { $gp.FillEllipse($red, [float]($pt[0] / 16 - 4), [float]((10240 - $pt[1]) / 16 - 4), 8, 8) }
$prev.Save("$Dir\preview.png")
Write-Host ("map.jpg : " + [math]::Round((Get-Item "$Dir\map.jpg").Length / 1KB) + " Ko")
