CREATE DATABASE IF NOT EXISTS feeder_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE feeder_db;

CREATE TABLE IF NOT EXISTS settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  esp_host VARCHAR(255) NOT NULL,
  esp_port INT NOT NULL DEFAULT 80,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO settings (esp_host, esp_port)
SELECT '192.168.1.50', 80
WHERE NOT EXISTS (SELECT 1 FROM settings);

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
  model VARCHAR(64) NOT NULL DEFAULT 'esp8266_wemos_d1',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_devices_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_devices_user (user_id)
);

-- Backfill: add column if table already existed without 'model'
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS add_col_devices_model()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'devices' AND COLUMN_NAME = 'model'
  ) THEN
    ALTER TABLE devices ADD COLUMN model VARCHAR(64) NOT NULL DEFAULT 'esp8266_wemos_d1' AFTER esp_port;
  END IF;
END //
DELIMITER ;
CALL add_col_devices_model();
DROP PROCEDURE IF EXISTS add_col_devices_model;

-- Backfill: add 'active' column if table existed without it
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS add_col_devices_active()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'devices' AND COLUMN_NAME = 'active'
  ) THEN
    ALTER TABLE devices ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1 AFTER model;
  END IF;
END //
DELIMITER ;
CALL add_col_devices_active();
DROP PROCEDURE IF EXISTS add_col_devices_active;

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
  motor_type VARCHAR(32) NOT NULL DEFAULT 'dc',
  stepper_speed INT NOT NULL DEFAULT 60,
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

-- Backfill: add columns if table exists without them
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS add_cols_device_settings_motor()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'device_settings' AND COLUMN_NAME = 'motor_type'
  ) THEN
    ALTER TABLE device_settings ADD COLUMN motor_type VARCHAR(32) NOT NULL DEFAULT 'dc' AFTER motor_speed;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'device_settings' AND COLUMN_NAME = 'stepper_speed'
  ) THEN
    ALTER TABLE device_settings ADD COLUMN stepper_speed INT NOT NULL DEFAULT 60 AFTER motor_type;
  END IF;
END //
DELIMITER ;
CALL add_cols_device_settings_motor();
DROP PROCEDURE IF EXISTS add_cols_device_settings_motor;

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
  duration_ms INT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_schedule_items_schedule FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
  INDEX idx_schedule_items_schedule (schedule_id)
);

-- Backfill: add duration_ms if missing
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS add_col_schedule_items_duration()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schedule_items' AND COLUMN_NAME = 'duration_ms'
  ) THEN
    ALTER TABLE schedule_items ADD COLUMN duration_ms INT NULL AFTER amount;
  END IF;
END //
DELIMITER ;
CALL add_col_schedule_items_duration();
DROP PROCEDURE IF EXISTS add_col_schedule_items_duration;

CREATE TABLE IF NOT EXISTS device_modules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_id INT NOT NULL,
  module_name VARCHAR(128) NOT NULL,
  module_type VARCHAR(64) NOT NULL,
  usage_purpose VARCHAR(255) NULL,
  description TEXT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_device_modules_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
  INDEX idx_device_modules_device (device_id)
);

CREATE TABLE IF NOT EXISTS module_pins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  module_id INT NOT NULL,
  wemos_pin VARCHAR(16) NOT NULL,
  gpio_number INT NULL,
  power_connection VARCHAR(64) NULL,
  notes TEXT NULL,
  CONSTRAINT fk_module_pins_module FOREIGN KEY (module_id) REFERENCES device_modules(id) ON DELETE CASCADE,
  INDEX idx_module_pins_module (module_id)
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

-- Device logs (Arduino & UI)
CREATE TABLE IF NOT EXISTS device_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_id INT NOT NULL,
  level VARCHAR(16) NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  meta JSON NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_device_logs_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
  INDEX idx_device_logs_device (device_id),
  INDEX idx_device_logs_created (created_at)
);

INSERT INTO users (email, password_hash, display_name)
SELECT 'demo@example.com', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Demo User'
WHERE NOT EXISTS (SELECT 1 FROM users);

