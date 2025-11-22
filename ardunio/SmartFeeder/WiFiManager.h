#ifndef WIFI_MANAGER_H
#define WIFI_MANAGER_H

#include "Config.h"

/**
 * @brief Manages WiFi connection for online mode
 * 
 * Handles WiFi scanning, connection, and credential storage.
 * Only used when MODE_ONLINE is selected.
 */
class WiFiManager {
private:
  String savedSSID;
  String savedPassword;
  bool isConnected;
  unsigned long lastScanTime;
  unsigned long lastConnectAttempt;
  
  static const uint32_t SCAN_CACHE_MS = 30000;  // Cache scan results for 30s
  static const uint32_t RECONNECT_INTERVAL = 60000;  // Try reconnect every 60s
  
public:
  WiFiManager();
  
  /**
   * @brief Initialize WiFi manager and load saved credentials
   */
  bool begin();
  
  /**
   * @brief Scan for available WiFi networks
   * @return JSON string with network list
   */
  String scanNetworks();
  
  /**
   * @brief Connect to WiFi network
   * @param ssid Network SSID
   * @param password Network password
   * @param timeoutMs Connection timeout in milliseconds
   * @return true if connected successfully
   */
  bool connect(const String& ssid, const String& password, uint32_t timeoutMs = 20000);
  
  /**
   * @brief Try to connect using saved credentials
   * @return true if connected successfully
   */
  bool connectSaved();
  
  /**
   * @brief Disconnect from WiFi
   */
  void disconnect();
  
  /**
   * @brief Check if connected to WiFi
   */
  bool connected() const { return isConnected; }
  
  /**
   * @brief Get connected SSID
   */
  String getSSID() const { return savedSSID; }
  
  /**
   * @brief Get local IP address
   */
  String getLocalIP() const;
  
  /**
   * @brief Get RSSI (signal strength)
   */
  int getRSSI() const;
  
  /**
   * @brief Maintain WiFi connection (call in loop)
   */
  void maintain();
  
  /**
   * @brief Clear saved credentials
   */
  void clearCredentials();
};

#endif // WIFI_MANAGER_H
