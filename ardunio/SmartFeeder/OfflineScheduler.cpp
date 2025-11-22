#include "OfflineScheduler.h"

#if defined(ESP32)
  #include <Preferences.h>
#endif

OfflineScheduler::OfflineScheduler(TimeManager* tm, ServoController* sc)
  : timeManager(tm)
  , servoController(sc)
  , lastTickMs(0)
  , lastLoggedMinute(65535) {
  
  memset(&config, 0, sizeof(config));
  config.servoAngle = SERVO_DEFAULT_ANGLE;
  config.openHoldMs = OPEN_HOLD_MS;
}

bool OfflineScheduler::begin() {
  LOG("OfflineScheduler: Initializing");
  return loadConfig();
}

void OfflineScheduler::tick() {
  uint32_t now = millis();
  
  // Throttle to SCHEDULER_TICK_MS
  if ((now - lastTickMs) < SCHEDULER_TICK_MS) return;
  lastTickMs = now;
  
  // Check if time is set
  if (!timeManager->isSet()) {
    static uint32_t lastWarnMs = 0;
    if ((now - lastWarnMs) > 5000) {
      LOG("OfflineScheduler: Waiting for time sync");
      lastWarnMs = now;
    }
    return;
  }
  
  uint8_t dow = timeManager->getDayOfWeek();
  uint16_t mod = timeManager->getMinuteOfDay();
  
  // Log once per minute
  if (mod != lastLoggedMinute) {
    lastLoggedMinute = mod;
    
    uint8_t hh = mod / 60;
    uint8_t mm = mod % 60;
    bool excluded = isDayExcluded(dow);
    
    const char* days[] = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};
    LOG("*** CLOCK: %s %02u:%02u %s ***", 
        days[dow], hh, mm, excluded ? "[EXCLUDED]" : "");
    
    // Log scheduled times
    if (config.timesCount > 0) {
      LOG("Scheduled feeds: %u times", config.timesCount);
      for (uint8_t i = 0; i < config.timesCount; i++) {
        LOG("  - %02u:%02u", config.times[i].hour, config.times[i].minute);
      }
    }
    
    // Auto-save every 10 minutes
    if (mm % AUTO_SAVE_INTERVAL == 0) {
      timeManager->save();
      LOG("Auto-saved time to NVS");
    }
  }
  
  // Check if we should feed
  if (!isDayExcluded(dow)) {
    if (shouldFeedNow(dow, mod)) {
      triggerManualFeed();
    }
  }
}

bool OfflineScheduler::isDayExcluded(uint8_t dayOfWeek) const {
  if (dayOfWeek > 6) return false;
  return (config.excludeDaysBitmap >> dayOfWeek) & 0x01;
}

bool OfflineScheduler::shouldFeedNow(uint8_t dow, uint16_t minuteOfDay) {
  for (uint8_t i = 0; i < config.timesCount; i++) {
    uint16_t scheduledMinute = config.times[i].toMinutes();
    
    if (scheduledMinute == minuteOfDay) {
      // Check if we already fed at this time today
      if (config.lastRunDay[i] == dow && config.lastRunMinute[i] == minuteOfDay) {
        return false; // Already fed
      }
      
      // Mark as fed
      config.lastRunDay[i] = dow;
      config.lastRunMinute[i] = minuteOfDay;
      
      LOG("OfflineScheduler: Feed time matched - %02u:%02u", 
          config.times[i].hour, config.times[i].minute);
      
      return true;
    }
  }
  
  return false;
}

void OfflineScheduler::resetLastRunGuards() {
  for (uint8_t i = 0; i < MAX_FEED_TIMES; i++) {
    config.lastRunDay[i] = 255;
    config.lastRunMinute[i] = 65535;
  }
}

void OfflineScheduler::setFeedTimes(const FeedTime* times, uint8_t count) {
  if (count > MAX_FEED_TIMES) count = MAX_FEED_TIMES;
  
  config.timesCount = count;
  for (uint8_t i = 0; i < count; i++) {
    config.times[i] = times[i];
  }
  
  resetLastRunGuards();
  saveConfig();
  
  LOG("OfflineScheduler: Feed times updated - %u times", count);
}