INSERT INTO devices (user_id, name, serial, esp_host, esp_port, model)
SELECT u.id, 'Feeder-Demo', 'A1B2C3D4', '192.168.1.50', 80, 'esp8266_wemos_d1'
FROM users u
WHERE u.email = 'demo@example.com'
AND NOT EXISTS (SELECT 1 FROM devices d WHERE d.user_id = u.id AND d.name = 'Feeder-Demo');

INSERT INTO devices (user_id, name, serial, esp_host, esp_port, model)
SELECT u.id, 'Feeder-Bahçe', 'B2C3D4E5', '192.168.1.51', 80, 'esp8266_wemos_d1'
FROM users u
WHERE u.email = 'demo@example.com'
AND NOT EXISTS (SELECT 1 FROM devices d WHERE d.user_id = u.id AND d.name = 'Feeder-Bahçe');

INSERT INTO devices (user_id, name, serial, esp_host, esp_port, model)
SELECT u.id, 'Feeder-Garaj', 'C3D4E5F6', '192.168.1.52', 80, 'esp8266_wemos_d1'
FROM users u
WHERE u.email = 'demo@example.com'
AND NOT EXISTS (SELECT 1 FROM devices d WHERE d.user_id = u.id AND d.name = 'Feeder-Garaj');

-- Extra demo device for Freeder-Demo with custom serial/MAC "A1B2C3D4xs"
INSERT INTO devices (user_id, name, serial, esp_host, esp_port, model)
SELECT u.id, 'Freeder-Demo', 'A1B2C3D4xs', '192.168.1.50', 80, 'esp8266_wemos_d1'
FROM users u
WHERE u.email = 'demo@example.com'
AND NOT EXISTS (SELECT 1 FROM devices d WHERE d.user_id = u.id AND d.serial = 'A1B2C3D4xs');

-- Optional demo Raspberry Pi Zero W device
INSERT INTO devices (user_id, name, serial, esp_host, esp_port, model)
SELECT u.id, 'Feeder-RPi', 'RPI-ZERO-W-1', '192.168.1.70', 80, 'raspberry_pi_zero_w'
FROM users u
WHERE u.email = 'demo@example.com'
AND NOT EXISTS (SELECT 1 FROM devices d WHERE d.user_id = u.id AND d.name = 'Feeder-RPi');

INSERT INTO device_settings (device_id, animal_type, has_weight_sensor, portion_default, max_open_ms, scale_factor, telemetry_ms, servo_speed, motor_speed, motor_type, stepper_speed, org, site, mqtt_host, mqtt_port, mqtt_group, admin_user)
SELECT d.id, 
  CASE d.name
    WHEN 'Feeder-Demo' THEN 'dog_medium'
    WHEN 'Feeder-Bahçe' THEN 'cat'
    WHEN 'Feeder-Garaj' THEN 'chicken'
    ELSE 'dog_medium'
  END,
  1,
  CASE d.name
    WHEN 'Feeder-Demo' THEN 300
    WHEN 'Feeder-Bahçe' THEN 80
    WHEN 'Feeder-Garaj' THEN 120
    ELSE 100
  END,
  12000, 420.00, 7000, 50, 75, 'dc', 60, 'myorg', 
  CASE d.name
    WHEN 'Feeder-Demo' THEN 'yard-01'
    WHEN 'Feeder-Bahçe' THEN 'garden-01'
    WHEN 'Feeder-Garaj' THEN 'garage-01'
    ELSE 'site-01'
  END,
  '192.168.1.10', 1883, 1, 'admin'
FROM devices d
JOIN users u ON u.id = d.user_id
WHERE u.email = 'demo@example.com'
AND NOT EXISTS (SELECT 1 FROM device_settings ds WHERE ds.device_id = d.id);

INSERT INTO schedules (device_id, name, enabled)
SELECT d.id, 'Default', 1
FROM devices d
JOIN users u ON u.id = d.user_id
WHERE u.email = 'demo@example.com'
AND NOT EXISTS (SELECT 1 FROM schedules s WHERE s.device_id = d.id);

