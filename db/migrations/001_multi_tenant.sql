-- Migration: introduce multi-user and multi-device schema without losing existing data
-- Safe to re-run: uses IF NOT EXISTS and guarded INSERTs

USE feeder_db;

-- 1) Core tables
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  display_name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS devices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  serial VARCHAR(64) NULL,
  esp_host VARCHAR(255) NOT NULL,
  esp_port INT NOT NULL DEFAULT 80,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_devices_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_devices_user (user_id)
);

CREATE TABLE IF NOT EXISTS device_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_id INT NOT NULL,
  animal_type VARCHAR(32) NOT NULL DEFAULT 'dog_medium',
  has_weight_sensor TINYINT(1) NOT NULL DEFAULT 1,
  portion_default INT NOT NULL DEFAULT 100,
  max_open_ms INT NOT NULL DEFAULT 12000,
  scale_factor DECIMAL(10,2) NOT NULL DEFAULT 420.00,
  telemetry_ms INT NOT NULL DEFAULT 7000,
  servo_speed INT NOT NULL DEFAULT 50,
  motor_speed INT NOT NULL DEFAULT 75,
  org VARCHAR(64) NULL,
  site VARCHAR(64) NULL,
  mqtt_host VARCHAR(255) NULL,
  mqtt_port INT NULL,
  mqtt_group TINYINT(1) NOT NULL DEFAULT 0,
  admin_user VARCHAR(64) NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_device_settings_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
  UNIQUE KEY uq_device_settings_device (device_id)
);

CREATE TABLE IF NOT EXISTS schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_id INT NOT NULL,
  name VARCHAR(100) NOT NULL DEFAULT 'Default',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_schedules_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
  INDEX idx_schedules_device (device_id)
);

CREATE TABLE IF NOT EXISTS schedule_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  schedule_id INT NOT NULL,
  time CHAR(5) NOT NULL,
  amount INT NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_schedule_items_schedule FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
  INDEX idx_schedule_items_schedule (schedule_id)
);

CREATE TABLE IF NOT EXISTS device_pins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_id INT NOT NULL,
  pin_name VARCHAR(64) NOT NULL,
  gpio INT NOT NULL,
  pin_function VARCHAR(128) NULL,
  CONSTRAINT fk_device_pins_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
  UNIQUE KEY uq_device_pin (device_id, pin_name)
);

CREATE TABLE IF NOT EXISTS security_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_id INT NOT NULL,
  api_token VARCHAR(255) NULL,
  allow_remote TINYINT(1) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_security_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
  UNIQUE KEY uq_security_device (device_id)
);

-- 2) Seed a demo user if none exists
INSERT INTO users (email, password_hash, display_name)
SELECT 'demo@example.com', NULL, 'Demo User'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'demo@example.com');

-- 3) Migrate legacy settings -> devices (create one device if none exists)
--    Use the most recent record from legacy settings as default host/port
INSERT INTO devices (user_id, name, serial, esp_host, esp_port)
SELECT u.id, 'Feeder-Demo', 'A1B2C3D4', s.esp_host, s.esp_port
FROM users u
CROSS JOIN (
  SELECT esp_host, esp_port FROM settings ORDER BY updated_at DESC LIMIT 1
) s
WHERE u.email = 'demo@example.com'
  AND NOT EXISTS (SELECT 1 FROM devices d WHERE d.user_id = u.id);

-- 4) Ensure a device_settings row exists for each device
INSERT INTO device_settings (device_id)
SELECT d.id FROM devices d
LEFT JOIN device_settings ds ON ds.device_id = d.id
WHERE ds.id IS NULL;

-- 5) Ensure a default schedule and items exist for each device
INSERT INTO schedules (device_id, name, enabled)
SELECT d.id, 'Default', 1 FROM devices d
LEFT JOIN schedules s ON s.device_id = d.id
WHERE s.id IS NULL;

INSERT INTO schedule_items (schedule_id, time, amount, enabled)
SELECT s.id, '08:00', 100, 1 FROM schedules s
LEFT JOIN schedule_items si ON si.schedule_id = s.id
WHERE si.id IS NULL
UNION ALL
SELECT s.id, '14:00', 120, 1 FROM schedules s
LEFT JOIN schedule_items si ON si.schedule_id = s.id
WHERE si.id IS NULL
UNION ALL
SELECT s.id, '20:00', 90, 1 FROM schedules s
LEFT JOIN schedule_items si ON si.schedule_id = s.id
WHERE si.id IS NULL;

-- 6) Ensure security_settings exists
INSERT INTO security_settings (device_id, api_token, allow_remote)
SELECT d.id, NULL, 0 FROM devices d
LEFT JOIN security_settings ss ON ss.device_id = d.id
WHERE ss.id IS NULL;
