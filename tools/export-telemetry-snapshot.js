const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;
const DEFAULT_REFRESH_SECONDS = 15;
const DEFAULT_INPUT_PATH = path.join(__dirname, 'telemetry-snapshot.sample.json');
const DEFAULT_OUTPUT_PATH = path.join(__dirname, 'telemetry-snapshot.output.json');

const STATE_LABELS = {
  healthy: 'Healthy',
  standby: 'Standby',
  warning: 'Warning',
  degraded: 'Degraded',
  stale: 'Stale',
  offline: 'Offline',
  unavailable: 'Unavailable',
  unknown: 'Unknown',
  critical: 'Critical',
  info: 'Info'
};

const CHIP_STATE_MAP = {
  healthy: 'nominal',
  online: 'nominal',
  nominal: 'nominal',
  standby: 'standby',
  warning: 'warning',
  degraded: 'warning',
  stale: 'stale',
  offline: 'critical',
  unavailable: 'critical',
  critical: 'critical',
  unknown: 'info',
  info: 'info'
};

function usage() {
  console.log([
    'Usage:',
    '  node tools/export-telemetry-snapshot.js [--input <json>] [--output <json>] [--refresh <seconds>]',
    '',
    'Defaults:',
    '  --input  tools/telemetry-snapshot.sample.json',
    '  --output tools/telemetry-snapshot.output.json',
    '',
    'Environment:',
    '  MINIBIOTA_TELEMETRY_SNAPSHOT_PATH can be used as the default output path.'
  ].join('\n'));
}

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT_PATH,
    output: process.env.MINIBIOTA_TELEMETRY_SNAPSHOT_PATH || DEFAULT_OUTPUT_PATH,
    refresh: DEFAULT_REFRESH_SECONDS
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if ((arg === '--input' || arg === '-i') && argv[i + 1]) {
      options.input = argv[i + 1];
      i += 1;
      continue;
    }
    if ((arg === '--output' || arg === '-o') && argv[i + 1]) {
      options.output = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--refresh' && argv[i + 1]) {
      options.refresh = Number.parseInt(argv[i + 1], 10) || DEFAULT_REFRESH_SECONDS;
      i += 1;
      continue;
    }
    throw new Error('Unknown argument: ' + arg);
  }

  return options;
}

