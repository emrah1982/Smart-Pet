#include "BackendClient.h"

#if defined(ESP32)
  #include <WiFi.h>
  #include <HTTPClient.h>
#elif defined(ESP8266)
  #include <ESP8266WiFi.h>
  #include <ESP8266HTTPClient.h>
#endif

BackendClient::BackendClient() 
  : backendPort(0)
  , timezoneOffset(0)
  , lastFeedCheck(0)
  , lastLogSent(0) {
  
  // Get MAC address
#if defined(ESP32)
  macAddress = WiFi.macAddress();
#elif defined(ESP8266)
  macAddress = WiFi.macAddress();
#endif
  
  LOG("BackendClient: MAC Address = %s", macAddress.c_str());
}

void BackendClient::begin(const String& host, uint16_t port) {
  backendHost = host;
  backendPort = port;
  LOG("BackendClient: Configured - %s:%d", host.c_str(), port);
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
  
  String url = "http://" + backendHost + ":" + String(backendPort) + endpoint;
  
  http.setTimeout(5000);
  if (!http.begin(client, url)) {
    LOG("BackendClient: HTTP begin failed");
    return false;
  }
  
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
  
  String url = "http://" + backendHost + ":" + String(backendPort) + endpoint;
  
  if (!http.begin(client, url)) {
    return false;
  }
  
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
