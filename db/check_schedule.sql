SELECT 
  d.id as device_id,
  d.name as device_name,
  s.id as schedule_id,
  s.name as schedule_name,
  COUNT(si.id) as item_count
FROM devices d
LEFT JOIN schedules s ON d.id = s.device_id
LEFT JOIN schedule_items si ON s.id = si.schedule_id
WHERE d.name = 'Feeder-Demo'
GROUP BY d.id, s.id;

SELECT 
  si.id,
  si.time,
  si.amount,
  si.enabled
FROM devices d
JOIN schedules s ON d.id = s.device_id
JOIN schedule_items si ON s.id = si.schedule_id
WHERE d.name = 'Feeder-Demo'
ORDER BY si.time;
