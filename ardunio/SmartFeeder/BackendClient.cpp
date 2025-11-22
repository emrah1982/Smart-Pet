#include "BackendClient.h"

#if defined(ESP32)
  #include <WiFi.h>
  #include <HTTPClient.h>
  #include <Preferences.h>
#elif defined(ESP8266)
  #include <ESP8266WiFi.h>
  #include <ESP8266HTTPClient.h>
  #include <EEPROM.h>
#endif

BackendClient::BackendClient() 
  : backendPort(0)
  , useHttps(false)
  , timezoneOffset(0)
  , lastFeedCheck(0)
  , lastLogSent(0)
  , lastScheduleSync(0) {
  
  // Get MAC address
#if defined(ESP32)
  macAddress = WiFi.macAddress();
#elif defined(ESP8266)
  macAddress = WiFi.macAddress();
#endif
  
  LOG("BackendClient: MAC Address = %s", macAddress.c_str());
}

void BackendClient::begin(const String& host, uint16_t port, const String& token, bool https) {
  backendHost = host;
  backendPort = port;
  authToken = token;
  useHttps = https;
  LOG("BackendClient: Configured - %s://%s:%d (Token: %s)", 
      https ? "https" : "http", host.c_str(), port, 
      token.length() > 0 ? "Set" : "Not Set");
}

void BackendClient::setTimezoneOffset(int offsetMinutes) {
  timezoneOffset = offsetMinutes;
}

bool BackendClient::httpGet(const String& endpoint, String& response) {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }
  
  WiFiClient client;
  HTTPClient http;
  
  String protocol = useHttps ? "https://" : "http://";
  String url = protocol + backendHost + ":" + String(backendPort) + endpoint;
  
  http.setTimeout(5000);
  if (!http.begin(client, url)) {
    LOG("BackendClient: HTTP begin failed");
    return false;
  }
  
  // Add Authorization header
  if (authToken.length() > 0) {
    http.addHeader("Authorization", "Bearer " + authToken);
  }
  // Add MAC address header
  http.addHeader("X-Device-Mac", macAddress);
  
  int httpCode = http.GET();
  
  if (httpCode == 200) {
    response = http.getString();
    http.end();
    return true;
  }
  
  LOG("BackendClient: GET failed - code %d", httpCode);
  http.end();
  return false;
}

bool BackendClient::httpPost(const String& endpoint, const String& body) {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }
  
  WiFiClient client;
  HTTPClient http;
  
  String protocol = useHttps ? "https://" : "http://";
  String url = protocol + backendHost + ":" + String(backendPort) + endpoint;
  
  if (!http.begin(client, url)) {
    return false;
  }
  
  // Add Authorization header
  if (authToken.length() > 0) {
    http.addHeader("Authorization", "Bearer " + authToken);
  }
  // Add MAC address header
  http.addHeader("X-Device-Mac", macAddress);
  http.addHeader("Content-Type", "application/json");
  
  int httpCode = http.POST(body);
  http.end();
  
  return (httpCode == 200 || httpCode == 201);
}

bool BackendClient::checkFeedSchedule(uint32_t& durationMs) {
  if (!isConfigured() || macAddress.length() == 0) {
    return false;
  }
  
  // Throttle requests
  uint32_t now = millis();
  if (now - lastFeedCheck < FEED_CHECK_INTERVAL) {
    return false;
  }
  lastFeedCheck = now;
  
  String endpoint = "/feed/check?mac=" + macAddress + "&tzOffsetMin=" + String(timezoneOffset);
  String response;
  
  LOG("BackendClient: Checking feed schedule...");
  
  if (!httpGet(endpoint, response)) {
    return false;
  }
  
  // Parse JSON response
  // Expected: {"shouldFeed": true, "durationMs": 5000}
  int shouldFeedIdx = response.indexOf("\"shouldFeed\"");
  if (shouldFeedIdx < 0) {
    return false;
  }
  
  int trueIdx = response.indexOf("true", shouldFeedIdx);
  if (trueIdx < 0 || trueIdx > shouldFeedIdx + 20) {
    return false;
  }
  
  // Extract duration if present
  int durationIdx = response.indexOf("\"durationMs\"");
  if (durationIdx > 0) {
    int colonIdx = response.indexOf(":", durationIdx);
    if (colonIdx > 0) {
      String durStr = response.substring(colonIdx + 1);
      durStr.trim();
      int commaIdx = durStr.indexOf(",");
      int braceIdx = durStr.indexOf("}");
      int endIdx = (commaIdx > 0 && commaIdx < braceIdx) ? commaIdx : braceIdx;
      if (endIdx > 0) {
        durStr = durStr.substring(0, endIdx);
        durStr.trim();
        durationMs = durStr.toInt();
        
        if (durationMs > 0 && durationMs < 60000) {
          LOG("BackendClient: Feed approved - duration %lu ms", (unsigned long)durationMs);
          return true;
        }
      }
    }
  }
  
  // No duration specified, use default
  durationMs = 0;
  LOG("BackendClient: Feed approved - using default duration");
  return true;
}

