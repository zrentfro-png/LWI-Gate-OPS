/* ============================================================
   GATE OPS BOARD — APP LOGIC
   ============================================================ */

// ---------- State ----------

let FLIGHTS = [];           // active list of flight objects
let SHEET_URL = localStorage.getItem('gateops_sheet_url') || '';
let searchTerm = '';
let statusFilterVal = 'all';

// ---------- Gate map expansion ----------

// Turns CONFIG.GATE_MAP ranges into a flat list: { id: "A3", concourse: "A", airline: "UNITED" }
function buildGateList() {
  const gates = [];
  CONFIG.GATE_MAP.forEach(range => {
    for (let n = range.start; n <= range.end; n++) {
      gates.push({ id: `${range.concourse}${n}`, concourse: range.concourse, num: n, airline: range.airline });
    }
  });
  return gates;
}
const GATE_LIST = buildGateList();
const GATE_BY_ID = Object.fromEntries(GATE_LIST.map(g => [g.id, g]));
const CONCOURSES = [...new Set(GATE_LIST.map(g => g.concourse))].sort();

// ---------- Time helpers ----------

function timeToMinutes(raw) {
  if (!raw) return null;
  const str = raw.toString().trim();
  const match = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ampm = match[3] ? match[3].toUpperCase() : null;
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h * 60 + m;
}
function minutesToTime(mins) {
  mins = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

// Converts a flight time to its position on the timeline, accounting for
// overnight schedules. Any time earlier than the timeline's start hour
// (e.g. 12:15 AM when the day starts at 05:00) is treated as happening
// after midnight on the "next day" portion of the grid, not jumping back
// to the far left.
function toTimelineMinutes(raw) {
  const mins = timeToMinutes(raw);
  if (mins === null) return null;
  return mins < TIMELINE_START_MIN ? mins + 1440 : mins;
}

// Occupancy window for a flight: from (departure - turnaround) to departure.
// Delayed flights get an extra buffer added to the end since the exact
// new departure time is often still uncertain.
function occupancyWindow(flight) {
  const dep = toTimelineMinutes(flight.departure);
  if (dep === null) return null;
  const start = dep - CONFIG.TURNAROUND_MINUTES;
  const end = dep + (flight.status === 'DELAYED' ? 20 : 0);
  return { start, end };
}

function windowsOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

// ---------- Conflict detection ----------

// Returns a Map<flightId, conflictingFlightId> for flights whose gate
// window overlaps another flight scheduled at the same gate.
function computeConflicts() {
  const conflicts = new Map();
  const byGate = {};
  FLIGHTS.forEach(f => {
    if (f.status === 'CANCELLED' || f.status === 'DIVERTED') return;
    if (!byGate[f.gate]) byGate[f.gate] = [];
    byGate[f.gate].push(f);
  });
  Object.values(byGate).forEach(list => {
    list.sort((a, b) => toTimelineMinutes(a.departure) - toTimelineMinutes(b.departure));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const wa = occupancyWindow(list[i]);
        const wb = occupancyWindow(list[j]);
        if (wa && wb && windowsOverlap(wa, wb)) {
          // flag the later flight as the one in conflict
          conflicts.set(list[j].id, list[i].id);
        }
      }
    }
  });
  return conflicts;
}

// ---------- AI-style gate suggestion (rule-based, runs entirely in-browser) ----------
// Note: this is a deterministic scoring pass over your own gate map and
// schedule — not a call to an external AI model — so it works offline
// and never sends flight data anywhere.
function suggestGatesFor(flight, excludeGateId) {
  const window = occupancyWindow(flight);
  if (!window) return [];

  const candidates = GATE_LIST.filter(g => airlinesMatch(g.airline, flight.airline) && g.id !== excludeGateId);

  const scored = candidates.map(g => {
    const conflictsAtGate = FLIGHTS.filter(f =>
      f.id !== flight.id &&
      f.gate === g.id &&
      f.status !== 'CANCELLED' && f.status !== 'DIVERTED'
    ).some(f => {
      const w2 = occupancyWindow(f);
      return w2 && windowsOverlap(window, w2);
    });
    if (conflictsAtGate) return null;
    // prefer gates in the same concourse, closest gate number
    const currentGate = GATE_BY_ID[excludeGateId];
    const sameConcourse = currentGate && g.concourse === currentGate.concourse;
    const distance = currentGate ? Math.abs(g.num - currentGate.num) : 0;
    const score = (sameConcourse ? 0 : 1000) + distance;
    return { gate: g.id, score };
  }).filter(Boolean);

  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, 3).map(s => s.gate);
}

// ---------- Airline / gate ownership check ----------

