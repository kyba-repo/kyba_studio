Add-Type -AssemblyName System.Drawing

function New-AppXIcon {
    param (
        [int]$width,
        [int]$height,
        [string]$outputPath
    )
    
    $bmp = New-Object System.Drawing.Bitmap $width, $height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Black)

    # Calculate proportional sizes
    $penWidth = [math]::Max(2, [int]([math]::Min($width, $height) * 0.05))
    $rectX = [int]($width * 0.08)
    $rectY = [int]($height * 0.08)
    $rectW = $width - 2 * $rectX
    $rectH = $height - 2 * $rectY

    # Draw white square
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), $penWidth
    $g.DrawRectangle($pen, $rectX, $rectY, $rectW, $rectH)

    # Draw letter K
    $fontSize = [int]([math]::Min($width, $height) * 0.55)
    $font = New-Object System.Drawing.Font("Arial", $fontSize, [System.Drawing.FontStyle]::Bold)
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF(0, ($height * 0.02), $width, $height)
    $g.DrawString("K", $font, $brush, $rect, $format)

    # Ensure output directory exists
    $outDir = [System.IO.Path]::GetDirectoryName($outputPath)
    if (-not (Test-Path -Path $outDir)) {
        New-Item -ItemType Directory -Path $outDir | Out-Null
    }

    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

$baseDir = "c:\Users\ger_x\OneDrive\Documentos\proyecto-20260620T170618Z-3-001\proyecto"

# Generate main icon.png (512x512) for electron-builder
New-AppXIcon 512 512 "$baseDir\build\icon.png"
# Generate renderer icon.png
New-AppXIcon 256 256 "$baseDir\renderer\icon.png"

# AppX required assets
New-AppXIcon 150 150 "$baseDir\build\appx\Square150x150Logo.png"
New-AppXIcon 44 44 "$baseDir\build\appx\Square44x44Logo.png"
New-AppXIcon 50 50 "$baseDir\build\appx\StoreLogo.png"
New-AppXIcon 310 150 "$baseDir\build\appx\Wide310x150Logo.png"
New-AppXIcon 71 71 "$baseDir\build\appx\SmallTile.png"
New-AppXIcon 310 310 "$baseDir\build\appx\LargeTile.png"

# Create ICO file from the 256x256 renderer icon
$pngBytes = [System.IO.File]::ReadAllBytes("$baseDir\renderer\icon.png")
$icoPath = "$baseDir\build\icon.ico"
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
