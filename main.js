const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let win = null;
let mqttClient = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'miniBIOTA',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.loadFile('index.html');
  win.setMenuBarVisibility(false);
}

ipcMain.handle('reindex-media', async (event, folder) => {
  try {
    const indexMedia = require('./tools/indexer-core');
    const result = await indexMedia(folder, (progress) => {
      event.sender.send('reindex-progress', progress);
    });
    return { success: true, ...result };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('monitoring-connect', async () => {
  if (mqttClient && mqttClient.connected) return { ok: true };
  if (mqttClient) { mqttClient.end(true); mqttClient = null; }

  const mqtt = require('mqtt');
  return new Promise((resolve) => {
    const client = mqtt.connect('mqtt://192.168.8.228:1883', {
      clientId: `minibiota-app-${Date.now()}`,
      connectTimeout: 10000,
      reconnectPeriod: 0,
      protocolVersion: 4,  // MQTT v3.1.1 — matches Mosquitto and ESP32 firmware
    });

    let settled = false;
    const settle = (val) => { if (!settled) { settled = true; resolve(val); } };

    const timeout = setTimeout(() => {
      client.end(true);
      settle({ ok: false, error: 'connection timed out' });
    }, 11000);

    client.on('connect', () => {
      clearTimeout(timeout);
      mqttClient = client;
      client.subscribe('miniBIOTA/biome/+/telemetry');
      client.subscribe('miniBIOTA/biome/+/status');
      settle({ ok: true });
    });

    client.on('error', (err) => {
      clearTimeout(timeout);
      client.end(true);
      settle({ ok: false, error: err.message });
    });

    client.on('close', () => {
      // Only notify renderer on real disconnects, not failed connect attempts
      if (mqttClient === client) {
        mqttClient = null;
        if (win && !win.isDestroyed()) {
          win.webContents.send('monitoring-status', { connected: false });
        }
      }
    });

    client.on('message', (topic, payload) => {
      const parts = topic.split('/');
      if (parts.length !== 4 || parts[0] !== 'miniBIOTA' || parts[1] !== 'biome') return;
      const biomeId = parseInt(parts[2], 10);
      const type = parts[3];
      let data;
      try { data = JSON.parse(payload.toString()); } catch { data = payload.toString(); }
      if (win && !win.isDestroyed()) {
        win.webContents.send('monitoring-telemetry', { biomeId, type, data, ts: Date.now() });
      }
    });
  });
});

ipcMain.handle('monitoring-disconnect', async () => {
  if (mqttClient) { mqttClient.end(true); mqttClient = null; }
  return { ok: true };
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (mqttClient) mqttClient.end(true);
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
