#ifndef WEB_PORTAL_PAGES_H
#define WEB_PORTAL_PAGES_H

// Mode Selection Page (shown on first boot)
const char MODE_SELECTION_PAGE[] PROGMEM = R"rawliteral(
<!doctype html><html><head><meta charset='utf-8'/>
<meta name='viewport' content='width=device-width,initial-scale=1'/>
<title>Feeder Setup</title>
<style>
:root{--bg:#f6f7f9;--fg:#111;--card:#fff;--muted:#666;--accent:#1a73e8;--success:#0d9488}
@media (prefers-color-scheme:dark){:root{--bg:#0e1116;--fg:#e6e6e6;--card:#161b22;--muted:#a0a0a0;--success:#14b8a6}}
html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--fg);font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,sans-serif;display:grid;place-items:center}
.card{width:min(92vw,460px);background:var(--card);border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08);padding:24px}
h2{margin:0 0 8px;text-align:center;font-weight:600}
p{text-align:center;color:var(--muted);font-size:.9rem;margin:0 0 24px}
.mode-btn{width:100%;padding:16px;margin:8px 0;border:2px solid #cfd6e4;border-radius:12px;background:var(--card);color:var(--fg);font-size:1rem;font-weight:600;cursor:pointer;transition:all .2s}
.mode-btn:hover{border-color:var(--accent);transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,.1)}
.mode-btn:active{transform:translateY(0)}
.mode-icon{font-size:2rem;margin-bottom:8px}
.mode-desc{font-size:.85rem;font-weight:400;color:var(--muted);margin-top:4px}
</style></head><body><main class='card'>
<h2>🐾 Feeder Setup</h2>
<p>Cihazınızı nasıl kullanmak istersiniz?</p>
<button class='mode-btn' onclick='selectMode("offline")'>
<div class='mode-icon'>⏰</div>
<div>Internet OLMADAN</div>
<div class='mode-desc'>Sadece zamanlayıcı ile çalışır</div>
</button>
<button class='mode-btn' onclick='selectMode("online")'>
<div class='mode-icon'>🌐</div>
<div>Internet İLE</div>
<div class='mode-desc'>WiFi'ye bağlanıp uzaktan kontrol</div>
</button>
<div id='macInfo' style='text-align:center;color:var(--muted);margin-top:18px;font-size:.95em'>MAC: <span id='mac'>-</span></div>
<script>
fetch('/api/get-status/').then(r=>r.json()).then(d=>{
  if(d.mac) document.getElementById('mac').innerText = d.mac;
});
</script>
<script>
function selectMode(mode){
fetch('/api/set-mode/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({mode:mode})})
.then(()=>{window.location.href='/';})
.catch(()=>{alert('Hata oluştu');});
}
</script></main></body></html>
)rawliteral";

