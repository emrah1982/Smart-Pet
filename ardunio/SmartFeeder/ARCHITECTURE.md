# Smart Feeder - Mimari Dokümantasyonu

## 🏗️ Genel Mimari

```
┌─────────────────────────────────────────────────────────┐
│                    SmartFeeder.ino                      │
│                   (Ana Uygulama)                        │
└─────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ ModeManager  │    │ TimeManager  │    │ WebPortal    │
└──────────────┘    └──────────────┘    └──────────────┘
        │                   │                   │
        │                   ▼                   │
        │           ┌──────────────┐            │
        │           │   Offline    │            │
        │           │  Scheduler   │            │
        │           └──────────────┘            │
        │                   │                   │
        └───────────────────┼───────────────────┘
                            ▼
                    ┌──────────────┐
                    │    Servo     │
                    │  Controller  │
                    └──────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │ Servo Motor  │
                    │  (Hardware)  │
                    └──────────────┘
```

## 📦 Modül Detayları

### 1. Config.h
**Sorumluluk:** Global konfigürasyon ve veri yapıları

**İçerik:**
- Firmware versiyonu
- Debug ayarları
- Hardware pin tanımları
- Network ayarları
- Enum tanımları (OperationMode, SystemState, MotorState)
- Struct tanımları (FeedTime, ScheduleConfig, DeviceConfig)

**Bağımlılıklar:** Yok (temel modül)

---

### 2. ModeManager
**Sorumluluk:** Kullanıcı mod seçimi yönetimi

**Özellikler:**
- Mod seçimi (offline/online)
- NVS'e kaydetme/yükleme
- Mod durumu sorgulama

**API:**
```cpp
bool begin();                      // NVS'den yükle
bool setMode(OperationMode mode);  // Mod seç ve kaydet
OperationMode getMode();           // Mevcut modu al
bool isModeSelected();             // Seçim yapıldı mı?
void reset();                      // Fabrika ayarları
```

**Veri Akışı:**
```
User Input → WebPortal → ModeManager → NVS
                                    ↓
                            SmartFeeder.ino
```

---

### 3. ServoController
**Sorumluluk:** Servo motor kontrolü ve state machine

**State Machine:**
```
IDLE → OPENING → OPEN → CLOSING → IDLE
  ↑                                  │
  └──────────────────────────────────┘
```

**Özellikler:**
- V1 tarzı anında hareket (smooth yok)
- Açık kalma süresi kontrolü
- Emergency stop

**API:**
```cpp
bool begin();                    // Servo initialize
void tick();                     // State machine güncelle
void open(uint16_t angle);       // Kapağı aç
void close();                    // Kapağı kapat
void stop();                     // Acil durdur
MotorState getState();           // Durum sorgula
bool isIdle();                   // Boşta mı?
```

**Timing:**
```
open() → OPENING (instant) → OPEN (hold 3s) → CLOSING (instant) → IDLE
```

---

### 4. TimeManager
**Sorumluluk:** Zaman yönetimi ve senkronizasyon

**Özellikler:**
- Epoch tabanlı zaman tutma
- Timezone offset desteği
- NVS'e otomatik kayıt
- Elektrik kesintisinde kurtarma

**API:**
```cpp
bool begin();                              // NVS'den yükle
void setTime(uint32_t epoch, int32_t tz); // Zaman ayarla
uint32_t getLocalEpoch();                  // Yerel epoch al
uint8_t getDayOfWeek();                    // Gün (0=Paz)
uint16_t getMinuteOfDay();                 // Dakika (0-1439)
String getTimeString();                    // "Mon 16:23"
void save();                               // NVS'e kaydet
```

**Zaman Hesaplama:**
```
UTC Epoch + Timezone Offset = Local Epoch
1700000000 + (-180 * 60) = 1700010800

Local Epoch + (millis() - setAtMs) / 1000 = Current Epoch
```

---

### 5. OfflineScheduler
**Sorumluluk:** Besleme zamanlama mantığı

**Özellikler:**
- 8 adete kadar besleme zamanı
- Gün hariç tutma (0-6 bitmap)
- Tekrar besleme önleme
- Otomatik kayıt (her 10 dk)

