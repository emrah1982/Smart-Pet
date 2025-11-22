#include "ModeManager.h"

#if defined(ESP32)
  #include <Preferences.h>
#endif

bool ModeManager::begin() {
#if defined(ESP32)
  Preferences prefs;
  if (!prefs.begin(NVS_NAMESPACE, true)) {
    LOG("ModeManager: Failed to open NVS");
    return false;
  }
  
  isSelected = prefs.getBool("modeSelected", false);
  currentMode = (OperationMode)prefs.getUChar("mode", MODE_NOT_SELECTED);
  prefs.end();
  
  LOG("ModeManager: Loaded mode=%s, selected=%s", 
      getModeString(), isSelected ? "YES" : "NO");
  
  return isSelected;
#else
  LOG("ModeManager: NVS not supported on ESP8266");
  return false;
#endif
}

bool ModeManager::setMode(OperationMode mode) {
  if (mode != MODE_OFFLINE && mode != MODE_ONLINE) {
    LOG("ModeManager: Invalid mode %d", mode);
    return false;
  }
  
  currentMode = mode;
  isSelected = true;
  
#if defined(ESP32)
  Preferences prefs;
  if (!prefs.begin(NVS_NAMESPACE, false)) {
    LOG("ModeManager: Failed to save mode to NVS");
    return false;
  }
  
  prefs.putBool("modeSelected", isSelected);
  prefs.putUChar("mode", (uint8_t)currentMode);
  prefs.end();
#endif
  
  LOG("ModeManager: Mode set to %s", getModeString());
  return true;
}

void ModeManager::reset() {
#if defined(ESP32)
  Preferences prefs;
  if (prefs.begin(NVS_NAMESPACE, false)) {
    prefs.remove("modeSelected");
    prefs.remove("mode");
    prefs.end();
  }
#endif
  
  currentMode = MODE_NOT_SELECTED;
  isSelected = false;
  LOG("ModeManager: Mode reset");
}

const char* ModeManager::getModeString() const {
  switch (currentMode) {
    case MODE_OFFLINE: return "OFFLINE";
    case MODE_ONLINE:  return "ONLINE";
    default:           return "NOT_SELECTED";
  }
}
