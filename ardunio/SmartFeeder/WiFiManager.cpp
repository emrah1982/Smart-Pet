#include "WiFiManager.h"

#if defined(ESP32)
  #include <WiFi.h>
  #include <Preferences.h>
#elif defined(ESP8266)
  #include <ESP8266WiFi.h>
  #include <EEPROM.h>
#endif

WiFiManager::WiFiManager() 
  : isConnected(false), lastScanTime(0), lastConnectAttempt(0) {
}

bool WiFiManager::begin() {
#if defined(ESP32)
  Preferences prefs;
  if (!prefs.begin(NVS_NAMESPACE, true)) {
    LOG("WiFiManager: Failed to open NVS");
    return false;
  }
  
  savedSSID = prefs.getString("wifiSSID", "");
  savedPassword = prefs.getString("wifiPass", "");
  prefs.end();
  
  if (savedSSID.length() > 0) {
    LOG("WiFiManager: Loaded credentials (ESP32) - SSID=%s", savedSSID.c_str());
    return true;
  }
#elif defined(ESP8266)
  EEPROM.begin(512);
  int addr = 0;
  
  // Read SSID length
  byte ssidLen = EEPROM.read(addr++);
  if (ssidLen > 0 && ssidLen <= 32) {
    char ssidBuf[33];
    for (int i = 0; i < ssidLen; i++) {
      ssidBuf[i] = EEPROM.read(addr++);
    }
    ssidBuf[ssidLen] = '\0';
    savedSSID = String(ssidBuf);
    
    // Read password length
    byte passLen = EEPROM.read(addr++);
    if (passLen > 0 && passLen <= 64) {
      char passBuf[65];
      for (int i = 0; i < passLen; i++) {
        passBuf[i] = EEPROM.read(addr++);
      }
      passBuf[passLen] = '\0';
      savedPassword = String(passBuf);
    }
  }
  
  EEPROM.end();
  
  if (savedSSID.length() > 0) {
    LOG("WiFiManager: Loaded credentials (ESP8266) - SSID=%s", savedSSID.c_str());
    return true;
  }
#endif
  
  LOG("WiFiManager: No saved credentials");
  return false;
}

bool WiFiManager::scanNetworks(String& jsonResult, String& errorMessage) {
  jsonResult = "[]";
  errorMessage = "";
  
  LOG("WiFiManager: Scanning networks...");
  
  // Don't change WiFi mode if already in AP_STA (AP is already running)
  // Just ensure we're ready to scan
  wifi_mode_t currentMode = WiFi.getMode();
  if (currentMode != WIFI_AP_STA) {
    LOG("WiFiManager: Switching to AP_STA mode for scan");
    WiFi.mode(WIFI_AP_STA);
    delay(100);
  } else {
    LOG("WiFiManager: Already in AP_STA mode");
    delay(50);
  }
  
  // Use synchronous scan (blocking) to ensure we get results
#if defined(ESP32)
  WiFi.scanDelete();
  LOG("WiFiManager: Starting synchronous scan...");
  int n = WiFi.scanNetworks(false, true);  // sync, show_hidden=true (like reference)
#else
  int n = WiFi.scanNetworks();
#endif
  
  LOG("WiFiManager: Scan completed with result: %d", n);
  
  // Retry once if nothing found
  if (n <= 0) {
    LOG("WiFiManager: No networks found, retrying...");
    delay(200);
#if defined(ESP32)
    WiFi.scanDelete();
    n = WiFi.scanNetworks(false, true);  // sync, show_hidden=true
#else
    n = WiFi.scanNetworks();
#endif
    LOG("WiFiManager: Rescan result: %d", n);
  }
  
  if (n < 0) {
    errorMessage = "Tarama başarısız (kod " + String(n) + ")";
    LOG("WiFiManager: Scan failed with error code: %d", n);
    return false;
  }
  
  if (n == 0) {
    errorMessage = "Hiç ağ bulunamadı. Modemin 2.4 GHz bandı açık mı?";
    LOG("WiFiManager: No networks detected. Check 2.4GHz band is enabled.");
    return false;
  }
  
  LOG("WiFiManager: Found %d networks", n);
  
  // Deduplicate and sort by RSSI - use heap to avoid stack overflow
  const int MAX_NETWORKS = 20;  // Reduced to save memory
  struct NetworkInfo {
    String ssid;
    int rssi;
    int channel;
    int encryption;
  };
  
  // Allocate on heap to avoid stack overflow
  NetworkInfo* networks = new NetworkInfo[MAX_NETWORKS];
  int count = 0;
  
  for (int i = 0; i < n && count < MAX_NETWORKS; i++) {
    String ssid = WiFi.SSID(i);
    if (ssid.length() == 0) continue;
    
    int rssi = WiFi.RSSI(i);
    int channel = WiFi.channel(i);
    int encryption = (int)WiFi.encryptionType(i);
    
    // Check for duplicate
    bool found = false;
    for (int j = 0; j < count; j++) {
      if (networks[j].ssid == ssid) {
        found = true;
        // Keep stronger signal
        if (rssi > networks[j].rssi) {
          networks[j].rssi = rssi;
          networks[j].channel = channel;
          networks[j].encryption = encryption;
        }
        break;
      }
    }
    
    if (!found) {
      networks[count].ssid = ssid;
      networks[count].rssi = rssi;
      networks[count].channel = channel;
      networks[count].encryption = encryption;
      count++;
    }
  }
  
  // Sort by RSSI (strongest first)
  for (int i = 0; i < count - 1; i++) {
    for (int j = i + 1; j < count; j++) {
      if (networks[j].rssi > networks[i].rssi) {
        NetworkInfo temp = networks[i];
        networks[i] = networks[j];
        networks[j] = temp;
      }
    }
  }
  
  // Build JSON response
  String json = "[";
  for (int i = 0; i < count; i++) {
    String ssid = networks[i].ssid;
    ssid.replace("\\", "\\\\");
    ssid.replace("\"", "\\\"");
    
    json += "{\"ssid\":\"" + ssid + "\"";
    json += ",\"rssi\":" + String(networks[i].rssi);
    json += ",\"ch\":" + String(networks[i].channel);
    json += ",\"enc\":" + String(networks[i].encryption);
    json += "}";
    
    if (i < count - 1) json += ",";
  }
  json += "]";
  
  // Clean up heap memory
  delete[] networks;
  
  lastScanTime = millis();
  jsonResult = json;
  return true;
}