// Normalizes an airline name for comparison only (never used for display).
function normalizeAirline(str) {
  return (str || '').toString().trim().toUpperCase();
}

// Forgiving match: handles case differences and cases where one side is a
// short name and the other is a full name (e.g. sheet says "United
// Airlines", config.js says "UNITED").
function airlinesMatch(a, b) {
  const na = normalizeAirline(a);
  const nb = normalizeAirline(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

// Returns true if the flight's airline doesn't match who the gate
// actually belongs to (per config.js GATE_MAP).
function isWrongAirlineGate(flight) {
  const gate = GATE_BY_ID[flight.gate];
  if (!gate) return false; // unknown/typo'd gate — not our call to flag here
  return !airlinesMatch(gate.airline, flight.airline);
}

// ---------- Rendering ----------

function flightMatchesFilters(f) {
  if (statusFilterVal !== 'all' && f.status !== statusFilterVal) return false;
  if (!searchTerm) return true;
  const term = searchTerm.toLowerCase();
  return (
    f.flightNumber.toLowerCase().includes(term) ||
    f.gate.toLowerCase().includes(term) ||
    f.to.toLowerCase().includes(term) ||
    f.airline.toLowerCase().includes(term)
  );
}

function statusPillClass(status) {
  switch (status) {
    case 'ON TIME': return 'pill-on-time';
    case 'DELAYED': return 'pill-delayed';
    case 'BOARDING': return 'pill-boarding';
    case 'CANCELLED': return 'pill-cancelled';
    case 'DIVERTED': return 'pill-diverted';
    default: return '';
  }
}

function renderFlightCard(flight, isConflict) {
  const card = document.createElement('div');
  card.className = 'flight-card';
  card.dataset.flightId = flight.id;
  card.draggable = true;

  const statusClass = isConflict ? 'status-conflict'
    : flight.status === 'DELAYED' ? 'status-delayed'
    : (flight.status === 'CANCELLED' || flight.status === 'DIVERTED') ? 'status-cancelled'
    : '';
  if (statusClass) card.classList.add(statusClass);

  const stripeColor = CONFIG.AIRLINE_COLORS[flight.airline] || '#3E7BFA';
  if (!isConflict && flight.status !== 'DELAYED' && flight.status !== 'CANCELLED' && flight.status !== 'DIVERTED') {
    card.style.borderLeftColor = stripeColor;
  }

  const pillClass = isConflict ? 'pill-conflict' : statusPillClass(flight.status);
  const pillLabel = isConflict ? 'CONFLICT' : flight.status;

  card.innerHTML = `
    <div class="fc-top">
      <span class="fc-flightnum">${escapeHtml(flight.flightNumber)}</span>
      <span class="fc-to">→ ${escapeHtml(flight.to)}</span>
    </div>
    <div class="fc-times">
      <span>Board ${flight.boarding}</span>
      <span>Dep ${flight.departure}</span>
    </div>
    <div class="fc-status-line">
      <span class="fc-status-pill ${pillClass}">${pillLabel}</span>
    </div>
    ${flight.comments ? `<div class="fc-comment">${escapeHtml(flight.comments)}</div>` : ''}
    ${isConflict ? `<div class="fc-conflict-note">Overlaps another aircraft at this gate</div>` : ''}
    ${!isConflict && isWrongAirlineGate(flight) ? `<div class="fc-wrong-airline-note">On a ${GATE_BY_ID[flight.gate].airline} gate</div>` : ''}
  `;

  card.addEventListener('click', () => {
    if (card.classList.contains('was-dragged')) return; // suppress click right after a drag
    openFlightModal(flight.id);
  });
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', flight.id);
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
  });
  return card;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Timeline geometry ----------

const TIMELINE_START_MIN = timeToMinutes(CONFIG.TIMELINE_START) ?? 300; // default 05:00
const TIMELINE_END_MIN = timeToMinutes(CONFIG.TIMELINE_END) ?? 1440;    // default 24:00
const INTERVAL_MIN = CONFIG.INTERVAL_MINUTES || 15;
const COL_WIDTH = CONFIG.COLUMN_WIDTH_PX || 60;
const TOTAL_COLUMNS = Math.ceil((TIMELINE_END_MIN - TIMELINE_START_MIN) / INTERVAL_MIN);
const TIMELINE_WIDTH = TOTAL_COLUMNS * COL_WIDTH;

function minutesToX(mins) {
  return ((mins - TIMELINE_START_MIN) / INTERVAL_MIN) * COL_WIDTH;
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
    cell.textContent = mins % 60 === 0 ? minutesToTime(mins) : '';
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

  // header row: corner + time ruler
  const headerRow = document.createElement('div');
  headerRow.className = 'timeline-header-row';
  const corner = document.createElement('div');
  corner.className = 'corner-cell';
  corner.textContent = 'GATE';
  headerRow.appendChild(corner);
  headerRow.appendChild(renderTimeHeader());
  scrollArea.appendChild(headerRow);

  CONCOURSES.forEach(concourse => {
    const gatesInConcourse = GATE_LIST.filter(g => g.concourse === concourse);
    const airlinesHere = [...new Set(gatesInConcourse.map(g => g.airline))];

    const labelRow = document.createElement('div');
    labelRow.className = 'concourse-label-row';
    const labelCorner = document.createElement('div');
    labelCorner.className = 'corner-cell concourse-corner';
    labelRow.appendChild(labelCorner);
    const labelBody = document.createElement('div');
    labelBody.className = 'concourse-label-body';
    labelBody.style.width = TIMELINE_WIDTH + 'px';
    labelBody.innerHTML = `<span class="concourse-title">CONCOURSE ${concourse}</span><span class="concourse-sub">${airlinesHere.join(' · ')}</span>`;
    labelRow.appendChild(labelBody);
    scrollArea.appendChild(labelRow);

    gatesInConcourse.forEach(gate => {
      const row = document.createElement('div');
      row.className = 'timeline-row';

      const gateIdEl = document.createElement('div');
      gateIdEl.className = 'gate-id-cell';
      gateIdEl.textContent = gate.id;

      const track = document.createElement('div');
      track.className = 'gate-track';
      track.style.width = TIMELINE_WIDTH + 'px';
      track.style.backgroundSize = `${COL_WIDTH}px 100%`;
      track.dataset.gateId = gate.id;
      track.dataset.airline = gate.airline;

      const flightsHere = FLIGHTS.filter(f => f.gate === gate.id && flightMatchesFilters(f));
      flightsHere.forEach(f => {
        const win = occupancyWindow(f);
        const card = renderFlightCard(f, conflicts.has(f.id));
        if (win) {
          const left = Math.max(minutesToX(win.start), 0);
          const width = Math.max(minutesToX(win.end) - minutesToX(win.start), 40);
          card.style.position = 'absolute';
          card.style.left = left + 'px';
          card.style.width = width + 'px';
        } else {
          // time didn't parse — pin to the far left so it's still visible/editable
          card.style.position = 'absolute';
          card.style.left = '0px';
          card.style.width = '150px';
        }
        track.appendChild(card);
      });

      attachDropHandlers(track);

      row.appendChild(gateIdEl);
      row.appendChild(track);
      scrollArea.appendChild(row);
    });
  });

  board.appendChild(scrollArea);
}

// ---------- Drag and drop (native HTML5 DnD; vertical gate moves only, time stays fixed) ----------

function attachDropHandlers(track) {
  track.addEventListener('dragover', (e) => {
    e.preventDefault();
    track.classList.add('drag-over');
  });
  track.addEventListener('dragleave', () => {
    track.classList.remove('drag-over');
  });
  track.addEventListener('drop', (e) => {
    e.preventDefault();
    track.classList.remove('drag-over');
    const flightId = e.dataTransfer.getData('text/plain');
    handleGateDrop(flightId, track.dataset.gateId, track.dataset.airline);
  });
}

function updateConflictBanner(conflicts) {
  const banner = document.getElementById('conflictBanner');
  if (conflicts.size === 0) {
    banner.classList.add('hidden');
    return;
  }
  banner.classList.remove('hidden');
  const names = [...conflicts.keys()]
    .map(id => FLIGHTS.find(f => f.id === id))
    .filter(Boolean)
    .map(f => f.flightNumber);
  banner.textContent = `⚠ ${conflicts.size} gate conflict${conflicts.size > 1 ? 's' : ''}: ${names.join(', ')} — reassign or adjust times`;
}

// ---------- Drag and drop handler ----------

function handleGateDrop(flightId, newGate, gateOwner) {
  const flight = FLIGHTS.find(f => f.id === flightId);
  if (!flight || flight.gate === newGate) return;

  if (gateOwner && !airlinesMatch(gateOwner, flight.airline)) {
    const proceed = confirm(
      `Gate ${newGate} belongs to ${gateOwner}, but ${flight.flightNumber} is a ${flight.airline} flight.\n\nMove it here anyway?`
    );
    if (!proceed) return;
  }

  const oldGate = flight.gate;
  flight.gate = newGate;

  renderBoard();

  if (SHEET_URL) {
    pushFlightToSheet(flight).catch(() => {
      flight.gate = oldGate;
      renderBoard();
      alert('Could not save gate change to the sheet. Reverted. Check your connection and try again.');
    });
  }
}

// ---------- Flight modal (add / edit) ----------

function populateAirlineOptions() {
  const select = document.getElementById('f_airline');
  const airlines = [...new Set(CONFIG.GATE_MAP.map(g => g.airline))].sort();
  select.innerHTML = airlines.map(a => `<option value="${a}">${a}</option>`).join('');
}

function populateGateDatalist() {
  const list = document.getElementById('gateList');
  list.innerHTML = GATE_LIST.map(g => `<option value="${g.id}">`).join('');
}

function openFlightModal(flightId) {
  const modal = document.getElementById('flightModal');
  const isEdit = !!flightId;
  document.getElementById('modalTitle').textContent = isEdit ? 'Edit Flight' : 'Add Flight';
  document.getElementById('deleteFlightBtn').classList.toggle('hidden', !isEdit);
  document.getElementById('suggestBox').classList.add('hidden');

  const flight = isEdit ? FLIGHTS.find(f => f.id === flightId) : null;

  document.getElementById('f_id').value = isEdit ? flight.id : '';
  document.getElementById('f_airline').value = isEdit ? flight.airline : CONFIG.GATE_MAP[0].airline;
  document.getElementById('f_flightnum').value = isEdit ? flight.flightNumber : '';
  document.getElementById('f_to').value = isEdit ? flight.to : '';
  document.getElementById('f_gate').value = isEdit ? flight.gate : '';
  document.getElementById('f_boarding').value = isEdit ? flight.boarding : '';
  document.getElementById('f_departure').value = isEdit ? flight.departure : '';
  document.getElementById('f_status').value = isEdit ? flight.status : 'ON TIME';
  document.getElementById('f_comments').value = isEdit ? flight.comments : '';

  if (isEdit) {
    const conflicts = computeConflicts();
    if (conflicts.has(flight.id) || flight.status === 'DELAYED') {
      const suggestions = suggestGatesFor(flight, flight.gate);
      const box = document.getElementById('suggestBox');
      if (suggestions.length) {
        box.classList.remove('hidden');
        box.innerHTML = `<strong>Suggested open gates for ${flight.airline}:</strong><br/>` +
          suggestions.map(g => `<span class="suggest-option" data-gate="${g}">${g}</span>`).join('');
        box.querySelectorAll('.suggest-option').forEach(el => {
          el.addEventListener('click', () => {
            document.getElementById('f_gate').value = el.dataset.gate;
          });
        });
      } else {
        box.classList.remove('hidden');
        box.innerHTML = `<strong>No open ${flight.airline} gates found in this window.</strong> Consider adjusting the time or checking a neighboring concourse manually.`;
      }
    }
  }

  modal.classList.remove('hidden');
}

function closeFlightModal() {
  document.getElementById('flightModal').classList.add('hidden');
}

document.getElementById('flightForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const id = document.getElementById('f_id').value || `f_${Date.now()}`;
  const flightData = {
    id,
    airline: document.getElementById('f_airline').value,
    flightNumber: document.getElementById('f_flightnum').value.trim(),
    to: document.getElementById('f_to').value.trim().toUpperCase(),
    gate: document.getElementById('f_gate').value.trim().toUpperCase(),
    boarding: document.getElementById('f_boarding').value,
    departure: document.getElementById('f_departure').value,
    status: document.getElementById('f_status').value,
    comments: document.getElementById('f_comments').value.trim(),
  };

  const gateInfo = GATE_BY_ID[flightData.gate];
  if (gateInfo && !airlinesMatch(gateInfo.airline, flightData.airline)) {
    const proceed = confirm(
      `Gate ${flightData.gate} belongs to ${gateInfo.airline}, but this is a ${flightData.airline} flight.\n\nSave it here anyway?`
    );
    if (!proceed) return; // leave the modal open so they can fix it
  }

  const existingIdx = FLIGHTS.findIndex(f => f.id === id);
  if (existingIdx >= 0) FLIGHTS[existingIdx] = flightData;
  else FLIGHTS.push(flightData);

  renderBoard();
  closeFlightModal();

  if (SHEET_URL) {
    pushFlightToSheet(flightData).catch(() => {
      alert('Saved locally, but could not sync to the sheet. Check your connection.');
    });
  }
});

