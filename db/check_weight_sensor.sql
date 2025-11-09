-- Check weight sensor setting for all devices
SELECT 
  d.id,
  d.name,
  ds.has_weight_sensor,
  ds.portion_default,
  ds.max_open_ms
FROM devices d
LEFT JOIN device_settings ds ON d.id = ds.device_id
ORDER BY d.id;
