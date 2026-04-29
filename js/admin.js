// ════════════════════════════════════════════════════════
//  SITE ADMIN
// ════════════════════════════════════════════════════════

let admCurrentSection = 'species';
let admSpeciesList    = [];
let admBiomesList     = [];
let admChroniclesList = [];
let admLoaded         = false;
let admEditingSpeciesId  = null;
let admEditingBiomeId    = null;
let admEditingChronicleId = null;
let admImgSpeciesId      = null;
let admImgSpeciesSlug    = null;
let admBiosphereId       = null;

let admFilterRealm  = null;
let admFilterBiome  = null;
let admFilterType   = null;
let admFilterStatus = null;
let _lastImageError = '';

// ── Utilities ──────────────────────────────────────────

function admStorageUrl(bucket, filename) {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${filename}`;
}

async function admUploadToStorage(bucket, filename, file) {
  _lastImageError = '';
  if (!window.electronAPI?.uploadImageWebP) {
    _lastImageError = 'backend image processor unavailable';
    admStatus('Backend image processor is unavailable.', 'err', 8000);
    return null;
  }

  admStatus('Converting image to WebP and uploading...', 'ok', 30000);
  const result = await window.electronAPI.uploadImageWebP({
    bucket,
    filename,
    originalName: file.name,
    mimeType: file.type,
    size: file.size,
    arrayBuffer: await file.arrayBuffer(),
    options: { maxDimension: 1600, quality: 82 }
  });

  if (!result.ok) {
    _lastImageError = result.error || 'unknown error';
    console.error('Image upload failed:', result.error);
    admStatus(`Image upload failed: ${result.error}`, 'err', 10000);
    return null;
  }

  const kbBefore = Math.round(result.originalBytes / 1024);
  const kbAfter = Math.round(result.webpBytes / 1024);
  admStatus(`Image converted to WebP and uploaded (${kbBefore} KB -> ${kbAfter} KB).`, 'ok');
  return result.filename;
}

async function admDeleteFromStorage(bucket, filename) {
  await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, {
    method: 'DELETE',
    headers: { ...HEADERS },
    body: JSON.stringify({ prefixes: [filename] })
  });
}

function admFmt(iso) {
  if (!iso) return '—';
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function admStatus(msg, type = 'ok', duration = 4000) {
  const el = document.getElementById('admin-status');
  el.textContent = msg;
  el.className = 'admin-status ' + type;
  setTimeout(() => { el.className = 'admin-status'; }, duration);
}

function admVal(id) {
  const el = document.getElementById(id);
  if (!el) return '';
  return el.value.trim();
}

function admSet(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = (val === null || val === undefined) ? '' : val;
}

// ── Section switching ──────────────────────────────────

function showAdminSection(section) {
  admCurrentSection = section;
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.admin-subnav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('admin-sec-' + section).classList.add('active');
  document.getElementById('adm-btn-' + section).classList.add('active');
  if (!admLoaded) { admLoadAll(); admLoaded = true; }
  else {
    if (section === 'species')       admLoadSpecies();
    if (section === 'biosphere')     admLoadBiosphere();
    if (section === 'biomes')        admLoadBiomes();
    if (section === 'chronicles')    admLoadChronicles();
    if (section === 'announcements') admLoadAnnouncements();
    if (section === 'staging')       admLoadStaging();
    if (section === 'media')         admLoadMedia();
  }
}

async function admLoadAll() {
  // Species and biomes must finish first so chronicle/species selects can be populated
  await Promise.all([admLoadSpecies(), admLoadBiomes()]);
  admPopulateBiomeCheckboxes();
  admPopulateChronicleSelects();
  // Load remaining in parallel after lookup data is ready
  await Promise.all([
    admLoadBiosphere(),
    admLoadChronicles(),
    admLoadAnnouncements(),
    admLoadStaging()
  ]);
}

// ── Species ────────────────────────────────────────────

async function admLoadSpecies() {
  const data = await api('species?select=*&order=common_name.asc');
  admSpeciesList = data;
  admRenderSpeciesTable();
  admPopulateBiomeCheckboxes();
  admPopulateChronicleSelects();
  admRenderAllChips();
}

function admRenderChips(containerId, options, activeValue) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  const filterKey = containerId.replace('adm-', '').replace('-chips', '');
  const mkBtn = (label, val) => {
    const isActive = val === activeValue;
    const valAttr = val === null ? 'null' : `'${val}'`;
    return `<button class="adm-chip${isActive ? ' active' : ''}" onclick="admSetFilter('${filterKey}',${valAttr})">${escHtml(label)}</button>`;
  };
  wrap.innerHTML = mkBtn('All', null) + options.map(o => mkBtn(o, o)).join('');
}

function admSetFilter(key, value) {
  if (key === 'realm')  admFilterRealm  = value;
  if (key === 'biome')  admFilterBiome  = value;
  if (key === 'type')   admFilterType   = value;
  if (key === 'status') admFilterStatus = value;
  admRenderAllChips();
  admFilterSpecies();
}

function admRenderAllChips() {
  admRenderChips('adm-realm-chips',
    ['Freshwater', 'Saltwater', 'Terrestrial', 'Brackish'],
    admFilterRealm);
  admRenderChips('adm-biome-chips',
    admBiomesList.map(b => b.public_name || b.name).filter(Boolean),
    admFilterBiome);
  admRenderChips('adm-type-chips',
    ['Producer', 'Primary Consumer', 'Secondary Consumer', 'Detritivore', 'Scavenger'],
    admFilterType);
  admRenderChips('adm-status-chips',
    ['Thriving', 'Established', 'Vulnerable', 'Uncertain', 'Extirpated', 'Removed'],
    admFilterStatus);
}

function admFilterSpecies() {
  const q = (document.getElementById('adm-species-search')?.value || '').toLowerCase().trim();
  let list = admSpeciesList;

  if (q) {
    list = list.filter(s =>
      (s.common_name     || '').toLowerCase().includes(q) ||
      (s.scientific_name || '').toLowerCase().includes(q) ||
      (s.alternate_names || '').toLowerCase().includes(q)
    );
  }
  if (admFilterRealm)  list = list.filter(s => (s.realm             || '') === admFilterRealm);
  if (admFilterBiome)  list = list.filter(s => (s.main_biome        || '').includes(admFilterBiome));
  if (admFilterType)   list = list.filter(s => (s.trophic_level     || '') === admFilterType);
  if (admFilterStatus) list = list.filter(s => (s.population_status || '') === admFilterStatus);

  const anyActive = q || admFilterRealm || admFilterBiome || admFilterType || admFilterStatus;
  admRenderSpeciesTable(anyActive ? list : undefined);
}

function admRenderSpeciesTable(list) {
  const rows = list !== undefined ? list : admSpeciesList;
  const tbody = document.getElementById('adm-species-tbody');
  const countEl = document.getElementById('adm-species-search-count');
  if (countEl) {
    if (list !== undefined) {
      countEl.textContent = `${rows.length} of ${admSpeciesList.length}`;
      countEl.style.display = '';
    } else {
      countEl.style.display = 'none';
    }
  }
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="no-data">No species match the current filters.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(s => {
    const isRemoved = ['Extirpated', 'Removed'].includes(s.population_status);
    return `<tr style="${isRemoved ? 'opacity:0.5' : ''}">
      <td>${escHtml(s.common_name || '—')}</td>
      <td><em>${escHtml(s.scientific_name || '—')}</em></td>
      <td><span class="adm-tag">${escHtml(s.realm || '—')}</span></td>
      <td>${escHtml(s.display_status || '—')}</td>
      <td>${escHtml(s.population_status || '—')}</td>
      <td>${admFmt(s.date_last_observed)}</td>
      <td style="white-space:nowrap;display:flex;flex-wrap:wrap;gap:4px">
        <button class="adm-btn" onclick="admEditSpecies(${s.id})">Edit</button>
        <button class="adm-btn warn" onclick="admMarkObservedToday(${s.id})">Observed Today</button>
        <button class="adm-btn" onclick="admShowImages(${s.id},'${escHtml(s.slug || '')}','${escHtml(s.common_name || s.scientific_name || '')}')">Images</button>
        <button class="adm-btn danger" onclick="admDeleteSpecies(${s.id})">Delete</button>
      </td>
    </tr>`;
  }).join('');
}

function admPopulateBiomeCheckboxes() {
  const wrap = document.getElementById('sp-biome-checkboxes');
  if (!wrap) return;
  wrap.innerHTML = admBiomesList.map(b => {
    const name = b.public_name || b.name || '';
    return `<label class="adm-checkbox-item"><input type="checkbox" name="sp-main_biome" value="${escHtml(name)}"><span>${escHtml(name)}</span></label>`;
  }).join('');
}

function admGetCheckedBiomes() {
  return [...document.querySelectorAll('input[name="sp-main_biome"]:checked')].map(c => c.value).join(', ');
}

function admSetCheckedBiomes(val) {
  const names = (val || '').split(',').map(v => v.trim());
  document.querySelectorAll('input[name="sp-main_biome"]').forEach(cb => {
    cb.checked = names.includes(cb.value);
  });
}

async function admEditSpecies(id) {
  const s = admSpeciesList.find(x => x.id === id);
  if (!s) return;
  admEditingSpeciesId = id;
  const fields = [
    'common_name','scientific_name','realm','display_status','species_description','alternate_names',
    'introduction_method','date_first_introduced','source_origin','identity_origin_notes',
    'current_estimated_population','population_status','carrying_capacity_status',
    'date_last_observed','population_dynamics_notes','trophic_level','feeding_method',
    'dietary_inputs','known_predators','trophic_ecology_notes','temperature_range',
    'ph_range','lighting_requirements','flow_aeration_preference','environmental_tolerances_notes',
    'expected_lifespan','reproductive_strategy','system_reproduction_status','growth_rate',
    'life_cycle_reproduction_notes','ecological_role','microhabitat_preference',
    'symbiotic_relationships','ecological_role_symbiosis_notes'
  ];
  fields.forEach(f => admSet('sp-' + f, s[f]));
  admSetCheckedBiomes(s.main_biome);
  document.getElementById('adm-sp-form-title').textContent = `Editing: ${s.common_name || s.scientific_name}`;
  document.getElementById('adm-sp-submit-btn').textContent = 'Update Species';
  document.getElementById('adm-sp-cancel-btn').style.display = '';
  document.getElementById('adm-sp-form').scrollIntoView({ behavior: 'smooth' });
  // Load existing images into the inline preview
  const imgs = await api(`species_images?species_id=eq.${id}&order=is_primary.desc,id.asc`);
  const preview = document.getElementById('adm-sp-images-preview');
  if (!preview) return;
  if (!imgs.length) {
    preview.innerHTML = '<div style="font-size:11px;color:#3a4a5a;margin-top:4px">No images yet — upload one above.</div>';
    return;
  }
  const thumbs = imgs.map(img => `
    <div style="position:relative;display:inline-block">
      <img src="${admStorageUrl('images', img.filename)}"
           style="width:64px;height:64px;object-fit:cover;border-radius:4px;border:1px solid ${img.is_primary ? '#2a5a3a' : '#1a2a3a'}"
           title="${escHtml(img.filename)}">
      ${img.is_primary ? '<div style="position:absolute;bottom:0;left:0;right:0;text-align:center;font-size:9px;color:#60aa80;background:rgba(0,10,0,0.75);padding:2px 0;border-radius:0 0 4px 4px">★ primary</div>' : ''}
    </div>`).join('');
  preview.innerHTML = `
    <div style="margin-top:8px">
      <div style="font-size:11px;color:#4a5a6a;margin-bottom:6px">${imgs.length} image${imgs.length !== 1 ? 's' : ''} saved</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:flex-start">
        ${thumbs}
        <button type="button" class="adm-btn" style="font-size:11px;height:64px"
          onclick="admShowImages(${id},'${escHtml(s.slug || '')}','${escHtml(s.common_name || s.scientific_name || '')}')">
          Manage →
        </button>
      </div>
    </div>`;
}

function admClearSpeciesForm() {
  admEditingSpeciesId = null;
  document.getElementById('adm-sp-form').reset();
  const preview = document.getElementById('adm-sp-images-preview');
  if (preview) preview.innerHTML = '';
  document.getElementById('adm-sp-form-title').textContent = 'Add New Species';
  document.getElementById('adm-sp-submit-btn').textContent = 'Add Species';
  document.getElementById('adm-sp-cancel-btn').style.display = 'none';
}

async function admSubmitSpecies(e) {
  e.preventDefault();
  const payload = {
    common_name: admVal('sp-common_name'),
    scientific_name: admVal('sp-scientific_name') || null,
    realm: admVal('sp-realm'),
    display_status: admVal('sp-display_status') || 'active',
    main_biome: admGetCheckedBiomes() || null,
    species_description: admVal('sp-species_description') || null,
    alternate_names: admVal('sp-alternate_names') || null,
    introduction_method: admVal('sp-introduction_method') || null,
    date_first_introduced: admVal('sp-date_first_introduced') || null,
    source_origin: admVal('sp-source_origin') || null,
    identity_origin_notes: admVal('sp-identity_origin_notes') || null,
    current_estimated_population: admVal('sp-current_estimated_population') || null,
    population_status: admVal('sp-population_status') || null,
    carrying_capacity_status: admVal('sp-carrying_capacity_status') || null,
    date_last_observed: admVal('sp-date_last_observed') || null,
    population_dynamics_notes: admVal('sp-population_dynamics_notes') || null,
    trophic_level: admVal('sp-trophic_level') || null,
    feeding_method: admVal('sp-feeding_method') || null,
    dietary_inputs: admVal('sp-dietary_inputs') || null,
    known_predators: admVal('sp-known_predators') || null,
    trophic_ecology_notes: admVal('sp-trophic_ecology_notes') || null,
    temperature_range: admVal('sp-temperature_range') || null,
    ph_range: admVal('sp-ph_range') || null,
    lighting_requirements: admVal('sp-lighting_requirements') || null,
    flow_aeration_preference: admVal('sp-flow_aeration_preference') || null,
    environmental_tolerances_notes: admVal('sp-environmental_tolerances_notes') || null,
    expected_lifespan: admVal('sp-expected_lifespan') || null,
    reproductive_strategy: admVal('sp-reproductive_strategy') || null,
    system_reproduction_status: admVal('sp-system_reproduction_status') || null,
    growth_rate: admVal('sp-growth_rate') || null,
    life_cycle_reproduction_notes: admVal('sp-life_cycle_reproduction_notes') || null,
    ecological_role: admVal('sp-ecological_role') || null,
    microhabitat_preference: admVal('sp-microhabitat_preference') || null,
    symbiotic_relationships: admVal('sp-symbiotic_relationships') || null,
    ecological_role_symbiosis_notes: admVal('sp-ecological_role_symbiosis_notes') || null
  };

  let ok, resp;
  if (admEditingSpeciesId) {
    resp = await fetch(`${SUPABASE_URL}/rest/v1/species?id=eq.${admEditingSpeciesId}`, {
      method: 'PATCH', headers: { ...HEADERS, 'Prefer': 'return=representation' }, body: JSON.stringify(payload)
    });
    ok = resp.ok;
  } else {
    // Auto-generate slug from common or scientific name
    const slugBase = (payload.common_name || payload.scientific_name || 'species')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    payload.slug = slugBase + '-' + Date.now();
    resp = await fetch(`${SUPABASE_URL}/rest/v1/species`, {
      method: 'POST', headers: { ...HEADERS, 'Prefer': 'return=representation' }, body: JSON.stringify(payload)
    });
    ok = resp.ok;
  }

  if (!ok) { admStatus('Error saving species.', 'err'); return; }

  // Handle image upload
  const imgInput = document.getElementById('sp-image');
  if (imgInput.files[0] && ok) {
    let speciesId, slug;
    if (admEditingSpeciesId) {
      // For edits, we already know the ID; avoid consuming the response body (PATCH can return 204)
      speciesId = admEditingSpeciesId;
      slug = admSpeciesList.find(s => s.id === speciesId)?.slug || 'species';
    } else {
      const respData = await resp.json();
      const savedSpecies = Array.isArray(respData) ? respData[0] : respData;
      speciesId = savedSpecies?.id;
      slug = savedSpecies?.slug || 'species';
    }
    const imageOk = await admUploadAndLinkSpeciesImage(speciesId, slug, imgInput.files[0]);
    if (!imageOk) {
      admStatus(`${admEditingSpeciesId ? 'Species updated' : 'Species added'}, but image failed: ${_lastImageError || 'unknown error'}`, 'err', 10000);
      document.getElementById('admin-status').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      admLoadSpecies();
      return;
    }
  }

  admStatus(admEditingSpeciesId ? 'Species updated.' : 'Species added.', 'ok');
  document.getElementById('admin-status').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  admClearSpeciesForm();
  admLoadSpecies();
}

async function admDeleteSpecies(id) {
  if (!confirm('Delete this species?')) return;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/species?id=eq.${id}`, {
    method: 'DELETE', headers: HEADERS
  });
  if (r.ok) { admStatus('Species deleted.', 'ok'); admLoadSpecies(); }
  else admStatus('Error deleting species.', 'err');
}

