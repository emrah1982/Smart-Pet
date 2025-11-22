/**
 * ============================================================================
 * SMART PET FEEDER - Professional Modular Firmware
 * ============================================================================
 * 
 * Version: 4.0.0
 * Platform: ESP32 / ESP8266
 * 
 * Features:
 * - Modular architecture with clean separation of concerns
 * - Mode selection (offline/online)
 * - Persistent configuration in NVS
 * - Time synchronization with auto-save
 * - Flexible feed scheduling
 * - Web-based configuration portal
 * - Servo motor control with state machine
 * 
 * File Structure:
 * - Config.h              : Global configuration and data structures
 * - ModeManager.*         : Operation mode management
 * - ServoController.*     : Servo motor control
 * - TimeManager.*         : Time tracking and persistence
 * - OfflineScheduler.*    : Feed scheduling logic
 * - WebPortal.*           : Web server and API handlers
 * - WebPortalPages.h      : HTML pages
 * - SmartFeeder.ino       : Main application (this file)
 * 
 * Usage:
 * 1. Flash firmware to ESP32/ESP8266
 * 2. Connect to "Feeder_AP" WiFi (password: fEEd_ME.199!)
 * 3. Browser will open automatically (or go to http://192.168.1.1)
 * 4. Select operation mode (offline/online)
 * 5. Sync time and configure feed schedule
 * 6. Device will remember settings after power loss
 * 
 * ============================================================================
 */

#include "Config.h"
#include "ModeManager.h"
#include "ServoController.h"
#include "TimeManager.h"
#include "OfflineScheduler.h"
#include "WiFiManager.h"
#include "BackendClient.h"
#include "WebPortal.h"

// ================== Global Objects ==================
ModeManager modeManager;
ServoController servoController;
TimeManager timeManager;
WiFiManager wifiManager;
BackendClient backendClient;
OfflineScheduler scheduler(&timeManager, &servoController);
WebPortal webPortal(&modeManager, &timeManager, &scheduler, &wifiManager);

SystemState currentState = STATE_BOOT;

// ================== Function Prototypes ==================
void printWelcomeBanner();
void printSystemInfo();
bool initializeHardware();
bool initializeModules();
void updateStateMachine();

// ================== Setup ==================
void setup() {
  // Initialize serial
  Serial.begin(BAUDRATE);
  delay(100);
  
  printWelcomeBanner();
  
  // Initialize hardware
  if (!initializeHardware()) {
    LOG("FATAL: Hardware initialization failed");
    currentState = STATE_ERROR;
    return;
  }
  
  // Initialize modules
  if (!initializeModules()) {
    LOG("FATAL: Module initialization failed");
    currentState = STATE_ERROR;
    return;
  }
  
  printSystemInfo();
  
  // Check if mode is selected
  if (!modeManager.isModeSelected()) {
    LOG("No mode selected - waiting for user selection");
    currentState = STATE_MODE_SELECTION;
  } else {
    LOG("Mode: %s", modeManager.getModeString());
    currentState = STATE_READY;
  }
  
  LOG("Setup complete - entering main loop");
}

// ================== Loop ==================
void loop() {
  // Check for serial commands
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    cmd.toUpperCase();
    
    if (cmd == "RESET") {
      LOG("!!! FACTORY RESET REQUESTED !!!");
      LOG("Clearing all NVS data...");
      modeManager.reset();
      timeManager.clearTime();
      scheduler.clearSchedule();
      LOG("Reset complete! Rebooting...");
      delay(1000);
      ESP.restart();
    } else if (cmd == "STATUS") {
      printSystemInfo();
    }
  }
  
  // Update state machine
  updateStateMachine();
  
  // Handle web requests
  webPortal.handleClient();
  
  // Update servo controller
  servoController.tick();
  
  // Update scheduler (if in ready state)
  if (currentState == STATE_READY) {
    // Online mode: Check backend for feed schedule
    if (modeManager.getMode() == MODE_ONLINE) {
      wifiManager.maintain();
      
#if BACKEND_ENABLED
      // Check backend feed schedule
      uint32_t feedDuration = 0;
      if (backendClient.checkFeedSchedule(feedDuration)) {
        LOG("Backend: Feed command received");
        
        // Override duration if specified
        if (feedDuration > 0) {
          scheduler.setOpenHoldDuration(feedDuration);
        }
        
        // Trigger feed
        servoController.open();
        currentState = STATE_FEEDING;
        
        // Log feed event
        String meta = "{\"duration_ms\":" + String(feedDuration > 0 ? feedDuration : OPEN_HOLD_MS) + ",\"source\":\"backend\"}";
        backendClient.sendLog("info", "Feeding triggered by backend", meta);
      }
#endif
    } else {
      // Offline mode: Use local scheduler
      scheduler.tick();
    }
  }
  
  // Small delay to prevent watchdog timeout
  yield();
}

// ================== Helper Functions ==================

