#!/usr/bin/env node
// tools/index-media.js
//
// Walks a folder recursively, parses captured_date from each filename,
// and upserts records into the media_assets Supabase table.
// Existing paths are silently skipped (unique constraint on local_path).
//
// Usage:
//   node tools/index-media.js "D:\path\to\media"
//   node tools/index-media.js "D:\path\to\media" --dry-run

const fs   = require('fs');
const path = require('path');
const https = require('https');

const SUPABASE_URL = 'https://vmosexwnmnddabmmnidy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtb3NleHdubW5kZGFibW1uaWR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA2MzA0MSwiZXhwIjoyMDg3NjM5MDQxfQ.3Yr1DEOvPNHRJuJOV7_ADDhsf0nYSFRWHnou-D2ajKI';

const PHOTO_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.tif', '.tiff', '.raw', '.cr2', '.nef', '.arw', '.dng']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.m4v', '.mts', '.m2ts', '.wmv', '.3gp']);

// --- Date parsing -----------------------------------------------------------

function parseDate(filePath) {
  const base = path.basename(filePath, path.extname(filePath));

  // Pattern 1: YYYY-MM-DD  or  YYYY_MM_DD  or  YYYY.MM.DD
  let m = base.match(/(\d{4})[_.\-](\d{2})[_.\-](\d{2})/);
  if (m && validDate(m[1], m[2], m[3])) {
    return { date: `${m[1]}-${m[2]}-${m[3]}`, source: 'filename' };
  }

  // Pattern 2: YYYYMMDD (8 consecutive digits, year 2010-2035)
  m = base.match(/(20[12]\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/);
  if (m) {
    return { date: `${m[1]}-${m[2]}-${m[3]}`, source: 'filename' };
  }

  // Fallback: file modification time
  try {
    const mtime = fs.statSync(filePath).mtime;
    const y  = mtime.getFullYear();
    const mo = String(mtime.getMonth() + 1).padStart(2, '0');
    const d  = String(mtime.getDate()).padStart(2, '0');
    return { date: `${y}-${mo}-${d}`, source: 'file_mtime' };
  } catch (_) {
    return null;
  }
}

function validDate(y, mo, d) {
  const year = parseInt(y), month = parseInt(mo), day = parseInt(d);
  return year >= 2010 && year <= 2035
      && month >= 1 && month <= 12
      && day >= 1 && day <= 31;
}

// --- Filesystem walk --------------------------------------------------------

function walkDir(dir, results = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (e) { console.warn(`  Skipping (no access): ${dir}`); return results; }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, results);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (PHOTO_EXTS.has(ext) || VIDEO_EXTS.has(ext)) results.push(full);
    }
  }
  return results;
}

// --- Supabase insert --------------------------------------------------------

function supabaseInsert(records) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(records);
    const options = {
      hostname: 'vmosexwnmnddabmmnidy.supabase.co',
      path: '/rest/v1/media_assets',
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Prefer': 'resolution=ignore-duplicates,return=minimal'
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// --- Main -------------------------------------------------------------------

async function main() {
  const args    = process.argv.slice(2);
  const dryRun  = args.includes('--dry-run');
  const folder  = args.find(a => !a.startsWith('--'));

  if (!folder) {
    console.error('Usage: node tools/index-media.js "D:\\path\\to\\media" [--dry-run]');
    process.exit(1);
  }

  const rootDir = path.resolve(folder);
  if (!fs.existsSync(rootDir)) {
    console.error(`Folder not found: ${rootDir}`);
    process.exit(1);
  }

  console.log(`Scanning: ${rootDir}`);
  const files = walkDir(rootDir);
  console.log(`Found ${files.length} media files\n`);

  if (files.length === 0) {
    console.log('Nothing to index.');
    return;
  }

  const records     = [];
  const mtimeFalls  = [];  // parsed from mtime, not filename

  for (const filePath of files) {
    let size = 0;
    try { size = fs.statSync(filePath).size; } catch (_) {}

    const ext      = path.extname(filePath).toLowerCase();
    const fileType = PHOTO_EXTS.has(ext) ? 'photo' : 'video';
    const parsed   = parseDate(filePath);

    const record = {
      filename:          path.basename(filePath),
      local_path:        filePath,
      file_type:         fileType,
      size_bytes:        size,
      captured_date:     parsed ? parsed.date : null,
      date_parse_source: parsed ? parsed.source : 'unparsed'
    };

    records.push(record);
    if (parsed && parsed.source === 'file_mtime') mtimeFalls.push(filePath);
  }

  const noDates   = records.filter(r => !r.captured_date);
  const fromName  = records.length - mtimeFalls.length - noDates.length;

  console.log(`  From filename : ${fromName}`);
  console.log(`  From mtime    : ${mtimeFalls.length}  (flag to review)`);
  console.log(`  Unparsed      : ${noDates.length}`);
  console.log();

  if (dryRun) {
    console.log('--- DRY RUN: sample records (first 5) ---');
    records.slice(0, 5).forEach(r => console.log(JSON.stringify(r, null, 2)));
    if (mtimeFalls.length > 0) {
      console.log('\n--- Mtime fallback files (first 5) ---');
      mtimeFalls.slice(0, 5).forEach(f => console.log(f));
    }
    console.log('\nRe-run without --dry-run to insert into Supabase.');
    return;
  }

  // Batch insert in chunks of 100
  const BATCH   = 100;
  let   sent    = 0;
  let   errored = 0;

  for (let i = 0; i < records.length; i += BATCH) {
    const chunk = records.slice(i, i + BATCH);
    const res   = await supabaseInsert(chunk);

    if (res.status === 201 || res.status === 200) {
      sent += chunk.length;
    } else {
      errored += chunk.length;
      console.error(`\nBatch ${i}–${i + BATCH} error (HTTP ${res.status}): ${res.body}`);
    }

    const done = Math.min(i + BATCH, records.length);
    process.stdout.write(`\rProgress: ${done} / ${records.length}`);
  }

  console.log(`\n\nDone.`);
  console.log(`  Sent to Supabase : ${sent}  (duplicates auto-skipped)`);
  if (errored) console.log(`  Errors           : ${errored}`);

  // Write review logs
  const toolsDir = path.join(__dirname);

  if (mtimeFalls.length > 0) {
    const logPath = path.join(toolsDir, 'review-mtime-dates.txt');
    fs.writeFileSync(logPath, mtimeFalls.join('\n') + '\n');
    console.log(`\n  Mtime-date review list → ${logPath}`);
    console.log('  Open these in the dashboard and confirm or correct the captured_date.');
  }

  if (noDates.length > 0) {
    const logPath = path.join(toolsDir, 'review-no-dates.txt');
    fs.writeFileSync(logPath, noDates.map(r => r.local_path).join('\n') + '\n');
    console.log(`\n  No-date review list → ${logPath}`);
    console.log('  These have captured_date=NULL and need manual entry.');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