async function admMarkObservedToday(id) {
  const today = new Date().toISOString().split('T')[0];
  const r = await fetch(`${SUPABASE_URL}/rest/v1/species?id=eq.${id}`, {
    method: 'PATCH', headers: { ...HEADERS, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ date_last_observed: today })
  });
  if (r.ok) {
    admStatus('Marked observed today.', 'ok');
    const s = admSpeciesList.find(x => x.id === id);
    if (s) s.date_last_observed = today;
    admRenderSpeciesTable();
  } else admStatus('Error updating observation date.', 'err');
}

// ── Species images ─────────────────────────────────────

async function admShowImages(speciesId, slug, name) {
  admImgSpeciesId   = speciesId;
  admImgSpeciesSlug = slug;
  const panel = document.getElementById('adm-img-panel');
  document.getElementById('adm-img-panel-title').textContent = `Images: ${name}`;
  panel.style.display = '';
  panel.scrollIntoView({ behavior: 'smooth' });
  await admRefreshImageGrid();
}

async function admRefreshImageGrid() {
  const imgs = await api(`species_images?species_id=eq.${admImgSpeciesId}&order=is_primary.desc,upload_date.desc`);
  const grid = document.getElementById('adm-img-grid');
  if (!imgs.length) { grid.innerHTML = '<span style="color:#2a3a4a;font-size:12px">No images yet.</span>'; return; }
  grid.innerHTML = imgs.map(img => {
    const url = admStorageUrl('images', img.filename);
    return `<div class="adm-img-item">
      <img src="${url}" alt="${escHtml(img.caption || '')}">
      ${img.is_primary ? '<div class="adm-img-primary">★ Primary</div>' : ''}
      <div class="adm-img-actions">
        ${!img.is_primary ? `<button class="adm-btn primary" style="font-size:10px;padding:2px 6px" onclick="admSetPrimaryImage(${img.id})">Set Primary</button>` : ''}
        <button class="adm-btn danger" style="font-size:10px;padding:2px 6px" onclick="admDeleteSpeciesImage(${img.id},'${escHtml(img.filename)}')">Del</button>
      </div>
    </div>`;
  }).join('');
}

