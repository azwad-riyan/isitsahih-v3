Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\User\.gemini\antigravity-ide\brain\b6f77007-d813-4009-a753-b79af8a6f08a\pwa_icon_source_1781699756993.png"
$publicDir = Split-Path $PSScriptRoot -Parent | Join-Path -ChildPath "public"

$src = [System.Drawing.Image]::FromFile($srcPath)

foreach ($size in @(192, 512)) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.DrawImage($src, 0, 0, $size, $size)
    $g.Dispose()
    $outPath = Join-Path $publicDir "icon-$size.png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Saved: $outPath"
}

$src.Dispose()
Write-Host "Done!"
