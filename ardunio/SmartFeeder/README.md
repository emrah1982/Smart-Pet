# Smart Pet Feeder - Professional Firmware v4.0.0

## 📋 Genel Bakış

Profesyonel, modüler mimaride yazılmış ESP32/ESP8266 tabanlı akıllı evcil hayvan besleyici firmware'i.

## ✨ Özellikler

- ✅ **Modüler Mimari**: Her modül bağımsız ve test edilebilir
- ✅ **Mod Seçimi**: İnternet ile veya internetsiz çalışma
- ✅ **Kalıcı Hafıza**: NVS ile tüm ayarlar korunur
- ✅ **Zaman Yönetimi**: Elektrik kesintisinde bile saat korunur
- ✅ **Esnek Zamanlama**: 8 adete kadar besleme zamanı
- ✅ **Web Arayüzü**: Kullanıcı dostu konfigürasyon
- ✅ **Servo Kontrolü**: Hassas açı kontrolü (0-180°)

## 📁 Dosya Yapısı

```
ardunio/
├── SmartFeeder.ino          # Ana program
├── Config.h                 # Global konfigürasyon
├── ModeManager.h/cpp        # Mod yönetimi
├── ServoController.h/cpp    # Servo motor kontrolü
├── TimeManager.h/cpp        # Zaman yönetimi
├── OfflineScheduler.h/cpp   # Besleme zamanlayıcı
├── WebPortal.h/cpp          # Web sunucusu
├── WebPortalPages.h         # HTML sayfaları
└── README.md                # Bu dosya
```

## 🚀 Kurulum

### Gereksinimler

**Donanım:**
- ESP32 veya ESP8266
- Servo motor (SG90 veya benzeri)
- 5V güç kaynağı

**Yazılım:**
- Arduino IDE 1.8.x veya üzeri
- ESP32/ESP8266 board desteği

**Kütüphaneler:**
- ESP32Servo (ESP32 için)
- Servo (ESP8266 için)

### Adımlar

1. **Arduino IDE'yi Aç**

2. **Board'u Seç**
   - ESP32: `Tools > Board > ESP32 Dev Module`
   - ESP8266: `Tools > Board > NodeMCU 1.0`

3. **Port'u Seç**
   - `Tools > Port > COM3` (sizin portunuz)

4. **Tüm Dosyaları Aynı Klasöre Koy**
   ```
   SmartFeeder/
   ├── SmartFeeder.ino
   ├── Config.h
   ├── ModeManager.h
   ├── ModeManager.cpp
   └── ... (diğer dosyalar)
   ```

5. **Upload Et**
   - `Sketch > Upload` (Ctrl+U)

## 📱 Kullanım

### İlk Kurulum

1. **Cihazı Açın**
   - Serial Monitor'ü açın (115200 baud)
   - Boot mesajlarını görün

2. **WiFi'ye Bağlanın**
   - Telefonunuzdan `Feeder_AP` ağına bağlanın
   - Şifre: `fEEd_ME.199!`

3. **Tarayıcı Açılacak**
   - Otomatik açılmazsa: `http://192.168.1.1`

4. **Mod Seçin**
   - **İnternet OLMADAN**: Sadece zamanlayıcı (offline)
   - **İnternet İLE**: WiFi'ye bağlan (online)

5. **Zamanı Senkronize Edin**
   - "Sync Time Now" butonuna basın
   - Tarayıcı saati cihaza aktarılır

6. **Besleme Zamanlarını Ayarlayın**
   - Saat seçin (örn: 08:00)
   - "Add" butonuna basın
   - İstediğiniz kadar zaman ekleyin

7. **Servo Açısını Ayarlayın**
   - Slider ile 0-180° arası seçin
   - 90° = Orta açık
   - 180° = Tam açık

### 📖 Kullanım Senaryoları

#### **Senaryo 1: Offline Mod (İnternet Olmadan)**
Evde interneti olan yerde zamanlama yapıp, sonra internetsiz yere götürmek

1. **Evde (Telefonla Ayarla):**
   - Cihazı aç, `Feeder_AP` ağına bağlan
   - **"İnternet OLMADAN"** modunu seç
   - Zamanı senkronize et (telefondan)
   - Zamanlama yap: 08:00, 18:00
   - "Save Schedule" bas ✅

2. **Cihazı Taşı (İnternet Yok):**
   - Cihazı kapat
   - İnternetsiz yere götür (bahçe, köy evi)
   - Cihazı aç
   - **Tüm ayarlar korundu!** 🎉
   - Zamanlama çalışmaya devam eder

#### **Senaryo 2: Online Mod (İnternet İle)**
Ev WiFi'sine bağlanıp backend sunucuyla çalışmak

1. **Mod Seçimi:**
   - Cihazı aç, `Feeder_AP` ağına bağlan
   - **"İnternet İLE"** modunu seç

2. **WiFi Bağlantısı:**
   - WiFi tarama sayfası açılır
   - Ev WiFi ağını seç (sinyal gücüne göre sıralı)
   - Şifre gir ve "Kaydet ve Bağlan"
   - Cihaz WiFi'ye bağlanır ✅