async function admUploadSpeciesImage() {
  const input = document.getElementById('adm-img-upload-input');
  if (!input.files[0]) return;
  const ok = await admUploadAndLinkSpeciesImage(admImgSpeciesId, admImgSpeciesSlug, input.files[0]);
  if (!ok) {
    admStatus(`Image upload failed: ${_lastImageError || 'unknown error'}`, 'err', 10000);
    return;
  }
  input.value = '';
  admRefreshImageGrid();
}

async function admUploadAndLinkSpeciesImage(speciesId, slug, file) {
  const base = `${slug || 'species'}-${Date.now()}`;
  const savedName = await admUploadToStorage('images', base + '.jpg', file);
  if (!savedName) return false;
  // species_images has no auto-increment PK — must allocate next id explicitly
  const [existing, maxRow] = await Promise.all([
    api(`species_images?species_id=eq.${speciesId}&select=id`),
    api(`species_images?select=id&order=id.desc&limit=1`)
  ]);
  const isPrimary = existing.length === 0;
  const nextId = (maxRow[0]?.id ?? 0) + 1;
  const linkResponse = await fetch(`${SUPABASE_URL}/rest/v1/species_images`, {
    method: 'POST',
    headers: { ...HEADERS, 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      id: nextId, species_id: speciesId, filename: savedName,
      is_primary: isPrimary, upload_date: new Date().toISOString()
    })
  });
  if (!linkResponse.ok) {
    await admDeleteFromStorage('images', savedName);
    _lastImageError = 'image saved to storage but database link failed';
    return false;
  }
  return true;
}

async function admSetPrimaryImage(imageId) {
  await fetch(`${SUPABASE_URL}/rest/v1/species_images?species_id=eq.${admImgSpeciesId}`, {
    method: 'PATCH', headers: { ...HEADERS, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ is_primary: false })
  });
  const r = await fetch(`${SUPABASE_URL}/rest/v1/species_images?id=eq.${imageId}`, {
    method: 'PATCH', headers: { ...HEADERS, 'Prefer': 'return=representation' },
    body: JSON.stringify({ is_primary: true })
  });
  if (r.ok) {
    admRefreshImageGrid();
  }
}

async function admDeleteSpeciesImage(imageId, filename) {
  if (!confirm('Delete this image?')) return;
  await fetch(`${SUPABASE_URL}/rest/v1/species_images?id=eq.${imageId}`, {
    method: 'DELETE', headers: HEADERS
  });
  await admDeleteFromStorage('images', filename);
  admRefreshImageGrid();
}

// ── Biosphere ──────────────────────────────────────────

async function admLoadBiosphere() {
  const raw = await api('biosphere_profile?select=*&order=id.asc&limit=1');
  const rows = Array.isArray(raw) ? raw : [];
  const profile = rows[0] || null;
  admBiosphereId = profile?.id || null;
  if (!profile) {
    console.warn('[Admin] biosphere_profile returned no rows:', raw);
  }

  // Stored fields — read directly from the DB record
  const storedFields = [
    'project_name','current_status','mission_brief','total_system_volume','total_footprint_area',
    'system_age','total_daily_power_consumption','ambient_room_temperature','ambient_room_humidity',
    'ecological_stability_rating','primary_maintenance_focus'
  ];
  storedFields.forEach(f => admSet('bs-' + f, profile?.[f]));

  admSet('bs-total_extant_species',          profile?.total_extant_species);
  admSet('bs-number_of_active_realms',       profile?.number_of_active_realms);
  admSet('bs-number_of_active_biomes',       profile?.number_of_active_biomes);
  admSet('bs-total_extinct_removed_species', profile?.total_extinct_removed_species);

  console.log('[Admin] Biosphere loaded:', profile?.project_name);
}

async function admSubmitBiosphere(e) {
  e.preventDefault();
  const payload = {
    project_name: admVal('bs-project_name'),
    current_status: admVal('bs-current_status') || null,
    mission_brief: admVal('bs-mission_brief') || null,
    total_system_volume: admVal('bs-total_system_volume') || null,
    total_footprint_area: admVal('bs-total_footprint_area') || null,
    system_age: admVal('bs-system_age') || null,
    total_daily_power_consumption: admVal('bs-total_daily_power_consumption') || null,
    ambient_room_temperature: admVal('bs-ambient_room_temperature') || null,
    ambient_room_humidity: admVal('bs-ambient_room_humidity') || null,
    total_extant_species: admVal('bs-total_extant_species') || null,
    number_of_active_realms: admVal('bs-number_of_active_realms') || null,
    number_of_active_biomes: admVal('bs-number_of_active_biomes') || null,
    total_extinct_removed_species: admVal('bs-total_extinct_removed_species') || null,
    ecological_stability_rating: admVal('bs-ecological_stability_rating') || null,
    primary_maintenance_focus: admVal('bs-primary_maintenance_focus') || null
  };

  // Handle image upload
  const imgFile = document.getElementById('bs-image').files[0];
  let uploadedImage = null;
  if (imgFile) {
    const savedName = await admUploadToStorage('images', `biosphere-${Date.now()}.jpg`, imgFile);
    if (!savedName) return;
    uploadedImage = { bucket: 'images', filename: savedName };
    payload.image_filename = savedName;
  }

  let r;
  if (admBiosphereId) {
    r = await fetch(`${SUPABASE_URL}/rest/v1/biosphere_profile?id=eq.${admBiosphereId}`, {
      method: 'PATCH', headers: { ...HEADERS, 'Prefer': 'return=minimal' }, body: JSON.stringify(payload)
    });
  } else {
    r = await fetch(`${SUPABASE_URL}/rest/v1/biosphere_profile`, {
      method: 'POST', headers: { ...HEADERS, 'Prefer': 'return=minimal' }, body: JSON.stringify(payload)
    });
  }
  if (r.ok) { admStatus('Biosphere profile saved.', 'ok'); admLoadBiosphere(); }
  else {
    if (uploadedImage) await admDeleteFromStorage(uploadedImage.bucket, uploadedImage.filename);
    admStatus('Error saving biosphere profile. Uploaded image was removed.', 'err');
  }
}

// ── Biomes ─────────────────────────────────────────────

async function admLoadBiomes() {
  const data = await api('biomes?select=*&order=name.asc');
  admBiomesList = data;
  admRenderBiomesTable();
  admPopulateBiomeCheckboxes();
  admPopulateChronicleSelects();
  admRenderAllChips();
}

function admRenderBiomesTable() {
  const tbody = document.getElementById('adm-biomes-tbody');
  if (!admBiomesList.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="no-data">No biomes yet.</td></tr>';
    return;
  }
  tbody.innerHTML = admBiomesList.map(b => `<tr>
    <td>${escHtml(b.public_name || b.name || '—')}</td>
    <td><span class="adm-tag">${escHtml(b.realm || '—')}</span></td>
    <td>${escHtml(b.habitat_typology || '—')}</td>
    <td>${escHtml(b.current_stability_status || '—')}</td>
    <td>${admFmt(b.date_established)}</td>
    <td style="white-space:nowrap;display:flex;gap:4px">
      <button class="adm-btn" onclick="admEditBiome(${b.id})">Edit</button>
      <button class="adm-btn danger" onclick="admDeleteBiome(${b.id})">Delete</button>
    </td>
  </tr>`).join('');
}

