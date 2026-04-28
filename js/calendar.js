// ── Content Calendar ──

let calPageView      = "board";   // "board" | "week"
let calSubView       = "week";    // "week" | "month"
let calEntries       = [];
let calLoops         = [];
let calLoopLinks     = [];
let calThreads       = [];
let calWeekOffset    = 0;
let calMonthOffset   = 0;
let calLoopEco       = "all";     // "all" | "youtube" | "shorts"
let calThreadStatus  = "all";     // "all" | "story_ready" | "developing"
let calModalOpen     = false;
let calModalTab      = "details"; // "details" | "content" | "production"
let calLpcFilter     = "all";     // loop picker filter in modal
const calLpcSelected = new Set(); // loop IDs selected in modal picker
let calTpFilter      = "all";     // thread picker filter in modal
const calTpSelected  = new Set(); // thread IDs selected in modal picker

const FORMAT_META = {
  short:    { label: "Shorts",    cls: "fmt-short",    color: "#20b090" },
  mid:      { label: "Mids",      cls: "fmt-mid",      color: "#8878cc" },
  longform: { label: "Longforms", cls: "fmt-longform", color: "#c8a040" },
};

const STATUS_META = {
  planned:       { label: "Planned",       cls: "cal-status-planned" },
  in_production: { label: "In Production", cls: "cal-status-inprod" },
  published:     { label: "Published",     cls: "cal-status-published" },
};

// ── Load ──

