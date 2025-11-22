#include "WebPortal.h"
#include "WebPortalPages.h"

#if defined(ESP8266)
  #include <ESP8266WiFi.h>
#elif defined(ESP32)
  #include <WiFi.h>
#endif

WebPortal::WebPortal(ModeManager* mm, TimeManager* tm, OfflineScheduler* sched, WiFiManager* wm)
  : server(nullptr)
  , dnsServer(nullptr)
  , modeManager(mm)
  , timeManager(tm)
  , scheduler(sched)
  , wifiManager(wm)
  , apStarted(false) {
}

WebPortal::~WebPortal() {
  if (server) delete server;
  if (dnsServer) delete dnsServer;
}

bool WebPortal::begin() {
  if (!startAccessPoint()) {
    LOG("WebPortal: Failed to start AP");
    return false;
  }
  
  // Create web server
  server = new WebServer(80);
  
  // Register handlers
  server->on("/", [this]() { this->handleRoot(); });
  server->on("/api/set-mode/", HTTP_POST, [this]() { this->handleSetMode(); });
  server->on("/api/set-time/", HTTP_POST, [this]() { this->handleSetTime(); });
  server->on("/api/set-feed-times/", HTTP_POST, [this]() { this->handleSetFeedTimes(); });
  server->on("/api/set-servo-angle/", HTTP_POST, [this]() { this->handleSetServoAngle(); });
  server->on("/api/set-hold/", HTTP_POST, [this]() { this->handleSetHoldDuration(); });
  server->on("/api/test-feed/", HTTP_POST, [this]() { this->handleTestFeed(); });
  server->on("/api/get-status/", HTTP_GET, [this]() { this->handleGetStatus(); });
  server->on("/api/get-config/", HTTP_GET, [this]() { this->handleGetConfig(); });
  server->on("/api/change-mode/", HTTP_POST, [this]() { this->handleChangeMode(); });
  server->on("/api/factory-reset/", HTTP_POST, [this]() { this->handleFactoryReset(); });
  server->on("/api/wifi-scan/", HTTP_GET, [this]() { this->handleWiFiScan(); });
  server->on("/api/wifi-connect/", HTTP_POST, [this]() { this->handleWiFiConnect(); });
  server->on("/api/wifi-status/", HTTP_GET, [this]() { this->handleWiFiStatus(); });
  server->onNotFound([this]() { this->handleNotFound(); });
  
  server->begin();
  LOG("WebPortal: Server started on http://%s", WiFi.softAPIP().toString().c_str());
  
  return true;
}

void WebPortal::handleClient() {
  if (dnsServer) dnsServer->processNextRequest();
  if (server) server->handleClient();
}

bool WebPortal::startAccessPoint() {
  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(AP_IP_ADDR, AP_GATEWAY, AP_SUBNET);
  
  bool ok = WiFi.softAP(AP_SSID, AP_PASSWORD, AP_CHANNEL, AP_HIDDEN, AP_MAX_CONNECTIONS);
  
  if (!ok) {
    LOG("WebPortal: AP start failed");
    return false;
  }
  
  // Start DNS server for captive portal
  dnsServer = new DNSServer();
  dnsServer->start(DNS_PORT, "*", AP_IP_ADDR);
  
  apStarted = true;
  LOG("WebPortal: AP started - SSID=%s, IP=%s", AP_SSID, WiFi.softAPIP().toString().c_str());
  
  return true;
}

void WebPortal::handleRoot() {
  if (!modeManager->isModeSelected()) {
    // Show mode selection page
    server->setContentLength(strlen_P(MODE_SELECTION_PAGE));
    server->send_P(200, "text/html", MODE_SELECTION_PAGE);
  } else if (modeManager->getMode() == MODE_ONLINE && wifiManager && !wifiManager->connected()) {
    // Online mode but not connected to WiFi - show WiFi setup
    server->setContentLength(strlen_P(WIFI_SETUP_PAGE));
    server->send_P(200, "text/html", WIFI_SETUP_PAGE);
  } else {
    // Show scheduler page
    server->setContentLength(strlen_P(SCHEDULER_PAGE));
    server->send_P(200, "text/html", SCHEDULER_PAGE);
  }
}