**API:**
```cpp
bool begin();                                    // NVS'den yükle
void tick();                                     // Zamanlayıcı güncelle
void setFeedTimes(FeedTime* times, uint8_t n);  // Zamanları ayarla
void setExcludedDays(uint8_t bitmap);           // Günleri hariç tut
void setServoAngle(uint16_t angle);             // Servo açısı
void triggerManualFeed();                       // Manuel besleme
void saveConfig();                              // NVS'e kaydet
```

**Zamanlama Algoritması:**
```cpp
Her 250ms:
  1. Zaman set mi? → Hayır → Bekle
  2. Mevcut gün hariç mi? → Evet → Atla
  3. Mevcut dakika == Besleme zamanı? → Evet → Besle
  4. Daha önce beslendi mi? → Evet → Atla
  5. Servo boşta mı? → Evet → Besle
```

---

### 6. WebPortal
**Sorumluluk:** Web sunucusu ve API

**Özellikler:**
- Access Point (192.168.1.1)
- DNS Server (captive portal)
- RESTful API
- Responsive HTML UI

**Endpoints:**
```
GET  /                      → Mod seçim veya scheduler sayfası
POST /api/set-mode/         → Mod seçimi
POST /api/set-time/         → Zaman senkronizasyonu
POST /api/set-feed-times/   → Besleme zamanları
POST /api/set-servo-angle/  → Servo açısı
POST /api/set-hold/         → Açık kalma süresi
POST /api/test-feed/        → Manuel test
GET  /api/get-status/       → Durum bilgisi (JSON)
GET  /api/get-config/       → Konfigürasyon (JSON)
```

**Request Flow:**
```
Browser → DNS → WebServer → Handler → Module → NVS
                                    ↓
                                Response
```

---

### 7. WebPortalPages.h
**Sorumluluk:** HTML sayfaları

**Sayfalar:**
1. **MODE_SELECTION_PAGE**: İlk açılış mod seçimi
2. **SCHEDULER_PAGE**: Zamanlama arayüzü

**Özellikler:**
- Responsive design
- Dark mode desteği
- Minimal JavaScript
- Inline CSS (tek dosya)

---

## 🔄 Veri Akışı

### Başlangıç (Boot)
```
1. SmartFeeder.ino::setup()
   ↓
2. initializeHardware()
   ├─ ServoController::begin()
   └─ Servo motor initialize
   ↓
3. initializeModules()
   ├─ ModeManager::begin() → NVS'den mod yükle
   ├─ TimeManager::begin() → NVS'den zaman yükle
   ├─ OfflineScheduler::begin() → NVS'den config yükle
   └─ WebPortal::begin() → AP başlat, server başlat
   ↓
4. Mod seçilmiş mi?
   ├─ Hayır → STATE_MODE_SELECTION
   └─ Evet → STATE_READY
```

### Ana Döngü (Loop)
```
SmartFeeder.ino::loop()
├─ updateStateMachine()      // Durum geçişleri
├─ WebPortal::handleClient() // HTTP istekleri
├─ ServoController::tick()   // Servo state machine
└─ OfflineScheduler::tick()  // Zamanlama kontrolü
```

### Besleme Akışı
```
1. OfflineScheduler::tick()
   ├─ Zaman kontrolü
   ├─ Gün kontrolü
   └─ Besleme zamanı mı?
       ↓ Evet
2. OfflineScheduler::triggerManualFeed()
   ↓
3. ServoController::open(angle)
   ├─ state = MOTOR_OPENING
   └─ targetAngle = angle
       ↓
4. ServoController::tick()
   ├─ OPENING → moveToTarget() → OPEN
   ├─ OPEN → wait(holdMs) → CLOSING
   └─ CLOSING → moveToTarget() → IDLE
```

