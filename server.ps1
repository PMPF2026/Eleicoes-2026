# Eleições RS 2026 — Mapa Eleitoral - Servidor Web Local
param(
    [int]$Port = 8085
)

$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
    Write-Host "=========================================================" -ForegroundColor Green
    Write-Host " ELEIÇÕES RS 2026 — MAPA ELEITORAL (WEBGIS LOCAL)" -ForegroundColor Cyan
    Write-Host "=========================================================" -ForegroundColor Green
    Write-Host " Servidor Web iniciado com sucesso!" -ForegroundColor Yellow
    Write-Host " Acesso Local: $prefix" -ForegroundColor White
    Write-Host " Pressione Ctrl+C para encerrar o servidor." -ForegroundColor Gray
    Write-Host "=========================================================" -ForegroundColor Green
    
    # Abrir navegador automaticamente
    Start-Process $prefix
} catch {
    Write-Host "Erro ao iniciar o servidor na porta $Port`: $_" -ForegroundColor Red
    exit 1
}

$mimeMap = @{
    ".html" = "text/html; charset=utf-8";
    ".htm"  = "text/html; charset=utf-8";
    ".css"  = "text/css; charset=utf-8";
    ".js"   = "application/javascript; charset=utf-8";
    ".json" = "application/json; charset=utf-8";
    ".geojson" = "application/geo+json; charset=utf-8";
    ".svg"  = "image/svg+xml";
    ".png"  = "image/png";
    ".jpg"  = "image/jpeg";
    ".jpeg" = "image/jpeg";
    ".ico"  = "image/x-icon"
}

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $rawUrl = [System.Uri]::UnescapeDataString($request.RawUrl)
        if ($rawUrl -eq "/" -or $rawUrl -eq "") {
            $rawUrl = "/index.html"
        }

        if ($rawUrl.Contains("?")) {
            $rawUrl = $rawUrl.Substring(0, $rawUrl.IndexOf("?"))
        }

        $localPath = Join-Path $PSScriptRoot $rawUrl.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)

        if (Test-Path $localPath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($localPath).ToLower()
            $mime = if ($mimeMap.ContainsKey($ext)) { $mimeMap[$ext] } else { "application/octet-stream" }
            
            $response.ContentType = $mime
            $response.AddHeader("Access-Control-Allow-Origin", "*")
            $response.AddHeader("Cache-Control", "no-cache")

            $stream = [System.IO.File]::Open($localPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
            $response.ContentLength64 = $stream.Length
            $stream.CopyTo($response.OutputStream)
            $stream.Dispose()
            $response.StatusCode = 200
        } else {
            $response.StatusCode = 404
            $buffer = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $rawUrl")
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        }
        $response.Close()
    } catch {
        # Stopped
    }
}