INSERT INTO schedule_items (schedule_id, time, amount, duration_ms, enabled)
SELECT s.id, '08:00', 100, NULL, 1 FROM schedules s
WHERE NOT EXISTS (SELECT 1 FROM schedule_items si WHERE si.schedule_id = s.id)
UNION ALL
SELECT s.id, '14:00', 120, NULL, 1 FROM schedules s
WHERE NOT EXISTS (SELECT 1 FROM schedule_items si WHERE si.schedule_id = s.id)
UNION ALL
SELECT s.id, '20:00', 90, NULL, 1 FROM schedules s
WHERE NOT EXISTS (SELECT 1 FROM schedule_items si WHERE si.schedule_id = s.id);

-- Servo Motor (MG996R)
INSERT INTO device_modules (device_id, module_name, module_type, usage_purpose, description, enabled)
SELECT d.id, 'Servo Motor (MG996R)', 'servo', 'Kapak aç/kapa', 'Harici besleme, 1000µF + 100nF kondansatör ekle', 1
FROM devices d JOIN users u ON u.id = d.user_id WHERE u.email = 'demo@example.com'
AND NOT EXISTS (SELECT 1 FROM device_modules dm WHERE dm.device_id = d.id AND dm.module_type = 'servo');

INSERT INTO module_pins (module_id, wemos_pin, gpio_number, power_connection, notes)
SELECT dm.id, 'D4', 2, '+5V / GND', 'PWM sinyal pini'
FROM device_modules dm WHERE dm.module_type = 'servo'
AND NOT EXISTS (SELECT 1 FROM module_pins mp WHERE mp.module_id = dm.id AND mp.wemos_pin = 'D4');

-- DC Motor
INSERT INTO device_modules (device_id, module_name, module_type, usage_purpose, description, enabled)
SELECT d.id, 'DC Motor', 'dc_motor', 'Yem akışı', 'L298N veya MOSFET sürücü ile kontrol', 1
FROM devices d JOIN users u ON u.id = d.user_id WHERE u.email = 'demo@example.com'
AND NOT EXISTS (SELECT 1 FROM device_modules dm WHERE dm.device_id = d.id AND dm.module_type = 'dc_motor');

INSERT INTO module_pins (module_id, wemos_pin, gpio_number, power_connection, notes)
SELECT dm.id, 'D5', 14, 'Harici 9-12V', 'Motor yön kontrolü'
FROM device_modules dm WHERE dm.module_type = 'dc_motor'
AND NOT EXISTS (SELECT 1 FROM module_pins mp WHERE mp.module_id = dm.id AND mp.wemos_pin = 'D5');

INSERT INTO module_pins (module_id, wemos_pin, gpio_number, power_connection, notes)
SELECT dm.id, 'D6', 12, 'Harici 9-12V', 'Motor hız kontrolü (PWM)'
FROM device_modules dm WHERE dm.module_type = 'dc_motor'
AND NOT EXISTS (SELECT 1 FROM module_pins mp WHERE mp.module_id = dm.id AND mp.wemos_pin = 'D6');

-- HX711 Load Cell
INSERT INTO device_modules (device_id, module_name, module_type, usage_purpose, description, enabled)
SELECT d.id, 'HX711 Load Cell', 'load_cell', 'Ağırlık ölçümü', 'HX711 modülü ile bağlantı', 1
FROM devices d JOIN users u ON u.id = d.user_id WHERE u.email = 'demo@example.com'
AND NOT EXISTS (SELECT 1 FROM device_modules dm WHERE dm.device_id = d.id AND dm.module_type = 'load_cell');

INSERT INTO module_pins (module_id, wemos_pin, gpio_number, power_connection, notes)
SELECT dm.id, 'D2', 4, '+5V / GND', 'DT (Data)'
FROM device_modules dm WHERE dm.module_type = 'load_cell'
AND NOT EXISTS (SELECT 1 FROM module_pins mp WHERE mp.module_id = dm.id AND mp.wemos_pin = 'D2');

