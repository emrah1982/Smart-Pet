# WiFi & Backend Implementation for Online Mode

## Overview
WiFi scanning, connection, and backend API integration have been added to the Smart Pet Feeder project for **online mode** operation. This includes:
- WiFi network scanning and connection
- Backend server communication
- MAC address-based device identification
- Remote feed scheduling
- Event logging to backend

## New Files Added

### 1. WiFiManager.h / WiFiManager.cpp
- Handles WiFi network scanning
- Manages WiFi connection and credentials
- Stores credentials in NVS (ESP32 Preferences)
- Auto-reconnection on connection loss
- Platform-specific implementation (ESP32/ESP8266)

**Key Methods:**
- `scanNetworks()` - Scans and returns WiFi networks as JSON
- `connect(ssid, password)` - Connects to specified network
- `connectSaved()` - Connects using saved credentials
- `maintain()` - Maintains connection (call in loop)
- `clearCredentials()` - Clears saved WiFi credentials

### 2. BackendClient.h / BackendClient.cpp
- Communicates with remote backend server
- MAC address-based device identification
- Feed schedule checking from backend
- Event logging to backend
- HTTP GET/POST operations
- Request throttling

**Key Methods:**
- `begin(host, port)` - Initialize with backend server details
- `checkFeedSchedule(durationMs)` - Check if should feed now
- `sendLog(level, message, metaJson)` - Send log event to backend
- `getMacAddress()` - Get device MAC address

## Modified Files

### 1. WebPortalPages.h
Added `WIFI_SETUP_PAGE` - Compact WiFi setup interface with:
- Network scanning with RSSI display
- Manual SSID entry for hidden networks
- Password input
- Connection status display
- Responsive design with dark mode support

### 2. WebPortal.h / WebPortal.cpp
Added WiFi-related endpoints:
- `GET /api/wifi-scan/` - Returns available networks as JSON
- `POST /api/wifi-connect/` - Connects to specified network
- `GET /api/wifi-status/` - Returns current WiFi status

Updated `handleRoot()` to show WiFi setup page when in online mode but not connected.

### 3. SmartFeeder.ino
- Added WiFiManager instance
- Initialize WiFiManager in online mode
- Call `wifiManager.maintain()` in loop for auto-reconnection
- Attempt connection with saved credentials on boot

## User Flow - Online Mode

1. **Select Mode**
   - User connects to `Feeder_AP`
   - Selects "Internet İLE" (online mode)

2. **WiFi Setup**
   - WiFi setup page automatically appears
   - Networks are scanned and displayed (sorted by signal strength)
   - User selects network or enters SSID manually
   - Enters password and clicks "Bağlan"

3. **Connection**
   - Device attempts to connect (20 second timeout)
   - On success: Credentials saved to NVS, redirects to scheduler
   - On failure: Error message displayed, can retry

4. **Persistent Connection**
   - Credentials stored in NVS
   - On next boot, automatically connects to saved network
   - Auto-reconnection if connection is lost

## Memory Usage

**Total Code Size:** ~69 KB
- Config.h: 3.4 KB
- ModeManager: 3.1 KB
- ServoController: 4.7 KB
- TimeManager: 5.5 KB
- OfflineScheduler: 9.0 KB
- **WiFiManager: 7.6 KB** ⭐ NEW
- WebPortal: 13.2 KB
- WebPortalPages: 15.7 KB
- SmartFeeder.ino: 8.8 KB

**WiFi Setup Page:** Compressed to ~1.5 KB (minified HTML/CSS/JS)

## Technical Details

### Network Scanning
- Deduplicates SSIDs (keeps strongest signal)
- Sorts by RSSI (strongest first)
- Returns up to 30 networks
- Includes RSSI, channel, and encryption type
- Caches results for 30 seconds

### Connection Management
- 20 second connection timeout
- Auto-reconnection every 60 seconds if disconnected
- Credentials stored in NVS namespace
- Compatible with ESP32 and ESP8266

### API Response Format

**WiFi Scan:**
```json
[
  {"ssid":"MyWiFi","rssi":-45,"ch":6,"enc":3},
  {"ssid":"Neighbor","rssi":-67,"ch":11,"enc":3}
]
```

**WiFi Status:**
```json
{
  "connected": true,
  "ssid": "MyWiFi",
  "ip": "192.168.1.100",
  "rssi": -45
}
```

## Offline Mode
**Important:** WiFi functionality is **ONLY** active in online mode. Offline mode remains completely unchanged and does not use WiFiManager.

## Testing Checklist

- [ ] Compile for ESP32 d1_uno32 board
- [ ] Verify memory usage is within limits
- [ ] Test mode selection (online)
- [ ] Test WiFi scanning
- [ ] Test WiFi connection with valid credentials
- [ ] Test WiFi connection with invalid credentials
- [ ] Test manual SSID entry
- [ ] Test auto-reconnection on connection loss
- [ ] Test credential persistence after reboot
- [ ] Verify offline mode is unaffected

## Notes

- WiFi setup page uses minified HTML/CSS/JS to save memory
- Dark mode support included
- Mobile-responsive design
- All WiFi operations are non-blocking
- Compatible with both ESP32 and ESP8266 platforms
