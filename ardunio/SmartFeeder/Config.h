#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

// ================== Firmware Version ==================
#define FIRMWARE_VERSION "4.0.0"
#define FIRMWARE_BUILD_DATE __DATE__ " " __TIME__

// ================== Debug Configuration ==================
#define DEBUG_ENABLED 1

#if DEBUG_ENABLED
  #define LOG(fmt, ...) do { \
    char __buf[160]; \
    snprintf(__buf, sizeof(__buf), "[%lu] " fmt, millis(), ##__VA_ARGS__); \
    Serial.println(__buf); \
  } while(0)
#else
  #define LOG(fmt, ...) ((void)0)
#endif

// ================== Hardware Configuration ==================
#define BAUDRATE 115200

// Servo Configuration
#define SERVO_PIN_ESP32     18
#define SERVO_PIN_ESP8266   14
#define SERVO_MIN_US        500
#define SERVO_MAX_US        2400
#define SERVO_CLOSED_US     1000
#define SERVO_OPEN_US       1700
#define SERVO_DEFAULT_ANGLE 90

// Timing Configuration
#define OPEN_HOLD_MS        3000    // Default hold time (3 seconds)
#define SCHEDULER_TICK_MS   250     // Scheduler check interval
#define AUTO_SAVE_INTERVAL  10      // Auto-save every 10 minutes

// ================== Network Configuration ==================
// Access Point Settings
#define AP_SSID             "Feeder_AP"
#define AP_PASSWORD         "fEEd_ME.199!"
#define AP_CHANNEL          6
#define AP_HIDDEN           false
#define AP_MAX_CONNECTIONS  4
#define AP_TIMEOUT_MS       10000
#define AP_RETRY_COUNT      3
#define AP_RETRY_DELAY_MS   1000

// IP Configuration
#define AP_IP_ADDR          IPAddress(192, 168, 1, 1)
#define AP_GATEWAY          IPAddress(192, 168, 1, 1)
#define AP_SUBNET           IPAddress(255, 255, 255, 0)

// DNS Configuration
#define DNS_PORT            53
#define CAPTIVE_PORTAL_URL  "http://feeder.local/"

// Backend API Configuration (for online mode)
#define BACKEND_HOST        "192.168.1.100"
#define BACKEND_PORT        8082
#define BACKEND_ENABLED     true

// ================== Storage Configuration ==================
#define NVS_NAMESPACE       "feeder"
#define NVS_VERSION         2
#define MAX_FEED_TIMES      8

// ================== Operation Modes ==================
enum OperationMode {
  MODE_NOT_SELECTED = 0,
  MODE_OFFLINE      = 1,  // Local scheduler only
  MODE_ONLINE       = 2   // WiFi + Backend API
};

// ================== System States ==================
enum SystemState {
  STATE_BOOT,
  STATE_MODE_SELECTION,
  STATE_INITIALIZING,
  STATE_READY,
  STATE_FEEDING,
  STATE_ERROR
};

// ================== Motor States ==================
enum MotorState {
  MOTOR_IDLE     = 0,
  MOTOR_OPENING  = 1,
  MOTOR_OPEN     = 2,
  MOTOR_CLOSING  = 3
};

// ================== Data Structures ==================
struct FeedTime {
  uint8_t hour;
  uint8_t minute;
  
  bool operator==(const FeedTime& other) const {
    return hour == other.hour && minute == other.minute;
  }
  
  uint16_t toMinutes() const {
    return hour * 60 + minute;
  }
};

struct ScheduleConfig {
  FeedTime times[MAX_FEED_TIMES];
  uint8_t timesCount;
  uint8_t excludeDaysBitmap;  // Bit 0=Sun, 1=Mon, ..., 6=Sat
  uint16_t servoAngle;
  uint32_t openHoldMs;
  
  // Last run tracking (prevent duplicate feeds)
  uint8_t lastRunDay[MAX_FEED_TIMES];
  uint16_t lastRunMinute[MAX_FEED_TIMES];
};

struct DeviceConfig {
  OperationMode mode;
  bool modeSelected;
  ScheduleConfig schedule;
  
  // Time tracking
  int64_t epochBase;
  int64_t epochSetAtMs;
  int32_t timezoneOffsetMin;
};

#endif // CONFIG_H
