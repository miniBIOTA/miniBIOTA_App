// tools/indexer-core.js
// Core indexer logic used by both the CLI script and the Electron IPC handler.
// Exports: indexMedia(folder, onProgress) → Promise<{ total, newFiles }>

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const SUPABASE_URL = 'https://vmosexwnmnddabmmnidy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtb3NleHdubW5kZGFibW1uaWR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA2MzA0MSwiZXhwIjoyMDg3NjM5MDQxfQ.3Yr1DEOvPNHRJuJOV7_ADDhsf0nYSFRWHnou-D2ajKI';

const PHOTO_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.tif', '.tiff', '.raw', '.cr2', '.nef', '.arw', '.dng']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.m4v', '.mts', '.m2ts', '.wmv', '.3gp']);

function parseDate(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  let m = base.match(/(\d{4})[_.\-](\d{2})[_.\-](\d{2})/);
  if (m && validDate(m[1], m[2], m[3])) return { date: `${m[1]}-${m[2]}-${m[3]}`, source: 'filename' };
  m = base.match(/(20[12]\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/);
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, source: 'filename' };
  try {
    const mtime = fs.statSync(filePath).mtime;
    const y = mtime.getFullYear(), mo = String(mtime.getMonth() + 1).padStart(2, '0'), d = String(mtime.getDate()).padStart(2, '0');
    return { date: `${y}-${mo}-${d}`, source: 'file_mtime' };
  } catch (_) { return null; }
}

function validDate(y, mo, d) {
  return parseInt(y) >= 2010 && parseInt(y) <= 2035 && parseInt(mo) >= 1 && parseInt(mo) <= 12 && parseInt(d) >= 1 && parseInt(d) <= 31;
}

function walkDir(dir, results = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return results; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDir(full, results);
    else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (PHOTO_EXTS.has(ext) || VIDEO_EXTS.has(ext)) results.push(full);
    }
  }
  return results;
}

function supabaseInsert(records) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(records);
    const options = {
      hostname: 'vmosexwnmnddabmmnidy.supabase.co',
      path: '/rest/v1/media_assets?on_conflict=local_path',
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Prefer': 'resolution=ignore-duplicates,return=representation'
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve({ inserted: JSON.parse(data).length }); }
          catch (_) { resolve({ inserted: 0 }); }
        } else {
          reject(new Error(`Supabase insert error ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function indexMedia(folder, onProgress) {
  const rootDir = path.resolve(folder);
  if (!fs.existsSync(rootDir)) throw new Error(`Folder not found: ${rootDir}`);

  const files = walkDir(rootDir);
  const total = files.length;
  if (!total) return { total: 0, newFiles: 0 };

  const records = files.map(filePath => {
    let size = 0;
    try { size = fs.statSync(filePath).size; } catch (_) {}
    const ext      = path.extname(filePath).toLowerCase();
    const fileType = PHOTO_EXTS.has(ext) ? 'photo' : 'video';
    const parsed   = parseDate(filePath);
    return {
      filename:          path.basename(filePath),
      local_path:        filePath,
      file_type:         fileType,
      size_bytes:        size,
      captured_date:     parsed ? parsed.date : null,
      date_parse_source: parsed ? parsed.source : 'unparsed'
    };
  });

  const BATCH = 100;
  let sent = 0;
  let newFiles = 0;
  for (let i = 0; i < records.length; i += BATCH) {
    const chunk = records.slice(i, i + BATCH);
    const { inserted } = await supabaseInsert(chunk);
    sent += chunk.length;
    newFiles += inserted;
    if (onProgress) onProgress({ done: Math.min(sent, total), total });
  }

  return { total, newFiles };
}

module.exports = indexMedia;