void printWelcomeBanner() {
  LOG("============================================");
  LOG("   SMART PET FEEDER - Professional v%s", FIRMWARE_VERSION);
  LOG("   Build: %s", FIRMWARE_BUILD_DATE);
  LOG("============================================");
  
#if defined(ESP32)
  LOG("Platform: ESP32");
  uint64_t chipid = ESP.getEfuseMac();
  LOG("Chip ID: %04X%08X", (uint16_t)(chipid >> 32), (uint32_t)chipid);
#elif defined(ESP8266)
  LOG("Platform: ESP8266");
  LOG("Chip ID: %08X", (unsigned int)ESP.getChipId());
#endif
  
  LOG("Free Heap: %u bytes", ESP.getFreeHeap());
  LOG("============================================");
}

void printSystemInfo() {
  LOG("============================================");
  LOG("SYSTEM INFORMATION:");
  LOG("--------------------------------------------");
  LOG("Mode: %s", modeManager.getModeString());
  LOG("Mode Selected: %s", modeManager.isModeSelected() ? "YES" : "NO");
  LOG("Time Set: %s", timeManager.isSet() ? "YES" : "NO");
  
  if (timeManager.isSet()) {
    LOG("Current Time: %s", timeManager.getTimeString().c_str());
  }
  
  const ScheduleConfig& cfg = scheduler.getConfig();
  LOG("Feed Times: %u", cfg.timesCount);
  for (uint8_t i = 0; i < cfg.timesCount; i++) {
    LOG("  - %02u:%02u", cfg.times[i].hour, cfg.times[i].minute);
  }
  
  LOG("Servo Angle: %u°", cfg.servoAngle);
  LOG("Hold Duration: %lu ms", (unsigned long)cfg.openHoldMs);
  LOG("Excluded Days: 0x%02X", cfg.excludeDaysBitmap);
  
  if (webPortal.isAPStarted()) {
    LOG("Web Portal: http://192.168.1.1");
  }
  
  LOG("============================================");
}

bool initializeHardware() {
  LOG("Initializing hardware...");
  
  // Initialize servo
  if (!servoController.begin()) {
    LOG("ERROR: Servo initialization failed");
    return false;
  }
  
  LOG("Hardware initialized successfully");
  return true;
}

bool initializeModules() {
  LOG("Initializing modules...");
  
  // Initialize mode manager
  if (!modeManager.begin()) {
    LOG("Mode manager initialized (no saved mode)");
  } else {
    LOG("Mode manager initialized (mode: %s)", modeManager.getModeString());
  }
  
  // Initialize time manager
  if (!timeManager.begin()) {
    LOG("Time manager initialized (no saved time)");
  } else {
    LOG("Time manager initialized (time: %s)", timeManager.getTimeString().c_str());
  }
  
  // Initialize scheduler
  if (!scheduler.begin()) {
    LOG("Scheduler initialized (no saved config)");
  } else {
    LOG("Scheduler initialized");
  }
  
  // Initialize WiFi manager and backend client (for online mode)
  if (modeManager.getMode() == MODE_ONLINE) {
    if (!wifiManager.begin()) {
      LOG("WiFi manager initialized (no saved credentials)");
    } else {
      LOG("WiFi manager initialized");
      // Try to connect with saved credentials
      wifiManager.connectSaved();
    }
    
    // Initialize backend client with token and HTTPS support
#if BACKEND_ENABLED
    backendClient.begin(BACKEND_HOST, BACKEND_PORT, BACKEND_AUTH_TOKEN, BACKEND_USE_HTTPS);
    backendClient.setTimezoneOffset(timeManager.getTimezoneOffset());
    LOG("Backend client initialized - MAC: %s", backendClient.getMacAddress().c_str());
    
    // Sync schedule from backend on startup
    if (backendClient.syncScheduleFromBackend()) {
      LOG("Initial schedule sync successful");
    } else {
      LOG("Initial schedule sync failed - will retry later");
    }
#endif
  }
  
  // Initialize web portal
  if (!webPortal.begin()) {
    LOG("ERROR: Web portal initialization failed");
    return false;
  }
  
  LOG("All modules initialized successfully");
  return true;
}

void updateStateMachine() {
  static SystemState lastState = STATE_BOOT;
  
  // Log state changes
  if (currentState != lastState) {
    LOG("State: %d -> %d", lastState, currentState);
    lastState = currentState;
  }
  
  switch (currentState) {
    case STATE_BOOT:
      // Boot complete, move to next state
      currentState = STATE_INITIALIZING;
      break;
      
    case STATE_INITIALIZING:
      // Initialization complete in setup()
      break;
      
    case STATE_MODE_SELECTION:
      // Wait for user to select mode
      if (modeManager.isModeSelected()) {
        LOG("Mode selected: %s", modeManager.getModeString());
        currentState = STATE_READY;
        printSystemInfo();
      }
      break;
      
    case STATE_READY:
      // Normal operation
      // Check if feeding is in progress
      if (servoController.getState() != MOTOR_IDLE) {
        currentState = STATE_FEEDING;
      }
      break;
      
    case STATE_FEEDING:
      // Wait for feeding to complete
      if (servoController.getState() == MOTOR_IDLE) {
        currentState = STATE_READY;
      }
      break;
      
    case STATE_ERROR:
      // Error state - halt operation
      static uint32_t lastErrorLog = 0;
      if (millis() - lastErrorLog > 5000) {
        LOG("ERROR STATE - System halted");
        lastErrorLog = millis();
      }
      break;
  }
}
