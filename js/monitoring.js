// Monitoring tab — live MQTT telemetry display for all 6 biome nodes

const MON_BIOMES = [
  { id: 1, name: 'Freshwater Lake' },
  { id: 2, name: 'Lakeshore' },
  { id: 3, name: 'Lowland Meadow' },
  { id: 4, name: 'Mangrove Forest' },
  { id: 5, name: 'Marine Shore' },
  { id: 6, name: 'Seagrass Meadow' },
];

const monBiomeState = {};
let monActiveBiome = 1;
let monLoaded = false;
let monTickInterval = null;

function initMonitoring() {
  if (monLoaded) return;
  monLoaded = true;

  MON_BIOMES.forEach(b => { monBiomeState[b.id] = { data: null, lastSeen: null }; });

  // Build biome sub-tab buttons
  const tabsEl = document.getElementById('mon-biome-tabs');
  MON_BIOMES.forEach((b, i) => {
    const btn = document.createElement('button');
    btn.className = 'mon-biome-tab' + (i === 0 ? ' active' : '');
    btn.id = `mon-tab-${b.id}`;
    btn.textContent = b.name;
    btn.onclick = () => showMonitoringBiome(b.id);
    tabsEl.appendChild(btn);
  });

  // Build biome panels
  const panelsEl = document.getElementById('mon-panels');
  MON_BIOMES.forEach((b, i) => {
    const div = document.createElement('div');
    div.id = `mon-panel-${b.id}`;
    div.className = 'mon-biome-panel' + (i !== 0 ? ' hidden' : '');
    div.innerHTML = buildBiomePanel(b);
    panelsEl.appendChild(div);
  });

  window.electronAPI.onMonitoringTelemetry(handleMonTelemetry);
  window.electronAPI.onMonitoringStatus(({ connected }) => {
    if (!connected) setMonBanner('offline', 'MQTT disconnected from broker');
  });

  doMonConnect();
  monTickInterval = setInterval(monTick, 5000);
}

function buildBiomePanel({ id, name }) {
  const cards = [
    { field: 'bio_t',    label: 'Bio Air Temp',    unit: '°C', cls: 'featured' },
    { field: 'bio_h',    label: 'Bio Humidity',    unit: '%',  cls: 'featured' },
    { field: 'atmo_t',   label: 'Atmo Air Temp',   unit: '°C', cls: '' },
    { field: 'atmo_h',   label: 'Atmo Humidity',   unit: '%',  cls: '' },
    { field: 'liq_t',    label: 'Liquid Temp',     unit: '°C', cls: '' },
    { field: 'pump_pct', label: 'Pump Output',     unit: '%',  cls: '' },
    { field: 'target_t', label: 'Target Setpoint', unit: '°C', cls: 'accent' },
  ];
  const cardHtml = cards.map(c => `
    <div class="mon-sensor-card ${c.cls}">
      <div class="mon-sensor-label">${c.label}</div>
      <div class="mon-sensor-value" id="mon-${c.field}-${id}">—</div>
      <div class="mon-sensor-unit">${c.unit}</div>
    </div>`).join('');

  return `
    <div class="mon-panel-header">
      <div class="mon-panel-title-row">
        <span class="mon-panel-title">${name}</span>
        <span class="mon-chip offline" id="mon-chip-${id}">Offline</span>
        <span class="mon-last-seen" id="mon-lastseen-${id}">No data received</span>
      </div>
    </div>
    <div class="mon-sensor-grid">${cardHtml}</div>`;
}

async function doMonConnect() {
  setMonBanner('connecting', 'Connecting to MQTT broker at 192.168.8.228:1883...');
  const res = await window.electronAPI.monitoringConnect();
  if (res.ok) {
    setMonBanner('live', 'Live — MQTT connected · updates every 10s');
  } else {
    setMonBanner('offline', `MQTT unreachable — ${res.error || 'connection failed'}`);
  }
}

function handleMonTelemetry({ biomeId, type, data, ts }) {
  if (type !== 'telemetry' || typeof data !== 'object') return;
  monBiomeState[biomeId] = { data, lastSeen: ts };
  refreshBiomeValues(biomeId);
}

function refreshBiomeValues(biomeId) {
  const { data } = monBiomeState[biomeId];
  if (!data) return;
  ['bio_t', 'bio_h', 'atmo_t', 'atmo_h', 'liq_t', 'pump_pct', 'target_t'].forEach(f => {
    const el = document.getElementById(`mon-${f}-${biomeId}`);
    if (el) el.textContent = fmtSensorVal(f, data[f]);
  });
}

function fmtSensorVal(field, val) {
  if (val == null) return '—';
  if (typeof val !== 'number') return String(val);
  return field === 'pump_pct' ? String(Math.round(val)) : val.toFixed(1);
}

function monTick() {
  const now = Date.now();
  MON_BIOMES.forEach(({ id }) => {
    const { lastSeen } = monBiomeState[id];
    const lsEl = document.getElementById(`mon-lastseen-${id}`);
    if (lastSeen) {
      const secs = Math.floor((now - lastSeen) / 1000);
      if (lsEl) lsEl.textContent = `Updated ${secs < 60 ? secs + 's' : Math.floor(secs / 60) + 'm'} ago`;
      setMonChip(id, secs < 20 ? 'healthy' : secs < 45 ? 'stale' : 'offline');
    } else {
      if (lsEl) lsEl.textContent = 'No data received';
      setMonChip(id, 'offline');
    }
  });
}

function setMonChip(biomeId, status) {
  const el = document.getElementById(`mon-chip-${biomeId}`);
  if (!el) return;
  el.className = `mon-chip ${status}`;
  el.textContent = status.charAt(0).toUpperCase() + status.slice(1);
}

function setMonBanner(state, text) {
  const el = document.getElementById('mon-banner');
  const txtEl = document.getElementById('mon-banner-text');
  if (!el || !txtEl) return;
  el.className = `mon-banner mon-banner-${state}`;
  txtEl.textContent = text;
}

function showMonitoringBiome(id) {
  monActiveBiome = id;
  MON_BIOMES.forEach(b => {
    document.getElementById(`mon-tab-${b.id}`)?.classList.toggle('active', b.id === id);
    document.getElementById(`mon-panel-${b.id}`)?.classList.toggle('hidden', b.id !== id);
  });
}