function resolvePath(targetPath) {
  if (!targetPath) {
    return null;
  }
  return path.isAbsolute(targetPath) ? targetPath : path.resolve(process.cwd(), targetPath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function cleanText(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const cleaned = String(value).trim();
  return cleaned || null;
}

function cleanFloat(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanIso(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value).trim() || null;
}

function normalizeState(value, fallback = 'unknown') {
  const normalized = (cleanText(value) || fallback).toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-');
  if (normalized === 'online' || normalized === 'nominal') {
    return 'healthy';
  }
  if (Object.prototype.hasOwnProperty.call(CHIP_STATE_MAP, normalized)) {
    return normalized;
  }
  if (normalized === 'healthy' || normalized === 'unknown') {
    return normalized;
  }
  return fallback;
}

function chipState(value, fallback = 'info') {
  const normalized = normalizeState(value, 'unknown');
  return CHIP_STATE_MAP[normalized] || fallback;
}

function stateLabel(value, fallback = 'Unknown') {
  const normalized = normalizeState(value, 'unknown');
  return STATE_LABELS[normalized] || fallback;
}

function normalizeEntity(raw, defaults) {
  const payload = raw && typeof raw === 'object' ? raw : {};
  const state = normalizeState(payload.state || payload.status, defaults.state);
  return {
    state,
    chip_state: cleanText(payload.chip_state) || chipState(payload.tone || state),
    status_label: cleanText(payload.status_label) || stateLabel(state),
    label: cleanText(payload.label) || defaults.label,
    detail: cleanText(payload.detail) || defaults.detail,
    last_seen: cleanIso(payload.last_seen),
    temperature_c: cleanFloat(payload.temperature_c),
    humidity_pct: cleanFloat(payload.humidity_pct),
    target_temperature_c: cleanFloat(payload.target_temperature_c)
  };
}

function normalizeNodes(rawNodes) {
  if (!Array.isArray(rawNodes)) {
    return [];
  }

  return rawNodes.map((raw, index) => {
    const payload = raw && typeof raw === 'object' ? raw : {};
    const entity = normalizeEntity(payload, {
      state: 'unknown',
      label: 'Node status unavailable',
      detail: 'This node has not published a telemetry heartbeat yet.'
    });

    return {
      id: cleanText(payload.id) || 'node-' + (index + 1),
      name: cleanText(payload.name) || 'Telemetry Node ' + (index + 1),
      role: cleanText(payload.role) || 'Telemetry Node',
      state: entity.state,
      chip_state: entity.chip_state,
      status_label: entity.status_label,
      label: entity.label,
      detail: entity.detail,
      last_seen: entity.last_seen,
      temperature_c: entity.temperature_c,
      humidity_pct: entity.humidity_pct,
      target_temperature_c: entity.target_temperature_c
    };
  });
}

function deriveSummary(coordinator, upstream, nodes) {
  const tones = [coordinator.chip_state, upstream.chip_state].concat(nodes.map((node) => node.chip_state));

  if (tones.includes('critical')) {
    return {
      chip_state: 'critical',
      status_label: 'Critical',
      label: 'Telemetry source needs attention',
      detail: 'At least one core telemetry dependency is offline or unavailable.'
    };
  }

  if (tones.includes('warning')) {
    return {
      chip_state: 'warning',
      status_label: 'Warning',
      label: 'Telemetry is partially degraded',
      detail: 'The desktop app can export a snapshot, but one or more telemetry surfaces are degraded.'
    };
  }

  if (tones.includes('stale')) {
    return {
      chip_state: 'stale',
      status_label: 'Stale',
      label: 'Telemetry heartbeat is stale',
      detail: 'The export succeeded, but some readings should be treated as cached.'
    };
  }

  if (nodes.length && nodes.every((node) => node.chip_state === 'nominal') && coordinator.chip_state === 'nominal') {
    return {
      chip_state: 'nominal',
      status_label: 'Healthy',
      label: 'Telemetry surface is healthy',
      detail: 'Coordinator and node heartbeats are present in the desktop app export.'
    };
  }

  return {
    chip_state: 'info',
    status_label: 'Info',
    label: 'Snapshot exported',
    detail: 'The desktop app wrote a snapshot file for the website to consume.'
  };
}

function buildSnapshot(rawPayload, refreshSeconds) {
  const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
  const sourcePayload = payload.source && typeof payload.source === 'object' ? payload.source : {};

  const coordinator = normalizeEntity(payload.coordinator, {
    state: 'unknown',
    label: 'Coordinator status unavailable',
    detail: 'The desktop app export did not include coordinator health details.'
  });
  const upstream = normalizeEntity(payload.upstream, {
    state: 'unknown',
    label: 'Upstream status unavailable',
    detail: 'The desktop app export did not include internet-upstream health details.'
  });
  const setpointChannel = normalizeEntity(payload.setpoint_channel, {
    state: 'standby',
    label: 'Setpoint channel status unavailable',
    detail: 'The desktop app export did not include target-temperature/setpoint details yet.'
  });
  const nodes = normalizeNodes(payload.nodes);
  const summary = payload.summary && typeof payload.summary === 'object'
    ? {
        chip_state: cleanText(payload.summary.chip_state) || chipState(payload.summary.status || 'info'),
        status_label: cleanText(payload.summary.status_label) || stateLabel(payload.summary.status || 'info'),
        label: cleanText(payload.summary.label) || deriveSummary(coordinator, upstream, nodes).label,
        detail: cleanText(payload.summary.detail) || deriveSummary(coordinator, upstream, nodes).detail
      }
    : deriveSummary(coordinator, upstream, nodes);

  return {
    schema_version: Number.parseInt(payload.schema_version, 10) || SCHEMA_VERSION,
    generated_at: cleanIso(payload.generated_at) || new Date().toISOString(),
    refresh_interval_seconds: Number.isFinite(refreshSeconds) ? Math.max(5, refreshSeconds) : DEFAULT_REFRESH_SECONDS,
    source: {
      kind: cleanText(sourcePayload.kind) || 'desktop_app_export',
      label: cleanText(sourcePayload.label) || 'Desktop app telemetry snapshot',
      detail: cleanText(sourcePayload.detail) || 'Read-only telemetry snapshot exported by miniBIOTA_App for the website live-monitoring contract.'
    },
    summary,
    coordinator,
    upstream,
    setpoint_channel: setpointChannel,
    nodes
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  const inputPath = resolvePath(options.input);
  const outputPath = resolvePath(options.output);

  if (!inputPath || !fs.existsSync(inputPath)) {
    throw new Error('Input JSON not found: ' + inputPath);
  }
  if (!outputPath) {
    throw new Error('No output path provided.');
  }

  let rawPayload = readJson(inputPath);
  if (rawPayload && typeof rawPayload === 'object' && rawPayload.data && typeof rawPayload.data === 'object') {
    rawPayload = rawPayload.data;
  }

  const snapshot = buildSnapshot(rawPayload, options.refresh);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');

  console.log('Telemetry snapshot written to: ' + outputPath);
  console.log('Set MINIBIOTA_TELEMETRY_SNAPSHOT_PATH=' + outputPath + ' for the Flask website to consume it.');
}

try {
  main();
} catch (error) {
  console.error('Telemetry snapshot export failed:', error.message);
  process.exitCode = 1;
}