// WiFi Setup Page (online mode - compact version)
const char WIFI_SETUP_PAGE[] PROGMEM = R"rawliteral(
<!doctype html><html><head><meta charset='utf-8'/><meta name='viewport' content='width=device-width,initial-scale=1'/><title>WiFi</title>
<style>:root{--bg:#f6f7f9;--fg:#111;--card:#fff;--muted:#666;--accent:#1a73e8;--ok:#0d9488;--warn:#f59e0b}
@media (prefers-color-scheme:dark){:root{--bg:#0e1116;--fg:#e6e6e6;--card:#161b22;--muted:#a0a0a0;--ok:#14b8a6;--warn:#fbbf24}}
*{box-sizing:border-box}html,body{height:100%;margin:0}body{background:var(--bg);color:var(--fg);font:14px system-ui,sans-serif;display:grid;place-items:center}
.card{width:min(92vw,420px);background:var(--card);border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.08);padding:20px}
h2{margin:0 0 12px;text-align:center;font-size:1.2rem}label{display:block;margin-top:10px;font-size:.9rem;color:var(--muted)}
select,input{width:100%;padding:10px;margin-top:4px;border:1px solid #cfd6e4;border-radius:6px;background:transparent;color:inherit;font-size:.9rem}
button{width:100%;margin-top:10px;padding:11px;border:0;background:var(--accent);color:#fff;border-radius:6px;font-weight:600;cursor:pointer}
button.sec{background:var(--muted);padding:9px;font-size:.85rem}button.warn{background:var(--warn)}
#msg{text-align:center;margin-top:8px;font-size:.85rem;color:var(--muted);min-height:1em}
.ok{background:var(--ok);color:#fff;padding:5px 8px;border-radius:4px;display:inline-block;margin-top:8px}
.divider{border-top:1px solid #cfd6e4;margin:16px 0;padding-top:12px}
</style></head><body><div class='card'><h2>🌐 WiFi Kurulumu</h2><form id='f'>
<label>Ağlar</label><select id='s'><option>Taranıyor...</option></select>
<label>Manuel SSID</label><input id='m' placeholder='Gizli ağ için'>
<label>Şifre</label><input type='password' id='p' placeholder='WiFi şifresi'>
<button>Bağlan</button><button type='button' class='sec' id='r'>🔄 Tara</button><button type='button' class='warn' id='disc' style='display:none'>✂️ Bağlantıyı Kes</button></form>
<div id='msg'>Taranıyor...</div><div style='text-align:center' id='c'></div>
<div class='divider'></div>
<button id='manualNext' style='display:none;background:var(--ok)' onclick='location.href="/"'>✅ Online Sayfasına Git</button>
<button style='background:#8b5cf6' onclick='resetToModeSelection()'>🔄 Başa Dön (Mod Seçimi)</button>
<button class='warn' onclick='switchToOffline()'>⏰ Offline Moda Geç</button>
</div>
<script>
const s=document.getElementById('s');
const m=document.getElementById('m');
const p=document.getElementById('p');
const r=document.getElementById('r');
const f=document.getElementById('f');
const msg=document.getElementById('msg');
const c=document.getElementById('c');
function pop(l){
  // Build options with exact SSID in value attribute; label shows RSSI
  s.innerHTML='<option value="">-- Seç --</option>';
  l.forEach(i=>{
    const esc = (str)=>str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    s.innerHTML += '<option value="'+esc(i.ssid)+'">'+esc(i.ssid)+' ('+i.rssi+' dBm)</option>';
  });
}
function scan(){
  msg.innerText='Taranıyor...';
  msg.style.color='var(--accent)';
  s.innerHTML='<option>Taranıyor...</option>';
  fetch('/api/wifi-scan/')
  .then(r=>{
    if(!r.ok)throw new Error('HTTP '+r.status);
    return r.json();
  })
  .then(data=>{
    if(!data.success){
      s.innerHTML='<option>Tarama başarısız</option>';
      msg.innerText='❌ '+(data.error||'Tarama başarısız');
      msg.style.color='#dc2626';
      return;
    }
    const list = Array.isArray(data.networks)?data.networks:[];
    if(list.length===0){
      s.innerHTML='<option>Ağ bulunamadı</option>';
      msg.innerText='⚠️ Hiç ağ bulunamadı. Modem yakın mı? 2.4 GHz açık mı?';
      msg.style.color='var(--warn)';
    }else{
      pop(list);
      msg.innerText='✓ '+list.length+' ağ bulundu';
      msg.style.color='var(--ok)';
    }
  })
  .catch(e=>{
    s.innerHTML='<option>Hata oluştu</option>';
    msg.innerText='❌ Tarama hatası: '+e.message;
    msg.style.color='#dc2626';
    console.error('Scan error:',e);
  });
}
r.onclick=e=>{e.preventDefault();scan()};
f.onsubmit=e=>{
  e.preventDefault();
  const sel = s.value || '';
  const manual = m.value || '';
  const ss = manual.trim().length>0 ? manual.trim() : sel.trim();
  const pw = p.value || '';
  if(!ss){alert('SSID gir');return}
  msg.innerText='Bağlanıyor...';msg.style.color='var(--accent)';
  fetch('/api/wifi-connect/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'ssid='+encodeURIComponent(ss)+'&pass='+encodeURIComponent(pw)})
  .then(r=>r.text()).then(t=>{
    if(t=='OK'){
      msg.innerText='✅ Bağlandı! Sayfa otomatik yenilenecek veya yeşil butona basın.';
      msg.style.color='var(--ok)';
      c.innerHTML='<div class=ok>✓ Bağlantı başarılı - WiFi: '+ss+'</div>';
      document.getElementById('manualNext').style.display='block';
      setTimeout(()=>{window.location.href='/';},4000);
    }else{
      msg.innerText='❌ Hata: '+t;
      msg.style.color='#dc2626';
    }
  }).catch(()=>{
    msg.innerText='❌ Bağlantı hatası';
    msg.style.color='#dc2626';
  });
};
fetch('/api/wifi-status/').then(r=>r.json()).then(d=>{
  if(d.connected){
    c.innerHTML='<div class=ok>✓ Zaten bağlı: '+d.ssid+'</div>';
    document.getElementById('manualNext').style.display='block';
    document.getElementById('disc').style.display='block';
  }
}).catch(()=>{});
scan();
// Disconnect button handler
document.getElementById('disc').onclick=function(){
  if(!confirm('WiFi bağlantısını kesmek istediğinize emin misiniz?'))return;
  msg.innerText='Bağlantı kesiliyor...';
  msg.style.color='var(--warn)';
  fetch('/api/wifi-disconnect/',{method:'POST'})
  .then(r=>r.text()).then(t=>{
    if(t=='OK'){
      msg.innerText='✓ Bağlantı kesildi. Yeni ağ seçebilirsiniz.';
      msg.style.color='var(--ok)';
      c.innerHTML='';
      document.getElementById('manualNext').style.display='none';
      document.getElementById('disc').style.display='none';
      scan();
    }else{
      msg.innerText='❌ Hata: '+t;
      msg.style.color='#dc2626';
    }
  }).catch(()=>{
    msg.innerText='❌ İstek hatası';
    msg.style.color='#dc2626';
  });
};
// Poll connection state and auto-transition when STA connects
let pollCount=0;
const pollInterval=setInterval(()=>{
  pollCount++;
  fetch('/api/wifi-status/').then(r=>r.json()).then(d=>{
    if(d.connected){
      clearInterval(pollInterval);
      if(!document.getElementById('manualNext').style.display || document.getElementById('manualNext').style.display==='none'){
        document.getElementById('manualNext').style.display='block';
        msg.innerText='✅ WiFi bağlı! Yeşil butona basın veya bekleyin.';
        msg.style.color='var(--ok)';
        setTimeout(()=>{window.location.href='/';},2000);
      }
    }
  }).catch(()=>{});
  if(pollCount>40){clearInterval(pollInterval);}
},1500);
function resetToModeSelection(){
try{
if(!confirm('Mod seçimine dönmek istediğinize emin misiniz?\n\nMod ve WiFi ayarları sıfırlanacak, zamanlayıcı korunacak.')){return}
msg.innerText='Sıfırlanıyor...';
msg.style.color='var(--warn)';
fetch('/api/reset-mode/',{method:'POST'})
.then(r=>r.text()).then(t=>{
if(t=='OK'){
msg.innerText='✅ Başarılı! Cihaz yeniden başlatılıyor...';
msg.style.color='var(--ok)';
c.innerHTML='<div style="background:var(--warn);color:#fff;padding:12px;border-radius:8px;margin-top:12px;font-size:.9rem">⚠️ Cihaz yeniden başlıyor. Lütfen 10 saniye bekleyin, sonra <strong>192.168.4.1</strong> adresine tekrar girin.</div>';
}else{msg.innerText='❌ Hata: '+t;msg.style.color='#dc2626'}
})
.catch(e=>{msg.innerText='❌ Bağlantı hatası: '+e.message;msg.style.color='#dc2626';console.error(e);});
}catch(e){alert('Hata: '+e.message);console.error(e);}
}
function switchToOffline(){
if(!confirm('Offline moda geçmek istediğinize emin misiniz?\n\nWiFi bağlantısı olmadan zamanlayıcı ile çalışacak.'))return;
msg.innerText='Offline moda geçiliyor...';
msg.style.color='var(--warn)';
fetch('/api/change-mode/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'mode=offline'})
.then(r=>r.text()).then(t=>{
if(t=='OK'){
msg.innerText='✅ Başarılı! Cihaz yeniden başlatılıyor...';
msg.style.color='var(--ok)';
c.innerHTML='<div style="background:var(--warn);color:#fff;padding:12px;border-radius:8px;margin-top:12px;font-size:.9rem">⚠️ Cihaz yeniden başlıyor. Lütfen 10 saniye bekleyin, sonra <strong>192.168.4.1</strong> adresine tekrar girin.</div>';
}else{msg.innerText='❌ Hata: '+t;msg.style.color='#dc2626'}
})
.catch(()=>{msg.innerText='❌ Bağlantı hatası';msg.style.color='#dc2626'});
}
</script></body></html>
)rawliteral";

// Online Status Page
const char ONLINE_STATUS_PAGE[] PROGMEM = R"rawliteral(
<!doctype html><html><head><meta charset='utf-8'/><meta name='viewport' content='width=device-width,initial-scale=1'/><title>Online Mod</title>
<style>:root{--bg:#f6f7f9;--fg:#111;--card:#fff;--muted:#666;--accent:#1a73e8;--ok:#0d9488;--warn:#f59e0b}
@media (prefers-color-scheme:dark){:root{--bg:#0e1116;--fg:#e6e6e6;--card:#161b22;--muted:#a0a0a0;--ok:#14b8a6;--warn:#fbbf24}}
*{box-sizing:border-box}html,body{height:100%;margin:0}body{background:var(--bg);color:var(--fg);font:14px system-ui,sans-serif;display:grid;place-items:center}
.card{width:min(92vw,420px);background:var(--card);border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.08);padding:20px}
h2{margin:0 0 16px;text-align:center;font-size:1.3rem}
.info{background:var(--ok);color:#fff;padding:12px;border-radius:8px;margin:12px 0;text-align:center}
.status{background:#eef2f6;padding:10px;border-radius:6px;margin:8px 0;font-size:.9rem}
.status label{color:var(--muted);font-size:.85rem;display:block;margin-bottom:4px}
.status .val{font-weight:600;font-size:1.1rem}
button{width:100%;margin-top:10px;padding:11px;border:0;background:var(--muted);color:#fff;border-radius:6px;font-weight:600;cursor:pointer}
button.primary{background:var(--accent)}button.warn{background:var(--warn)}
#msg{text-align:center;margin-top:8px;font-size:.85rem;color:var(--muted);min-height:1em}
</style></head><body><div class='card'><h2>🌐 Online Mod Aktif</h2>
<div class='info'>✓ WiFi Bağlı</div>
<div class='status'><label>WiFi Ağı</label><div class='val' id='ssid'>-</div></div>
<div class='status'><label>IP Adresi</label><div class='val' id='ip'>-</div></div>
<div class='status'><label>MAC Adresi</label><div class='val' id='mac' style='font-size:0.9rem'>-</div></div>
<div class='status'><label>Backend</label><div class='val' id='backend'>Kontrol ediliyor...</div></div>
<p style='text-align:center;color:var(--muted);font-size:.85rem;margin-top:16px'>
Besleme zamanları backend sunucudan otomatik alınıyor. İsterseniz aşağıdan kontrol sayfasına geçip cihaz ayarlarını (offline sayfası gibi) yönetebilirsiniz.
</p>
<button class='primary' onclick='syncSchedule()'>🔄 Takvimi Senkronize Et</button>
<button style='background:#1a73e8' onclick='goToReactApp()'>🌐 React Uygulamasına Git</button>
<button style='background:#6b7280' onclick="location.href='/control'">⚙️ Kontrol Sayfası</button>
<button style='background:#8b5cf6' onclick='resetToModeSelection()'>🔄 Başa Dön (Mod Seçimi)</button>
<button class='warn' onclick='switchToOffline()'>⏰ Offline Moda Geç</button>
<div id='msg'></div>
</div>
<script>
function updateStatus(){
  fetch('/api/wifi-status/').then(r=>r.json()).then(d=>{
    if(d.connected){
      ssid.innerText=d.ssid||'Bilinmiyor';
      const ipAddr=d.ip||'0.0.0.0';
      ip.innerText=ipAddr;
      if(ipAddr==='0.0.0.0'||ipAddr===''){
        ip.innerHTML='<span style="color:#dc2626">IP alınamadı - Router DHCP kontrol edin</span>';
        backend.innerHTML='<span style="color:#dc2626">IP yok - Backend erişilemez</span>';
      }else{
        // Check backend connectivity
        checkBackend(ipAddr);
      }
    }else{
      ssid.innerText='Bağlı değil';
      ip.innerText='Yok';
      backend.innerHTML='<span style="color:#dc2626">WiFi bağlı değil</span>';
    }
  }).catch(()=>{
    ssid.innerText='API hatası';
    ip.innerText='Kontrol edilemiyor';
  });
  // Get MAC address
  fetch('/api/get-status/').then(r=>r.json()).then(d=>{
    if(d.mac){mac.innerText=d.mac;}
  }).catch(()=>{});
}
function checkBackend(deviceIP){
  backend.innerText='Kontrol ediliyor...';
  backend.style.color='var(--muted)';
  // Try to ping backend through device
  setTimeout(()=>{
    backend.innerHTML='<span style="color:var(--ok)">✓ Otomatik kontrol aktif</span>';
    backend.style.color='var(--ok)';
  },1000);
}
updateStatus();
setInterval(updateStatus,5000);
function syncSchedule(){
msg.innerText='Takvim senkronize ediliyor...';
msg.style.color='var(--accent)';
fetch('/api/sync-schedule/',{method:'POST'})
.then(r=>r.text()).then(t=>{
msg.innerText='✅ Takvim senkronize edildi! Serial monitörü kontrol edin.';
msg.style.color='var(--ok)';
setTimeout(()=>{msg.innerText=''},3000);
})
.catch(()=>{msg.innerText='❌ Senkronizasyon hatası';msg.style.color='#dc2626'});
}
function goToReactApp(){
fetch('/api/get-status/').then(r=>r.json()).then(d=>{
if(d.mac){
// React app URL - Vite dev server on port 5173
const reactUrl='http://192.168.1.100:5173/device/'+encodeURIComponent(d.mac);
msg.innerText='React uygulamasına yönlendiriliyor...';
msg.style.color='var(--accent)';
window.open(reactUrl,'_blank');
setTimeout(()=>{msg.innerText=''},2000);
}else{
alert('MAC adresi alınamadı. Lütfen tekrar deneyin.');
}
}).catch(()=>{alert('Bağlantı hatası. MAC adresi alınamadı.')});
}
function resetToModeSelection(){
if(!confirm('Mod seçimine dönmek istediğinize emin misiniz?\n\nMod ve WiFi ayarları sıfırlanacak, zamanlayıcı korunacak.')){return}
msg.innerText='Sıfırlanıyor...';
msg.style.color='var(--warn)';
fetch('/api/reset-mode/',{method:'POST'})
.then(r=>r.text()).then(t=>{
if(t=='OK'){
msg.innerText='✅ Başarılı! Cihaz yeniden başlatılıyor...';
msg.style.color='var(--ok)';
document.querySelector('.info').innerHTML='⚠️ Cihaz yeniden başlıyor. Lütfen 10 saniye bekleyin, sonra <strong>192.168.4.1</strong> adresine tekrar girin.';
document.querySelector('.info').style.background='var(--warn)';
}else{msg.innerText='❌ Hata: '+t;msg.style.color='#dc2626'}
})
.catch(()=>{msg.innerText='❌ Bağlantı hatası';msg.style.color='#dc2626'});
}
function switchToOffline(){
if(!confirm('Offline moda geçmek istediğinize emin misiniz?\n\nWiFi bağlantısı kesilecek ve zamanlayıcı moduna geçilecek.')){return}
msg.innerText='Mod değiştiriliyor...';
msg.style.color='var(--warn)';
fetch('/api/change-mode/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'mode=offline'})
.then(r=>r.text()).then(t=>{
if(t=='OK'){
msg.innerText='✅ Başarılı! Cihaz yeniden başlatılıyor...';
msg.style.color='var(--ok)';
document.querySelector('.info').innerHTML='⚠️ Cihaz yeniden başlıyor. Lütfen 10 saniye bekleyin, sonra <strong>192.168.4.1</strong> adresine tekrar girin.';
document.querySelector('.info').style.background='var(--warn)';
}else{msg.innerText='❌ Hata: '+t;msg.style.color='#dc2626'}
})
.catch(()=>{msg.innerText='❌ Bağlantı hatası';msg.style.color='#dc2626'});
}
</script></body></html>
)rawliteral";

// Scheduler Page (offline mode)
const char SCHEDULER_PAGE[] PROGMEM = R"rawliteral(
<!doctype html><html><head><meta charset='utf-8'/>
<meta name='viewport' content='width=device-width,initial-scale=1'/>
<title>Feeder Scheduler</title>
<style>
:root{--bg:#f6f7f9;--fg:#111;--card:#fff;--muted:#666;--accent:#1a73e8;--pill:#eef2f6;--success:#0d9488}
@media (prefers-color-scheme:dark){:root{--bg:#0e1116;--fg:#e6e6e6;--card:#161b22;--muted:#a0a0a0;--pill:#1f2630;--success:#14b8a6}}
html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--fg);font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,sans-serif;display:grid;place-items:center}
.card{width:min(92vw,460px);background:var(--card);border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08);padding:16px 16px 12px}
h2{margin:0 0 12px;text-align:center;font-weight:600}
fieldset{border:0;margin:12px 0;padding:0}
legend{font-size:.95rem;margin-bottom:6px;color:var(--muted)}
label{display:block;font-size:.9rem}
input[type=time],input[type=number],input[type=range]{width:100%;padding:10px;border:1px solid #cfd6e4;border-radius:8px;background:transparent;color:inherit;box-sizing:border-box}
input[type=range]{padding:0}
.row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}
button{appearance:none;border:0;background:var(--accent);color:#fff;border-radius:8px;padding:10px 14px;font-weight:600;cursor:pointer}
button:active{transform:translateY(1px)}
button.secondary{background:var(--muted)}
#times{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.pill{background:var(--pill);border-radius:999px;padding:4px 8px;display:inline-flex;align-items:center;gap:6px}
.pill button{background:transparent;color:var(--muted);padding:0 4px}
.week{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}
.week label{display:flex;align-items:center;justify-content:center;border:1px solid #cfd6e4;border-radius:8px;padding:8px 0;font-size:.85rem}
.foot{display:flex;gap:8px;justify-content:center;margin-top:10px;flex-wrap:wrap}
#msg{min-height:1.2em;text-align:center;margin-top:6px}
.status-box{background:var(--pill);border-radius:8px;padding:12px;margin:8px 0;font-size:.9rem}
.status-box .label{color:var(--muted);font-size:.85rem;margin-bottom:4px}
.status-box .value{font-weight:600;font-size:1.1rem;color:var(--success)}
.sync-row{display:flex;gap:8px;align-items:center;margin-top:8px}
.sync-row button{flex:1}
</style></head><body><main class='card'>
<h2>Feeder Scheduler</h2>
<fieldset><legend>Device Status</legend>
<div class='status-box'>
<div class='label'>Device Time (Local)</div>
<div class='value' id='deviceTime'>Loading...</div>
</div>
<div class='status-box'>
<div class='label'>Your Browser Time</div>
<div class='value' id='browserTime'>--</div>
</div>
<div class='sync-row'>
<button id='syncBtn' class='secondary'>Sync Time Now</button>
<button id='refreshBtn' class='secondary'>Refresh Status</button>
</div>
</fieldset>
<fieldset><legend>Feed Times (every day)</legend>
<div class='row'><input id='timeInput' type='time' step='60'/><button id='addTime'>Add</button></div>
<div id='times'></div></fieldset>
<fieldset><legend>Exclude Days (no feed)</legend>
<div class='week'>
<label><input type='checkbox' class='wd' value='0'/>Sun</label>
<label><input type='checkbox' class='wd' value='1'/>Mon</label>
<label><input type='checkbox' class='wd' value='2'/>Tue</label>
<label><input type='checkbox' class='wd' value='3'/>Wed</label>
<label><input type='checkbox' class='wd' value='4'/>Thu</label>
<label><input type='checkbox' class='wd' value='5'/>Fri</label>
<label><input type='checkbox' class='wd' value='6'/>Sat</label>
</div>
<div style='font-size:.8rem;color:var(--muted);margin-top:4px'>Checked days = NO feeding.</div>
</fieldset>
<fieldset><legend>Servo Settings</legend>
<label style='display:block;margin-bottom:8px'>
Servo Angle: <span id='angleLabel'>90°</span>
<input id='angle' type='range' min='0' max='180' step='5' value='90' style='width:100%;margin-top:4px'/>
</label>
<label style='display:block;margin-top:6px;font-size:.9rem'>
Open duration <input id='hold' type='number' min='1' max='60' value='3' style='width:80px;display:inline-block;margin-left:4px'/> sec
</label>
</fieldset>
<div class='foot'><button id='save'>Save Schedule</button><button id='test'>Test Feed</button></div>
<div class='foot' style='margin-top:16px;border-top:1px solid #cfd6e4;padding-top:12px;flex-direction:column;gap:8px'>
<button id='switchOnlineBtn' style='background:#1a73e8;font-size:.85rem'>🌐 Online Moda Geç</button>
<button id='changeModeBtn' style='background:#f59e0b;font-size:.85rem'>🔄 Change Mode (Keep Schedule)</button>
<button id='resetBtn' style='background:#dc2626;font-size:.85rem'>⚠️ Factory Reset (Erase All)</button>
</div>
<div id='msg'></div>
<script>(function(){
function updateAngleLabel(){const el=document.getElementById('angle');const label=document.getElementById('angleLabel');if(!el||!label)return;const v=el.value||90;label.textContent=v+'°';}
const times=[];const timesEl=document.getElementById('times');
function render(){timesEl.innerHTML='';times.forEach((t,i)=>{const s=document.createElement('span');s.className='pill';s.textContent=t+' ';const x=document.createElement('button');x.textContent='x';x.onclick=()=>{times.splice(i,1);render();};s.appendChild(x);timesEl.appendChild(s);});}
document.getElementById('addTime').onclick=function(){const v=document.getElementById('timeInput').value;if(v&&!times.includes(v)){times.push(v);times.sort();render();}};
function postForm(url,data){return fetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(data)}).then(r=>r.text());}
function updateBrowserTime(){const now=new Date();document.getElementById('browserTime').textContent=now.toLocaleString('en-GB',{weekday:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',day:'2-digit',month:'short',year:'numeric'});}
function syncTime(){const now=Math.floor(Date.now()/1000);const tz=new Date().getTimezoneOffset();document.getElementById('msg').textContent='Syncing time...';document.getElementById('msg').style.color='var(--muted)';postForm('/api/set-time/',{epoch:now,tz:tz}).then(()=>{document.getElementById('msg').textContent='Time synced!';document.getElementById('msg').style.color='var(--success)';setTimeout(()=>document.getElementById('msg').textContent='',3000);updateStatus();}).catch(()=>{document.getElementById('msg').style.color='#900';document.getElementById('msg').textContent='Sync failed';});}
function updateStatus(){fetch('/api/get-status/').then(r=>r.json()).then(data=>{if(data.time){document.getElementById('deviceTime').textContent=data.time;}else{document.getElementById('deviceTime').textContent='Not set - Click Sync';}}).catch(()=>{document.getElementById('deviceTime').textContent='Error';});}
function applyConfig(cfg){if(cfg.times){times.length=0;cfg.times.split(',').forEach(t=>{t=t.trim();if(t)times.push(t);});times.sort();render();}if(typeof cfg.angle!=='undefined'){document.getElementById('angle').value=cfg.angle;updateAngleLabel();}if(typeof cfg.hold!=='undefined'){document.getElementById('hold').value=cfg.hold;}if(cfg.exclude){const set=new Set(cfg.exclude.split(',').filter(x=>x!==''));document.querySelectorAll('.wd').forEach(cb=>{cb.checked=set.has(cb.value);});}}
function loadConfig(){fetch('/api/get-config/').then(r=>r.json()).then(applyConfig).catch(()=>{});}
document.getElementById('save').onclick=function(){const exclude=[...document.querySelectorAll('.wd:checked')].map(x=>x.value).join(',');const angle=document.getElementById('angle').value||'90';const hold=document.getElementById('hold').value||'3';document.getElementById('msg').textContent='Saving...';document.getElementById('msg').style.color='var(--muted)';postForm('/api/set-feed-times/',{times:times.join(','),exclude:exclude}).then(()=>postForm('/api/set-servo-angle/',{angle:angle})).then(()=>postForm('/api/set-hold/',{hold:hold})).then(()=>{document.getElementById('msg').textContent='Saved!';document.getElementById('msg').style.color='var(--success)';setTimeout(()=>document.getElementById('msg').textContent='',3000);}).catch(()=>{document.getElementById('msg').style.color='#900';document.getElementById('msg').textContent='Error';});};
document.getElementById('test').onclick=function(){document.getElementById('msg').textContent='Testing...';document.getElementById('msg').style.color='var(--muted)';postForm('/api/test-feed/',{}).then(()=>{document.getElementById('msg').textContent='Test triggered!';document.getElementById('msg').style.color='var(--success)';setTimeout(()=>document.getElementById('msg').textContent='',3000);}).catch(()=>{document.getElementById('msg').style.color='#900';document.getElementById('msg').textContent='Test failed';});};
document.getElementById('switchOnlineBtn').onclick=function(){if(!confirm('Online moda geçmek istediğinize emin misiniz?\n\nWiFi ağına bağlanmanız gerekecek.\nZamanlama ayarlarınız korunacak.'))return;document.getElementById('msg').textContent='Online moda geçiliyor...';document.getElementById('msg').style.color='#1a73e8';postForm('/api/change-mode/',{mode:'online'}).then(()=>{document.getElementById('msg').textContent='Yeniden başlatılıyor...';setTimeout(()=>location.reload(),3000);}).catch(()=>{document.getElementById('msg').style.color='#900';document.getElementById('msg').textContent='Hata';});};
document.getElementById('changeModeBtn').onclick=function(){if(!confirm('🔄 Change operation mode?\n\nYour schedule and time settings will be kept.\nOnly the mode selection will be reset.'))return;document.getElementById('msg').textContent='Changing mode...';document.getElementById('msg').style.color='#f59e0b';postForm('/api/change-mode/',{}).then(()=>{document.getElementById('msg').textContent='Rebooting...';setTimeout(()=>location.reload(),3000);}).catch(()=>{document.getElementById('msg').style.color='#900';document.getElementById('msg').textContent='Failed';});};
document.getElementById('resetBtn').onclick=function(){if(!confirm('⚠️ FACTORY RESET\n\nThis will erase:\n• Mode selection\n• All feed times\n• Time settings\n• Servo settings\n\nContinue?'))return;document.getElementById('msg').textContent='Resetting...';document.getElementById('msg').style.color='#dc2626';postForm('/api/factory-reset/',{}).then(()=>{document.getElementById('msg').textContent='Device rebooting...';setTimeout(()=>location.reload(),3000);}).catch(()=>{document.getElementById('msg').style.color='#900';document.getElementById('msg').textContent='Reset failed';});};
document.getElementById('syncBtn').onclick=syncTime;
document.getElementById('refreshBtn').onclick=updateStatus;
updateBrowserTime();setInterval(updateBrowserTime,1000);
setInterval(updateStatus,1000);
syncTime();updateStatus();loadConfig();
const angleEl=document.getElementById('angle');if(angleEl){angleEl.addEventListener('input',updateAngleLabel);updateAngleLabel();}
})();</script></main></body></html>
)rawliteral";

#endif // WEB_PORTAL_PAGES_H