void OfflineScheduler::setExcludedDays(uint8_t bitmap) {
  config.excludeDaysBitmap = bitmap;
  saveConfig();
  LOG("OfflineScheduler: Excluded days bitmap = 0x%02X", bitmap);
}

void OfflineScheduler::setServoAngle(uint16_t angle) {
  if (angle > 180) angle = 180;
  config.servoAngle = angle;
  saveConfig();
  LOG("OfflineScheduler: Servo angle = %u°", angle);
}

void OfflineScheduler::setOpenHoldDuration(uint32_t ms) {
  config.openHoldMs = ms;
  servoController->setHoldDuration(ms);
  saveConfig();
  LOG("OfflineScheduler: Hold duration = %lu ms", (unsigned long)ms);
}

void OfflineScheduler::triggerManualFeed() {
  if (!servoController->isIdle()) {
    LOG("OfflineScheduler: Cannot feed - motor busy");
    return;
  }
  
  LOG(">>> FEED TRIGGERED <<<");
  servoController->open(config.servoAngle);
}

void OfflineScheduler::saveConfig() {
#if defined(ESP32)
  Preferences prefs;
  if (!prefs.begin(NVS_NAMESPACE, false)) {
    LOG("OfflineScheduler: Failed to save config");
    return;
  }
  
  prefs.putUChar("timesCount", config.timesCount);
  for (uint8_t i = 0; i < MAX_FEED_TIMES; i++) {
    char key[8];
    snprintf(key, sizeof(key), "t%u_h", i);
    prefs.putUChar(key, config.times[i].hour);
    snprintf(key, sizeof(key), "t%u_m", i);
    prefs.putUChar(key, config.times[i].minute);
  }
  
  prefs.putUChar("excludeBmp", config.excludeDaysBitmap);
  prefs.putUShort("angle", config.servoAngle);
  prefs.putUInt("holdMs", config.openHoldMs);
  
  prefs.end();
  LOG("OfflineScheduler: Config saved to NVS");
#endif
}

bool OfflineScheduler::loadConfig() {
#if defined(ESP32)
  Preferences prefs;
  if (!prefs.begin(NVS_NAMESPACE, true)) {
    LOG("OfflineScheduler: Failed to load config");
    return false;
  }
  
  config.timesCount = prefs.getUChar("timesCount", 0);
  if (config.timesCount > MAX_FEED_TIMES) {
    config.timesCount = MAX_FEED_TIMES;
  }
  
  for (uint8_t i = 0; i < MAX_FEED_TIMES; i++) {
    char key[8];
    snprintf(key, sizeof(key), "t%u_h", i);
    config.times[i].hour = prefs.getUChar(key, 0);
    snprintf(key, sizeof(key), "t%u_m", i);
    config.times[i].minute = prefs.getUChar(key, 0);
  }
  
  config.excludeDaysBitmap = prefs.getUChar("excludeBmp", 0);
  config.servoAngle = prefs.getUShort("angle", SERVO_DEFAULT_ANGLE);
  config.openHoldMs = prefs.getUInt("holdMs", OPEN_HOLD_MS);
  
  prefs.end();
  
  resetLastRunGuards();
  servoController->setHoldDuration(config.openHoldMs);
  
  LOG("OfflineScheduler: Config loaded - %u times, angle=%u°, hold=%lu ms",
      config.timesCount, config.servoAngle, (unsigned long)config.openHoldMs);
  
  return true;
#else
  LOG("OfflineScheduler: NVS not supported");
  return false;
#endif
}

void OfflineScheduler::clearSchedule() {
#if defined(ESP32)
  Preferences prefs;
  if (!prefs.begin(NVS_NAMESPACE, false)) {
    LOG("OfflineScheduler: Failed to open NVS for clearing");
    return;
  }
  
  prefs.clear();
  prefs.end();
  
  config.timesCount = 0;
  config.excludeDaysBitmap = 0;
  config.servoAngle = SERVO_DEFAULT_ANGLE;
  config.openHoldMs = OPEN_HOLD_MS;
  
  for (uint8_t i = 0; i < MAX_FEED_TIMES; i++) {
    config.times[i].hour = 0;
    config.times[i].minute = 0;
  }
  
  resetLastRunGuards();
  
  LOG("OfflineScheduler: Schedule cleared from NVS");
#else
  LOG("OfflineScheduler: NVS not supported");
#endif
}
