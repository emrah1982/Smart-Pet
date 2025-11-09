# Test config.json download
$loginUrl = "http://localhost:8082/auth/login"
$configUrl = "http://localhost:8082/devices/1/config.json?ssid=secgem&pass=Secgem123"

# Login and get token
$loginBody = @{
    email = "demo@example.com"
    password = "demo123"
} | ConvertTo-Json

$loginResponse = Invoke-RestMethod -Uri $loginUrl -Method POST -ContentType "application/json" -Body $loginBody
$token = $loginResponse.token

Write-Host "Token: $token"

# Get config.json
$headers = @{
    Authorization = "Bearer $token"
}

try {
    $config = Invoke-RestMethod -Uri $configUrl -Headers $headers
    Write-Host "`nConfig JSON:"
    $config | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Error: $_"
    Write-Host "StatusCode:" $_.Exception.Response.StatusCode.value__
}
