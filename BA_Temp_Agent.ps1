# BA_Temp_Agent.ps1
while ($true) {
    try {
        $temp = Invoke-RestMethod -Uri "https://wttr.in/Buenos+Aires?format=%t" -ErrorAction Stop
        $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
        Write-Output "$timestamp - Temperatura en Buenos Aires: $temp"
    } catch {
        Write-Output (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + " - Error al obtener temperatura: $_"
    }
    Start-Sleep -Seconds 120
}