INSERT INTO module_pins (module_id, wemos_pin, gpio_number, power_connection, notes)
SELECT dm.id, 'D3', 0, '+5V / GND', 'SCK (Clock)'
FROM device_modules dm WHERE dm.module_type = 'load_cell'
AND NOT EXISTS (SELECT 1 FROM module_pins mp WHERE mp.module_id = dm.id AND mp.wemos_pin = 'D3');

-- DHT22 / DHT11
INSERT INTO device_modules (device_id, module_name, module_type, usage_purpose, description, enabled)
SELECT d.id, 'DHT22 / DHT11', 'temp_sensor', 'Sıcaklık & nem', '10kΩ pull-up direnci önerilir', 1
FROM devices d JOIN users u ON u.id = d.user_id WHERE u.email = 'demo@example.com'
AND NOT EXISTS (SELECT 1 FROM device_modules dm WHERE dm.device_id = d.id AND dm.module_type = 'temp_sensor');

INSERT INTO module_pins (module_id, wemos_pin, gpio_number, power_connection, notes)
SELECT dm.id, 'D7', 13, '+3.3V / GND', 'Data pini'
FROM device_modules dm WHERE dm.module_type = 'temp_sensor'
AND NOT EXISTS (SELECT 1 FROM module_pins mp WHERE mp.module_id = dm.id AND mp.wemos_pin = 'D7');

-- LED / Flaşör
INSERT INTO device_modules (device_id, module_name, module_type, usage_purpose, description, enabled)
SELECT d.id, 'LED / Flaşör', 'led', 'Durum bildirimi', 'LOW aktif olabilir (ters lojik)', 1
FROM devices d JOIN users u ON u.id = d.user_id WHERE u.email = 'demo@example.com'
AND NOT EXISTS (SELECT 1 FROM device_modules dm WHERE dm.device_id = d.id AND dm.module_type = 'led');

INSERT INTO module_pins (module_id, wemos_pin, gpio_number, power_connection, notes)
SELECT dm.id, 'D8', 15, '+3.3V / GND', 'Dijital çıkış'
FROM device_modules dm WHERE dm.module_type = 'led'
AND NOT EXISTS (SELECT 1 FROM module_pins mp WHERE mp.module_id = dm.id AND mp.wemos_pin = 'D8');

-- MOSFET Güç Kontrol
INSERT INTO device_modules (device_id, module_name, module_type, usage_purpose, description, enabled)
SELECT d.id, 'MOSFET Güç Kontrol', 'mosfet', 'Servo/Motor güç kesme', 'IRLZ44N/IRF520 ile kontrol', 1
FROM devices d JOIN users u ON u.id = d.user_id WHERE u.email = 'demo@example.com'
AND NOT EXISTS (SELECT 1 FROM device_modules dm WHERE dm.device_id = d.id AND dm.module_type = 'mosfet');

INSERT INTO module_pins (module_id, wemos_pin, gpio_number, power_connection, notes)
SELECT dm.id, 'D1', 5, 'Harici +5V', 'Gate pini'
FROM device_modules dm WHERE dm.module_type = 'mosfet'
AND NOT EXISTS (SELECT 1 FROM module_pins mp WHERE mp.module_id = dm.id AND mp.wemos_pin = 'D1');

-- Wi-Fi (ESP8266)
INSERT INTO device_modules (device_id, module_name, module_type, usage_purpose, description, enabled)
SELECT d.id, 'Wi-Fi (ESP8266)', 'wifi', 'İletişim', 'Dahili anten, harici modül gerekmez', 1
FROM devices d JOIN users u ON u.id = d.user_id WHERE u.email = 'demo@example.com'
AND NOT EXISTS (SELECT 1 FROM device_modules dm WHERE dm.device_id = d.id AND dm.module_type = 'wifi');

INSERT INTO module_pins (module_id, wemos_pin, gpio_number, power_connection, notes)
SELECT dm.id, 'Dahili', NULL, '3.3V', 'Dahili WiFi modülü'
FROM device_modules dm WHERE dm.module_type = 'wifi'
AND NOT EXISTS (SELECT 1 FROM module_pins mp WHERE mp.module_id = dm.id AND mp.wemos_pin = 'Dahili');