async function loadCalendar() {
  document.getElementById("cal-page-subtitle").textContent = "Loading...";
  try {
    const [entries, loops, links, threads] = await Promise.all([
      api("content_calendar?select=*&order=scheduled_date.asc,scheduled_time.asc"),
      api("open_loops?select=*&status=in.(open,advanced)&order=opened_at.desc"),
      api("observation_loop_links?select=*"),
      api("story_threads?select=*&became_pipeline_id=is.null&order=created_at.desc"),
    ]);
    calEntries   = entries;
    calLoops     = loops;
    calLoopLinks = links;
    calThreads   = threads;

    renderCalPage();
    renderThreadPanel();
    const now = new Date();
    document.getElementById("cal-page-subtitle").textContent =
      "Last updated " + now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch(e) {
    document.getElementById("cal-page-subtitle").textContent = "Error loading calendar";
    console.error(e);
  }
}

function renderCalPage() {
  if (calPageView === "board") {
    document.getElementById("cal-board-view").classList.remove("hidden");
    document.getElementById("cal-week-view").classList.add("hidden");
    document.getElementById("cal-view-board").classList.add("active");
    document.getElementById("cal-view-week").classList.remove("active");
    renderCalBoard();
  } else {
    document.getElementById("cal-board-view").classList.add("hidden");
    document.getElementById("cal-week-view").classList.remove("hidden");
    document.getElementById("cal-view-board").classList.remove("active");
    document.getElementById("cal-view-week").classList.add("active");
    if (calSubView === "week") renderCalWeek(); else renderCalMonth();
  }
  renderLoopPanel();
  updateCalStats();
}

function setCalPageView(v) {
  calPageView = v;
  renderCalPage();
}

// ── Stats ──

function updateCalStats() {
  const planned  = calEntries.filter(e => e.status === "planned").length;
  const inprod   = calEntries.filter(e => e.status === "in_production").length;
  const threads  = calThreads.length;
  const ytLoops  = calLoops.filter(l => l.source_format !== "short").length;
  const shLoops  = calLoops.filter(l => l.source_format === "short").length;

  document.getElementById("cal-stat-planned").textContent   = planned;
  document.getElementById("cal-stat-inprod").textContent    = inprod;
  document.getElementById("cal-stat-threads").textContent   = threads;
  document.getElementById("cal-stat-yt-loops").textContent  = ytLoops;
  document.getElementById("cal-stat-sh-loops").textContent  = shLoops;
}

// ── Board View ──

function renderCalBoard() {
  const shown = calEntries.filter(e => {
    if (e.status !== "published") return true;
    // Published — keep on board until all checklist items are complete
    const clItems = (CAL_CHECKLIST_MAP[e.format] || (() => []))();
    if (!clItems.length) return false;
    const clState = e.checklist_state || {};
    return !clItems.every(i => clState[i.id]);
  });

  ["short", "mid", "longform"].forEach(fmt => {
    const col = document.getElementById("cal-col-" + fmt);
    const items = shown.filter(e => e.format === fmt);
    col.innerHTML = items.length
      ? items.map(e => calEntryCard(e)).join("")
      : `<div class="cal-empty-col">No stories scheduled</div>`;
  });
}

function calEntryCard(entry) {
  const fmt    = FORMAT_META[entry.format] || FORMAT_META.short;
  const status = STATUS_META[entry.status] || STATUS_META.planned;
  const date   = entry.scheduled_date
    ? new Date(entry.scheduled_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "";
  const time         = entry.scheduled_time ? entry.scheduled_time.slice(0,5) : "";
  const loopsClosing = (entry.loop_ids_closing || []).length;
  const threads      = (entry.thread_ids || []).length;

  // checklist progress
  const clItems = (CAL_CHECKLIST_MAP[entry.format] || (() => []))();
  const clState = entry.checklist_state || {};
  const clDone  = clItems.filter(i => clState[i.id]).length;
  const clTotal = clItems.length;
  const clPct   = clTotal ? Math.round(clDone / clTotal * 100) : 0;

  // vault path — show just the filename
  const vaultFile = entry.vault_path
    ? entry.vault_path.split(/[\\/]/).pop()
    : "";

  return `
    <div class="cal-card" onclick="openEditModal(${entry.id})">
      <div class="cal-card-header">
        <span class="cal-card-title">${escHtml(entry.title)}</span>
        <span class="cal-status-badge ${status.cls}">${status.label}</span>
      </div>
      <div class="cal-card-meta">
        ${date ? `<span class="cal-card-date">${date}${time ? " · " + time : ""}</span>` : ""}
        ${threads ? `<span class="cal-card-tag">🧵 ${threads} thread${threads > 1 ? "s" : ""}</span>` : ""}
        ${loopsClosing ? `<span class="cal-card-tag cal-closing">↓ ${loopsClosing} loop${loopsClosing > 1 ? "s" : ""}</span>` : ""}
        ${vaultFile ? `<span class="cal-card-tag cal-vault" title="${escHtml(entry.vault_path)}">📄 ${escHtml(vaultFile)}</span>` : ""}
        ${clTotal ? `<span class="cal-card-tag cal-cl-prog${clDone === clTotal ? " done" : ""}">${clDone}/${clTotal}</span>` : ""}
      </div>
      ${entry.notes ? `<div class="cal-card-notes">${escHtml(entry.notes)}</div>` : ""}
    </div>`;
}

// ── Week View ──

function getWeekStart(offset) {
  const d   = new Date();
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day) + offset * 7;
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d;
}

function renderCalWeek() {
  const monday = getWeekStart(calWeekOffset);
  const days   = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }

  const fmt = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const weekLabel = fmt(days[0]) + " – " + fmt(days[6]);
  document.getElementById("cal-week-label").textContent = weekLabel;

  const todayStr = new Date().toISOString().slice(0,10);

  document.getElementById("cal-week-grid").innerHTML = days.map(day => {
    const dateStr = day.toISOString().slice(0,10);
    const isToday = dateStr === todayStr;
    const dayName = day.toLocaleDateString("en-US", { weekday: "short" });
    const dayNum  = day.getDate();

    const dayEntries = calEntries
      .filter(e => e.scheduled_date === dateStr)
      .sort((a,b) => (a.scheduled_time || "23:59") < (b.scheduled_time || "23:59") ? -1 : 1);

    const cards = dayEntries.map(e => {
      const fmt    = FORMAT_META[e.format] || FORMAT_META.short;
      const time   = e.scheduled_time ? e.scheduled_time.slice(0,5) : "";
      const status = STATUS_META[e.status] || STATUS_META.planned;
      const clItems = (CAL_CHECKLIST_MAP[e.format] || (() => []))();
      const clDone  = clItems.filter(i => (e.checklist_state || {})[i.id]).length;
      const clTotal = clItems.length;
      return `<div class="cal-week-card ${fmt.cls}" onclick="openEditModal(${e.id})">
        <div class="cal-week-card-time">${time || "—"}</div>
        <div class="cal-week-card-title">${escHtml(entry_abbrev(e.title))}</div>
        <div style="display:flex;align-items:center;gap:5px;margin-top:2px">
          <span class="cal-week-card-status ${status.cls}">${status.label}</span>
          ${clTotal ? `<span class="cal-card-tag cal-cl-prog${clDone === clTotal ? " done" : ""}" style="font-size:9px;padding:1px 4px">${clDone}/${clTotal}</span>` : ""}
        </div>
      </div>`;
    }).join("");

    return `<div class="cal-day-col${isToday ? " cal-today" : ""}">
      <div class="cal-day-header">
        <span class="cal-day-name">${dayName}</span>
        <span class="cal-day-num${isToday ? " cal-today-num" : ""}">${dayNum}</span>
      </div>
      <div class="cal-day-entries">
        ${cards || ""}
        <button class="cal-add-day-btn" onclick="openAddModal('', '${dateStr}')">+</button>
      </div>
    </div>`;
  }).join("");
}

