# Yem Takvimi ile Otomatik Besleme Kurulumu

## Genel Bakış

Bu sistem, Arduino/ESP cihazlarının MAC adresi ile backend'e bağlanarak yem takvimini kontrol etmesini ve belirlenen saatlerde otomatik olarak servo motoru çalıştırmasını sağlar.

## Sistem Mimarisi

```
[Arduino/ESP Cihaz] 
    ↓ (MAC adresi ile)
[Backend API: /feed/check]
    ↓ (Veritabanı sorgusu)
[MySQL: devices + schedules + schedule_items]
    ↓ (Yanıt: shouldFeed: true/false)
[Arduino: Servo Motor Kontrolü]
```

## Kurulum Adımları

### 1. Backend Konfigürasyonu

Backend'de yeni endpoint otomatik olarak eklendi:
- **Endpoint:** `GET /feed/check?mac={MAC_ADDRESS}`
- **Yanıt:** JSON formatında yem zamanı bilgisi

**Örnek Yanıt:**
```json
{
  "shouldFeed": true,
  "mac": "AA:BB:CC:DD:EE:FF",
  "deviceId": 1,
  "deviceName": "Feeder-Demo",
  "currentTime": "08:00",
  "scheduleName": "Default",
  "amount": 100,
  "durationMs": 5000,
  "message": "Feeding time!"
}
```

### 2. Arduino Kodu Konfigürasyonu

Arduino kodunda aşağıdaki satırları kendi ağınıza göre düzenleyin:

```cpp
const char* BACKEND_HOST = "192.168.1.100";  // Backend sunucunuzun IP adresi
const int   BACKEND_PORT = 8080;              // Backend portu
```

**Önemli Parametreler:**
- `FEED_CHECK_INTERVAL_MS`: Yem kontrolü aralığı (varsayılan: 60000ms = 1 dakika)
- `LID_OPEN_DURATION_MS`: Kapak açık kalma süresi (varsayılan: 5000ms)

### 3. Veritabanı Yapısı

Sistem aşağıdaki tablolarla çalışır:

#### devices
- `id`: Cihaz ID
- `serial`: MAC adresi (örn: "AABBCCDDEEFF")
- `name`: Cihaz adı
- `active`: Aktif durumu (1/0)

#### schedules
- `id`: Takvim ID
- `device_id`: İlgili cihaz ID
- `name`: Takvim adı
- `enabled`: Aktif durumu (1/0)

#### schedule_items
- `id`: Öğe ID
- `schedule_id`: İlgili takvim ID
- `time`: Yem saati (HH:MM formatında, örn: "08:00")
- `amount`: Yem miktarı (gram)
- `duration_ms`: Kapak açık kalma süresi (opsiyonel)
- `enabled`: Aktif durumu (1/0)

### 4. Cihaz Kaydı

Yeni bir cihaz eklemek için frontend'den veya API üzerinden:

```bash
POST /devices
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "name": "Feeder-Bahçe",
  "serial": "AABBCCDDEEFF",
  "esp_host": "192.168.1.51",
  "esp_port": 80
}
```

**Not:** `serial` alanı MAC adresinin iki nokta üst üste olmadan yazılmış halidir.

### 5. Yem Takvimi Oluşturma

Frontend'den veya API üzerinden:

```bash
POST /devices/{deviceId}/schedules
Content-Type: application/json

{
  "name": "Günlük Besleme",
  "enabled": true,
  "items": [
    {
      "time": "08:00",
      "amount": 100,
      "duration_ms": 5000,
      "enabled": true
    },
    {
      "time": "14:00",
      "amount": 120,
      "duration_ms": 6000,
      "enabled": true
    },
    {
      "time": "20:00",
      "amount": 90,
      "duration_ms": 5000,
      "enabled": true
    }
  ]
}
```

## Çalışma Mantığı

1. **Arduino/ESP Başlatma:**
   - Cihaz WiFi'ye bağlanır
   - MAC adresini alır ve kaydeder
   - 10 saniye sonra ilk yem kontrolünü yapar

