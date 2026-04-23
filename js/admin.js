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

// ── Utilities ──────────────────────────────────────────

function admStorageUrl(bucket, filename) {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${filename}`;
}

async function admConvertToWebP(file, maxDimension = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      let { naturalWidth: w, naturalHeight: h } = img;
      if (w > maxDimension || h > maxDimension) {
        if (w > h) { h = Math.round(h * maxDimension / w); w = maxDimension; }
        else       { w = Math.round(w * maxDimension / h); h = maxDimension; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(objectUrl);
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('WebP conversion failed')); return; }
        const webpName = file.name.replace(/\.[^.]+$/, '') + '.webp';
        resolve(new File([blob], webpName, { type: 'image/webp' }));
      }, 'image/webp', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Image load failed')); };
    img.src = objectUrl;
  });
}

async function admUploadToStorage(bucket, filename, file) {
  // Convert to WebP before uploading (matches Flask backend behavior)
  let uploadFile = file;
  try {
    uploadFile = await admConvertToWebP(file);
    filename = filename.replace(/\.[^.]+$/, '.webp');
  } catch(e) {
    console.warn('WebP conversion failed, uploading original:', e);
  }
  const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${filename}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'image/webp',
      'x-upsert': 'true'
    },
    body: uploadFile
  });
  return r.ok ? filename : null;
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

function admStatus(msg, type = 'ok') {
  const el = document.getElementById('admin-status');
  el.textContent = msg;
  el.className = 'admin-status ' + type;
  setTimeout(() => { el.className = 'admin-status'; }, 4000);
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
}

function admClearSpeciesForm() {
  admEditingSpeciesId = null;
  document.getElementById('adm-sp-form').reset();
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
    const respData = await resp.json();
    const savedSpecies = Array.isArray(respData) ? respData[0] : respData;
    const speciesId = savedSpecies?.id || admEditingSpeciesId;
    const slug = savedSpecies?.slug || admSpeciesList.find(s => s.id === speciesId)?.slug || 'species';
    await admUploadAndLinkSpeciesImage(speciesId, slug, imgInput.files[0]);
  }

  admStatus(admEditingSpeciesId ? 'Species updated.' : 'Species added.', 'ok');
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
  await admUploadAndLinkSpeciesImage(admImgSpeciesId, admImgSpeciesSlug, input.files[0]);
  input.value = '';
  admRefreshImageGrid();
}

async function admUploadAndLinkSpeciesImage(speciesId, slug, file) {
  const base = `${slug || 'species'}-${Date.now()}`;
  const savedName = await admUploadToStorage('images', base + '.jpg', file);
  if (!savedName) { admStatus('Image upload failed.', 'err'); return; }
  const existing = await api(`species_images?species_id=eq.${speciesId}&select=id`);
  const isPrimary = existing.length === 0;
  await fetch(`${SUPABASE_URL}/rest/v1/species_images`, {
    method: 'POST',
    headers: { ...HEADERS, 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      species_id: speciesId, filename: savedName, is_primary: isPrimary,
      upload_date: new Date().toISOString()
    })
  });
  if (isPrimary) {
    await fetch(`${SUPABASE_URL}/rest/v1/species?id=eq.${speciesId}`, {
      method: 'PATCH', headers: { ...HEADERS, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ image_url: admStorageUrl('images', savedName) })
    });
  }
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
    const data = await r.json();
    const filename = data[0]?.filename;
    if (filename) {
      await fetch(`${SUPABASE_URL}/rest/v1/species?id=eq.${admImgSpeciesId}`, {
        method: 'PATCH', headers: { ...HEADERS, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ image_url: admStorageUrl('images', filename) })
      });
    }
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
  if (imgFile) {
    const savedName = await admUploadToStorage('images', `biosphere-${Date.now()}.jpg`, imgFile);
    if (savedName) payload.image_filename = savedName;
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
  else admStatus('Error saving biosphere profile.', 'err');
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
  if (imgFile) {
    const slug = (payload.name || 'biome').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const savedName = await admUploadToStorage('images', `${slug}-${Date.now()}.jpg`, imgFile);
    if (savedName) payload.image_filename = savedName;
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
  else admStatus('Error saving biome.', 'err');
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
  if (imgFile && !payload.youtube_url) {
    const savedName = await admUploadToStorage('chronicles-images', `chronicle-${Date.now()}.jpg`, imgFile);
    if (savedName) payload.image_url = admStorageUrl('chronicles-images', savedName);
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
  else admStatus('Error saving chronicle.', 'err');
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
