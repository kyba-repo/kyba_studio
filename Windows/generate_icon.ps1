Add-Type -AssemblyName System.Drawing
$width = 256
$height = 256
$bmp = New-Object System.Drawing.Bitmap $width, $height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Black)

# Draw white square
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 12
$g.DrawRectangle($pen, 20, 20, 216, 216)

# Draw letter K
# Use Trebuchet MS or Arial
$font = New-Object System.Drawing.Font("Arial", 140, [System.Drawing.FontStyle]::Bold)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$rect = New-Object System.Drawing.RectangleF(0, 5, $width, $height)
$g.DrawString("K", $font, $brush, $rect, $format)

$pngPath = "c:\Users\ger_x\OneDrive\Documentos\proyecto-20260620T170618Z-3-001\proyecto\renderer\icon.png"
$bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

$pngBytes = [System.IO.File]::ReadAllBytes($pngPath)
$icoPath = "c:\Users\ger_x\OneDrive\Documentos\proyecto-20260620T170618Z-3-001\proyecto\build\icon.ico"
$icoFile = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter($icoFile)
$bw.Write([uint16]0)
$bw.Write([uint16]1)
$bw.Write([uint16]1)
$bw.Write([byte]0)
$bw.Write([byte]0)
$bw.Write([byte]0)
$bw.Write([byte]0)
$bw.Write([uint16]1)
$bw.Write([uint16]32)
$bw.Write([uint32]$pngBytes.Length)
$bw.Write([uint32]22)
$bw.Write($pngBytes)
$bw.Close()
