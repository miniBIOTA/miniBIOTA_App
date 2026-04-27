// ── State ──
let speciesMap     = {};
let biomeMap       = {};
let allLoops       = [];
let allThreads     = [];
let allObs         = [];
let allLinks       = [];  // observation_loop_links
let allThreadLinks = [];  // observation_thread_links
let activeBiomeId      = null;   // null = All
let activeSystemId     = null;   // null = All
let activeSpeciesId    = null;   // null = All
let activeSectionFilter = null;  // null = All | "loops" | "threads" | "obs"
let showResolved       = false;

// Systems are fixed — not fetched from DB
const SYSTEMS = [
  { id: 1, name: "Climate" },
  { id: 2, name: "Rain" },
  { id: 3, name: "Lighting" },
  { id: 4, name: "Wave & Tide" },
  { id: 5, name: "Control System" },
  { id: 6, name: "Enclosure" },
];
const systemMap = Object.fromEntries(SYSTEMS.map(s => [s.id, s.name]));

// date helpers
const TODAY = (() => {
  const d = new Date();
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
})();

const SIXTY_DAYS_AGO = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 60);
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
})();

// ── Load ──
async function loadAll() {
  document.getElementById("last-updated").textContent = "Refreshing...";
  try {
    const [species, biomes, loops, threads, obs, links, threadLinks] = await Promise.all([
      api("species?select=id,common_name"),
      api("biomes?select=id,name"),
      api("open_loops?select=*&order=opened_at.desc"),
      api("story_threads?select=*&became_pipeline_id=is.null&order=created_at.desc"),
      api("observations?select=*&observed_at=gte." + SIXTY_DAYS_AGO + "&order=observed_at.desc"),
      api("observation_loop_links?select=*"),
      api("observation_thread_links?select=*")
    ]);

    speciesMap     = {};
    biomeMap       = {};
    species.forEach(s => speciesMap[s.id] = s.common_name);
    biomes.forEach(b => biomeMap[b.id]   = b.name);
    allLoops       = loops;
    allThreads     = threads;
    allObs         = obs;
    allLinks       = links;
    allThreadLinks = threadLinks;

    buildBiomeTabs(biomes);
    buildSystemTabs();
    buildSpeciesTabs();
    buildSectionTabs();
    render();

    const now = new Date();
    document.getElementById("last-updated").textContent =
      "Last updated " + now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    document.getElementById("last-updated").textContent = "Error loading data";
    console.error(e);
  }
}

// ── Section filter tabs ──
const SECTION_OPTIONS = [
  { key: null,      label: "All" },
  { key: "loops",   label: "Open Loops" },
  { key: "threads", label: "Story Threads" },
  { key: "obs",     label: "Observations" },
];

function buildSectionTabs() {
  const container = document.getElementById("section-tabs");
  container.innerHTML =
    `<span class="filter-label">Show</span>` +
    SECTION_OPTIONS.map(o =>
      `<button class="section-tab ${activeSectionFilter === o.key ? "active" : ""}" onclick="setSectionFilter(${o.key === null ? "null" : `'${o.key}'`})">${o.label}</button>`
    ).join("");
}

function setSectionFilter(type) {
  activeSectionFilter = type;
  buildSectionTabs();
  applySectionVisibility();
}

function applySectionVisibility() {
  const show = activeSectionFilter;
  document.getElementById("section-loops").style.display   = (!show || show === "loops")   ? "" : "none";
  document.getElementById("section-threads").style.display = (!show || show === "threads") ? "" : "none";
  document.getElementById("section-obs").style.display     = (!show || show === "obs")     ? "" : "none";
}

// ── Biome tabs ──
function buildBiomeTabs(biomes) {
  const usedBiomeIds = new Set([
    ...allLoops.map(l => l.biome_id),
    ...allThreads.map(t => t.biome_id),
    ...allObs.map(o => o.biome_id)
  ]);
  const relevant = biomes.filter(b => usedBiomeIds.has(b.id));

  const container = document.getElementById("biome-tabs");
  container.innerHTML =
    `<span class="filter-label">Biomes</span>` +
    `<button class="biome-tab all ${activeBiomeId === null && activeSystemId === null ? "active" : ""}" onclick="setFilter(null)">All</button>` +
    relevant.map(b =>
      `<button class="biome-tab ${activeBiomeId === b.id ? "active" : ""}" onclick="setFilter(${b.id})">${b.name}</button>`
    ).join("");
}

function buildSystemTabs() {
  const usedSystemIds = new Set([
    ...allLoops.map(l => l.system_id),
    ...allThreads.map(t => t.system_id)
  ].filter(Boolean));

  // show all 6 systems always (engineering content may not exist yet)
  const container = document.getElementById("system-tabs");
  container.innerHTML =
    `<span class="filter-label">Systems</span>` +
    SYSTEMS.map(s =>
      `<button class="system-tab ${activeSystemId === s.id ? "active" : ""} ${!usedSystemIds.has(s.id) ? "dimmed" : ""}" onclick="setSystemFilter(${s.id})">${s.name}</button>`
    ).join("");
}

function setFilter(biomeId) {
  activeBiomeId   = biomeId;
  activeSystemId  = null;
  activeSpeciesId = null;
  render();
  document.querySelectorAll(".biome-tab").forEach(btn => {
    const isAll = btn.classList.contains("all");
    btn.classList.toggle("active",
      isAll ? biomeId === null : btn.textContent === (biomeMap[biomeId] || "")
    );
  });
  document.querySelectorAll(".system-tab").forEach(btn => btn.classList.remove("active"));
  document.querySelectorAll(".species-tab").forEach(btn => btn.classList.remove("active"));
}

function setSystemFilter(systemId) {
  activeSystemId  = activeSystemId === systemId ? null : systemId;
  activeBiomeId   = null;
  activeSpeciesId = null;
  render();
  document.querySelectorAll(".system-tab").forEach(btn => {
    btn.classList.toggle("active", btn.textContent === (systemMap[systemId] || "") && activeSystemId !== null);
  });
  document.querySelectorAll(".biome-tab").forEach(btn => {
    btn.classList.toggle("active", btn.classList.contains("all") && activeSystemId === null && activeSpeciesId === null);
  });
}

// ── Species tabs ──
function buildSpeciesTabs() {
  // only species currently tracked in open loops or active story threads
  const openLoops   = allLoops.filter(l => l.status === "open" || l.status === "advanced");
  const activeIds   = new Set([
    ...openLoops.map(l => l.species_id),
    ...allThreads.map(t => t.species_id)
  ].filter(Boolean));

  const container = document.getElementById("species-tabs");
  if (!activeIds.size) { container.innerHTML = ""; return; }

  const sorted = [...activeIds].sort((a, b) =>
    (speciesMap[a] || "").localeCompare(speciesMap[b] || "")
  );

  container.innerHTML =
    `<span class="filter-label">Species</span>` +
    sorted.map(id =>
      `<button class="species-tab ${activeSpeciesId === id ? "active" : ""}" onclick="setSpeciesFilter(${id})">${escHtml(speciesMap[id] || "Species " + id)}</button>`
    ).join("");
}

function setSpeciesFilter(speciesId) {
  activeSpeciesId = activeSpeciesId === speciesId ? null : speciesId;
  activeBiomeId   = null;
  activeSystemId  = null;
  render();
  document.querySelectorAll(".species-tab").forEach(btn => {
    btn.classList.toggle("active", btn.textContent === (speciesMap[speciesId] || "") && activeSpeciesId !== null);
  });
  document.querySelectorAll(".biome-tab").forEach(btn => {
    btn.classList.toggle("active", btn.classList.contains("all") && activeSpeciesId === null);
  });
  document.querySelectorAll(".system-tab").forEach(btn => btn.classList.remove("active"));
}

function toggleResolved() {
  showResolved = !showResolved;
  document.getElementById("resolved-toggle").textContent =
    showResolved ? "Hide resolved" : "Show resolved";
  render();
}

// ── Render all sections ──
function render() {
  const openLoops = allLoops.filter(l => l.status === "open" || l.status === "advanced");

  // build most-recent-obs per species
  const lastObsBySpecies = {};
  allObs.forEach(o => {
    if (o.species_id && !lastObsBySpecies[o.species_id]) {
      lastObsBySpecies[o.species_id] = o;
    }
  });

  renderStats(openLoops);
  renderLoops(openLoops, lastObsBySpecies);
  renderThreads(openLoops);
  renderObs(openLoops);
  buildSystemTabs();       // refresh dimmed states after data renders
  buildSpeciesTabs();      // rebuild from current open loops + threads
  applySectionVisibility();
}

