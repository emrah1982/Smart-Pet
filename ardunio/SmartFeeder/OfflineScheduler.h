#ifndef OFFLINE_SCHEDULER_H
#define OFFLINE_SCHEDULER_H

#include "Config.h"
#include "TimeManager.h"
#include "ServoController.h"

/**
 * @brief Offline scheduler for automatic feeding
 * 
 * Manages feed schedule without internet connection.
 * Uses local time from TimeManager and triggers ServoController.
 */
class OfflineScheduler {
private:
  TimeManager* timeManager;
  ServoController* servoController;
  ScheduleConfig config;
  
  uint32_t lastTickMs;
  uint16_t lastLoggedMinute;
  
  /**
   * @brief Check if a day is excluded from feeding
   */
  bool isDayExcluded(uint8_t dayOfWeek) const;
  
  /**
   * @brief Check if we should feed at current time
   */
  bool shouldFeedNow(uint8_t dow, uint16_t minuteOfDay);
  
  /**
   * @brief Reset last run guards (after schedule change)
   */
  void resetLastRunGuards();
  
public:
  OfflineScheduler(TimeManager* tm, ServoController* sc);
  
  /**
   * @brief Initialize scheduler and load config from NVS
   */
  bool begin();
  
  /**
   * @brief Update scheduler (call in loop)
   */
  void tick();
  
  /**
   * @brief Set feed times
   * @param times Array of feed times
   * @param count Number of times
   */
  void setFeedTimes(const FeedTime* times, uint8_t count);
  
  /**
   * @brief Set excluded days bitmap
   * @param bitmap Bit 0=Sun, 1=Mon, ..., 6=Sat
   */
  void setExcludedDays(uint8_t bitmap);
  
  /**
   * @brief Set servo angle
   */
  void setServoAngle(uint16_t angle);
  
  /**
   * @brief Set open hold duration
   */
  void setOpenHoldDuration(uint32_t ms);
  
  /**
   * @brief Get current config
   */
  const ScheduleConfig& getConfig() const { return config; }
  
  /**
   * @brief Save config to NVS
   */
  void saveConfig();
  
  /**
   * @brief Load config from NVS
   */
  bool loadConfig();
  
  /**
   * @brief Trigger manual feed (for testing)
   */
  void triggerManualFeed();
  
  /**
   * @brief Clear schedule from NVS
   */
  void clearSchedule();
};

#endif // OFFLINE_SCHEDULER_H
