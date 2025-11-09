# Smart Pet Feeder (React + Docker)

WeMos D1 (ESP8266) tabanlı akıllı mama sistemi için React arayüzü ve Docker tabanlı kurulum. UI; Config Service üzerinden MySQL'de tutulan ESP hedefine (/api/*) reverse proxy yapar.

## 🚀 Özellikler
- Vite + React + TypeScript + Tailwind arayüz
- Login (JWT) ve yetkili istekler (Authorization: Bearer)
- Ayarlar paneli: Genel, Yem Takvimi, Pin Haritası ve "Cihaz Yönetimi" sekmesi
- Header'da "Cihaz Ekle" modal (opsiyonel) ve cihaz seçimi
- Config Service (Node/Express): MySQL, auth, cihaz CRUD, pin seed, reverse proxy
- Docker Compose ile geliştirme ve prod ortamı
- Nginx ile prod static serve + /auth ve /api reverse proxy

## 📁 Proje Yapısı
```
project-root/
├─ src/
│  ├─ App.tsx
│  ├─ FeederUI.tsx
│  ├─ index.css
│  └─ main.tsx
├─ config-service/
│  ├─ Dockerfile
│  ├─ package.json
│  ├─ tsconfig.json
│  └─ src/index.ts
├─ db/
│  └─ init.sql
├─ Dockerfile            # Prod (build + Nginx)
├─ Dockerfile.dev        # Dev (Vite)
├─ docker-compose.yml
├─ index.html
├─ nginx.conf
├─ package.json          # UI
├─ postcss.config.js
├─ tailwind.config.js
├─ tsconfig.json         # UI
├─ vite.config.ts
└─ README.md
```

## 🧩 Bağımlılıklar (UI)
- react, react-dom, lucide-react
- vite, typescript, @vitejs/plugin-react
- tailwindcss, postcss, autoprefixer

UI'da iki tip endpoint vardır:

- Backend (DB/iş mantığı):
  - `POST /auth/login` → JWT al
  - `GET /devices` → Kullanıcının cihazları (token gerekir)
  - `POST /devices` → Yeni cihaz ekle (token gerekir)
  - `GET /devices/:id/settings`, `PUT /devices/:id/settings`
  - `GET /devices/:id/schedules`, `POST/PUT/DELETE /devices/:id/schedules...`
  - `GET /devices/:id/pins`, `POST /devices/:id/pins`, `POST /devices/:id/pins/seed`
  - `GET /config/settings`, `POST /config/settings`

- ESP (proxy ile cihaz API'si):
  - `/api/status`, `/api/settings`, `/api/feed`, `/api/tare`, `/api/cal`, ...
  - Not: ESP çevrimdışı ise bu çağrılar 504 (Gateway Timeout) dönebilir.

## 🛠️ Geliştirme Ortamı (Docker)
1) Servisleri başlatın:
```
docker compose up -d mysql
docker compose up -d config-service
docker compose up -d ui-dev
```
2) UI (dev): http://localhost:5173

Vite proxy → `http://config-service:8080` (Docker içi) / lokal için `http://localhost:8082`
 - `/devices`, `/config`, `/auth` istekleri backend'e gider
 - `/api/*` istekleri cihazın ESP host'una yönlenir

3) phpMyAdmin (DB UI): http://localhost:8091
 - Server: `mysql`
 - User: `feeder` | Password: `feeder_pass`
 - Database: `feeder_db`
 - Alternatif root: user `root` | pass `root_pass`

## 🏭 Prod Ortam (Docker)
1) Build ve çalıştır:
```
docker compose up -d --build mysql config-service ui
```
2) UI (Nginx): http://localhost:8088

Nginx proxy:
- `/auth/*` → `config-service:8080/auth/*`
- `/api/*` → `config-service:8080/api/*`

## 🗄️ Veritabanı (MySQL)
- Şema `db/init.sql` ile oluşur.
- `settings` tablosu ESP hedefini tutar:
```
settings(id, esp_host VARCHAR(255), esp_port INT, updated_at TIMESTAMP)
```
- Varsayılan kayıt: `192.168.1.50:80`