INSERT INTO security_settings (device_id, api_token, allow_remote)
SELECT d.id, NULL, 0 FROM devices d
JOIN users u ON u.id = d.user_id AND u.email = 'demo@example.com'
WHERE NOT EXISTS (SELECT 1 FROM security_settings ss WHERE ss.device_id = d.id);

-- Demo seed logs similar to Arduino postLog payloads
INSERT INTO device_logs (device_id, level, message, meta, created_at)
SELECT d.id, 'info', 'Feeding allowed by schedule',
       JSON_OBJECT('duration_ms', 8000, 'reason', 'seed_demo', 'source', 'init.sql'),
       NOW() - INTERVAL 30 MINUTE
FROM devices d
JOIN users u ON u.id = d.user_id AND u.email = 'demo@example.com'
WHERE d.name = 'Feeder-Demo'
  AND NOT EXISTS (
    SELECT 1 FROM device_logs dl
    WHERE dl.device_id = d.id AND dl.message = 'Feeding allowed by schedule'
  );

INSERT INTO device_logs (device_id, level, message, meta, created_at)
SELECT d.id, 'info', 'FEED_EXECUTED',
       JSON_OBJECT('duration_ms', 8000, 'portion', 300, 'source', 'init.sql'),
       NOW() - INTERVAL 25 MINUTE
FROM devices d
JOIN users u ON u.id = d.user_id AND u.email = 'demo@example.com'
WHERE d.name = 'Feeder-Demo'
  AND NOT EXISTS (
    SELECT 1 FROM device_logs dl
    WHERE dl.device_id = d.id AND dl.message = 'FEED_EXECUTED'
  );

INSERT INTO device_logs (device_id, level, message, meta, created_at)
SELECT d.id, 'warn', 'Feeding skipped due to cooldown',
       JSON_OBJECT('cooldown_minutes', 2, 'source', 'init.sql'),
       NOW() - INTERVAL 20 MINUTE
FROM devices d
JOIN users u ON u.id = d.user_id AND u.email = 'demo@example.com'
WHERE d.name = 'Feeder-Demo'
  AND NOT EXISTS (
    SELECT 1 FROM device_logs dl
    WHERE dl.device_id = d.id AND dl.message = 'Feeding skipped due to cooldown'
  );

-- Lid (door) open/close state demo logs
INSERT INTO device_logs (device_id, level, message, meta, created_at)
SELECT d.id, 'info', 'LID_OPEN',
       JSON_OBJECT('servo_angle', 0, 'duration_ms', 8000, 'source', 'init.sql'),
       NOW() - INTERVAL 18 MINUTE
FROM devices d
JOIN users u ON u.id = d.user_id AND u.email = 'demo@example.com'
WHERE d.name = 'Feeder-Demo'
  AND NOT EXISTS (
    SELECT 1 FROM device_logs dl
    WHERE dl.device_id = d.id AND dl.message = 'LID_OPEN'
  );

INSERT INTO device_logs (device_id, level, message, meta, created_at)
SELECT d.id, 'info', 'LID_CLOSED',
       JSON_OBJECT('servo_angle', 90, 'source', 'init.sql'),
       NOW() - INTERVAL 17 MINUTE
FROM devices d
JOIN users u ON u.id = d.user_id AND u.email = 'demo@example.com'
WHERE d.name = 'Feeder-Demo'
  AND NOT EXISTS (
    SELECT 1 FROM device_logs dl
    WHERE dl.device_id = d.id AND dl.message = 'LID_CLOSED'
  );

-- Raspberry Pi Zero W seed (modules & pins) for devices with model = 'raspberry_pi_zero_w'
-- Servo (PWM via GPIO18)
INSERT INTO device_modules (device_id, module_name, module_type, usage_purpose, description, enabled)
SELECT d.id, 'Servo Motor (PWM0)', 'servo', 'Kapak aç/kapa', 'GPIO18 PWM0 (pin 12)', 1
FROM devices d WHERE d.model = 'raspberry_pi_zero_w'
AND NOT EXISTS (SELECT 1 FROM device_modules dm WHERE dm.device_id = d.id AND dm.module_type = 'servo');

