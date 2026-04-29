const crypto = require('crypto');
const path = require('path');
const sharp = require('sharp');
const { SUPABASE_URL, SUPABASE_KEY } = require('../js/config');

const ALLOWED_BUCKETS = new Set(['images', 'chronicles-images']);
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_INPUT_PIXELS = 80_000_000;
const DEFAULT_MAX_DIMENSION = 1600;
const DEFAULT_QUALITY = 82;

function normalizeFilename(filename) {
  const base = path.posix.basename(String(filename || 'image.webp'));
  const stem = base
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'image';
  return `${stem}.webp`;
}

function toBuffer(arrayBuffer) {
  if (!arrayBuffer) throw new Error('No image data was provided.');
  if (Buffer.isBuffer(arrayBuffer)) return arrayBuffer;
  return Buffer.from(arrayBuffer);
}

async function convertToWebP(input, options = {}) {
  const maxDimension = options.maxDimension || DEFAULT_MAX_DIMENSION;
  const quality = options.quality || DEFAULT_QUALITY;

  const image = sharp(input, {
    failOn: 'error',
    limitInputPixels: MAX_INPUT_PIXELS
  }).rotate();

  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('Could not read image dimensions.');
  }

  const webp = await image
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: 'inside',
      withoutEnlargement: true
    })
    .webp({
      quality,
      effort: 5,
      smartSubsample: true
    })
    .toBuffer();

  if (!webp.length) throw new Error('WebP conversion produced an empty file.');

  return {
    buffer: webp,
    metadata: {
      originalFormat: metadata.format || null,
      originalWidth: metadata.width,
      originalHeight: metadata.height,
      originalBytes: input.length,
      webpBytes: webp.length,
      compressionRatio: Number((webp.length / input.length).toFixed(4))
    }
  };
}

async function uploadToSupabaseStorage(bucket, filename, buffer) {
  const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${encodeURIComponent(filename)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'x-upsert': 'true'
    },
    body: buffer
  });

  if (!response.ok) {
    let detail = '';
    try { detail = await response.text(); } catch {}
    throw new Error(`Supabase Storage upload failed (${response.status}): ${detail || response.statusText}`);
  }
}

async function processAndUploadImage(payload) {
  const bucket = payload?.bucket;
  if (!ALLOWED_BUCKETS.has(bucket)) throw new Error(`Unsupported storage bucket: ${bucket}`);

  const input = toBuffer(payload?.arrayBuffer);
  if (!input.length) throw new Error('Image file is empty.');
  if (input.length > MAX_UPLOAD_BYTES) {
    throw new Error(`Image is too large. Maximum upload size is ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`);
  }

  const filename = normalizeFilename(payload.filename || payload.originalName);
  const { buffer, metadata } = await convertToWebP(input, payload.options);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');

  await uploadToSupabaseStorage(bucket, filename, buffer);

  return {
    ok: true,
    bucket,
    filename,
    publicUrl: `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${encodeURIComponent(filename)}`,
    hash,
    ...metadata
  };
}

module.exports = {
  processAndUploadImage,
  convertToWebP
};
