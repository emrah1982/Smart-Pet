#include "ServoController.h"

ServoController::ServoController() 
  : state(MOTOR_IDLE)
  , currentAngle(0)
  , targetAngle(0)
  , openHoldMs(OPEN_HOLD_MS)
  , stateStartTime(0)
  , closedPositionUs(SERVO_CLOSED_US)
  , openPositionUs(SERVO_OPEN_US)
  , isAttached(false) {
}

bool ServoController::begin() {
#if defined(ESP32)
  int pin = SERVO_PIN_ESP32;
#elif defined(ESP8266)
  int pin = SERVO_PIN_ESP8266;
#else
  LOG("ServoController: Unsupported platform");
  return false;
#endif

  servo.attach(pin, SERVO_MIN_US, SERVO_MAX_US);
  isAttached = true;
  
  // Move to closed position
  servo.writeMicroseconds(closedPositionUs);
  currentAngle = 0;
  
  LOG("ServoController: Initialized on pin %d", pin);
  return true;
}

uint16_t ServoController::angleToMicroseconds(uint16_t angle) {
  if (angle > 180) angle = 180;
  
  // Map 0-180 degrees to SERVO_MIN_US - SERVO_MAX_US
  uint32_t range = SERVO_MAX_US - SERVO_MIN_US;
  uint32_t us = SERVO_MIN_US + (range * angle / 180);
  
  return (uint16_t)us;
}

void ServoController::moveToTarget() {
  if (!isAttached) return;
  
  uint16_t targetUs = (targetAngle == 0) ? closedPositionUs : openPositionUs;
  servo.writeMicroseconds(targetUs);
  currentAngle = targetAngle;
  
  LOG("ServoController: Moved to %u° (%u µs)", currentAngle, targetUs);
}

void ServoController::tick() {
  if (!isAttached) return;
  
  uint32_t now = millis();
  
  switch (state) {
    case MOTOR_OPENING:
      // Move immediately to open position (V1 style)
      moveToTarget();
      state = MOTOR_OPEN;
      stateStartTime = now;
      LOG("ServoController: Lid opened, holding for %lu ms", (unsigned long)openHoldMs);
      break;
      
    case MOTOR_OPEN:
      // Check if hold time elapsed
      if ((now - stateStartTime) >= openHoldMs) {
        LOG("ServoController: Hold time elapsed, closing");
        close();
      }
      break;
      
    case MOTOR_CLOSING:
      // Move immediately to closed position
      moveToTarget();
      state = MOTOR_IDLE;
      LOG("ServoController: Lid closed");
      break;
      
    case MOTOR_IDLE:
    default:
      // Nothing to do
      break;
  }
}

void ServoController::open(uint16_t angle) {
  if (state != MOTOR_IDLE) {
    LOG("ServoController: Cannot open, motor busy (state=%d)", state);
    return;
  }
  
  if (angle > 180) angle = 180;
  
  targetAngle = angle;
  state = MOTOR_OPENING;
  
  LOG("ServoController: Opening to %u°", angle);
}

void ServoController::close() {
  if (state == MOTOR_IDLE || state == MOTOR_CLOSING) {
    return;
  }
  
  targetAngle = 0;
  state = MOTOR_CLOSING;
  
  LOG("ServoController: Closing");
}

void ServoController::stop() {
  state = MOTOR_IDLE;
  LOG("ServoController: Emergency stop");
}