async function admEditBiome(id) {
  const b = admBiomesList.find(x => x.id === id);
  if (!b) return;
  admEditingBiomeId = id;
  const fields = [
    'name','public_name','realm','interface_tag','date_established','last_observed',
    'hero_description','system_volume','dimensions_footprint','substrate_profile',
    'hardscape_elements','temperature_range','ph_range','salinity_specific_gravity',
    'core_humidity_range','target_nutrient_levels','alkalinity_calcium',
    'primary_filtration_method','primary_producers','nutrient_export_system',
    'cleanup_crew_profile','current_stability_status','routine_maintenance_schedule',
    'primary_maintenance_focus','general_notes'
  ];
  fields.forEach(f => admSet('bm-' + f, b[f]));
  document.getElementById('adm-bm-form-title').textContent = `Editing: ${b.public_name || b.name}`;
  document.getElementById('adm-bm-submit-btn').textContent = 'Update Biome';
  document.getElementById('adm-bm-cancel-btn').style.display = '';
  document.getElementById('adm-bm-form').scrollIntoView({ behavior: 'smooth' });
}

function admClearBiomeForm() {
  admEditingBiomeId = null;
  document.getElementById('adm-bm-form').reset();
  document.getElementById('adm-bm-form-title').textContent = 'Add New Biome';
  document.getElementById('adm-bm-submit-btn').textContent = 'Add Biome';
  document.getElementById('adm-bm-cancel-btn').style.display = 'none';
}

async function admSubmitBiome(e) {
  e.preventDefault();
  const payload = {
    name: admVal('bm-name'),
    public_name: admVal('bm-public_name') || null,
    realm: admVal('bm-realm'),
    interface_tag: admVal('bm-interface_tag') || null,
    date_established: admVal('bm-date_established') || null,
    last_observed: admVal('bm-last_observed') || null,
    hero_description: admVal('bm-hero_description') || null,
    system_volume: admVal('bm-system_volume') || null,
    dimensions_footprint: admVal('bm-dimensions_footprint') || null,
    substrate_profile: admVal('bm-substrate_profile') || null,
    hardscape_elements: admVal('bm-hardscape_elements') || null,
    temperature_range: admVal('bm-temperature_range') || null,
    ph_range: admVal('bm-ph_range') || null,
    salinity_specific_gravity: admVal('bm-salinity_specific_gravity') || null,
    core_humidity_range: admVal('bm-core_humidity_range') || null,
    target_nutrient_levels: admVal('bm-target_nutrient_levels') || null,
    alkalinity_calcium: admVal('bm-alkalinity_calcium') || null,
    primary_filtration_method: admVal('bm-primary_filtration_method') || null,
    primary_producers: admVal('bm-primary_producers') || null,
    nutrient_export_system: admVal('bm-nutrient_export_system') || null,
    cleanup_crew_profile: admVal('bm-cleanup_crew_profile') || null,
    current_stability_status: admVal('bm-current_stability_status') || null,
    routine_maintenance_schedule: admVal('bm-routine_maintenance_schedule') || null,
    primary_maintenance_focus: admVal('bm-primary_maintenance_focus') || null,
    general_notes: admVal('bm-general_notes') || null
  };

  // Image upload
  const imgFile = document.getElementById('bm-image').files[0];
  let uploadedImage = null;
  if (imgFile) {
    const slug = (payload.name || 'biome').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const savedName = await admUploadToStorage('images', `${slug}-${Date.now()}.jpg`, imgFile);
    if (!savedName) return;
    uploadedImage = { bucket: 'images', filename: savedName };
    payload.image_filename = savedName;
  }

  let r;
  if (admEditingBiomeId) {
    r = await fetch(`${SUPABASE_URL}/rest/v1/biomes?id=eq.${admEditingBiomeId}`, {
      method: 'PATCH', headers: { ...HEADERS, 'Prefer': 'return=minimal' }, body: JSON.stringify(payload)
    });
  } else {
    r = await fetch(`${SUPABASE_URL}/rest/v1/biomes`, {
      method: 'POST', headers: { ...HEADERS, 'Prefer': 'return=minimal' }, body: JSON.stringify(payload)
    });
  }
  if (r.ok) { admStatus(admEditingBiomeId ? 'Biome updated.' : 'Biome added.', 'ok'); admClearBiomeForm(); admLoadBiomes(); }
  else {
    if (uploadedImage) await admDeleteFromStorage(uploadedImage.bucket, uploadedImage.filename);
    admStatus('Error saving biome. Uploaded image was removed.', 'err');
  }
}

async function admDeleteBiome(id) {
  if (!confirm('Delete this biome?')) return;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/biomes?id=eq.${id}`, {
    method: 'DELETE', headers: HEADERS
  });
  if (r.ok) { admStatus('Biome deleted.', 'ok'); admLoadBiomes(); }
  else admStatus('Error deleting biome.', 'err');
}

// ── Chronicles ─────────────────────────────────────────

function admPopulateChronicleSelects() {
  const bSel = document.getElementById('ch-biome_id');
  const sSel = document.getElementById('ch-species_id');
  if (bSel) {
    const existing = bSel.value;
    bSel.innerHTML = '<option value="">Select Biome</option>' +
      admBiomesList.map(b => `<option value="${b.id}">${escHtml(b.public_name || b.name)}</option>`).join('');
    if (existing) bSel.value = existing;
  }
  if (sSel) {
    const existing = sSel.value;
    sSel.innerHTML = '<option value="">Select Species</option>' +
      admSpeciesList.map(s => `<option value="${s.id}">${escHtml(s.common_name || s.scientific_name)}</option>`).join('');
    if (existing) sSel.value = existing;
  }
}

function admToggleChronicleScope() {
  const scope = admVal('ch-scope_type');
  document.getElementById('ch-realm-grp').style.display   = scope === 'biosphere' ? '' : 'none';
  document.getElementById('ch-biome-grp').style.display   = scope === 'biome'     ? '' : 'none';
  document.getElementById('ch-species-grp').style.display = scope === 'species'   ? '' : 'none';
  document.getElementById('ch-system-grp').style.display  = scope === 'system'    ? '' : 'none';
}

async function admLoadChronicles() {
  const raw = await api('chronicles?select=*&order=event_date.desc&limit=200');
  admChroniclesList = Array.isArray(raw) ? raw : [];
  if (!Array.isArray(raw)) console.warn('[Admin] Chronicles query error:', raw);
  admRenderChroniclesTable();
}

function admRenderChroniclesTable() {
  const tbody = document.getElementById('adm-chronicles-tbody');
  if (!admChroniclesList.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="no-data">No chronicles yet.</td></tr>';
    return;
  }
  const typeLabels = { milestone: 'Milestone', observation: 'Observation', change: 'Change', failure_event: 'Failure Event' };
  // Build lookup maps from already-loaded data
  const speciesById = Object.fromEntries(admSpeciesList.map(s => [s.id, s.common_name || s.scientific_name]));
  const biomeById   = Object.fromEntries(admBiomesList.map(b => [b.id, b.public_name || b.name]));
  tbody.innerHTML = admChroniclesList.map(c => {
    const scope = c.scope_type || (c.species_id ? 'species' : c.biome_id ? 'biome' : 'biosphere');
    let target = '—';
    if (scope === 'species')   target = speciesById[c.species_id] || `Species #${c.species_id}`;
    else if (scope === 'biome')   target = biomeById[c.biome_id]   || `Biome #${c.biome_id}`;
    else if (scope === 'system')  target = systemMap[c.system_id]  || '—';
    else if (scope === 'biosphere') target = c.realm_tag || 'Whole Project';
    const preview = (c.content || '').slice(0, 60) + (c.content?.length > 60 ? '…' : '');
    return `<tr>
      <td><strong>${escHtml(c.title || '—')}</strong></td>
      <td>${escHtml(scope)}</td>
      <td>${escHtml(target)}</td>
      <td>${escHtml(typeLabels[c.entry_type] || c.entry_type || '—')}</td>
      <td style="white-space:nowrap">${admFmt(c.event_date)}</td>
      <td style="white-space:nowrap;display:flex;gap:4px">
        <button class="adm-btn" onclick="admEditChronicle(${c.id})">Edit</button>
        <button class="adm-btn danger" onclick="admDeleteChronicle(${c.id})">Delete</button>
      </td>
    </tr>`;
  }).join('');
}

async function admEditChronicle(id) {
  const c = admChroniclesList.find(x => x.id === id);
  if (!c) return;
  admEditingChronicleId = id;
  admSet('ch-title', c.title);
  admSet('ch-scope_type', c.scope_type || (c.species_id ? 'species' : c.biome_id ? 'biome' : 'biosphere'));
  admSet('ch-event_date', c.event_date);
  admSet('ch-entry_type', c.entry_type);
  admSet('ch-content', c.content);
  admSet('ch-youtube_url', c.youtube_url);
  admSet('ch-realm_tag', c.realm_tag);
  admSet('ch-biome_id', c.biome_id);
  admSet('ch-species_id', c.species_id);
  admSet('ch-system_id', c.system_id);
  admToggleChronicleScope();
  document.getElementById('adm-ch-form-title').textContent = `Editing: ${c.title}`;
  document.getElementById('adm-ch-submit-btn').textContent = 'Update Chronicle';
  document.getElementById('adm-ch-cancel-btn').style.display = '';
  document.getElementById('adm-ch-form').scrollIntoView({ behavior: 'smooth' });
}

