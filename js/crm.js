// ── CRM Module ──

// State
let crmContacts       = [];
let crmOpps           = [];
let crmActivities     = [];
let crmRevenues       = [];
let crmActiveContactId = null;
let crmView           = "contacts";
let crmTypeFilter     = null;
let crmActivityFilter = "open";

// Constants (moved from core.js)
const SALES_GOAL = 2000;

const STATUS_CYCLE = ["not_contacted","outreach_sent","in_conversation","gifting_only","closed_won","closed_lost"];
const STATUS_LABEL = {
  not_contacted:   "Not Contacted",
  outreach_sent:   "Outreach Sent",
  in_conversation: "In Conversation",
  gifting_only:    "Gifting Only",
  closed_won:      "Closed — Won",
  closed_lost:     "Closed — Lost"
};

const RELATIONSHIP_TYPES = [
  { value: "sponsor",     label: "Sponsor / Brand Partner" },
  { value: "press",       label: "Press / Media" },
  { value: "speaking",    label: "Speaking / Event" },
  { value: "affiliate",   label: "Affiliate" },
  { value: "creator",     label: "Creator Collab" },
  { value: "grant",       label: "Grant / Funding" },
  { value: "distributor", label: "Distributor" },
  { value: "general",     label: "General Contact" },
  { value: "other",       label: "Other" },
];

const ACTIVITY_TYPE_LABEL = {
  follow_up: "Follow Up", email: "Email", call: "Call",
  meeting: "Meeting", proposal: "Proposal Sent", contract: "Contract",
  event: "Event", note: "Note", other: "Other"
};

// ── Load ──

async function loadCrm() {
  const [contacts, opps, activities, revenues] = await Promise.all([
    api("crm_contacts?select=*&order=name.asc"),
    api("partner_opportunities?select=*&order=next_action_date.asc.nullslast"),
    api("crm_activities?select=*&order=due_date.asc.nullslast"),
    api("revenue_streams?select=*&order=period_start.desc"),
  ]);
  crmContacts   = contacts;
  crmOpps       = opps;
  crmActivities = activities;
  crmRevenues   = revenues;

  buildCrmTypeFilter();
  renderCrmStats(revenues);
  renderCrmView();
  updateCrmBadge();
  updateCrmOverdueBanner();
}

// ── View switching ──

function setCrmView(v) {
  crmView = v;
  ["contacts", "pipeline", "activities"].forEach(name => {
    document.getElementById("crm-view-" + name).classList.toggle("active", name === v);
    document.getElementById("crm-" + name + "-view").classList.toggle("hidden", name !== v);
  });
  renderCrmView();
}

function renderCrmView() {
  if (crmView === "contacts")   renderCrmContacts();
  if (crmView === "pipeline")   renderCrmPipeline();
  if (crmView === "activities") renderCrmAllActivities();
}

// ── Type filter chips ──

function buildCrmTypeFilter() {
  const typesWithContacts = new Set(crmContacts.map(c => c.relationship_type));
  const container = document.getElementById("crm-type-filter");
  let html = `<span class="filter-chip${crmTypeFilter === null ? " active" : ""}" onclick="setCrmTypeFilter(null)">All</span>`;
  RELATIONSHIP_TYPES.forEach(rt => {
    if (typesWithContacts.has(rt.value)) {
      html += `<span class="filter-chip${crmTypeFilter === rt.value ? " active" : ""}" onclick="setCrmTypeFilter('${rt.value}')">${escHtml(rt.label)}</span>`;
    }
  });
  container.innerHTML = html;
}

function setCrmTypeFilter(val) {
  crmTypeFilter = val;
  buildCrmTypeFilter();
  renderCrmContacts();
}

// ── Stats ──

