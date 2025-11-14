import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { createProxyMiddleware } from 'http-proxy-middleware';
import mysql, { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import http from 'http';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const app = express();
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:8088'],
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
// gzip compression for JSON
app.use(compression());
// Keep-Alive headers
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Keep-Alive', 'timeout=5, max=1000');
  next();
});

// Feed cooldown (minutes) configurable via env
const FEED_COOLDOWN_MINUTES = +(process.env.FEED_COOLDOWN_MINUTES || 2);
app.use(express.json());

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'mysql',
  port: +(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'feeder',
  password: process.env.DB_PASS || 'feeder_pass',
  database: process.env.DB_NAME || 'feeder_db',
  waitForConnections: true,
  connectionLimit: 10
});

// (moved below after authMiddleware definition)

// Ensure device_logs table exists
async function ensureDeviceLogsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS device_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        device_id INT NOT NULL,
        level VARCHAR(16) NOT NULL DEFAULT 'info',
        message TEXT NOT NULL,
        meta JSON NULL,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_device_logs_device (device_id),
        INDEX idx_device_logs_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } catch (e) {
    console.error('[LOGS] ensure table error:', e);
  }
}
ensureDeviceLogsTable();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Auth middleware
const authMiddleware = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; email: string };
    (req as any).user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Auth endpoints