function admClearChronicleForm() {
  admEditingChronicleId = null;
  document.getElementById('adm-ch-form').reset();
  admToggleChronicleScope();
  document.getElementById('adm-ch-form-title').textContent = 'Add Chronicle Entry';
  document.getElementById('adm-ch-submit-btn').textContent = 'Add Chronicle';
  document.getElementById('adm-ch-cancel-btn').style.display = 'none';
}

async function admSubmitChronicle(e) {
  e.preventDefault();
  const scope = admVal('ch-scope_type');
  const payload = {
    title: admVal('ch-title'),
    scope_type: scope,
    event_date: admVal('ch-event_date'),
    entry_type: admVal('ch-entry_type'),
    content: admVal('ch-content'),
    youtube_url: admVal('ch-youtube_url') || null,
    realm_tag: scope === 'biosphere' ? (admVal('ch-realm_tag') || null) : null,
    biome_id: scope === 'biome'    ? (parseInt(admVal('ch-biome_id'))   || null) : null,
    species_id: scope === 'species' ? (parseInt(admVal('ch-species_id')) || null) : null,
    system_id: scope === 'system'  ? (parseInt(admVal('ch-system_id'))  || null) : null
  };

  // Image upload
  const imgFile = document.getElementById('ch-image').files[0];
  let uploadedImage = null;
  if (imgFile && !payload.youtube_url) {
    const savedName = await admUploadToStorage('chronicles-images', `chronicle-${Date.now()}.jpg`, imgFile);
    if (!savedName) return;
    uploadedImage = { bucket: 'chronicles-images', filename: savedName };
    payload.image_url = admStorageUrl('chronicles-images', savedName);
  }

  let r;
  if (admEditingChronicleId) {
    r = await fetch(`${SUPABASE_URL}/rest/v1/chronicles?id=eq.${admEditingChronicleId}`, {
      method: 'PATCH', headers: { ...HEADERS, 'Prefer': 'return=minimal' }, body: JSON.stringify(payload)
    });
  } else {
    r = await fetch(`${SUPABASE_URL}/rest/v1/chronicles`, {
      method: 'POST', headers: { ...HEADERS, 'Prefer': 'return=minimal' }, body: JSON.stringify(payload)
    });
  }
  if (r.ok) { admStatus(admEditingChronicleId ? 'Chronicle updated.' : 'Chronicle added.', 'ok'); admClearChronicleForm(); admLoadChronicles(); }
  else {
    if (uploadedImage) await admDeleteFromStorage(uploadedImage.bucket, uploadedImage.filename);
    admStatus('Error saving chronicle. Uploaded image was removed.', 'err');
  }
}

async function admDeleteChronicle(id) {
  if (!confirm('Delete this chronicle entry?')) return;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/chronicles?id=eq.${id}`, {
    method: 'DELETE', headers: HEADERS
  });
  if (r.ok) { admStatus('Chronicle deleted.', 'ok'); admLoadChronicles(); }
  else admStatus('Error deleting chronicle.', 'err');
}

// ── Announcements ──────────────────────────────────────

async function admLoadAnnouncements() {
  const data = await api('announcements?select=*&order=created_at.desc');
  const tbody = document.getElementById('adm-ann-tbody');
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="no-data">No announcements yet.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(a => `<tr>
    <td><strong>${escHtml(a.title)}</strong></td>
    <td>${a.is_active ? '<span style="color:#60aa80">Yes</span>' : '<span style="color:#3a4a5a">No</span>'}</td>
    <td>${a.expires_at ? admFmt(a.expires_at.split('T')[0]) : 'Never'}</td>
    <td>${admFmt(a.created_at?.split('T')[0])}</td>
    <td style="white-space:nowrap;display:flex;gap:4px">
      <button class="adm-btn ${a.is_active ? '' : 'primary'}" onclick="admToggleAnnouncement(${a.id},${a.is_active})">${a.is_active ? 'Deactivate' : 'Activate'}</button>
      <button class="adm-btn danger" onclick="admDeleteAnnouncement(${a.id})">Delete</button>
    </td>
  </tr>`).join('');
}

async function admSubmitAnnouncement(e) {
  e.preventDefault();
  const payload = {
    title: admVal('ann-title'),
    body: admVal('ann-body') || null,
    expires_at: admVal('ann-expires_at') || null,
    is_active: true
  };
  const r = await fetch(`${SUPABASE_URL}/rest/v1/announcements`, {
    method: 'POST', headers: { ...HEADERS, 'Prefer': 'return=minimal' }, body: JSON.stringify(payload)
  });
  if (r.ok) { admStatus('Announcement created.', 'ok'); document.getElementById('adm-ann-form').reset(); admLoadAnnouncements(); }
  else admStatus('Error creating announcement.', 'err');
}

async function admToggleAnnouncement(id, isActive) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/announcements?id=eq.${id}`, {
    method: 'PATCH', headers: { ...HEADERS, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ is_active: !isActive })
  });
  if (r.ok) admLoadAnnouncements();
  else admStatus('Error updating announcement.', 'err');
}

async function admDeleteAnnouncement(id) {
  if (!confirm('Delete this announcement?')) return;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/announcements?id=eq.${id}`, {
    method: 'DELETE', headers: HEADERS
  });
  if (r.ok) admLoadAnnouncements();
  else admStatus('Error deleting announcement.', 'err');
}

// ── Chronicle Staging ──────────────────────────────────

async function admLoadStaging() {
  const data = await api("chronicles_staging?select=*&status=eq.pending&order=created_at.asc").catch(() => []);
  const tbody = document.getElementById('adm-staging-tbody');
  const empty = document.getElementById('adm-staging-empty');
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="no-data">No pending approvals.</td></tr>';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';
  const typeLabels = { milestone: 'Milestone', observation: 'Observation', change: 'Change', failure_event: 'Failure Event' };
  tbody.innerHTML = data.map(entry => {
    const preview = (entry.content || '').slice(0, 80) + (entry.content?.length > 80 ? '…' : '');
    return `<tr>
      <td><strong>${escHtml(entry.title || 'Untitled')}</strong></td>
      <td style="max-width:200px;font-size:11px;color:#4a5a6a">${escHtml(preview)}</td>
      <td>${admFmt(entry.event_date)}</td>
      <td>${escHtml(typeLabels[entry.entry_type] || entry.entry_type || '—')}</td>
      <td>${escHtml((entry.scope_type || '').replace(/_/g, ' '))}</td>
      <td style="font-size:11px">${escHtml(entry.domain_source || entry.suggestion_reason || '—')}</td>
      <td style="white-space:nowrap;display:flex;gap:4px">
        <button class="adm-btn primary" onclick="admApproveStaging(${entry.id})">Approve</button>
        <button class="adm-btn danger" onclick="admRejectStaging(${entry.id})">Reject</button>
      </td>
    </tr>`;
  }).join('');
}

async function admApproveStaging(id) {
  const entries = await api(`chronicles_staging?id=eq.${id}&select=*`);
  const entry = entries[0];
  if (!entry) return;
  const chroniclePayload = {
    title: entry.title, content: entry.content, event_date: entry.event_date,
    entry_type: entry.entry_type, scope_type: entry.scope_type,
    species_id: entry.species_id || null, biome_id: entry.biome_id || null,
    system_id: entry.system_id || null, realm_tag: entry.realm_tag || null,
    image_url: entry.image_url || null, youtube_url: entry.youtube_url || null
  };
  const r1 = await fetch(`${SUPABASE_URL}/rest/v1/chronicles`, {
    method: 'POST', headers: { ...HEADERS, 'Prefer': 'return=minimal' }, body: JSON.stringify(chroniclePayload)
  });
  if (!r1.ok) { admStatus('Error approving staging entry.', 'err'); return; }
  await fetch(`${SUPABASE_URL}/rest/v1/chronicles_staging?id=eq.${id}`, {
    method: 'PATCH', headers: { ...HEADERS, 'Prefer': 'return=minimal' }, body: JSON.stringify({ status: 'approved' })
  });
  admStatus('Chronicle approved and published.', 'ok');
  admLoadStaging();
}

async function admRejectStaging(id) {
  if (!confirm('Reject this staged chronicle?')) return;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/chronicles_staging?id=eq.${id}`, {
    method: 'PATCH', headers: { ...HEADERS, 'Prefer': 'return=minimal' }, body: JSON.stringify({ status: 'rejected' })
  });
  if (r.ok) { admStatus('Chronicle rejected.', 'ok'); admLoadStaging(); }
  else admStatus('Error rejecting chronicle.', 'err');
}

// ════════════════════════════════════════════════════════
//  MEDIA LIBRARY
// ════════════════════════════════════════════════════════

let mediaPage           = 0;
const MEDIA_PAGE_SIZE   = 50;
let mediaTypeFilter     = '';
let mediaYearFilter     = '';
let mediaSearchQuery    = '';
let mediaSearchTimer    = null;
let mediaTotal          = 0;
let mediaSelectedId     = null;
let mediaPendingTags    = []; // [{id, name, category}] — id null for new tags
let mediaCurrentState   = null; // {asset, taggedSpecies, taggedBiomes, taggedSystems, taggedChronicle}
let mediaActiveTab      = 'view';
let mediaShowUnreviewed = false;

