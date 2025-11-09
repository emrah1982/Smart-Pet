# Test login directly to backend
$body = @{
    email = "demo@example.com"
    password = "demo123"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "http://localhost:8082/auth/login" -Method POST -ContentType "application/json" -Body $body
    Write-Host "Success! Status:" $response.StatusCode
    $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Error! Status:" $_.Exception.Response.StatusCode.value__
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $body = $reader.ReadToEnd()
    Write-Host "Response:" $body
}
