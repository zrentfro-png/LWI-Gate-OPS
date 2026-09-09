/* ============================================================
   GATE OPS BOARD — APP LOGIC
   ============================================================ */

let FLIGHTS = [];
let SHEET_URL = localStorage.getItem('gateops_sheet_url') || '';
let searchTerm = '';
let statusFilterVal = 'all';
let WEATHER = 'CLEAR';
let WEATHER_LAST_HOUR_KEY = null;
let GROUND_STOP = null;
let HISTORY = [];
let operationalDayKey = getOperationalDayKey();
let randomEventTimer = null;
let syncQueue = new Map();
let syncTimer = null;

const DELAY_TAGS = ['DELAY', 'WEATHER', 'GROUND STOP', 'LATE ARRIVING AIRCRAFT', 'CREW HOLD', 'OTHER'];

function getOperationalDayKey() {
  const now = new Date();
  const boundary = CONFIG.DAILY_RESET_HOUR || 5;
  const effective = new Date(now);
  if (now.getHours() < boundary) effective.setDate(effective.getDate() - 1);
  return effective.toDateString();
}

function ensureOps(flight) {
  if (!flight.ops) {
    flight.ops = {
      taxiRequested: false,
      taxiApproved: false,
      taxiRequestAt: null,
      taxiPenaltyAt: null,
      pushbackRequested: false,
      pushbackApproved: false,
      pushbackRequestAt: null,
      pushbackPenaltyAt: null,
      departed: false,
      lastApprovalDelayAt: 0,
    };
  }
  return flight.ops;
}

function effectiveAirline(flight) {
  const fn = (flight.flightNumber || '').toString().trim().toUpperCase();
  if (fn.startsWith('B6')) return 'JETBLUE';
  return flight.airline;
}

function logActivity(text, type = 'INFO', flightId = null, action = null) {
  HISTORY.unshift({ id: `h_${Date.now()}_${Math.random()}`, time: new Date(), text, type, flightId, action });
  if (HISTORY.length > 500) HISTORY.length = 500;
  renderHistoryPanel();
  updateActivityBadge();
}

function pendingApprovalCount() {
  return FLIGHTS.reduce((n, f) => {
    const o = ensureOps(f);
    return n + (o.taxiRequested && !o.taxiApproved ? 1 : 0) + (o.pushbackRequested && !o.pushbackApproved ? 1 : 0);
  }, 0);
}

function updateActivityBadge() {
  const badge = document.getElementById('activityBadge');
  if (!badge) return;
  const n = pendingApprovalCount();
  badge.textContent = n;
  badge.classList.toggle('hidden', n === 0);
}

function buildGateList() {
  const gates = [];
  CONFIG.GATE_MAP.forEach(range => {
    for (let n = range.start; n <= range.end; n++) gates.push({ id: `${range.concourse}${n}`, concourse: range.concourse, num: n, airline: range.airline });
  });
  return gates;
}
const GATE_LIST = buildGateList();
const GATE_BY_ID = Object.fromEntries(GATE_LIST.map(g => [g.id, g]));
const CONCOURSES = [...new Set(GATE_LIST.map(g => g.concourse))].sort();

function timeToMinutes(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const str = raw.toString().trim();
  const match = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ampm = match[3] ? match[3].toUpperCase() : null;
  if (m > 59) return null;
  if (ampm) {
    if (h < 1 || h > 12) return null;
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
  }
  return h * 60 + m;
}

function minutesToClockString(mins) {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = (m % 60).toString().padStart(2, '0');
  const ampm = h < 12 ? 'AM' : 'PM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${mm} ${ampm}`;
}

function parseTimelineBoundary(raw, fallback) {
  if (!raw) return fallback;
  const match = String(raw).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

const TIMELINE_START_MIN = parseTimelineBoundary(CONFIG.TIMELINE_START, 300);
const TIMELINE_END_MIN = parseTimelineBoundary(CONFIG.TIMELINE_END, TIMELINE_START_MIN + 1440);
const INTERVAL_MIN = CONFIG.INTERVAL_MINUTES || 15;
const COL_WIDTH = CONFIG.COLUMN_WIDTH_PX || 60;
const TOTAL_COLUMNS = Math.ceil((TIMELINE_END_MIN - TIMELINE_START_MIN) / INTERVAL_MIN);
const TIMELINE_WIDTH = TOTAL_COLUMNS * COL_WIDTH;

function toTimelineMinutes(raw) {
  const mins = timeToMinutes(raw);
  if (mins === null) return null;
  return mins < TIMELINE_START_MIN ? mins + 1440 : mins;
}

function nowTimelineMinutes() {
  const now = new Date();
  let mins = now.getHours() * 60 + now.getMinutes();
  if (mins < TIMELINE_START_MIN) mins += 1440;
  return mins;
}

function defaultGateStartFor(flight) {
  const dep = toTimelineMinutes(flight.departure);
  return dep === null ? null : dep - (CONFIG.TURNAROUND_MINUTES || 90);
}

function gateStartMinutes(flight) {
  const explicit = toTimelineMinutes(flight.gateStart);
  return explicit !== null ? explicit : defaultGateStartFor(flight);
}

function occupancyWindow(flight) {
  const dep = toTimelineMinutes(flight.departure);
  const start = gateStartMinutes(flight);
  if (dep === null || start === null) return null;
  return { start, end: dep };
}

function windowsOverlap(a, b) { return a.start < b.end && b.start < a.end; }
function minutesToX(mins) { return ((mins - TIMELINE_START_MIN) / INTERVAL_MIN) * COL_WIDTH; }

function normalizeAirline(str) { return (str || '').toString().trim().toUpperCase(); }
function airlinesMatch(a, b) {
  const na = normalizeAirline(a), nb = normalizeAirline(b);
  return !!na && !!nb && (na === nb || na.includes(nb) || nb.includes(na));
}
function isWrongAirlineGate(flight) {
  const gate = GATE_BY_ID[flight.gate];
  return !!gate && !airlinesMatch(gate.airline, effectiveAirline(flight));
}

function isDeparted(flight) {
  const ops = ensureOps(flight);
  if (ops.departed) return true;
  const dep = toTimelineMinutes(flight.departure);
  if (dep === null) return false;
  if (nowTimelineMinutes() > dep && ops.pushbackApproved) {
    ops.departed = true;
    return true;
  }
  return nowTimelineMinutes() > dep && !ops.pushbackRequested;
}

function computeConflicts() {
  const conflicts = new Map();
  const byGate = {};
  FLIGHTS.forEach(f => {
    if (f.status === 'CANCELLED' || f.status === 'DIVERTED' || isDeparted(f)) return;
    (byGate[f.gate] ||= []).push(f);
  });
  Object.values(byGate).forEach(list => {
    list.sort((a, b) => (gateStartMinutes(a) ?? Infinity) - (gateStartMinutes(b) ?? Infinity));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = occupancyWindow(list[i]), b = occupancyWindow(list[j]);
        if (a && b && windowsOverlap(a, b)) conflicts.set(list[j].id, list[i].id);
      }
    }
  });
  return conflicts;
}

