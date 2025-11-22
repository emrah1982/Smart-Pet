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
  server->on("/api/wifi-reset/", HTTP_POST, [this]() { this->handleWiFiReset(); });
  server->on("/api/wifi-disconnect/", HTTP_POST, [this]() { this->handleWiFiDisconnect(); });
  server->on("/api/reset-mode/", HTTP_POST, [this]() { this->handleResetMode(); });
  server->on("/api/sync-schedule/", HTTP_POST, [this]() { this->handleSyncSchedule(); });
  // Control UI (offline-like page) accessible in any mode
  server->on("/control", HTTP_GET, [this]() {
    server->setContentLength(strlen_P(SCHEDULER_PAGE));
    server->send_P(200, "text/html", SCHEDULER_PAGE);
  });
  // WiFi setup page accessible directly
  server->on("/wifi-setup", HTTP_GET, [this]() {
    server->setContentLength(strlen_P(WIFI_SETUP_PAGE));
    server->send_P(200, "text/html", WIFI_SETUP_PAGE);
  });
  // Debug status page
  server->on("/debug", HTTP_GET, [this]() {
    String html = "<!DOCTYPE html><html><head><meta charset='utf-8'/><title>Debug</title></head><body>";
    html += "<h2>Debug Bilgileri</h2>";
    html += "<p><b>Mod:</b> " + String(modeManager->isModeSelected() ? (modeManager->getMode() == MODE_ONLINE ? "ONLINE" : "OFFLINE") : "SEÇİLMEDİ") + "</p>";
    html += "<p><b>WiFi Status:</b> " + String(WiFi.status()) + " (3=WL_CONNECTED)</p>";
    html += "<p><b>WiFi SSID:</b> " + WiFi.SSID() + "</p>";
    html += "<p><b>WiFi IP:</b> " + WiFi.localIP().toString() + "</p>";
    html += "<p><b>AP IP:</b> " + WiFi.softAPIP().toString() + "</p>";
    html += "<p><b>Manager Connected:</b> " + String(wifiManager && wifiManager->connected() ? "YES" : "NO") + "</p>";
    html += "<p><a href='/'>Ana Sayfa</a> | <a href='/control'>Kontrol</a></p>";
    html += "</body></html>";
    server->send(200, "text/html", html);
  });
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
  // Disable WiFi sleep for stable AP operation (like reference code)
#if defined(ESP32)
  WiFi.setSleep(false);
#else
  WiFi.setSleepMode(WIFI_NONE_SLEEP);