2. **Periyodik Kontrol:**
   - Her dakika backend'e MAC adresi ile istek gönderir
   - Backend, cihazı MAC adresi ile bulur
   - Şu anki saat ile eşleşen aktif bir schedule_item var mı kontrol eder

3. **Yem Zamanı Geldiğinde:**
   - Backend `shouldFeed: true` döner
   - Arduino servo motoru çalıştırır
   - Kapak açılır, belirlenen süre açık kalır
   - Otomatik olarak kapanır

4. **Loglama:**
   - Tüm işlemler Serial Monitor'de görüntülenir
   - `[FEED_CHECK]` prefix'i ile yem kontrolü logları izlenebilir

## Serial Monitor Çıktısı

```
[FEED_CHECK] İstek gönderiliyor: http://192.168.1.100:8080/feed/check?mac=AA:BB:CC:DD:EE:FF
[FEED_CHECK] HTTP Yanıt kodu: 200
[FEED_CHECK] Yanıt: {"shouldFeed":true,"mac":"AA:BB:CC:DD:EE:FF",...}
[FEED_CHECK] ✓ YEM ZAMANI! Kapak açılıyor...
[KAPAK] Açılma başlatıldı...
[KAPAK] Tamamen açıldı!
[KAPAK] Kapanma başlatıldı...
[KAPAK] Tamamen kapandı!
```

## Test Etme

### Manuel Test
1. Backend'i başlatın: `docker-compose up`
2. Arduino'yu yükleyin ve Serial Monitor'ü açın
3. Frontend'den bir schedule ekleyin (şu anki saate yakın bir zaman seçin)
4. Arduino'nun her dakika kontrol yaptığını Serial Monitor'den izleyin

### API Test
```bash
# MAC adresi ile kontrol
curl "http://localhost:8080/feed/check?mac=AABBCCDDEEFF"

# Yanıt:
# {"shouldFeed":false,"message":"No feeding scheduled for this time"}
# veya
# {"shouldFeed":true,"amount":100,"durationMs":5000,...}
```

## Sorun Giderme

### Arduino backend'e bağlanamıyor
- `BACKEND_HOST` ve `BACKEND_PORT` değerlerini kontrol edin
- Backend sunucusunun çalıştığından emin olun
- Arduino ve backend aynı ağda olmalı

### Cihaz bulunamıyor
- MAC adresi doğru kaydedilmiş mi kontrol edin
- Veritabanında `devices` tablosunda `serial` alanını kontrol edin
- MAC adresi formatı: "AABBCCDDEEFF" (iki nokta üst üste olmadan)

### Yem zamanı geldiğinde servo çalışmıyor
- `schedule_items` tablosunda `time` formatını kontrol edin (HH:MM)
- `enabled` alanının 1 olduğundan emin olun
- `schedules` tablosunda ilgili schedule'ın `enabled` olduğunu kontrol edin

### Servo her dakika çalışıyor
- Demo modu kaldırıldı, artık sadece takvime göre çalışır
- Eğer her dakika çalışıyorsa, schedule_items'da her dakika için kayıt var demektir

## Güvenlik Notları

- Backend API'si şu anda `/feed/check` endpoint'i için authentication gerektirmiyor
- Production ortamında bu endpoint'i güvenli hale getirin
- MAC adresi spoofing'e karşı ek güvenlik önlemleri alın
- HTTPS kullanımı önerilir

## Gelişmiş Özellikler

### Özel Açık Kalma Süresi
Her schedule_item için farklı `duration_ms` değeri belirleyebilirsiniz:
- Küçük hayvanlar için: 3000-5000ms
- Orta boy hayvanlar için: 5000-8000ms
- Büyük hayvanlar için: 8000-12000ms

### Çoklu Cihaz Yönetimi
- Her cihazın kendi MAC adresi ve schedule'ı vardır
- Frontend'den tüm cihazları merkezi olarak yönetebilirsiniz
- Her cihaz bağımsız olarak kendi takvimini kontrol eder

## Lisans

Bu proje Smart Pet Feeder projesinin bir parçasıdır.
