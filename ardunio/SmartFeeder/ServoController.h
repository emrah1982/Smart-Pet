#ifndef SERVO_CONTROLLER_H
#define SERVO_CONTROLLER_H

#include "Config.h"

#if defined(ESP8266)
  #include <Servo.h>
#elif defined(ESP32)
  #include <ESP32Servo.h>
#endif

/**
 * @brief Controls servo motor for feeder lid
 * 
 * Manages servo position, state machine for opening/closing,
 * and timing for hold-open duration.
 */
class ServoController {
private:
  Servo servo;
  MotorState state;
  uint16_t currentAngle;
  uint16_t targetAngle;
  uint32_t openHoldMs;
  uint32_t stateStartTime;
  
  uint16_t closedPositionUs;
  uint16_t openPositionUs;
  
  bool isAttached;
  
  /**
   * @brief Convert angle (0-180) to microseconds
   */
  uint16_t angleToMicroseconds(uint16_t angle);
  
  /**
   * @brief Move servo to target position immediately (V1 style)
   */
  void moveToTarget();
  
public:
  ServoController();
  
  /**
   * @brief Initialize servo hardware
   * @return true if initialization successful
   */
  bool begin();
  
  /**
   * @brief Update servo state machine (call in loop)
   */
  void tick();
  
  /**
   * @brief Open lid to specified angle
   * @param angle Target angle (0-180 degrees)
   */
  void open(uint16_t angle = SERVO_DEFAULT_ANGLE);
  
  /**
   * @brief Close lid
   */
  void close();
  
  /**
   * @brief Emergency stop
   */
  void stop();
  
  /**
   * @brief Set hold-open duration
   * @param ms Duration in milliseconds
   */
  void setHoldDuration(uint32_t ms) { openHoldMs = ms; }
  
  /**
   * @brief Get current state
   */
  MotorState getState() const { return state; }
  
  /**
   * @brief Check if motor is idle
   */
  bool isIdle() const { return state == MOTOR_IDLE; }
  
  /**
   * @brief Get current angle
   */
  uint16_t getCurrentAngle() const { return currentAngle; }
};

#endif // SERVO_CONTROLLER_H