bool WiFiManager::connect(const String& ssid, const String& password, uint32_t timeoutMs) {
  LOG("WiFiManager: Connecting to %s...", ssid.c_str());
  
  WiFi.disconnect(true);
  delay(200);
  
  // Keep AP running while connecting to STA so the user doesn't lose the portal
  WiFi.mode(WIFI_AP_STA);
  WiFi.begin(ssid.c_str(), password.c_str());
  delay(50);
  
  uint32_t startTime = millis();
  int lastStatus = -1;
  while (WiFi.status() != WL_CONNECTED && (millis() - startTime) < timeoutMs) {
    delay(500);
    int currentStatus = WiFi.status();
    if (currentStatus != lastStatus) {
      LOG("WiFiManager: Status changed to %d (0=IDLE, 1=NO_SSID, 3=CONNECTED, 4=FAILED, 6=DISCONNECTED)", currentStatus);
      lastStatus = currentStatus;
    }
  }
  
  int finalStatus = WiFi.status();
  LOG("WiFiManager: Connection attempt finished. Final status=%d", finalStatus);
  
  // Wait a bit more for DHCP to assign IP
  if (finalStatus == WL_CONNECTED) {
    delay(1000);
    LOG("WiFiManager: Waiting for IP assignment...");
    uint32_t ipWaitStart = millis();
    IPAddress ip;
    
    while ((ip = WiFi.localIP())[0] == 0 && (millis() - ipWaitStart) < 5000) {
      delay(500);
      LOG("WiFiManager: IP: %s", ip.toString().c_str());
    }
    
    if (ip[0] == 0) {
      LOG("WiFiManager: DHCP failed - no IP assigned");
      isConnected = false;
      return false;
    }
  }
  
  if (finalStatus == WL_CONNECTED) {
    isConnected = true;
    savedSSID = ssid;
    savedPassword = password;
    
    // Save credentials
#if defined(ESP32)
    Preferences prefs;
    if (prefs.begin(NVS_NAMESPACE, false)) {
      prefs.putString("wifiSSID", ssid);
      prefs.putString("wifiPass", password);
      prefs.end();
      LOG("WiFiManager: Credentials saved to NVS (ESP32)");
    } else {
      LOG("WiFiManager: WARNING - Failed to save credentials to NVS");
    }
#elif defined(ESP8266)
    EEPROM.begin(512);
    int addr = 0;
    
    // Write SSID
    byte ssidLen = ssid.length();
    if (ssidLen > 32) ssidLen = 32;
    EEPROM.write(addr++, ssidLen);
    for (int i = 0; i < ssidLen; i++) {
      EEPROM.write(addr++, ssid[i]);
    }
    
    // Write password
    byte passLen = password.length();
    if (passLen > 64) passLen = 64;
    EEPROM.write(addr++, passLen);
    for (int i = 0; i < passLen; i++) {
      EEPROM.write(addr++, password[i]);
    }
    
    EEPROM.commit();
    EEPROM.end();
    LOG("WiFiManager: Credentials saved to EEPROM (ESP8266)");
#endif
    
    LOG("WiFiManager: Connected! SSID=%s, IP=%s, RSSI=%d", 
        ssid.c_str(), WiFi.localIP().toString().c_str(), WiFi.RSSI());
    return true;
  }
  
  // Connection failed - provide detailed error
  const char* errorMsg = "Unknown error";
  switch(finalStatus) {
    case WL_NO_SSID_AVAIL:
      errorMsg = "SSID not found (network out of range or wrong name)";
      break;
    case WL_CONNECT_FAILED:
      errorMsg = "Wrong password or authentication failed";
      break;
    case WL_DISCONNECTED:
      errorMsg = "Disconnected (timeout or signal lost)";
      break;
    case WL_IDLE_STATUS:
      errorMsg = "Idle (connection not started)";
      break;
  }
  
  LOG("WiFiManager: Connection failed - %s (status=%d)", errorMsg, finalStatus);
  isConnected = false;
  return false;
}

