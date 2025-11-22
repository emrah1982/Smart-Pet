#ifndef TIME_MANAGER_H
#define TIME_MANAGER_H

#include "Config.h"

/**
 * @brief Manages device time and timezone
 * 
 * Handles epoch-based timekeeping with timezone offset.
 * Persists time to NVS for recovery after power loss.
 */
class TimeManager {
private:
  int64_t epochBase;
  int64_t epochSetAtMs;
  int32_t timezoneOffsetMin;
  bool isTimeSet;
  
public:
  TimeManager();
  
  /**
   * @brief Initialize and load saved time from NVS
   * @return true if time was restored from NVS
   */
  bool begin();
  
  /**
   * @brief Set device time from UTC epoch and timezone
   * @param utcEpoch UTC timestamp in seconds
   * @param tzOffsetMin Timezone offset in minutes (e.g., -180 for UTC+3)
   */
  void setTime(uint32_t utcEpoch, int32_t tzOffsetMin);
  
  /**
   * @brief Get current local epoch
   * @return Local epoch in seconds, or 0 if time not set
   */
  uint32_t getLocalEpoch() const;
  
  /**
   * @brief Get current day of week (0=Sun, 1=Mon, ..., 6=Sat)
   */
  uint8_t getDayOfWeek() const;
  
  /**
   * @brief Get current minute of day (0-1439)
   */
  uint16_t getMinuteOfDay() const;
  
  /**
   * @brief Get current time as string "Mon 16:23"
   */
  String getTimeString() const;
  
  /**
   * @brief Check if time is set
   */
  bool isSet() const { return isTimeSet; }
  
  /**
   * @brief Get timezone offset in minutes
   */
  int getTimezoneOffset() const { return timezoneOffsetMin; }
  
  /**
   * @brief Save current time to NVS
   */
  void save();
  
  /**
   * @brief Load time from NVS
   * @return true if time was loaded successfully
   */
  bool load();
  
  /**
   * @brief Clear time from NVS
   */
  void clearTime();
};

#endif // TIME_MANAGER_H