function renderCrmStats(revenues) {
  const today   = TODAY;
  const active  = crmOpps.filter(o => !["closed_won","closed_lost"].includes(o.current_status)).length;
  const overdue = crmActivities.filter(a => a.status === "open" && a.due_date && a.due_date < today).length;
  const pipeVal = crmOpps.filter(o => o.current_status !== "closed_lost")
                         .reduce((s, o) => s + parseFloat(o.estimated_value || 0), 0);

  document.getElementById("crm-stats").innerHTML = `
    <div class="crm-stat"><div class="crm-stat-num">${crmContacts.length}</div><div class="crm-stat-label">Contacts</div></div>
    <div class="crm-stat"><div class="crm-stat-num">${active}</div><div class="crm-stat-label">Active Pipeline</div></div>
    <div class="crm-stat"><div class="crm-stat-num" style="${overdue > 0 ? "color:#cc4444" : ""}">${overdue}</div><div class="crm-stat-label">Overdue</div></div>
    <div class="crm-stat"><div class="crm-stat-num">${fmtUSD(pipeVal)}</div><div class="crm-stat-label">Pipeline Value</div></div>
  `;
}

// ── Contacts view ──

function renderCrmContacts() {
  const search = (document.getElementById("crm-search").value || "").toLowerCase();
  const today  = TODAY;
  const sevenDays = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  let filtered = crmContacts.filter(c => {
    if (crmTypeFilter && c.relationship_type !== crmTypeFilter) return false;
    if (search) {
      const hay = ((c.name || "") + " " + (c.organization || "") + " " + (c.email || "")).toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  // Sort: contacts with overdue activities first, then alpha
  filtered.sort((a, b) => {
    const aOverdue = crmActivities.some(x => x.contact_id === a.id && x.status === "open" && x.due_date && x.due_date < today);
    const bOverdue = crmActivities.some(x => x.contact_id === b.id && x.status === "open" && x.due_date && x.due_date < today);
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
    return (a.name || "").localeCompare(b.name || "");
  });

  const typeLabel = Object.fromEntries(RELATIONSHIP_TYPES.map(r => [r.value, r.label]));

  const html = filtered.map(c => {
    const overdue  = crmActivities.some(x => x.contact_id === c.id && x.status === "open" && x.due_date && x.due_date < today);
    const upcoming = !overdue && crmActivities.some(x => x.contact_id === c.id && x.status === "open" && x.due_date && x.due_date <= sevenDays);
    const dotCls   = overdue ? "red" : upcoming ? "yellow" : "grey";
    const isActive = c.id === crmActiveContactId;

    return `<div class="crm-contact-card${isActive ? " active" : ""}" onclick="selectCrmContact(${c.id})">
      <div class="crm-contact-name">
        <span class="crm-activity-dot ${dotCls}"></span>${escHtml(c.name)}
      </div>
      <div class="crm-contact-meta">${[c.organization, c.role].filter(Boolean).map(escHtml).join(" · ") || "&nbsp;"}</div>
      <span class="crm-type-badge">${escHtml(typeLabel[c.relationship_type] || c.relationship_type)}</span>
    </div>`;
  }).join("") || '<div class="crm-detail-empty">No contacts match.</div>';

  document.getElementById("crm-contact-list").innerHTML = html;

  if (crmActiveContactId) renderCrmDetail(crmActiveContactId);
}

function selectCrmContact(id) {
  crmActiveContactId = id;
  renderCrmContacts();
  renderCrmDetail(id);
}

function renderCrmDetail(contactId) {
  const c = crmContacts.find(x => x.id === contactId);
  if (!c) {
    document.getElementById("crm-contact-detail").innerHTML = '<div class="crm-detail-empty">Contact not found.</div>';
    return;
  }

  const today   = TODAY;
  const typeLabel = Object.fromEntries(RELATIONSHIP_TYPES.map(r => [r.value, r.label]));

  const emailLink   = c.email   ? `<a href="mailto:${escHtml(c.email)}">${escHtml(c.email)}</a>` : "—";
  const phoneLink   = c.phone   ? `<a href="tel:${escHtml(c.phone)}">${escHtml(c.phone)}</a>` : "—";
  const websiteLink = c.website ? `<a href="${escHtml(c.website)}" target="_blank">${escHtml(c.website)}</a>` : "—";

  const contactOpps = crmOpps.filter(o => o.contact_id === contactId);
  const contactActs = crmActivities.filter(a => a.contact_id === contactId);
  const openActs    = contactActs.filter(a => a.status === "open");

  // Activity sub-filter state (stored on element to avoid extra global)
  const detailEl = document.getElementById("crm-contact-detail");
  const actFilter = detailEl._actFilter || "open";

  const filteredActs = actFilter === "open"
    ? openActs
    : actFilter === "overdue"
      ? contactActs.filter(a => a.status === "open" && a.due_date && a.due_date < today)
      : contactActs.filter(a => a.status === "done");

  let oppsHtml = contactOpps.length
    ? contactOpps.map(o => {
        const status = o.current_status || "not_contacted";
        return `<div class="crm-opp-card" onclick="openCrmOppModal(${o.id})">
          <span class="status-badge status-${status}">${escHtml(STATUS_LABEL[status] || status)}</span>
          <span class="crm-pipeline-org" style="margin-left:8px">${escHtml(o.organization_name)}</span>
          ${o.opportunity_name ? `<div class="crm-pipeline-opp">${escHtml(o.opportunity_name)}</div>` : ""}
          <div class="crm-pipeline-footer">
            <span>${o.estimated_value ? fmtUSD(parseFloat(o.estimated_value)) + "/video" : ""}</span>
            <span>${o.next_action_date ? escHtml(o.next_action_date) : ""}</span>
          </div>
          ${o.next_action ? `<div class="crm-pipeline-opp" style="margin-top:4px">→ ${escHtml(o.next_action)}</div>` : ""}
        </div>`;
      }).join("")
    : '<div style="color:#4a6a3a;font-size:13px;padding:8px 0">No opportunities linked.</div>';

  let actsHtml = filteredActs.length
    ? filteredActs.map(a => activityRowHtml(a, today)).join("")
    : '<div style="color:#4a6a3a;font-size:13px;padding:8px 0">No activities.</div>';

  detailEl.innerHTML = `
    <div class="crm-detail-header">
      <div>
        <div class="crm-detail-name">${escHtml(c.name)}</div>
        <div class="crm-detail-org">${[c.organization, c.role].filter(Boolean).map(escHtml).join(" · ") || ""}</div>
        <span class="crm-type-badge" style="margin-top:6px;display:inline-block">${escHtml(typeLabel[c.relationship_type] || c.relationship_type)}</span>
      </div>
      <div style="display:flex;gap:8px;flex-shrink:0">
        <button class="cal-save-btn" onclick="openCrmContactModal(${c.id})">Edit</button>
      </div>
    </div>
    <div class="crm-detail-info-row">
      <div class="crm-detail-info-item">✉ ${emailLink}</div>
      <div class="crm-detail-info-item">📞 ${phoneLink}</div>
      <div class="crm-detail-info-item">🔗 ${websiteLink}</div>
    </div>
    ${c.notes ? `<div class="crm-detail-notes">${escHtml(c.notes)}</div>` : ""}

    <div class="crm-detail-section">
      <div class="crm-detail-section-header">
        <span>Opportunities (${contactOpps.length})</span>
        <button class="cal-save-btn" style="font-size:11px;padding:3px 10px" onclick="openCrmOppModal(null, ${c.id})">+ Add</button>
      </div>
      ${oppsHtml}
    </div>

    <div class="crm-detail-section">
      <div class="crm-detail-section-header">
        <span>Activities (${openActs.length} open)</span>
        <button class="cal-save-btn" style="font-size:11px;padding:3px 10px" onclick="openCrmActivityModal(null, ${c.id})">+ Add</button>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:8px">
        ${["open","overdue","done"].map(f => `<span class="filter-chip${actFilter === f ? " active" : ""}" onclick="setDetailActFilter(${c.id}, '${f}')">${f.charAt(0).toUpperCase() + f.slice(1)}</span>`).join("")}
      </div>
      ${actsHtml}
    </div>
  `;
  detailEl._actFilter = actFilter;
}

function setDetailActFilter(contactId, filter) {
  const detailEl = document.getElementById("crm-contact-detail");
  detailEl._actFilter = filter;
  renderCrmDetail(contactId);
}

function activityRowHtml(a, today) {
  const isOverdue  = a.status === "open" && a.due_date && a.due_date < today;
  const isToday    = a.status === "open" && a.due_date === today;
  const isDone     = a.status === "done";
  const rowCls     = isOverdue ? "overdue" : isToday ? "due-today" : isDone ? "done" : "";
  const dateCls    = isOverdue ? "overdue" : isToday ? "due-today" : "";

  return `<div class="crm-activity-row ${rowCls}">
    <span class="crm-activity-type">${escHtml(ACTIVITY_TYPE_LABEL[a.activity_type] || a.activity_type)}</span>
    <span class="crm-activity-title">${escHtml(a.title)}</span>
    <span class="crm-activity-date ${dateCls}">${a.due_date ? escHtml(a.due_date) : ""}</span>
    ${a.status === "open" ? `<button class="tasks-clear-btn" style="font-size:11px;padding:2px 8px" onclick="completeCrmActivity(${a.id})">Done</button>` : ""}
    <button class="tasks-clear-btn" style="font-size:11px;padding:2px 8px" onclick="openCrmActivityModal(${a.id})">Edit</button>
  </div>`;
}

// ── Pipeline view ──

function renderCrmPipeline() {
  const contactById = Object.fromEntries(crmContacts.map(c => [c.id, c]));

  const cols = STATUS_CYCLE.map(status => {
    const cards = crmOpps.filter(o => (o.current_status || "not_contacted") === status);
    const isWon  = status === "closed_won";
    const isLost = status === "closed_lost";

    const cardsHtml = cards.map(o => {
      const contact = o.contact_id ? contactById[o.contact_id] : null;
      return `<div class="crm-pipeline-card${isWon ? " won" : isLost ? " lost" : ""}" onclick="openCrmOppModal(${o.id})">
        <div class="crm-pipeline-org">${escHtml(o.organization_name)}</div>
        ${o.opportunity_name ? `<div class="crm-pipeline-opp">${escHtml(o.opportunity_name)}</div>` : ""}
        ${contact ? `<div class="crm-pipeline-contact">👤 ${escHtml(contact.name)}</div>` : ""}
        <div class="crm-pipeline-footer">
          <span>${o.estimated_value ? fmtUSD(parseFloat(o.estimated_value)) + "/video" : ""}</span>
          <span>${o.next_action_date ? escHtml(o.next_action_date) : ""}</span>
        </div>
        ${o.next_action ? `<div class="crm-pipeline-opp" style="margin-top:4px">→ ${escHtml(o.next_action)}</div>` : ""}
      </div>`;
    }).join("");

    return `<div class="crm-pipeline-col">
      <div class="crm-pipeline-col-header">
        <span>${escHtml(STATUS_LABEL[status])}</span>
        <span class="count-badge">${cards.length}</span>
      </div>
      ${cardsHtml}
      ${status === "not_contacted" ? `<button class="cal-save-btn" style="width:100%;margin-top:4px;font-size:11px" onclick="openCrmOppModal()">+ Add</button>` : ""}
    </div>`;
  }).join("");

  document.getElementById("crm-pipeline-board").innerHTML = cols;
  renderCrmGoalBar();
}

function renderCrmGoalBar() {
  if (!crmRevenues.length) return;
  const latestPeriod = crmRevenues.reduce((max, r) => r.period_start > max ? r.period_start : max, "");
  const latestRevs   = crmRevenues.filter(r => r.period_start === latestPeriod);
  const totalRev     = latestRevs.reduce((s, r) => s + parseFloat(r.net_amount || 0), 0);
  const pct          = Math.min(100, Math.round(totalRev / SALES_GOAL * 100));
  const gap          = Math.max(0, SALES_GOAL - totalRev);
  const periodLabel  = latestPeriod
    ? new Date(latestPeriod + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : "";

  document.getElementById("goal-current").textContent = fmtUSD(totalRev) + "/mo";
  document.getElementById("goal-bar").style.width = pct + "%";
  document.getElementById("goal-sublabel").textContent = pct >= 100
    ? "Goal reached."
    : `${pct}% of goal — ${fmtUSD(gap)} gap to close${periodLabel ? " (" + periodLabel + ")" : ""}`;
}

// ── Activities view ──

function buildCrmActivityFilter() {
  const filters = [
    { key: "open",     label: "Open" },
    { key: "overdue",  label: "Overdue" },
    { key: "today",    label: "Due Today" },
    { key: "upcoming", label: "Upcoming" },
    { key: "done",     label: "Done" },
    { key: "all",      label: "All" },
  ];
  document.getElementById("crm-activity-filter").innerHTML = filters.map(f =>
    `<span class="filter-chip${crmActivityFilter === f.key ? " active" : ""}" onclick="setCrmActivityFilter('${f.key}')">${f.label}</span>`
  ).join("");
}

function setCrmActivityFilter(key) {
  crmActivityFilter = key;
  renderCrmAllActivities();
}

function renderCrmAllActivities() {
  buildCrmActivityFilter();

  const today     = TODAY;
  const sevenDays = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const contactById = Object.fromEntries(crmContacts.map(c => [c.id, c]));
  const oppById     = Object.fromEntries(crmOpps.map(o => [o.id, o]));

  let acts = crmActivities;
  if (crmActivityFilter === "open")     acts = acts.filter(a => a.status === "open");
  if (crmActivityFilter === "overdue")  acts = acts.filter(a => a.status === "open" && a.due_date && a.due_date < today);
  if (crmActivityFilter === "today")    acts = acts.filter(a => a.status === "open" && a.due_date === today);
  if (crmActivityFilter === "upcoming") acts = acts.filter(a => a.status === "open" && a.due_date && a.due_date > today && a.due_date <= sevenDays);
  if (crmActivityFilter === "done")     acts = acts.filter(a => a.status === "done");

  if (!acts.length) {
    document.getElementById("crm-activities-list").innerHTML = '<div class="crm-detail-empty">No activities.</div>';
    return;
  }

  document.getElementById("crm-activities-list").innerHTML = acts.map(a => {
    const isOverdue = a.status === "open" && a.due_date && a.due_date < today;
    const isToday   = a.status === "open" && a.due_date === today;
    const isDone    = a.status === "done";
    const rowCls    = isOverdue ? "overdue" : isToday ? "due-today" : isDone ? "done" : "";
    const dateCls   = isOverdue ? "overdue" : isToday ? "due-today" : "";
    const contact   = a.contact_id ? contactById[a.contact_id] : null;
    const opp       = a.opportunity_id ? oppById[a.opportunity_id] : null;

    return `<div class="crm-activity-row ${rowCls}">
      <span class="crm-activity-type">${escHtml(ACTIVITY_TYPE_LABEL[a.activity_type] || a.activity_type)}</span>
      <div style="flex:1">
        <div class="crm-activity-title">${escHtml(a.title)}</div>
        <div style="font-size:11px;color:#4a6a3a;margin-top:2px">
          ${contact ? escHtml(contact.name) : ""}${contact && opp ? " · " : ""}${opp ? escHtml(opp.organization_name) : ""}
        </div>
      </div>
      <span class="crm-activity-date ${dateCls}">${a.due_date ? escHtml(a.due_date) : ""}</span>
      ${a.status === "open" ? `<button class="tasks-clear-btn" style="font-size:11px;padding:2px 8px" onclick="completeCrmActivity(${a.id})">Done</button>` : ""}
      <button class="tasks-clear-btn" style="font-size:11px;padding:2px 8px" onclick="openCrmActivityModal(${a.id})">Edit</button>
    </div>`;
  }).join("");
}

// ── Badge and Banner ──

function updateCrmBadge() {
  const today   = TODAY;
  const count   = crmActivities.filter(a => a.status === "open" && a.due_date && a.due_date <= today).length;
  const badge   = document.getElementById("crm-overdue-badge");
  if (!badge) return;
  badge.textContent = count;
  badge.classList.toggle("hidden", count === 0);
}

function updateCrmOverdueBanner() {
  const today  = TODAY;
  const count  = crmActivities.filter(a => a.status === "open" && a.due_date && a.due_date < today).length;
  const banner = document.getElementById("crm-overdue-banner");
  if (!banner) return;
  if (count > 0) {
    banner.textContent = `${count} overdue ${count === 1 ? "activity" : "activities"} — click to view`;
    banner.classList.remove("hidden");
    banner.onclick = () => { setCrmView("activities"); setCrmActivityFilter("overdue"); };
  } else {
    banner.classList.add("hidden");
  }
}

// ── Contact Modal ──

function openCrmContactModal(id) {
  const modal = document.getElementById("crm-contact-modal");
  document.getElementById("crm-contact-id").value = id || "";
  document.getElementById("crm-contact-modal-title").textContent = id ? "Edit Contact" : "Add Contact";
  document.getElementById("crm-contact-delete-btn").classList.toggle("hidden", !id);

  if (id) {
    const c = crmContacts.find(x => x.id === id);
    if (c) {
      document.getElementById("crm-contact-name").value    = c.name || "";
      document.getElementById("crm-contact-org").value     = c.organization || "";
      document.getElementById("crm-contact-role").value    = c.role || "";
      document.getElementById("crm-contact-type").value    = c.relationship_type || "other";
      document.getElementById("crm-contact-email").value   = c.email || "";
      document.getElementById("crm-contact-phone").value   = c.phone || "";
      document.getElementById("crm-contact-website").value = c.website || "";
      document.getElementById("crm-contact-notes").value   = c.notes || "";
    }
  } else {
    document.getElementById("crm-contact-name").value    = "";
    document.getElementById("crm-contact-org").value     = "";
    document.getElementById("crm-contact-role").value    = "";
    document.getElementById("crm-contact-type").value    = "other";
    document.getElementById("crm-contact-email").value   = "";
    document.getElementById("crm-contact-phone").value   = "";
    document.getElementById("crm-contact-website").value = "";
    document.getElementById("crm-contact-notes").value   = "";
  }

  modal.classList.remove("hidden");
}

function closeCrmContactModal() {
  document.getElementById("crm-contact-modal").classList.add("hidden");
}

async function saveCrmContact() {
  const name = document.getElementById("crm-contact-name").value.trim();
  if (!name) { alert("Name is required."); return; }

  const id   = document.getElementById("crm-contact-id").value;
  const body = {
    name,
    organization:      document.getElementById("crm-contact-org").value.trim() || null,
    role:              document.getElementById("crm-contact-role").value.trim() || null,
    relationship_type: document.getElementById("crm-contact-type").value,
    email:             document.getElementById("crm-contact-email").value.trim() || null,
    phone:             document.getElementById("crm-contact-phone").value.trim() || null,
    website:           document.getElementById("crm-contact-website").value.trim() || null,
    notes:             document.getElementById("crm-contact-notes").value.trim() || null,
  };

  if (id) {
    body.updated_at = new Date().toISOString();
    await fetch(SUPABASE_URL + "/rest/v1/crm_contacts?id=eq." + id, {
      method: "PATCH",
      headers: { ...HEADERS, "Prefer": "return=minimal" },
      body: JSON.stringify(body)
    });
  } else {
    await fetch(SUPABASE_URL + "/rest/v1/crm_contacts", {
      method: "POST",
      headers: { ...HEADERS, "Prefer": "return=minimal" },
      body: JSON.stringify(body)
    });
  }

  closeCrmContactModal();
  await loadCrm();
  if (id) renderCrmDetail(parseInt(id));
}

async function deleteCrmContact() {
  const id = document.getElementById("crm-contact-id").value;
  if (!id) return;
  const c = crmContacts.find(x => x.id === parseInt(id));
  if (!confirm(`Delete contact "${c ? c.name : id}"? This will also delete all their activities.`)) return;

  await fetch(SUPABASE_URL + "/rest/v1/crm_contacts?id=eq." + id, {
    method: "DELETE",
    headers: HEADERS
  });

  closeCrmContactModal();
  crmActiveContactId = null;
  document.getElementById("crm-contact-detail").innerHTML = '<div class="crm-detail-empty">Select a contact to view details</div>';
  await loadCrm();
}

// ── Opportunity Modal ──

function openCrmOppModal(id, contactId) {
  const modal = document.getElementById("crm-opp-modal");
  document.getElementById("crm-opp-id").value = id || "";
  document.getElementById("crm-opp-modal-title").textContent = id ? "Edit Opportunity" : "Add Opportunity";
  document.getElementById("crm-opp-delete-btn").classList.toggle("hidden", !id);

  // Populate contact dropdown
  const contactSel = document.getElementById("crm-opp-contact");
  contactSel.innerHTML = '<option value="">— None —</option>' +
    crmContacts.map(c => `<option value="${c.id}">${escHtml(c.name)}${c.organization ? " (" + escHtml(c.organization) + ")" : ""}</option>`).join("");

  if (id) {
    const o = crmOpps.find(x => x.id === id);
    if (o) {
      document.getElementById("crm-opp-org").value         = o.organization_name || "";
      document.getElementById("crm-opp-name").value        = o.opportunity_name || "";
      document.getElementById("crm-opp-status").value      = o.current_status || "not_contacted";
      document.getElementById("crm-opp-value").value       = o.estimated_value || "";
      document.getElementById("crm-opp-next-action").value = o.next_action || "";
      document.getElementById("crm-opp-next-date").value   = o.next_action_date || "";
      document.getElementById("crm-opp-notes").value       = o.notes || "";
      contactSel.value = o.contact_id || "";
    }
  } else {
    document.getElementById("crm-opp-org").value         = "";
    document.getElementById("crm-opp-name").value        = "";
    document.getElementById("crm-opp-status").value      = "not_contacted";
    document.getElementById("crm-opp-value").value       = "";
    document.getElementById("crm-opp-next-action").value = "";
    document.getElementById("crm-opp-next-date").value   = "";
    document.getElementById("crm-opp-notes").value       = "";
    contactSel.value = contactId || "";
  }

  modal.classList.remove("hidden");
}

function closeCrmOppModal() {
  document.getElementById("crm-opp-modal").classList.add("hidden");
}

async function saveCrmOpp() {
  const org = document.getElementById("crm-opp-org").value.trim();
  if (!org) { alert("Organization is required."); return; }

  const id         = document.getElementById("crm-opp-id").value;
  const contactVal = document.getElementById("crm-opp-contact").value;
  const body = {
    organization_name: org,
    opportunity_name:  document.getElementById("crm-opp-name").value.trim() || null,
    current_status:    document.getElementById("crm-opp-status").value,
    estimated_value:   document.getElementById("crm-opp-value").value || null,
    next_action:       document.getElementById("crm-opp-next-action").value.trim() || null,
    next_action_date:  document.getElementById("crm-opp-next-date").value || null,
    notes:             document.getElementById("crm-opp-notes").value.trim() || null,
    contact_id:        contactVal ? parseInt(contactVal) : null,
  };

  if (id) {
    await fetch(SUPABASE_URL + "/rest/v1/partner_opportunities?id=eq." + id, {
      method: "PATCH",
      headers: { ...HEADERS, "Prefer": "return=minimal" },
      body: JSON.stringify(body)
    });
  } else {
    await fetch(SUPABASE_URL + "/rest/v1/partner_opportunities", {
      method: "POST",
      headers: { ...HEADERS, "Prefer": "return=minimal" },
      body: JSON.stringify(body)
    });
  }

  closeCrmOppModal();
  await loadCrm();
  if (crmActiveContactId) renderCrmDetail(crmActiveContactId);
}

async function deleteCrmOpp() {
  const id = document.getElementById("crm-opp-id").value;
  if (!id) return;
  const o = crmOpps.find(x => x.id === parseInt(id));
  if (!confirm(`Delete opportunity "${o ? o.organization_name : id}"?`)) return;

  await fetch(SUPABASE_URL + "/rest/v1/partner_opportunities?id=eq." + id, {
    method: "DELETE",
    headers: HEADERS
  });

  closeCrmOppModal();
  await loadCrm();
  if (crmActiveContactId) renderCrmDetail(crmActiveContactId);
}

// ── Activity Modal ──

function openCrmActivityModal(id, contactId) {
  const modal = document.getElementById("crm-activity-modal");
  document.getElementById("crm-activity-id").value = id || "";
  document.getElementById("crm-activity-modal-title").textContent = id ? "Edit Activity" : "Add Activity";
  document.getElementById("crm-activity-delete-btn").classList.toggle("hidden", !id);

  // Populate dropdowns
  const contactSel = document.getElementById("crm-activity-contact");
  contactSel.innerHTML = '<option value="">— None —</option>' +
    crmContacts.map(c => `<option value="${c.id}">${escHtml(c.name)}${c.organization ? " (" + escHtml(c.organization) + ")" : ""}</option>`).join("");

  const oppSel = document.getElementById("crm-activity-opp");
  oppSel.innerHTML = '<option value="">— None —</option>' +
    crmOpps.map(o => `<option value="${o.id}">${escHtml(o.organization_name)}${o.opportunity_name ? " — " + escHtml(o.opportunity_name) : ""}</option>`).join("");

  if (id) {
    const a = crmActivities.find(x => x.id === id);
    if (a) {
      document.getElementById("crm-activity-title").value   = a.title || "";
      document.getElementById("crm-activity-type").value    = a.activity_type || "follow_up";
      document.getElementById("crm-activity-due").value     = a.due_date || "";
      document.getElementById("crm-activity-notes").value   = a.notes || "";
      contactSel.value = a.contact_id || "";
      oppSel.value     = a.opportunity_id || "";
    }
  } else {
    document.getElementById("crm-activity-title").value   = "";
    document.getElementById("crm-activity-type").value    = "follow_up";
    document.getElementById("crm-activity-due").value     = "";
    document.getElementById("crm-activity-notes").value   = "";
    contactSel.value = contactId || "";
    oppSel.value     = "";
  }

  modal.classList.remove("hidden");
}

function closeCrmActivityModal() {
  document.getElementById("crm-activity-modal").classList.add("hidden");
}

async function saveCrmActivity() {
  const title = document.getElementById("crm-activity-title").value.trim();
  if (!title) { alert("Title is required."); return; }

  const id         = document.getElementById("crm-activity-id").value;
  const contactVal = document.getElementById("crm-activity-contact").value;
  const oppVal     = document.getElementById("crm-activity-opp").value;
  const body = {
    title,
    activity_type:  document.getElementById("crm-activity-type").value,
    due_date:       document.getElementById("crm-activity-due").value || null,
    notes:          document.getElementById("crm-activity-notes").value.trim() || null,
    contact_id:     contactVal ? parseInt(contactVal) : null,
    opportunity_id: oppVal     ? parseInt(oppVal)     : null,
  };

  if (id) {
    await fetch(SUPABASE_URL + "/rest/v1/crm_activities?id=eq." + id, {
      method: "PATCH",
      headers: { ...HEADERS, "Prefer": "return=minimal" },
      body: JSON.stringify(body)
    });
  } else {
    await fetch(SUPABASE_URL + "/rest/v1/crm_activities", {
      method: "POST",
      headers: { ...HEADERS, "Prefer": "return=minimal" },
      body: JSON.stringify(body)
    });
  }

  closeCrmActivityModal();
  await loadCrm();
  if (crmActiveContactId) renderCrmDetail(crmActiveContactId);
}

async function deleteCrmActivity() {
  const id = document.getElementById("crm-activity-id").value;
  if (!id) return;
  if (!confirm("Delete this activity?")) return;

  await fetch(SUPABASE_URL + "/rest/v1/crm_activities?id=eq." + id, {
    method: "DELETE",
    headers: HEADERS
  });

  closeCrmActivityModal();
  await loadCrm();
  if (crmActiveContactId) renderCrmDetail(crmActiveContactId);
}

async function completeCrmActivity(id) {
  await fetch(SUPABASE_URL + "/rest/v1/crm_activities?id=eq." + id, {
    method: "PATCH",
    headers: { ...HEADERS, "Prefer": "return=minimal" },
    body: JSON.stringify({ status: "done", completed_at: new Date().toISOString() })
  });
  await loadCrm();
  if (crmActiveContactId) renderCrmDetail(crmActiveContactId);
}

// Populate badge on startup without a full CRM load
api("crm_activities?select=id,due_date,status&status=eq.open").then(acts => {
  crmActivities = acts;
  updateCrmBadge();
}).catch(() => {});
