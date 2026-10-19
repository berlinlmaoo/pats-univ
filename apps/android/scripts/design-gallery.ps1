param([string]$Directory = 'C:\Users\Berlin\Documents\Dev\pats-shots\design-18oct')
Add-Type -AssemblyName System.Drawing
$shots = Get-ChildItem -LiteralPath $Directory -Filter '*.png' | Sort-Object Name
$font = New-Object System.Drawing.Font('Arial', 10)
foreach ($group in ($shots | Group-Object { ($_.BaseName -split '-')[0..2] -join '-' })) {
    $files = @($group.Group)
    for ($start = 0; $start -lt $files.Count; $start += 9) {
        $page = [System.Drawing.Bitmap]::new(900, 2094)
        $graphics = [System.Drawing.Graphics]::FromImage($page)
        $graphics.Clear([System.Drawing.Color]::White)
        for ($index = 0; $index -lt 9 -and ($start + $index) -lt $files.Count; $index++) {
            $file = $files[$start + $index]
            $x = ($index % 3) * 300
            $y = [Math]::Floor($index / 3) * 698
            $image = [System.Drawing.Image]::FromFile($file.FullName)
            $graphics.DrawString($file.BaseName, $font, [System.Drawing.Brushes]::Black, $x, $y)
            $graphics.DrawImage($image, [int]$x, [int]($y + 22), 300, 670)
            $image.Dispose()
        }
        $name = '{0}-contact-{1:D2}.jpg' -f $group.Name, ([int]($start / 9) + 1)
        $page.Save((Join-Path $Directory $name), [System.Drawing.Imaging.ImageFormat]::Jpeg)
        $graphics.Dispose(); $page.Dispose()
    }
}
$font.Dispose()
$figures = $shots | ForEach-Object { '<figure><a href="{0}"><img src="{0}" loading="lazy" alt="{1}"></a><figcaption>{1}</figcaption></figure>' -f $_.Name, $_.BaseName }
$html = '<!doctype html><meta charset="utf-8"><title>Android KTM design verification · 18 Oct 2026</title><style>body{font:16px system-ui;background:#f1efec;color:#0b1220;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:24px}figure{margin:0}img{width:100%;height:auto}figcaption{overflow-wrap:anywhere}</style><h1>Android KTM design verification · 18 Oct 2026</h1><p>Pixel_10_Pro, window visible, host GPU, PATS dev. Each caption identifies role, language, theme, and screen. Open a thumbnail for the original PNG.</p><main>' + ($figures -join "`n") + '</main>'
Set-Content -LiteralPath (Join-Path $Directory 'index.html') -Value $html -Encoding utf8
Write-Output ('Gallery: {0} screenshots' -f $shots.Count)
