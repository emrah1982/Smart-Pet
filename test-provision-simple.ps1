# Simple test to provision endpoint
$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImVtYWlsIjoiZGVtb0BleGFtcGxlLmNvbSIsImlhdCI6MTc2MjUzODAzNiwiZXhwIjoxNzYzMTQyODM2fQ.DvjV2CBl67rLXJvUziaqyyLmXeVdebRDpMMNFJqjjpc"

try {
    $response = Invoke-WebRequest -Uri "http://localhost:8082/devices/1/provision?ssid=secgem&pass=Secgem123" -Headers @{"Authorization"="Bearer $token"}
    Write-Host "Status:" $response.StatusCode
    Write-Host "Content:"
    $response.Content
} catch {
    Write-Host "Error:" $_.Exception.Message
    if ($_.Exception.Response) {
        Write-Host "Status:" $_.Exception.Response.StatusCode.value__
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $body = $reader.ReadToEnd()
        Write-Host "Body:" $body
    }
}