function testConflict(flight, gateId, depMinute, gateStartMinute = null) {
  const test = { ...flight, gate: gateId, departure: minutesToClockString(depMinute), gateStart: minutesToClockString(gateStartMinute ?? gateStartMinutes(flight)) };
  const w = occupancyWindow(test);
  if (!w) return true;
  return FLIGHTS.some(other => {
    if (other.id === flight.id || other.gate !== gateId || other.status === 'CANCELLED' || other.status === 'DIVERTED' || isDeparted(other)) return false;
    const ow = occupancyWindow(other);
    return ow && windowsOverlap(w, ow);
  });
}

function suggestResolutionsFor(flight) {
  const dep = toTimelineMinutes(flight.departure);
  const start = gateStartMinutes(flight);
  if (dep === null || start === null) return [];
  const currentGate = GATE_BY_ID[flight.gate];
  const max = CONFIG.CONFLICT_SEARCH_MAX_MINUTES || 120;
  const offsets = [0];
  for (let n = 15; n <= max; n += 15) offsets.push(n, -n);

  const compatible = GATE_LIST.filter(g => airlinesMatch(g.airline, effectiveAirline(flight)));
  compatible.sort((a, b) => {
    const sa = (a.id === flight.gate ? -1000 : 0) + (currentGate && a.concourse !== currentGate.concourse ? 500 : 0) + (currentGate ? Math.abs(a.num - currentGate.num) : 0);
    const sb = (b.id === flight.gate ? -1000 : 0) + (currentGate && b.concourse !== currentGate.concourse ? 500 : 0) + (currentGate ? Math.abs(b.num - currentGate.num) : 0);
    return sa - sb;
  });

  const out = [];
  for (const gate of compatible) {
    for (const offset of offsets) {
      const newDep = dep + offset;
      if (newDep <= nowTimelineMinutes() + 5) continue;
      if (newDep <= start + 10) continue;
      if (testConflict(flight, gate.id, newDep, start)) continue;
      const gateDistance = currentGate ? Math.abs(gate.num - currentGate.num) : 0;
      const score = Math.abs(offset) * 4 + gateDistance * 8 + (gate.concourse !== currentGate?.concourse ? 200 : 0) + (gate.id !== flight.gate ? 15 : 0);
      out.push({ gate: gate.id, departure: newDep, offset, score });
      break;
    }
  }
  return out.sort((a, b) => a.score - b.score).slice(0, 6);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function flightMatchesFilters(f) {
  if (statusFilterVal !== 'all' && f.status !== statusFilterVal) return false;
  if (!searchTerm) return true;
  const term = searchTerm.toLowerCase();
  return [f.flightNumber, f.gate, f.to, f.airline].some(v => (v || '').toLowerCase().includes(term));
}

function statusPillClass(status) {
  return status === 'ON TIME' ? 'pill-on-time' : status === 'DELAYED' ? 'pill-delayed' : status === 'BOARDING' ? 'pill-boarding' : (status === 'CANCELLED' || status === 'DIVERTED') ? 'pill-cancelled' : '';
}

function renderFlightCard(flight, isConflict) {
  const card = document.createElement('div');
  card.className = 'flight-card';
  card.dataset.flightId = flight.id;
  card.draggable = true;
  const ops = ensureOps(flight);
  if (isConflict) card.classList.add('status-conflict');
  else if (flight.status === 'DELAYED') card.classList.add('status-delayed');
  else if (flight.status === 'CANCELLED' || flight.status === 'DIVERTED') card.classList.add('status-cancelled');
  const stripeColor = CONFIG.AIRLINE_COLORS[effectiveAirline(flight)] || '#3E7BFA';
  if (!isConflict && flight.status === 'ON TIME') card.style.borderLeftColor = stripeColor;

  const requests = [];
  if (ops.taxiRequested && !ops.taxiApproved) requests.push(`<button class="fc-event-accept" data-approve="taxi">Approve Taxi</button>`);
  if (ops.pushbackRequested && !ops.pushbackApproved) requests.push(`<button class="fc-event-accept" data-approve="pushback">Approve Pushback</button>`);

  card.innerHTML = `
    <div class="fc-top"><span class="fc-flightnum">${escapeHtml(flight.flightNumber)}</span><span class="fc-to">→ ${escapeHtml(flight.to)}</span></div>
    <div class="fc-times"><span>Board ${escapeHtml(flight.boarding)}</span><span>Dep ${escapeHtml(flight.departure)}</span></div>
    <div class="fc-status-line"><span class="fc-status-pill ${isConflict ? 'pill-conflict' : statusPillClass(flight.status)}">${isConflict ? 'CONFLICT' : escapeHtml(flight.status)}</span>${flight.delayTag ? `<span class="fc-tag">${escapeHtml(flight.delayTag)}</span>` : ''}</div>
    ${flight.comments ? `<div class="fc-comment">${escapeHtml(flight.comments)}</div>` : ''}
    ${isConflict ? `<div class="fc-conflict-note">Gate overlap — click for minimal-change fixes</div>` : ''}
    ${!isConflict && isWrongAirlineGate(flight) ? `<div class="fc-wrong-airline-note">On a ${escapeHtml(GATE_BY_ID[flight.gate].airline)} gate</div>` : ''}
    ${requests.length ? `<div class="fc-event"><span class="fc-event-label">Approval required</span><div class="fc-event-actions">${requests.join('')}</div></div>` : ''}
    <div class="resize-handle resize-left" title="Drag to change gate block start"></div>
    <div class="resize-handle resize-right" title="Drag to change departure / gate block end"></div>`;

  card.querySelectorAll('[data-approve]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    approveOperation(flight.id, btn.dataset.approve);
  }));

  card.addEventListener('click', () => { if (!card.classList.contains('was-dragged')) openFlightModal(flight.id); });
  card.addEventListener('dragstart', e => {
    if (e.target.closest('.resize-handle')) { e.preventDefault(); return; }
    e.dataTransfer.setData('text/plain', flight.id);
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    card.classList.add('was-dragged');
    setTimeout(() => card.classList.remove('was-dragged'), 100);
  });
  return card;
}