function entry_abbrev(title) {
  return title && title.length > 28 ? title.slice(0, 28) + "…" : (title || "Untitled");
}

function calPrevWeek() { calWeekOffset--; renderCalWeek(); }
function calNextWeek() { calWeekOffset++; renderCalWeek(); }
function calThisWeek() { calWeekOffset = 0; renderCalWeek(); }

function setCalSubView(v) {
  calSubView = v;
  document.getElementById("cal-week-subview").classList.toggle("hidden",  v !== "week");
  document.getElementById("cal-month-subview").classList.toggle("hidden", v !== "month");
  document.getElementById("cal-sub-week").classList.toggle("active",  v === "week");
  document.getElementById("cal-sub-month").classList.toggle("active", v === "month");
  if (v === "week") renderCalWeek(); else renderCalMonth();
}

function calPrevMonth() { calMonthOffset--; renderCalMonth(); }
function calNextMonth() { calMonthOffset++; renderCalMonth(); }
function calThisMonth() { calMonthOffset = 0; renderCalMonth(); }

function renderCalMonth() {
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + calMonthOffset);
  const year  = base.getFullYear();
  const month = base.getMonth();

  document.getElementById("cal-month-label").textContent =
    base.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // build grid starting on Monday
  const firstDay    = new Date(year, month, 1);
  const startDow    = firstDay.getDay();
  const startOffset = startDow === 0 ? 6 : startDow - 1;
  const gridStart   = new Date(firstDay);
  gridStart.setDate(1 - startOffset);

  const todayStr = new Date().toISOString().slice(0, 10);
  const cells    = [];
  const d        = new Date(gridStart);
  for (let i = 0; i < 42; i++) { cells.push(new Date(d)); d.setDate(d.getDate() + 1); }

  document.getElementById("cal-month-grid").innerHTML = `
    <div class="cal-month-header">
      ${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(n => `<div class="cal-month-dow">${n}</div>`).join("")}
    </div>
    <div class="cal-month-cells">
      ${cells.map(cell => {
        const dateStr     = cell.toISOString().slice(0, 10);
        const isThisMonth = cell.getMonth() === month;
        const isToday     = dateStr === todayStr;
        const dayEntries  = calEntries.filter(e => e.scheduled_date === dateStr);
        const chips = dayEntries.map(e => {
          const fmt    = FORMAT_META[e.format] || FORMAT_META.short;
          const abbrev = e.title && e.title.length > 18 ? e.title.slice(0, 18) + "…" : (e.title || "Untitled");
          return `<div class="cal-month-chip ${fmt.cls}" onclick="openEditModal(${e.id})" title="${escHtml(e.title)}">${escHtml(abbrev)}</div>`;
        }).join("");
        return `<div class="cal-month-cell${isThisMonth ? "" : " other-month"}${isToday ? " cal-today" : ""}">
          <div class="cal-month-daynum${isToday ? " cal-today-num" : ""}">${cell.getDate()}</div>
          <div class="cal-month-chips">${chips}</div>
          <div class="cal-month-add" onclick="openAddModal('', '${dateStr}')">+</div>
        </div>`;
      }).join("")}
    </div>`;
}

