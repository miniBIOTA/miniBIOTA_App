// ── Content Calendar ──

let calPageView      = "board";   // "board" | "week"
let calSubView       = "week";    // "week" | "month"
let calEntries       = [];
let calLoops         = [];
let calLoopLinks     = [];
let calWeekOffset    = 0;
let calMonthOffset   = 0;
let calLoopEco       = "all";     // "all" | "youtube" | "shorts"
let calModalOpen     = false;
let calLpcFilter     = "all";     // loop picker filter in modal
const calLpcSelected = new Set(); // loop IDs selected in modal picker

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
    const [entries, loops, links] = await Promise.all([
      api("content_calendar?select=*&order=scheduled_date.asc,scheduled_time.asc"),
      api("open_loops?select=*&status=in.(open,advanced)&order=opened_at.desc"),
      api("observation_loop_links?select=*"),
    ]);
    calEntries  = entries;
    calLoops    = loops;
    calLoopLinks = links;

    renderCalPage();
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
  const ytLoops  = calLoops.filter(l => l.source_format !== "short").length;
  const shLoops  = calLoops.filter(l => l.source_format === "short").length;

  document.getElementById("cal-stat-planned").textContent   = planned;
  document.getElementById("cal-stat-inprod").textContent    = inprod;
  document.getElementById("cal-stat-yt-loops").textContent  = ytLoops;
  document.getElementById("cal-stat-sh-loops").textContent  = shLoops;
}

// ── Board View ──

function renderCalBoard() {
  const active = calEntries.filter(e => e.status !== "published");
  // also show recently published (last 14 days)
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 14);
  const recentPub = calEntries.filter(e =>
    e.status === "published" && e.scheduled_date &&
    new Date(e.scheduled_date) >= cutoff
  );
  const shown = [...active, ...recentPub];

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
  const time   = entry.scheduled_time
    ? entry.scheduled_time.slice(0,5)
    : "";
  const loopsClosing = (entry.loop_ids_closing || []).length;
  const loopsOpening = (entry.loop_ids_opening || []).length;
  const threads      = (entry.thread_ids || []).length;

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
        ${loopsOpening ? `<span class="cal-card-tag cal-opening">↑ ${loopsOpening} loop${loopsOpening > 1 ? "s" : ""}</span>` : ""}
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
      const fmt  = FORMAT_META[e.format] || FORMAT_META.short;
      const time = e.scheduled_time ? e.scheduled_time.slice(0,5) : "";
      const status = STATUS_META[e.status] || STATUS_META.planned;
      return `<div class="cal-week-card ${fmt.cls}" onclick="openEditModal(${e.id})">
        <div class="cal-week-card-time">${time || "—"}</div>
        <div class="cal-week-card-title">${escHtml(entry_abbrev(e.title))}</div>
        <span class="cal-week-card-status ${status.cls}">${status.label}</span>
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

// ── Add / Edit Modal ──

function openAddModal(defaultFormat, defaultDate) {
  document.getElementById("cal-modal-title").textContent  = "Schedule a Story";
  document.getElementById("cal-entry-id").value           = "";
  document.getElementById("cal-entry-title").value        = "";
  document.getElementById("cal-entry-format").value       = defaultFormat || "short";
  document.getElementById("cal-entry-status").value       = "planned";
  document.getElementById("cal-entry-date").value         = defaultDate   || "";
  document.getElementById("cal-entry-time").value         = "";
  document.getElementById("cal-entry-notes").value        = "";
  document.getElementById("cal-entry-threads").value      = "";
  document.getElementById("cal-entry-loops-opening").value = "";
  document.getElementById("cal-delete-btn").style.display = "none";
  calLpcSelected.clear();
  calLpcFilter = "all";
  document.querySelectorAll(".cal-lpc-btn").forEach(b => b.classList.toggle("active", b.dataset.filter === "all"));
  renderLpc();
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
  document.getElementById("cal-entry-notes").value        = entry.notes    || "";
  document.getElementById("cal-entry-threads").value      = (entry.thread_ids || []).join(", ");
  document.getElementById("cal-entry-loops-opening").value = (entry.loop_ids_opening || []).join(", ");
  document.getElementById("cal-delete-btn").style.display = "";
  calLpcSelected.clear();
  if (entry.loop_ids_closing) entry.loop_ids_closing.forEach(lid => calLpcSelected.add(lid));
  calLpcFilter = "all";
  document.querySelectorAll(".cal-lpc-btn").forEach(b => b.classList.toggle("active", b.dataset.filter === "all"));
  renderLpc();
  showCalModal();
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

  const payload = {
    title:            document.getElementById("cal-entry-title").value.trim(),
    format:           document.getElementById("cal-entry-format").value,
    status:           document.getElementById("cal-entry-status").value,
    scheduled_date:   document.getElementById("cal-entry-date").value  || null,
    scheduled_time:   document.getElementById("cal-entry-time").value  || null,
    notes:            document.getElementById("cal-entry-notes").value.trim() || null,
    thread_ids:       parseIds(document.getElementById("cal-entry-threads").value),
    loop_ids_closing: calLpcSelected.size ? [...calLpcSelected] : null,
    loop_ids_opening: parseIds(document.getElementById("cal-entry-loops-opening").value),
    updated_at:       new Date().toISOString(),
  };

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
      const created = await res.json();
      if (Array.isArray(created)) calEntries.push(...created);
    } else {
      await fetch(SUPABASE_URL + "/rest/v1/content_calendar?id=eq." + id, {
        method: "PATCH",
        headers: { ...HEADERS, "Prefer": "return=minimal" },
        body: JSON.stringify(payload),
      });
      const idx = calEntries.findIndex(e => e.id === parseInt(id, 10));
      if (idx >= 0) calEntries[idx] = { ...calEntries[idx], ...payload, id: parseInt(id, 10) };
    }
    closeCalModal();
    renderCalPage();
  } catch(err) {
    alert("Error saving entry. Check console.");
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