3. **Backend Bağlantısı:**
   - Cihaz otomatik olarak backend sunucuya bağlanır
   - MAC adresi ile cihaz tanımlanır
   - Backend'den zamanlama kontrolü yapılır
   - Her 60 saniyede bir `/feed/check` endpoint'i kontrol edilir

4. **Zamanlama:**
   - Backend sunucu zamanlama kararını verir
   - Cihaz backend'den gelen komutları uygular
   - Besleme olayları backend'e loglanır

5. **Mod Değiştirmek İstersen:**
   - `Feeder_AP` ağına bağlan
   - `http://192.168.1.1` aç
   - **"🔄 Change Mode"** butonuna bas
   - Zamanlama ayarların korunur!

8. **Kaydedin**
   - "Save Schedule" butonuna basın
   - Tüm ayarlar NVS'e kaydedilir

### Test

- **Test Feed** butonuna basın
- Servo açılıp kapanmalı
- Serial Monitor'de logları görün

### Elektrik Kesintisi

- Cihaz yeniden açıldığında:
  - ✅ Mod seçimi korunur
  - ✅ Besleme zamanları korunur
  - ✅ Saat korunur (max 10 dk kayıp)
  - ✅ Servo ayarları korunur

## 🔧 Konfigürasyon

### Config.h Ayarları

```cpp
// Servo Pinleri
#define SERVO_PIN_ESP32     18
#define SERVO_PIN_ESP8266   14

// Servo Pozisyonları
#define SERVO_CLOSED_US     1000  // Kapalı pozisyon
#define SERVO_OPEN_US       1700  // Açık pozisyon

// Zamanlama
#define OPEN_HOLD_MS        3000  // Açık kalma süresi (3 sn)
#define AUTO_SAVE_INTERVAL  10    // Otomatik kayıt (10 dk)

// WiFi AP
#define AP_SSID             "Feeder_AP"
#define AP_PASSWORD         "fEEd_ME.199!"
```

## 📊 Serial Monitor Çıktısı

```
============================================
   SMART PET FEEDER - Professional v4.0.0
   Build: Nov 18 2025 20:50:00
============================================
Platform: ESP32
Chip ID: 12345678
Free Heap: 280000 bytes
============================================
[1234] Initializing hardware...
[1245] ServoController: Initialized on pin 18
[1250] Hardware initialized successfully
[1255] Initializing modules...
[1260] ModeManager: Loaded mode=OFFLINE, selected=YES
[1265] TimeManager: Time restored from NVS - epoch=1700010800, tz=-180
[1270] TimeManager: Restored time: Mon 16:23
[1275] OfflineScheduler: Config loaded - 2 times, angle=90°, hold=3000 ms
[1280] WebPortal: AP started - SSID=Feeder_AP, IP=192.168.1.1
[1285] WebPortal: Server started on http://192.168.1.1
[1290] All modules initialized successfully
============================================
*** CLOCK: Mon 16:23 ***
Scheduled feeds: 2 times
  - 08:00
  - 18:00
============================================
```

## 🐛 Hata Ayıklama

### Servo Çalışmıyor

1. Pin kontrolü yapın (`Config.h`)
2. Güç kaynağını kontrol edin (5V, min 1A)
3. Serial Monitor'de hata mesajlarını kontrol edin

### WiFi Bağlanamıyor

1. SSID ve şifreyi kontrol edin
2. Cihazı yeniden başlatın
3. Telefonun WiFi ayarlarını sıfırlayın

### Zaman Senkronize Olmuyor

1. Tarayıcı saatinin doğru olduğundan emin olun
2. "Sync Time Now" butonuna tekrar basın
3. Serial Monitor'de hata mesajlarını kontrol edin

### Besleme Zamanında Çalışmıyor

1. Zamanın senkronize olduğunu kontrol edin
2. Besleme zamanlarının doğru girildiğini kontrol edin
3. Gün hariç tutma ayarlarını kontrol edin
4. Serial Monitor'de "CLOCK TICK" mesajlarını izleyin

### Mod Seçim Sayfası Gelmiyor

**Sorun:** `http://192.168.1.1` adresine gidince direkt scheduler sayfası açılıyor, mod seçim sayfası gelmiyor.

**Neden:** Daha önce bir mod seçilmiş ve NVS'ye kaydedilmiş. Cihaz her açıldığında bu modu hatırlıyor.

**Çözüm:**
1. Serial Monitor'ü açın (115200 baud)
2. `RESET` yazıp Enter'a basın
3. Cihaz tüm ayarları silip yeniden başlayacak
4. Tekrar `http://192.168.1.1` adresine gidin
5. Şimdi mod seçim sayfası gelecek ✅

**Alternatif:** Kodu yeniden yükleyin (Upload)

### Mod Değiştirmek İstiyorum

**Soru:** Offline modundayım, online moda geçmek istiyorum (veya tam tersi). **Ama zamanlama ayarlarımı kaybetmek istemiyorum!**