// ── Loop Panel ──

function setLoopEco(eco) {
  calLoopEco = eco;
  document.querySelectorAll(".cal-loop-eco-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.eco === eco);
  });
  renderLoopPanel();
}

function renderLoopPanel() {
  const TODAY_DATE = new Date();

  // count obs per loop
  const obsByLoop = {};
  calLoopLinks.forEach(lk => {
    obsByLoop[lk.loop_id] = (obsByLoop[lk.loop_id] || 0) + 1;
  });

  let loops = calLoops;
  if (calLoopEco === "youtube") loops = loops.filter(l => l.source_format !== "short");
  if (calLoopEco === "shorts")  loops = loops.filter(l => l.source_format === "short");

  document.getElementById("cal-loop-count").textContent = loops.length;

  if (!loops.length) {
    document.getElementById("cal-loops-container").innerHTML =
      '<div class="cal-empty-col">No open loops match this filter.</div>';
    return;
  }

  document.getElementById("cal-loops-container").innerHTML = loops.map(loop => {
    const isShorts  = loop.source_format === "short";
    const retireDays = isShorts ? 14 : 30;
    const lastDate   = loop.updated_at
      ? new Date(loop.updated_at)
      : new Date(loop.opened_at);
    const daysSince  = Math.floor((TODAY_DATE - lastDate) / (1000 * 60 * 60 * 24));
    const isStale    = daysSince >= retireDays;

    const obsCount = obsByLoop[loop.id] || 0;
    const ecoLabel = isShorts ? "Shorts" : (loop.source_format || "YouTube");
    const ecoClass = isShorts ? "eco-shorts" : "eco-youtube";

    const speciesName = loop.species_id ? (speciesMap[loop.species_id] || "") : "";
    const biomeName   = loop.biome_id   ? (biomeMap[loop.biome_id]     || "") : "";

    return `
      <div class="cal-loop-card${isStale ? " stale" : ""}">
        <div class="cal-loop-header">
          <span class="cal-loop-eco ${ecoClass}">${ecoLabel}</span>
          ${isStale ? `<span class="cal-loop-retire-flag" title="${daysSince} days without activity">Retirement candidate</span>` : ""}
          <span class="cal-loop-obs">${obsCount} obs</span>
        </div>
        <div class="cal-loop-text">${escHtml(loop.loop_text)}</div>
        <div class="cal-loop-meta">
          ${speciesName ? `<span class="tag tag-species">${escHtml(speciesName)}</span>` : ""}
          ${biomeName   ? `<span class="tag tag-biome">${escHtml(biomeName)}</span>`   : ""}
          <span class="tag" style="background:#1a2030;color:#3a5060">${loop.status}</span>
        </div>
      </div>`;
  }).join("");
}

// ── Story Threads Panel ──

function setThreadFilter(f) {
  calThreadStatus = f;
  document.querySelectorAll("[data-tstatus]").forEach(b => {
    b.classList.toggle("active", b.dataset.tstatus === f);
  });
  renderThreadPanel();
}