const MEDIA_SYSTEMS = [
  { id: 1, name: 'Climate' },       { id: 2, name: 'Rain' },           { id: 3, name: 'Lighting' },
  { id: 4, name: 'Wave & Tide' },   { id: 5, name: 'Control System' }, { id: 6, name: 'Enclosure' }
];

function mediaFileUrl(localPath) {
  return 'file:///' + localPath.replace(/\\/g, '/');
}

function mediaSizeStr(bytes) {
  if (!bytes) return '';
  if (bytes > 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
  if (bytes > 1048576)    return (bytes / 1048576).toFixed(0) + ' MB';
  return (bytes / 1024).toFixed(0) + ' KB';
}

async function mediaApiFetch(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { ...HEADERS, 'Prefer': 'count=exact' }
  });
  const data = await res.json();
  const range = res.headers.get('Content-Range') || '';
  const total = parseInt(range.split('/')[1]) || 0;
  return { data, total };
}

async function admLoadMedia(sortOrder) {
  document.getElementById('media-list').innerHTML = '<div class="loading" style="padding:16px">Loading…</div>';

  const order = sortOrder || 'captured_date.desc,filename.asc';
  const offset = mediaPage * MEDIA_PAGE_SIZE;
  let params = `media_assets?select=id,filename,local_path,file_type,captured_date,size_bytes,reviewed,media_species(media_id)` +
               `&order=${order}&limit=${MEDIA_PAGE_SIZE}&offset=${offset}`;

  if (mediaTypeFilter)     params += `&file_type=eq.${mediaTypeFilter}`;
  if (mediaYearFilter)     params += `&captured_date=gte.${mediaYearFilter}-01-01&captured_date=lte.${mediaYearFilter}-12-31`;
  if (mediaShowUnreviewed) params += `&reviewed=eq.false`;
  if (mediaSearchQuery) {
    const q = mediaSearchQuery.replace(/['"&?]/g, '');
    params += `&filename=ilike.*${q}*`;
  }

  const { data, total } = await mediaApiFetch(params);
  mediaTotal = total;

  document.getElementById('media-total-badge').textContent = total.toLocaleString();
  document.getElementById('media-count-label').textContent = total
    ? `${offset + 1}–${Math.min(offset + data.length, total)} of ${total.toLocaleString()}`
    : '0 results';

  mediaRenderList(data);
  mediaRenderPagination();
}

function mediaReload() {
  mediaYearFilter = document.getElementById('media-year').value;
  mediaPage = 0;
  admLoadMedia();
}

function mediaSetType(type) {
  mediaTypeFilter = type;
  ['all', 'photo', 'video'].forEach(t => {
    const btn = document.getElementById(`media-tbtn-${t}`);
    if (btn) btn.classList.toggle('active', t === (type || 'all'));
  });
  mediaPage = 0;
  admLoadMedia();
}

function mediaToggleUnreviewed() {
  mediaShowUnreviewed = !mediaShowUnreviewed;
  const btn = document.getElementById('media-tbtn-unreviewed');
  if (btn) btn.classList.toggle('active', mediaShowUnreviewed);
  mediaPage = 0;
  admLoadMedia();
}

function mediaSearchDebounce() {
  clearTimeout(mediaSearchTimer);
  mediaSearchTimer = setTimeout(() => {
    mediaSearchQuery = document.getElementById('media-search').value.trim();
    mediaPage = 0;
    admLoadMedia();
  }, 350);
}

function mediaRenderList(records) {
  const container = document.getElementById('media-list');
  if (!records || !records.length) {
    container.innerHTML = '<div class="no-data" style="padding:20px;text-align:center">No files found.</div>';
    return;
  }
  container.innerHTML = records.map(r => {
    const isPhoto    = r.file_type === 'photo';
    const isSelected = r.id === mediaSelectedId;
    const hasSpecies = r.media_species && r.media_species.length > 0;
    const name = r.filename.length > 38 ? r.filename.slice(0, 36) + '…' : r.filename;
    // reviewed=true → green ✓ · has species but not reviewed → yellow ◑ · nothing → blank
    const statusBadge = r.reviewed
      ? '<span class="media-row-reviewed">✓</span>'
      : hasSpecies ? '<span class="media-row-partial">◑</span>' : '';
    return `<div class="media-row${isSelected ? ' active' : ''}" onclick="mediaSelectAsset(${r.id})" data-id="${r.id}">
      <span class="media-type-dot ${isPhoto ? 'photo' : 'video'}"></span>
      <span class="media-row-name" title="${escHtml(r.filename)}">${escHtml(name)}</span>
      <span class="media-row-date">${r.captured_date || '—'}</span>
      <span class="media-row-badge ${isPhoto ? 'photo' : 'video'}">${isPhoto ? 'ph' : 'vd'}</span>
      ${statusBadge}
    </div>`;
  }).join('');
}

function mediaRenderPagination() {
  const totalPages = Math.ceil(mediaTotal / MEDIA_PAGE_SIZE);
  const el = document.getElementById('media-pagination');
  if (totalPages <= 1) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <button class="media-page-btn" onclick="mediaChangePage(-1)" ${mediaPage === 0 ? 'disabled' : ''}>← Prev</button>
    <span class="media-page-info">Page ${mediaPage + 1} of ${totalPages}</span>
    <button class="media-page-btn" onclick="mediaChangePage(1)" ${mediaPage >= totalPages - 1 ? 'disabled' : ''}>Next →</button>
  `;
}

function mediaChangePage(delta) {
  mediaPage += delta;
  admLoadMedia();
  document.getElementById('media-list').scrollTop = 0;
}

async function mediaSelectAsset(id) {
  mediaSelectedId = id;
  mediaActiveTab  = 'view';
  document.querySelectorAll('.media-row').forEach(r => {
    r.classList.toggle('active', parseInt(r.dataset.id) === id);
  });

  const panel = document.getElementById('media-panel-col');
  panel.innerHTML = '<div class="loading" style="padding:20px">Loading…</div>';
  panel.scrollTop = 0;

  const [asset, speciesTags, biomeTags, systemTags, chronicleLinks, tagLinks] = await Promise.all([
    api(`media_assets?id=eq.${id}&select=*`).then(d => d[0]),
    api(`media_species?media_id=eq.${id}&select=species_id`),
    api(`media_biomes?media_id=eq.${id}&select=biome_id`),
    api(`media_systems?media_id=eq.${id}&select=system_id`),
    api(`media_chronicles?media_id=eq.${id}&select=chronicle_id`),
    api(`media_tag_links?media_id=eq.${id}&select=tag_id,media_tags(id,name,category)`)
  ]);

  mediaCurrentState = {
    asset,
    taggedSpecies:   new Set(speciesTags.map(t => t.species_id)),
    taggedBiomes:    new Set(biomeTags.map(t => t.biome_id)),
    taggedSystems:   new Set(systemTags.map(t => t.system_id)),
    taggedChronicle: chronicleLinks.length ? chronicleLinks[0].chronicle_id : null
  };
  mediaPendingTags = tagLinks.map(t => ({ id: t.media_tags.id, name: t.media_tags.name, category: t.media_tags.category }));

  mediaRenderPanel();
}

function mediaRenderPanel() {
  if (!mediaCurrentState) return;
  const { asset } = mediaCurrentState;
  const isPhoto = asset.file_type === 'photo';
  const fileUrl = mediaFileUrl(asset.local_path);

  const previewHtml = isPhoto
    ? `<img src="${escHtml(fileUrl)}" alt="${escHtml(asset.filename)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'media-preview-video\\'>Image not found on disk</div>'">`
    : `<video src="${escHtml(fileUrl)}" controls preload="metadata"
         onerror="this.parentElement.innerHTML='<div class=\\'media-preview-video\\'>Cannot play this format in-app.<br><span style=\\'font-size:10px;color:#2a4050\\'>Copy path below and open in your media player.</span></div>'">
       </video>`;

  const reviewedClass = asset.reviewed ? 'media-reviewed-badge reviewed' : 'media-reviewed-badge';
  const reviewedLabel = asset.reviewed ? '✓ Reviewed' : 'Unreviewed';
  const reviewBtnLabel = asset.reviewed ? 'Mark Unreviewed' : 'Mark as Reviewed';

  document.getElementById('media-panel-col').innerHTML = `
    <div class="media-panel">
      <div class="media-panel-header">
        <div class="media-tabs">
          <button class="media-tab${mediaActiveTab === 'view' ? ' active' : ''}" onclick="mediaShowTab('view')">View</button>
          <button class="media-tab${mediaActiveTab === 'edit' ? ' active' : ''}" onclick="mediaShowTab('edit')">Edit Tags</button>
        </div>
        <button class="media-reviewed-btn ${asset.reviewed ? 'is-reviewed' : ''}" id="mpanel-mark-btn" onclick="mediaMarkReviewed(${!asset.reviewed})">
          ${asset.reviewed ? '✓ Reviewed — click to undo' : 'Mark as Reviewed'}
        </button>
      </div>

      <div class="media-preview">${previewHtml}</div>
      <div class="media-info">
        <div class="media-info-name">${escHtml(asset.filename)}</div>
        <div class="media-info-meta">${asset.captured_date || '—'} · ${mediaSizeStr(asset.size_bytes)} · ${asset.file_type}</div>
        <div class="media-info-path">${escHtml(asset.local_path)}</div>
      </div>

      <div id="mpanel-view" style="${mediaActiveTab === 'view' ? '' : 'display:none'}">
        <div id="mpanel-view-body"></div>
      </div>

      <div id="mpanel-edit" style="${mediaActiveTab === 'edit' ? '' : 'display:none'}">
        <div class="media-save-bar">
          <button class="media-save-btn" onclick="mediaSave()">Save Tags</button>
          <button class="media-clear-btn" onclick="mediaClearTags()">Clear All</button>
          <span class="media-save-status" id="media-save-status"></span>
        </div>
        <div id="mpanel-edit-body"></div>
      </div>
    </div>
  `;

  mediaRenderViewTab();
  mediaRenderEditTab();
}

function mediaRenderViewTab() {
  if (!mediaCurrentState) return;
  const { asset, taggedSpecies, taggedBiomes, taggedSystems, taggedChronicle } = mediaCurrentState;

  const speciesNames = admSpeciesList
    .filter(s => taggedSpecies.has(s.id))
    .map(s => escHtml(s.common_name || s.scientific_name || ''));
  const biomeNames = admBiomesList
    .filter(b => taggedBiomes.has(b.id))
    .map(b => escHtml(b.public_name || b.name || ''));
  const systemNames = MEDIA_SYSTEMS
    .filter(s => taggedSystems.has(s.id))
    .map(s => escHtml(s.name));
  const chronicle = (admChroniclesList || []).find(c => c.id === taggedChronicle);

  const chipsRow = (label, items) => `
    <div class="media-view-section">
      <div class="media-view-label">${label}</div>
      <div class="media-view-chips">
        ${items.length
          ? items.map(n => `<span class="media-view-chip">${n}</span>`).join('')
          : '<span class="media-view-empty">None tagged</span>'}
      </div>
    </div>`;

  const body = document.getElementById('mpanel-view-body');
  if (!body) return;

  body.innerHTML = `
    ${chipsRow('Species', speciesNames)}
    ${chipsRow('Biomes', biomeNames)}
    ${chipsRow('Systems', systemNames)}
    <div class="media-view-section">
      <div class="media-view-label">Chronicle</div>
      <div class="media-view-chips">
        ${chronicle
          ? `<span class="media-view-chip chronicle">${escHtml(chronicle.event_date)} — ${escHtml(chronicle.title || '')}</span>`
          : '<span class="media-view-empty">None linked</span>'}
      </div>
    </div>
    <div class="media-view-section">
      <div class="media-view-label">Tags</div>
      <div class="media-view-chips">
        ${mediaPendingTags.length
          ? mediaPendingTags.map(t =>
              `<span class="media-view-chip tag">${t.category ? `<span style="opacity:0.5;font-size:10px">${escHtml(t.category)}:</span> ` : ''}${escHtml(t.name)}</span>`
            ).join('')
          : '<span class="media-view-empty">None added</span>'}
      </div>
    </div>
    ${asset.description ? `<div class="media-view-section">
      <div class="media-view-label">Description</div>
      <div class="media-view-text">${escHtml(asset.description)}</div>
    </div>` : ''}
    ${asset.notes ? `<div class="media-view-section">
      <div class="media-view-label">Notes</div>
      <div class="media-view-text notes">${escHtml(asset.notes)}</div>
    </div>` : ''}
    <div style="padding-top:8px">
      <button class="media-edit-btn" onclick="mediaShowTab('edit')">Edit Tags →</button>
    </div>
  `;
}

function mediaRenderEditTab() {
  if (!mediaCurrentState) return;
  const { asset, taggedSpecies, taggedBiomes, taggedSystems, taggedChronicle } = mediaCurrentState;

  const speciesHtml = admSpeciesList.map(s =>
    `<label class="media-sp-label" data-name="${escHtml((s.common_name || s.scientific_name || '').toLowerCase())}">
      <input type="checkbox" name="sp" value="${s.id}" ${taggedSpecies.has(s.id) ? 'checked' : ''}>
      ${escHtml(s.common_name || s.scientific_name || '')}
    </label>`
  ).join('');

  const biomeHtml = admBiomesList.map(b =>
    `<label><input type="checkbox" name="bm" value="${b.id}" ${taggedBiomes.has(b.id) ? 'checked' : ''}> ${escHtml(b.public_name || b.name)}</label>`
  ).join('');

  const systemHtml = MEDIA_SYSTEMS.map(s =>
    `<label><input type="checkbox" name="sys" value="${s.id}" ${taggedSystems.has(s.id) ? 'checked' : ''}> ${escHtml(s.name)}</label>`
  ).join('');

  const chronicleOptions = (admChroniclesList || [])
    .slice().sort((a, b) => (b.event_date || '').localeCompare(a.event_date || ''))
    .map(c => `<option value="${c.id}" ${c.id === taggedChronicle ? 'selected' : ''}>${escHtml(c.event_date)} — ${escHtml(c.title)}</option>`)
    .join('');

  const body = document.getElementById('mpanel-edit-body');
  if (!body) return;

  body.innerHTML = `
    <div class="media-field-group">
      <label>Captured Date</label>
      <div class="media-field-hint">When this was captured — used to group files by timeline.</div>
      <input type="date" id="mpanel-date" value="${asset.captured_date || ''}">
    </div>

    <div class="media-field-group">
      <label>Species</label>
      <div class="media-field-hint">Which species appear in or are relevant to this clip. Multiple allowed.</div>
      <input class="media-sp-search" id="mpanel-sp-search" placeholder="Filter species…" oninput="mediaPanelFilterSpecies()" autocomplete="off">
      <div class="media-checklist" id="mpanel-species">${speciesHtml}</div>
    </div>

    <div class="media-field-group">
      <label>Biomes</label>
      <div class="media-field-hint">The biome environment visible or relevant — e.g. Tidal Marsh, Brine Pool, Open Ocean.</div>
      <div class="media-inline-checks" id="mpanel-biomes">${biomeHtml}</div>
    </div>

    <div class="media-field-group">
      <label>Systems</label>
      <div class="media-field-hint">Physical infrastructure shown — lighting rigs, wave generators, climate systems, enclosure hardware, etc.</div>
      <div class="media-inline-checks" id="mpanel-systems">${systemHtml}</div>
    </div>

    <div class="media-field-group">
      <label>Chronicle</label>
      <div class="media-field-hint">Link to an existing chronicle entry — useful when this clip documents a specific milestone or event.</div>
      <select id="mpanel-chronicle">
        <option value="">None</option>
        ${chronicleOptions}
      </select>
    </div>

    <div class="media-field-group">
      <label>Free-form Tags</label>
      <div class="media-field-hint">Custom search keywords. Category is optional — e.g. tag: <em>spawning</em>, category: <em>behavior</em>. Or just: <em>macro</em>, <em>wide-shot</em>, <em>night-cycle</em>.</div>
      <div class="media-tag-chips" id="mpanel-tag-chips"></div>
      <div class="media-tag-input-row">
        <input id="mpanel-tag-name" placeholder="tag name" onkeydown="mediaTagKeydown(event)">
        <input id="mpanel-tag-cat" placeholder="category (opt)" style="max-width:130px" onkeydown="mediaTagKeydown(event)">
        <button class="media-tag-add-btn" onclick="mediaAddPendingTag()">Add</button>
      </div>
    </div>

    <div class="media-field-group">
      <label>Description</label>
      <div class="media-field-hint">What's happening in this clip — key moments, subject focus, environmental context. Main field for search and future chronicle writing.</div>
      <textarea id="mpanel-description" rows="3" placeholder="e.g. Brine shrimp swarming near surface during afternoon light cycle. Tight cluster visible center frame.">${escHtml(asset.description || '')}</textarea>
    </div>

    <div class="media-field-group">
      <label>Notes</label>
      <div class="media-field-hint">Internal production notes — camera angles, lighting conditions, re-shoot ideas, clip quality flags.</div>
      <textarea id="mpanel-notes" rows="2" placeholder="e.g. Slightly overexposed. Retake with ISO 400. Good motion reference.">${escHtml(asset.notes || '')}</textarea>
    </div>
  `;

  mediaRenderTagChips();
}

function mediaShowTab(tab) {
  mediaActiveTab = tab;
  document.querySelectorAll('.media-tab').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.trim().toLowerCase().startsWith(tab));
  });
  const viewEl = document.getElementById('mpanel-view');
  const editEl = document.getElementById('mpanel-edit');
  if (viewEl) viewEl.style.display = tab === 'view' ? '' : 'none';
  if (editEl) editEl.style.display = tab === 'edit' ? '' : 'none';
}

async function mediaMarkReviewed(reviewed) {
  if (!mediaCurrentState) return;
  const id = mediaCurrentState.asset.id;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/media_assets?id=eq.${id}`, {
    method: 'PATCH', headers: { ...HEADERS, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ reviewed })
  });
  if (!r.ok) return;
  mediaCurrentState.asset.reviewed = reviewed;

  const btn = document.getElementById('mpanel-mark-btn');
  if (btn) {
    btn.textContent = reviewed ? '✓ Reviewed — click to undo' : 'Mark as Reviewed';
    btn.className   = reviewed ? 'media-reviewed-btn is-reviewed' : 'media-reviewed-btn';
    btn.onclick     = () => mediaMarkReviewed(!reviewed);
  }

  const row = document.querySelector(`.media-row[data-id="${id}"]`);
  if (row) {
    const existing = row.querySelector('.media-row-reviewed, .media-row-partial');
    if (existing) existing.remove();
    if (reviewed) {
      const span = document.createElement('span');
      span.className = 'media-row-reviewed'; span.textContent = '✓';
      row.appendChild(span);
    } else if (mediaCurrentState.taggedSpecies.size > 0) {
      const span = document.createElement('span');
      span.className = 'media-row-partial'; span.textContent = '◑';
      row.appendChild(span);
    }
  }
}

