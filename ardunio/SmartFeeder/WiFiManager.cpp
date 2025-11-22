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
    LOG("WiFiManager: Loaded credentials - SSID=%s", savedSSID.c_str());
    return true;
  }
#endif
  
  LOG("WiFiManager: No saved credentials");
  return false;
}

String WiFiManager::scanNetworks() {
  LOG("WiFiManager: Scanning networks...");
  
  // Set to AP+STA mode for scanning
  WiFi.mode(WIFI_AP_STA);
  delay(50);
  
#if defined(ESP32)
  WiFi.scanDelete();
  int n = WiFi.scanNetworks(false, true);
#else
  int n = WiFi.scanNetworks();
#endif
  
  LOG("WiFiManager: Found %d networks", n);
  
  // Deduplicate and sort by RSSI
  const int MAX_NETWORKS = 30;
  struct NetworkInfo {
    String ssid;
    int rssi;
    int channel;
    int encryption;
  };
  
  NetworkInfo networks[MAX_NETWORKS];
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
  
  lastScanTime = millis();
  return json;
}

bool WiFiManager::connect(const String& ssid, const String& password, uint32_t timeoutMs) {
  LOG("WiFiManager: Connecting to %s...", ssid.c_str());
  
  WiFi.disconnect(true);
  delay(200);
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), password.c_str());
  
  uint32_t startTime = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - startTime) < timeoutMs) {
    delay(250);
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    isConnected = true;
    savedSSID = ssid;
    savedPassword = password;
    
    // Save to NVS
#if defined(ESP32)
    Preferences prefs;
    if (prefs.begin(NVS_NAMESPACE, false)) {
      prefs.putString("wifiSSID", ssid);
      prefs.putString("wifiPass", password);
      prefs.end();
    }
#endif
    
    LOG("WiFiManager: Connected! IP=%s, RSSI=%d", 
        WiFi.localIP().toString().c_str(), WiFi.RSSI());
    return true;
  }
  
  LOG("WiFiManager: Connection failed");
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

String WiFiManager::getLocalIP() const {
  if (isConnected) {
    return WiFi.localIP().toString();
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
      LOG("WiFiManager: Connection restored");
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
  }
#endif
  
  savedSSID = "";
  savedPassword = "";
  isConnected = false;
  
  LOG("WiFiManager: Credentials cleared");
}