function renderThreadPanel() {
  const container = document.getElementById("cal-threads-container");
  if (!container) return;

  const filtered = calThreadStatus === "all"
    ? calThreads
    : calThreads.filter(t => t.status === calThreadStatus);

  const countEl = document.getElementById("cal-thread-count");
  if (countEl) countEl.textContent = filtered.length;

  if (!filtered.length) {
    container.innerHTML = `<div class="cal-empty">No story threads${calThreadStatus !== "all" ? " matching filter" : ""}.</div>`;
    return;
  }

  container.innerHTML = filtered.map(thread => {
    const statusColors = {
      "story_ready": "#20b090",
      "developing":  "#8878cc",
    };
    const color = statusColors[thread.status] || "#888";
    const label = thread.status === "story_ready" ? "Story Ready"
                : thread.status === "developing"  ? "Developing"
                : thread.status || "";

    const speciesName = thread.species_id ? (speciesMap[thread.species_id] || "") : "";
    const biomeName   = thread.biome_id   ? (biomeMap[thread.biome_id]     || "") : "";

    return `
      <div class="cal-thread-card">
        <div class="cal-thread-header">
          <span class="cal-thread-status" style="background:${color}22;color:${color};border:1px solid ${color}44">${label}</span>
        </div>
        <div class="cal-thread-text">${escHtml(thread.title || thread.thread_text || "")}</div>
        <div class="cal-thread-meta">
          ${speciesName ? `<span class="tag tag-species">${escHtml(speciesName)}</span>` : ""}
          ${biomeName   ? `<span class="tag tag-biome">${escHtml(biomeName)}</span>`   : ""}
        </div>
      </div>`;
  }).join("");
}

// ── Modal Production Checklist ──

const CAL_CHECKLIST_MAP = {
  short:    () => CHECKLIST_ITEMS.short,
  mid:      () => CHECKLIST_ITEMS.mf,
  longform: () => CHECKLIST_ITEMS.lf,
};

function renderModalChecklist(format, state) {
  const items = (CAL_CHECKLIST_MAP[format] || (() => []))();
  const section = document.getElementById("cal-cl-section");
  if (!section) return;

  if (!items.length) { section.style.display = "none"; return; }
  section.style.display = "";

  const done  = items.filter(i => !!(state && state[i.id])).length;
  const prog  = document.getElementById("cal-cl-progress");
  if (prog) {
    prog.textContent = done + " / " + items.length;
    prog.classList.toggle("done", done === items.length);
  }

  document.getElementById("cal-cl-items").innerHTML = items.map(item => {
    const checked = !!(state && state[item.id]);
    return `<div class="cal-cl-item" onclick="toggleCalCl('${item.id}')">
      <div class="cal-cl-cb${checked ? " checked" : ""}"></div>
      <div class="cal-cl-label${checked ? " done" : ""}">${escHtml(item.label)}</div>
    </div>`;
  }).join("");
}

async function toggleCalCl(itemId) {
  const idVal = document.getElementById("cal-entry-id").value;
  if (!idVal) return;
  const entryId = parseInt(idVal, 10);
  const entry   = calEntries.find(e => e.id === entryId);
  if (!entry) return;

  const state     = Object.assign({}, entry.checklist_state || {});
  state[itemId]   = !state[itemId];
  entry.checklist_state = state;
  renderModalChecklist(entry.format, state);

  const res = await fetch(SUPABASE_URL + "/rest/v1/content_calendar?id=eq." + entryId, {
    method: "PATCH",
    headers: { ...HEADERS, "Prefer": "return=minimal" },
    body: JSON.stringify({ checklist_state: state }),
  });
  if (!res.ok) console.error("checklist save failed:", await res.json());
}

// ── Loop Picker (modal) ──

function setLpcFilter(f) {
  calLpcFilter = f;
  document.querySelectorAll(".cal-lpc-btn").forEach(b => b.classList.toggle("active", b.dataset.filter === f));
  renderLpc();
}

function toggleLpc(id) {
  if (calLpcSelected.has(id)) calLpcSelected.delete(id); else calLpcSelected.add(id);
  document.querySelectorAll(`.cal-lpc-item[data-id="${id}"]`).forEach(el => {
    el.classList.toggle("selected", calLpcSelected.has(id));
    const chk = el.querySelector(".cal-lpc-check");
    if (chk) chk.textContent = calLpcSelected.has(id) ? "✓" : "";
  });
  const badge = document.getElementById("cal-lpc-count");
  if (badge) badge.textContent = calLpcSelected.size ? calLpcSelected.size + " selected" : "";
}