app.post('/auth/login', async (req: express.Request, res: express.Response) => {
  console.log('[AUTH] POST /auth/login');
  try {
    const { email, password } = req.body || {};
    console.log('[AUTH] payload', { email });
    if (!email || !password) {
      console.warn('[AUTH] missing email or password');
      return res.status(400).json({ error: 'Email and password required' });
    }
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, email, password_hash, display_name FROM users WHERE email = ?',
      [email]
    );
    const user = rows[0] as any;
    if (!user) {
      console.warn('[AUTH] user not found');
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    // If password_hash is missing or doesn't match, allow auto-fix for demo credentials
    let valid = false;
    if (user.password_hash) {
      try {
        valid = await bcrypt.compare(password, user.password_hash);
      } catch {
        valid = false;
      }
    }
    if (!valid) {
      // Demo repair path: if demo credentials provided, set bcrypt hash now
      if (email === 'demo@example.com' && password === 'demo123') {
        const newHash = await bcrypt.hash(password, 10);
        await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, user.id]);
        valid = true;
      } else {
        console.warn('[AUTH] invalid password');
        return res.status(401).json({ error: 'Invalid credentials' });
      }
    }
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, displayName: user.display_name } });
  } catch (err) {
    console.error('[AUTH] login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upsert device by MAC (JWT-protected)
app.post('/devices/upsert-by-mac', authMiddleware, async (req: express.Request, res: express.Response) => {
  const userId = (req as any).user.userId;
  const { serial, name, esp_host, esp_port } = req.body || {};
  if (!serial || !name || !esp_host || !esp_port) {
    return res.status(400).json({ error: 'serial, name, esp_host, esp_port required' });
  }
  const normalized = String(serial).replace(/:/g, '').toUpperCase();
  if (!/^[A-F0-9]{12}$/.test(normalized)) {
    return res.status(400).json({ error: 'invalid serial format (expected 12 hex chars, e.g. AA11BB22CC33)' });
  }
  try {
    const [exists] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM devices WHERE REPLACE(UPPER(serial), ":", "") = ? LIMIT 1', [normalized]
    );
    if ((exists as any[]).length > 0) {
      const id = (exists as any[])[0].id;
      await pool.query(
        'UPDATE devices SET name = ?, esp_host = ?, esp_port = ?, user_id = ? WHERE id = ?',
        [name, esp_host, +esp_port, userId, id]
      );
      return res.json({ id, updated: true });
    }
    const [result] = await pool.query<ResultSetHeader>(
      'INSERT INTO devices (user_id, name, serial, esp_host, esp_port) VALUES (?, ?, ?, ?, ?)',
      [userId, name, normalized, esp_host, +esp_port]
    );
    return res.status(201).json({ id: (result as ResultSetHeader).insertId, created: true });
  } catch (err) {
    console.error('[UPSERT-BY-MAC] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Unauthenticated log ingestion by MAC (for Arduino devices)
app.post('/logs/ingest', async (req: express.Request, res: express.Response) => {
  try {
    const macRaw = (req.query.mac as string) || (req.headers['x-device-mac'] as string) || '';
    const level = (req.body?.level as string) || 'info';
    const message = (req.body?.message as string) || '';
    const meta = req.body?.meta ?? null;
    if (!macRaw) return res.status(400).json({ error: 'mac required' });
    if (!message) return res.status(400).json({ error: 'message required' });
    const mac = String(macRaw).replace(/:/g, '').toUpperCase();
    const [dRows] = await pool.query<RowDataPacket[]>('SELECT id FROM devices WHERE REPLACE(UPPER(serial), ":", "") = ? LIMIT 1', [mac]);
    if ((dRows as any[]).length === 0) return res.status(404).json({ error: 'device not found' });
    const deviceId = (dRows as any[])[0].id;
    const metaStr = meta == null ? null : (typeof meta === 'string' ? meta : JSON.stringify(meta));
    await pool.query('INSERT INTO device_logs (device_id, level, message, meta) VALUES (?, ?, ?, CAST(? AS JSON))', [deviceId, String(level).toLowerCase(), message, metaStr]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[LOGS_INGEST] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

async function getEspTarget() {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT esp_host, esp_port FROM settings ORDER BY updated_at DESC LIMIT 1'
  );
  const row = rows[0] as any | undefined;
  const host = row?.esp_host || process.env.FALLBACK_ESP_HOST || '192.168.1.50';
  const port = row?.esp_port || +(process.env.FALLBACK_ESP_PORT || 80);
  return { host, port, target: `http://${host}:${port}` };
}

// Provisioning: return device config as JSON (JWT-protected) - FIRST route after auth
app.get('/devices/:deviceId/provision', authMiddleware, async (req: express.Request, res: express.Response) => {
  console.log('[PROVISION] GET /devices/:deviceId/provision', { deviceId: req.params.deviceId, query: req.query });
  let { deviceId } = req.params as any;
  const serialRaw = (req.query.serial as string) || (req.headers['x-device-serial'] as string) || (req.headers['x-device-mac'] as string) || '';
  if (serialRaw) {
    const serial = String(serialRaw).replace(/:/g, '').toUpperCase();
    const [dRows] = await pool.query<RowDataPacket[]>('SELECT id FROM devices WHERE REPLACE(UPPER(serial), ":", "") = ?', [serial]);
    if ((dRows as any[]).length > 0) deviceId = (dRows as any[])[0].id;
    console.log('[PROVISION] serial resolution', { serialRaw, normalized: serial, resolvedDeviceId: deviceId });
  }
  const ssid = (req.query.ssid as string) || 'secgem';
  const wpass = (req.query.pass as string) || 'Secgem123';
  
  try {
    // Build from DB: device + settings
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT d.id, d.name, d.serial, d.esp_host, d.esp_port,
              ds.animal_type, ds.has_weight_sensor, ds.portion_default, ds.max_open_ms, ds.scale_factor,
              ds.telemetry_ms, ds.servo_speed, ds.motor_speed, ds.motor_type, ds.stepper_speed,
              ds.servo_open_angle, ds.servo_close_angle, ds.org, ds.site,
              ds.mqtt_host, ds.mqtt_port, ds.mqtt_group, ds.admin_user
       FROM devices d
       LEFT JOIN device_settings ds ON ds.device_id = d.id
       WHERE d.id = ?`,
      [deviceId]
    );
    const row = (rows as any[])[0] || {};
    const deviceName = row?.name || `device-${deviceId}`;
    console.log('[PROVISION] device', { id: deviceId, name: deviceName, serial: row?.serial });

    // Fetch schedules with items
    const [sRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, name, enabled FROM schedules WHERE device_id = ?',
      [deviceId]
    );
    const schedules = (sRows as any[]) || [];
    const itemsCount = Array.isArray(schedules) && schedules[0]?.items ? schedules[0].items.length : 0;
    console.log('[PROVISION] schedules summary', { schedulesCount: schedules.length, itemsCount });
    if (schedules.length > 0) {
      const scheduleIds = schedules.map((s: any) => s.id);
      const [allItems] = await pool.query<RowDataPacket[]>(
        'SELECT id, schedule_id, time, amount, duration_ms, enabled FROM schedule_items WHERE schedule_id IN (?)',
        [scheduleIds]
      );
      const itemsBySchedule = (allItems as any[]).reduce((acc: any, it: any) => {
        if (!acc[it.schedule_id]) acc[it.schedule_id] = [];
        acc[it.schedule_id].push(it);
        return acc;
      }, {} as Record<number, any[]>);
      for (const s of schedules as any[]) {
        s.items = itemsBySchedule[s.id] || [];
      }
    }

    const payload = {
      wifi_ssid: ssid,
      wifi_pass: wpass,
      device_id: row?.serial || String(deviceId),
      name: deviceName,
      esp: {
        host: row?.esp_host || '192.168.1.50',
        port: row?.esp_port || 80
      },
      mqtt: {
        host: row?.mqtt_host || null,
        port: row?.mqtt_port || 1883,
        group: row?.mqtt_group ?? 0,
        admin_user: row?.admin_user || null
      },
      settings: {
        animal_type: row?.animal_type || 'dog_medium',
        has_weight_sensor: row?.has_weight_sensor ? 1 : 0,
        portion_default: row?.portion_default || 100,
        max_open_ms: row?.max_open_ms || 5000,
        scale_factor: row?.scale_factor || 1.0,
        telemetry_ms: row?.telemetry_ms || 7000,
        servo_speed: row?.servo_speed || 50,
        motor_speed: row?.motor_speed || 75,
        motor_type: row?.motor_type || 'servo',
        stepper_speed: row?.stepper_speed || 10,
        dc_motor_speed: row?.motor_speed || 200,
        servo_open_angle: row?.servo_open_angle || 0,
        servo_close_angle: row?.servo_close_angle || 90,
        org: row?.org || null,
        site: row?.site || null
      },
      schedules
    } as any;

    console.log('[PROVISION] Sending config for device', deviceId, `with ${schedules.length} schedule(s)`);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="config-${deviceName}.json"`);
    res.json(payload);
  } catch (err) {
    console.error('[PROVISION] Error:', err);
    res.status(500).json({ error: 'Failed to build config.json' });
  }
});

app.post('/config/settings', async (req: express.Request, res: express.Response) => {
  const { esp_host, esp_port } = req.body || {};
  if (!esp_host || !esp_port) return res.status(400).json({ error: 'esp_host and esp_port required' });
  await pool.query('INSERT INTO settings (esp_host, esp_port) VALUES (?, ?)', [esp_host, esp_port]);
  res.json({ ok: true });
});

// Push schedules to device (sync from DB -> Wemos)
app.post('/devices/:deviceId/schedules/sync', authMiddleware, async (req: express.Request, res: express.Response) => {
  const userId = (req as any).user.userId;
  const { deviceId } = req.params as any;
  try {
    // Ensure device belongs to current user and has network info
    const [dRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, esp_host, esp_port FROM devices WHERE id = ? AND user_id = ? LIMIT 1',
      [deviceId, userId]
    );
    if ((dRows as any[]).length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }
    const device = (dRows as any[])[0] as any;
    const espHost: string = device.esp_host;
    const espPort: number = device.esp_port || 80;

    // Load schedules + items for this device (reuse logic similar to GET /devices/:deviceId/schedules)
    const [sRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, name, enabled FROM schedules WHERE device_id = ?',
      [deviceId]
    );
    const schedules = sRows as any[];
    let slots: Array<{ time: string; duration_ms: number|null; amount: number; enabled: boolean }> = [];

    if (schedules.length > 0) {
      const scheduleIds = schedules.map(s => s.id);
      const [allItems] = await pool.query<RowDataPacket[]>(
        'SELECT id, schedule_id, time, amount, duration_ms, enabled FROM schedule_items WHERE schedule_id IN (?)',
        [scheduleIds]
      );
      for (const it of (allItems as any[])) {
        const parent = schedules.find(s => s.id === it.schedule_id);
        if (!parent || !parent.enabled) continue;
        slots.push({
          time: it.time,
          duration_ms: it.duration_ms ?? null,
          amount: it.amount,
          enabled: !!it.enabled
        });
      }
    }

    // Sort slots by time for deterministic order
    slots.sort((a, b) => a.time.localeCompare(b.time));

    const payload = JSON.stringify(slots);

    const options: http.RequestOptions = {
      host: espHost,
      port: espPort,
      path: '/schedule',
      method: 'POST',
      timeout: 4000,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const sendToDevice = () => new Promise<{ statusCode?: number; body: string }>((resolve, reject) => {
      const reqDev = http.request(options, (resp) => {
        let body = '';
        resp.setEncoding('utf8');
        resp.on('data', (chunk) => { body += chunk; });
        resp.on('end', () => {
          resolve({ statusCode: resp.statusCode, body });
        });
      });
      reqDev.on('error', (err) => reject(err));
      reqDev.on('timeout', () => {
        reqDev.destroy(new Error('Device request timeout'));
      });
      reqDev.write(payload);
      reqDev.end();
    });

    const resp = await sendToDevice().catch((err: any) => {
      console.error('[SCHEDULE_SYNC] device request error:', err);
      return { statusCode: undefined, body: String(err?.message || 'device error') };
    });

    return res.json({
      ok: true,
      device: { id: device.id, esp_host: espHost, esp_port: espPort },
      slotsCount: slots.length,
      deviceStatusCode: resp.statusCode ?? null,
      deviceResponse: resp.body
    });
  } catch (err) {
    console.error('[SCHEDULE_SYNC] error:', err);
    return res.status(500).json({ error: 'Failed to sync schedule to device' });
  }
});

// Devices list by user (protected)
app.get('/devices', authMiddleware, async (req: express.Request, res: express.Response) => {
  const userId = (req as any).user.userId;
  const all = String(req.query.all || '') === '1';
  try {
    const sql = all
      ? 'SELECT id, user_id, name, serial, esp_host, esp_port, model, active FROM devices WHERE user_id = ?'
      : 'SELECT id, user_id, name, serial, esp_host, esp_port, model, active FROM devices WHERE user_id = ? AND active = 1';
    const [rows] = await pool.query<RowDataPacket[]>(sql, [userId]);
    res.json(rows);
  } catch (err) {
    console.error('GET /devices error:', err);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

// Create device (protected)
app.post('/devices', authMiddleware, async (req: express.Request, res: express.Response) => {
  const userId = (req as any).user.userId;
  const { name, serial, esp_host, esp_port } = req.body || {};
  if (!name || !esp_host || !esp_port || !serial) {
    return res.status(400).json({ error: 'name, serial, esp_host, esp_port required' });
  }
  const normalized = String(serial).replace(/:/g, '').toUpperCase();
  if (!/^[A-F0-9]{12}$/.test(normalized)) {
    return res.status(400).json({ error: 'invalid serial format (expected 12 hex chars, e.g. AA11BB22CC33)' });
  }
  try {
    // Upsert by serial (MAC): if exists, update; else insert
    const [exists] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM devices WHERE REPLACE(UPPER(serial), ":", "") = ? LIMIT 1', [normalized]
    );
    if ((exists as any[]).length > 0) {
      const id = (exists as any[])[0].id;
      await pool.query(
        'UPDATE devices SET name = COALESCE(?, name), esp_host = COALESCE(?, esp_host), esp_port = COALESCE(?, esp_port) WHERE id = ? AND user_id = ?',
        [name ?? null, esp_host ?? null, esp_port ?? null, id, userId]
      );
      return res.json({ id, updated: true });
    }
    const [result] = await pool.query<ResultSetHeader>(
      'INSERT INTO devices (user_id, name, serial, esp_host, esp_port) VALUES (?, ?, ?, ?, ?)',
      [userId, name, normalized, esp_host, +esp_port]
    );
    const id = result.insertId;
    res.status(201).json({ id, created: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Device settings
app.get('/devices/:deviceId/settings', async (req: express.Request, res: express.Response) => {
  const startTime = Date.now();
  const { deviceId } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT d.id as device_id, d.name, d.serial, d.esp_host, d.esp_port,
              ds.animal_type, ds.has_weight_sensor, ds.portion_default, ds.max_open_ms, ds.scale_factor,
              ds.telemetry_ms, ds.servo_speed, ds.motor_speed, ds.motor_type, ds.stepper_speed, ds.org, ds.site,
              ds.mqtt_host, ds.mqtt_port, ds.mqtt_group, ds.admin_user
       FROM devices d
       LEFT JOIN device_settings ds ON ds.device_id = d.id
       WHERE d.id = ?`,
      [deviceId]
    );
    const elapsed = Date.now() - startTime;
    console.log(`[GET /devices/${deviceId}/settings] ${elapsed}ms`);
    res.json((rows as any[])[0] || null);
  } catch (err) {
    console.error(`[GET /devices/${deviceId}/settings] ERROR:`, err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

app.put('/devices/:deviceId/settings', async (req: express.Request, res: express.Response) => {
  const { deviceId } = req.params;
  const body = req.body || {};
  // upsert
  await pool.query(
    `INSERT INTO device_settings (device_id, animal_type, has_weight_sensor, portion_default, max_open_ms, scale_factor, telemetry_ms, servo_speed, motor_speed, motor_type, stepper_speed, org, site, mqtt_host, mqtt_port, mqtt_group, admin_user)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       animal_type=VALUES(animal_type), has_weight_sensor=VALUES(has_weight_sensor), portion_default=VALUES(portion_default), max_open_ms=VALUES(max_open_ms),
       scale_factor=VALUES(scale_factor), telemetry_ms=VALUES(telemetry_ms), servo_speed=VALUES(servo_speed), motor_speed=VALUES(motor_speed), motor_type=VALUES(motor_type), stepper_speed=VALUES(stepper_speed),
       org=VALUES(org), site=VALUES(site), mqtt_host=VALUES(mqtt_host), mqtt_port=VALUES(mqtt_port), mqtt_group=VALUES(mqtt_group), admin_user=VALUES(admin_user)`,
    [
      deviceId,
      body.animal_type ?? 'dog_medium',
      body.has_weight_sensor ?? 1,
      body.portion_default ?? 100,
      body.max_open_ms ?? 12000,
      body.scale_factor ?? 420.0,
      body.telemetry_ms ?? 7000,
      body.servo_speed ?? 50,
      body.motor_speed ?? 75,
      body.motor_type ?? 'dc',
      body.stepper_speed ?? 60,
      body.org ?? null,
      body.site ?? null,
      body.mqtt_host ?? null,
      body.mqtt_port ?? null,
      body.mqtt_group ?? 0,
      body.admin_user ?? null
    ]
  );
  res.json({ ok: true });
});

// Schedules
app.get('/devices/:deviceId/schedules', async (req: express.Request, res: express.Response) => {
  const startTime = Date.now();
  let { deviceId } = req.params as any;
  const serialRaw = (req.query.serial as string) || (req.headers['x-device-serial'] as string) || (req.headers['x-device-mac'] as string) || '';
  if (serialRaw) {
    const serial = String(serialRaw).replace(/:/g, '').toUpperCase();
    const [dRows] = await pool.query<RowDataPacket[]>('SELECT id FROM devices WHERE REPLACE(UPPER(serial), ":", "") = ?', [serial]);
    if ((dRows as any[]).length > 0) deviceId = (dRows as any[])[0].id;
  }
  try {
    const [sRows] = await pool.query<RowDataPacket[]>('SELECT id, name, enabled FROM schedules WHERE device_id = ?', [deviceId]);
    const schedules = sRows as any[];
    
    if (schedules.length > 0) {
      const scheduleIds = schedules.map(s => s.id);
      // Single query for all items instead of N queries
      const [allItems] = await pool.query<RowDataPacket[]>(
        'SELECT id, schedule_id, time, amount, duration_ms, enabled FROM schedule_items WHERE schedule_id IN (?)',
        [scheduleIds]
      );
      
      // Group items by schedule_id
      const itemsBySchedule = (allItems as any[]).reduce((acc: any, item: any) => {
        if (!acc[item.schedule_id]) acc[item.schedule_id] = [];
        acc[item.schedule_id].push(item);
        return acc;
      }, {});
      
      // Attach items to schedules
      for (const s of schedules) {
        s.items = itemsBySchedule[s.id] || [];
      }
    }
    
    // ETag desteği: JSON'u hash'le
    const dataStr = JSON.stringify(schedules);
    const etag = '"' + crypto.createHash('md5').update(dataStr).digest('hex') + '"';
    
    // If-None-Match kontrolü
    const clientEtag = req.headers['if-none-match'];
    if (clientEtag && clientEtag === etag) {
      console.log(`[GET /devices/${deviceId}/schedules] 304 Not Modified (ETag match)`);
      return res.status(304).end();
    }
    
    const elapsed = Date.now() - startTime;
    console.log(`[GET /devices/${deviceId}/schedules] ${elapsed}ms - ${schedules.length} schedules - ETag: ${etag}`);
    
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache');
    res.json(schedules);
  } catch (err) {
    console.error(`[GET /devices/${deviceId}/schedules] ERROR:`, err);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

app.post('/devices/:deviceId/schedules', async (req: express.Request, res: express.Response) => {
  let { deviceId } = req.params as any;
  const serialRaw = (req.query.serial as string) || (req.headers['x-device-serial'] as string) || (req.headers['x-device-mac'] as string) || '';
  if (serialRaw) {
    const serial = String(serialRaw).replace(/:/g, '').toUpperCase();
    const [dRows] = await pool.query<RowDataPacket[]>('SELECT id FROM devices WHERE REPLACE(UPPER(serial), ":", "") = ?', [serial]);
    if ((dRows as any[]).length > 0) deviceId = (dRows as any[])[0].id;
  }
  const { name = 'Default', enabled = 1, items = [] } = req.body || {};
  const [result] = await pool.query<ResultSetHeader>('INSERT INTO schedules (device_id, name, enabled) VALUES (?, ?, ?)', [deviceId, name, enabled ? 1 : 0]);
  const scheduleId = result.insertId;
  for (const it of items) {
    await pool.query(
      'INSERT INTO schedule_items (schedule_id, time, amount, duration_ms, enabled) VALUES (?, ?, ?, ?, ?)',
      [scheduleId, it.time, it.amount, it.duration_ms ?? null, it.enabled ? 1 : 0]
    );
  }
  res.json({ ok: true, id: scheduleId });
});

app.put('/devices/:deviceId/schedules/:scheduleId', async (req: express.Request, res: express.Response) => {
  let { deviceId, scheduleId } = req.params as any;
  const serialRaw = (req.query.serial as string) || (req.headers['x-device-serial'] as string) || (req.headers['x-device-mac'] as string) || '';
  if (serialRaw) {
    const serial = String(serialRaw).replace(/:/g, '').toUpperCase();
    const [dRows] = await pool.query<RowDataPacket[]>('SELECT id FROM devices WHERE REPLACE(UPPER(serial), ":", "") = ?', [serial]);
    if ((dRows as any[]).length > 0) deviceId = (dRows as any[])[0].id;
  }
  const { name, enabled, items } = req.body || {};
  if (name !== undefined || enabled !== undefined)
    await pool.query('UPDATE schedules SET name = COALESCE(?, name), enabled = COALESCE(?, enabled) WHERE id = ? AND device_id = ?', [name, enabled !== undefined ? (enabled ? 1 : 0) : undefined, scheduleId, deviceId]);
  if (Array.isArray(items)) {
    await pool.query('DELETE FROM schedule_items WHERE schedule_id = ?', [scheduleId]);
    for (const it of items) {
      await pool.query(
        'INSERT INTO schedule_items (schedule_id, time, amount, duration_ms, enabled) VALUES (?, ?, ?, ?, ?)',
        [scheduleId, it.time, it.amount, it.duration_ms ?? null, it.enabled ? 1 : 0]
      );
    }
  }
  res.json({ ok: true });
});

app.delete('/devices/:deviceId/schedules/:scheduleId', async (req: express.Request, res: express.Response) => {
  const { deviceId, scheduleId } = req.params;
  await pool.query('DELETE FROM schedules WHERE id = ? AND device_id = ?', [scheduleId, deviceId]);
  res.json({ ok: true });
});

// Delete device (protected, checks ownership)
app.delete('/devices/:deviceId', authMiddleware, async (req: express.Request, res: express.Response) => {
  const userId = (req as any).user.userId;
  const { deviceId } = req.params;
  try {
    const [result] = await pool.query<ResultSetHeader>('UPDATE devices SET active = 0 WHERE id = ? AND user_id = ?', [deviceId, userId]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Device not found' });
    return res.json({ ok: true, softDeleted: true });
  } catch (err) {
    console.error('DELETE /devices error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Update device
app.put('/devices/:deviceId', authMiddleware, async (req: express.Request, res: express.Response) => {
  const userId = (req as any).user.userId;
  const { deviceId } = req.params;
  const { name, serial, esp_host, esp_port } = req.body || {};
  
  try {
    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    
    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (serial !== undefined) {
      updates.push('serial = ?');
      values.push(serial);
    }
    if (esp_host !== undefined) {
      updates.push('esp_host = ?');
      values.push(esp_host);
    }
    if (esp_port !== undefined) {
      updates.push('esp_port = ?');
      values.push(esp_port);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    values.push(deviceId, userId);
    const query = `UPDATE devices SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`;
    
    const [result] = await pool.query<ResultSetHeader>(query, values);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Device not found or unauthorized' });
    }
    
    return res.json({ ok: true, message: 'Device updated successfully' });
  } catch (err) {
    console.error('PUT /devices/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Toggle active flag
app.put('/devices/:deviceId/active', authMiddleware, async (req: express.Request, res: express.Response) => {
  const userId = (req as any).user.userId;
  const { deviceId } = req.params;
  const { active } = req.body || {};
  if (active !== 0 && active !== 1 && active !== true && active !== false) return res.status(400).json({ error: 'active must be 0/1 or boolean' });
  const val = (active === 1 || active === true) ? 1 : 0;
  try {
    const [result] = await pool.query<ResultSetHeader>('UPDATE devices SET active = ? WHERE id = ? AND user_id = ?', [val, deviceId, userId]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Device not found' });
    return res.json({ ok: true, active: !!val });
  } catch (err) {
    console.error('PUT /devices/:id/active error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Device logs endpoints
app.post('/devices/:deviceId/logs', authMiddleware, async (req: express.Request, res: express.Response) => {
  const userId = (req as any).user.userId;
  const { deviceId } = req.params as any;
  const { level = 'info', message = '', meta = null } = req.body || {};
  if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message required' });
  try {
    const [owns] = await pool.query<RowDataPacket[]>('SELECT id FROM devices WHERE id = ? AND user_id = ? LIMIT 1', [deviceId, userId]);
    if ((owns as any[]).length === 0) return res.status(404).json({ error: 'Device not found' });
    const metaStr = meta == null ? null : (typeof meta === 'string' ? meta : JSON.stringify(meta));
    await pool.query('INSERT INTO device_logs (device_id, level, message, meta) VALUES (?, ?, ?, CAST(? AS JSON))', [deviceId, String(level).toLowerCase(), message, metaStr]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('POST /devices/:deviceId/logs error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/devices/:deviceId/logs', authMiddleware, async (req: express.Request, res: express.Response) => {
  const userId = (req as any).user.userId;
  const { deviceId } = req.params as any;
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || '200'), 10) || 200, 1), 1000);
  const level = (req.query.level as string) || '';
  const q = (req.query.q as string) || '';
  const sinceMinutes = Math.max(parseInt(String(req.query.sinceMinutes || '1440'), 10) || 1440, 1);
  try {
    const [owns] = await pool.query<RowDataPacket[]>('SELECT id FROM devices WHERE id = ? AND user_id = ? LIMIT 1', [deviceId, userId]);
    if ((owns as any[]).length === 0) return res.status(404).json({ error: 'Device not found' });

    const where: string[] = ['device_id = ?', 'created_at >= (NOW() - INTERVAL ? MINUTE)'];
    const params: any[] = [deviceId, sinceMinutes];
    if (level) { where.push('level = ?'); params.push(level.toLowerCase()); }
    if (q) { where.push('message LIKE ?'); params.push(`%${q}%`); }

    const sql = `SELECT id, level, message, meta, created_at FROM device_logs WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`;
    params.push(limit);
    const [rows] = await pool.query<RowDataPacket[]>(sql, params);
    return res.json(rows);
  } catch (err) {
    console.error('GET /devices/:deviceId/logs error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Pins (modules)
app.get('/devices/:deviceId/pins', async (req: express.Request, res: express.Response) => {
  const { deviceId } = req.params;
  const [modules] = await pool.query<RowDataPacket[]>(
    'SELECT id, module_name, module_type, usage_purpose, description, enabled FROM device_modules WHERE device_id = ?',
    [deviceId]
  );
  const result = [];
  for (const mod of modules as any[]) {
    const [pins] = await pool.query('SELECT wemos_pin, gpio_number, power_connection, notes FROM module_pins WHERE module_id = ?', [mod.id]);
    result.push({ ...mod, pins });
  }
  res.json(result);
});

app.post('/devices/:deviceId/pins', async (req: express.Request, res: express.Response) => {
  const { deviceId } = req.params;
  const modules = (req.body?.modules as Array<any>) || [];
  for (const m of modules) {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO device_modules (device_id, module_name, module_type, usage_purpose, description, enabled)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE usage_purpose = VALUES(usage_purpose), description = VALUES(description), enabled = VALUES(enabled)`,
      [deviceId, m.module_name, m.module_type, m.usage_purpose ?? null, m.description ?? null, m.enabled ?? 1]
    );
    const moduleId = result.insertId || m.id;
    if (Array.isArray(m.pins)) {
      await pool.query('DELETE FROM module_pins WHERE module_id = ?', [moduleId]);
      for (const p of m.pins) {
        await pool.query(
          'INSERT INTO module_pins (module_id, wemos_pin, gpio_number, power_connection, notes) VALUES (?, ?, ?, ?, ?)',
          [moduleId, p.wemos_pin, p.gpio_number ?? null, p.power_connection ?? null, p.notes ?? null]
        );
      }
    }
  }
  res.json({ ok: true });
});

app.post('/devices/:deviceId/pins/seed', async (req: express.Request, res: express.Response) => {
  const { deviceId } = req.params;
  // model: explicitly provided in body, or read from devices table
  let model = (req.body as any)?.model as string | undefined;
  const motor = ((req.body as any)?.motor || '').toString().toLowerCase(); // 'servo' | 'step'
  if (!model) {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT model FROM devices WHERE id = ?', [deviceId]);
    model = ((rows as any[])[0]?.model as string) || 'esp8266_wemos_d1';
  }

  let modules: Array<{ name: string; type: string; purpose: string; desc: string; pins: Array<{ pin: string; gpio: number|null; pwr: string; note: string }> }> = [];
  if (model === 'raspberry_pi_zero_w') {
    if (motor === 'step') {
      modules = [
        { name: '28BYJ-48 + ULN2003A', type: 'stepper_28byj48', purpose: 'Kapak aç/kapa', desc: 'IN1-4: 17,18,27,22', pins: [
          { pin: 'GPIO17', gpio: 17, pwr: '+5V / GND', note: 'IN1' },
          { pin: 'GPIO18', gpio: 18, pwr: '+5V / GND', note: 'IN2' },
          { pin: 'GPIO27', gpio: 27, pwr: '+5V / GND', note: 'IN3' },
          { pin: 'GPIO22', gpio: 22, pwr: '+5V / GND', note: 'IN4' },
        ] },
      ];
    } else { // default servo
      modules = [
        { name: 'Servo Motor (PWM0)', type: 'servo', purpose: 'Kapak aç/kapa', desc: 'GPIO18 PWM0 (pin 12)', pins: [{ pin: 'GPIO18', gpio: 18, pwr: '+5V / GND', note: 'PWM0 (pin 12)' }] },
      ];
    }
  } else {
    // default: WeMos D1 (ESP8266)
    if (motor === 'step') {
      modules = [
        { name: '28BYJ-48 + ULN2003A', type: 'stepper_28byj48', purpose: 'Kapak aç/kapa', desc: 'IN1-4: D5,D6,D7,D8', pins: [
          { pin: 'D5', gpio: 14, pwr: '+5V / GND', note: 'IN1' },
          { pin: 'D6', gpio: 12, pwr: '+5V / GND', note: 'IN2' },
          { pin: 'D7', gpio: 13, pwr: '+5V / GND', note: 'IN3' },
          { pin: 'D8', gpio: 15, pwr: '+5V / GND', note: 'IN4' },
        ] },
      ];
    } else { // default servo
      modules = [
        { name: 'Servo Motor (MG996R)', type: 'servo', purpose: 'Kapak aç/kapa', desc: 'Harici besleme, 1000µF + 100nF kondansatör', pins: [{ pin: 'D4', gpio: 2, pwr: '+5V / GND', note: 'PWM sinyal pini' }] },
      ];
    }
  }

  for (const m of modules) {
    const [check] = await pool.query('SELECT id FROM device_modules WHERE device_id = ? AND module_type = ?', [deviceId, m.type]);
    if ((check as any[]).length > 0) continue;
    const [res] = await pool.query<ResultSetHeader>(
      'INSERT INTO device_modules (device_id, module_name, module_type, usage_purpose, description, enabled) VALUES (?, ?, ?, ?, ?, 1)',
      [deviceId, m.name, m.type, m.purpose, m.desc]
    );
    const modId = res.insertId;
    for (const p of m.pins) {
      await pool.query(
        'INSERT INTO module_pins (module_id, wemos_pin, gpio_number, power_connection, notes) VALUES (?, ?, ?, ?, ?)',
        [modId, p.pin, p.gpio, p.pwr, p.note]
      );
    }
  }
  res.json({ ok: true });
});

// Security
app.get('/devices/:deviceId/security', async (req: express.Request, res: express.Response) => {
  const { deviceId } = req.params;
  const [rows] = await pool.query('SELECT api_token, allow_remote FROM security_settings WHERE device_id = ?', [deviceId]);
  res.json((rows as any[])[0] || null);
});

// Check feeding schedule by MAC address (for Arduino/ESP devices)
app.get('/feed/check', async (req: express.Request, res: express.Response) => {
  try {
    const macRaw = (req.query.mac as string) || (req.headers['x-device-mac'] as string) || '';
    if (!macRaw) {
      return res.status(400).json({ error: 'MAC address required', shouldFeed: false });
    }
    
    const mac = String(macRaw).replace(/:/g, '').toUpperCase();
    console.log('[FEED_CHECK] MAC:', mac);
    
    // Find device by MAC (serial)
    const [dRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, name FROM devices WHERE REPLACE(UPPER(serial), ":", "") = ? AND active = 1 LIMIT 1',
      [mac]
    );
    
    if ((dRows as any[]).length === 0) {
      console.log('[FEED_CHECK] Device not found for MAC:', mac);
      return res.json({ error: 'Device not found', shouldFeed: false, mac });
    }
    
    const device = (dRows as any[])[0];
    const deviceId = device.id;
    console.log('[FEED_CHECK] Device found:', device.name, 'ID:', deviceId);
    
    // Get current time with optional timezone offset (minutes)
    const tzOffsetMin = Number((req.query.tzOffsetMin as string) || 0) || 0; // e.g. +180 for UTC+3
    const nowUtc = new Date();
    const localMs = nowUtc.getTime() + tzOffsetMin * 60_000;
    const local = new Date(localMs);
    const hh = String(local.getHours()).padStart(2, '0');
    const mm = String(local.getMinutes()).padStart(2, '0');
    const currentTime = `${hh}:${mm}`;
    // also produce ±1 minute neighbors
    const prevMin = new Date(localMs - 60_000);
    const nextMin = new Date(localMs + 60_000);
    const timesToMatch = [
      currentTime,
      `${String(prevMin.getHours()).padStart(2, '0')}:${String(prevMin.getMinutes()).padStart(2, '0')}`,
      `${String(nextMin.getHours()).padStart(2, '0')}:${String(nextMin.getMinutes()).padStart(2, '0')}`
    ];
    console.log('[FEED_CHECK] Times to match:', timesToMatch.join(', '));
    
    // Find active schedules with matching time (±1 minute tolerance)
    const [sRows] = await pool.query<RowDataPacket[]>(
      `SELECT si.id, si.time, si.amount, si.duration_ms, s.name as schedule_name
       FROM schedule_items si
       JOIN schedules s ON s.id = si.schedule_id
       WHERE s.device_id = ? AND s.enabled = 1 AND si.enabled = 1 AND si.time IN (?, ?, ?)
       ORDER BY FIELD(si.time, ?, ?, ?) LIMIT 1`,
      [deviceId, timesToMatch[0], timesToMatch[1], timesToMatch[2], timesToMatch[0], timesToMatch[1], timesToMatch[2]]
    );
    
    if ((sRows as any[]).length === 0) {
      console.log('[FEED_CHECK] No matching schedule for time:', currentTime);
      return res.json({ 
        shouldFeed: false, 
        mac, 
        deviceId, 
        deviceName: device.name,
        currentTime,
        reason: 'no_schedule',
        message: 'No feeding scheduled for this time'
      });
    }
    
    const schedule = (sRows as any[])[0];
    console.log('[FEED_CHECK] Schedule found:', schedule.schedule_name, 'Amount:', schedule.amount);

    // Cooldown: prevent multiple feeds in same time window per device
    const cooldownMinutes = FEED_COOLDOWN_MINUTES;
    const [coolRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, created_at
       FROM device_logs
       WHERE device_id = ?
         AND level = 'info'
         AND message LIKE '%FEED_EXECUTED%'
         AND created_at >= (NOW() - INTERVAL ? MINUTE)
       ORDER BY id DESC
       LIMIT 1`,
      [deviceId, cooldownMinutes]
    );

    if ((coolRows as any[]).length > 0) {
      const last = (coolRows as any[])[0];
      console.log('[FEED_CHECK] Cooldown active, last feed at:', last.created_at);
      return res.json({
        shouldFeed: false,
        mac,
        deviceId,
        deviceName: device.name,
        currentTime,
        reason: 'cooldown',
        message: 'Feed skipped due to cooldown'
      });
    }

    // No cooldown hit -> allow feeding and record FEED_EXECUTED log
    // Also fetch device_settings.max_open_ms as default duration
    let maxOpenMs = 5000;
    try {
      const [setRows] = await pool.query<RowDataPacket[]>(
        'SELECT max_open_ms FROM device_settings WHERE device_id = ? LIMIT 1',
        [deviceId]
      );
      if ((setRows as any[]).length > 0) {
        const row = (setRows as any[])[0];
        if (row.max_open_ms && row.max_open_ms > 0 && row.max_open_ms < 60000) {
          maxOpenMs = row.max_open_ms;
        }
      }
    } catch (e) {
      console.error('[FEED_CHECK] Failed to read device_settings.max_open_ms:', e);
    }

    const durationMs = (schedule as any).duration_ms || maxOpenMs || 5000;
    try {
      await pool.query(
        'INSERT INTO device_logs (device_id, level, message, meta) VALUES (?, \'info\', \'FEED_EXECUTED\', CAST(? AS JSON))',
        [deviceId, JSON.stringify({ mac, schedule_id: schedule.id, time: currentTime, duration_ms: durationMs })]
      );
    } catch (e) {
      console.error('[FEED_CHECK] Failed to insert FEED_EXECUTED log:', e);
    }

    // Return feeding instruction
    return res.json({
      shouldFeed: true,
      mac,
      deviceId,
      deviceName: device.name,
      currentTime,
      scheduleId: schedule.id,
      scheduleName: schedule.schedule_name,
      amount: schedule.amount,
      durationMs: durationMs,
      message: 'Feeding time!'
    });
    
  } catch (err) {
    console.error('[FEED_CHECK] Error:', err);
    return res.status(500).json({ error: 'Internal server error', shouldFeed: false });
  }
});

// Reverse proxy by device
app.use('/api/:deviceId', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const { deviceId } = req.params as { deviceId: string };
  const [rows] = await pool.query<RowDataPacket[]>('SELECT esp_host, esp_port FROM devices WHERE id = ?', [deviceId]);
  const row = (rows as any[])[0];
  const host = row?.esp_host || process.env.FALLBACK_ESP_HOST || '192.168.1.50';
  const port = row?.esp_port || +(process.env.FALLBACK_ESP_PORT || 80);
  const target = `http://${host}:${port}`;
  const proxy = createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: { '^/api/[^/]+': '' }
  } as any);
  return (proxy as any)(req, res, next);
});

// Legacy fallback /api -> last settings
app.use('/api', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const { target } = await getEspTarget();
  const proxy = createProxyMiddleware({ target, changeOrigin: true, pathRewrite: { '^/api': '' } } as any);
  return (proxy as any)(req, res, next);
});

const PORT = +(process.env.PORT || 8080);
app.listen(PORT, () => {
  console.log(`Config Service listening on :${PORT}`);
});
