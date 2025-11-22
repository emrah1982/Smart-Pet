#ifndef MODE_MANAGER_H
#define MODE_MANAGER_H

#include "Config.h"

/**
 * @brief Manages operation mode selection and persistence
 * 
 * Handles user mode selection (offline/online) and stores it in NVS.
 * Provides thread-safe access to current mode.
 */
class ModeManager {
private:
  OperationMode currentMode;
  bool isSelected;
  
public:
  ModeManager() : currentMode(MODE_NOT_SELECTED), isSelected(false) {}
  
  /**
   * @brief Initialize mode manager and load saved mode from NVS
   * @return true if mode was previously selected, false otherwise
   */
  bool begin();
  
  /**
   * @brief Set operation mode
   * @param mode The mode to set (MODE_OFFLINE or MODE_ONLINE)
   * @return true if mode was set successfully
   */
  bool setMode(OperationMode mode);
  
  /**
   * @brief Get current operation mode
   * @return Current mode
   */
  OperationMode getMode() const { return currentMode; }
  
  /**
   * @brief Check if user has selected a mode
   * @return true if mode is selected
   */
  bool isModeSelected() const { return isSelected; }
  
  /**
   * @brief Reset mode selection (for factory reset)
   */
  void reset();
  
  /**
   * @brief Get mode as string for logging
   */
  const char* getModeString() const;
};

#endif // MODE_MANAGER_H
