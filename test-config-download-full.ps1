# Test complete config download flow (login + config download)
$loginUrl = "http://localhost:8082/auth/login"
$configUrl = "http://localhost:8082/devices/1/provision?ssid=secgem&pass=Secgem123"

Write-Host "=== 1. Login ==="
$loginBody = @{
    email = "demo@example.com"
    password = "demo123"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri $loginUrl -Method POST -ContentType "application/json" -Body $loginBody
    $token = $loginResponse.token
    Write-Host "✓ Login successful"
    Write-Host "Token: $($token.Substring(0,30))..."
    
    Write-Host "`n=== 2. Config Download ==="
    $headers = @{
        Authorization = "Bearer $token"
    }
    
    $config = Invoke-RestMethod -Uri $configUrl -Headers $headers
    Write-Host "✓ Config download successful!"
    Write-Host "`n--- Config JSON ---"
    $config | ConvertTo-Json -Depth 10
    
    Write-Host "`n--- ESP Usage ---"
    Write-Host "1. Copy this JSON to /config.json on ESP8266"
    Write-Host "2. ESP will read on boot and connect to WiFi"
    Write-Host "3. MQTT connection and device settings loaded"
    
} catch {
    Write-Host "✗ Error: $_"
    if ($_.Exception.Response) {
        Write-Host "Status:" $_.Exception.Response.StatusCode.value__
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $body = $reader.ReadToEnd()
        Write-Host "Response:" $body
    }
}