**✅ Çözüm (Zamanlama Korunur):**
1. `http://192.168.1.1` adresine git
2. Sayfanın en altında **"🔄 Change Mode (Keep Schedule)"** butonuna bas
3. Onay ver
4. Cihaz yeniden başlayacak
5. Mod seçim sayfası gelecek
6. Yeni modu seç
7. **Zamanlama ayarların ve saat ayarın korundu!** ✅

**⚠️ Alternatif: Her Şeyi Sıfırla**
- Eğer zamanlama ayarlarını da silmek istiyorsan
- **"⚠️ Factory Reset (Erase All)"** butonuna bas
- Tüm veriler silinecek

### Serial Komutlar

- `RESET` - Fabrika ayarlarına dön (tüm NVS verilerini sil)
- `STATUS` - Sistem durumunu göster

## 📝 API Endpoints

### POST /api/set-mode/
Mod seçimi
```
mode=offline  veya  mode=online
```

### POST /api/set-time/
Zaman senkronizasyonu
```
epoch=1700000000&tz=-180
```

### POST /api/set-feed-times/
Besleme zamanları
```
times=08:00,18:00&exclude=0,6
```

### POST /api/set-servo-angle/
Servo açısı
```
angle=90
```

### POST /api/set-hold/
Açık kalma süresi
```
hold=3
```

### POST /api/test-feed/
Manuel besleme testi
```
(parametre yok)
```

### POST /api/change-mode/
Mod seçimini sıfırla (zamanlama ve saat korunur)
```
(parametre yok)
```

### POST /api/factory-reset/
Fabrika ayarlarına dön (tüm ayarları sil ve yeniden başlat)
```
(parametre yok)
```

### GET /api/wifi-scan/
WiFi ağlarını tara (online mod)
```json
[
  {"ssid":"MyWiFi","rssi":-45,"ch":6,"enc":3},
  {"ssid":"Neighbor","rssi":-67,"ch":11,"enc":3}
]
```

### POST /api/wifi-connect/
WiFi'ye bağlan (online mod)
```
ssid=MyWiFi&pass=password123
```

### GET /api/wifi-status/
WiFi durumu (online mod)
```json
{
  "connected": true,
  "ssid": "MyWiFi",
  "ip": "192.168.1.100",
  "rssi": -45
}
```

## 🌐 Backend API (Online Mode)

### GET /feed/check
Backend sunucudan zamanlama kontrolü (cihaz tarafından çağrılır)
```
Query params:
  mac=AA:BB:CC:DD:EE:FF
  tzOffsetMin=180

Response:
{
  "shouldFeed": true,
  "durationMs": 5000
}
```

### POST /logs/ingest
Cihazdan backend'e log gönderimi
```
Query params:
  mac=AA:BB:CC:DD:EE:FF

Body:
{
  "level": "info",
  "message": "Feeding triggered by backend",
  "meta": {"duration_ms": 5000, "source": "backend"}
}
```

**Backend Konfigürasyonu:**
- Host: `BACKEND_HOST` (Config.h'de tanımlı, varsayılan: 192.168.1.100)
- Port: `BACKEND_PORT` (Config.h'de tanımlı, varsayılan: 8082)
- MAC adresi otomatik alınır ve her istekte gönderilir

### GET /api/get-status/
Durum bilgisi
```json
{
  "time": "Mon 16:23"
}
```

### GET /api/get-config/
Konfigürasyon
```json
{
  "times": "08:00,18:00",
  "exclude": "0,6",
  "angle": 90,
  "hold": 3
}
```

## 🔒 Güvenlik

- WiFi AP şifresi varsayılan olarak `fEEd_ME.199!`
- Değiştirmek için `Config.h` içinde `AP_PASSWORD` düzenleyin
- Cihaz sadece yerel ağda erişilebilir (192.168.1.1)

## 📈 Gelecek Özellikler

- [ ] Online mod implementasyonu (WiFi provision)
- [ ] Backend API entegrasyonu
- [ ] OTA (Over-The-Air) güncelleme
- [ ] MQTT desteği
- [ ] Mobil uygulama
- [ ] Besleme geçmişi kayıtları
- [ ] Düşük yem seviyesi uyarısı

## 🤝 Katkıda Bulunma

Bu proje modüler yapıda tasarlanmıştır. Yeni özellikler eklemek için:

1. Yeni bir modül oluşturun (örn: `OnlineScheduler.h/cpp`)
2. `Config.h` içine gerekli ayarları ekleyin
3. `SmartFeeder.ino` içinde modülü initialize edin
4. Test edin ve dokümante edin

## 📄 Lisans

Bu proje eğitim amaçlıdır.

## 👨‍💻 Geliştirici

Smart Pet Feeder Professional Firmware v4.0.0

---

**Not:** Bu firmware profesyonel yazılım geliştirme prensipleriyle yazılmıştır:
- Modüler mimari
- Separation of concerns
- SOLID prensipleri
- Clean code
- Dokümantasyon