// ── Stats (always global, not filtered) ──
function renderStats(openLoops) {
  const open     = allLoops.filter(l => l.status === "open").length;
  const advanced = allLoops.filter(l => l.status === "advanced").length;
  const resolved = allLoops.filter(l => l.status === "resolved").length;
  const todayObs = allObs.filter(o => (o.observed_at || "").startsWith(TODAY)).length;

  document.getElementById("stats").innerHTML = `
    <div class="stat"><div class="stat-num">${open}</div><div class="stat-label">Open Loops</div></div>
    <div class="stat"><div class="stat-num">${advanced}</div><div class="stat-label">Advanced</div></div>
    <div class="stat"><div class="stat-num">${resolved}</div><div class="stat-label">Resolved</div></div>
    <div class="stat"><div class="stat-num">${allThreads.length}</div><div class="stat-label">Story Threads</div></div>
    <div class="stat"><div class="stat-num">${todayObs}</div><div class="stat-label">Today</div></div>
  `;
}

// ── Loops ──
function renderLoops(openLoops, lastObsBySpecies) {
  let loops = showResolved ? allLoops : allLoops.filter(l => l.status !== "resolved");

  if (activeBiomeId !== null) {
    loops = loops.filter(l => l.biome_id === activeBiomeId);
  } else if (activeSystemId !== null) {
    loops = loops.filter(l => l.system_id === activeSystemId);
  } else if (activeSpeciesId !== null) {
    loops = loops.filter(l => l.species_id === activeSpeciesId);
  }

  document.getElementById("loops-count").textContent = loops.length;

  if (!loops.length) {
    document.getElementById("loops-container").innerHTML =
      '<div class="loading">No loops match the current filter.</div>';
    return;
  }

  document.getElementById("loops-container").innerHTML = loops.map(loop => {
    const speciesName = loop.species_id ? (speciesMap[loop.species_id] || `Species ${loop.species_id}`) : null;
    const biomeName   = loop.biome_id   ? (biomeMap[loop.biome_id]     || `Biome ${loop.biome_id}`)     : null;
    const systemName  = loop.system_id  ? (systemMap[loop.system_id]   || `System ${loop.system_id}`)   : null;

    const meta = [
      statusTag(loop.status),
      scopeTag(loop.scope),
      biomeName   ? `<span class="tag tag-biome">${escHtml(biomeName)}</span>`     : "",
      speciesName ? `<span class="tag tag-species">${escHtml(speciesName)}</span>` : "",
      systemName  ? `<span class="tag tag-system">${escHtml(systemName)}</span>`   : "",
      loop.opened_at ? `<span class="card-date">Opened ${loop.opened_at}</span>` : ""
    ].filter(Boolean).join("");

    const notesHtml = loop.notes
      ? `<details><summary>&#9654; Notes</summary><div class="card-note expanded" style="margin-top:6px">${escHtml(loop.notes)}</div></details>`
      : "";

    // confirmed linked observations for this loop
    const linkedObsForLoop = allLinks
      .filter(lk => lk.loop_id === loop.id)
      .map(lk => {
        const o = allObs.find(o => o.id === lk.observation_id);
        return o ? { obs: o, note: lk.note } : null;
      })
      .filter(Boolean);

    const linkedObsHtml = linkedObsForLoop.length
      ? linkedObsForLoop.map(lk =>
          `<div class="linked-obs">
            <span class="obs-link-date">${lk.obs.observed_at}</span>
            <span class="obs-link-note">${escHtml((lk.obs.note || "").slice(0, 100))}${(lk.obs.note || "").length > 100 ? "…" : ""}</span>
            ${lk.note ? `<div style="margin-top:3px;color:#3a6a4a;font-style:italic">${escHtml(lk.note)}</div>` : ""}
          </div>`
        ).join("")
      : "";

    // species last-known state
    let lastStateHtml = "";
    if (loop.species_id && lastObsBySpecies[loop.species_id]) {
      const lo = lastObsBySpecies[loop.species_id];
      const preview = (lo.note || "").slice(0, 120) + ((lo.note || "").length > 120 ? "…" : "");
      lastStateHtml = `
        <div class="species-state">
          <strong>Last observed ${escHtml(speciesName)}</strong>
          <span class="obs-date">${lo.observed_at}</span>
          <br>${escHtml(preview)}
        </div>`;
    }

    return `
      <div class="card">
        <div class="card-title" style="margin-bottom:8px">${escHtml(loop.loop_text)}</div>
        <div class="card-meta">${meta}</div>
        ${linkedObsHtml}
        ${lastStateHtml}
        ${notesHtml}
      </div>`;
  }).join("");
}

// ── Story Threads ──
async function setThreadStatus(threadId, newStatus) {
  await fetch(SUPABASE_URL + "/rest/v1/story_threads?id=eq." + threadId, {
    method: "PATCH",
    headers: { ...HEADERS, "Prefer": "return=minimal" },
    body: JSON.stringify({ status: newStatus })
  });
  await loadAll();
}

function renderThreads(openLoops) {
  let threads = allThreads;
  if (activeBiomeId !== null) {
    threads = threads.filter(t => t.biome_id === activeBiomeId);
  } else if (activeSystemId !== null) {
    threads = threads.filter(t => t.system_id === activeSystemId);
  } else if (activeSpeciesId !== null) {
    threads = threads.filter(t => t.species_id === activeSpeciesId);
  }

  // sort: story_ready first, then in_production, then developing
  const statusOrder = { story_ready: 0, in_production: 1, developing: 2 };
  threads = [...threads].sort((a, b) =>
    (statusOrder[a.status] ?? 2) - (statusOrder[b.status] ?? 2)
  );

  document.getElementById("threads-count").textContent = threads.length;

  if (!threads.length) {
    document.getElementById("threads-container").innerHTML =
      '<div class="loading">No story threads match the current filter.</div>';
    return;
  }

  document.getElementById("threads-container").innerHTML = threads.map(t => {
    const speciesName = t.species_id ? (speciesMap[t.species_id] || `Species ${t.species_id}`) : null;
    const biomeName   = t.biome_id   ? (biomeMap[t.biome_id]     || `Biome ${t.biome_id}`)     : null;
    const systemName  = t.system_id  ? (systemMap[t.system_id]   || `System ${t.system_id}`)   : null;
    const status      = t.status || "developing";

    const attachedLoops = openLoops.filter(l =>
      (t.species_id && l.species_id === t.species_id) ||
      (t.biome_id   && l.biome_id   === t.biome_id)
    );

    // status action button
    let actionBtn = "";
    if (status === "developing") {
      actionBtn = `<button onclick="setThreadStatus(${t.id}, 'story_ready')" style="background:none;border:1px solid #3a3010;color:#6a5020;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;white-space:nowrap" onmouseover="this.style.color='#d4a040';this.style.borderColor='#5a3a10'" onmouseout="this.style.color='#6a5020';this.style.borderColor='#3a3010'">Mark ready</button>`;
    } else if (status === "story_ready") {
      actionBtn = `<button onclick="setThreadStatus(${t.id}, 'developing')" style="background:none;border:1px solid #2a3a25;color:#3a6a3a;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;white-space:nowrap" onmouseover="this.style.color='#6a9a6a'" onmouseout="this.style.color='#3a6a3a'">Unmark</button>`;
    }

    const statusCls = { developing: "tag-developing", story_ready: "tag-story-ready", in_production: "tag-in-production" }[status] || "tag-developing";
    const statusLabel = { developing: "developing", story_ready: "story ready", in_production: "in production" }[status] || status;

    const meta = [
      `<span class="tag ${statusCls}">${statusLabel}</span>`,
      scopeTag(t.scope),
      biomeName   ? `<span class="tag tag-biome">${escHtml(biomeName)}</span>`     : "",
      speciesName ? `<span class="tag tag-species">${escHtml(speciesName)}</span>` : "",
      systemName  ? `<span class="tag tag-system">${escHtml(systemName)}</span>`   : "",
      `<span class="card-date">${t.created_at ? t.created_at.slice(0, 10) : ""}</span>`,
      actionBtn
    ].filter(Boolean).join("");

    const desc = t.description
      ? `<div class="card-note">${escHtml(t.description)}</div>`
      : "";

    const loopBadge = attachedLoops.length
      ? attachedLoops.map(l =>
          `<div class="intersection-label confirmed">&#9679; Audience question: ${escHtml(l.loop_text.slice(0, 80))}${l.loop_text.length > 80 ? "…" : ""}</div>`
        ).join("")
      : "";

    // confirmed linked observations for this thread
    const linkedObs = allThreadLinks
      .filter(lk => lk.thread_id === t.id)
      .map(lk => {
        const o = allObs.find(o => o.id === lk.observation_id);
        return o ? { obs: o, note: lk.note } : null;
      })
      .filter(Boolean);

    const linkedObsHtml = linkedObs.length
      ? linkedObs.map(lk =>
          `<div class="linked-obs">
            <span class="obs-link-date">${lk.obs.observed_at}</span>
            <span class="obs-link-note">${escHtml((lk.obs.note || "").slice(0, 100))}${(lk.obs.note || "").length > 100 ? "…" : ""}</span>
            ${lk.note ? `<div style="margin-top:3px;color:#3a6a4a;font-style:italic">${escHtml(lk.note)}</div>` : ""}
          </div>`
        ).join("")
      : "";

    const borderStyle = status === "story_ready"
      ? "border-color:#5a3a10;background:#141008"
      : status === "in_production"
      ? "border-color:#2a4a2a;background:#0e140e"
      : "";

    return `
      <div class="card" style="${borderStyle}">
        <div class="card-title" style="margin-bottom:8px">${escHtml(t.title || "(untitled)")}</div>
        <div class="card-meta">${meta}</div>
        ${desc}${linkedObsHtml}${loopBadge}
      </div>`;
  }).join("");
}

