#ifndef WEB_PORTAL_H
#define WEB_PORTAL_H

#include "Config.h"
#include "ModeManager.h"
#include "TimeManager.h"
#include "OfflineScheduler.h"
#include "WiFiManager.h"

#if defined(ESP8266)
  #include <ESP8266WebServer.h>
  #include <DNSServer.h>
  using WebServer = ESP8266WebServer;
#elif defined(ESP32)
  #include <WebServer.h>
  #include <DNSServer.h>
#endif

/**
 * @brief Web portal for device configuration
 * 
 * Provides web interface for:
 * - Mode selection (offline/online)
 * - Time synchronization
 * - Schedule configuration
 * - Manual feed testing
 */
class WebPortal {
private:
  WebServer* server;
  DNSServer* dnsServer;
  
  ModeManager* modeManager;
  TimeManager* timeManager;
  OfflineScheduler* scheduler;
  WiFiManager* wifiManager;
  
  bool apStarted;
  
  // HTML Pages
  static const char* getModeSelectionPage();
  static const char* getSchedulerPage();
  
  // Request Handlers
  void handleRoot();
  void handleSetMode();
  void handleSetTime();
  void handleSetFeedTimes();
  void handleSetServoAngle();
  void handleSetHoldDuration();
  void handleTestFeed();
  void handleGetStatus();
  void handleGetConfig();
  void handleChangeMode();
  void handleFactoryReset();
  void handleWiFiScan();
  void handleWiFiConnect();
  void handleWiFiStatus();
  void handleNotFound();
  
  // Helper functions
  bool startAccessPoint();
  bool parseFeedTimes(const String& timesStr, FeedTime* times, uint8_t* count);
  uint8_t parseExcludedDays(const String& excludeStr);
  
public:
  WebPortal(ModeManager* mm, TimeManager* tm, OfflineScheduler* sched, WiFiManager* wm = nullptr);
  ~WebPortal();
  
  /**
   * @brief Initialize web portal
   */
  bool begin();
  
  /**
   * @brief Handle client requests (call in loop)
   */
  void handleClient();
  
  /**
   * @brief Check if AP is started
   */
  bool isAPStarted() const { return apStarted; }
};

#endif // WEB_PORTAL_H