document.getElementById('deleteFlightBtn').addEventListener('click', () => {
  const id = document.getElementById('f_id').value;
  if (!id) return;
  if (!confirm('Remove this flight from the board?')) return;
  FLIGHTS = FLIGHTS.filter(f => f.id !== id);
  renderBoard();
  closeFlightModal();
  if (SHEET_URL) {
    deleteFlightFromSheet(id).catch(() => {
      alert('Removed locally, but could not sync the removal to the sheet.');
    });
  }
});

document.getElementById('addFlightBtn').addEventListener('click', () => openFlightModal(null));
document.getElementById('modalClose').addEventListener('click', closeFlightModal);
document.getElementById('modalCancel').addEventListener('click', closeFlightModal);

// ---------- Search / filter ----------

document.getElementById('searchBox').addEventListener('input', (e) => {
  searchTerm = e.target.value;
  renderBoard();
});
document.getElementById('statusFilter').addEventListener('change', (e) => {
  statusFilterVal = e.target.value;
  renderBoard();
});

// ---------- Google Sheet sync ----------

function setSyncStatus(state, label) {
  const el = document.getElementById('syncStatus');
  el.className = `sync-status sync-${state}`;
  el.textContent = label;
}

async function loadFromSheet() {
  if (!SHEET_URL) return;
  setSyncStatus('offline', '● Connecting…');
  try {
    const res = await fetch(SHEET_URL + '?action=list');
    const data = await res.json();
    FLIGHTS = data.map(rowToFlight);
    setSyncStatus('online', `● Synced with sheet (${new Date().toLocaleTimeString()})`);
    renderBoard();
  } catch (err) {
    console.error(err);
    setSyncStatus('error', '● Sheet connection failed — showing local data');
  }
}