// ── Observations ──
function renderObs(openLoops) {
  let obs = allObs;
  if (activeBiomeId !== null) {
    obs = obs.filter(o => o.biome_id === activeBiomeId);
  }

  // separate today vs earlier (startsWith handles both date and timestamptz formats)
  const todayObs  = obs.filter(o => (o.observed_at || "").startsWith(TODAY));
  const olderObs  = obs.filter(o => !(o.observed_at || "").startsWith(TODAY));
  const displayed = [...todayObs, ...olderObs];

  document.getElementById("obs-count").textContent =
    todayObs.length ? `${displayed.length} · ${todayObs.length} today` : displayed.length;

  if (!displayed.length) {
    document.getElementById("obs-container").innerHTML =
      '<div class="loading">No observations match the current filter.</div>';
    return;
  }

  document.getElementById("obs-container").innerHTML = displayed.map(o => {
    const isToday     = (o.observed_at || "").startsWith(TODAY);
    const speciesName = o.species_id ? (speciesMap[o.species_id] || `Species ${o.species_id}`) : null;
    const biomeName   = o.biome_id   ? (biomeMap[o.biome_id]     || `Biome ${o.biome_id}`)     : null;

    // confirmed links from observation_loop_links table
    const confirmedLinks = allLinks
      .filter(lk => lk.observation_id === o.id)
      .map(lk => ({
        loop: openLoops.find(l => l.id === lk.loop_id),
        note: lk.note
      }))
      .filter(lk => lk.loop);

    const meta = [
      isToday
        ? `<span class="card-date" style="color:#4a8a6a;font-weight:600">Today</span>`
        : `<span class="card-date">${o.observed_at}</span>`,
      biomeName   ? `<span class="tag tag-biome">${escHtml(biomeName)}</span>`   : "",
      speciesName ? `<span class="tag tag-species">${escHtml(speciesName)}</span>` : "",
      o.has_video ? `<span class="tag tag-active">Has video</span>` : "",
    ].filter(Boolean).join("");

    const note    = o.note || "";
    const preview = note.length > 160 ? note.slice(0, 160) + "…" : note;

    // confirmed link badges (real)
    const confirmedBadges = confirmedLinks.map(lk =>
      `<div class="intersection-label confirmed">&#9679; Advances loop: ${escHtml(lk.loop.loop_text.slice(0, 65))}${lk.loop.loop_text.length > 65 ? "…" : ""}
        ${lk.note ? `<div style="margin-top:3px;opacity:0.8">${escHtml(lk.note)}</div>` : ""}
      </div>`
    ).join("");

    return `
      <div class="card${isToday ? " today" : ""}">
        <div class="card-meta">
          <span class="today-pip"></span>
          ${meta}
        </div>
        <details>
          <summary>${escHtml(preview)}</summary>
          <div class="card-note expanded" style="margin-top:6px">${escHtml(note)}</div>
        </details>
        ${confirmedBadges}
      </div>`;
  }).join("");
}

// ── Helpers ──
function scopeTag(scope) {
  const cls = { biome:"tag-biome", species:"tag-species", system:"tag-system", biosphere:"tag-biosphere" }[scope] || "tag-biome";
  return `<span class="tag ${cls}">${scope || "—"}</span>`;
}

function statusTag(status) {
  const cls = { open:"tag-open", advanced:"tag-advanced", resolved:"tag-resolved", active:"tag-active", complete:"tag-complete" }[status] || "tag-active";
  return `<span class="tag ${cls}">${status}</span>`;
}

function escHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Tasks ──
let allTasks       = [];
let tasksShowDone  = false;
let collapsedDomains = new Set();

const DOMAIN_META = {
  company_ops : { cls: "domain-ops",     order: 1 },
  financials  : { cls: "domain-fin",     order: 2 },
  ecosystem   : { cls: "domain-eco",     order: 3 },
  brand       : { cls: "domain-brand",   order: 4 },
  content     : { cls: "domain-content", order: 5 },
  engineering : { cls: "domain-eng",     order: 6 },
  sales       : { cls: "domain-sales",   order: 7 },
  web         : { cls: "domain-web",     order: 8 },
};

async function loadTasks() {
  document.getElementById("tasks-container").innerHTML = '<div class="loading">Loading...</div>';
  try {
    allTasks = await api("tasks?select=*&order=domain.asc,priority.asc");
    renderTasks();
  } catch(e) {
    document.getElementById("tasks-container").innerHTML = '<div class="loading">Error loading tasks.</div>';
  }
}

function renderTasks() {
  const open  = allTasks.filter(t => t.status === "open").length;
  const total = allTasks.length;
  document.getElementById("tasks-total").textContent =
    open + " open" + (total - open > 0 ? ", " + (total - open) + " done" : "");

  // group by domain, then group_label
  const byDomain = {};
  allTasks.forEach(t => {
    if (!byDomain[t.domain]) byDomain[t.domain] = { label: t.domain_label, groups: {} };
    const g = t.group_label || "";
    if (!byDomain[t.domain].groups[g]) byDomain[t.domain].groups[g] = [];
    byDomain[t.domain].groups[g].push(t);
  });

  const domainOrder = Object.keys(byDomain).sort((a, b) =>
    (DOMAIN_META[a]?.order ?? 99) - (DOMAIN_META[b]?.order ?? 99)
  );

  document.getElementById("tasks-container").innerHTML = domainOrder.map(domain => {
    const d          = byDomain[domain];
    const meta       = DOMAIN_META[domain] || { cls: "domain-ops" };
    const domainOpen = allTasks.filter(t => t.domain === domain && t.status === "open").length;
    const domainTotal= allTasks.filter(t => t.domain === domain).length;
    const allDone    = domainOpen === 0;
    const collapsed  = collapsedDomains.has(domain);

    const groupsHtml = Object.entries(d.groups).map(([groupLabel, tasks]) => {
      const taskRows = tasks.map(t => {
        const isDone    = t.status === "done";
        const hiddenCls = isDone && !tasksShowDone ? "done-item hidden-done" : isDone ? "done-item" : "";
        return `<div class="task-item ${hiddenCls}" onclick="toggleTask(${t.id}, '${t.status}')">
          <div class="task-cb ${isDone ? "checked" : ""}"></div>
          <div class="task-label ${isDone ? "done" : ""}">${escHtml(t.task)}</div>
        </div>`;
      }).join("");

      const groupHeader = groupLabel
        ? `<div class="task-group-label">${escHtml(groupLabel)}</div>`
        : "";

      return `<div class="task-group">${groupHeader}${taskRows}</div>`;
    }).join("");

    return `<div class="domain-section">
      <div class="domain-header" onclick="toggleDomain('${domain}')">
        <span class="domain-title ${meta.cls}">${escHtml(d.label)}</span>
        <span class="domain-count ${allDone ? "all-done" : ""}">${domainOpen} open / ${domainTotal}</span>
        <span class="domain-chevron">${collapsed ? "▶" : "▼"}</span>
      </div>
      <div id="domain-body-${domain}" ${collapsed ? 'class="hidden"' : ""}>${groupsHtml}</div>
    </div>`;
  }).join("");
}

async function toggleTask(id, currentStatus) {
  const newStatus = currentStatus === "open" ? "done" : "open";
  // optimistic update
  const t = allTasks.find(t => t.id === id);
  if (t) t.status = newStatus;
  renderTasks();
  // write to Supabase
  await fetch(SUPABASE_URL + "/rest/v1/tasks?id=eq." + id, {
    method: "PATCH",
    headers: { ...HEADERS, "Prefer": "return=minimal" },
    body: JSON.stringify({ status: newStatus })
  });
}

function toggleDomain(domain) {
  if (collapsedDomains.has(domain)) {
    collapsedDomains.delete(domain);
  } else {
    collapsedDomains.add(domain);
  }
  renderTasks();
}

