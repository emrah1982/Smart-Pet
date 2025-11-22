#include "TimeManager.h"

#if defined(ESP32)
  #include <Preferences.h>
#endif

TimeManager::TimeManager() 
  : epochBase(0)
  , epochSetAtMs(0)
  , timezoneOffsetMin(0)
  , isTimeSet(false) {
}

bool TimeManager::begin() {
  return load();
}

void TimeManager::setTime(uint32_t utcEpoch, int32_t tzOffsetMin) {
  // Calculate local epoch: UTC - timezone offset
  // Example: UTC=1700000000, tz=-180 (UTC+3) -> local=1700010800
  int64_t localEpoch = (int64_t)utcEpoch - ((int64_t)tzOffsetMin * 60);
  
  epochBase = localEpoch;
  epochSetAtMs = (int64_t)millis();
  timezoneOffsetMin = tzOffsetMin;
  isTimeSet = true;
  
  LOG("TimeManager: Time set - UTC=%lu, TZ=%ld min, Local=%lu",
      (unsigned long)utcEpoch, (long)tzOffsetMin, (unsigned long)localEpoch);
  LOG("TimeManager: Current time: %s", getTimeString().c_str());
  
  save();
}

uint32_t TimeManager::getLocalEpoch() const {
  if (!isTimeSet) return 0;
  
  uint32_t elapsed = (uint32_t)((int64_t)millis() - epochSetAtMs) / 1000;
  return (uint32_t)(epochBase + elapsed);
}

uint8_t TimeManager::getDayOfWeek() const {
  uint32_t epoch = getLocalEpoch();
  if (epoch == 0) return 0;
  
  // Unix epoch started on Thursday (Jan 1, 1970)
  // Day 0 = Thursday, so we add 4 to align with Sunday=0
  uint32_t days = epoch / 86400;
  return (uint8_t)((days + 4) % 7);
}

uint16_t TimeManager::getMinuteOfDay() const {
  uint32_t epoch = getLocalEpoch();
  if (epoch == 0) return 0;
  
  uint32_t secondsOfDay = epoch % 86400;
  return (uint16_t)(secondsOfDay / 60);
}

String TimeManager::getTimeString() const {
  if (!isTimeSet) return "Not Set";
  
  uint8_t dow = getDayOfWeek();
  uint16_t mod = getMinuteOfDay();
  uint8_t hour = mod / 60;
  uint8_t minute = mod % 60;
  
  const char* days[] = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};
  
  char buf[32];
  snprintf(buf, sizeof(buf), "%s %02u:%02u", days[dow], hour, minute);
  return String(buf);
}

void TimeManager::save() {
#if defined(ESP32)
  if (!isTimeSet) return;
  
  Preferences prefs;
  if (!prefs.begin(NVS_NAMESPACE, false)) {
    LOG("TimeManager: Failed to save time to NVS");
    return;
  }
  
  uint32_t currentEpoch = getLocalEpoch();
  prefs.putUInt("lastEpoch", currentEpoch);
  prefs.putInt("tzOffset", timezoneOffsetMin);
  prefs.end();
  
  LOG("TimeManager: Time saved to NVS - epoch=%lu, tz=%ld",
      (unsigned long)currentEpoch, (long)timezoneOffsetMin);
#endif
}

bool TimeManager::load() {
#if defined(ESP32)
  Preferences prefs;
  if (!prefs.begin(NVS_NAMESPACE, true)) {
    LOG("TimeManager: Failed to open NVS");
    return false;
  }
  
  uint32_t savedEpoch = prefs.getUInt("lastEpoch", 0);
  int32_t savedTz = prefs.getInt("tzOffset", 0);
  prefs.end();
  
  if (savedEpoch > 0) {
    epochBase = (int64_t)savedEpoch;
    timezoneOffsetMin = savedTz;
    epochSetAtMs = (int64_t)millis();
    isTimeSet = true;
    
    LOG("TimeManager: Time restored from NVS - epoch=%lu, tz=%ld",
        (unsigned long)savedEpoch, (long)savedTz);
    LOG("TimeManager: Restored time: %s", getTimeString().c_str());
    
    return true;
  }
  
  LOG("TimeManager: No saved time in NVS");
  return false;
#else
  LOG("TimeManager: NVS not supported on ESP8266");
  return false;
#endif
}

void TimeManager::clearTime() {
#if defined(ESP32)
  Preferences prefs;
  if (!prefs.begin(NVS_NAMESPACE, false)) {
    LOG("TimeManager: Failed to open NVS for clearing");
    return;
  }
  
  prefs.remove("lastEpoch");
  prefs.remove("tzOffset");
  prefs.end();
  
  epochBase = 0;
  epochSetAtMs = 0;
  timezoneOffsetMin = 0;
  isTimeSet = false;
  
  LOG("TimeManager: Time cleared from NVS");
#else
  LOG("TimeManager: NVS not supported on ESP8266");
#endif
}