INSERT INTO module_pins (module_id, wemos_pin, gpio_number, power_connection, notes)
SELECT dm.id, 'GPIO18', 18, '+5V / GND', 'PWM0 (pin 12)'
FROM device_modules dm JOIN devices d ON d.id = dm.device_id AND d.model = 'raspberry_pi_zero_w'
WHERE dm.module_type = 'servo'
AND NOT EXISTS (SELECT 1 FROM module_pins mp WHERE mp.module_id = dm.id AND mp.wemos_pin = 'GPIO18');

-- DC Motor (direction/speed example GPIO23/GPIO24)
INSERT INTO device_modules (device_id, module_name, module_type, usage_purpose, description, enabled)
SELECT d.id, 'DC Motor', 'dc_motor', 'Yem akışı', 'L298N veya MOSFET sürücü', 1
FROM devices d WHERE d.model = 'raspberry_pi_zero_w'
AND NOT EXISTS (SELECT 1 FROM device_modules dm WHERE dm.device_id = d.id AND dm.module_type = 'dc_motor');

INSERT INTO module_pins (module_id, wemos_pin, gpio_number, power_connection, notes)
SELECT dm.id, 'GPIO23', 23, 'Harici 9-12V', 'Yön'
FROM device_modules dm JOIN devices d ON d.id = dm.device_id AND d.model = 'raspberry_pi_zero_w'
WHERE dm.module_type = 'dc_motor'
AND NOT EXISTS (SELECT 1 FROM module_pins mp WHERE mp.module_id = dm.id AND mp.wemos_pin = 'GPIO23');

INSERT INTO module_pins (module_id, wemos_pin, gpio_number, power_connection, notes)
SELECT dm.id, 'GPIO24', 24, 'Harici 9-12V', 'Hız (PWM)'
FROM device_modules dm JOIN devices d ON d.id = dm.device_id AND d.model = 'raspberry_pi_zero_w'
WHERE dm.module_type = 'dc_motor'
AND NOT EXISTS (SELECT 1 FROM module_pins mp WHERE mp.module_id = dm.id AND mp.wemos_pin = 'GPIO24');

-- HX711 (example DT=GPIO5, SCK=GPIO6)
INSERT INTO device_modules (device_id, module_name, module_type, usage_purpose, description, enabled)
SELECT d.id, 'HX711 Load Cell', 'load_cell', 'Ağırlık ölçümü', 'HX711 bağlantısı', 1
FROM devices d WHERE d.model = 'raspberry_pi_zero_w'
AND NOT EXISTS (SELECT 1 FROM device_modules dm WHERE dm.device_id = d.id AND dm.module_type = 'load_cell');

INSERT INTO module_pins (module_id, wemos_pin, gpio_number, power_connection, notes)
SELECT dm.id, 'GPIO5', 5, '+5V / GND', 'DT (Data)'
FROM device_modules dm JOIN devices d ON d.id = dm.device_id AND d.model = 'raspberry_pi_zero_w'
WHERE dm.module_type = 'load_cell'
AND NOT EXISTS (SELECT 1 FROM module_pins mp WHERE mp.module_id = dm.id AND mp.wemos_pin = 'GPIO5');

INSERT INTO module_pins (module_id, wemos_pin, gpio_number, power_connection, notes)
SELECT dm.id, 'GPIO6', 6, '+5V / GND', 'SCK (Clock)'
FROM device_modules dm JOIN devices d ON d.id = dm.device_id AND d.model = 'raspberry_pi_zero_w'
WHERE dm.module_type = 'load_cell'
AND NOT EXISTS (SELECT 1 FROM module_pins mp WHERE mp.module_id = dm.id AND mp.wemos_pin = 'GPIO6');