function renderTimeHeader() {
  const header = document.createElement('div');
  header.className = 'time-header';
  header.style.width = TIMELINE_WIDTH + 'px';
  for (let i = 0; i < TOTAL_COLUMNS; i++) {
    const mins = TIMELINE_START_MIN + i * INTERVAL_MIN;
    const cell = document.createElement('div');
    cell.className = 'time-cell' + (mins % 60 === 0 ? ' time-cell-hour' : '');
    cell.style.width = COL_WIDTH + 'px';
    cell.textContent = mins % 60 === 0 ? minutesToClockString(mins) : '';
    header.appendChild(cell);
  }
  return header;
}

function renderBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';
  const conflicts = computeConflicts();
  updateConflictBanner(conflicts);
  const scrollArea = document.createElement('div');
  scrollArea.className = 'timeline-scroll';

  const headerRow = document.createElement('div');
  headerRow.className = 'timeline-header-row';
  const corner = document.createElement('div');
  corner.className = 'corner-cell'; corner.textContent = 'GATE';
  headerRow.append(corner, renderTimeHeader());
  scrollArea.appendChild(headerRow);

  CONCOURSES.forEach(concourse => {
    const gates = GATE_LIST.filter(g => g.concourse === concourse);
    const labelRow = document.createElement('div'); labelRow.className = 'concourse-label-row';
    const labelCorner = document.createElement('div'); labelCorner.className = 'corner-cell concourse-corner';
    const labelBody = document.createElement('div'); labelBody.className = 'concourse-label-body'; labelBody.style.width = TIMELINE_WIDTH + 'px';
    labelBody.innerHTML = `<span class="concourse-title">CONCOURSE ${concourse}</span><span class="concourse-sub">${[...new Set(gates.map(g => g.airline))].join(' · ')}</span>`;
    labelRow.append(labelCorner, labelBody); scrollArea.appendChild(labelRow);

    gates.forEach(gate => {
      const row = document.createElement('div'); row.className = 'timeline-row';
      const gateId = document.createElement('div'); gateId.className = 'gate-id-cell'; gateId.textContent = gate.id;
      const track = document.createElement('div'); track.className = 'gate-track'; track.style.width = TIMELINE_WIDTH + 'px'; track.style.backgroundSize = `${COL_WIDTH}px 100%`; track.dataset.gateId = gate.id; track.dataset.airline = gate.airline;

      FLIGHTS.filter(f => f.gate === gate.id && flightMatchesFilters(f)).forEach(f => {
        const win = occupancyWindow(f); const card = renderFlightCard(f, conflicts.has(f.id));
        if (win) {
          const left = Math.max(0, minutesToX(win.start));
          const width = Math.max(40, minutesToX(win.end) - minutesToX(win.start));
          card.style.left = left + 'px'; card.style.width = width + 'px';
        } else { card.style.left = '0px'; card.style.width = '150px'; }
        track.appendChild(card); attachResizeHandlers(card, f);
      });

      attachDropHandlers(track);
      row.append(gateId, track); scrollArea.appendChild(row);
    });
  });
  board.appendChild(scrollArea);
  renderNowLine(scrollArea);
  updateActivityBadge();
}

function renderNowLine(scrollArea) {
  const mins = nowTimelineMinutes();
  if (mins < TIMELINE_START_MIN || mins > TIMELINE_END_MIN) return;
  const line = document.createElement('div'); line.className = 'now-line'; line.style.left = (76 + minutesToX(mins)) + 'px'; scrollArea.appendChild(line);
}

function attachResizeHandlers(card, flight) {
  const pxPerMin = COL_WIDTH / INTERVAL_MIN;
  const start = (e, isLeft) => {
    e.preventDefault(); e.stopPropagation(); card.draggable = false;
    const handle = e.currentTarget, startX = e.clientX, baseLeft = parseFloat(card.style.left) || 0, baseWidth = parseFloat(card.style.width) || 40;
    let lastX = startX;
    try { handle.setPointerCapture(e.pointerId); } catch (_) {}
    const move = ev => {
      lastX = ev.clientX; const dx = ev.clientX - startX;
      if (isLeft) {
        const width = Math.max(30, baseWidth - dx); const left = baseLeft + (baseWidth - width);
        card.style.left = Math.max(0, left) + 'px'; card.style.width = width + 'px';
      } else card.style.width = Math.max(30, baseWidth + dx) + 'px';
    };
    const up = () => {
      document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up); card.draggable = true;
      const delta = Math.round(((lastX - startX) / pxPerMin) / INTERVAL_MIN) * INTERVAL_MIN;
      if (!delta) { renderBoard(); return; }
      if (isLeft) {
        const gs = gateStartMinutes(flight); if (gs !== null) flight.gateStart = minutesToClockString(gs + delta);
        logActivity(`Gate block resized: ${flight.flightNumber} start → ${flight.gateStart}`, 'EDIT', flight.id);
      } else {
        const dep = toTimelineMinutes(flight.departure); if (dep !== null) flight.departure = minutesToClockString(dep + delta);
        logActivity(`Gate block resized: ${flight.flightNumber} departure → ${flight.departure}`, 'EDIT', flight.id);
      }
      if (flight.status !== 'CANCELLED' && flight.status !== 'DIVERTED') queueFlightSync(flight);
      renderBoard();
    };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  };
  card.querySelector('.resize-left').addEventListener('pointerdown', e => start(e, true));
  card.querySelector('.resize-right').addEventListener('pointerdown', e => start(e, false));
}

function attachDropHandlers(track) {
  track.addEventListener('dragover', e => { e.preventDefault(); track.classList.add('drag-over'); });
  track.addEventListener('dragleave', () => track.classList.remove('drag-over'));
  track.addEventListener('drop', e => { e.preventDefault(); track.classList.remove('drag-over'); handleGateDrop(e.dataTransfer.getData('text/plain'), track.dataset.gateId, track.dataset.airline); });
}

function handleGateDrop(flightId, newGate, gateOwner) {
  const flight = FLIGHTS.find(f => f.id === flightId);
  if (!flight || flight.gate === newGate) return;
  if (gateOwner && !airlinesMatch(gateOwner, effectiveAirline(flight)) && !confirm(`Gate ${newGate} belongs to ${gateOwner}. Move ${flight.flightNumber} there anyway?`)) return;
  const old = flight.gate; flight.gate = newGate;
  logActivity(`Gate change: ${flight.flightNumber} ${old} → ${newGate}`, 'GATE', flight.id);
  queueFlightSync(flight); renderBoard();
}