function toggleTasksDone() {
  tasksShowDone = !tasksShowDone;
  const btn = document.getElementById("tasks-show-done-btn");
  btn.textContent = tasksShowDone ? "Hide completed" : "Show completed";
  btn.classList.toggle("active", tasksShowDone);
  renderTasks();
}

// ── Financials ──
const fmtUSD = v => "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

async function loadFinancials() {
  const now = new Date();
  document.getElementById("fin-month").textContent =
    now.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const [revenues, expenses, liabilities, purchases] = await Promise.all([
    api("revenue_streams?select=*&order=period_start.desc"),
    api("operating_expenses?select=*&order=monthly_cost.desc"),
    api("liabilities?select=*&order=balance.desc"),
    api("planned_purchases?select=*&order=priority.asc"),
  ]);

  renderFinStats(revenues, expenses, liabilities);
  renderRevenue(revenues);
  renderBurn(expenses);
  renderLiabilities(liabilities);
  renderPurchases(purchases);
}

function renderFinStats(revenues, expenses, liabilities) {
  // most recent period
  const latestPeriod = revenues.reduce((max, r) => r.period_start > max ? r.period_start : max, "");
  const latestRevs   = revenues.filter(r => r.period_start === latestPeriod);
  const totalRev     = latestRevs.reduce((s, r) => s + parseFloat(r.net_amount || 0), 0);

  // monthly burn (active only)
  const monthlyBurn = expenses
    .filter(e => e.status === "active")
    .reduce((s, e) => s + parseFloat(e.monthly_cost || 0), 0);

  const net = totalRev - monthlyBurn;

  // credit card debt only (exclude capital contribution)
  const ccDebt = liabilities
    .filter(l => l.liability_type !== "Capital Contribution / Sunk Cost" && l.status === "active")
    .reduce((s, l) => s + parseFloat(l.balance || 0), 0);

  const periodLabel = latestPeriod
    ? new Date(latestPeriod + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : "";

  document.getElementById("fin-stat-period").textContent = periodLabel;
  document.getElementById("fin-stat-revenue").textContent = fmtUSD(totalRev);
  document.getElementById("fin-stat-revenue").className   = "fin-stat-num";
  document.getElementById("fin-stat-burn").textContent    = fmtUSD(monthlyBurn);
  document.getElementById("fin-stat-burn").className      = "fin-stat-num";
  document.getElementById("fin-stat-net").textContent     = fmtUSD(net);
  document.getElementById("fin-stat-net").className       = "fin-stat-num" + (net < 0 ? " negative" : "");
  document.getElementById("fin-stat-debt").textContent    = fmtUSD(ccDebt);
  document.getElementById("fin-stat-debt").className      = "fin-stat-num negative";
}

function renderRevenue(revenues) {
  if (!revenues.length) {
    document.getElementById("fin-rev-container").innerHTML = '<div class="fin-placeholder">No revenue data.</div>';
    return;
  }

  // group by period, sorted newest first
  const periods = [...new Set(revenues.map(r => r.period_start))].sort().reverse();
  // show last 3 periods
  const shownPeriods = periods.slice(0, 3);

  document.getElementById("fin-rev-period").textContent =
    new Date(shownPeriods[0] + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });

  // build source × period grid
  const allSources = [...new Set(revenues.map(r => r.source_name))];
  const bySourcePeriod = {};
  revenues.forEach(r => { bySourcePeriod[r.source_name + "|" + r.period_start] = r; });

  document.getElementById("fin-rev-container").innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr>
          <th style="text-align:left;color:#4a3a10;font-weight:500;padding:4px 0;border-bottom:1px solid #2a2010">Source</th>
          ${shownPeriods.map(p =>
            `<th style="text-align:right;color:#4a3a10;font-weight:500;padding:4px 8px;border-bottom:1px solid #2a2010">
              ${new Date(p + "T12:00:00").toLocaleDateString("en-US", { month: "short" })}
            </th>`
          ).join("")}
        </tr>
      </thead>
      <tbody>
        ${allSources.map(src => `
          <tr>
            <td style="color:#8a7a4a;padding:6px 0;border-bottom:1px solid #1a1808">${escHtml(src)}</td>
            ${shownPeriods.map(p => {
              const r = bySourcePeriod[src + "|" + p];
              return `<td style="text-align:right;padding:6px 8px;border-bottom:1px solid #1a1808;color:${r ? "#c8a040" : "#2a2010"}">
                ${r ? fmtUSD(parseFloat(r.net_amount)) : "—"}
                ${r && r.confidence === "estimated" ? `<span style="color:#4a3a10;font-size:10px"> est</span>` : ""}
              </td>`;
            }).join("")}
          </tr>`
        ).join("")}
        <tr>
          <td style="color:#6a5820;padding:6px 0;font-weight:600">Total</td>
          ${shownPeriods.map(p => {
            const total = revenues.filter(r => r.period_start === p).reduce((s, r) => s + parseFloat(r.net_amount || 0), 0);
            return `<td style="text-align:right;padding:6px 8px;color:#c8a040;font-weight:600">${fmtUSD(total)}</td>`;
          }).join("")}
        </tr>
      </tbody>
    </table>`;
}

function renderBurn(expenses) {
  const active    = expenses.filter(e => e.status === "active");
  const inactive  = expenses.filter(e => e.status !== "active");
  const burnTotal = active.reduce((s, e) => s + parseFloat(e.monthly_cost || 0), 0);

  document.getElementById("fin-burn-total").textContent = fmtUSD(burnTotal) + "/mo";

  const rows = e => `<div class="card" style="border-color:#1e1a08;background:#0e0d06;padding:10px 14px;margin-bottom:6px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
      <div style="color:#8a7a4a;font-size:13px">${escHtml(e.vendor)}${e.product_name ? ` <span style="color:#4a3a10">${escHtml(e.product_name)}</span>` : ""}</div>
      <div style="white-space:nowrap">
        <span style="color:#c8a040;font-size:13px;font-weight:500">${fmtUSD(parseFloat(e.monthly_cost || 0))}/mo</span>
        ${e.billing_cadence === "annual" ? `<span style="color:#4a3a10;font-size:11px;margin-left:6px">annual</span>` : ""}
        ${e.next_due_date ? `<span style="color:#3a2a08;font-size:11px;margin-left:6px">due ${e.next_due_date}</span>` : ""}
      </div>
    </div>
    <div style="margin-top:3px"><span style="font-size:11px;color:#3a3010">${escHtml(e.category)}</span></div>
  </div>`;

  document.getElementById("fin-burn-container").innerHTML =
    active.map(rows).join("") +
    (inactive.length ? `<div style="margin-top:12px;margin-bottom:6px;font-size:11px;color:#2a2808;text-transform:uppercase;letter-spacing:.06em">Cancelled</div>` + inactive.map(e =>
      `<div style="padding:6px 0;border-bottom:1px solid #0e0c04;display:flex;justify-content:space-between;opacity:0.5">
        <span style="color:#3a3020;font-size:12px;text-decoration:line-through">${escHtml(e.vendor)}</span>
        <span style="color:#3a3020;font-size:12px">${fmtUSD(parseFloat(e.monthly_cost || 0))}/mo</span>
      </div>`).join("") : "");
}

function renderLiabilities(liabilities) {
  const ccLiabs = liabilities.filter(l => l.liability_type !== "Capital Contribution / Sunk Cost");
  const capital = liabilities.filter(l => l.liability_type === "Capital Contribution / Sunk Cost");
  const totalCC = ccLiabs.reduce((s, l) => s + parseFloat(l.balance || 0), 0);
  const totalMin = ccLiabs.reduce((s, l) => s + parseFloat(l.minimum_payment || 0), 0);

  document.getElementById("fin-liab-total").textContent = fmtUSD(totalCC) + " total";

  const ccHtml = ccLiabs.map(l => {
    const pct = totalCC > 0 ? (parseFloat(l.balance) / totalCC * 100).toFixed(0) : 0;
    return `<div class="card" style="border-color:#2a1010;background:#110808;padding:12px 14px;margin-bottom:6px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div>
          <div style="color:#aa6050;font-size:13px;font-weight:500">${escHtml(l.lender)}</div>
          <div style="color:#4a2020;font-size:11px;margin-top:2px">${escHtml(l.liability_type)}</div>
        </div>
        <div style="text-align:right;white-space:nowrap">
          <div style="color:#cc6040;font-size:15px;font-weight:600">${fmtUSD(parseFloat(l.balance))}</div>
          <div style="color:#3a1a10;font-size:11px">${pct}% of total</div>
        </div>
      </div>
      <div style="display:flex;gap:16px;margin-top:8px;font-size:11px">
        <span style="color:#4a2818">APR <strong style="color:#7a3828">${parseFloat(l.apr_percent).toFixed(1)}%</strong></span>
        <span style="color:#4a2818">Min payment <strong style="color:#7a3828">${fmtUSD(parseFloat(l.minimum_payment || 0))}/mo</strong></span>
        ${l.next_due_date ? `<span style="color:#3a1808">Due ${l.next_due_date}</span>` : ""}
      </div>
      <div style="margin-top:8px;height:3px;background:#1a0808;border-radius:2px">
        <div style="width:${pct}%;height:100%;background:#6a2818;border-radius:2px"></div>
      </div>
    </div>`;
  }).join("");

  const capitalHtml = capital.map(l =>
    `<div style="padding:8px 0;border-bottom:1px solid #1a1808;display:flex;justify-content:space-between">
      <span style="color:#4a3a10;font-size:12px">${escHtml(l.lender)} — ${escHtml(l.liability_type)}</span>
      <span style="color:#6a5020;font-size:12px">${fmtUSD(parseFloat(l.balance))}</span>
    </div>`
  ).join("");

  document.getElementById("fin-liab-container").innerHTML =
    ccHtml +
    `<div style="margin-top:10px;padding:8px 0;display:flex;justify-content:space-between;border-top:1px solid #2a1010">
      <span style="color:#5a2a1a;font-size:12px">Minimum payments / mo</span>
      <span style="color:#aa6040;font-size:12px;font-weight:600">${fmtUSD(totalMin)}</span>
    </div>` +
    (capitalHtml ? `<div style="margin-top:16px;margin-bottom:4px;font-size:11px;color:#3a2a08;text-transform:uppercase;letter-spacing:.06em">Capital</div>` + capitalHtml : "");
}

function renderPurchases(purchases) {
  const approved = purchases.filter(p => p.approval_status === "approved");
  const pending  = purchases.filter(p => p.approval_status !== "approved");
  const totalApproved = approved.reduce((s, p) => s + parseFloat(p.estimated_cost || 0), 0);

  document.getElementById("fin-purchases-total").textContent =
    fmtUSD(purchases.reduce((s, p) => s + parseFloat(p.estimated_cost || 0), 0)) + " queued";

  const row = (p, dim) => `<div class="card" style="border-color:#1a1a10;background:#0e0e08;padding:10px 14px;margin-bottom:6px;${dim ? "opacity:0.5" : ""}">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
      <div>
        <span style="font-size:11px;color:#3a3010;margin-right:6px">#${p.priority}</span>
        <span style="color:#8a8040;font-size:13px">${escHtml(p.item_name)}</span>
      </div>
      <div style="white-space:nowrap">
        <span style="color:#c8a040;font-size:13px;font-weight:500">${fmtUSD(parseFloat(p.estimated_cost || 0))}</span>
        <span style="margin-left:8px;font-size:11px;padding:1px 6px;border-radius:4px;${p.approval_status === "approved" ? "background:#1a1a08;color:#8a8030;border:1px solid #3a3010" : "background:#1a1a18;color:#5a5a60;border:1px solid #2a2a30"}">${escHtml(p.approval_status)}</span>
      </div>
    </div>
    ${p.rationale ? `<div style="color:#3a3a18;font-size:12px;margin-top:4px">${escHtml(p.rationale)}</div>` : ""}
  </div>`;

  document.getElementById("fin-purchases-container").innerHTML =
    purchases.map(p => row(p, false)).join("") +
    (approved.length ? `<div style="margin-top:10px;padding:6px 0;display:flex;justify-content:space-between;border-top:1px solid #1a1a10">
      <span style="color:#4a4020;font-size:12px">Approved spend</span>
      <span style="color:#8a8030;font-size:12px;font-weight:600">${fmtUSD(totalApproved)}</span>
    </div>` : "");
}

// ── Page switching ──
function showPage(page) {
  ["story", "checklist", "tasks", "financials", "sales", "roadmap", "admin", "calendar", "monitoring"].forEach(p => {
    document.getElementById("page-" + p).classList.toggle("hidden", page !== p);
    document.getElementById("tab-" + p).classList.toggle("active", page === p);
  });
  document.getElementById("refresh-btn").classList.toggle("hidden", page !== "story");
  if (page === "story")      { loadAll(); }
  if (page === "checklist")  { loadChecklistState(); if (clView === "cal") renderCalendar(); else renderChecklist(); }
  if (page === "tasks")      { loadTasks(); }
  if (page === "financials") { loadFinancials(); }
  if (page === "sales")      { loadSales(); }
  if (page === "roadmap")    { loadRoadmap(); }
  if (page === "calendar")   { loadCalendar(); }
  if (page === "admin" && !admLoaded) { admLoadAll(); admLoaded = true; }
  if (page === "monitoring") { initMonitoring(); }
}

// ── Checklist definitions ──
const CHECKLIST_ITEMS = {
  plan: [
    { id: "p1", label: "Identify longform story for the week",              sub: "or select a fallback: Flex week / Story bank / Lane 3 fill" },
    { id: "p2", label: "Review active observations for short opportunities", sub: "Which threads have new data? What questions are unanswered?" },
  ],
  short: [
    { id: "film",    label: "Filmed",                                sub: "Vertical, under 60 seconds — capture the moment as it happens" },
    { id: "edit",    label: "Edited to under 60 seconds" },
    { id: "caption", label: "Caption written",                       sub: "Hook in first line, open question at end — no em dashes" },
    { id: "yt",      label: "YouTube Shorts — uploaded",             sub: "Title, hashtags, link in description" },
    { id: "ig",      label: "Instagram Reels — uploaded",            sub: "First 125 chars land the hook" },
    { id: "tt",      label: "TikTok — uploaded",                     sub: "1–2 punchy sentences" },
    { id: "fb",      label: "Facebook Reels — native upload" },
    { id: "pipe",    label: "Pipeline record logged",                sub: "format=short, source_observation_id, platform_urls, notes" },
  ],
  mf: [
    { id: "film",    label: "Filmed",                                  sub: "Unpolished and real — capture the moment as it happens" },
    { id: "edit",    label: "Edited to 61 sec – 5 min" },
    { id: "caption", label: "Master caption written",                  sub: "2–4 sentences, no em dashes" },
    { id: "yt",      label: "YouTube — standard upload (not Shorts)",  sub: "Title, description + Patreon/Ko-fi links, thumbnail, tags, end screen" },
    { id: "pipe",    label: "Pipeline record logged",                  sub: "format=mid, status=published, published_url, published_date" },
  ],
  lf: [
    { id: "script",   label: "Script locked" },
    { id: "editlock", label: "Edit locked",                              sub: "Run full post_production_checklist.md" },
    { id: "patreon",  label: "Patreon early access posted",              sub: "Thursday — 24h before YouTube. Plain title label, no em dashes." },
    { id: "youtube",  label: "YouTube published",                        sub: "Friday or Saturday" },
    { id: "comm",     label: "YouTube Community Tab posted",             sub: "2–3 sentences pulled from Patreon post, optional image" },
    { id: "igpost",   label: "Instagram post published",                 sub: "Visual hook + caption derived from Patreon post — not written from scratch" },
    { id: "igstory",  label: "Instagram Stories CTA",                    sub: "Points to the new video" },
    { id: "sub",      label: "Substack dispatch sent",                   sub: "Full narrative depth. Embed YouTube video — views via embed count toward YT." },
    { id: "dbpipe",   label: "Pipeline: status=published, URL, date" },
    { id: "dbchron",  label: "Chronicle entry created / confirmed",      sub: "Populate chronicle_entry_id in the pipeline record" },
    { id: "dbresolve",label: "Open loops resolved",                      sub: "status=resolved, resolved_by_pipeline_id, resolved_at on each loop ID in frontmatter" },
    { id: "dbseed",   label: "New open loops seeded",                    sub: "From Section 11 forward hooks — loop_text, scope, FK, status=open, opened_at" },
    { id: "dbthread", label: "Story threads closed",                     sub: "Set became_pipeline_id — threads disappear from dashboard automatically" },
  ],
  eow: [
    { id: "nl",       label: "Newsletter dispatched",                    sub: "Recap the arc, link the longform, tease what's developing next" },
    { id: "review",   label: "Template / strategy review",               sub: "Anything to update in _TEMPLATE.md or strategy docs this week?" },
  ]
};

// ── Calendar day definitions (built after CHECKLIST_ITEMS) ──
const LF_WED = ["script"];
const LF_THU = ["editlock", "patreon"];
const LF_FRI_IDS = ["youtube","comm","igpost","igstory","sub","dbpipe","dbchron","dbresolve","dbseed","dbthread"];

function buildCalDays() {
  return [
    {
      name: "Monday",
      parts: [
        { label: "Planning", items: CHECKLIST_ITEMS.plan, prefix: "plan", fallback: true },
        { label: "Daily Short", titleKey: "s1", items: CHECKLIST_ITEMS.short, prefix: "s1" },
      ]
    },
    {
      name: "Tuesday",
      parts: [
        { label: "Daily Short", titleKey: "s2", items: CHECKLIST_ITEMS.short, prefix: "s2" },
      ]
    },
    {
      name: "Wednesday",
      parts: [
        { label: "Daily Short", titleKey: "s3", items: CHECKLIST_ITEMS.short, prefix: "s3" },
        { label: "Longform", items: CHECKLIST_ITEMS.lf.filter(i => LF_WED.includes(i.id)), prefix: "lf" },
      ]
    },
    {
      name: "Thursday",
      parts: [
        { label: "Daily Short", titleKey: "s4", items: CHECKLIST_ITEMS.short, prefix: "s4" },
        { label: "Longform", items: CHECKLIST_ITEMS.lf.filter(i => LF_THU.includes(i.id)), prefix: "lf" },
      ]
    },
    {
      name: "Friday",
      parts: [
        { label: "Daily Short", titleKey: "s5", items: CHECKLIST_ITEMS.short, prefix: "s5" },
        { label: "Longform", titleKey: "lf", items: CHECKLIST_ITEMS.lf.filter(i => LF_FRI_IDS.includes(i.id)), prefix: "lf" },
        { label: "Sunday Close", items: CHECKLIST_ITEMS.eow, prefix: "eow" },
      ]
    },
  ];
}

// ── Checklist state ──
let clView     = "list";
let clState    = {};
let clTitles   = {};
let clFallback = null;
const CL_KEY   = "minibiota_cl_";

function getWeekMonday() {
  const d   = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}

function getWeekRange() {
  const d    = new Date();
  const day  = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon  = new Date(d); mon.setDate(d.getDate() + diff);
  const sun  = new Date(mon); sun.setDate(mon.getDate() + 6);
  const fmt  = dt => dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return fmt(mon) + " – " + fmt(sun);
}

function loadChecklistState() {
  const saved = localStorage.getItem(CL_KEY + getWeekMonday());
  if (saved) {
    const d = JSON.parse(saved);
    clState    = d.state    || {};
    clTitles   = d.titles   || {};
    clFallback = d.fallback || null;
  } else {
    clState = {}; clTitles = {}; clFallback = null;
  }
}

function saveChecklistState() {
  localStorage.setItem(CL_KEY + getWeekMonday(), JSON.stringify({ state: clState, titles: clTitles, fallback: clFallback }));
}

function resetWeek() {
  if (!confirm("Reset all checklist items for this week?")) return;
  localStorage.removeItem(CL_KEY + getWeekMonday());
  clState = {}; clTitles = {}; clFallback = null;
  if (clView === "cal") renderCalendar(); else renderChecklist();
}

function toggleCheck(id) {
  clState[id] = !clState[id];
  saveChecklistState();
  if (clView === "cal") renderCalendar(); else renderChecklist();
}

function saveTitle(key, value) {
  clTitles[key] = value;
  saveChecklistState();
  updateAllProgress();
}

function setFallback(val) {
  clFallback = clFallback === val ? null : val;
  saveChecklistState();
  ["flex","bank","lane3"].forEach(f => {
    const btn = document.getElementById("fb-" + f);
    if (btn) btn.classList.toggle("active", clFallback === f);
  });
}

function renderCheckItems(containerId, items, prefix) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = items.map(item => {
    const id      = prefix + "-" + item.id;
    const checked = !!clState[id];
    return `<div class="cl-item" onclick="toggleCheck('${id}')">
      <div class="cl-checkbox ${checked ? "checked" : ""}"></div>
      <div class="cl-item-label ${checked ? "done" : ""}">${item.label}${item.sub ? `<span class="cl-item-sub">${item.sub}</span>` : ""}</div>
    </div>`;
  }).join("");
}

function updateProgress(elemId, prefix, items) {
  const el   = document.getElementById(elemId);
  if (!el) return;
  const done  = items.filter(i => clState[prefix + "-" + i.id]).length;
  el.textContent = done + " / " + items.length;
  el.classList.toggle("done", done === items.length);
}

function updateAllProgress() {
  updateProgress("prog-plan",  "plan",  CHECKLIST_ITEMS.plan);
  updateProgress("prog-short", "short", CHECKLIST_ITEMS.short);
  updateProgress("prog-mf",    "mf",    CHECKLIST_ITEMS.mf);
  updateProgress("prog-lf",    "lf",    CHECKLIST_ITEMS.lf);
  updateProgress("prog-eow",   "eow",   CHECKLIST_ITEMS.eow);
}

function renderChecklist() {
  document.getElementById("week-range").textContent = getWeekRange();
  ["flex","bank","lane3"].forEach(f => {
    const btn = document.getElementById("fb-" + f);
    if (btn) btn.classList.toggle("active", clFallback === f);
  });
  ["short","mf","lf"].forEach(key => {
    const inp = document.getElementById("title-" + key);
    if (inp) inp.value = clTitles[key] || "";
  });
  renderCheckItems("cl-plan",  CHECKLIST_ITEMS.plan,  "plan");
  renderCheckItems("cl-short", CHECKLIST_ITEMS.short, "short");
  renderCheckItems("cl-mf",    CHECKLIST_ITEMS.mf,    "mf");
  renderCheckItems("cl-lf",    CHECKLIST_ITEMS.lf,    "lf");
  renderCheckItems("cl-eow",   CHECKLIST_ITEMS.eow,   "eow");
  updateAllProgress();
}

function setClView(v) {
  clView = v;
  document.getElementById("cl-list-view").classList.toggle("hidden", v !== "list");
  document.getElementById("cl-cal-view").classList.toggle("hidden", v !== "cal");
  document.getElementById("cl-view-list").classList.toggle("active", v === "list");
  document.getElementById("cl-view-cal").classList.toggle("active", v === "cal");
  if (v === "cal") renderCalendar(); else renderChecklist();
}

function renderCalendar() {
  const wr = document.getElementById("week-range");
  if (wr) wr.textContent = getWeekRange();
  const grid = document.getElementById("cal-grid");
  if (!grid) return;

  const todayDow = new Date().getDay();
  const todayIdx = (todayDow >= 1 && todayDow <= 5) ? todayDow - 1 : -1;

  grid.innerHTML = buildCalDays().map((day, di) => {
    let allIds = [];
    day.parts.forEach(p => p.items.forEach(item => allIds.push(p.prefix + "-" + item.id)));
    const done    = allIds.filter(id => clState[id]).length;
    const isToday = di === todayIdx;

    let html = `<div class="cal-day${isToday ? " today" : ""}">
      <div class="cal-day-header">
        <div class="cal-day-name">${day.name}</div>
        <div class="cal-day-prog${done === allIds.length && allIds.length > 0 ? " done" : ""}">${done}/${allIds.length}</div>
      </div>`;

    day.parts.forEach(p => {
      if (p.label) html += `<div class="cal-section-lbl">${p.label}</div>`;
      if (p.fallback) {
        html += `<div class="cal-fallback">`;
        [["flex","Flex week"],["bank","Story bank"],["lane3","Lane 3 fill"]].forEach(([f, lbl]) => {
          html += `<button class="fallback-btn${clFallback === f ? " active" : ""}" onclick="event.stopPropagation();setFallback('${f}')">${lbl}</button>`;
        });
        html += `</div>`;
      }
      if (p.titleKey) {
        const val = (clTitles[p.titleKey] || "").replace(/"/g, "&quot;");
        html += `<input class="cal-ti" id="cal-ti-${p.titleKey}" placeholder="Story title..." value="${val}" oninput="saveTitle('${p.titleKey}', this.value)">`;
      }
      p.items.forEach(item => {
        const id      = p.prefix + "-" + item.id;
        const checked = !!clState[id];
        html += `<div class="cal-item" onclick="toggleCheck('${id}')">
          <div class="cl-checkbox ${checked ? "checked" : ""}"></div>
          <div class="cl-item-label ${checked ? "done" : ""}">${item.label}${item.sub ? `<span class="cl-item-sub">${item.sub}</span>` : ""}</div>
        </div>`;
      });
    });

    html += `</div>`;
    return html;
  }).join("");
}

// ── Sales Pipeline ──
const SALES_GOAL = 2000;
const STATUS_CYCLE = ["not_contacted","outreach_sent","in_conversation","gifting_only","closed_won","closed_lost"];
const STATUS_LABEL = {
  not_contacted:   "Not contacted",
  outreach_sent:   "Outreach sent",
  in_conversation: "In conversation",
  gifting_only:    "Gifting only",
  closed_won:      "Closed — Won",
  closed_lost:     "Closed — Lost"
};

let allPartners = [];

async function loadSales() {
  const now = new Date();
  document.getElementById("sales-month").textContent =
    now.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const [partners, revenues, salesTasks] = await Promise.all([
    api("partner_opportunities?select=*&order=next_action_date.asc"),
    api("revenue_streams?select=*&order=period_start.desc"),
    api("tasks?select=*&domain=eq.sales&status=eq.open&order=priority.asc")
  ]);

  allPartners = partners;
  renderGoalBar(revenues);
  renderSalesStats(partners);
  renderPipeline(partners);
  renderSalesTasks(salesTasks);
}

function renderGoalBar(revenues) {
  const latestPeriod = revenues.reduce((max, r) => r.period_start > max ? r.period_start : max, "");
  const latestRevs   = revenues.filter(r => r.period_start === latestPeriod);
  const totalRev     = latestRevs.reduce((s, r) => s + parseFloat(r.net_amount || 0), 0);
  const pct          = Math.min(100, Math.round(totalRev / SALES_GOAL * 100));
  const gap          = Math.max(0, SALES_GOAL - totalRev);
  const periodLabel  = latestPeriod
    ? new Date(latestPeriod + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : "";

  document.getElementById("goal-current").textContent = fmtUSD(totalRev) + "/mo";
  document.getElementById("goal-bar").style.width = pct + "%";
  document.getElementById("goal-sublabel").textContent =
    pct >= 100
      ? "Goal reached."
      : `${pct}% of goal — ${fmtUSD(gap)} gap to close${periodLabel ? " (" + periodLabel + ")" : ""}`;
}

function renderSalesStats(partners) {
  const active  = partners.filter(p => !["closed_won","closed_lost"].includes(p.current_status)).length;
  const won     = partners.filter(p => p.current_status === "closed_won").length;
  const warm    = partners.filter(p => ["in_conversation","gifting_only"].includes(p.current_status)).length;
  const estVal  = partners.filter(p => !["closed_lost"].includes(p.current_status))
                          .reduce((s, p) => s + parseFloat(p.estimated_value || 0), 0);

  document.getElementById("sales-stats").innerHTML = `
    <div class="sales-stat"><div class="sales-stat-num">${active}</div><div class="sales-stat-label">Active</div></div>
    <div class="sales-stat"><div class="sales-stat-num">${warm}</div><div class="sales-stat-label">Warm</div></div>
    <div class="sales-stat"><div class="sales-stat-num">${won}</div><div class="sales-stat-label">Won</div></div>
    <div class="sales-stat"><div class="sales-stat-num">${fmtUSD(estVal)}</div><div class="sales-stat-label">Pipeline Value</div></div>
  `;
}

function renderPipeline(partners) {
  document.getElementById("sales-pipeline-count").textContent = partners.length;
  if (!partners.length) {
    document.getElementById("sales-pipeline-container").innerHTML =
      '<div class="loading">No partners in pipeline.</div>';
    return;
  }

  document.getElementById("sales-pipeline-container").innerHTML = partners.map(p => {
    const status    = p.current_status || "not_contacted";
    const badgeCls  = "status-badge status-" + status;
    const label     = STATUS_LABEL[status] || status;
    const isClosed  = status === "closed_won" || status === "closed_lost";
    const cardStyle = isClosed ? "opacity:0.5" : "";

    return `
      <div class="pipeline-card" style="${cardStyle}">
        <div class="pipeline-card-header">
          <div>
            <div class="pipeline-org">${escHtml(p.organization_name)}</div>
            <div class="pipeline-opp">${escHtml(p.opportunity_name || "")}</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
            <span class="${badgeCls}" onclick="cycleStatus(${p.id}, '${status}')" title="Click to advance status">${label}</span>
            ${p.estimated_value ? `<span class="pipeline-value">${fmtUSD(parseFloat(p.estimated_value))}/video est.</span>` : ""}
          </div>
        </div>
        ${p.next_action ? `<div class="pipeline-next">&#8594; ${escHtml(p.next_action)}</div>` : ""}
        ${p.next_action_date ? `<div class="pipeline-date">${escHtml(p.next_action_date)}</div>` : ""}
        ${p.notes ? `<div style="margin-top:6px;font-size:12px;color:#3a5a2a;font-style:italic">${escHtml(p.notes)}</div>` : ""}
      </div>`;
  }).join("");
}

async function cycleStatus(id, currentStatus) {
  const idx     = STATUS_CYCLE.indexOf(currentStatus);
  const nextIdx = (idx + 1) % STATUS_CYCLE.length;
  const newStatus = STATUS_CYCLE[nextIdx];
  await fetch(SUPABASE_URL + "/rest/v1/partner_opportunities?id=eq." + id, {
    method: "PATCH",
    headers: { ...HEADERS, "Prefer": "return=minimal" },
    body: JSON.stringify({ current_status: newStatus })
  });
  const p = allPartners.find(p => p.id === id);
  if (p) p.current_status = newStatus;
  renderPipeline(allPartners);
  renderSalesStats(allPartners);
}

function renderSalesTasks(tasks) {
  document.getElementById("sales-tasks-count").textContent = tasks.length + " open";
  if (!tasks.length) {
    document.getElementById("sales-tasks-container").innerHTML =
      '<div class="loading" style="color:#3a5a2a">No open sales tasks.</div>';
    return;
  }
  document.getElementById("sales-tasks-container").innerHTML = tasks.map(t => `
    <div class="task-item" onclick="toggleSalesTask(${t.id}, '${t.status}')">
      <div class="task-cb"></div>
      <div class="task-label">${escHtml(t.task)}</div>
    </div>`
  ).join("");
}

async function toggleSalesTask(id, currentStatus) {
  const newStatus = currentStatus === "open" ? "done" : "open";
  await fetch(SUPABASE_URL + "/rest/v1/tasks?id=eq." + id, {
    method: "PATCH",
    headers: { ...HEADERS, "Prefer": "return=minimal" },
    body: JSON.stringify({ status: newStatus })
  });
  loadSales();
}

// ── Roadmap ──
// Set this once you know your weekly available hours beyond the routine checklist.
const WEEKLY_HOURS_CAPACITY = null;

const CAT_COLORS = {
  speaking:    "#9a70dd",
  course:      "#cc9a40",
  commercial:  "#50a0a0",
  content:     "#5090aa",
  engineering: "#5a80cc",
  general:     "#6a6a8a"
};
const CAT_BG = {
  speaking:    "#2a1550",
  course:      "#3a2010",
  commercial:  "#103a35",
  content:     "#10304a",
  engineering: "#1a2a4a",
  general:     "#2a2a3a"
};

async function loadRoadmap() {
  const now = new Date();
  document.getElementById("roadmap-date").textContent =
    now.toLocaleDateString([], { month: "long", year: "numeric" });
  document.getElementById("roadmap-cards").innerHTML = '<div class="loading">Loading...</div>';
  try {
    const [initiatives, steps] = await Promise.all([
      api("strategic_initiatives?select=*&order=priority.asc,created_at.asc"),
      api("initiative_steps?select=*&order=sort_order.asc,created_at.asc")
    ]);
    const stepsByInit = {};
    steps.forEach(s => {
      if (!stepsByInit[s.initiative_id]) stepsByInit[s.initiative_id] = [];
      stepsByInit[s.initiative_id].push(s);
    });
    renderRoadmapStats(initiatives);
    renderCapacity(initiatives);
    renderTimeline(initiatives);
    renderRoadmapCards(initiatives, stepsByInit);
  } catch(e) {
    document.getElementById("roadmap-cards").innerHTML =
      '<div class="loading" style="color:#aa5050">Error loading initiatives.</div>';
    console.error(e);
  }
}

function renderRoadmapStats(initiatives) {
  const active  = initiatives.filter(i => i.status === "active").length;
  const planned = initiatives.filter(i => i.status === "planned").length;
  const totalRev = initiatives.reduce((s, i) => s + (parseFloat(i.revenue_projection) || 0), 0);
  const totalHrs = initiatives
    .filter(i => ["active","planned"].includes(i.status))
    .reduce((s, i) => s + (parseFloat(i.hours_per_week) || 0), 0);
  document.getElementById("roadmap-stats").innerHTML = `
    <div class="roadmap-stat"><div class="roadmap-stat-num">${initiatives.length}</div><div class="roadmap-stat-label">Initiatives</div></div>
    <div class="roadmap-stat"><div class="roadmap-stat-num">${active}</div><div class="roadmap-stat-label">Active</div></div>
    <div class="roadmap-stat"><div class="roadmap-stat-num">${planned}</div><div class="roadmap-stat-label">Planned</div></div>
    <div class="roadmap-stat"><div class="roadmap-stat-num">${totalHrs > 0 ? totalHrs + "h" : "—"}</div><div class="roadmap-stat-label">Hrs / Wk</div></div>
    <div class="roadmap-stat"><div class="roadmap-stat-num">${totalRev > 0 ? "$" + totalRev.toLocaleString() : "—"}</div><div class="roadmap-stat-label">Rev Projection</div></div>
  `;
}

function renderCapacity(initiatives) {
  const committed = initiatives
    .filter(i => ["active","planned"].includes(i.status))
    .reduce((s, i) => s + (parseFloat(i.hours_per_week) || 0), 0);
  document.getElementById("cap-committed").textContent = committed + " hrs/wk committed";
  if (WEEKLY_HOURS_CAPACITY) {
    const pct      = Math.min(100, Math.round((committed / WEEKLY_HOURS_CAPACITY) * 100));
    const headroom = Math.max(0, WEEKLY_HOURS_CAPACITY - committed);
    const bar      = document.getElementById("cap-bar");
    bar.style.width = pct + "%";
    bar.style.background = pct >= 100
      ? "linear-gradient(90deg,#aa4a30,#dd6040)"
      : pct >= 80
        ? "linear-gradient(90deg,#aa8030,#ddaa40)"
        : "linear-gradient(90deg,#5a50aa,#8a80dd)";
    document.getElementById("cap-available").textContent = "Capacity: " + WEEKLY_HOURS_CAPACITY + " hrs/wk";
    document.getElementById("cap-sublabel").textContent = headroom > 0
      ? headroom + " hrs/wk available for new initiatives"
      : "At or over capacity — review before adding more";
  } else {
    document.getElementById("cap-bar").style.width = "0%";
    document.getElementById("cap-available").textContent = "Set WEEKLY_HOURS_CAPACITY to see headroom";
    document.getElementById("cap-sublabel").textContent = "Weekly hours committed across active + planned initiatives";
  }
}

function renderTimeline(initiatives) {
  const windowStart = new Date();
  windowStart.setDate(1);
  windowStart.setHours(0, 0, 0, 0);
  const windowEnd = new Date(windowStart);
  windowEnd.setMonth(windowEnd.getMonth() + 12);
  const totalMs = windowEnd - windowStart;

  const todayDate = new Date();
  const months = [];
  const cur = new Date(windowStart);
  while (cur < windowEnd) {
    months.push(new Date(cur));
    cur.setMonth(cur.getMonth() + 1);
  }

  document.getElementById("timeline-months").innerHTML =
    `<div style="width:160px;flex-shrink:0"></div>` +
    `<div style="flex:1;display:flex;min-width:200px">` +
    months.map(m => {
      const isCurrent = m.getMonth() === todayDate.getMonth() && m.getFullYear() === todayDate.getFullYear();
      return `<div class="timeline-month${isCurrent ? " current" : ""}" style="flex:1;min-width:50px">${m.toLocaleString("default",{month:"short"})} '${String(m.getFullYear()).slice(2)}</div>`;
    }).join("") +
    `</div>`;

  const withDates    = initiatives.filter(i => i.start_date && i.target_date);
  const withoutDates = initiatives.filter(i => !i.start_date || !i.target_date);

  const bars = withDates.map(init => {
    const s = new Date(init.start_date);
    const e = new Date(init.target_date);
    const clampS = s < windowStart ? windowStart : s;
    const clampE = e > windowEnd   ? windowEnd   : e;
    const leftPct  = Math.max(0, ((clampS - windowStart) / totalMs) * 100);
    const widthPct = Math.max(1, ((clampE - clampS) / totalMs) * 100);
    const color = CAT_COLORS[init.category] || CAT_COLORS.general;
    const bg    = CAT_BG[init.category]    || CAT_BG.general;
    const label = new Date(init.target_date).toLocaleDateString([],{month:"short",year:"2-digit"});
    return `
      <div class="timeline-row">
        <div class="timeline-label" title="${escHtml(init.title)}">${escHtml(init.title)}</div>
        <div class="timeline-track">
          <div class="timeline-bar" style="left:${leftPct.toFixed(1)}%;width:${widthPct.toFixed(1)}%;background:${bg};border:1px solid ${color};color:${color}">${label}</div>
        </div>
      </div>`;
  }).join("");

  const unscheduled = withoutDates.length
    ? `<div class="timeline-row" style="height:auto;margin-top:8px">
         <div class="timeline-label" style="color:#3a3a5a">Unscheduled</div>
         <div style="flex:1"><span class="timeline-no-dates">${withoutDates.map(i => escHtml(i.title)).join(" · ")}</span></div>
       </div>`
    : "";

  document.getElementById("timeline-rows").innerHTML = bars + unscheduled ||
    '<div class="timeline-no-dates" style="padding:8px 0">No initiatives with scheduled dates yet.</div>';
}