void WebPortal::handleSetMode() {
  if (!server->hasArg("mode")) {
    server->send(400, "text/plain", "Missing mode");
    return;
  }
  
  String mode = server->arg("mode");
  mode.trim();
  
  OperationMode selectedMode;
  if (mode == "offline") {
    selectedMode = MODE_OFFLINE;
  } else if (mode == "online") {
    selectedMode = MODE_ONLINE;
  } else {
    server->send(400, "text/plain", "Invalid mode");
    return;
  }
  
  if (modeManager->setMode(selectedMode)) {
    server->send(200, "text/plain", "OK");
  } else {
    server->send(500, "text/plain", "Failed to set mode");
  }
}

void WebPortal::handleSetTime() {
  if (!server->hasArg("epoch") || !server->hasArg("tz")) {
    server->send(400, "text/plain", "Missing params");
    return;
  }
  
  uint32_t epoch = server->arg("epoch").toInt();
  int32_t tz = server->arg("tz").toInt();
  
  timeManager->setTime(epoch, tz);
  server->send(200, "text/plain", "OK");
}

void WebPortal::handleSetFeedTimes() {
  String timesStr = server->hasArg("times") ? server->arg("times") : "";
  String excludeStr = server->hasArg("exclude") ? server->arg("exclude") : "";
  
  // Parse feed times
  FeedTime times[MAX_FEED_TIMES];
  uint8_t count = 0;
  
  if (timesStr.length() > 0) {
    if (!parseFeedTimes(timesStr, times, &count)) {
      server->send(400, "text/plain", "Invalid times format");
      return;
    }
  }
  
  // Parse excluded days
  uint8_t excludeBitmap = parseExcludedDays(excludeStr);
  
  // Update scheduler
  scheduler->setFeedTimes(times, count);
  scheduler->setExcludedDays(excludeBitmap);
  
  server->send(200, "text/plain", "OK");
}

void WebPortal::handleSetServoAngle() {
  if (!server->hasArg("angle")) {
    server->send(400, "text/plain", "Missing angle");
    return;
  }
  
  int angle = server->arg("angle").toInt();
  if (angle < 0) angle = 0;
  if (angle > 180) angle = 180;
  
  scheduler->setServoAngle((uint16_t)angle);
  server->send(200, "text/plain", "OK");
}

void WebPortal::handleSetHoldDuration() {
  if (!server->hasArg("hold")) {
    server->send(400, "text/plain", "Missing hold");
    return;
  }
  
  int hold = server->arg("hold").toInt();
  if (hold < 1) hold = 1;
  if (hold > 60) hold = 60;
  
  scheduler->setOpenHoldDuration((uint32_t)hold * 1000);
  server->send(200, "text/plain", "OK");
}

void WebPortal::handleTestFeed() {
  scheduler->triggerManualFeed();
  server->send(200, "text/plain", "OK");
}

void WebPortal::handleGetStatus() {
  String json = "{";
  
  if (timeManager->isSet()) {
    json += "\"time\":\"" + timeManager->getTimeString() + "\"";
  } else {
    json += "\"time\":null";
  }
  
  json += "}";
  
  server->send(200, "application/json", json);
}

void WebPortal::handleGetConfig() {
  const ScheduleConfig& cfg = scheduler->getConfig();
  
  String json = "{";
  
  // Feed times
  json += "\"times\":\"";
  for (uint8_t i = 0; i < cfg.timesCount; i++) {
    char buf[6];
    snprintf(buf, sizeof(buf), "%02u:%02u", cfg.times[i].hour, cfg.times[i].minute);
    json += buf;
    if (i + 1 < cfg.timesCount) json += ",";
  }
  json += "\",";
  
  // Excluded days
  json += "\"exclude\":\"";
  bool first = true;
  for (uint8_t d = 0; d < 7; d++) {
    if ((cfg.excludeDaysBitmap >> d) & 0x01) {
      if (!first) json += ",";
      json += String(d);
      first = false;
    }
  }
  json += "\",";
  
  // Servo angle
  json += "\"angle\":" + String(cfg.servoAngle) + ",";
  
  // Hold duration (in seconds)
  json += "\"hold\":" + String(cfg.openHoldMs / 1000);
  
  json += "}";
  
  server->send(200, "application/json", json);
}