-- DHT22
INSERT INTO device_modules (device_id, module_name, module_type, usage_purpose, description, enabled)
SELECT d.id, 'DHT22 / DHT11', 'temp_sensor', 'Sıcaklık & nem', '10kΩ pull-up önerilir', 1
FROM devices d WHERE d.model = 'raspberry_pi_zero_w'
AND NOT EXISTS (SELECT 1 FROM device_modules dm WHERE dm.device_id = d.id AND dm.module_type = 'temp_sensor');

INSERT INTO module_pins (module_id, wemos_pin, gpio_number, power_connection, notes)
SELECT dm.id, 'GPIO4', 4, '+3.3V / GND', 'Data pini'
FROM device_modules dm JOIN devices d ON d.id = dm.device_id AND d.model = 'raspberry_pi_zero_w'
WHERE dm.module_type = 'temp_sensor'
AND NOT EXISTS (SELECT 1 FROM module_pins mp WHERE mp.module_id = dm.id AND mp.wemos_pin = 'GPIO4');

-- LED
INSERT INTO device_modules (device_id, module_name, module_type, usage_purpose, description, enabled)
SELECT d.id, 'LED / Flaşör', 'led', 'Durum bildirimi', 'LOW aktif olabilir (ters lojik)', 1
FROM devices d WHERE d.model = 'raspberry_pi_zero_w'
AND NOT EXISTS (SELECT 1 FROM device_modules dm WHERE dm.device_id = d.id AND dm.module_type = 'led');

INSERT INTO module_pins (module_id, wemos_pin, gpio_number, power_connection, notes)
SELECT dm.id, 'GPIO17', 17, '+3.3V / GND', 'Dijital çıkış'
FROM device_modules dm JOIN devices d ON d.id = dm.device_id AND d.model = 'raspberry_pi_zero_w'
WHERE dm.module_type = 'led'
AND NOT EXISTS (SELECT 1 FROM module_pins mp WHERE mp.module_id = dm.id AND mp.wemos_pin = 'GPIO17');

-- MOSFET Güç
INSERT INTO device_modules (device_id, module_name, module_type, usage_purpose, description, enabled)
SELECT d.id, 'MOSFET Güç Kontrol', 'mosfet', 'Servo/Motor güç kesme', 'IRLZ44N/IRF520', 1
FROM devices d WHERE d.model = 'raspberry_pi_zero_w'
AND NOT EXISTS (SELECT 1 FROM device_modules dm WHERE dm.device_id = d.id AND dm.module_type = 'mosfet');

INSERT INTO module_pins (module_id, wemos_pin, gpio_number, power_connection, notes)
SELECT dm.id, 'GPIO27', 27, 'Harici +5V', 'Gate pini'
FROM device_modules dm JOIN devices d ON d.id = dm.device_id AND d.model = 'raspberry_pi_zero_w'
WHERE dm.module_type = 'mosfet'
AND NOT EXISTS (SELECT 1 FROM module_pins mp WHERE mp.module_id = dm.id AND mp.wemos_pin = 'GPIO27');

-- Wi-Fi internal
INSERT INTO device_modules (device_id, module_name, module_type, usage_purpose, description, enabled)
SELECT d.id, 'Wi-Fi (RPi Zero W)', 'wifi', 'İletişim', 'Dahili WiFi', 1
FROM devices d WHERE d.model = 'raspberry_pi_zero_w'
AND NOT EXISTS (SELECT 1 FROM device_modules dm WHERE dm.device_id = d.id AND dm.module_type = 'wifi');

INSERT INTO module_pins (module_id, wemos_pin, gpio_number, power_connection, notes)
SELECT dm.id, 'Dahili', NULL, '3.3V', 'Dahili WiFi'
FROM device_modules dm JOIN devices d ON d.id = dm.device_id AND d.model = 'raspberry_pi_zero_w'
WHERE dm.module_type = 'wifi'
AND NOT EXISTS (SELECT 1 FROM module_pins mp WHERE mp.module_id = dm.id AND mp.wemos_pin = 'Dahili');