async function mediaReindex() {
  if (!window.electronAPI) {
    alert('Re-index is only available in the desktop app.');
    return;
  }
  const folder = await window.electronAPI.selectFolder();
  if (!folder) return;

  const btn = document.getElementById('media-reindex-btn');
  const resultSpan = document.getElementById('media-reindex-result');
  if (resultSpan) resultSpan.textContent = '';
  if (btn) { btn.disabled = true; btn.textContent = 'Indexing…'; }

  window.electronAPI.onReindexProgress(({ done, total }) => {
    if (btn) btn.textContent = `Indexing… ${done}/${total}`;
  });

  try {
    const result = await window.electronAPI.reindexMedia(folder);
    if (result.success) {
      // Clear all filters so newly indexed files aren't hidden by year/type
      mediaYearFilter     = '';
      mediaTypeFilter     = '';
      mediaShowUnreviewed = false;
      mediaSearchQuery    = '';
      mediaPage           = 0;
      document.getElementById('media-year').value = '';
      document.getElementById('media-search').value = '';
      ['all', 'photo', 'video'].forEach(t => {
        const b = document.getElementById(`media-tbtn-${t}`);
        if (b) b.classList.toggle('active', t === 'all');
      });
      const unrevBtn = document.getElementById('media-tbtn-unreviewed');
      if (unrevBtn) unrevBtn.classList.remove('active');

      // Sort by indexed_at so newly added files appear at the top
      admLoadMedia('indexed_at.desc,filename.asc');
      const removedPart = result.removed ? `, ${result.removed} removed` : '';
      const msg = `✓ ${result.total} scanned, ${result.newFiles} added${removedPart}`;
      admStatus(`Re-index complete — ${msg}. Showing newest indexed first.`, 'ok', 10000);
      if (resultSpan) { resultSpan.style.color = '#6fbb6f'; resultSpan.textContent = msg; }
    } else {
      admStatus('Re-index failed: ' + result.error, 'err');
      if (resultSpan) { resultSpan.style.color = '#e07070'; resultSpan.textContent = '✗ ' + result.error; }
    }
  } finally {
    window.electronAPI.removeReindexProgress();
    if (btn) { btn.disabled = false; btn.textContent = 'Re-index folder'; }
  }
}