function updateConflictBanner(conflicts) {
  const banner = document.getElementById('conflictBanner');
  if (!conflicts.size) { banner.classList.add('hidden'); return; }
  banner.classList.remove('hidden');
  banner.textContent = `⚠ ${conflicts.size} gate conflict${conflicts.size > 1 ? 's' : ''} — click a conflicted flight for minimal-change gate/time solutions.`;
}

function populateAirlineOptions() {
  const select = document.getElementById('f_airline');
  const airlines = [...new Set([...CONFIG.GATE_MAP.map(g => g.airline), ...FLIGHTS.map(f => f.airline)])].filter(Boolean).sort();
  select.innerHTML = airlines.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('');
}
function populateGateDatalist() { document.getElementById('gateList').innerHTML = GATE_LIST.map(g => `<option value="${g.id}">`).join(''); }

function openFlightModal(flightId) {
  populateAirlineOptions();
  const isEdit = !!flightId; const flight = isEdit ? FLIGHTS.find(f => f.id === flightId) : null;
  if (isEdit && !flight) return;
  document.getElementById('modalTitle').textContent = isEdit ? 'Edit Flight' : 'Add Flight';
  document.getElementById('deleteFlightBtn').classList.toggle('hidden', !isEdit);
  document.getElementById('quickActions').classList.toggle('hidden', !isEdit);
  document.getElementById('f_id').value = isEdit ? flight.id : '';
  document.getElementById('f_airline').value = isEdit ? flight.airline : CONFIG.GATE_MAP[0].airline;
  document.getElementById('f_flightnum').value = isEdit ? flight.flightNumber : '';
  document.getElementById('f_to').value = isEdit ? flight.to : '';
  document.getElementById('f_gate').value = isEdit ? flight.gate : '';
  document.getElementById('f_boarding').value = isEdit ? flight.boarding : '';
  document.getElementById('f_departure').value = isEdit ? flight.departure : '';
  document.getElementById('f_status').value = isEdit ? flight.status : 'ON TIME';
  document.getElementById('f_delaytag').value = isEdit ? (flight.delayTag || '') : '';
  document.getElementById('f_comments').value = isEdit ? flight.comments : '';

  const box = document.getElementById('suggestBox'); box.classList.add('hidden'); box.innerHTML = '';
  if (isEdit && computeConflicts().has(flight.id)) renderResolutionSuggestions(flight, box);
  document.getElementById('flightModal').classList.remove('hidden');
}

function renderResolutionSuggestions(flight, box) {
  const suggestions = suggestResolutionsFor(flight);
  box.classList.remove('hidden');
  if (!suggestions.length) { box.innerHTML = '<strong>No small automatic fix found.</strong> You can still resize the block or choose a gate manually.'; return; }
  box.innerHTML = `<strong>Minimal-change conflict fixes:</strong><div class="resolution-list">${suggestions.map((s, i) => {
    const timeText = s.offset === 0 ? 'keep current time' : `${s.offset > 0 ? '+' : ''}${s.offset} min → ${minutesToClockString(s.departure)}`;
    return `<button type="button" class="resolution-option" data-i="${i}"><span>${escapeHtml(s.gate)}</span><small>${escapeHtml(timeText)}</small></button>`;
  }).join('')}</div>`;
  box.querySelectorAll('.resolution-option').forEach(btn => btn.addEventListener('click', () => {
    const s = suggestions[Number(btn.dataset.i)];
    document.getElementById('f_gate').value = s.gate;
    document.getElementById('f_departure').value = minutesToClockString(s.departure);
  }));
}

function closeFlightModal() { document.getElementById('flightModal').classList.add('hidden'); }

