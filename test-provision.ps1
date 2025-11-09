# Test provision endpoint
$loginUrl = "http://localhost:8082/auth/login"
$provisionUrl = "http://localhost:8082/devices/1/provision?ssid=secgem&pass=Secgem123"

Write-Host "Testing backend provision endpoint..."

# Login
$loginBody = @{
    email = "demo@example.com"
    password = "demo123"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri $loginUrl -Method POST -ContentType "application/json" -Body $loginBody
    $token = $loginResponse.token
    Write-Host "✓ Login successful, token: $($token.Substring(0,20))..."
    
    # Get provision
    $headers = @{
        Authorization = "Bearer $token"
    }
    
    $config = Invoke-RestMethod -Uri $provisionUrl -Headers $headers
    Write-Host "✓ Provision endpoint working!"
    Write-Host "`nConfig JSON:"
    $config | ConvertTo-Json -Depth 10
    
} catch {
    Write-Host "✗ Error: $_"
    if ($_.Exception.Response) {
        Write-Host "Status:" $_.Exception.Response.StatusCode.value__
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $body = $reader.ReadToEnd()
        Write-Host "Body:" $body
    }
}