function renderLpc() {
  let loops = calLoops;
  if (calLpcFilter === "youtube") loops = loops.filter(l => l.source_format !== "short");
  if (calLpcFilter === "shorts")  loops = loops.filter(l => l.source_format === "short");

  const container = document.getElementById("cal-lpc");
  if (!container) return;

  if (!loops.length) {
    container.innerHTML = '<div style="padding:10px 12px;color:#3a5060;font-size:12px">No open loops match this filter.</div>';
    return;
  }

  container.innerHTML = loops.map(loop => {
    const sel         = calLpcSelected.has(loop.id);
    const isShorts    = loop.source_format === "short";
    const ecoLabel    = isShorts ? "S" : "YT";
    const ecoClass    = isShorts ? "eco-shorts" : "eco-youtube";
    const speciesName = loop.species_id ? (speciesMap[loop.species_id] || "") : "";
    return `<div class="cal-lpc-item${sel ? " selected" : ""}" data-id="${loop.id}" onclick="toggleLpc(${loop.id})">
      <span class="cal-loop-eco ${ecoClass}" style="font-size:10px;padding:1px 6px;flex-shrink:0">${ecoLabel}</span>
      <span class="cal-lpc-text">${escHtml(loop.loop_text)}</span>
      ${speciesName ? `<span class="tag tag-species" style="font-size:10px;padding:1px 5px;flex-shrink:0">${escHtml(speciesName)}</span>` : ""}
      <span class="cal-lpc-check">${sel ? "✓" : ""}</span>
    </div>`;
  }).join("");

  const badge = document.getElementById("cal-lpc-count");
  if (badge) badge.textContent = calLpcSelected.size ? calLpcSelected.size + " selected" : "";
}

// ── Thread Picker (modal) ──

function setTpFilter(f) {
  calTpFilter = f;
  document.querySelectorAll(".cal-tp-btn").forEach(b => b.classList.toggle("active", b.dataset.tfilter === f));
  renderTp();
}

function toggleTp(id) {
  if (calTpSelected.has(id)) calTpSelected.delete(id); else calTpSelected.add(id);
  document.querySelectorAll(`.cal-tp-item[data-id="${id}"]`).forEach(el => {
    el.classList.toggle("selected", calTpSelected.has(id));
    const chk = el.querySelector(".cal-lpc-check");
    if (chk) chk.textContent = calTpSelected.has(id) ? "✓" : "";
  });
  const badge = document.getElementById("cal-tp-count");
  if (badge) badge.textContent = calTpSelected.size ? calTpSelected.size + " selected" : "";
}

function renderTp() {
  let threads = calThreads;
  if (calTpFilter !== "all") threads = threads.filter(t => t.status === calTpFilter);

  const container = document.getElementById("cal-tp");
  if (!container) return;

  if (!threads.length) {
    container.innerHTML = '<div style="padding:10px 12px;color:#3a5060;font-size:12px">No story threads match this filter.</div>';
    return;
  }

  const STATUS_CLS = { story_ready: "tag-story-ready", in_production: "tag-in-production", developing: "tag-developing" };
  const STATUS_LBL = { story_ready: "story ready", in_production: "in production", developing: "developing" };

  container.innerHTML = threads.map(t => {
    const sel         = calTpSelected.has(t.id);
    const speciesName = t.species_id ? (speciesMap[t.species_id] || "") : "";
    const biomeName   = t.biome_id   ? (biomeMap[t.biome_id]     || "") : "";
    const sCls        = STATUS_CLS[t.status] || "tag-developing";
    const sLbl        = STATUS_LBL[t.status] || (t.status || "developing");
    return `<div class="cal-tp-item${sel ? " selected" : ""}" data-id="${t.id}" onclick="toggleTp(${t.id})">
      <span class="tag ${sCls}" style="font-size:10px;padding:1px 6px;flex-shrink:0">${sLbl}</span>
      <span class="cal-lpc-text">${escHtml(t.title || "(untitled)")}</span>
      ${speciesName ? `<span class="tag tag-species" style="font-size:10px;padding:1px 5px;flex-shrink:0">${escHtml(speciesName)}</span>` : ""}
      ${biomeName   ? `<span class="tag tag-biome"   style="font-size:10px;padding:1px 5px;flex-shrink:0">${escHtml(biomeName)}</span>`   : ""}
      <span class="cal-lpc-check">${sel ? "✓" : ""}</span>
    </div>`;
  }).join("");

  const badge = document.getElementById("cal-tp-count");
  if (badge) badge.textContent = calTpSelected.size ? calTpSelected.size + " selected" : "";
}