void WebPortal::handleNotFound() {
  // Redirect to root for captive portal
  server->sendHeader("Location", "/", true);
  server->send(302, "text/plain", "");
}

bool WebPortal::parseFeedTimes(const String& timesStr, FeedTime* times, uint8_t* count) {
  *count = 0;
  
  int start = 0;
  int end = timesStr.indexOf(',');
  
  while (start < (int)timesStr.length() && *count < MAX_FEED_TIMES) {
    String timeStr;
    if (end == -1) {
      timeStr = timesStr.substring(start);
    } else {
      timeStr = timesStr.substring(start, end);
    }
    
    timeStr.trim();
    if (timeStr.length() >= 5) { // "HH:MM"
      int colonPos = timeStr.indexOf(':');
      if (colonPos > 0) {
        int hour = timeStr.substring(0, colonPos).toInt();
        int minute = timeStr.substring(colonPos + 1).toInt();
        
        if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
          times[*count].hour = (uint8_t)hour;
          times[*count].minute = (uint8_t)minute;
          (*count)++;
        }
      }
    }
    
    if (end == -1) break;
    start = end + 1;
    end = timesStr.indexOf(',', start);
  }
  
  return true;
}

uint8_t WebPortal::parseExcludedDays(const String& excludeStr) {
  uint8_t bitmap = 0;
  
  int start = 0;
  int end = excludeStr.indexOf(',');
  
  while (start < (int)excludeStr.length()) {
    String dayStr;
    if (end == -1) {
      dayStr = excludeStr.substring(start);
    } else {
      dayStr = excludeStr.substring(start, end);
    }
    
    dayStr.trim();
    if (dayStr.length() > 0) {
      int day = dayStr.toInt();
      if (day >= 0 && day < 7) {
        bitmap |= (1 << day);
      }
    }
    
    if (end == -1) break;
    start = end + 1;
    end = excludeStr.indexOf(',', start);
  }
  
  return bitmap;
}

void WebPortal::handleChangeMode() {
  LOG("WebPortal: Mode change requested via web");
  
  server->send(200, "text/plain", "OK");
  
  // Give time for response to be sent
  delay(100);
  
  // Only reset mode selection, keep schedule and time
  modeManager->reset();
  
  LOG("WebPortal: Mode reset, schedule and time preserved, rebooting...");
  delay(500);
  
  ESP.restart();
}

void WebPortal::handleFactoryReset() {
  LOG("WebPortal: Factory reset requested via web");
  
  server->send(200, "text/plain", "OK");
  
  // Give time for response to be sent
  delay(100);
  
  // Clear all NVS data
  modeManager->reset();
  timeManager->clearTime();
  scheduler->clearSchedule();
  
  LOG("WebPortal: All data cleared, rebooting...");
  delay(500);
  
  ESP.restart();
}

void WebPortal::handleWiFiScan() {
  if (!wifiManager) {
    server->send(500, "application/json", "[]");
    return;
  }
  
  String json = wifiManager->scanNetworks();
  server->send(200, "application/json", json);
}

void WebPortal::handleWiFiConnect() {
  if (!wifiManager) {
    server->send(500, "text/plain", "WiFi manager not available");
    return;
  }
  
  if (!server->hasArg("ssid") || !server->hasArg("pass")) {
    server->send(400, "text/plain", "Missing parameters");
    return;
  }
  
  String ssid = server->arg("ssid");
  String pass = server->arg("pass");
  
  LOG("WebPortal: WiFi connect request - SSID=%s", ssid.c_str());
  
  if (wifiManager->connect(ssid, pass, 20000)) {
    server->send(200, "text/plain", "OK");
  } else {
    server->send(500, "text/plain", "Connection failed");
  }
}

void WebPortal::handleWiFiStatus() {
  if (!wifiManager) {
    server->send(200, "application/json", "{\"connected\":false}");
    return;
  }
  
  String json = "{\"connected\":";
  json += wifiManager->connected() ? "true" : "false";
  
  if (wifiManager->connected()) {
    json += ",\"ssid\":\"" + wifiManager->getSSID() + "\"";
    json += ",\"ip\":\"" + wifiManager->getLocalIP() + "\"";
    json += ",\"rssi\":" + String(wifiManager->getRSSI());
  }
  
  json += "}";
  server->send(200, "application/json", json);
}