function renderRoadmapCards(initiatives, stepsByInit) {
  document.getElementById("roadmap-count").textContent = initiatives.length + " total";
  if (!initiatives.length) {
    document.getElementById("roadmap-cards").innerHTML =
      '<div class="loading" style="color:#3a3a5a">No initiatives yet.</div>';
    return;
  }
  document.getElementById("roadmap-cards").innerHTML = initiatives.map(init => {
    const catClass    = "cat-" + (init.category || "general");
    const statusClass = "init-status-" + (init.status || "idea");
    const rev = init.revenue_projection
      ? "$" + parseFloat(init.revenue_projection).toLocaleString() +
        (init.revenue_type === "recurring" ? "/mo" : " one-time")
      : null;
    const dates = init.start_date && init.target_date
      ? new Date(init.start_date).toLocaleDateString([],{month:"short",year:"numeric"}) + " → " +
        new Date(init.target_date).toLocaleDateString([],{month:"short",year:"numeric"})
      : init.start_date
        ? "Starting " + new Date(init.start_date).toLocaleDateString([],{month:"short",year:"numeric"})
        : null;
    const steps = stepsByInit[init.id] || [];
    const doneCount = steps.filter(s => s.status === "done").length;
    const stepsHtml = steps.length ? `
      <div class="init-steps">
        ${steps.map(s => `
          <div class="init-step${s.status === "done" ? " done" : ""}" onclick="toggleStep(${s.id}, '${s.status}')">
            <div class="step-cb${s.status === "done" ? " checked" : ""}"></div>
            <span>${escHtml(s.step)}</span>
          </div>`).join("")}
        <div class="init-step-add">
          <input class="step-input" id="step-input-${init.id}" placeholder="Add a step..." onkeydown="if(event.key==='Enter')addStep(${init.id})">
          <button class="step-add-btn" onclick="addStep(${init.id})">+</button>
        </div>
      </div>` : `
      <div class="init-steps">
        <div class="init-step-add">
          <input class="step-input" id="step-input-${init.id}" placeholder="Add a step..." onkeydown="if(event.key==='Enter')addStep(${init.id})">
          <button class="step-add-btn" onclick="addStep(${init.id})">+</button>
        </div>
      </div>`;
    return `
      <div class="init-card">
        <div class="init-card-header">
          <div class="init-title">${escHtml(init.title)}</div>
          <span class="cat-badge ${catClass}">${escHtml(init.category || "general")}</span>
        </div>
        <div class="init-meta">
          <span class="status-badge ${statusClass}">${escHtml(init.status || "idea")}</span>
          ${dates ? `<span class="init-detail" style="font-size:12px">${dates}</span>` : ""}
          ${steps.length ? `<span class="init-detail" style="font-size:11px;color:#3a3a6a">${doneCount}/${steps.length} steps</span>` : ""}
        </div>
        ${init.notes ? `<div class="init-notes">${escHtml(init.notes)}</div>` : ""}
        <div class="init-detail-row">
          ${init.hours_per_week ? `<span class="init-detail"><strong>${init.hours_per_week} hrs/wk</strong> time cost</span>` : ""}
          ${rev ? `<span class="init-detail"><strong>${rev}</strong> projected</span>` : ""}
        </div>
        ${stepsHtml}
      </div>`;
  }).join("");
}

async function toggleStep(id, currentStatus) {
  const newStatus = currentStatus === "done" ? "open" : "done";
  await fetch(SUPABASE_URL + "/rest/v1/initiative_steps?id=eq." + id, {
    method: "PATCH",
    headers: { ...HEADERS, "Prefer": "return=minimal" },
    body: JSON.stringify({ status: newStatus })
  });
  loadRoadmap();
}

async function addStep(initiativeId) {
  const input = document.getElementById("step-input-" + initiativeId);
  const text  = input.value.trim();
  if (!text) return;
  await fetch(SUPABASE_URL + "/rest/v1/initiative_steps", {
    method: "POST",
    headers: { ...HEADERS, "Prefer": "return=minimal" },
    body: JSON.stringify({ initiative_id: initiativeId, step: text, status: "open" })
  });
  input.value = "";
  loadRoadmap();
}

loadAll();