// ── Add / Edit Modal ──

function openAddModal(defaultFormat, defaultDate) {
  const fmt = defaultFormat || "short";
  document.getElementById("cal-modal-title").textContent  = "Schedule a Story";
  document.getElementById("cal-entry-id").value           = "";
  document.getElementById("cal-entry-title").value        = "";
  document.getElementById("cal-entry-format").value       = fmt;
  document.getElementById("cal-entry-status").value       = "planned";
  document.getElementById("cal-entry-date").value         = defaultDate   || "";
  document.getElementById("cal-entry-time").value         = "";
  document.getElementById("cal-entry-notes").value        = "";
  document.getElementById("cal-entry-vault-path").value        = "";
  document.getElementById("cal-entry-thumbnail-text").value    = "";
  document.getElementById("cal-entry-publish-title").value     = "";
  document.getElementById("cal-entry-video-description").value = "";
  document.getElementById("cal-entry-script").value            = "";
  document.getElementById("cal-delete-btn").style.display      = "none";
  calLpcSelected.clear();
  calLpcFilter = "all";
  document.querySelectorAll(".cal-lpc-btn").forEach(b => b.classList.toggle("active", b.dataset.filter === "all"));
  calTpSelected.clear();
  calTpFilter = "all";
  document.querySelectorAll(".cal-tp-btn").forEach(b => b.classList.toggle("active", b.dataset.tfilter === "all"));
  renderLpc();
  renderTp();
  renderModalChecklist(fmt, {});
  setCalModalTab("details");
  showCalModal();
}

function openEditModal(id) {
  const entry = calEntries.find(e => e.id === id);
  if (!entry) return;

  document.getElementById("cal-modal-title").textContent  = "Edit Story";
  document.getElementById("cal-entry-id").value           = entry.id;
  document.getElementById("cal-entry-title").value        = entry.title    || "";
  document.getElementById("cal-entry-format").value       = entry.format   || "short";
  document.getElementById("cal-entry-status").value       = entry.status   || "planned";
  document.getElementById("cal-entry-date").value         = entry.scheduled_date || "";
  document.getElementById("cal-entry-time").value         = entry.scheduled_time ? entry.scheduled_time.slice(0,5) : "";
  document.getElementById("cal-entry-notes").value            = entry.notes             || "";
  document.getElementById("cal-entry-vault-path").value       = entry.vault_path        || "";
  document.getElementById("cal-entry-thumbnail-text").value   = entry.thumbnail_text    || "";
  document.getElementById("cal-entry-publish-title").value    = entry.publish_title     || "";
  document.getElementById("cal-entry-video-description").value = entry.video_description || "";
  document.getElementById("cal-entry-script").value           = entry.script            || "";
  document.getElementById("cal-delete-btn").style.display     = "";
  calLpcSelected.clear();
  if (entry.loop_ids_closing) entry.loop_ids_closing.forEach(lid => calLpcSelected.add(lid));
  calLpcFilter = "all";
  document.querySelectorAll(".cal-lpc-btn").forEach(b => b.classList.toggle("active", b.dataset.filter === "all"));
  calTpSelected.clear();
  if (entry.thread_ids) entry.thread_ids.forEach(tid => calTpSelected.add(tid));
  calTpFilter = "all";
  document.querySelectorAll(".cal-tp-btn").forEach(b => b.classList.toggle("active", b.dataset.tfilter === "all"));
  renderLpc();
  renderTp();
  renderModalChecklist(entry.format, entry.checklist_state || {});
  setCalModalTab("details");
  showCalModal();
}