function rowToFlight(row) {
  return {
    id: row.id || row['FLIGHT NUMBER'],
    airline: row['AIRLINE'],
    flightNumber: row['FLIGHT NUMBER'],
    to: row['TO:'],
    gate: row['GATE:'],
    boarding: row['BOARDING TIME:'],
    departure: row['DEPARTURE TIME:'],
    status: row['STATUS:'] || 'ON TIME',
    comments: row['COMMENTS'] || '',
  };
}

function flightToRow(flight) {
  return {
    id: flight.id,
    'AIRLINE': flight.airline,
    'FLIGHT NUMBER': flight.flightNumber,
    'TO:': flight.to,
    'GATE:': flight.gate,
    'BOARDING TIME:': flight.boarding,
    'DEPARTURE TIME:': flight.departure,
    'STATUS:': flight.status,
    'COMMENTS': flight.comments,
  };
}

async function pushFlightToSheet(flight) {
  if (!SHEET_URL) return;
  setSyncStatus('online', '● Saving…');
  const res = await fetch(SHEET_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' }, // avoids CORS preflight on Apps Script
    body: JSON.stringify({ action: 'upsert', row: flightToRow(flight) }),
  });
  if (!res.ok) throw new Error('Sheet save failed');
  setSyncStatus('online', `● Synced with sheet (${new Date().toLocaleTimeString()})`);
}