### Web Konfigürasyon Akışı
```
1. Kullanıcı web sayfasını açar
   ↓
2. Browser → GET / → WebPortal::handleRoot()
   ├─ Mod seçilmemiş → MODE_SELECTION_PAGE
   └─ Mod seçilmiş → SCHEDULER_PAGE
       ↓
3. Kullanıcı ayarları değiştirir
   ↓
4. Browser → POST /api/set-feed-times/
   ↓
5. WebPortal::handleSetFeedTimes()
   ├─ Parse times string
   ├─ Parse exclude bitmap
   └─ OfflineScheduler::setFeedTimes()
       ↓
6. OfflineScheduler::saveConfig()
   ↓
7. NVS'e kaydet
   ↓
8. Response → Browser (200 OK)
```

## 💾 NVS (Non-Volatile Storage) Yapısı

**Namespace:** `feeder`

**Keys:**
```
modeSelected    : bool     → Mod seçildi mi?
mode            : uint8_t  → OperationMode (1=offline, 2=online)
lastEpoch       : uint32_t → Son kaydedilen epoch
tzOffset        : int32_t  → Timezone offset (dakika)
timesCount      : uint8_t  → Besleme zamanı sayısı
t0_h, t0_m      : uint8_t  → 1. zaman (saat, dakika)
t1_h, t1_m      : uint8_t  → 2. zaman
...
t7_h, t7_m      : uint8_t  → 8. zaman
excludeBmp      : uint8_t  → Hariç tutulan günler (bitmap)
angle           : uint16_t → Servo açısı (0-180)
holdMs          : uint32_t → Açık kalma süresi (ms)
```

**Toplam Kullanım:** ~50 bytes

## 🔒 Thread Safety

**Not:** Arduino tek thread'li çalışır, ancak interrupt'lar için dikkat edilmeli.

**Güvenli Modüller:**
- ✅ ModeManager (sadece setup'ta yazılır)
- ✅ TimeManager (atomic okuma/yazma)
- ✅ ServoController (state machine)

**Dikkat Edilmesi Gerekenler:**
- ⚠️ NVS yazma işlemleri (sık yapılmamalı)
- ⚠️ Serial.println (buffer overflow)

## 📊 Bellek Kullanımı

**ESP32:**
- Flash: ~200 KB (program)
- SRAM: ~15 KB (runtime)
- NVS: ~50 bytes (config)

**ESP8266:**
- Flash: ~180 KB (program)
- SRAM: ~12 KB (runtime)
- EEPROM: Kullanılmıyor (NVS yok)

## 🧪 Test Senaryoları

### 1. İlk Açılış
```
✓ Mod seçim sayfası gösterilir
✓ Offline seçilir
✓ Zaman senkronize edilir
✓ Besleme zamanları girilir
✓ Kaydet butonuna basılır
✓ NVS'e kaydedilir
```

### 2. Elektrik Kesintisi
```
✓ Cihaz kapanır
✓ Cihaz açılır
✓ NVS'den mod yüklenir
✓ NVS'den zaman yüklenir
✓ NVS'den config yüklenir
✓ Scheduler çalışmaya devam eder
```

### 3. Besleme Zamanı
```
✓ Saat 08:00 olur
✓ Scheduler tetiklenir
✓ Servo açılır (90°)
✓ 3 saniye bekler
✓ Servo kapanır
✓ Tekrar besleme önlenir
```

### 4. Manuel Test
```
✓ Test Feed butonuna basılır
✓ API çağrılır
✓ Servo açılır
✓ Servo kapanır
✓ Log mesajları görülür
```

## 🚀 Performans

**Timing:**
- Scheduler tick: 250ms
- Servo tick: Her loop (~10ms)
- Web request: <100ms
- NVS write: <50ms
- NVS read: <10ms

**CPU Kullanımı:**
- Idle: ~5%
- Feeding: ~20%
- Web request: ~30%

## 🔮 Gelecek Geliştirmeler

### Online Mode
```cpp
class OnlineScheduler : public IScheduler {
  // WiFi provision
  // Backend API sync
  // MQTT messaging
  // OTA updates
};
```

### Factory Pattern
```cpp
IScheduler* scheduler = SchedulerFactory::create(mode);
```

### Dependency Injection
```cpp
class OfflineScheduler {
  ITimeProvider* timeProvider;
  IServoController* servoController;
  IStorage* storage;
};
```

---

**Son Güncelleme:** 18 Kasım 2025
**Versiyon:** 4.0.0