### Cihaz Modeli ve Seed
- `devices` tablosunda `model` kolonu vardır. Varsayılan: `esp8266_wemos_d1`.
- Örnek RPi cihazı: `Feeder-RPi` (`raspberry_pi_zero_w`).
- Pin seed endpoint’i modele duyarlıdır:
  - `POST /devices/:id/pins/seed` → Cihazın `model` alanına göre uygun modül+pin seti ekler.
  - Modeller: `esp8266_wemos_d1`, `raspberry_pi_zero_w`.

ESP hedefini güncelleme (Config Service HTTP):
```
POST http://localhost:8080/config/settings
Content-Type: application/json
{
  "esp_host": "192.168.1.60",
  "esp_port": 80
}
```

Son kayıt otomatik kullanılır. UI'daki `/api/*` istekleri bu hedefe yönlenir.
ESP ulaşılmazsa `/api/*` çağrıları 504 dönebilir (normal davranış).

## 🌐 Config Service (Node/Express)
- Auth:
  - `POST /auth/login` → { token, user }
- Devices (korumalı):
  - `GET /devices` → Kullanıcının cihazları
  - `POST /devices` → Cihaz ekle (name, serial?, esp_host, esp_port)
  - `GET /devices/:id/settings`, `PUT /devices/:id/settings`
  - `GET /devices/:id/schedules`, `POST/PUT/DELETE /devices/:id/schedules...`
  - `GET /devices/:id/pins`, `POST /devices/:id/pins`, `POST /devices/:id/pins/seed`
- Genel ayarlar:
  - `GET /config/settings`, `POST /config/settings`
- Proxy:
  - `ANY /api/:deviceId/*` → İlgili cihazın ESP host'una reverse proxy
  - `ANY /api/*` (legacy)   → Son settings kaydındaki ESP'ye reverse proxy

### Pin Haritası Kullanımı (UI)
- Sekme: Ayarlar → Pin Haritası
- Cihaz seçili olmalı.
- “Örnekleri Yükle” → modele uygun seed ekler.
- Satır bazlı düzenleme:
  - “Düzenle” → tek satır input’a dönüşür, pinlerde “+ Pin Ekle / Sil”.
  - “Kaydet/İptal” yalnız o satırı etkiler. Backend’e `POST /devices/:id/pins { modules: [row] }` gönderilir.

Env değişkenleri (docker-compose ile set edilir):
- `DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME`
- `FALLBACK_ESP_HOST, FALLBACK_ESP_PORT`

## 🔧 Ortam Değerleri (UI)
- `VITE_CONFIG_API` (dev): Vite proxy hedefi (compose içinde `http://config-service:8080`, lokal test `http://localhost:8082`)
  - Vite config varsayılan hedef: `http://localhost:8082`
  - Proxy yolları: `/devices`, `/config`, `/auth`, `/api`

## 🧪 Hızlı Test
- UI dev: http://localhost:5173
- Prod UI: http://localhost:8088
- Config Service: http://localhost:8082 (host), docker ağı içinde 8080
  - `POST /auth/login` { email: "demo@example.com", password: "demo123" }
  - `GET /devices` (Authorization: Bearer <token>)
  - `POST /devices` (Authorization: Bearer <token>)
  - `POST /devices/1/pins/seed`  (model-aware seed)

## 🧯 Sorun Giderme
- UI açılmıyor → UI container loglarına bakın (`docker compose logs -f ui-dev`)
- /api çağrıları 504 veriyor → ESP host ulaşılabilir değil (cihaz offline olabilir), bu normaldir
- Backend 401 → Login yapın; token'ı header'a ekleyin
- MySQL bağlantısı → `docker compose logs -f mysql` ve healthcheck durumunu doğrulayın
- ESP'ye erişim yok → `settings` tablosundaki `esp_host/esp_port` doğru mu, cihaz ağa bağlı mı?
- Port çakışması → `docker-compose.yml`'de map edilen portları değiştirin.

### Restart
```
docker compose restart
```

## 🔐 Güvenlik
- Prod ortamda Config Service'e basit bir token koruması eklenebilir.
- Nginx üzerinden rate limit/proxy ayarları sıkılaştırılabilir.

## 📜 Lisans
Bu proje eğitim/POC amaçlıdır.