bool WiFiManager::connectSaved() {
  if (savedSSID.length() == 0) {
    LOG("WiFiManager: No saved credentials");
    return false;
  }
  
  return connect(savedSSID, savedPassword);
}

void WiFiManager::disconnect() {
  WiFi.disconnect(true);
  isConnected = false;
  LOG("WiFiManager: Disconnected");
}

bool WiFiManager::hasCredentials() const {
  return savedSSID.length() > 0 && savedPassword.length() > 0;
}

String WiFiManager::getLocalIP() const {
  // Check actual WiFi status, not just manager state
  if (WiFi.status() == WL_CONNECTED) {
    IPAddress ip = WiFi.localIP();
    if (ip[0] != 0) {  // Valid IP check
      return ip.toString();
    }
  }
  return "0.0.0.0";
}

int WiFiManager::getRSSI() const {
  if (isConnected) {
    return WiFi.RSSI();
  }
  return 0;
}

void WiFiManager::maintain() {
  // Check connection status
  if (WiFi.status() == WL_CONNECTED) {
    if (!isConnected) {
      isConnected = true;
      LOG("WiFiManager: Connection restored - IP=%s", WiFi.localIP().toString().c_str());
    }
  } else {
    if (isConnected) {
      isConnected = false;
      LOG("WiFiManager: Connection lost");
    }
    
    // Try to reconnect if we have saved credentials
    if (savedSSID.length() > 0) {
      uint32_t now = millis();
      if (now - lastConnectAttempt > RECONNECT_INTERVAL) {
        lastConnectAttempt = now;
        LOG("WiFiManager: Attempting reconnect...");
        connectSaved();
      }
    }
  }
}

void WiFiManager::clearCredentials() {
#if defined(ESP32)
  Preferences prefs;
  if (prefs.begin(NVS_NAMESPACE, false)) {
    prefs.remove("wifiSSID");
    prefs.remove("wifiPass");
    prefs.end();
    LOG("WiFiManager: Credentials cleared from NVS (ESP32)");
  }
#elif defined(ESP8266)
  EEPROM.begin(512);
  // Clear first 100 bytes (SSID + password area)
  for (int i = 0; i < 100; i++) {
    EEPROM.write(i, 0);
  }
  EEPROM.commit();
  EEPROM.end();
  LOG("WiFiManager: Credentials cleared from EEPROM (ESP8266)");
#endif
  
  savedSSID = "";
  savedPassword = "";
  isConnected = false;
  
  LOG("WiFiManager: Memory cleared");
}