void BackendClient::sendLog(const String& level, const String& message, const String& metaJson) {
  if (!isConfigured() || macAddress.length() == 0) {
    return;
  }
  
  // Throttle logs
  uint32_t now = millis();
  if (now - lastLogSent < LOG_THROTTLE_MS) {
    return;
  }
  lastLogSent = now;
  
  String endpoint = "/logs/ingest?mac=" + macAddress;
  
  String body = "{\"level\":\"" + level + "\",\"message\":\"" + message + "\"";
  if (metaJson.length() > 0) {
    body += ",\"meta\":" + metaJson;
  }
  body += "}";
  
  httpPost(endpoint, body);
}

bool BackendClient::syncScheduleFromBackend() {
  if (!isConfigured() || macAddress.length() == 0) {
    LOG("BackendClient: Cannot sync - not configured or no MAC");
    return false;
  }
  
  // Throttle sync requests
  uint32_t now = millis();
  if (now - lastScheduleSync < SCHEDULE_SYNC_INTERVAL && lastScheduleSync > 0) {
    LOG("BackendClient: Sync throttled (last sync %lu ms ago)", now - lastScheduleSync);
    return false;
  }
  
  String endpoint = "/api/schedule/" + macAddress;
  String response;
  
  LOG("BackendClient: Syncing schedule from backend...");
  
  if (!httpGet(endpoint, response)) {
    LOG("BackendClient: Schedule sync failed - HTTP error");
    return false;
  }
  
  // Parse JSON response
  // Expected format: {"schedule": [{"feedTime": "08:30", "durationMs": 3000}, ...]}
  LOG("BackendClient: Received schedule data: %s", response.c_str());
  
  // Simple JSON parsing (looking for feedTime entries)
  String times = "";
  int count = 0;
  int pos = 0;
  
  while ((pos = response.indexOf("\"feedTime\"", pos)) >= 0) {
    int colonPos = response.indexOf(":", pos);
    int quoteStart = response.indexOf("\"", colonPos);
    int quoteEnd = response.indexOf("\"", quoteStart + 1);
    
    if (quoteStart > 0 && quoteEnd > quoteStart) {
      String feedTime = response.substring(quoteStart + 1, quoteEnd);
      if (times.length() > 0) times += ",";
      times += feedTime;
      count++;
      LOG("BackendClient: Found feed time: %s", feedTime.c_str());
    }
    
    pos = quoteEnd + 1;
    if (count >= MAX_FEED_TIMES) break;
  }
  
  if (count == 0) {
    LOG("BackendClient: No feed times found in response");
    return false;
  }
  
  // Save to NVS
#if defined(ESP32)
  Preferences prefs;
  if (prefs.begin(NVS_NAMESPACE, false)) {
    prefs.putString("feedTimes", times);
    prefs.putUInt("feedCount", count);
    prefs.end();
    LOG("BackendClient: Saved %d feed times to NVS: %s", count, times.c_str());
  } else {
    LOG("BackendClient: Failed to open NVS for writing");
    return false;
  }
#elif defined(ESP8266)
  // For ESP8266, save to EEPROM (simplified)
  EEPROM.begin(512);
  int addr = 200;  // Use offset 200 to avoid WiFi credentials area
  EEPROM.write(addr++, count);
  for (unsigned int i = 0; i < times.length() && i < 100; i++) {
    EEPROM.write(addr++, times[i]);
  }
  EEPROM.commit();
  EEPROM.end();
  LOG("BackendClient: Saved %d feed times to EEPROM", count);
#endif
  
  lastScheduleSync = now;
  LOG("BackendClient: Schedule sync successful");
  return true;
}
