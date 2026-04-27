// tools/indexer-core.js
// Exports: indexMedia(folder, onProgress) → Promise<{ total, newFiles, removed }>

const fs    = require('fs');
const path  = require('path');
const https = require('https');

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

function supabaseReq(method, urlPath, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'vmosexwnmnddabmmnidy.supabase.co',
      path: urlPath,
      method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        ...extraHeaders,
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(data ? JSON.parse(data) : []); }
          catch (_) { resolve([]); }
        } else {
          reject(new Error(`Supabase error ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function supabaseInsert(records) {
  const result = await supabaseReq(
    'POST',
    '/rest/v1/media_assets?on_conflict=local_path',
    records,
    { 'Prefer': 'resolution=ignore-duplicates,return=representation' }
  );
  return Array.isArray(result) ? result.length : 0;
}

async function fetchFolderRecords(folder) {
  // Fetch all DB records and filter client-side — avoids LIKE/backslash escape issues
  const prefix = (folder.endsWith('\\') ? folder : folder + '\\').toLowerCase();
  const results = [];
  let offset = 0;
  while (true) {
    const rows = await supabaseReq('GET',
      `/rest/v1/media_assets?select=id,local_path&limit=1000&offset=${offset}`
    );
    for (const r of rows) {
      if (r.local_path && r.local_path.toLowerCase().startsWith(prefix)) results.push(r);
    }
    if (rows.length < 1000) break;
    offset += 1000;
  }
  return results;
}

async function deleteByIds(ids) {
  const BATCH = 100;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    await supabaseReq('DELETE',
      `/rest/v1/media_assets?id=in.(${chunk.join(',')})`,
      null,
      { 'Prefer': 'return=minimal' }
    );
  }
}

async function indexMedia(folder, onProgress) {
  const rootDir = path.resolve(folder);
  if (!fs.existsSync(rootDir)) throw new Error(`Folder not found: ${rootDir}`);

  const files = walkDir(rootDir);
  const filesOnDisk = new Set(files);
  const total = files.length;

  // Remove DB records for files that no longer exist on disk
  const filesOnDiskLower = new Set([...filesOnDisk].map(p => p.toLowerCase()));
  const dbRecords = await fetchFolderRecords(rootDir);
  const orphanIds = dbRecords.filter(r => !filesOnDiskLower.has(r.local_path.toLowerCase())).map(r => r.id);
  if (orphanIds.length) await deleteByIds(orphanIds);
  const removed = orphanIds.length;

  if (!total) return { total: 0, newFiles: 0, removed };

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
    newFiles += await supabaseInsert(chunk);
    sent += chunk.length;
    if (onProgress) onProgress({ done: Math.min(sent, total), total });
  }

  return { total, newFiles, removed };
}

module.exports = indexMedia;