function mediaPanelFilterSpecies() {
  const q = (document.getElementById('mpanel-sp-search').value || '').toLowerCase().trim();
  document.querySelectorAll('#mpanel-species .media-sp-label').forEach(label => {
    label.style.display = (!q || (label.dataset.name || '').includes(q)) ? '' : 'none';
  });
}

function mediaTagKeydown(e) {
  if (e.key === 'Enter') { e.preventDefault(); mediaAddPendingTag(); }
}

function mediaAddPendingTag() {
  const nameEl = document.getElementById('mpanel-tag-name');
  const catEl  = document.getElementById('mpanel-tag-cat');
  const name   = (nameEl.value || '').trim().toLowerCase();
  if (!name) return;
  if (mediaPendingTags.some(t => t.name === name)) { nameEl.value = ''; return; }
  mediaPendingTags.push({ id: null, name, category: (catEl.value || '').trim() || null });
  nameEl.value = '';
  catEl.value  = '';
  nameEl.focus();
  mediaRenderTagChips();
}

function mediaRemovePendingTag(idx) {
  mediaPendingTags.splice(idx, 1);
  mediaRenderTagChips();
}

function mediaRenderTagChips() {
  const el = document.getElementById('mpanel-tag-chips');
  if (!el) return;
  el.innerHTML = mediaPendingTags.map((t, i) =>
    `<span class="media-tag-chip">
      ${t.category ? `<span style="color:#3a5060;font-size:10px">${escHtml(t.category)}:</span> ` : ''}${escHtml(t.name)}
      <button onclick="mediaRemovePendingTag(${i})">×</button>
    </span>`
  ).join('');
}

async function mediaUpsertTags(tags) {
  if (!tags.length) return [];
  const ids     = tags.filter(t => t.id).map(t => t.id);
  const newTags = tags.filter(t => !t.id);
  if (!newTags.length) return ids;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/media_tags`, {
    method: 'POST',
    headers: { ...HEADERS, 'Prefer': 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(newTags.map(t => ({ name: t.name, category: t.category || null })))
  });
  const inserted = await res.json();
  if (Array.isArray(inserted)) inserted.forEach(t => ids.push(t.id));
  return ids;
}

async function mediaDeleteInsert(table, mediaId, rows) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?media_id=eq.${mediaId}`, { method: 'DELETE', headers: HEADERS });
  if (rows.length) {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST', headers: HEADERS, body: JSON.stringify(rows)
    });
  }
}

async function mediaSave() {
  if (!mediaSelectedId) return;
  const id       = mediaSelectedId;
  const statusEl = document.getElementById('media-save-status');
  if (statusEl) statusEl.textContent = 'Saving…';

  const capturedDate = document.getElementById('mpanel-date')?.value || null;
  const description  = document.getElementById('mpanel-description')?.value.trim() || null;
  const notes        = document.getElementById('mpanel-notes')?.value.trim() || null;
  const speciesIds   = [...document.querySelectorAll('#mpanel-species input[type=checkbox]:checked')].map(e => parseInt(e.value));
  const biomeIds     = [...document.querySelectorAll('#mpanel-biomes input[type=checkbox]:checked')].map(e => parseInt(e.value));
  const systemIds    = [...document.querySelectorAll('#mpanel-systems input[type=checkbox]:checked')].map(e => parseInt(e.value));
  const chronicleVal = document.getElementById('mpanel-chronicle')?.value;
  const chronicleId  = chronicleVal ? parseInt(chronicleVal) : null;

  try {
    const tagIds = await mediaUpsertTags(mediaPendingTags);

    await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/media_assets?id=eq.${id}`, {
        method: 'PATCH', headers: { ...HEADERS, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ captured_date: capturedDate || null, description, notes })
      }),
      mediaDeleteInsert('media_species',   id, speciesIds.map(s => ({ media_id: id, species_id: s }))),
      mediaDeleteInsert('media_biomes',    id, biomeIds.map(b => ({ media_id: id, biome_id: b }))),
      mediaDeleteInsert('media_systems',   id, systemIds.map(s => ({ media_id: id, system_id: s }))),
      mediaDeleteInsert('media_chronicles',id, chronicleId ? [{ media_id: id, chronicle_id: chronicleId }] : []),
      mediaDeleteInsert('media_tag_links', id, tagIds.map(t => ({ media_id: id, tag_id: t })))
    ]);

    if (mediaCurrentState) {
      mediaCurrentState.asset.captured_date = capturedDate;
      mediaCurrentState.asset.description   = description;
      mediaCurrentState.asset.notes         = notes;
      mediaCurrentState.taggedSpecies        = new Set(speciesIds);
      mediaCurrentState.taggedBiomes         = new Set(biomeIds);
      mediaCurrentState.taggedSystems        = new Set(systemIds);
      mediaCurrentState.taggedChronicle      = chronicleId;
    }
    mediaRenderViewTab();

    if (statusEl) {
      statusEl.textContent = 'Saved ✓';
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2500);
    }
    admLoadMedia();

  } catch(e) {
    console.error(e);
    if (statusEl) statusEl.textContent = 'Error: ' + e.message;
  }
}

function mediaClearTags() {
  if (!confirm('Clear all tags for this file?')) return;
  document.querySelectorAll('#mpanel-species input[type=checkbox]').forEach(el => el.checked = false);
  document.querySelectorAll('#mpanel-biomes input[type=checkbox]').forEach(el => el.checked = false);
  document.querySelectorAll('#mpanel-systems input[type=checkbox]').forEach(el => el.checked = false);
  const ch = document.getElementById('mpanel-chronicle');
  if (ch) ch.value = '';
  mediaPendingTags = [];
  mediaRenderTagChips();
}
