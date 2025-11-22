#ifndef BACKEND_CLIENT_H
#define BACKEND_CLIENT_H

#include "Config.h"
#include <Arduino.h>

/**
 * @brief Backend API client for online mode
 * 
 * Handles communication with remote backend server:
 * - Feed schedule syncing (MAC-based)
 * - Event logging
 * - Device identification via MAC address
 * - Token-based authentication
 */
class BackendClient {
private:
  String macAddress;
  String backendHost;
  uint16_t backendPort;
  String authToken;
  bool useHttps;
  int timezoneOffset;
  
  unsigned long lastFeedCheck;
  unsigned long lastLogSent;
  unsigned long lastScheduleSync;
  
  static const uint32_t FEED_CHECK_INTERVAL = 60000;  // Check every 60s
  static const uint32_t LOG_THROTTLE_MS = 5000;       // Max 1 log per 5s
  static const uint32_t SCHEDULE_SYNC_INTERVAL = 300000;  // Sync every 5 min
  
  bool httpGet(const String& endpoint, String& response);
  bool httpPost(const String& endpoint, const String& body);
  
public:
  BackendClient();
  
  /**
   * @brief Initialize backend client
   * @param host Backend server hostname/IP
   * @param port Backend server port
   * @param token Authentication token
   * @param https Use HTTPS instead of HTTP
   */
  void begin(const String& host, uint16_t port, const String& token, bool https = false);
  
  /**
   * @brief Set timezone offset in minutes
   */
  void setTimezoneOffset(int offsetMinutes);
  
  /**
   * @brief Get device MAC address
   */
  String getMacAddress() const { return macAddress; }
  
  /**
   * @brief Sync feed schedule from backend (MAC-based)
   * Downloads schedule and saves to NVS
   * @return true if sync successful
   */
  bool syncScheduleFromBackend();
  
  /**
   * @brief Check if it's time to feed (from backend schedule)
   * @param durationMs Output: feed duration in milliseconds
   * @return true if should feed now
   */
  bool checkFeedSchedule(uint32_t& durationMs);
  
  /**
   * @brief Send log event to backend
   * @param level Log level (info, warning, error)
   * @param message Log message
   * @param metaJson Optional JSON metadata
   */
  void sendLog(const String& level, const String& message, const String& metaJson = "");
  
  /**
   * @brief Check if backend is configured
   */
  bool isConfigured() const { return backendHost.length() > 0 && authToken.length() > 0; }
};

#endif // BACKEND_CLIENT_H