document.getElementById('flightForm').addEventListener('submit', e => {
  e.preventDefault();
  const id = document.getElementById('f_id').value || `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const existing = FLIGHTS.find(f => f.id === id);
  const data = {
    id,
    airline: document.getElementById('f_airline').value,
    flightNumber: document.getElementById('f_flightnum').value.trim(),
    to: document.getElementById('f_to').value.trim().toUpperCase(),
    gate: document.getElementById('f_gate').value.trim().toUpperCase(),
    boarding: document.getElementById('f_boarding').value.trim(),
    departure: document.getElementById('f_departure').value.trim(),
    status: document.getElementById('f_status').value,
    comments: document.getElementById('f_comments').value.trim(),
    delayTag: document.getElementById('f_delaytag').value,
    gateStart: existing ? existing.gateStart : '',
    base: existing ? existing.base : null,
    ops: existing ? existing.ops : null,
  };
  const gateInfo = GATE_BY_ID[data.gate];
  if (gateInfo && !airlinesMatch(gateInfo.airline, effectiveAirline(data)) && !confirm(`Gate ${data.gate} belongs to ${gateInfo.airline}. Save anyway?`)) return;
  const idx = FLIGHTS.findIndex(f => f.id === id);
  if (idx >= 0) FLIGHTS[idx] = data; else FLIGHTS.push(data);
  logActivity(`${idx >= 0 ? 'Edited' : 'Added'} ${data.flightNumber}`, 'EDIT', id);
  queueFlightSync(data); renderBoard(); closeFlightModal();
});

document.getElementById('deleteFlightBtn').addEventListener('click', async () => {
  const id = document.getElementById('f_id').value; if (!id || !confirm('Remove this flight from the live board?')) return;
  const f = FLIGHTS.find(x => x.id === id); FLIGHTS = FLIGHTS.filter(x => x.id !== id); renderBoard(); closeFlightModal();
  logActivity(`Removed flight ${f?.flightNumber || id}`, 'DELETE', id);
  if (SHEET_URL) try { await deleteFlightFromSheet(id); } catch { alert('Could not sync removal to the sheet.'); }
});

document.getElementById('addFlightBtn').addEventListener('click', () => openFlightModal(null));
document.getElementById('modalClose').addEventListener('click', closeFlightModal);
document.getElementById('modalCancel').addEventListener('click', closeFlightModal);

document.querySelectorAll('#quickActions button[data-action]').forEach(btn => btn.addEventListener('click', () => {
  const id = document.getElementById('f_id').value; if (id) applyQuickAction(id, btn.dataset.action);
}));

function applyDelay(flight, minutes, tag, reason, moveStart = false) {
  if (!flight || isDeparted(flight) || flight.status === 'CANCELLED' || flight.status === 'DIVERTED') return false;
  const dep = toTimelineMinutes(flight.departure); if (dep === null) return false;
  const oldDep = dep; flight.departure = minutesToClockString(dep + minutes); flight.status = 'DELAYED'; flight.delayTag = tag || 'DELAY';
  if (moveStart) {
    const start = gateStartMinutes(flight); if (start !== null) flight.gateStart = minutesToClockString(start + minutes);
    const board = toTimelineMinutes(flight.boarding); if (board !== null) flight.boarding = minutesToClockString(board + minutes);
  }
  logActivity(`${flight.flightNumber} delayed +${minutes}m (${reason || tag || 'delay'})`, 'DELAY', flight.id);
  queueFlightSync(flight);
  return oldDep !== toTimelineMinutes(flight.departure);
}

function applyQuickAction(id, action) {
  const f = FLIGHTS.find(x => x.id === id); if (!f) return;
  if (action === 'delay15') applyDelay(f, 15, document.getElementById('f_delaytag').value || 'DELAY', 'manual');
  else if (action === 'delay30') applyDelay(f, 30, document.getElementById('f_delaytag').value || 'DELAY', 'manual');
  else if (action === 'cancel') { f.status = 'CANCELLED'; f.delayTag = 'OTHER'; logActivity(`${f.flightNumber} cancelled`, 'CANCEL', f.id); queueFlightSync(f); }
  else if (action === 'divert') { f.status = 'DIVERTED'; f.delayTag = 'OTHER'; logActivity(`${f.flightNumber} diverted`, 'DIVERT', f.id); queueFlightSync(f); }
  else if (action === 'normal') restoreFlightFromBaseline(f);
  renderBoard(); closeFlightModal();
}

function restoreFlightFromBaseline(f) {
  if (!f.base) { f.status = 'ON TIME'; f.delayTag = ''; return; }
  f.gate = f.base.gate; f.boarding = f.base.boarding; f.departure = f.base.departure; f.status = f.base.status || 'ON TIME'; f.comments = f.base.comments || ''; f.gateStart = f.base.gateStart || ''; f.delayTag = '';
  f.ops = null; logActivity(`${f.flightNumber} returned to baseline schedule`, 'RESET', f.id); queueFlightSync(f);
}

function processRequiredApprovals() {
  const nowM = nowTimelineMinutes(); const nowMs = Date.now(); let changed = false;
  FLIGHTS.forEach(f => {
    if (f.status === 'CANCELLED' || f.status === 'DIVERTED' || isDeparted(f)) return;
    const ops = ensureOps(f), start = gateStartMinutes(f), dep = toTimelineMinutes(f.departure);
    if (start === null || dep === null) return;

    if (!ops.taxiRequested && nowM >= start - (CONFIG.TAXI_REQUEST_LEAD_MINUTES || 15) && nowM <= start + 30) {
      ops.taxiRequested = true; ops.taxiRequestAt = nowMs; ops.taxiPenaltyAt = nowMs + (CONFIG.APPROVAL_GRACE_MINUTES || 5) * 60000;
      logActivity(`Taxi-to-gate request: ${f.flightNumber} → ${f.gate}`, 'REQUEST', f.id, 'taxi'); changed = true;
    }

    if (ops.taxiRequested && !ops.taxiApproved && nowMs >= ops.taxiPenaltyAt) {
      if (applyDelay(f, CONFIG.APPROVAL_DELAY_STEP_MINUTES || 5, 'LATE ARRIVING AIRCRAFT', 'taxi approval not granted', true)) changed = true;
      ops.taxiPenaltyAt = nowMs + (CONFIG.APPROVAL_GRACE_MINUTES || 5) * 60000;
    }

    const dep2 = toTimelineMinutes(f.departure);
    if (!ops.pushbackRequested && dep2 !== null && nowM >= dep2 - (CONFIG.PUSHBACK_REQUEST_LEAD_MINUTES || 10) && nowM <= dep2 + 30) {
      ops.pushbackRequested = true; ops.pushbackRequestAt = nowMs; ops.pushbackPenaltyAt = nowMs + (CONFIG.APPROVAL_GRACE_MINUTES || 5) * 60000;
      logActivity(`Pushback request: ${f.flightNumber} at ${f.gate}`, 'REQUEST', f.id, 'pushback'); changed = true;
    }

    if (ops.pushbackRequested && !ops.pushbackApproved && nowMs >= ops.pushbackPenaltyAt) {
      if (applyDelay(f, CONFIG.APPROVAL_DELAY_STEP_MINUTES || 5, 'DELAY', 'pushback approval not granted', false)) changed = true;
      ops.pushbackPenaltyAt = nowMs + (CONFIG.APPROVAL_GRACE_MINUTES || 5) * 60000;
    }
  });
  if (changed) renderBoard();
}

function approveOperation(flightId, type) {
  const f = FLIGHTS.find(x => x.id === flightId); if (!f) return;
  const o = ensureOps(f);
  if (type === 'taxi') { o.taxiApproved = true; logActivity(`Taxi approved: ${f.flightNumber} → ${f.gate}`, 'APPROVAL', f.id); }
  if (type === 'pushback') { o.pushbackApproved = true; logActivity(`Pushback approved: ${f.flightNumber} at ${f.gate}`, 'APPROVAL', f.id); }
  renderBoard();
}

function processWeatherHour() {
  if (WEATHER === 'CLEAR') return;
  const now = new Date();
  const hourKey = `${getOperationalDayKey()}_${now.getHours()}`;
  if (WEATHER_LAST_HOUR_KEY === hourKey) return;
  WEATHER_LAST_HOUR_KEY = hourKey;

  let start = nowTimelineMinutes();
  const hourStart = Math.floor(start / 60) * 60;
  const hourEnd = hourStart + 60;
  const chance = WEATHER === 'STORM' ? (CONFIG.STORM_AFFECT_CHANCE || 0.42) : (CONFIG.WINDY_AFFECT_CHANCE || 0.16);
  const minDelay = WEATHER === 'STORM' ? (CONFIG.STORM_DELAY_MIN_MINUTES || 10) : 5;
  const maxDelay = WEATHER === 'STORM' ? (CONFIG.STORM_DELAY_MAX_MINUTES || 35) : 15;
  let count = 0;

  FLIGHTS.forEach(f => {
    const dep = toTimelineMinutes(f.departure);
    if (dep === null || dep < start || dep >= hourEnd || isDeparted(f) || f.status === 'CANCELLED' || f.status === 'DIVERTED') return;
    if (Math.random() > chance) return;
    const delay = Math.ceil((minDelay + Math.random() * (maxDelay - minDelay)) / 5) * 5;
    if (applyDelay(f, delay, 'WEATHER', WEATHER === 'STORM' ? 'thunderstorm' : 'wind')) count++;
  });
  logActivity(`${WEATHER === 'STORM' ? 'Thunderstorm' : 'Wind'} window ${minutesToClockString(hourStart)}–${minutesToClockString(hourEnd)}: ${count} flight${count === 1 ? '' : 's'} affected`, 'WEATHER');
  if (count) renderBoard();
}

function issueGroundStop(durationMinutes, source = 'manual') {
  const start = nowTimelineMinutes(); const end = start + durationMinutes;
  GROUND_STOP = { id: `gs_${Date.now()}`, start, end, durationMinutes, applied: new Set() };
  let count = 0;
  FLIGHTS.forEach(f => {
    const dep = toTimelineMinutes(f.departure);
    if (dep === null || dep < start || dep >= end || isDeparted(f) || f.status === 'CANCELLED' || f.status === 'DIVERTED') return;
    const delay = Math.max(5, Math.ceil((end - dep) / 5) * 5);
    if (applyDelay(f, delay, 'GROUND STOP', `ground stop until ${minutesToClockString(end)}`)) { GROUND_STOP.applied.add(f.id); count++; }
  });
  logActivity(`Ground stop issued for ${durationMinutes}m (${minutesToClockString(start)}–${minutesToClockString(end)}); ${count} departure${count === 1 ? '' : 's'} directly affected`, 'GROUNDSTOP');
  updateGroundStopStatus(); renderBoard();
}

function updateGroundStopStatus() {
  const el = document.getElementById('groundStopStatus'); if (!el) return;
  if (!GROUND_STOP || nowTimelineMinutes() >= GROUND_STOP.end) { el.textContent = 'No active ground stop'; return; }
  el.textContent = `Active until ${minutesToClockString(GROUND_STOP.end)}`;
}

function randomFutureFlight(maxAhead = 120, airline = null) {
  const now = nowTimelineMinutes();
  const c = FLIGHTS.filter(f => {
    const dep = toTimelineMinutes(f.departure);
    return dep !== null && dep > now && dep <= now + maxAhead && !isDeparted(f) &&
      f.status !== 'CANCELLED' && f.status !== 'DIVERTED' &&
      (!airline || airlinesMatch(effectiveAirline(f), airline));
  });
  return c.length ? c[Math.floor(Math.random() * c.length)] : null;
}

function randomFutureFlights(maxAhead = 120, airline = null, limit = 4) {
  const now = nowTimelineMinutes();
  const c = FLIGHTS.filter(f => {
    const dep = toTimelineMinutes(f.departure);
    return dep !== null && dep > now && dep <= now + maxAhead && !isDeparted(f) &&
      f.status !== 'CANCELLED' && f.status !== 'DIVERTED' &&
      (!airline || airlinesMatch(effectiveAirline(f), airline));
  });
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c.slice(0, limit);
}

function randomAirlineDisruption() {
  const airlines = [...new Set(FLIGHTS.map(f => effectiveAirline(f)).filter(Boolean))];
  if (!airlines.length) return false;
  const airline = airlines[Math.floor(Math.random() * airlines.length)];
  const affected = randomFutureFlights(150, airline, 2 + Math.floor(Math.random() * 4));
  if (!affected.length) return false;
  const causes = [
    ['CREW HOLD', 'crew scheduling disruption'],
    ['OTHER', 'airline systems slowdown'],
    ['LATE ARRIVING AIRCRAFT', 'late inbound aircraft rotation'],
    ['OTHER', 'maintenance coordination issue']
  ];
  const [tag, cause] = causes[Math.floor(Math.random() * causes.length)];
  const baseDelay = [10, 15, 20, 25][Math.floor(Math.random() * 4)];
  let count = 0;
  affected.forEach((f, idx) => {
    const extra = idx && Math.random() < .45 ? 5 : 0;
    if (applyDelay(f, baseDelay + extra, tag, `${airline} ${cause}`)) count++;
  });
  if (count) logActivity(`${airline} disruption: ${cause}; ${count} flight${count === 1 ? '' : 's'} affected`, 'AIRLINE');
  return count > 0;
}

function randomGateEvent() {
  const f = randomFutureFlight(100);
  if (!f) return false;
  const reasons = ['jet bridge issue', 'ground power unit unavailable', 'baggage belt problem', 'gate equipment inspection'];
  const reason = reasons[Math.floor(Math.random() * reasons.length)];
  const delay = [5, 10, 15, 20][Math.floor(Math.random() * 4)];
  const ok = applyDelay(f, delay, 'OTHER', reason);
  if (ok) logActivity(`Gate event at ${f.gate}: ${reason} — ${f.flightNumber} +${delay}m`, 'GATE', f.id);
  return ok;
}

function randomCrewEvent() {
  const f = randomFutureFlight(120);
  if (!f) return false;
  const delay = [10, 15, 20, 30][Math.floor(Math.random() * 4)];
  const ok = applyDelay(f, delay, 'CREW HOLD', 'crew connection / staffing hold');
  if (ok) logActivity(`Crew hold: ${f.flightNumber} at ${f.gate} +${delay}m`, 'CREW', f.id);
  return ok;
}

function spawnRandomEvent() {
  const r = Math.random();
  let happened = false;

  if (r < 0.24) {
    const f = randomFutureFlight(120);
    if (f) happened = applyDelay(f, [5,10,15,20,30][Math.floor(Math.random()*5)], Math.random() < .3 ? 'CREW HOLD' : 'OTHER', 'random operational delay');
  } else if (r < 0.39) {
    happened = randomAirlineDisruption();
  } else if (r < 0.50) {
    happened = randomGateEvent();
  } else if (r < 0.59) {
    happened = randomCrewEvent();
  } else if (r < 0.66) {
    const f = randomFutureFlight(90);
    if (f) { f.status = 'CANCELLED'; f.delayTag = 'OTHER'; logActivity(`Random event: ${f.flightNumber} cancelled`, 'CANCEL', f.id); queueFlightSync(f); happened = true; }
  } else if (r < 0.72) {
    const f = randomFutureFlight(90);
    if (f) { f.status = 'DIVERTED'; f.delayTag = 'OTHER'; logActivity(`Random event: ${f.flightNumber} diverted`, 'DIVERT', f.id); queueFlightSync(f); happened = true; }
  } else if (r < 0.81) {
    issueGroundStop([15,20,30,45,60][Math.floor(Math.random()*5)], 'random event'); happened = true;
  } else if (r < 0.91) {
    WEATHER = Math.random() < .72 ? 'STORM' : 'WINDY';
    WEATHER_LAST_HOUR_KEY = null;
    document.getElementById('weatherSelect').value = WEATHER;
    logActivity(`Random weather event: ${WEATHER === 'STORM' ? 'THUNDERSTORM' : 'WINDY CONDITIONS'}`, 'WEATHER');
    processWeatherHour(); happened = true;
  } else {
    createRandomFlight(); happened = true;
  }

  if (!happened) {
    const f = randomFutureFlight(120);
    if (f) applyDelay(f, 10, 'OTHER', 'minor operational hold');
  }

  renderBoard();
  scheduleNextRandomEvent();
}

function createRandomFlight() {
  const airlines = [...new Set(CONFIG.GATE_MAP.map(g => g.airline))];
  const airline = airlines[Math.floor(Math.random()*airlines.length)];
  const gates = GATE_LIST.filter(g => g.airline === airline); if (!gates.length) return;
  const gate = gates[Math.floor(Math.random()*gates.length)];
  const dep = nowTimelineMinutes() + 30 + Math.floor(Math.random()*90);
  const id = `sim_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
  const prefixes = { UNITED:'UA', AMERICAN:'AA', DELTA:'DL', SOUTHWEST:'WN', ALASKA:'AS', JETBLUE:'B6', FRONTIER:'F9', SPIRIT:'NK', HAWAIIAN:'HA', AVELO:'XP' };
  const flight = { id, airline, flightNumber: `${prefixes[airline] || 'GT'}${Math.floor(100+Math.random()*8900)}`, to: ['DEN','ORD','ATL','DFW','LAX','PHX','MCO','SEA'][Math.floor(Math.random()*8)], gate: gate.id, boarding: minutesToClockString(dep-30), departure: minutesToClockString(dep), status:'ON TIME', comments:'Random added flight', delayTag:'', gateStart: minutesToClockString(dep-(CONFIG.TURNAROUND_MINUTES||90)), base:null, ops:null };
  FLIGHTS.push(flight); logActivity(`Random new flight: ${flight.flightNumber} → ${flight.to}, gate ${flight.gate}`, 'NEW', id); queueFlightSync(flight);
}

function scheduleNextRandomEvent() {
  clearTimeout(randomEventTimer);
  let min = CONFIG.RANDOM_EVENT_MIN_SECONDS || 25, max = CONFIG.RANDOM_EVENT_MAX_SECONDS || 110;
  if (WEATHER === 'STORM') { min = CONFIG.STORM_EVENT_MIN_SECONDS || 15; max = CONFIG.STORM_EVENT_MAX_SECONDS || 55; }
  else if (WEATHER === 'WINDY') { min = CONFIG.WINDY_EVENT_MIN_SECONDS || 20; max = CONFIG.WINDY_EVENT_MAX_SECONDS || 80; }
  const delay = (min + Math.random() * (max - min)) * 1000;
  randomEventTimer = setTimeout(spawnRandomEvent, delay);
}

function collectCarryovers() {
  const carry = [];
  FLIGHTS.forEach(f => {
    if (f.status === 'CANCELLED' || f.status === 'DIVERTED' || isDeparted(f)) return;
    let liveDep = toTimelineMinutes(f.departure);
    if (liveDep === null) return;
    const baseRef = f.base && f.base.departure ? toTimelineMinutes(f.base.departure) : (f.createdOperationalMinute || liveDep);
    if (baseRef !== null && liveDep < baseRef - 180) liveDep += 1440;
    if (liveDep < TIMELINE_END_MIN) return;
    carry.push({ ...flightToRow(f), 'GATEOPS ID': `carry_${f.id}_${Date.now()}_${Math.random().toString(36).slice(2,6)}` });
  });
  return carry;
}

async function resetSimulation(reason, preserveCarryovers) {
  WEATHER = 'CLEAR'; WEATHER_LAST_HOUR_KEY = null; GROUND_STOP = null;
  document.getElementById('weatherSelect').value = 'CLEAR'; updateGroundStopStatus();
  const carryovers = preserveCarryovers ? collectCarryovers() : [];
  logActivity(`— Simulation reset (${reason})${carryovers.length ? `; ${carryovers.length} carryover flight(s)` : ''} —`, 'RESET');
  if (!SHEET_URL) { FLIGHTS = CONFIG.SAMPLE_FLIGHTS.map(f => ({...f})); renderBoard(); return; }
  try {
    const params = new URLSearchParams({ action: 'reset', carryovers: JSON.stringify(carryovers) });
    const res = await fetch(SHEET_URL + '?' + params.toString(), { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Reset failed');
    FLIGHTS = (data.rows || []).map(rowToFlight); renderBoard();
  } catch (e) { console.error(e); alert('Could not reset the live sheet to the baseline schedule.'); }
}

function checkDailyReset() {
  const key = getOperationalDayKey();
  if (key !== operationalDayKey) { operationalDayKey = key; resetSimulation('new operational day', true); }
}

function renderHistoryPanel() {
  const list = document.getElementById('historyList'); if (!list) return;
  const approvals = [];
  FLIGHTS.forEach(f => {
    const o = ensureOps(f);
    if (o.taxiRequested && !o.taxiApproved) approvals.push({ f, kind:'taxi', label:'Approve Taxi' });
    if (o.pushbackRequested && !o.pushbackApproved) approvals.push({ f, kind:'pushback', label:'Approve Pushback' });
  });
  const approvalHtml = approvals.map(a => `<div class="activity-request"><div><strong>${escapeHtml(a.f.flightNumber)}</strong> · ${escapeHtml(a.f.gate)}<small>${a.kind === 'taxi' ? 'Taxi to gate requested' : 'Pushback requested'}</small></div><button class="btn btn-primary btn-sm" data-approve-flight="${escapeHtml(a.f.id)}" data-approve-kind="${a.kind}">${a.label}</button></div>`).join('');
  const historyHtml = HISTORY.length ? HISTORY.map(h => `<div class="history-row"><span class="history-time">${h.time.toLocaleTimeString([], {hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true})}</span><span>${escapeHtml(h.text)}</span></div>`).join('') : '<div class="history-empty">No activity yet this session.</div>';
  list.innerHTML = `${approvalHtml}${historyHtml}`;
  list.querySelectorAll('[data-approve-flight]').forEach(btn => btn.addEventListener('click', () => approveOperation(btn.dataset.approveFlight, btn.dataset.approveKind)));
}

function setSyncStatus(state, label) { const el = document.getElementById('syncStatus'); el.className = `sync-status sync-${state}`; el.textContent = label; }

function rowToFlight(row) {
  const dep = row['DEPARTURE TIME:'] || '';
  const gateStart = row['GATE BLOCK START:'] || '';
  return {
    id: row['GATEOPS ID'] || row.id || `legacy_${Math.random()}`,
    airline: row['AIRLINE'] || '', flightNumber: row['FLIGHT NUMBER'] || '', to: row['TO:'] || '', gate: row['GATE:'] || '',
    boarding: row['BOARDING TIME:'] || '', departure: dep, status: row['STATUS:'] || 'ON TIME', comments: row['COMMENTS'] || '', delayTag: row['DELAY TAG:'] || '',
    gateStart,
    base: row.__IS_BASELINE ? { gate: row.__BASE_GATE || '', boarding: row.__BASE_BOARDING || '', departure: row.__BASE_DEPARTURE || '', status: row.__BASE_STATUS || 'ON TIME', comments: row.__BASE_COMMENTS || '', gateStart: row.__BASE_GATE_START || '' } : null,
    ops: null,
  };
}

function flightToRow(f) {
  return { 'GATEOPS ID': f.id, 'AIRLINE': f.airline, 'FLIGHT NUMBER': f.flightNumber, 'TO:': f.to, 'GATE:': f.gate, 'BOARDING TIME:': f.boarding, 'DEPARTURE TIME:': f.departure, 'STATUS:': f.status, 'COMMENTS': f.comments, 'GATE BLOCK START:': f.gateStart || '', 'DELAY TAG:': f.delayTag || '' };
}

async function loadFromSheet() {
  if (!SHEET_URL) return;
  setSyncStatus('offline', '● Connecting…');
  try {
    const res = await fetch(SHEET_URL + '?action=list&_=' + Date.now(), { cache:'no-store' }); const data = await res.json();
    if (!res.ok || data.error || !Array.isArray(data)) throw new Error(data.error || 'Load failed');
    FLIGHTS = data.map(rowToFlight); setSyncStatus('online', `● Synced (${new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit',hour12:true})})`); renderBoard();
  } catch (e) { console.error(e); setSyncStatus('error', '● Sheet connection failed'); }
}

function queueFlightSync(flight) {
  if (!SHEET_URL) return;
  syncQueue.set(flight.id, flightToRow(flight));
  clearTimeout(syncTimer); syncTimer = setTimeout(flushSyncQueue, 500);
}

async function flushSyncQueue() {
  const rows = [...syncQueue.values()]; syncQueue.clear();
  for (const row of rows) {
    try {
      setSyncStatus('online', '● Saving…');
      const params = new URLSearchParams({ action:'upsert', row:JSON.stringify(row) });
      const res = await fetch(SHEET_URL + '?' + params.toString(), { cache:'no-store' }); const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Save failed');
    } catch (e) { console.error(e); setSyncStatus('error', '● Save failed'); }
  }
  if (SHEET_URL) setSyncStatus('online', `● Synced (${new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit',hour12:true})})`);
}

async function deleteFlightFromSheet(id) {
  const params = new URLSearchParams({ action:'delete', id });
  const res = await fetch(SHEET_URL + '?' + params.toString(), { cache:'no-store' }); const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || 'Delete failed');
}

document.getElementById('historyBtn').addEventListener('click', () => { renderHistoryPanel(); document.getElementById('historyModal').classList.remove('hidden'); });
document.getElementById('historyModalClose').addEventListener('click', () => document.getElementById('historyModal').classList.add('hidden'));
document.getElementById('settingsBtn').addEventListener('click', () => { document.getElementById('weatherSelect').value = WEATHER; updateGroundStopStatus(); document.getElementById('settingsModal').classList.remove('hidden'); });
document.getElementById('settingsModalClose').addEventListener('click', () => document.getElementById('settingsModal').classList.add('hidden'));
document.getElementById('weatherSelect').addEventListener('change', e => { WEATHER = e.target.value; WEATHER_LAST_HOUR_KEY = null; logActivity(`Weather set to ${WEATHER}`, 'WEATHER'); processWeatherHour(); scheduleNextRandomEvent(); renderBoard(); });
document.getElementById('issueGroundStopBtn').addEventListener('click', () => issueGroundStop(Math.max(5, Number(document.getElementById('groundStopMinutes').value) || 30), 'manual'));
document.getElementById('resetSimBtn').addEventListener('click', () => { if (confirm('Reset the live board back to the protected baseline schedule now?')) { resetSimulation('manual reset', false); document.getElementById('settingsModal').classList.add('hidden'); } });
document.getElementById('searchBox').addEventListener('input', e => { searchTerm = e.target.value; renderBoard(); });
document.getElementById('statusFilter').addEventListener('change', e => { statusFilterVal = e.target.value; renderBoard(); });
document.getElementById('syncBtn').addEventListener('click', () => { document.getElementById('sheetUrlInput').value = SHEET_URL; document.getElementById('sheetModal').classList.remove('hidden'); });
document.getElementById('sheetModalClose').addEventListener('click', () => document.getElementById('sheetModal').classList.add('hidden'));
document.getElementById('sheetModalCancel').addEventListener('click', () => document.getElementById('sheetModal').classList.add('hidden'));
document.getElementById('sheetModalSave').addEventListener('click', () => { SHEET_URL = document.getElementById('sheetUrlInput').value.trim(); localStorage.setItem('gateops_sheet_url', SHEET_URL); document.getElementById('sheetModal').classList.add('hidden'); loadFromSheet(); });

function tickClock() { document.getElementById('clock').textContent = new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true}); }

function init() {
  populateAirlineOptions(); populateGateDatalist(); tickClock();
  if (SHEET_URL) loadFromSheet(); else { FLIGHTS = CONFIG.SAMPLE_FLIGHTS.map(f => ({...f})); setSyncStatus('offline', '● Local sample data'); renderBoard(); }
  setInterval(tickClock, 1000);
  setInterval(() => { processRequiredApprovals(); processWeatherHour(); checkDailyReset(); updateGroundStopStatus(); }, 15000);
  setInterval(renderBoard, 60000);
  scheduleNextRandomEvent();
}

init();
