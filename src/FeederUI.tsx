import { useState, useEffect, useRef } from 'react';
import { Wifi, WifiOff, Activity, Settings, Calendar, Shield, Network, Scale, Clock, Plus, Trash2, Edit2, Save, X, Zap, Timer, PawPrint, Code, RefreshCw, FileText } from 'lucide-react';

const ANIMAL_TYPES = {
  dog_small: { name: 'Köpek (Küçük)', icon: '🐕', portion: 150, duration: 8000 },
  dog_medium: { name: 'Köpek (Orta)', icon: '🐕', portion: 300, duration: 12000 },
  dog_large: { name: 'Köpek (Büyük)', icon: '🦮', portion: 500, duration: 15000 },
  cat: { name: 'Kedi', icon: '🐈', portion: 80, duration: 6000 },
  chicken: { name: 'Tavuk', icon: '🐔', portion: 120, duration: 10000 },
  rabbit: { name: 'Tavşan', icon: '🐰', portion: 100, duration: 8000 },
  bird: { name: 'Kuş', icon: '🦜', portion: 30, duration: 5000 },
  custom: { name: 'Özel', icon: '⚙️', portion: 100, duration: 8000 }
};

interface FeederUIProps {
  token: string;
  user: any;
  onLogout: () => void;
}

export default function FeederUI({ token, user, onLogout }: FeederUIProps) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeSubTab, setActiveSubTab] = useState('general');
  const [status, setStatus] = useState({
    id: 'A1B2C3D4',
    n: 'Feeder-Demo',
    t: '14:30',
    w: 245.8,
    ntp: true,
    e: null
  });
  const [error, setError] = useState('');
  const [demoMode, setDemoMode] = useState(true);
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [showAllDevices, setShowAllDevices] = useState(false);
  const [statusErrorCount, setStatusErrorCount] = useState(0);
  const [modules, setModules] = useState<Array<any>>([]);
  const [pinsEditMode, setPinsEditMode] = useState(false);
  const [rowEditIndex, setRowEditIndex] = useState<number | null>(null);
  const [rowDraft, setRowDraft] = useState<any | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [scheduleId, setScheduleId] = useState<number | null>(null);
  const [newDevice, setNewDevice] = useState<{ name: string; serial: string; esp_host: string; esp_port: number }>({
    name: '',
    serial: '',
    esp_host: '',
    esp_port: 80
  });

  const [deviceQuery, setDeviceQuery] = useState('');
  
  // Seed presets: model and motor type
  const [seedModel, setSeedModel] = useState<'esp8266_wemos_d1' | 'raspberry_pi_zero_w'>('esp8266_wemos_d1');
  const [seedMotor, setSeedMotor] = useState<'servo' | 'step'>('servo');
  const [editingDevice, setEditingDevice] = useState<any | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [syncingDeviceId, setSyncingDeviceId] = useState<string | null>(null);
  const [deviceCodeTab, setDeviceCodeTab] = useState<'esp8266' | 'raspberry'>('esp8266');
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logLevel, setLogLevel] = useState('');
  const [logQuery, setLogQuery] = useState('');
  const [logSinceMinutes, setLogSinceMinutes] = useState(1440);
  const logsIntervalRef = useRef<number | null>(null);
  const [logsTick, setLogsTick] = useState(0);
  const statusRequestInFlight = useRef<boolean>(false);

  // Calendar state
  const [schedules, setSchedules] = useState([
    { id: 1, time: '08:00', amount: 100, enabled: true },
    { id: 2, time: '14:00', amount: 120, enabled: true },
    { id: 3, time: '20:00', amount: 90, enabled: true }
  ]);
  const [editingSchedule, setEditingSchedule] = useState(null);

  // Form states
  const [formData, setFormData] = useState({
    name: 'Feeder-Demo',
    animalType: 'dog_medium',
    hasWeightSensor: true,
    def: 300,
    maxms: 12000,
    scale: 420.0,
    telms: 7000,
    servoSpeed: 50,
    servoEnabled: true,
    motorSpeed: 75,
    motorType: 'DC Motor',
    motorDCEnabled: true,
    motorStepEnabled: false,
    stepperSpeed: 60,
    org: 'myorg',
    site: 'yard-01',
    mhost: '192.168.1.10',
    mport: 1883,
    group: true,
    admin: 'admin'
  });

  const fetchStatus = async () => {
    // Stop polling after 3 consecutive failures
    if (statusErrorCount >= 3) {
      setError('Cihaz çevrimdışı (bağlantı kurulamıyor)');
      return;
    }
    
    // Avoid overlapping status requests
    if (statusRequestInFlight.current) return;
    statusRequestInFlight.current = true;
    try {
      const url = selectedDeviceId ? `/api/${selectedDeviceId}/status` : '/api/status';
      const response = await fetch(url, { cache: 'no-store' });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      setStatus(data);
      setError(data.e || '');
      setDemoMode(false);
      setStatusErrorCount(0); // Reset error count on success
    } catch (err) {
      setStatusErrorCount(prev => prev + 1);
      
      if (demoMode) {
        setStatus(prev => ({
          ...prev,
          w: 200 + Math.random() * 100,
          t: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
        }));
      } else {
        setError('Cihaza bağlanılamıyor...');
      }
    } finally {
      statusRequestInFlight.current = false;
    }
  };

  // helper: current device model and step motor pins by model
  const currentDevice = devices.find((d: any) => String(d.id) === String(selectedDeviceId));
  const currentModel = currentDevice?.model || 'esp8266_wemos_d1';
  const getStepperPinsText = () => {
    if ((currentModel || '').toLowerCase() === 'raspberry_pi_zero_w') return 'GPIO23 (Yön), GPIO24 (PWM)';
    return 'D5 (GPIO14), D6 (GPIO12)';
  };

  // Settings cache (per device) for instant render
  const settingsCacheRef = useRef<Map<string, any>>(new Map());
  const settingsAbortRef = useRef<AbortController | null>(null);

  const mapBackendToForm = (data: any) => ({
    name: data.name || data.n || '',
    animalType: data.animal_type || data.animalType || 'dog_medium',
    hasWeightSensor: Boolean(data.has_weight_sensor === 1 || data.has_weight_sensor === true || data.hasWeight === 1 || data.hasWeight === true),
    def: data.portion_default || data.def || 100,
    maxms: data.max_open_ms || data.ms || 5000,
    scale: data.scale_factor || data.sc || 1.0,
    telms: data.telemetry_ms || data.tl || 7000,
    servoSpeed: data.servo_speed || data.servoSpeed || 50,
    servoEnabled: true,
    motorSpeed: data.motor_speed || data.motorSpeed || 75,
    motorType: data.motor_type ? (data.motor_type === 'step' ? 'Step Motor' : 'DC Motor') : (data.motorType || 'DC Motor'),
    motorDCEnabled: !data.motor_type || data.motor_type === 'dc',
    motorStepEnabled: data.motor_type === 'step',
    stepperSpeed: data.stepper_speed || data.stepperSpeed || 60,
    org: data.org || data.o || '',
    site: data.site || data.si || '',
    mhost: data.mqtt_host || data.mh || '',
    mport: data.mqtt_port || data.mp || 1883,
    group: Boolean(data.mqtt_group === 1 || data.g === 1),
    admin: data.admin_user || data.au || ''
  });
  const fetchSettings = async () => {
    // cancel previous in-flight request
    try { settingsAbortRef.current?.abort(); } catch {}
    const controller = new AbortController();
    settingsAbortRef.current = controller;
    setIsLoadingSettings(true);
    try {
      const response = selectedDeviceId
        ? await fetch(`/devices/${selectedDeviceId}/settings`, { cache: 'no-store', signal: controller.signal })
        : await fetch('/config/settings', { cache: 'no-store', signal: controller.signal });
      if (response.ok) {
        const data = await response.json();
        // Map backend fields to frontend format
        const mapped = mapBackendToForm(data);
        setFormData(mapped);
        if (selectedDeviceId) settingsCacheRef.current.set(String(selectedDeviceId), mapped);
        setDemoMode(false);
      }
    } catch (err) {
      console.error('Settings fetch error:', err);
    } finally {
      setIsLoadingSettings(false);
    }
  };

  // Load devices (prefetch first device). Re-run when showAllDevices changes
  useEffect(() => {
    const loadDevices = async () => {
      try {
        const res = await fetch(`/devices${showAllDevices ? '?all=1' : ''}` , {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const list = await res.json();
          setDevices(list as any[]);
          if (list.length > 0) {
            const firstId = String(list[0].id);
            setSelectedDeviceId(firstId);
            // prefetch settings in background
            try {
              const resp = await fetch(`/devices/${firstId}/settings`, { cache: 'no-store' });
              if (resp.ok) {
                const data = await resp.json();
                settingsCacheRef.current.set(firstId, mapBackendToForm(data));
              }
            } catch {}
          }
        }
      } catch {}
    };
    loadDevices();
  }, [showAllDevices]);

  useEffect(() => {
    const loadLogs = async () => {
      if (!selectedDeviceId || activeTab !== 'logs') return;
      setLogsLoading(true);
      try {
        const qs = new URLSearchParams();
        if (logLevel) qs.append('level', logLevel);
        if (logQuery) qs.append('q', logQuery);
        if (logSinceMinutes) qs.append('sinceMinutes', String(logSinceMinutes));
        qs.append('limit', '200');
        const res = await fetch(`/devices/${selectedDeviceId}/logs?${qs.toString()}`, { headers: { 'Authorization': `Bearer ${token}` }, cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setLogs(Array.isArray(data) ? data : []);
        }
      } catch {}
      finally { setLogsLoading(false); }
    };
    loadLogs();
    if (logsIntervalRef.current) window.clearInterval(logsIntervalRef.current);
    if (activeTab === 'logs' && selectedDeviceId) {
      // Faster polling for logs (2s instead of 5s) for near real-time feeling
      logsIntervalRef.current = window.setInterval(loadLogs, 2000) as any;
    }
    return () => {
      if (logsIntervalRef.current) {
        window.clearInterval(logsIntervalRef.current);
        logsIntervalRef.current = null;
      }
    };
  }, [activeTab, selectedDeviceId, logLevel, logQuery, logSinceMinutes, logsTick]);

  // Fetch settings and start status polling when device or tab changes
  useEffect(() => {
    if (!selectedDeviceId) {
      // Clear status when no device selected
      setStatus({
        id: '',
        n: '',
        t: '--:--',
        w: 0,
        ntp: false,
        e: null
      });
      setIsLoadingSettings(false);
      return;
    }

    // Instant render from cache if present
    const cached = settingsCacheRef.current.get(String(selectedDeviceId));
    if (cached) setFormData(cached);
    // Fetch immediately; AbortController cancels previous if needed
    fetchSettings();
    setStatusErrorCount(0);

    // Only poll status on dashboard tab to avoid flooding when editing schedules, logs, etc.
    if (activeTab !== 'dashboard') {
      return () => {
        try { settingsAbortRef.current?.abort(); } catch {}
      };
    }

    fetchStatus();
    // Start status polling (1s instead of 2s for more responsive UI)
    const statusInterval = setInterval(fetchStatus, 1000);

    return () => {
      try { settingsAbortRef.current?.abort(); } catch {}
      clearInterval(statusInterval);
    };
  }, [selectedDeviceId, activeTab]);

  // Update seedModel when currentModel changes
  useEffect(() => {
    const cm = (currentModel || '').toLowerCase();
    if (cm.includes('raspberry')) setSeedModel('raspberry_pi_zero_w');
    else setSeedModel('esp8266_wemos_d1');
  }, [currentModel, selectedDeviceId]);

  // simple emoji icon mapping for modules
  const moduleEmoji = (typeOrName: string = '') => {
    const t = (typeOrName || '').toLowerCase();
    if (t.includes('servo')) return '🌀';
    if (t.includes('dc') || t.includes('motor')) return '⚙️';
    if (t.includes('load') || t.includes('hx711')) return '⚖️';
    if (t.includes('dht') || t.includes('temp') || t.includes('sensor')) return '🌡️';
    if (t.includes('led') || t.includes('flash')) return '💡';
    if (t.includes('mosfet') || t.includes('power')) return '⚡';
    if (t.includes('wifi') || t.includes('esp')) return '📶';
    return '📍';
  };

  // load modules when pins tab is active and device selected
  useEffect(() => {
    const loadModules = async () => {
      if (activeSubTab !== 'pins') return;
      if (!selectedDeviceId) { setModules([]); return; }
      try {
        const res = await fetch(`/devices/${selectedDeviceId}/pins`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : undefined
        });
        if (res.ok) {
          const data = await res.json();
          setModules(data || []);
        } else {
          setModules([]);
        }
      } catch { setModules([]); }
    };
    loadModules();
  }, [activeSubTab, selectedDeviceId, token]);

  const beginRowEdit = (idx: number) => {
    setRowEditIndex(idx);
    setRowDraft(JSON.parse(JSON.stringify(modules[idx] || {})));
  };
  const cancelRowEdit = () => { setRowEditIndex(null); setRowDraft(null); };
  const saveRowEdit = async () => {
    if (!selectedDeviceId || rowDraft == null) return;
    try {
      const res = await fetch(`/devices/${selectedDeviceId}/pins`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ modules: [rowDraft] })
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        alert(`Satır kaydedilemedi (HTTP ${res.status})\n${t}`);
        return;
      }
      const list = await (await fetch(`/devices/${selectedDeviceId}/pins`, { headers: token ? { 'Authorization': `Bearer ${token}` } : undefined })).json();
      setModules(list || []);
      cancelRowEdit();
    } catch {
      alert('Satır kaydetme sırasında hata oluştu');
    }
  };

  // Load schedules only when device changes (not on every tab change)
  useEffect(() => {
    if (selectedDeviceId) {
      loadSchedules();
    } else {
      setSchedules([]);
      setScheduleId(null);
    }
  }, [selectedDeviceId]);

  const handleSeedPins = async () => {
    if (!selectedDeviceId) return;
    try {
      const res = await fetch(`/devices/${selectedDeviceId}/pins/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: seedModel, motor: seedMotor })
      });
      if (res.ok) {
        const list = await (await fetch(`/devices/${selectedDeviceId}/pins`)).json();
        setModules(list || []);
      }
    } catch {}
  };

  const handleFeed = async () => {
    try {
      const url = selectedDeviceId ? `/api/${selectedDeviceId}/feed` : '/api/feed';
      await fetch(url, { method: 'POST' });
      setTimeout(fetchStatus, 500);
    } catch (err) {
      if (demoMode) {
        alert('Demo Mod: Yemleme simüle edildi! 🍖');
      }
    }
  };

  const handleTare = async () => {
    try {
      const url = selectedDeviceId ? `/api/${selectedDeviceId}/tare` : '/api/tare';
      await fetch(url, { method: 'POST' });
      setTimeout(fetchStatus, 500);
    } catch (err) {
      if (demoMode) {
        setStatus(prev => ({ ...prev, w: 0 }));
        alert('Demo Mod: Tare yapıldı! ⚖️');
      }
    }
  };

  const handleCalibrate = async () => {
    try {
      const url = selectedDeviceId ? `/api/${selectedDeviceId}/cal` : '/api/cal';
      await fetch(url, { method: 'POST' });
      setTimeout(fetchStatus, 500);
    } catch (err) {
      if (demoMode) {
        alert('Demo Mod: Kalibrasyon yapıldı (200g)! 🧪');
      }
    }
  };

  // ---- Schedules CRUD (load first schedule; save all items) ----
  const loadSchedules = async () => {
    if (!selectedDeviceId) {
      setSchedules([]);
      setScheduleId(null);
      return;
    }
    try {
      const res = await fetch(`/devices/${selectedDeviceId}/schedules`);
      if (res.ok) {
        const arr = await res.json();
        if (Array.isArray(arr) && arr.length > 0) {
          setScheduleId(arr[0].id);
          setSchedules(
            (arr[0].items || []).map((it: any) => ({ id: it.id, time: it.time, amount: it.amount, duration_ms: it.duration_ms ?? null, enabled: !!it.enabled }))
          );
        } else {
          // No schedules found for this device - clear the list
          setScheduleId(null);
          setSchedules([]);
        }
      } else {
        // Failed to load - clear the list
        setScheduleId(null);
        setSchedules([]);
      }
    } catch {
      // Error loading - clear the list
      setScheduleId(null);
      setSchedules([]);
    }
  };

  const handleSaveSchedule = async () => {
    if (!selectedDeviceId) return;
    const items = schedules.map((s: any) => ({ time: s.time, amount: s.amount, duration_ms: (s.duration_ms === '' || s.duration_ms == null) ? null : Number(s.duration_ms), enabled: s.enabled ? 1 : 0 }));
    if (!scheduleId) {
      const res = await fetch(`/devices/${selectedDeviceId}/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Default', enabled: 1, items })
      });
      if (res.ok) {
        // Optimistic update: use current schedules state, just set created scheduleId
        try {
          const data = await res.json().catch(() => null as any);
          if (data && typeof data.id === 'number') {
            setScheduleId(data.id);
          }
        } catch {}
        try {
          const syncRes = await fetch(`/devices/${selectedDeviceId}/schedules/sync`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (syncRes.ok) {
            alert('Takvim oluşturuldu, kaydedildi ve cihaza gönderildi.');
          } else {
            alert('Takvim oluşturuldu ve kaydedildi ancak cihaza gönderilemedi. Lütfen cihaz bağlantısını kontrol edin.');
          }
        } catch {
          alert('Takvim oluşturuldu ve kaydedildi ancak cihaza gönderim sırasında hata oluştu.');
        }
      }
    } else {
      const res = await fetch(`/devices/${selectedDeviceId}/schedules/${scheduleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });
      if (res.ok) {
        try {
          const syncRes = await fetch(`/devices/${selectedDeviceId}/schedules/sync`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (syncRes.ok) {
            alert('Takvim güncellendi ve cihaza gönderildi.');
          } else {
            alert('Takvim güncellendi ancak cihaza gönderilemedi. Lütfen cihaz bağlantısını kontrol edin.');
          }
        } catch {
          alert('Takvim güncellendi ancak cihaza gönderim sırasında hata oluştu.');
        }
      }
    }
  };

  const handleInputChange = (e: any) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleAnimalTypeChange = (type: string) => {
    const animal = (ANIMAL_TYPES as any)[type];
    setFormData(prev => ({
      ...prev,
      animalType: type,
      def: animal.portion,
      maxms: animal.duration
    }));
  };

  // Sync device - send HTTP request to ESP8266 to reload settings
  const handleSyncDevice = async (deviceId: string, espHost: string, espPort: number) => {
    setSyncingDeviceId(deviceId);
    
    try {
      // ESP8266'ya sync komutu gönder
      const response = await fetch(`http://${espHost}:${espPort}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'reload_settings' })
      });

      if (response.ok) {
        alert(`✅ Cihaz #${deviceId} senkronize edildi! Ayarlar yeniden yükleniyor...`);
      } else {
        throw new Error('Cihaz yanıt vermedi');
      }
    } catch (err) {
      console.error('Sync error:', err);
      alert(`⚠️ Cihaz #${deviceId} ile bağlantı kurulamadı.\n\nLütfen kontrol edin:\n• Cihaz açık mı?\n• IP adresi doğru mu? (${espHost}:${espPort})\n• Aynı ağda mısınız?`);
    } finally {
      setSyncingDeviceId(null);
    }
  };

  const handleSaveSettings = async () => {
    if (!selectedDeviceId) {
      alert('⚠️ Lütfen önce bir cihaz seçin!');
      return;
    }

    setIsLoadingSettings(true);
    
    try {
      // Save device settings
      const response = await fetch(`/devices/${selectedDeviceId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          animal_type: (formData as any).animalType,
          has_weight_sensor: (formData as any).hasWeightSensor ? 1 : 0,
          portion_default: (formData as any).def,
          max_open_ms: (formData as any).maxms,
          scale_factor: (formData as any).scale,
          telemetry_ms: (formData as any).telms,
          servo_speed: (formData as any).servoSpeed,
          motor_speed: (formData as any).motorSpeed,
          motor_type: ((formData as any).motorStepEnabled ?? false) ? 'step' : 'dc',
          stepper_speed: (formData as any).stepperSpeed || 60,
          org: (formData as any).org,
          site: (formData as any).site,
          mqtt_host: (formData as any).mhost,
          mqtt_port: (formData as any).mport,
          mqtt_group: (formData as any).group ? 1 : 0,
          admin_user: (formData as any).admin
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Bilinmeyen hata' }));
        throw new Error(error.error || 'Ayarlar kaydedilemedi');
      }

      // Reload settings to confirm
      await fetchSettings();
      
      alert('✅ Tüm ayarlar başarıyla kaydedildi!');
      console.log('Settings saved successfully');
    } catch (err) {
      console.error('Save settings error:', err);
      alert(`❌ Ayarlar kaydedilemedi: ${(err as Error).message}`);
    } finally {
      setIsLoadingSettings(false);
    }
  };

  const addSchedule = () => {
    const newId = Math.max(...schedules.map(s => s.id), 0) + 1;
    setSchedules([...schedules, {
      id: newId,
      time: '12:00',
      amount: (formData as any).def || 100,
      enabled: true
    }]);
  };

  const deleteSchedule = (id: number) => {
    setSchedules(schedules.filter(s => s.id !== id));
  };

  const toggleSchedule = (id: number) => {
    setSchedules(schedules.map(s => 
      s.id === id ? { ...s, enabled: !s.enabled } : s
    ));
  };

  const updateSchedule = (id: number, field: string, value: any) => {
    setSchedules(schedules.map(s => 
      s.id === id ? { ...s, [field]: value } : s
    ));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-6">
      <div className="max-w-[95%] xl:max-w-[90%] 2xl:max-w-7xl mx-auto">
        {/* Demo Mode Banner */}
        {demoMode && (
          <div className="bg-amber-600/20 border border-amber-500/50 rounded-xl p-4 mb-6">
            <p className="text-amber-300 text-center font-semibold">
              🎭 Demo Modu - ESP32'ye bağlı değilsiniz
            </p>
          </div>
        )}

        {/* Header */}
        <div className="bg-gradient-to-r from-slate-800/80 to-slate-700/80 backdrop-blur-sm rounded-xl shadow-2xl p-6 mb-6 border border-slate-600">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="bg-blue-600 p-3 rounded-lg">
                  <PawPrint className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-white mb-1">Smart Pet Feeder</h1>
                  <p className="text-slate-300">Profesyonel Hayvan Besleme Sistemi</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-slate-700/50 px-3 py-2 rounded-lg border border-slate-600">
                <span className="text-slate-300 text-sm">👤</span>
                <span className="text-white text-sm font-medium">{user?.displayName || user?.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-slate-300 text-sm">Cihaz</label>
                <select
                  className="bg-slate-800 text-white border border-slate-600 rounded px-3 py-2"
                  value={selectedDeviceId ?? ''}
                  onChange={(e) => setSelectedDeviceId(e.target.value || null)}
                >
                  <option value="">Varsayılan</option>
                  {devices.map((d: any) => (
                    <option key={d.id} value={String(d.id)}>{d.name} ({d.esp_host})</option>
                  ))}
                </select>
              </div>
              <button
                onClick={onLogout}
                className="bg-red-600/20 hover:bg-red-600/30 border border-red-600/50 text-red-300 px-4 py-2 rounded-lg transition-all"
              >
                Çıkış
              </button>
              {status?.ntp ? (
                <div className="flex items-center gap-2 bg-green-900/30 px-4 py-2 rounded-lg border border-green-600/50">
                  <Wifi className="text-green-400 w-5 h-5" />
                  <span className="text-green-300 text-sm font-medium">Çevrimiçi</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-red-900/30 px-4 py-2 rounded-lg border border-red-600/50">
                  <WifiOff className="text-red-400 w-5 h-5" />
                  <span className="text-red-300 text-sm font-medium">Çevrimdışı</span>
                </div>
              )}

              {/* Header içinde alt sekme içeriği yok */}
            </div>
          </div>
        </div>

        

        {/* Tabs */}
        <div className="flex gap-3 mb-6 overflow-x-auto pb-2">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all whitespace-nowrap ${
              activeTab === 'dashboard'
                ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/50'
                : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-700'
            }`}
          >
            <Activity className="w-5 h-5" />
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all whitespace-nowrap ${
              activeTab === 'settings'
                ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/50'
                : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-700'
            }`}
          >
            <Settings className="w-5 h-5" />
            Ayarlar
          </button>

          <button
            onClick={() => { setActiveTab('device-management'); }}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all whitespace-nowrap ${
              activeTab === 'device-management'
                ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/50'
                : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-700'
            }`}
          >
            <Network className="w-5 h-5" />
            Cihaz Yönetimi
          </button>

          <button
            onClick={() => { setActiveTab('device-code'); }}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all whitespace-nowrap ${
              activeTab === 'device-code'
                ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/50'
                : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-700'
            }`}
          >
            <Code className="w-5 h-5" />
            Cihaz Kodu
          </button>

          <button
            onClick={() => { setActiveTab('logs'); }}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all whitespace-nowrap ${
              activeTab === 'logs'
                ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/50'
                : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-700'
            }`}
          >
            <FileText className="w-5 h-5" />
            Loglar
          </button>

          <button
            onClick={() => { setActiveTab('pin-map'); }}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all whitespace-nowrap ${
              activeTab === 'pin-map'
                ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/50'
                : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-700'
            }`}
          >
            <Network className="w-5 h-5" />
            Pin Haritası
          </button>
        </div>

        {/* Logs Panel */}
        {activeTab === 'logs' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-700/80 backdrop-blur-sm rounded-xl p-6 border border-slate-600">
              <h3 className="text-white text-xl font-semibold mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" />
                Cihaz Logları
              </h3>

              {!selectedDeviceId ? (
                <div className="bg-amber-900/20 border border-amber-600/30 rounded-lg p-4 text-center text-amber-200">
                  Lütfen bir cihaz seçin.
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-end gap-3 mb-4">
                    <div>
                      <label className="block text-slate-300 text-sm mb-1">Seviye</label>
                      <select value={logLevel} onChange={(e) => setLogLevel(e.target.value)} className="bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm">
                        <option value="">Tümü</option>
                        <option value="debug">debug</option>
                        <option value="info">info</option>
                        <option value="warn">warn</option>
                        <option value="error">error</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-300 text-sm mb-1">Arama</label>
                      <input value={logQuery} onChange={(e) => setLogQuery(e.target.value)} placeholder="mesaj içinde ara" className="w-64 bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm placeholder-slate-400" />
                    </div>
                    <div>
                      <label className="block text-slate-300 text-sm mb-1">Zaman</label>
                      <select value={logSinceMinutes} onChange={(e) => setLogSinceMinutes(Number(e.target.value))} className="bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm">
                        <option value={60}>Son 1 saat</option>
                        <option value={360}>Son 6 saat</option>
                        <option value={1440}>Son 24 saat</option>
                        <option value={10080}>Son 7 gün</option>
                      </select>
                    </div>
                    <button onClick={() => setLogsTick(v => v + 1)} className="px-3 py-2 rounded bg-slate-700 text-white text-sm hover:bg-slate-600">Yenile</button>
                    {logsLoading && <span className="text-slate-300 text-sm">Yükleniyor...</span>}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-300 border-b border-slate-600/50">
                          <th className="py-2 pr-4">Zaman</th>
                          <th className="py-2 pr-4">Seviye</th>
                          <th className="py-2 pr-4">Mesaj</th>
                          <th className="py-2 pr-4">Meta</th>
                        </tr>
                      </thead>
                      <tbody className="text-slate-200">
                        {logs.length === 0 ? (
                          <tr><td colSpan={4} className="py-3 text-center text-slate-400">Kayıt yok</td></tr>
                        ) : logs.map((lg: any) => (
                          <tr key={lg.id} className="border-b border-slate-700/40">
                            <td className="py-2 pr-4 whitespace-nowrap">{new Date(lg.created_at || '').toLocaleString()}</td>
                            <td className="py-2 pr-4"><span className={`px-2 py-0.5 rounded text-xs ${
                              lg.level === 'error' ? 'bg-red-800/40 text-red-200' :
                              lg.level === 'warn' ? 'bg-amber-800/40 text-amber-200' :
                              lg.level === 'debug' ? 'bg-slate-800/60 text-slate-300' : 'bg-green-800/40 text-green-200'
                            }`}>{lg.level}</span></td>
                            <td className="py-2 pr-4 text-slate-100">{lg.message}</td>
                            <td className="py-2 pr-4 text-xs text-slate-300 font-mono max-w-[360px] overflow-hidden text-ellipsis">
                              {lg.meta ? (typeof lg.meta === 'string' ? lg.meta : JSON.stringify(lg.meta)) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Dashboard Panel */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {isLoadingSettings && (
              <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-4">
                <p className="text-blue-300 text-center flex items-center justify-center gap-2">
                  <span className="animate-spin">⏳</span>
                  Cihaz ayarları yükleniyor...
                </p>
              </div>
            )}
            {/* All Devices Status Overview */}
            {devices.length > 1 && (
              <div className="bg-gradient-to-br from-slate-800/80 to-slate-700/80 backdrop-blur-sm rounded-xl p-6 border border-slate-600">
                <h3 className="text-white text-lg font-semibold mb-4 flex items-center gap-2">
                  <Network className="w-5 h-5 text-blue-400" />
                  Tüm Cihazlar Durumu
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {devices.map((d: any) => (
                    <div 
                      key={d.id} 
                      onClick={() => setSelectedDeviceId(String(d.id))}
                      className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        selectedDeviceId === String(d.id)
                          ? 'bg-blue-600/20 border-blue-500'
                          : 'bg-slate-700/30 border-slate-600 hover:border-slate-500'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-white font-medium text-sm">{d.name}</span>
                        <span className={`w-2 h-2 rounded-full ${
                          selectedDeviceId === String(d.id) && !error ? 'bg-green-400' : 'bg-slate-500'
                        }`} />
                      </div>

                  {((formData as any).motorType || 'DC Motor') === 'Step Motor' && (
                    <div className="mt-4 bg-slate-700/30 border border-slate-600 rounded-lg p-4">
                      <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-purple-400" />
                        Step Motor Durumu
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Hız:</span>
                          <span className="text-white font-medium">{(formData as any).stepperSpeed || 60}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Durum:</span>
                          <span className="text-green-400 font-medium">● Hazır</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Bağlı Pinler:</span>
                          <span className="text-white font-medium">{getStepperPinsText()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Tip:</span>
                          <span className="text-white font-medium">Step Motor</span>
                        </div>
                      </div>
                    </div>
                  )}
                      <p className="text-slate-400 text-xs">{d.esp_host}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gradient-to-br from-slate-800/80 to-slate-700/80 backdrop-blur-sm rounded-xl p-6 border border-slate-600">
                <div className="flex items-center gap-3 mb-3">
                  <div className="bg-blue-600/20 p-2 rounded-lg">
                    <Activity className="w-5 h-5 text-blue-400" />
                  </div>
                  <h3 className="text-slate-300 text-sm font-medium">Seçili Cihaz</h3>
                </div>
                <p className="text-white text-2xl font-bold mb-1">
                  {selectedDeviceId 
                    ? devices.find(d => String(d.id) === selectedDeviceId)?.name || (status as any)?.n || 'N/A'
                    : 'Cihaz Seçilmedi'
                  }
                </p>
                <p className="text-slate-400 text-sm">
                  {selectedDeviceId
                    ? `${devices.find(d => String(d.id) === selectedDeviceId)?.esp_host || 'N/A'}`
                    : 'Lütfen üstten bir cihaz seçin'
                  }
                </p>
              </div>

              <div className="bg-gradient-to-br from-slate-800/80 to-slate-700/80 backdrop-blur-sm rounded-xl p-6 border border-slate-600">
                <div className="flex items-center gap-3 mb-3">
                  <div className="bg-green-600/20 p-2 rounded-lg">
                    <Clock className="w-5 h-5 text-green-400" />
                  </div>
                  <h3 className="text-slate-300 text-sm font-medium">Sistem Saati</h3>
                </div>
                <p className="text-white text-2xl font-bold mb-1">{(status as any)?.t || '--:--'}</p>
                <p className={`text-sm font-medium ${(status as any)?.ntp ? 'text-green-400' : 'text-red-400'}`}>
                  {(status as any)?.ntp ? '✓ NTP Senkronize' : '✗ NTP Bağlantısı Yok'}
                </p>
              </div>

              <div className="bg-gradient-to-br from-slate-800/80 to-slate-700/80 backdrop-blur-sm rounded-xl p-6 border border-slate-600">
                <div className="flex items-center gap-3 mb-3">
                  <div className="bg-purple-600/20 p-2 rounded-lg">
                    <Scale className="w-5 h-5 text-purple-400" />
                  </div>
                  <h3 className="text-slate-300 text-sm font-medium">Yem Miktarı</h3>
                </div>
                <p className="text-white text-2xl font-bold mb-1">
                  {selectedDeviceId 
                    ? `${(status as any)?.w?.toFixed?.(1) || '0.0'}`
                    : '--.-'
                  } <span className="text-lg text-slate-400">gram</span>
                </p>
                <p className="text-slate-400 text-sm">
                  {selectedDeviceId ? 'Canlı Ölçüm' : 'Cihaz seçilmedi'}
                </p>
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="bg-red-900/30 border border-red-600/50 rounded-xl p-4">
                <p className="text-red-400 font-semibold">⚠️ {error}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-700/80 backdrop-blur-sm rounded-xl p-6 border border-slate-600">
              <h3 className="text-white text-xl font-semibold mb-5 flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-400" />
                Hızlı İşlemler
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={handleFeed}
                  className="group relative overflow-hidden bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-5 px-6 rounded-xl shadow-lg transition-all transform hover:scale-105 hover:shadow-blue-600/50"
                >
                  <div className="relative z-10 flex flex-col items-center gap-2">
                    <span className="text-3xl">🧲</span>
                    <span>Manuel Yemle</span>
                  </div>
                </button>
                <button
                  onClick={handleTare}
                  className="group relative overflow-hidden bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold py-5 px-6 rounded-xl shadow-lg transition-all transform hover:scale-105 hover:shadow-green-600/50"
                >
                  <div className="relative z-10 flex flex-col items-center gap-2">
                    <span className="text-3xl">⚖️</span>
                    <span>Tare (Sıfırla)</span>
                  </div>
                </button>
                <button
                  onClick={handleCalibrate}
                  className="group relative overflow-hidden bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold py-5 px-6 rounded-xl shadow-lg transition-all transform hover:scale-105 hover:shadow-purple-600/50"
                >
                  <div className="relative z-10 flex flex-col items-center gap-2">
                    <span className="text-3xl">🧪</span>
                    <span>Kalibrasyon (200g)</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Today's Schedule Preview */}
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-700/80 backdrop-blur-sm rounded-xl p-6 border border-slate-600">
              <h3 className="text-white text-xl font-semibold mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-400" />
                Bugünün Yem Takvimi
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {schedules.filter(s => s.enabled).map(schedule => (
                  <div key={schedule.id} className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-2xl font-bold text-white">{schedule.time}</span>
                      <span className="text-green-400 text-sm font-medium">● Aktif</span>
                    </div>
                    <p className="text-slate-300 text-sm">
                      <span className="font-semibold">{schedule.amount}g</span> yem verilecek
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Settings Panel */}
        {(activeTab === 'settings' || activeTab === 'device-management' || activeTab === 'device-code' || activeTab === 'pin-map') && (
          <div className="bg-gradient-to-br from-slate-800/80 to-slate-700/80 backdrop-blur-sm rounded-xl p-6 border border-slate-600">
            {isLoadingSettings && (
              <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-4 mb-4">
                <p className="text-blue-300 text-center flex items-center justify-center gap-2">
                  <span className="animate-spin">⏳</span>
                  Cihaz ayarları yükleniyor...
                </p>
              </div>
            )}
            {/* Sub Tabs */}
            {activeTab === 'settings' && (
            <div className="flex flex-wrap gap-2 mb-6 pb-6 border-b border-slate-600">
              {[
                { id: 'general', label: 'Genel Ayarlar', icon: Settings },
                { id: 'animal', label: 'Hayvan Profili', icon: PawPrint },
                { id: 'calendar', label: 'Yem Takvimi', icon: Calendar },
                { id: 'motor', label: 'Motor & Servo', icon: Zap },
                { id: 'network', label: 'Ağ/MQTT', icon: Network },
                { id: 'security', label: 'Güvenlik', icon: Shield }
              ].map((tab: any) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveSubTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeSubTab === tab.id
                      ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg'
                      : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 border border-slate-600'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>
            )}

            <div className="space-y-6">
              {/* General Settings */}
              {activeTab === 'settings' && activeSubTab === 'general' && (
                <div className="space-y-5">
                  <div>
                    <label className="block text-white font-semibold mb-3 flex items-center gap-2">
                      <Activity className="w-4 h-4" />
                      Cihaz Adı
                    </label>
                    <input
                      type="text"
                      name="name"
                      maxLength={31}
                      value={(formData as any).name || ''}
                      onChange={handleInputChange}
                      placeholder="Örn: Köpek Besleyici 1"
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-slate-400 text-sm mt-2">Bu isim cihazınızı tanımlamanıza yardımcı olur</p>
                  </div>

                  <div>
                    <button onClick={handleSaveSchedule} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold flex items-center gap-2">
                      <Save className="w-4 h-4" /> Kaydet & Senkronize
                    </button>
                    <label className="block text-white font-semibold mb-3 flex items-center gap-2">
                      <Scale className="w-4 h-4" />
                      Ağırlık Sensörü
                    </label>
                    <div className="flex items-center gap-3 bg-slate-700/30 p-4 rounded-lg border border-slate-600">
                      <input
                        type="checkbox"
                        name="hasWeightSensor"
                        id="hasWeightSensor"
                        checked={(formData as any).hasWeightSensor}
                        onChange={handleInputChange}
                        className="w-5 h-5 bg-slate-700 border-slate-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <label htmlFor="hasWeightSensor" className="text-white font-medium">
                        HX711 Ağırlık Sensörü Var
                      </label>
                    </div>
                    <p className="text-slate-400 text-sm mt-2">
                      {(formData as any).hasWeightSensor 
                        ? '✓ Ağırlık ölçümü ile hassas porsiyon kontrolü aktif'
                        : '✗ Zaman bazlı yem verme kullanılacak (kapak açık kalma süresi)'}
                    </p>
                  </div>

                  {(formData as any).hasWeightSensor && (
                    <div>
                      <label className="block text-white font-semibold mb-3">Scale Factor (Kalibrasyon)</label>
                      <input
                        type="number"
                        name="scale"
                        step={0.1}
                        value={(formData as any).scale || ''}
                        onChange={handleInputChange}
                        className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="text-slate-400 text-sm mt-2">Terazi hassasiyeti (200g ile kalibrasyon yapın)</p>
                    </div>
                  )}

                  <div>
                    <label className="block text-white font-semibold mb-3">Telemetri Aralığı (ms)</label>
                    <input
                      type="number"
                      name="telms"
                      min={1000}
                      step={500}
                      value={(formData as any).telms || ''}
                      onChange={handleInputChange}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-slate-400 text-sm mt-2">
                      MQTT'ye durum gönderme sıklığı (önerilen: 7000ms)
                    </p>
                  </div>
                </div>
              )}

              {/* Animal Profile */}
              {activeTab === 'settings' && activeSubTab === 'animal' && (
                <div className="space-y-5">
                  <div>
                    <label className="block text-white font-semibold mb-3 flex items-center gap-2">
                      <PawPrint className="w-4 h-4" />
                      Hayvan Türü
                    </label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {Object.entries(ANIMAL_TYPES).map(([key, animal]) => (
                        <button
                          key={key}
                          onClick={() => handleAnimalTypeChange(key)}
                          className={`p-4 rounded-lg border-2 transition-all ${
                            (formData as any).animalType === key
                              ? 'bg-blue-600/20 border-blue-500 shadow-lg shadow-blue-500/20'
                              : 'bg-slate-700/30 border-slate-600 hover:border-slate-500'
                          }`}
                        >
                          <div className="text-3xl mb-2">{(animal as any).icon}</div>
                          <div className="text-white text-sm font-medium">{(animal as any).name}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-4">
                    <h4 className="text-blue-300 font-semibold mb-3 flex items-center gap-2">
                      <Activity className="w-4 h-4" />
                      Seçili Profil Ayarları
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between items-center text-white">
                        <span className="text-slate-300">Hayvan:</span>
                        <span className="font-semibold">{(ANIMAL_TYPES as any)[(formData as any).animalType].name}</span>
                      </div>
                      <div className="flex justify-between items-center text-white">
                        <span className="text-slate-300">Önerilen Porsiyon:</span>
                        <span className="font-semibold">{(ANIMAL_TYPES as any)[(formData as any).animalType].portion}g</span>
                      </div>
                      <div className="flex justify-between items-center text-white">
                        <span className="text-slate-300">Önerilen Süre:</span>
                        <span className="font-semibold">{(ANIMAL_TYPES as any)[(formData as any).animalType].duration / 1000}s</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-white font-semibold mb-3">
                      Varsayılan Porsiyon Miktarı (gram)
                    </label>
                    <input
                      type="number"
                      name="def"
                      min={1}
                      max={9999}
                      step={1}
                      value={(formData as any).def || ''}
                      onChange={handleInputChange}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-slate-400 text-sm mt-2">
                      Manuel yemleme ve takvimde kullanılacak standart miktar
                    </p>
                  </div>

                  <div>
                    <label className="block text-white font-semibold mb-3">
                      {(formData as any).hasWeightSensor 
                        ? 'Max Açık Kalma Süresi (ms) - Güvenlik'
                        : 'Kapak Açık Kalma Süresi (ms)'}
                    </label>
                    <input
                      type="number"
                      name="maxms"
                      min={1000}
                      max={60000}
                      step={100}
                      value={(formData as any).maxms || ''}
                      onChange={handleInputChange}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-slate-400 text-sm mt-2">
                      {(formData as any).hasWeightSensor 
                        ? 'Ağırlık hedefine ulaşılamazsa kapak maksimum bu kadar açık kalır'
                        : 'Kapak bu süre kadar açık kalacak ve yem dökülecek'}
                    </p>
                  </div>
                </div>
              )}

              {/* Calendar Settings */}
              {activeTab === 'settings' && activeSubTab === 'calendar' && (
                <div className="space-y-5">
                  {!selectedDeviceId ? (
                    <div className="bg-amber-900/20 border border-amber-600/30 rounded-lg p-6 text-center">
                      <Calendar className="w-12 h-12 text-amber-400 mx-auto mb-3" />
                      <h4 className="text-amber-300 font-semibold mb-2">Cihaz Seçilmedi</h4>
                      <p className="text-amber-200/80 text-sm">
                        Yem takvimi düzenlemek için önce üstten bir cihaz seçin.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-blue-300 font-semibold">Seçili Cihaz</h4>
                            <p className="text-blue-200/80 text-sm">
                              {devices.find(d => String(d.id) === selectedDeviceId)?.name || 'Bilinmeyen'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-blue-300 text-sm">Toplam {schedules.filter(s => s.enabled).length} aktif zaman</p>
                            <p className="text-blue-200/80 text-xs">
                              Günlük: {schedules.filter(s => s.enabled).reduce((sum, s) => sum + s.amount, 0)}g
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <h3 className="text-white text-lg font-semibold flex items-center gap-2">
                          <Calendar className="w-5 h-5" />
                          Otomatik Besleme Takvimi
                        </h3>
                        <div className="flex gap-2">
                          <button
                            onClick={addSchedule}
                            className="flex items-center gap-2 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white px-4 py-2 rounded-lg font-medium transition-all"
                          >
                            <Plus className="w-4 h-4" />
                            Yeni Zaman Ekle
                          </button>
                          <button
                            onClick={handleSaveSchedule}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
                          >
                            <Save className="w-4 h-4 inline mr-2" />
                            Kaydet
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  {selectedDeviceId && schedules.length === 0 ? (
                    <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-8 text-center">
                      <Calendar className="w-12 h-12 text-slate-500 mx-auto mb-3" />
                      <p className="text-slate-400">Henüz otomatik besleme zamanı eklenmemiş</p>
                      <button
                        onClick={addSchedule}
                        className="mt-4 text-blue-400 hover:text-blue-300 font-medium"
                      >
                        İlk zamanı ekleyin →
                      </button>
                    </div>
                  ) : selectedDeviceId && schedules.length > 0 ? (
                    <div className="space-y-3">
                      {schedules.map((schedule) => (
                        <div
                          key={schedule.id}
                          className={`bg-slate-700/50 border rounded-lg p-4 transition-all ${
                            schedule.enabled
                              ? 'border-green-600/50 shadow-lg shadow-green-600/10'
                              : 'border-slate-600 opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            {/* Enable/Disable Toggle */}
                            <button
                              onClick={() => toggleSchedule(schedule.id)}
                              className={`p-2 rounded-lg transition-all ${
                                schedule.enabled
                                  ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
                                  : 'bg-slate-600/20 text-slate-400 hover:bg-slate-600/30'
                              }`}
                            >
                              {schedule.enabled ? (
                                <Activity className="w-5 h-5" />
                              ) : (
                                <X className="w-5 h-5" />
                              )}
                            </button>

                            {/* Time Input */}
                            <div className="flex-1">
                              <label className="block text-slate-400 text-xs mb-1">Saat</label>
                              <input
                                type="time"
                                value={schedule.time}
                                onChange={(e) => updateSchedule(schedule.id, 'time', e.target.value)}
                                className="w-full bg-slate-800/50 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>

                            {/* Amount Input */}
                            <div className="flex-1">
                              <label className="block text-slate-400 text-xs mb-1">Miktar (gram)</label>
                              <input
                                type="number"
                                min={1}
                                max={9999}
                                value={schedule.amount}
                                onChange={(e) => updateSchedule(schedule.id, 'amount', parseInt(e.target.value) || 0)}
                                className="w-full bg-slate-800/50 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>

                            {/* Duration (ms) Input */}
                            <div className="flex-1">
                              <label className="block text-slate-400 text-xs mb-1">Süre (ms) [opsiyonel]</label>
                              <input
                                type="number"
                                min={100}
                                max={600000}
                                value={(schedule as any).duration_ms ?? ''}
                                onChange={(e) => updateSchedule(schedule.id, 'duration_ms', e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
                                placeholder="Örn: 800"
                                className="w-full bg-slate-800/50 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>

                            {/* Delete Button */}
                            <button
                              onClick={() => deleteSchedule(schedule.id)}
                              className="p-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded-lg transition-all"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>

                          {/* Status */}
                          <div className="mt-3 pt-3 border-t border-slate-600">
                            <p className="text-sm text-slate-300">
                              {schedule.enabled ? (
                                <span className="text-green-400 font-medium">
                                  ✓ Aktif - Her gün {schedule.time} saatinde {schedule.amount}g yem verilecek
                                </span>
                              ) : (
                                <span className="text-slate-500">
                                  ✗ Pasif - Bu zaman devre dışı
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {selectedDeviceId && (
                    <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-4 mt-4">
                    <h4 className="text-blue-300 font-semibold mb-2 flex items-center gap-2">
                      <Activity className="w-4 h-4" />
                      Takvim Özeti
                    </h4>
                    <div className="text-sm text-slate-300 space-y-1">
                      <p>• Toplam {schedules.length} zaman tanımlı</p>
                      <p>• {schedules.filter(s => s.enabled).length} aktif besleme saati</p>
                      <p>• Günlük toplam: {schedules.filter(s => s.enabled).reduce((sum, s) => sum + s.amount, 0)}g yem</p>
                    </div>
                    </div>
                  )}
                </div>
              )}

              {/* Motor & Servo Settings */}
              {activeTab === 'settings' && activeSubTab === 'motor' && (
                <div className="space-y-5">
                  <div className="bg-amber-900/20 border border-amber-600/30 rounded-lg p-4">
                    <p className="text-amber-300 text-sm flex items-center gap-2">
                      <Zap className="w-4 h-4" />
                      <strong>Uyarı:</strong> Motor ve servo hızlarını değiştirirken dikkatli olun. Yüksek hızlar mekanik hasara neden olabilir.
                    </p>
                  </div>

                  {/* Servo Motor */}
                  <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-5">
                    <label className="flex items-center gap-3 mb-4 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={(formData as any).servoEnabled ?? true} 
                        onChange={(e) => setFormData((prev: any) => ({ ...prev, servoEnabled: e.target.checked }))} 
                        className="w-5 h-5 accent-blue-600" 
                      />
                      <div className="flex items-center gap-2">
                        <Zap className="w-5 h-5 text-blue-400" />
                        <span className="text-white font-semibold text-lg">Servo Motor (Kapak Kontrolü)</span>
                      </div>
                    </label>
                    
                    {((formData as any).servoEnabled ?? true) && (
                      <>
                        <div className="space-y-3 mt-4">
                          <input
                            type="range"
                            name="servoSpeed"
                            min={10}
                            max={100}
                            step={5}
                            value={(formData as any).servoSpeed || 50}
                            onChange={handleInputChange}
                            className="w-full h-3 rounded-lg appearance-none cursor-pointer accent-blue-600 bg-slate-700"
                          />
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400 text-sm">Yavaş (10%)</span>
                            <span className="text-white text-xl font-bold">{(formData as any).servoSpeed}%</span>
                            <span className="text-slate-400 text-sm">Hızlı (100%)</span>
                          </div>
                        </div>
                        <p className="text-slate-400 text-sm mt-3">
                          Kapak açılma/kapanma hızını kontrol eder (MG996R/SG90 servo motor)
                        </p>
                      </>
                    )}
                  </div>

                  {/* DC Motor */}
                  <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-5">
                    <label className="flex items-center gap-3 mb-4 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(formData as any).motorDCEnabled ?? true}
                        onChange={(e) => setFormData((prev: any) => ({ 
                          ...prev, 
                          motorDCEnabled: e.target.checked, 
                          motorStepEnabled: e.target.checked ? false : (prev.motorStepEnabled ?? false), 
                          motorType: e.target.checked ? 'DC Motor' : ((prev.motorStepEnabled ?? false) ? 'Step Motor' : 'DC Motor') 
                        }))}
                        className="w-5 h-5 accent-green-600"
                      />
                      <div className="flex items-center gap-2">
                        <Timer className="w-5 h-5 text-green-400" />
                        <span className="text-white font-semibold text-lg">DC Motor (Yem Akışı)</span>
                      </div>
                    </label>
                    
                    {((formData as any).motorDCEnabled ?? true) && (
                      <>
                        <div className="space-y-3 mt-4">
                          <input
                            type="range"
                            name="motorSpeed"
                            min={10}
                            max={100}
                            step={5}
                            value={(formData as any).motorSpeed || 75}
                            onChange={handleInputChange}
                            className="w-full h-3 rounded-lg appearance-none cursor-pointer accent-green-600 bg-slate-700"
                          />
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400 text-sm">Yavaş (10%)</span>
                            <span className="text-white text-xl font-bold">{(formData as any).motorSpeed}%</span>
                            <span className="text-slate-400 text-sm">Hızlı (100%)</span>
                          </div>
                        </div>
                        <p className="text-slate-400 text-sm mt-3">
                          Yem dağıtım hızını kontrol eder (DC motor ile döner mekanizma)
                        </p>
                      </>
                    )}
                  </div>

                  {/* Step Motor */}
                  <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-5">
                    <label className="flex items-center gap-3 mb-4 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(formData as any).motorStepEnabled ?? false}
                        onChange={(e) => setFormData((prev: any) => ({ 
                          ...prev, 
                          motorStepEnabled: e.target.checked, 
                          motorDCEnabled: e.target.checked ? false : (prev.motorDCEnabled ?? true), 
                          motorType: e.target.checked ? 'Step Motor' : ((prev.motorDCEnabled ?? true) ? 'DC Motor' : 'Step Motor') 
                        }))}
                        className="w-5 h-5 accent-purple-600"
                      />
                      <div className="flex items-center gap-2">
                        <Zap className="w-5 h-5 text-purple-400" />
                        <span className="text-white font-semibold text-lg">Step Motor (28BYJ-48)</span>
                      </div>
                    </label>
                    
                    {((formData as any).motorStepEnabled ?? false) && (
                      <>
                        <div className="space-y-3 mt-4">
                          <input
                            type="range"
                            name="stepperSpeed"
                            min={10}
                            max={100}
                            step={5}
                            value={(formData as any).stepperSpeed || 60}
                            onChange={handleInputChange}
                            className="w-full h-3 rounded-lg appearance-none cursor-pointer accent-purple-600 bg-slate-700"
                          />
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400 text-sm">Yavaş (10%)</span>
                            <span className="text-white text-xl font-bold">{(formData as any).stepperSpeed || 60}%</span>
                            <span className="text-slate-400 text-sm">Hızlı (100%)</span>
                          </div>
                        </div>
                        <p className="text-slate-400 text-sm mt-3">
                          Step motor hızı (adım/saniye olarak normalize edilmiştir)
                        </p>
                      </>
                    )}
                  </div>

                  <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-4">
                    <h4 className="text-blue-300 font-semibold mb-2">💡 Önerilen Ayarlar</h4>
                    <div className="text-sm text-slate-300 space-y-1">
                      <p>• <strong>Köpek/Kedi:</strong> Servo: 50%, Motor: 75%</p>
                      <p>• <strong>Tavuk/Kuş:</strong> Servo: 60%, Motor: 60%</p>
                      <p>• <strong>Hassas Dozaj:</strong> Motor hızını düşürün (40-50%)</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Network Settings */}
              {activeTab === 'settings' && activeSubTab === 'network' && (
                <div className="space-y-5">
                  <div>
                    <label className="block text-white font-semibold mb-3">Organizasyon</label>
                    <input
                      type="text"
                      name="org"
                      maxLength={15}
                      value={(formData as any).org || ''}
                      onChange={handleInputChange}
                      placeholder="myorg"
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-slate-400 text-sm mt-2">MQTT topic yapısında kullanılır</p>
                  </div>

                  <div>
                    <label className="block text-white font-semibold mb-3">Site / Lokasyon</label>
                    <input
                      type="text"
                      name="site"
                      maxLength={15}
                      value={(formData as any).site || ''}
                      onChange={handleInputChange}
                      placeholder="yard-01"
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-slate-400 text-sm mt-2">
                      Birden fazla lokasyonu ayırt etmek için (bahçe, balkon, vb.)
                    </p>
                  </div>

                  <div>
                    <label className="block text-white font-semibold mb-3">MQTT Broker Host</label>
                    <input
                      type="text"
                      name="mhost"
                      maxLength={31}
                      value={(formData as any).mhost || ''}
                      onChange={handleInputChange}
                      placeholder="192.168.1.10 veya mqtt.example.com"
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-white font-semibold mb-3">MQTT Port</label>
                    <input
                      type="number"
                      name="mport"
                      min={1}
                      max={65535}
                      value={(formData as any).mport || ''}
                      onChange={handleInputChange}
                      placeholder="1883"
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-slate-400 text-sm mt-2">Standart MQTT portu: 1883</p>
                  </div>

                  <div>
                    <label className="block text-white font-semibold mb-3">MQTT Parola (opsiyonel)</label>
                    <input
                      type="password"
                      name="mpass"
                      maxLength={23}
                      value={(formData as any).mpass || ''}
                      onChange={handleInputChange}
                      placeholder="••••••••"
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex items-center gap-3 bg-slate-700/30 p-4 rounded-lg border border-slate-600">
                    <input
                      type="checkbox"
                      name="group"
                      id="group"
                      checked={(formData as any).group || false}
                      onChange={handleInputChange}
                      className="w-5 h-5 bg-slate-700 border-slate-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <label htmlFor="group" className="text-white font-medium">
                      Grup Komut (all/cmd) aktif
                    </label>
                  </div>
                  <p className="text-slate-400 text-sm">
                    Birden fazla cihazı aynı anda kontrol etmek için grup komutlarını etkinleştirin
                  </p>

                  <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-4">
                    <h4 className="text-blue-300 font-semibold mb-3">MQTT Topic Yapısı</h4>
                    <div className="space-y-2 font-mono text-xs">
                      <div className="bg-slate-800/50 p-2 rounded">
                        <span className="text-slate-400">Komut:</span>
                        <span className="text-green-400 ml-2">feeder/{(formData as any).org}/{(formData as any).site}/{(status as any).id}/cmd</span>
                      </div>
                      <div className="bg-slate-800/50 p-2 rounded">
                        <span className="text-slate-400">Durum:</span>
                        <span className="text-blue-400 ml-2">feeder/{(formData as any).org}/{(formData as any).site}/{(status as any).id}/status</span>
                      </div>
                      {(formData as any).group && (
                        <div className="bg-slate-800/50 p-2 rounded">
                          <span className="text-slate-400">Grup:</span>
                          <span className="text-purple-400 ml-2">feeder/{(formData as any).org}/{(formData as any).site}/all/cmd</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Device Code (ESP8266 & Raspberry Pi) */}
              {(activeSubTab === 'code' || activeTab === 'device-code') && (
                <div className="space-y-5">
                  {/* Sub-tabs for device types */}
                  <div className="flex gap-3 border-b border-slate-600 pb-3">
                    <button
                      onClick={() => setDeviceCodeTab('esp8266')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-all ${
                        deviceCodeTab === 'esp8266'
                          ? 'bg-blue-600 text-white shadow-lg'
                          : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      <Code className="w-4 h-4" />
                      WeMos D1 (ESP8266)
                    </button>
                    <button
                      onClick={() => setDeviceCodeTab('raspberry')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-all ${
                        deviceCodeTab === 'raspberry'
                          ? 'bg-blue-600 text-white shadow-lg'
                          : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      <Code className="w-4 h-4" />
                      Raspberry Pi Zero W
                    </button>
                  </div>

                  {/* ESP8266 Code */}
                  {deviceCodeTab === 'esp8266' && (
                    <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-4">
                      <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                        <Code className="w-4 h-4" />
                        WeMos D1 (ESP8266) - Multi Motor Controller
                      </h4>
                      <p className="text-slate-300 text-sm mb-3">
                        Arduino IDE ile programlanabilir ESP8266 tabanlı kod. JWT authentication, ETag ile takvim senkronizasyonu, servo/DC/step motor desteği içerir.
                      </p>
                      <div className="flex justify-end mb-2">
                        <button
                          onClick={() => {
                            const codeEl = document.getElementById('esp8266-code') as HTMLPreElement | null;
                            if (codeEl) navigator.clipboard.writeText(codeEl.innerText);
                          }}
                          className="px-3 py-1 rounded text-sm bg-slate-600 hover:bg-slate-500 text-white"
                        >Kopyala</button>
                      </div>
                    <pre id="esp8266-code" className="whitespace-pre-wrap text-xs bg-slate-900 text-green-200 p-3 rounded border border-slate-700 overflow-auto max-h-[560px]">
{`/*
 * ============================================================================
 *  WeMos D1 (ESP8266) Pet Feeder - Multi Motor Controller
 * ============================================================================
 * 
 * MOTOR BAĞLANTI ŞEMALARI:
 * 
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ 1. SERVO MOTOR (MG996R / SG90)                                          │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │   Servo Pin        WeMos D1        Açıklama                             │
 * │   ─────────────────────────────────────────────────────────────────     │
 * │   Signal (Sarı)    D5              PWM kontrol sinyali                  │
 * │   VCC (Kırmızı)    5V              Güç kaynağı                          │
 * │   GND (Kahve)      GND             Toprak                               │
 * └─────────────────────────────────────────────────────────────────────────┘
 * 
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ 2. DC MOTOR (L298N Sürücü ile)                                          │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │   L298N Pin        WeMos D1        Açıklama                             │
 * │   ─────────────────────────────────────────────────────────────────     │
 * │   IN1              D6              Yön kontrolü 1                       │
 * │   IN2              D7              Yön kontrolü 2                       │
 * │   ENA              D8              Hız kontrolü (PWM 0-255)             │
 * │   OUT1/OUT2        Motor           Motor kablolarına bağlanır           │
 * │   12V              Ext. Power      Harici 12V güç kaynağı               │
 * │   GND              WeMos GND       Ortak toprak (ÖNEMLİ!)               │
 * │   5V               -               Kullanılmaz (jumper açık)            │
 * └─────────────────────────────────────────────────────────────────────────┘
 * 
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ 3. 28BYJ-48 STEP MOTOR (ULN2003 Sürücü ile)                             │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │   ULN2003 Pin      WeMos D1        Motor Kablo Rengi                    │
 * │   ─────────────────────────────────────────────────────────────────     │
 * │   IN1              D1 (GPIO5)      Mavi kablo                           │
 * │   IN2              D3 (GPIO0)      Pembe kablo                          │
 * │   IN3              D2 (GPIO4)      Sarı kablo                           │
 * │   IN4              D4 (GPIO2)      Turuncu kablo                        │
 * │   VCC (+)          5V              Güç kaynağı                          │
 * │   GND (-)          GND             Kırmızı kablo (motor 5. pin)         │
 * │                                                                          │
 * │   ⚠️  PIN SIRALAMA ÖNEMLİ: Stepper(STEPS, IN1, IN3, IN2, IN4)          │
 * │   ⚠️  ÖNERİLEN HIZ: 8-12 RPM (daha hızlı motor zorlanır)               │
 * │   ⚠️  ADIM SAYISI: 2048 step/devir (dahili 64:1 redüktör)             │
 * └─────────────────────────────────────────────────────────────────────────┘
 * 
 * GÜÇ KAYNAĞI ÖNERİLERİ:
 * - Servo: 5V 2A (yüksek torklu servolarda harici güç şart)
 * - DC Motor: 12V 2A harici adaptör (L298N için)
 * - Step Motor: 5V 1A (WeMos'tan beslenebilir, ama harici daha stabil)
 * - Tüm GND'ler ortak olmalı!
 * 
 * ============================================================================
 */

// ==== CONFIG ==== //
// Sunucu kök URL (gerekirse değiştirin)
const char* BASE_URL = "${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080'}";
// Kullanıcı kimlik bilgileri (token almak için)
const char* AUTH_EMAIL = "demo@example.com";
const char* AUTH_PASS  = "demo123";

#include <ESP8266WiFiMulti.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266WebServer.h>
#include <WiFiClientSecure.h>
#include <WiFiUdp.h>
#include <NTPClient.h>
#include <ArduinoJson.h>
#include <Servo.h>
#include <Stepper.h>

ESP8266WiFiMulti wifiMulti;
ESP8266WebServer server(80);  // Web server for sync endpoint
Servo servo;

// 28BYJ-48 Step Motor için (Tam tur 2048 adım - dahili redüktör ile 64*32=2048)
#define STEPS_PER_REV 2048
Stepper stepMotor(STEPS_PER_REV, STEP_PIN1, STEP_PIN3, STEP_PIN2, STEP_PIN4); // Doğru sıralama!

// Motor pin tanımlamaları
#define SERVO_PIN D5        // Servo motor PWM pin

// DC Motor pinleri (L298N sürücü)
#define DC_MOTOR_PIN1 D6    // DC motor L298N IN1
#define DC_MOTOR_PIN2 D7    // DC motor L298N IN2
#define DC_MOTOR_EN D8      // DC motor L298N ENA (PWM speed control)

// Step Motor pinleri (ULN2003 sürücü)
#define STEP_PIN1 D1        // ULN2003 IN1 (Mavi kablo)
#define STEP_PIN2 D3        // ULN2003 IN2 (Pembe kablo)
#define STEP_PIN3 D2        // ULN2003 IN3 (Sarı kablo)
#define STEP_PIN4 D4        // ULN2003 IN4 (Turuncu kablo)

String jwtAccess;
String schedulesEtag;
String deviceMac;
String deviceSerial; // MAC normalize edilmiş (":" kaldırılmış, upper)

// Motor ayarları (sunucudan gelecek)
String motorType = "servo";  // "servo", "dc", "step"
int stepperSpeed = 10;       // 28BYJ-48 için RPM (5-15 arası önerilir)
int dcMotorSpeed = 200;      // DC motor PWM değeri (0-255)
int servoOpenAngle = 0;      // Servo açık pozisyon
int servoCloseAngle = 90;    // Servo kapalı pozisyon

unsigned long lastRunMinuteEpoch = 0;

WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", 10800, 60000);

// Takvim belleği (en fazla 8 öğe)
struct ScheduleItem { char time[6]; int amount; int duration_ms; bool enabled; };
ScheduleItem items[8]; 
int itemCount = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\\n\\n========================================");
  Serial.println("   WeMos D1 Pet Feeder - Multi Motor");
  Serial.println("========================================\\n");
  
  // Motor pinlerini başlat
  initMotors();
  
  // WiFi bağlantısı
  WiFi.mode(WIFI_STA);
  wifiMulti.addAP("Feeder_AP", "fEEd_ME.199!");
  
  Serial.println("[WiFi] Connecting...");
  while (wifiMulti.run(5000) != WL_CONNECTED) { 
    Serial.print(".");
    delay(200); 
  }
  Serial.println("\\n[WiFi] Connected!");
  Serial.print("[WiFi] IP: ");
  Serial.println(WiFi.localIP());
  
  // MAC adresini al
  deviceMac = WiFi.macAddress();
  deviceSerial = deviceMac; 
  deviceSerial.replace(":", ""); 
  deviceSerial.toUpperCase();
  
  Serial.println("\\n========================================");
  Serial.println("   DEVICE INFORMATION");
  Serial.println("========================================");
  Serial.print("MAC Address: ");
  Serial.println(deviceMac);
  Serial.print("Serial (for server): ");
  Serial.println(deviceSerial);
  Serial.println("========================================\\n");

  // Token al
  Serial.println("[AUTH] Getting authentication token...");
  if (!getToken()) {
    Serial.println("[AUTH] FAILED! Check credentials and server.");
    Serial.println("[AUTH] Will retry in 30 seconds...");
    delay(30000);
    ESP.restart();
    return;
  }
  Serial.println("[AUTH] ✓ Token received successfully");

  // Cihazı sunucuya kaydet
  Serial.println("\\n[REGISTER] Registering device with server...");
  if (registerDevice()) {
    Serial.println("[REGISTER] ✓ Device registered successfully");
  } else {
    Serial.println("[REGISTER] ! Registration failed (device may already exist)");
  }

  // Provision - Ayarları ve takvimi al
  Serial.println("\\n[PROVISION] Fetching device settings and schedules...");
  if (fetchProvision()) {
    Serial.println("[PROVISION] ✓ Settings loaded");
    printMotorSettings();
  } else {
    Serial.println("[PROVISION] ! Failed to fetch settings");
  }

  // İlk takvim güncellemesi
  Serial.println("\\n[SCHEDULES] Fetching initial schedules...");
  fetchSchedulesIfChanged();

  // NTP başlat
  Serial.println("\\n[NTP] Starting time sync...");
  timeClient.begin();
  timeClient.update();
  Serial.print("[NTP] Current time: ");
  Serial.println(getNowHHMM());

  // Web server endpoint'lerini tanımla
  server.on("/sync", HTTP_POST, []() {
    Serial.println("\\n[SYNC] Sync request received from UI!");
    
    // Ayarları ve takvimi yeniden yükle
    Serial.println("[SYNC] Reloading settings and schedules...");
    fetchProvision();
    fetchSchedulesIfChanged();
    
    server.send(200, "application/json", "{\\"status\\":\\"ok\\",\\"message\\":\\"Settings reloaded\\"}");
    Serial.println("[SYNC] Sync complete!\\n");
  });
  
  server.on("/status", HTTP_GET, []() {
    String json = "{\\"status\\":\\"online\\",\\"mac\\":\\"" + deviceMac + "\\",\\"serial\\":\\"" + deviceSerial + "\\",\\"motor\\":\\"" + motorType + "\\",\\"schedules\\":" + String(itemCount) + "}";
    server.send(200, "application/json", json);
  });
  
  server.begin();
  Serial.println("[WEB] HTTP server started on port 80");

  Serial.println("\\n========================================");
  Serial.println("   SETUP COMPLETE - Running...");
  Serial.println("========================================\\n");
  
  // Test hareketi (opsiyonel - istersen kaldırabilirsin)
  testMotor();
}

void loop() {
  // Web server isteklerini işle
  server.handleClient();
  
  // Her 4 dakikada bir takvimi kontrol et
  static unsigned long lastCheck = 0;
  if (millis() - lastCheck > 240000UL) {
    lastCheck = millis();
    Serial.println("\n[SCHEDULES] Periodic check...");
    fetchSchedulesIfChanged();
  }

  // Dakikada bir çalışma
  static unsigned long lastMinuteTick = 0;
  if (millis() - lastMinuteTick > 60000UL) {
    lastMinuteTick = millis();
    timeClient.update();
    unsigned long epoch = timeClient.getEpochTime();
    unsigned long nowMinuteEpoch = epoch / 60UL;
    String now = getNowHHMM();
    
    Serial.print("[TIME] Current: ");
    Serial.print(now);
    Serial.print(" | Checking ");
    Serial.print(itemCount);
    Serial.println(" schedules...");
    
    if (nowMinuteEpoch != lastRunMinuteEpoch) {
      for (int i = 0; i < itemCount; i++) {
        if (!items[i].enabled) continue;
        if (String(items[i].time) == now) {
          int durMs = (items[i].duration_ms > 0) ? items[i].duration_ms : mapAmountToMs(items[i].amount);
          
          Serial.println("\n*** SCHEDULE TRIGGERED ***");
          Serial.print("Time: "); Serial.println(now);
          Serial.print("Amount: "); Serial.print(items[i].amount); Serial.println("g");
          Serial.print("Duration: "); Serial.print(durMs); Serial.println("ms");
          Serial.print("Motor Type: "); Serial.println(motorType);
          
          runMotor(durMs, items[i].amount);
          
          lastRunMinuteEpoch = nowMinuteEpoch;
          Serial.println("*** FEEDING COMPLETE ***\n");
          break;
        }
      }
    }
  }
}

void initMotors() {
  Serial.println("[MOTORS] Initializing pins...");
  Serial.println("─────────────────────────────────────");
  
  // Servo motor
  servo.attach(SERVO_PIN, 500, 2400);
  servo.write(90); // Başlangıç pozisyonu
  Serial.println("✓ Servo Motor:");
  Serial.println("    D5 (GPIO14) - PWM Signal");
  
  // DC motor pinleri
  pinMode(DC_MOTOR_PIN1, OUTPUT);
  pinMode(DC_MOTOR_PIN2, OUTPUT);
  pinMode(DC_MOTOR_EN, OUTPUT);
  digitalWrite(DC_MOTOR_PIN1, LOW);
  digitalWrite(DC_MOTOR_PIN2, LOW);
  analogWrite(DC_MOTOR_EN, 0);
  Serial.println("✓ DC Motor (L298N):");
  Serial.println("    D6 (GPIO12) - IN1");
  Serial.println("    D7 (GPIO13) - IN2");
  Serial.println("    D8 (GPIO15) - ENA (PWM)");
  
  // Step motor (ULN2003 pinleri zaten Stepper.h ile kontrol ediliyor)
  stepMotor.setSpeed(stepperSpeed); // Başlangıç hızı
  Serial.println("✓ Step Motor 28BYJ-48 (ULN2003):");
  Serial.println("    D1 (GPIO5)  - IN1 (Mavi)");
  Serial.println("    D3 (GPIO0)  - IN2 (Pembe)");
  Serial.println("    D2 (GPIO4)  - IN3 (Sarı)");
  Serial.println("    D4 (GPIO2)  - IN4 (Turuncu)");
  Serial.print("    Adım/Devir: ");
  Serial.println(STEPS_PER_REV);
  
  Serial.println("─────────────────────────────────────");
  Serial.println("[MOTORS] ✓ All motor pins initialized");
}

void printMotorSettings() {
  Serial.println("\\n[MOTOR CONFIG]");
  Serial.print("  Type: ");
  Serial.println(motorType);
  
  if (motorType == "servo") {
    Serial.print("  Open angle: "); Serial.println(servoOpenAngle);
    Serial.print("  Close angle: "); Serial.println(servoCloseAngle);
  } else if (motorType == "dc") {
    Serial.print("  Speed (PWM): "); Serial.println(dcMotorSpeed);
  } else if (motorType == "step") {
    Serial.print("  Speed (RPM): "); Serial.println(stepperSpeed);
    Serial.print("  Steps per rev: "); Serial.println(STEPS_PER_REV);
  }
  Serial.println();
}

void runMotor(int durationMs, int amount) {
  if (motorType == "servo") {
    runServoMotor(durationMs);
  } else if (motorType == "dc") {
    runDCMotor(durationMs);
  } else if (motorType == "step") {
    runStepMotor(durationMs);
  } else {
    Serial.println("[MOTOR] Unknown motor type!");
  }
}

void runServoMotor(int durationMs) {
  Serial.println("[SERVO] Opening...");
  servo.write(servoOpenAngle);
  delay(durationMs);
  servo.write(servoCloseAngle);
  Serial.println("[SERVO] Closed");
}

void runDCMotor(int durationMs) {
  Serial.print("[DC MOTOR] Running at speed ");
  Serial.print(dcMotorSpeed);
  Serial.println("...");
  
  // Motor ileri dönüş
  digitalWrite(DC_MOTOR_PIN1, HIGH);
  digitalWrite(DC_MOTOR_PIN2, LOW);
  analogWrite(DC_MOTOR_EN, dcMotorSpeed);
  
  delay(durationMs);
  
  // Motor durdur
  digitalWrite(DC_MOTOR_PIN1, LOW);
  digitalWrite(DC_MOTOR_PIN2, LOW);
  analogWrite(DC_MOTOR_EN, 0);
  
  Serial.println("[DC MOTOR] Stopped");
}

void runStepMotor(int durationMs) {
  Serial.print("[STEP MOTOR] Running at ");
  Serial.print(stepperSpeed);
  Serial.println(" RPM...");
  
  stepMotor.setSpeed(stepperSpeed);
  
  // Süreye göre adım sayısını hesapla
  // RPM'den saniye başına devir: stepperSpeed / 60
  // Milisaniyede kaç adım: (stepperSpeed / 60) * (STEPS_PER_REV / 1000) * durationMs
  long steps = ((long)stepperSpeed * STEPS_PER_REV * durationMs) / 60000L;
  
  Serial.print("[STEP MOTOR] Steps to move: ");
  Serial.println(steps);
  
  stepMotor.step(steps);
  
  // Motorun güç tasarrufu için pinleri kapat
  digitalWrite(STEP_PIN1, LOW);
  digitalWrite(STEP_PIN2, LOW);
  digitalWrite(STEP_PIN3, LOW);
  digitalWrite(STEP_PIN4, LOW);
  
  Serial.println("[STEP MOTOR] Completed");
}

void testMotor() {
  Serial.println("\\n[TEST] Running 2 second motor test...");
  delay(1000);
  runMotor(2000, 50);
  delay(1000);
  Serial.println("[TEST] Test complete\\n");
}

bool getToken() {
  WiFiClient client; 
  HTTPClient http;
  String url = String(BASE_URL) + "/auth/login";
  
  if (!http.begin(client, url)) {
    Serial.println("[AUTH] Cannot connect to server");
    return false;
  }
  
  http.addHeader("Content-Type", "application/json");
  String body = String("{\\"email\\":\\"") + AUTH_EMAIL + "\\",\\"password\\":\\"" + AUTH_PASS + "\\"}";
  
  int code = http.POST(body);
  String payload = http.getString(); 
  http.end();
  
  if (code < 200 || code >= 300) { 
    Serial.printf("[AUTH] HTTP %d - %s\\n", code, payload.c_str()); 
    return false; 
  }
  
  DynamicJsonDocument doc(1024); 
  if (deserializeJson(doc, payload)) {
    Serial.println("[AUTH] Invalid JSON response");
    return false;
  }
  
  if (!doc.containsKey("token")) {
    Serial.println("[AUTH] Token not found in response");
    return false;
  }
  
  jwtAccess = (const char*)doc["token"]; 
  return true;
}

bool registerDevice() {
  WiFiClient client; 
  HTTPClient http;
  String url = String(BASE_URL) + "/devices";
  
  if (!http.begin(client, url)) {
    Serial.println("[REGISTER] Cannot connect to server");
    return false;
  }
  
  http.addHeader("Authorization", String("Bearer ") + jwtAccess);
  http.addHeader("Content-Type", "application/json");
  
  String deviceName = "WeMos-" + deviceSerial.substring(6);
  String body = "{\\"name\\":\\"" + deviceName + "\\",\\"serial\\":\\"" + deviceSerial + "\\",\\"esp_host\\":\\"192.168.1.100\\",\\"esp_port\\":80}";
  
  int code = http.POST(body);
  String payload = http.getString();
  http.end();
  
  if (code >= 200 && code < 300) {
    Serial.print("[REGISTER] Device name: ");
    Serial.println(deviceName);
    return true;
  }
  
  Serial.printf("[REGISTER] HTTP %d - %s\\n", code, payload.c_str());
  return false;
}

bool fetchProvision() {
  WiFiClient client; 
  HTTPClient http;
  String url = String(BASE_URL) + "/devices/" + deviceSerial + "/provision";
  
  if (!http.begin(client, url)) return false;
  
  if (jwtAccess.length() > 0) {
    http.addHeader("Authorization", String("Bearer ") + jwtAccess);
  }
  http.addHeader("X-Device-Mac", deviceMac);
  http.addHeader("X-Device-Serial", deviceSerial);
  
  int code = http.GET(); 
  
  if (code < 200 || code >= 300) { 
    Serial.printf("[PROVISION] HTTP %d\\n", code); 
    http.end(); 
    return false; 
  }
  
  String payload = http.getString(); 
  http.end();
  
  DynamicJsonDocument doc(6144); 
  if (deserializeJson(doc, payload)) {
    Serial.println("[PROVISION] Invalid JSON");
    return false;
  }
  
  // Ayarları yükle
  if (doc.containsKey("settings")) {
    JsonObject s = doc["settings"];
    
    // Motor tipi: "servo", "dc", "step"
    const char* mt = s["motor_type"] | "servo";
    motorType = String(mt);
    
    // Servo ayarları
    servoOpenAngle = s["servo_open_angle"] | 0;
    servoCloseAngle = s["servo_close_angle"] | 90;
    
    // DC motor ayarları
    dcMotorSpeed = s["dc_motor_speed"] | 200;
    
    // Step motor ayarları
    stepperSpeed = s["stepper_speed"] | 10;
  }
  
  // İlk takvimi yükle
  if (doc.containsKey("schedules")) {
    JsonArray arr = doc["schedules"]; 
    itemCount = 0;
    for (JsonObject it : arr) {
      if (itemCount >= 8) break;
      strlcpy(items[itemCount].time, it["time"] | "00:00", sizeof(items[itemCount].time));
      items[itemCount].amount  = it["amount"] | 100;
      items[itemCount].duration_ms = it["duration_ms"] | 0;
      items[itemCount].enabled = (it["enabled"] | 1) == 1;
      itemCount++;
    }
  }
  
  return true;
}

bool fetchSchedulesIfChanged() {
  WiFiClient client; 
  HTTPClient http;
  String url = String(BASE_URL) + "/devices/" + deviceSerial + "/schedules";
  
  if (!http.begin(client, url)) return false;
  
  if (jwtAccess.length() > 0) {
    http.addHeader("Authorization", String("Bearer ") + jwtAccess);
  }
  if (schedulesEtag.length() > 0) {
    http.addHeader("If-None-Match", schedulesEtag);
  }
  http.addHeader("X-Device-Mac", deviceMac);
  http.addHeader("X-Device-Serial", deviceSerial);
  
  int code = http.GET();
  
  if (code == 304) { 
    Serial.println("[SCHEDULES] 304 Not Modified - No changes");
    http.end(); 
    return true; 
  }
  
  if (code < 200 || code >= 300) { 
    Serial.printf("[SCHEDULES] HTTP %d\\n", code); 
    http.end(); 
    return false; 
  }
  
  String payload = http.getString(); 
  String newEtag = http.header("ETag"); 
  http.end();
  
  if (newEtag.length() > 0) {
    schedulesEtag = newEtag;
    Serial.print("[SCHEDULES] New ETag: ");
    Serial.println(newEtag);
  }
  
  DynamicJsonDocument doc(4096); 
  if (deserializeJson(doc, payload)) {
    Serial.println("[SCHEDULES] Invalid JSON");
    return false;
  }
  
  if (!doc.containsKey("items")) return true;
  
  JsonArray arr = doc["items"]; 
  itemCount = 0;
  
  Serial.println("[SCHEDULES] Loading new schedule:");
  for (JsonObject it : arr) {
    if (itemCount >= 8) break;
    strlcpy(items[itemCount].time, it["time"] | "00:00", sizeof(items[itemCount].time));
    items[itemCount].amount  = it["amount"] | 100;
    items[itemCount].duration_ms = it["duration_ms"] | 0;
    items[itemCount].enabled = (it["enabled"] | 1) == 1;
    
    Serial.printf("  [%d] %s - %dg (%dms) %s\\n", 
      itemCount + 1,
      items[itemCount].time, 
      items[itemCount].amount,
      items[itemCount].duration_ms,
      items[itemCount].enabled ? "ENABLED" : "DISABLED"
    );
    
    itemCount++;
  }
  
  Serial.print("[SCHEDULES] Total items: ");
  Serial.println(itemCount);
  
  return true;
}

String getNowHHMM() {
  timeClient.update();
  unsigned long epoch = timeClient.getEpochTime();
  int hours = (epoch % 86400L) / 3600;
  int minutes = (epoch % 3600) / 60;
  char buf[6];
  snprintf(buf, sizeof(buf), "%02d:%02d", hours, minutes);
  return String(buf);
}

int mapAmountToMs(int amount) {
  // Gram -> milisaniye dönüşümü (kalibrasyon gerekebilir)
  int ms = amount * 40;
  if (ms < 200) ms = 200;
  if (ms > 15000) ms = 15000;
  return ms;
}

void onSyncCommand() {
  Serial.println("[SYNC] Manual sync triggered");
  fetchSchedulesIfChanged();
}
`}
                    </pre>
                    </div>
                  )}

                  {/* Raspberry Pi Code */}
                  {deviceCodeTab === 'raspberry' && (
                    <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-4">
                      <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                        <Code className="w-4 h-4" />
                        Raspberry Pi Zero W - Python Pet Feeder
                      </h4>
                      <p className="text-slate-300 text-sm mb-3">
                        Python 3 ile yazılmış Raspberry Pi kodu. GPIO kontrol, JWT authentication, ETag ile takvim senkronizasyonu, servo/DC/step motor desteği içerir.
                      </p>
                      <div className="flex justify-end mb-2">
                        <button
                          onClick={() => {
                            const codeEl = document.getElementById('raspberry-code') as HTMLPreElement | null;
                            if (codeEl) navigator.clipboard.writeText(codeEl.innerText);
                          }}
                          className="px-3 py-1 rounded text-sm bg-slate-600 hover:bg-slate-500 text-white"
                        >Kopyala</button>
                      </div>
                    <pre id="raspberry-code" className="whitespace-pre-wrap text-xs bg-slate-900 text-green-200 p-3 rounded border border-slate-700 overflow-auto max-h-[560px]">
{`#!/usr/bin/env python3
"""
============================================================================
 Raspberry Pi Zero W Pet Feeder - Multi Motor Controller
============================================================================

MOTOR BAĞLANTI ŞEMALARI:

┌─────────────────────────────────────────────────────────────────────────┐
│ 1. SERVO MOTOR (MG996R / SG90)                                          │
├─────────────────────────────────────────────────────────────────────────┤
│   Servo Pin        Raspberry Pi      Açıklama                           │
│   ─────────────────────────────────────────────────────────────────     │
│   Signal (Sarı)    GPIO 18 (Pin 12)  PWM kontrol sinyali                │
│   VCC (Kırmızı)    5V (Pin 2)        Güç kaynağı                        │
│   GND (Kahve)      GND (Pin 6)       Toprak                             │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ 2. DC MOTOR (L298N Sürücü ile)                                          │
├─────────────────────────────────────────────────────────────────────────┤
│   L298N Pin        Raspberry Pi      Açıklama                           │
│   ─────────────────────────────────────────────────────────────────     │
│   IN1              GPIO 23 (Pin 16)  Yön kontrolü 1                     │
│   IN2              GPIO 24 (Pin 18)  Yön kontrolü 2                     │
│   ENA              GPIO 25 (Pin 22)  Hız kontrolü (PWM 0-100)           │
│   OUT1/OUT2        Motor             Motor kablolarına bağlanır         │
│   12V              Ext. Power        Harici 12V güç kaynağı             │
│   GND              Pi GND            Ortak toprak (ÖNEMLİ!)             │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ 3. 28BYJ-48 STEP MOTOR (ULN2003 Sürücü ile)                             │
├─────────────────────────────────────────────────────────────────────────┤
│   ULN2003 Pin      Raspberry Pi      Motor Kablo Rengi                  │
│   ─────────────────────────────────────────────────────────────────     │
│   IN1              GPIO 17 (Pin 11)  Mavi kablo                         │
│   IN2              GPIO 27 (Pin 13)  Pembe kablo                        │
│   IN3              GPIO 22 (Pin 15)  Sarı kablo                         │
│   IN4              GPIO 10 (Pin 19)  Turuncu kablo                      │
│   VCC (+)          5V (Pin 4)        Güç kaynağı                        │
│   GND (-)          GND (Pin 9)       Kırmızı kablo (motor 5. pin)       │
│                                                                          │
│   ⚠️  ADIM SAYISI: 2048 step/devir (dahili 64:1 redüktör)             │
│   ⚠️  ÖNERİLEN HIZ: 8-12 RPM (daha hızlı motor zorlanır)               │
└─────────────────────────────────────────────────────────────────────────┘

GÜÇ KAYNAĞI ÖNERİLERİ:
- Servo: 5V 2A (yüksek torklu servolarda harici güç şart)
- DC Motor: 12V 2A harici adaptör (L298N için)
- Step Motor: 5V 1A (Pi'den beslenebilir, ama harici daha stabil)
- Tüm GND'ler ortak olmalı!

KURULUM:
sudo apt-get update
sudo apt-get install python3-pip python3-rpi.gpio
pip3 install requests gpiozero

============================================================================
"""

import time
import json
import hashlib
import requests
from datetime import datetime
from gpiozero import Servo, Motor, OutputDevice
from gpiozero.pins.pigpio import PiGPIOFactory

# ==== CONFIG ==== #
BASE_URL = "${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080'}"
AUTH_EMAIL = "demo@example.com"
AUTH_PASS = "demo123"

# GPIO Pin tanımlamaları
SERVO_PIN = 18          # GPIO 18 (Pin 12)
DC_MOTOR_PIN1 = 23      # GPIO 23 (Pin 16)
DC_MOTOR_PIN2 = 24      # GPIO 24 (Pin 18)
DC_MOTOR_EN = 25        # GPIO 25 (Pin 22)
STEP_PINS = [17, 27, 22, 10]  # GPIO 17, 27, 22, 10

# Motor nesneleri
factory = PiGPIOFactory()
servo = Servo(SERVO_PIN, pin_factory=factory)
dc_motor = Motor(forward=DC_MOTOR_PIN1, backward=DC_MOTOR_PIN2, enable=DC_MOTOR_EN, pin_factory=factory)

# Step motor kontrol
step_sequence = [
    [1, 0, 0, 1],
    [1, 0, 0, 0],
    [1, 1, 0, 0],
    [0, 1, 0, 0],
    [0, 1, 1, 0],
    [0, 0, 1, 0],
    [0, 0, 1, 1],
    [0, 0, 0, 1]
]
step_pins_obj = [OutputDevice(pin, pin_factory=factory) for pin in STEP_PINS]

# Global değişkenler
jwt_token = None
schedules_etag = None
device_mac = None
device_serial = None
motor_type = "servo"
stepper_speed = 10
dc_motor_speed = 0.8
servo_open_angle = 0
servo_close_angle = 90
schedules = []
last_run_minute = None


def get_mac_address():
    """MAC adresini al"""
    import uuid
    mac = ':'.join(['{:02x}'.format((uuid.getnode() >> elements) & 0xff)
                    for elements in range(0, 2*6, 2)][::-1])
    return mac.upper()


def normalize_serial(mac):
    """MAC adresini normalize et (: kaldır, büyük harf)"""
    return mac.replace(":", "").upper()


def get_token():
    """JWT token al"""
    global jwt_token
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": AUTH_EMAIL, "password": AUTH_PASS},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            jwt_token = data.get("token")
            print(f"[AUTH] ✓ Token alındı")
            return True
        else:
            print(f"[AUTH] ✗ HTTP {response.status_code}")
            return False
    except Exception as e:
        print(f"[AUTH] ✗ Hata: {e}")
        return False


def register_device():
    """Cihazı sunucuya kaydet"""
    try:
        device_name = f"RaspberryPi-{device_serial[-6:]}"
        response = requests.post(
            f"{BASE_URL}/devices",
            headers={"Authorization": f"Bearer {jwt_token}"},
            json={
                "name": device_name,
                "serial": device_serial,
                "esp_host": "192.168.1.100",
                "esp_port": 80
            },
            timeout=10
        )
        if response.status_code in [200, 201]:
            print(f"[REGISTER] ✓ Cihaz kaydedildi: {device_name}")
            return True
        else:
            print(f"[REGISTER] ! HTTP {response.status_code} (cihaz zaten kayıtlı olabilir)")
            return False
    except Exception as e:
        print(f"[REGISTER] ✗ Hata: {e}")
        return False


def fetch_provision():
    """Provision - Ayarları ve takvimi al"""
    global motor_type, stepper_speed, dc_motor_speed, servo_open_angle, servo_close_angle, schedules
    
    try:
        response = requests.get(
            f"{BASE_URL}/devices/{device_serial}/provision",
            headers={
                "Authorization": f"Bearer {jwt_token}",
                "X-Device-Mac": device_mac,
                "X-Device-Serial": device_serial
            },
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Ayarları yükle
            if "settings" in data:
                settings = data["settings"]
                motor_type = settings.get("motor_type", "servo")
                stepper_speed = settings.get("stepper_speed", 10)
                dc_motor_speed = settings.get("dc_motor_speed", 200) / 255.0
                servo_open_angle = settings.get("servo_open_angle", 0)
                servo_close_angle = settings.get("servo_close_angle", 90)
            
            # İlk takvimi yükle
            if "schedules" in data and len(data["schedules"]) > 0:
                schedule_data = data["schedules"][0]
                if "items" in schedule_data:
                    schedules = schedule_data["items"]
                    print(f"[PROVISION] ✓ {len(schedules)} takvim öğesi yüklendi")
            
            print(f"[PROVISION] ✓ Ayarlar yüklendi (motor: {motor_type})")
            return True
        else:
            print(f"[PROVISION] ✗ HTTP {response.status_code}")
            return False
    except Exception as e:
        print(f"[PROVISION] ✗ Hata: {e}")
        return False


def fetch_schedules_if_changed():
    """Takvimi ETag ile kontrol et ve güncelle"""
    global schedules_etag, schedules
    
    try:
        headers = {
            "Authorization": f"Bearer {jwt_token}",
            "X-Device-Mac": device_mac,
            "X-Device-Serial": device_serial
        }
        if schedules_etag:
            headers["If-None-Match"] = schedules_etag
        
        response = requests.get(
            f"{BASE_URL}/devices/{device_serial}/schedules",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 304:
            print("[SCHEDULES] 304 Not Modified - Değişiklik yok")
            return True
        elif response.status_code == 200:
            data = response.json()
            new_etag = response.headers.get("ETag")
            
            if new_etag:
                schedules_etag = new_etag
                print(f"[SCHEDULES] Yeni ETag: {new_etag}")
            
            if len(data) > 0 and "items" in data[0]:
                schedules = data[0]["items"]
                print(f"[SCHEDULES] ✓ {len(schedules)} takvim öğesi güncellendi")
                for idx, item in enumerate(schedules, 1):
                    status = "ENABLED" if item.get("enabled") else "DISABLED"
                    print(f"  [{idx}] {item.get('time')} - {item.get('amount')}g ({item.get('duration_ms')}ms) {status}")
            
            return True
        else:
            print(f"[SCHEDULES] ✗ HTTP {response.status_code}")
            return False
    except Exception as e:
        print(f"[SCHEDULES] ✗ Hata: {e}")
        return False


def run_servo_motor(duration_ms):
    """Servo motor kontrolü"""
    print(f"[SERVO] Açılıyor... ({servo_open_angle}°)")
    servo.value = (servo_open_angle - 90) / 90.0
    time.sleep(duration_ms / 1000.0)
    servo.value = (servo_close_angle - 90) / 90.0
    print(f"[SERVO] Kapatıldı ({servo_close_angle}°)")


def run_dc_motor(duration_ms):
    """DC motor kontrolü"""
    print(f"[DC MOTOR] Çalışıyor (hız: {dc_motor_speed:.2f})...")
    dc_motor.forward(speed=dc_motor_speed)
    time.sleep(duration_ms / 1000.0)
    dc_motor.stop()
    print("[DC MOTOR] Durduruldu")


def run_step_motor(duration_ms):
    """Step motor kontrolü"""
    print(f"[STEP MOTOR] Çalışıyor ({stepper_speed} RPM)...")
    
    # Süreye göre adım sayısını hesapla
    steps = int((stepper_speed * 2048 * duration_ms) / 60000)
    step_delay = 60.0 / (stepper_speed * 2048 * 8)  # 8 adımlı sekans
    
    print(f"[STEP MOTOR] {steps} adım atılacak")
    
    for _ in range(steps):
        for step in step_sequence:
            for pin_idx, pin_obj in enumerate(step_pins_obj):
                if step[pin_idx]:
                    pin_obj.on()
                else:
                    pin_obj.off()
            time.sleep(step_delay)
    
    # Motorun güç tasarrufu için pinleri kapat
    for pin_obj in step_pins_obj:
        pin_obj.off()
    
    print("[STEP MOTOR] Tamamlandı")


def run_motor(duration_ms, amount):
    """Motor tipine göre uygun fonksiyonu çağır"""
    if motor_type == "servo":
        run_servo_motor(duration_ms)
    elif motor_type == "dc":
        run_dc_motor(duration_ms)
    elif motor_type == "step":
        run_step_motor(duration_ms)
    else:
        print(f"[MOTOR] Bilinmeyen motor tipi: {motor_type}")


def map_amount_to_ms(amount):
    """Gram -> milisaniye dönüşümü"""
    ms = amount * 40
    return max(200, min(ms, 15000))


def check_schedules():
    """Takvimi kontrol et ve gerekirse besleme yap"""
    global last_run_minute
    
    now = datetime.now()
    current_time = now.strftime("%H:%M")
    current_minute = now.hour * 60 + now.minute
    
    if current_minute != last_run_minute:
        for item in schedules:
            if not item.get("enabled"):
                continue
            
            if item.get("time") == current_time:
                amount = item.get("amount", 100)
                duration_ms = item.get("duration_ms") or map_amount_to_ms(amount)
                
                print("\\n*** SCHEDULE TRIGGERED ***")
                print(f"Time: {current_time}")
                print(f"Amount: {amount}g")
                print(f"Duration: {duration_ms}ms")
                print(f"Motor Type: {motor_type}")
                
                run_motor(duration_ms, amount)
                
                last_run_minute = current_minute
                print("*** FEEDING COMPLETE ***\\n")
                break


def main():
    """Ana program"""
    global device_mac, device_serial
    
    print("\\n" + "="*50)
    print("   Raspberry Pi Pet Feeder - Multi Motor")
    print("="*50 + "\\n")
    
    # MAC adresini al
    device_mac = get_mac_address()
    device_serial = normalize_serial(device_mac)
    
    print("="*50)
    print("   DEVICE INFORMATION")
    print("="*50)
    print(f"MAC Address: {device_mac}")
    print(f"Serial (for server): {device_serial}")
    print("="*50 + "\\n")
    
    # Token al
    print("[AUTH] Getting authentication token...")
    if not get_token():
        print("[AUTH] FAILED! Exiting...")
        return
    
    # Cihazı kaydet
    print("\\n[REGISTER] Registering device with server...")
    register_device()
    
    # Provision - Ayarları al
    print("\\n[PROVISION] Fetching device settings and schedules...")
    if fetch_provision():
        print("[PROVISION] ✓ Settings loaded")
    
    # İlk takvim güncellemesi
    print("\\n[SCHEDULES] Fetching initial schedules...")
    fetch_schedules_if_changed()
    
    print("\\n" + "="*50)
    print("   SETUP COMPLETE - Running...")
    print("="*50 + "\\n")
    
    # Ana döngü
    last_schedule_check = 0
    
    try:
        while True:
            current_time = time.time()
            
            # Her 4 dakikada bir takvimi kontrol et
            if current_time - last_schedule_check > 240:
                print("\\n[SCHEDULES] Periodic check...")
                fetch_schedules_if_changed()
                last_schedule_check = current_time
            
            # Her dakika takvimi kontrol et
            check_schedules()
            
            time.sleep(30)  # 30 saniyede bir döngü
            
    except KeyboardInterrupt:
        print("\\n\\n[EXIT] Program sonlandırılıyor...")
        servo.close()
        dc_motor.close()
        for pin_obj in step_pins_obj:
            pin_obj.close()
        print("[EXIT] GPIO temizlendi. Güle güle!")


if __name__ == "__main__":
    main()
`}
                    </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Pins */}
              {(activeSubTab === 'pins' || activeTab === 'pin-map') && (
                <div className="space-y-6">
                  <div className="bg-gradient-to-br from-slate-800/80 to-slate-700/80 backdrop-blur-sm rounded-xl p-6 border border-slate-600">
                    <h3 className="text-white text-xl font-semibold mb-4 flex items-center gap-2">
                      <Network className="w-5 h-5 text-blue-400" />
                      WeMos D1 (ESP8266) Pin Haritası
                    </h3>

                    <div className="flex items-center justify-between mb-4">
                      <p className="text-slate-300 text-sm">
                        Bu tablo, sistemde kullanılan sensör, motor ve diğer çevre birimlerinin bağlantı pinlerini gösterir.
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPinsEditMode(v => !v)}
                          className={`px-3 py-1 rounded text-sm ${pinsEditMode ? 'bg-amber-600 hover:bg-amber-500' : 'bg-slate-600 hover:bg-slate-500'} text-white`}
                        >{pinsEditMode ? 'Düzenlemeyi Kapat' : 'Düzenle'}</button>
                        <button
                          onClick={handleSeedPins}
                          className="px-3 py-1 rounded text-sm bg-purple-700 hover:bg-purple-600 text-white"
                          disabled={!selectedDeviceId}
                        >Örnekleri Yükle</button>
                        <button
                          onClick={async () => {
                            if (!selectedDeviceId) return;
                            try {
                              const res = await fetch(`/devices/${selectedDeviceId}/pins`, {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                  'Authorization': `Bearer ${token}`
                                },
                                body: JSON.stringify({ modules })
                              });
                              if (!res.ok) {
                                const t = await res.text().catch(() => '');
                                alert(`Kaydetme hatası (HTTP ${res.status})\n${t}`);
                                return;
                              }
                              const list = await (await fetch(`/devices/${selectedDeviceId}/pins`)).json();
                              setModules(list || []);
                              setPinsEditMode(false);
                              alert('Pin haritası kaydedildi');
                            } catch (e) {
                              alert('Kayıt sırasında hata oluştu');
                            }
                          }}
                          className="px-3 py-1 rounded text-sm bg-green-700 hover:bg-green-600 text-white"
                          disabled={!selectedDeviceId}
                        >Kaydet</button>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full border border-slate-600 rounded-lg overflow-hidden">
                        <thead className="bg-slate-700/70 text-slate-300 text-sm uppercase">
                          <tr>
                            <th className="px-4 py-3 text-left">Cihaz / Modül</th>
                            <th className="px-4 py-3 text-left">Kullanım Amacı</th>
                            <th className="px-4 py-3 text-left">WeMos D1 Pin</th>
                            <th className="px-4 py-3 text-left">Güç Bağlantısı</th>
                            <th className="px-4 py-3 text-left">Açıklama</th>
                            <th className="px-4 py-3 text-left">İşlem</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700 text-white">
                          {(modules || []).map((m: any, idx: number) => {
                            const pinsText = Array.isArray(m.pins) && m.pins.length > 0
                              ? m.pins.map((p: any) => `${p.wemos_pin}${p.gpio_number ? ` (GPIO${p.gpio_number})` : ''}`).join(', ')
                              : '—';
                            const isEditing = rowEditIndex === idx;
                            return (
                              <tr key={m.id ?? idx} className={`hover:bg-slate-700/40 align-top ${(((formData as any).motorType || 'DC Motor') === 'Step Motor' && ((m.module_type||'').toLowerCase()==='step_motor' || (m.module_name||'').toLowerCase().includes('step'))) ? 'ring-2 ring-purple-500' : ''}`}>
                                <td className="px-4 py-3">
                                  {isEditing ? (
                                    <input value={rowDraft?.module_name || ''} onChange={(e) => setRowDraft({ ...(rowDraft||{}), module_name: e.target.value })} className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm" placeholder="Modül adı" />
                                  ) : (
                                    <span className="flex items-center gap-2">
                                      <span>{moduleEmoji(m.module_type || m.module_name)}</span>
                                      <span>{m.module_name || '-'}</span>
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {isEditing ? (
                                    <input value={rowDraft?.usage_purpose || ''} onChange={(e) => setRowDraft({ ...(rowDraft||{}), usage_purpose: e.target.value })} className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm" placeholder="Kullanım amacı" />
                                  ) : (m.usage_purpose || '—')}
                                </td>
                                <td className="px-4 py-3 font-mono">
                                  {isEditing ? (
                                    <div className="space-y-2">
                                      {(rowDraft?.pins || []).map((p: any, pIdx: number) => (
                                        <div key={pIdx} className="flex items-center gap-2">
                                          <input value={p.wemos_pin || ''} onChange={(e) => { const pins = [...(rowDraft?.pins||[])]; pins[pIdx] = { ...pins[pIdx], wemos_pin: e.target.value }; setRowDraft({ ...(rowDraft||{}), pins }); }} placeholder="D4" className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm" />
                                          <input type="number" value={p.gpio_number ?? ''} onChange={(e) => { const val = e.target.value === '' ? null : Number(e.target.value); const pins = [...(rowDraft?.pins||[])]; pins[pIdx] = { ...pins[pIdx], gpio_number: val }; setRowDraft({ ...(rowDraft||{}), pins }); }} placeholder="GPIO" className="w-24 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm" />
                                          <input value={p.power_connection || ''} onChange={(e) => { const pins = [...(rowDraft?.pins||[])]; pins[pIdx] = { ...pins[pIdx], power_connection: e.target.value }; setRowDraft({ ...(rowDraft||{}), pins }); }} placeholder="Güç" className="w-24 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm" />
                                          <input value={p.notes || ''} onChange={(e) => { const pins = [...(rowDraft?.pins||[])]; pins[pIdx] = { ...pins[pIdx], notes: e.target.value }; setRowDraft({ ...(rowDraft||{}), pins }); }} placeholder="Not" className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm" />
                                          <button onClick={() => { const pins = [...(rowDraft?.pins||[])]; pins.splice(pIdx,1); setRowDraft({ ...(rowDraft||{}), pins }); }} className="px-2 py-1 rounded bg-red-700 text-white text-xs hover:bg-red-600">Sil</button>
                                        </div>
                                      ))}
                                      <button onClick={() => { const pins = [...(rowDraft?.pins||[])]; pins.push({ wemos_pin: '', gpio_number: null, power_connection: '', notes: '' }); setRowDraft({ ...(rowDraft||{}), pins }); }} className="px-2 py-1 rounded bg-slate-600 text-white text-xs hover:bg-slate-500">+ Pin Ekle</button>
                                    </div>
                                  ) : pinsText}
                                </td>
                                <td className="px-4 py-3">
                                  {isEditing ? (
                                    <input value={rowDraft?.power_connection || ''} onChange={(e) => setRowDraft({ ...(rowDraft||{}), power_connection: e.target.value })} className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm" placeholder="Güç bağlantısı" />
                                  ) : (m.power_connection || '—')}
                                </td>
                                <td className="px-4 py-3 text-slate-300">
                                  {isEditing ? (
                                    <input value={rowDraft?.description || ''} onChange={(e) => setRowDraft({ ...(rowDraft||{}), description: e.target.value })} className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm" placeholder="Açıklama" />
                                  ) : (m.description || '—')}
                                </td>
                                <td className="px-4 py-3">
                                  {isEditing ? (
                                    <div className="flex gap-2">
                                      <button onClick={saveRowEdit} className="px-2 py-1 rounded bg-green-700 text-white text-xs hover:bg-green-600">Kaydet</button>
                                      <button onClick={cancelRowEdit} className="px-2 py-1 rounded bg-slate-600 text-white text-xs hover:bg-slate-500">İptal</button>
                                    </div>
                                  ) : (
                                    <button onClick={() => beginRowEdit(idx)} className="px-2 py-1 rounded bg-amber-600 text-white text-xs hover:bg-amber-500">Düzenle</button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                          {pinsEditMode && (
                            <tr className="hover:bg-slate-700/40 bg-slate-800/50">
                              <td className="px-4 py-3 text-slate-300">📍 Yeni Modül</td>
                              <td className="px-4 py-3 text-slate-400 italic">—</td>
                              <td className="px-4 py-3 text-slate-400 italic">—</td>
                              <td className="px-4 py-3 text-slate-400 italic">—</td>
                              <td className="px-4 py-3 text-slate-400 italic">Buraya yeni modül eklenebilir</td>
                              <td className="px-4 py-3">
                                <button onClick={() => { setModules([...(modules||[]), { module_name: '', module_type: '', usage_purpose: '', description: '', enabled: 1, pins: [] }]); }} className="px-3 py-1 rounded bg-blue-700 text-white text-sm hover:bg-blue-600">+ Ekle</button>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-4 mt-6">
                      <h4 className="text-blue-300 font-semibold mb-2">⚙️ Teknik Notlar</h4>
                      <ul className="text-sm text-slate-300 space-y-1 list-disc list-inside">
                        <li>Tüm sensörlerin GND hattı ortak olmalıdır.</li>
                        <li>Servo ve motorlar için harici güç kaynağı kullanın (5V/2A önerilir).</li>
                        <li>3.3V pininden en fazla 500mA çekin.</li>
                        <li>D0 (GPIO16) interrupt desteği yoktur, uyku modunda özel fonksiyona sahiptir.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Device Management */}
              {(activeSubTab === 'devices' || activeTab === 'device-management') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-slate-700/30 rounded-lg border border-slate-600 p-4">
                    <h4 className="text-white font-semibold mb-4">Yeni Cihaz Ekle</h4>
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <label className="block text-slate-300 text-sm mb-1">Ad</label>
                        <input value={newDevice.name} onChange={(e) => setNewDevice({ ...newDevice, name: e.target.value })} className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" placeholder="Feeder-Mutfak" />
                      </div>
                      <div>
                        <label className="block text-slate-300 text-sm mb-1">Seri No / Mac (Zorunlu)</label>
                        <input value={newDevice.serial} onChange={(e) => setNewDevice({ ...newDevice, serial: e.target.value })} className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" placeholder="AA11BB22CC33" />
                      </div>
                      <div>
                        <label className="block text-slate-300 text-sm mb-1">ESP Host</label>
                        <input value={newDevice.esp_host} onChange={(e) => setNewDevice({ ...newDevice, esp_host: e.target.value })} className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" placeholder="192.168.1.60" />
                      </div>
                      <div>
                        <label className="block text-slate-300 text-sm mb-1">ESP Port</label>
                        <input type="number" value={newDevice.esp_port} onChange={(e) => setNewDevice({ ...newDevice, esp_port: Number(e.target.value) })} className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white" />
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2 mt-4">
                      <button
                        onClick={async () => {
                          // Validate required fields
                          if (!newDevice.name || !newDevice.serial || !newDevice.esp_host) {
                            return alert('Ad, Seri No/MAC ve ESP Host zorunludur');
                          }
                          // Normalize serial: remove ':' and uppercase
                          const normalizedSerial = String(newDevice.serial).replace(/:/g, '').toUpperCase();
                          if (!/^[A-F0-9]{12}$/.test(normalizedSerial)) {
                            return alert('Seri No/MAC formatı geçersiz. Örn: AA11BB22CC33 veya AA:11:BB:22:CC:33');
                          }
                          try {
                            const payload = { ...newDevice, serial: normalizedSerial } as any;
                            const res = await fetch('/devices', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                              body: JSON.stringify(payload)
                            });
                            if (res.ok) {
                              const { id } = await res.json();
                              await fetch(`/devices/${id}/pins/seed`, { method: 'POST' });
                              const list = await (await fetch('/devices', { headers: { 'Authorization': `Bearer ${token}` } })).json();
                              setDevices(list);
                              setSelectedDeviceId(String(id));
                              setNewDevice({ name: '', serial: '', esp_host: '', esp_port: 80 });
                            } else {
                              const err = await res.json().catch(() => ({}));
                              alert(err.error || 'Cihaz eklenemedi');
                            }
                          } catch (e) {
                            alert('Cihaz eklenemedi');
                          }
                        }}
                        disabled={!newDevice.name || !newDevice.serial || !newDevice.esp_host}
                        className={`px-4 py-2 rounded-lg text-white ${(!newDevice.name || !newDevice.serial || !newDevice.esp_host) ? 'bg-slate-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                      >Ekle (Yeni Kayıt)</button>

                      <button
                        onClick={async () => {
                          // Validate required fields (MAC upsert için de aynı zorunluluklar)
                          if (!newDevice.name || !newDevice.serial || !newDevice.esp_host) {
                            return alert('Ad, Seri No/MAC ve ESP Host zorunludur');
                          }
                          const normalizedSerial = String(newDevice.serial).replace(/:/g, '').toUpperCase();
                          if (!/^[A-F0-9]{12}$/.test(normalizedSerial)) {
                            return alert('Seri No/MAC formatı geçersiz. Örn: AA11BB22CC33 veya AA:11:BB:22:CC:33');
                          }
                          try {
                            const res = await fetch('/devices/upsert-by-mac', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                              body: JSON.stringify({
                                serial: normalizedSerial,
                                name: newDevice.name,
                                esp_host: newDevice.esp_host,
                                esp_port: newDevice.esp_port
                              })
                            });
                            if (res.ok) {
                              const body = await res.json().catch(() => ({} as any));
                              const deviceId = body.id;
                              const list = await (await fetch('/devices', { headers: { 'Authorization': `Bearer ${token}` } })).json();
                              setDevices(list);
                              if (deviceId) {
                                setSelectedDeviceId(String(deviceId));
                              }
                              alert(body.created ? 'Cihaz MAC ile oluşturuldu' : 'Cihaz MAC ile güncellendi');
                            } else {
                              const err = await res.json().catch(() => ({}));
                              alert(err.error || 'MAC ile kayıt/güncelleme başarısız');
                            }
                          } catch (e) {
                            alert('MAC ile kayıt/güncelleme sırasında hata oluştu');
                          }
                        }}
                        disabled={!newDevice.name || !newDevice.serial || !newDevice.esp_host}
                        className={`px-4 py-2 rounded-lg text-white ${(!newDevice.name || !newDevice.serial || !newDevice.esp_host) ? 'bg-slate-600 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                      >MAC ile Kaydet/Güncelle</button>
                    </div>
                  </div>
                  <div className="bg-slate-700/30 rounded-lg border border-slate-600 p-4">
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <h4 className="text-white font-semibold">Mevcut Cihazlar</h4>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-slate-300 text-sm">
                          <input type="checkbox" checked={showAllDevices} onChange={(e) => setShowAllDevices(e.target.checked)} />
                          Pasifleri Göster
                        </label>
                        <input value={deviceQuery} onChange={(e) => { setDeviceQuery(e.target.value); setPage(1); }} placeholder="Ara: ad veya IP" className="w-48 bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm placeholder-slate-400" />
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="text-left text-slate-300">
                            <th className="py-2 pr-4">ID</th>
                            <th className="py-2 pr-4">Ad</th>
                            <th className="py-2 pr-4">Serial/MAC</th>
                            <th className="py-2 pr-4">ESP</th>
                            <th className="py-2 pr-4">İşlem</th>
                          </tr>
                        </thead>
                        <tbody className="text-slate-200">
                          {(() => {
                            const q = deviceQuery.trim().toLowerCase();
                            const filtered = devices.filter((d: any) => 
                              !q || 
                              String(d.name||'').toLowerCase().includes(q) || 
                              String(d.esp_host||'').toLowerCase().includes(q)
                            );
                            const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
                            const safePage = Math.min(page, totalPages);
                            const start = (safePage - 1) * pageSize;
                            return filtered.slice(start, start + pageSize);
                          })().map((d: any) => (
                            <tr key={d.id} className={`border-t border-slate-600/50 ${selectedDeviceId === String(d.id) ? 'bg-green-900/20' : ''}`}>
                              <td className="py-2 pr-4">{d.id}</td>
                              <td className="py-2 pr-4">
                                {editingDevice?.id === d.id ? (
                                  <input 
                                    value={editingDevice.name || ''} 
                                    onChange={(e) => setEditingDevice({ ...editingDevice, name: e.target.value })} 
                                    className="w-full min-w-[100px] bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm" 
                                    placeholder="Cihaz adı"
                                  />
                                ) : d.name}
                              </td>
                              <td className="py-2 pr-4">
                                {editingDevice?.id === d.id ? (
                                  <input 
                                    value={editingDevice.serial || ''} 
                                    onChange={(e) => setEditingDevice({ ...editingDevice, serial: e.target.value })} 
                                    className="w-40 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm font-mono" 
                                    placeholder="MAC/Serial"
                                    title="MAC adresi veya Serial numarası"
                                  />
                                ) : (
                                  <span className="font-mono text-xs text-slate-300" title={d.serial}>
                                    {d.serial ? (d.serial.length > 17 ? d.serial.substring(0, 17) + '...' : d.serial) : '-'}
                                  </span>
                                )}
                              </td>
                              <td className="py-2 pr-4">
                                {editingDevice?.id === d.id ? (
                                  <div className="flex gap-1">
                                    <input 
                                      value={editingDevice.esp_host || ''} 
                                      onChange={(e) => setEditingDevice({ ...editingDevice, esp_host: e.target.value })} 
                                      className="w-32 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm" 
                                      placeholder="IP adresi"
                                    />
                                    <input 
                                      type="number" 
                                      value={editingDevice.esp_port || 80} 
                                      onChange={(e) => setEditingDevice({ ...editingDevice, esp_port: Number(e.target.value) })} 
                                      className="w-16 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm" 
                                      placeholder="Port"
                                    />
                                  </div>
                                ) : `${d.esp_host}:${d.esp_port}`}
                              </td>
                              <td className="py-2 pr-4">
                                {editingDevice?.id === d.id ? (
                                  <div className="flex gap-1">
                                    <button 
                                      onClick={async () => {
                                        try {
                                          const res = await fetch(`/devices/${d.id}`, {
                                            method: 'PUT',
                                            headers: {
                                              'Content-Type': 'application/json',
                                              'Authorization': `Bearer ${token}`
                                            },
                                            body: JSON.stringify({
                                              name: editingDevice.name,
                                              serial: editingDevice.serial,
                                              esp_host: editingDevice.esp_host,
                                              esp_port: editingDevice.esp_port
                                            })
                                          });
                                          if (res.ok) {
                                            const list = await (await fetch('/devices', {
                                              headers: { 'Authorization': `Bearer ${token}` }
                                            })).json();
                                            setDevices(list);
                                            setEditingDevice(null);
                                          } else {
                                            const error = await res.json().catch(() => ({ error: 'Bilinmeyen hata' }));
                                            alert(`Güncelleme başarısız: ${error.error || res.statusText}`);
                                          }
                                        } catch (err) {
                                          alert('Bağlantı hatası: ' + err);
                                        }
                                      }} 
                                      className="px-2 py-1 rounded bg-green-700 text-white text-xs hover:bg-green-600"
                                    >✓</button>
                                    <button 
                                      onClick={() => setEditingDevice(null)} 
                                      className="px-2 py-1 rounded bg-slate-600 text-white text-xs hover:bg-slate-500"
                                    >✗</button>
                                  </div>
                                ) : (
                                  <div className="flex gap-1">
                                    <button 
                                      onClick={() => {
                                        setSelectedDeviceId(String(d.id));
                                        fetchSettings();
                                      }} 
                                      className={`px-2 py-1 rounded text-xs transition-colors ${
                                        selectedDeviceId === String(d.id)
                                          ? 'bg-green-600 text-white font-semibold'
                                          : (d.active === 0 ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-slate-700 text-slate-200 hover:bg-slate-600')
                                      }`}
                                      disabled={d.active === 0}
                                    >
                                      {selectedDeviceId === String(d.id) ? '✓ Seçili' : 'Seç'}
                                    </button>
                                    <button 
                                      onClick={() => handleSyncDevice(String(d.id), d.esp_host, d.esp_port)}
                                      disabled={syncingDeviceId === String(d.id) || d.active === 0}
                                      className={`px-2 py-1 rounded text-xs transition-all flex items-center gap-1 ${
                                        syncingDeviceId === String(d.id)
                                          ? 'bg-yellow-600 text-white cursor-wait'
                                          : d.active === 0
                                          ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                          : 'bg-purple-700 text-white hover:bg-purple-600'
                                      }`}
                                      title="Cihazı senkronize et (ayarları yeniden yükle)"
                                    >
                                      <RefreshCw className={`w-3 h-3 ${syncingDeviceId === String(d.id) ? 'animate-spin' : ''}`} />
                                      {syncingDeviceId === String(d.id) ? 'Senkronize ediliyor...' : 'Senkronize'}
                                    </button>
                                    <button 
                                      onClick={() => setEditingDevice({ ...d })} 
                                      className="px-2 py-1 rounded bg-blue-700 text-white text-xs hover:bg-blue-600"
                                    >✎</button>
                                    {d.active === 0 ? (
                                      <button
                                        onClick={async () => {
                                          try {
                                            const res = await fetch(`/devices/${d.id}/active`, {
                                              method: 'PUT',
                                              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                              body: JSON.stringify({ active: true })
                                            });
                                            if (res.ok) {
                                              const list = await (await fetch(`/devices${showAllDevices ? '?all=1' : ''}`, {
                                                headers: { 'Authorization': `Bearer ${token}` }
                                              })).json();
                                              setDevices(list);
                                            }
                                          } catch {}
                                        }}
                                        className="px-2 py-1 rounded bg-green-700 text-white text-xs hover:bg-green-600"
                                        title="Cihazı aktifleştir"
                                      >✓ Aktifleştir</button>
                                    ) : (
                                      <button
                                        onClick={async () => {
                                          if (!confirm(`"${d.name}" cihazını pasif etmek istediğinize emin misiniz?\n\nPasif cihazlar listede gizlenir ve kullanılamaz.`)) return;
                                          try {
                                            const res = await fetch(`/devices/${d.id}/active`, {
                                              method: 'PUT',
                                              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                              body: JSON.stringify({ active: false })
                                            });
                                            if (res.ok) {
                                              const list = await (await fetch(`/devices${showAllDevices ? '?all=1' : ''}`, {
                                                headers: { 'Authorization': `Bearer ${token}` }
                                              })).json();
                                              setDevices(list);
                                              // Eğer pasif edilen cihaz seçiliyse, seçimi kaldır
                                              if (selectedDeviceId === String(d.id)) {
                                                setSelectedDeviceId('');
                                              }
                                            }
                                          } catch {}
                                        }}
                                        className="px-2 py-1 rounded bg-orange-700 text-white text-xs hover:bg-orange-600"
                                        title="Cihazı pasif et (soft delete)"
                                      >✗ Pasifleştir</button>
                                    )}
                                    <button
                                      onClick={async () => {
                                        const defaultSsid = (import.meta as any).env?.VITE_PROVISION_SSID || '';
                                        const defaultPass = (import.meta as any).env?.VITE_PROVISION_PASS || '';
                                        const ssidInput = prompt('Wi‑Fi adı (SSID):', defaultSsid);
                                        const passInput = prompt('Wi‑Fi şifresi (boş bırakılabilir):', defaultPass);
                                        const ssid = (ssidInput ?? defaultSsid).trim();
                                        const pass = (passInput ?? defaultPass).trim();
                                        const qs = new URLSearchParams();
                                        if (ssid) qs.append('ssid', ssid);
                                        if (pass) qs.append('pass', pass);
                                        const relUrl = `/devices/${d.id}/provision${qs.toString() ? `?${qs.toString()}` : ''}`;
                                        const headers = { 'Authorization': `Bearer ${token}` } as Record<string,string>;
                                        try {
                                          // Vite proxy üzerinden git (tarayıcı erişebilir)
                                          const url = relUrl; // relative path
                                          console.log('Fetching config from:', url);
                                          console.log('Authorization:', headers.Authorization ? 'Present' : 'Missing');
                                          
                                          const res = await fetch(url, { headers });
                                          console.log('Response status:', res.status);
                                          
                                          if (!res.ok) {
                                            const text = await res.text().catch(() => '');
                                            alert(`config.json indirilemedi (HTTP ${res.status})\n${text || 'Sunucuya ulaşılamıyor'}`);
                                            return;
                                          }
                                          
                                          const blob = await res.blob();
                                          const cd = res.headers.get('Content-Disposition') || '';
                                          let filename = `config-${d.name || d.id}.json`;
                                          const m = cd.match(/filename="?([^";]+)"?/i);
                                          if (m && m[1]) filename = m[1];
                                          const link = document.createElement('a');
                                          link.href = URL.createObjectURL(blob);
                                          link.download = filename;
                                          document.body.appendChild(link);
                                          link.click();
                                          link.remove();
                                          alert(`✅ ${filename} indirildi!`);
                                        } catch (e) {
                                          console.error('Config download error:', e);
                                          alert(`❌ config.json indirilemedi\n\nHata: ${(e as Error).message}\n\nBackend'in çalıştığından emin olun (http://localhost:8082)`);
                                        }
                                      }}
                                      className="px-2 py-1 rounded bg-slate-600 text-white text-xs hover:bg-slate-500"
                                    >⬇</button>
                                    <button 
                                      onClick={async () => {
                                        if (!confirm('Bu cihaz silinecek. Devam?')) return;
                                        try {
                                          const res = await fetch(`/devices/${d.id}`, {
                                            method: 'DELETE',
                                            headers: { 'Authorization': `Bearer ${token}` }
                                          });
                                          if (res.ok) {
                                            const list = await (await fetch(`/devices${showAllDevices ? '?all=1' : ''}`, {
                                              headers: { 'Authorization': `Bearer ${token}` }
                                            })).json();
                                            setDevices(list);
                                            if (selectedDeviceId === String(d.id)) {
                                              setSelectedDeviceId(null);
                                            }
                                          }
                                        } catch {}
                                      }} 
                                      className="px-2 py-1 rounded bg-red-700 text-white text-xs hover:bg-red-600"
                                    >🗑</button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                          {(() => {
                            const q = deviceQuery.trim().toLowerCase();
                            if (!q) return null;
                            const filtered = devices.filter((d: any) => 
                              String(d.name||'').toLowerCase().includes(q) || 
                              String(d.esp_host||'').toLowerCase().includes(q)
                            );
                            return filtered.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="py-4 text-center text-slate-400">
                                  Sonuç bulunamadı
                                </td>
                              </tr>
                            ) : null;
                          })()}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center justify-between mt-3 text-xs text-slate-300"><div className="flex items-center gap-2"><span>Sayfa:</span><select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white">{[5,10,20].map(n => <option key={n} value={n}>{n}</option>)}</select></div><div className="flex items-center gap-2"><button onClick={() => setPage(Math.max(1, page-1))} className="px-2 py-1 rounded bg-slate-700 border border-slate-600">‹</button><span>{(() => { const q = deviceQuery.trim().toLowerCase(); const filtered = devices.filter((d: any) => !q || String(d.name||'').toLowerCase().includes(q) || String(d.esp_host||'').toLowerCase().includes(q)); const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize)); return `${Math.min(page, totalPages)} / ${totalPages}`; })()}</span><button onClick={() => { const q = deviceQuery.trim().toLowerCase(); const filtered = devices.filter((d: any) => !q || String(d.name||'').toLowerCase().includes(q) || String(d.esp_host||'').toLowerCase().includes(q)); const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize)); setPage(Math.min(totalPages, page+1)); }} className="px-2 py-1 rounded bg-slate-700 border border-slate-600">›</button></div></div>
                  </div>
                </div>
              )}

              {/* Security Settings */}
              {activeTab === 'settings' && activeSubTab === 'security' && (
                <div className="space-y-5">
                  <div className="bg-red-900/20 border border-red-600/30 rounded-lg p-4 mb-4">
                    <p className="text-red-300 text-sm flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      <strong>Güvenlik:</strong> Admin bilgilerinizi güvenli tutun ve güçlü parolalar kullanın.
                    </p>
                  </div>

                  <div>
                    <label className="block text-white font-semibold mb-3">Admin Kullanıcı Adı</label>
                    <input
                      type="text"
                      name="admin"
                      maxLength={15}
                      value={(formData as any).admin || ''}
                      onChange={handleInputChange}
                      placeholder="admin"
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-white font-semibold mb-3">
                      Admin Parola
                    </label>
                    <input
                      type="password"
                      name="apass"
                      maxLength={23}
                      value={(formData as any).apass || ''}
                      onChange={handleInputChange}
                      placeholder="Boş bırakırsanız değişmez"
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-slate-400 text-sm mt-2">
                      Güvenlik için minimum 8 karakter, büyük/küçük harf ve rakam kullanın
                    </p>
                  </div>

                  <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-4">
                    <h4 className="text-blue-300 font-semibold mb-2">🔒 Güvenlik İpuçları</h4>
                    <ul className="text-sm text-slate-300 space-y-1 list-disc list-inside">
                      <li>Varsayılan parolayı mutlaka değiştirin</li>
                      <li>Güçlü ve benzersiz parolalar kullanın</li>
                      <li>Parolanızı düzenli olarak güncelleyin</li>
                      <li>Cihazınızı güvenli bir ağa bağlayın</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Save Button (only in Settings tab) */}
              {activeTab === 'settings' && (
                <div className="pt-6 border-t border-slate-600">
                  {!selectedDeviceId ? (
                    <div className="bg-amber-900/20 border border-amber-600/30 rounded-lg p-4 text-center">
                      <p className="text-amber-300 text-sm">
                        ⚠️ Ayarları kaydetmek için önce bir cihaz seçin
                      </p>
                    </div>
                  ) : (
                    <button
                      onClick={handleSaveSettings}
                      disabled={isLoadingSettings}
                      className={`w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-bold py-4 px-6 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 ${
                        isLoadingSettings 
                          ? 'opacity-50 cursor-not-allowed' 
                          : 'transform hover:scale-105'
                      }`}
                    >
                      {isLoadingSettings ? (
                        <>
                          <span className="animate-spin">⏳</span>
                          Kaydediliyor...
                        </>
                      ) : (
                        <>
                          <Save className="w-5 h-5" />
                          Tüm Ayarları Kaydet
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