async function deleteFlightFromSheet(id) {
  if (!SHEET_URL) return;
  const res = await fetch(SHEET_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'delete', id }),
  });
  if (!res.ok) throw new Error('Sheet delete failed');
}

document.getElementById('syncBtn').addEventListener('click', () => {
  document.getElementById('sheetUrlInput').value = SHEET_URL;
  document.getElementById('sheetModal').classList.remove('hidden');
});
document.getElementById('sheetModalClose').addEventListener('click', () => {
  document.getElementById('sheetModal').classList.add('hidden');
});
document.getElementById('sheetModalCancel').addEventListener('click', () => {
  document.getElementById('sheetModal').classList.add('hidden');
});
document.getElementById('sheetModalSave').addEventListener('click', () => {
  SHEET_URL = document.getElementById('sheetUrlInput').value.trim();
  localStorage.setItem('gateops_sheet_url', SHEET_URL);
  document.getElementById('sheetModal').classList.add('hidden');
  loadFromSheet();
});

// ---------- Clock ----------

function tickClock() {
  document.getElementById('clock').textContent = new Date().toLocaleTimeString([], { hour12: false });
}
setInterval(tickClock, 1000);

// ---------- Init ----------

function init() {
  populateAirlineOptions();
  populateGateDatalist();
  tickClock();

  if (SHEET_URL) {
    setSyncStatus('offline', '● Connecting…');
    loadFromSheet();
  } else {
    FLIGHTS = CONFIG.SAMPLE_FLIGHTS.map(f => ({ ...f }));
    setSyncStatus('offline', '● Local sample data (not synced)');
    renderBoard();
  }

  // Refresh conflict detection periodically as the clock moves,
  // without needing a manual refresh.
  setInterval(renderBoard, 60000);
}

init();