#endif
  
  // Use AP_STA mode to allow scanning while AP is active
  WiFi.mode(WIFI_AP_STA);
  delay(100);
  
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
  LOG("WebPortal: handleRoot called - Mode=%d, WiFiStatus=%d", 
      modeManager->getMode(), WiFi.status());
      
  if (!modeManager->isModeSelected()) {
    // Show mode selection page
    LOG("WebPortal: Showing mode selection page");
    server->setContentLength(strlen_P(MODE_SELECTION_PAGE));
    server->send_P(200, "text/html", MODE_SELECTION_PAGE);
    return;
  }
  
  if (modeManager->getMode() == MODE_ONLINE) {
    // Check both manager state and actual WiFi status
    bool managerConnected = wifiManager && wifiManager->connected();
    bool wifiConnected = (WiFi.status() == WL_CONNECTED);
    
    LOG("WebPortal: Online mode - Manager=%d, WiFi=%d", managerConnected, wifiConnected);
    
    // If credentials are missing, force WiFi setup even if WiFi reports connected (stale state)
    bool hasCredentials = wifiManager && wifiManager->hasCredentials();
    if (!hasCredentials) {
      LOG("WebPortal: No saved credentials, forcing WiFi setup");
      server->setContentLength(strlen_P(WIFI_SETUP_PAGE));
      server->send_P(200, "text/html", WIFI_SETUP_PAGE);
      return;
    }
    
    if (!wifiConnected) {
      // Online mode but not connected to WiFi - show WiFi setup
      LOG("WebPortal: Showing WiFi setup (not connected)");
      server->setContentLength(strlen_P(WIFI_SETUP_PAGE));
      server->send_P(200, "text/html", WIFI_SETUP_PAGE);
    } else {
      // Online mode and WiFi connected - show online status
      LOG("WebPortal: Showing online status (connected to %s, IP=%s)", 
          WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());
      server->setContentLength(strlen_P(ONLINE_STATUS_PAGE));
      server->send_P(200, "text/html", ONLINE_STATUS_PAGE);
    }
  } else {
    // Offline mode - show scheduler page
    LOG("WebPortal: Showing scheduler page (offline mode)");
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
  
  // Add MAC address
  json += ",\"mac\":\"" + WiFi.macAddress() + "\"";
  
  // Add WiFi info if in online mode
  if (modeManager->getMode() == MODE_ONLINE) {
    json += ",\"wifi_connected\":" + String(WiFi.status() == WL_CONNECTED ? "true" : "false");
    if (WiFi.status() == WL_CONNECTED) {
      json += ",\"wifi_ip\":\"" + WiFi.localIP().toString() + "\"";
      json += ",\"wifi_ssid\":\"" + WiFi.SSID() + "\"";
    }
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
  // Check if specific mode is requested
  if (server->hasArg("mode")) {
    String mode = server->arg("mode");
    mode.trim();
    
    OperationMode targetMode;
    if (mode == "offline") {
      targetMode = MODE_OFFLINE;
    } else if (mode == "online") {
      targetMode = MODE_ONLINE;
    } else {
      server->send(400, "text/plain", "Invalid mode");
      return;
    }
    
    LOG("WebPortal: Changing to %s mode", mode.c_str());
    
    if (modeManager->setMode(targetMode)) {
      server->send(200, "text/plain", "OK");
      
      // Give time for response to be sent
      delay(100);
      
      LOG("WebPortal: Mode changed, rebooting...");
      delay(500);
      ESP.restart();
    } else {
      server->send(500, "text/plain", "Failed to set mode");
    }
  } else {
    // No mode specified - reset to mode selection
    LOG("WebPortal: Mode reset requested via web");
    
    server->send(200, "text/plain", "OK");
    
    // Give time for response to be sent
    delay(100);
    
    // Only reset mode selection, keep schedule and time
    modeManager->reset();
    
    LOG("WebPortal: Mode reset, schedule and time preserved, rebooting...");
    delay(500);
    
    ESP.restart();
  }
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
  LOG("WebPortal: WiFi scan requested");
  
  if (!wifiManager) {
    LOG("WebPortal: WiFi manager not available");
    server->send(200, "application/json", "{\"success\":false,\"error\":\"WiFi yöneticisi hazır değil\"}");
    return;
  }
  
  String networksJson;
  String errorMessage;
  bool ok = wifiManager->scanNetworks(networksJson, errorMessage);
  if (ok) {
    LOG("WebPortal: Scan complete, returning %d bytes", networksJson.length());
    String payload = "{\"success\":true,\"networks\":" + networksJson + "}";
    server->send(200, "application/json", payload);
  } else {
    LOG("WebPortal: Scan failed: %s", errorMessage.c_str());
    String payload = "{\"success\":false,\"error\":\"" + errorMessage + "\"}";
    server->send(200, "application/json", payload);
  }
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
  
  LOG("WebPortal: WiFi connect request - SSID=%s, Pass length=%d", ssid.c_str(), pass.length());
  
  // Validate inputs
  if (ssid.length() == 0) {
    LOG("WebPortal: Empty SSID provided");
    server->send(400, "text/plain", "SSID boş olamaz");
    return;
  }
  
  if (wifiManager->connect(ssid, pass, 20000)) {
    LOG("WebPortal: Connection successful");
    server->send(200, "text/plain", "OK");
  } else {
    LOG("WebPortal: Connection failed");
    // Get WiFi status to provide better error message
    int status = WiFi.status();
    String errorMsg = "Bağlantı başarısız";
    
    switch(status) {
      case WL_NO_SSID_AVAIL:
        errorMsg = "Ağ bulunamadı - SSID yanlış veya sinyal zayıf";
        break;
      case WL_CONNECT_FAILED:
        errorMsg = "Şifre yanlış veya kimlik doğrulama hatası";
        break;
      case WL_DISCONNECTED:
        errorMsg = "Bağlantı zaman aşımı - Sinyal çok zayıf";
        break;
      default:
        errorMsg = "Bağlantı hatası (kod: " + String(status) + ")";
        break;
    }
    
    server->send(500, "text/plain", errorMsg);
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

void WebPortal::handleWiFiDisconnect() {
  if (!wifiManager) {
    server->send(500, "text/plain", "WiFi manager not available");
    return;
  }
  
  LOG("WebPortal: WiFi disconnect requested");
  wifiManager->disconnect();
  server->send(200, "text/plain", "OK");
}

void WebPortal::handleWiFiReset() {
  if (!wifiManager) {
    server->send(500, "text/plain", "WiFi manager not available");
    return;
  }
  
  LOG("WebPortal: WiFi reset requested - clearing credentials and returning to setup");
  wifiManager->disconnect();
  wifiManager->clearCredentials();
  server->send(200, "text/plain", "OK");
}

void WebPortal::handleResetMode() {
  LOG("WebPortal: Mode reset requested - returning to mode selection");
  
  // Clear mode selection but keep other settings
  if (modeManager) {
    modeManager->reset();
  }
  
  // Clear WiFi credentials
  if (wifiManager) {
    wifiManager->disconnect();
    wifiManager->clearCredentials();
  }
  
  server->send(200, "text/plain", "OK");
  
  LOG("WebPortal: Mode reset complete, rebooting...");
  delay(500);
  ESP.restart();
}

void WebPortal::handleSyncSchedule() {
  LOG("WebPortal: Schedule sync requested");
  
  // This requires BackendClient to be available
  // We'll need to pass it to WebPortal or access it globally
  // For now, return a simple response
  server->send(200, "text/plain", "Sync triggered - check serial monitor");
  
  // Note: Actual sync will be handled by BackendClient in main loop
  // This endpoint just triggers the sync request
}