function setCalModalTab(tab) {
  calModalTab = tab;
  ["details", "content", "production"].forEach(t => {
    document.getElementById("cal-mtab-" + t).classList.toggle("active", t === tab);
    document.getElementById("cal-mtab-pane-" + t).classList.toggle("hidden", t !== tab);
  });
}

function showCalModal() {
  document.getElementById("cal-modal").classList.remove("hidden");
  calModalOpen = true;
}

function closeCalModal() {
  document.getElementById("cal-modal").classList.add("hidden");
  calModalOpen = false;
}

function parseIds(str) {
  if (!str || !str.trim()) return null;
  const parts = str.split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
  return parts.length ? parts : null;
}

async function submitCalEntry(e) {
  e.preventDefault();
  const id    = document.getElementById("cal-entry-id").value;
  const isNew = !id;

  const vaultPath = document.getElementById("cal-entry-vault-path").value.trim();

  const payload = {
    title:            document.getElementById("cal-entry-title").value.trim(),
    format:           document.getElementById("cal-entry-format").value,
    status:           document.getElementById("cal-entry-status").value,
    scheduled_date:   document.getElementById("cal-entry-date").value  || null,
    scheduled_time:   document.getElementById("cal-entry-time").value  || null,
    notes:             document.getElementById("cal-entry-notes").value.trim()             || null,
    thread_ids:        calTpSelected.size ? [...calTpSelected] : null,
    loop_ids_closing:  calLpcSelected.size ? [...calLpcSelected] : null,
    updated_at:        new Date().toISOString(),
  };
  // only include optional columns if they have values (avoids 400 if migration not yet run)
  if (vaultPath) payload.vault_path = vaultPath;
  const thumbnailText    = document.getElementById("cal-entry-thumbnail-text").value.trim();
  const publishTitle     = document.getElementById("cal-entry-publish-title").value.trim();
  const videoDescription = document.getElementById("cal-entry-video-description").value.trim();
  const script           = document.getElementById("cal-entry-script").value.trim();
  if (thumbnailText)    payload.thumbnail_text    = thumbnailText;
  if (publishTitle)     payload.publish_title     = publishTitle;
  if (videoDescription) payload.video_description = videoDescription;
  if (script)           payload.script            = script;

  if (!payload.title) { alert("Title is required."); return; }

  const submitBtn = document.getElementById("cal-submit-btn");
  submitBtn.disabled = true;
  submitBtn.textContent = isNew ? "Adding..." : "Saving...";

  try {
    if (isNew) {
      const res = await fetch(SUPABASE_URL + "/rest/v1/content_calendar", {
        method: "POST",
        headers: { ...HEADERS, "Prefer": "return=representation" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Supabase error " + res.status);
      }
      const created = await res.json();
      if (Array.isArray(created)) calEntries.push(...created);
    } else {
      const res = await fetch(SUPABASE_URL + "/rest/v1/content_calendar?id=eq." + id, {
        method: "PATCH",
        headers: { ...HEADERS, "Prefer": "return=minimal" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Supabase error " + res.status);
      }
      const idx = calEntries.findIndex(e => e.id === parseInt(id, 10));
      if (idx >= 0) calEntries[idx] = { ...calEntries[idx], ...payload, id: parseInt(id, 10) };
    }
    closeCalModal();
    renderCalPage();
  } catch(err) {
    alert("Error saving entry: " + err.message);
    console.error(err);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = isNew ? "Add to Calendar" : "Save Changes";
  }
}

async function deleteCalEntry() {
  const id = document.getElementById("cal-entry-id").value;
  if (!id) return;
  if (!confirm("Delete this calendar entry?")) return;

  await fetch(SUPABASE_URL + "/rest/v1/content_calendar?id=eq." + id, {
    method: "DELETE",
    headers: HEADERS,
  });
  calEntries = calEntries.filter(e => e.id !== parseInt(id, 10));
  closeCalModal();
  renderCalPage();
}
