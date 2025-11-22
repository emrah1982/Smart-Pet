#ifndef BACKEND_CLIENT_H
#define BACKEND_CLIENT_H

#include "Config.h"
#include <Arduino.h>

/**
 * @brief Backend API client for online mode
 * 
 * Handles communication with remote backend server:
 * - Feed schedule checking
 * - Event logging
 * - Device identification via MAC address
 */
class BackendClient {
private:
  String macAddress;
  String backendHost;
  uint16_t backendPort;
  int timezoneOffset;
  
  unsigned long lastFeedCheck;
  unsigned long lastLogSent;
  
  static const uint32_t FEED_CHECK_INTERVAL = 60000;  // Check every 60s
  static const uint32_t LOG_THROTTLE_MS = 5000;       // Max 1 log per 5s
  
  bool httpGet(const String& endpoint, String& response);
  bool httpPost(const String& endpoint, const String& body);
  
public:
  BackendClient();
  
  /**
   * @brief Initialize backend client
   * @param host Backend server hostname/IP
   * @param port Backend server port
   */
  void begin(const String& host, uint16_t port);
  
  /**
   * @brief Set timezone offset in minutes
   */
  void setTimezoneOffset(int offsetMinutes);
  
  /**
   * @brief Get device MAC address
   */
  String getMacAddress() const { return macAddress; }
  
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
  bool isConfigured() const { return backendHost.length() > 0; }
};

#endif // BACKEND_CLIENT_H
