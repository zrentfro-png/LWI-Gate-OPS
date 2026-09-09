/* ============================================================
   GATE OPS BOARD — APP LOGIC & GAME SIMULATION BACKEND
   ============================================================ */

// ---------- State ----------
let FLIGHTS = [];                     // Active flight objects
let SHEET_URL = localStorage.getItem('gateops_sheet_url') || '';
let searchTerm = '';
let statusFilterVal = 'all';

// Operational Constants from Config
const TIMELINE_START_MIN = timeToMinutes(CONFIG.TIMELINE_START) || 300;
const TIMELINE_END_MIN = timeToMinutes(CONFIG.TIMELINE_END) || 1740;

// ---------- Delay Reason Tags ----------
const DELAY_TAGS = [
  'NONE',
  'DELAY',
  'WEATHER',
  'GROUND_STOP',
  'LATE_ARRIVING_AIRCRAFT',
  'CREW_HOLD',
  'OTHER'
];

// ---------- Live Simulation State (Ephemeral) ----------
let WEATHER = 'CLEAR';                // CLEAR | WINDY | STORM | GROUND_STOP
let HISTORY = [];                     // [{time, text}]
let simTimer = null;
let operationalDayKey = getOperationalDayKey();

function getOperationalDayKey() {
  const now = new Date();
  const boundary = CONFIG.DAILY_RESET_HOUR || 5;
  const effective = new Date(now);
  if (now.getHours() < boundary) effective.setDate(effective.getDate() - 1);
  return effective.toDateString();
}

function ensureSim(flight) {
  if (!flight.sim) {
    flight.sim = { 
      delayMin: 0, 
      status: null, 
      pendingEvent: null, 
      delayTag: 'NONE',
      durationOverrideMin: null 
    };
  }
  return flight.sim;
}

function effectiveStatus(flight) {
  return (flight.sim && flight.sim.status) || flight.status || 'ON TIME';
}

function effectiveAirline(flight) {
  const fn = (flight.flightNumber || '').toString().trim().toUpperCase();
  if (fn.startsWith('B6')) return 'JETBLUE';
  return flight.airline;
}

function logHistory(text) {
  HISTORY.unshift({ time: new Date().toLocaleTimeString(), text });
  if (HISTORY.length > 300) HISTORY.length = 300;
  renderHistoryPanel();
}

// Reverts all simulation changes and reloads default sheet data
function resetSimulation(reason) {
  FLIGHTS.forEach(f => { f.sim = null; });
  WEATHER = 'CLEAR';
  const wEl = document.getElementById('weatherSelect');
  if (wEl) wEl.value = 'CLEAR';
  
  logHistory(`— Simulation reset (${reason}) — Reverting to sheet defaults.`);
  
  if (SHEET_URL) {
    loadFromSheet();
  } else {
    FLIGHTS = CONFIG.SAMPLE_FLIGHTS.map(f => ({ ...f }));
    renderBoard();
  }
}

// ---------- Gate Map Helpers ----------
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

// ---------- Time Conversion Helpers ----------
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

function toTimelineMinutes(raw) {
  const mins = timeToMinutes(raw);
  if (mins === null) return null;
  return mins < TIMELINE_START_MIN ? mins + 1440 : mins;
}

function getCurrentTimelineMinutes() {
  const now = new Date();
  return toTimelineMinutes(`${now.getHours()}:${now.getMinutes()}`);
}

/* 
 * Calculates gate occupancy window.
 * Rule: For delays (Weather, Ground Stop, Crew Hold, etc.), starting time stays identical
 * UNLESS the tag is LATE_ARRIVING_AIRCRAFT.
 */
function occupancyWindow(flight) {
  const dep = toTimelineMinutes(flight.departure);
  if (dep === null) return null;

  const sim = ensureSim(flight);
  const tag = sim.delayTag || 'NONE';
  const delayMin = sim.delayMin || 0;

  let baseTurnaround = sim.durationOverrideMin !== null 
    ? sim.durationOverrideMin 
    : CONFIG.TURNAROUND_MINUTES;

  let start = dep - baseTurnaround;
  let boarding = toTimelineMinutes(flight.boarding);
  if (boarding !== null) {
    start = Math.min(boarding, start);
  }

  // If Late Arriving Aircraft, push start time forward by delay amount
  if (tag === 'LATE_ARRIVING_AIRCRAFT' && delayMin > 0) {
    start += delayMin;
  }

  let end = dep + delayMin + (effectiveStatus(flight) === 'DELAYED' ? 15 : 0);
  return { start, end };
}

// ---------- Conflict Detection ----------
function computeConflicts() {
  const conflicts = new Map();
  const byGate = {};
  
  FLIGHTS.forEach(f => {
    const st = effectiveStatus(f);
    if (st === 'CANCELLED' || st === 'DIVERTED') return;
    if (!byGate[f.gate]) byGate[f.gate] = [];
    byGate[f.gate].push(f);
  });

  Object.values(byGate).forEach(list => {
    list.sort((a, b) => toTimelineMinutes(a.departure) - toTimelineMinutes(b.departure));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const wa = occupancyWindow(list[i]);
        const wb = occupancyWindow(list[j]);
        if (wa && wb && (wa.start < wb.end && wb.start < wa.end)) {
          conflicts.set(list[j].id, list[i].id);
        }
      }
    }
  });
  return conflicts;
}

// ---------- Sheet Syncing API ----------
async function loadFromSheet() {
  if (!SHEET_URL) return;
  updateSyncStatus('Syncing...', 'sync-offline');
  try {
    const resp = await fetch(`${SHEET_URL}?action=list`);
    const data = await resp.json();
    if (Array.isArray(data)) {
      FLIGHTS = data.map((row, idx) => ({
        id: row['FLIGHT NUMBER'] || `f_${idx}`,
        airline: row['AIRLINE'] || '',
        flightNumber: row['FLIGHT NUMBER'] || '',
        to: row['TO:'] || row['TO'] || '',
        gate: row['GATE:'] || row['GATE'] || '',
        boarding: row['BOARDING TIME:'] || row['BOARDING TIME'] || '',
        departure: row['DEPARTURE TIME:'] || row['DEPARTURE TIME'] || '',
        status: row['STATUS:'] || row['STATUS'] || 'ON TIME',
        comments: row['COMMENTS'] || ''
      }));
      updateSyncStatus('● Connected to Sheet', 'sync-online');
      renderBoard();
    }
  } catch (err) {
    updateSyncStatus('Sync error', 'sync-error');
  }
}

async function syncFlightToSheet(flight) {
  if (!SHEET_URL) return;
  const payload = {
    'AIRLINE': flight.airline,
    'FLIGHT NUMBER': flight.flightNumber,
    'TO:': flight.to,
    'GATE:': flight.gate,
    'BOARDING TIME:': flight.boarding,
    'DEPARTURE TIME:': flight.departure,
    'STATUS:': flight.status,
    'COMMENTS': flight.comments
  };
  try {
    await fetch(`${SHEET_URL}?action=upsert&row=${encodeURIComponent(JSON.stringify(payload))}`);
  } catch (err) {
    console.error('Failed syncing to sheet:', err);
  }
}

function updateSyncStatus(text, cls) {
  const el = document.getElementById('syncStatus');
  if (el) { el.textContent = text; el.className = `sync-status ${cls}`; }
}

// ---------- Simulation Engine ----------
function runSimulationTick() {
  const nowMins = getCurrentTimelineMinutes();

  // Handle Airport Ground Stop: Only affect flights that have NOT departed yet
  if (WEATHER === 'GROUND_STOP') {
    FLIGHTS.forEach(f => {
      const depMins = toTimelineMinutes(f.departure);
      const st = effectiveStatus(f);
      // Skip flights that have already departed
      if (depMins !== null && depMins >= nowMins && st !== 'CANCELLED' && st !== 'DIVERTED') {
        const sim = ensureSim(f);
        if (st !== 'DELAYED') {
          sim.status = 'DELAYED';
          sim.delayTag = 'GROUND_STOP';
          sim.delayMin += 30;
          logHistory(`Ground Stop: Auto-delayed ${f.flightNumber} (+30m hold)`);
        }
      }
    });
  }

  // Handle Storms: Random chance to delay upcoming flights
  if (WEATHER === 'STORM') {
    FLIGHTS.forEach(f => {
      const depMins = toTimelineMinutes(f.departure);
      if (depMins !== null && depMins >= nowMins && Math.random() < CONFIG.STORM_DELAY_CHANCE) {
        const sim = ensureSim(f);
        if (sim.delayTag === 'NONE') {
          sim.status = 'DELAYED';
          sim.delayTag = 'WEATHER';
          sim.delayMin += 15;
          logHistory(`Weather Alert: Storm delayed ${f.flightNumber} (+15m)`);
        }
      }
    });
  }

  // Random Event Spawner (Game Mode)
  if (Math.random() < CONFIG.EVENT_SPAWN_CHANCE) {
    const eligible = FLIGHTS.filter(f => {
      const dep = toTimelineMinutes(f.departure);
      return dep !== null && dep >= nowMins && effectiveStatus(f) !== 'CANCELLED';
    });
    if (eligible.length > 0) {
      const target = eligible[Math.floor(Math.random() * eligible.length)];
      const sim = ensureSim(target);
      if (!sim.pendingEvent) {
        const tags = ['DELAY', 'WEATHER', 'LATE_ARRIVING_AIRCRAFT', 'CREW_HOLD', 'OTHER'];
        const chosenTag = tags[Math.floor(Math.random() * tags.length)];
        sim.pendingEvent = { tag: chosenTag, minutes: 15 };
        logHistory(`Sim Alert: ${target.flightNumber} reporting ${chosenTag.replace(/_/g, ' ')}`);
      }
    }
  }

  renderBoard();
}

function startSimulationLoop() {
  if (simTimer) clearInterval(simTimer);
  // Pace varies randomly between 4 to 8 seconds per tick
  const interval = (CONFIG.SIM_TICK_SECONDS || 6) * 1000 + (Math.random() * 2000 - 1000);
  simTimer = setInterval(() => {
    runSimulationTick();
  }, interval);
}

// ---------- UI Rendering & Board Logic ----------
function renderBoard() {
  const board = document.getElementById('board');
  if (!board) return;

  const conflicts = computeConflicts();
  const totalCols = Math.ceil((TIMELINE_END_MIN - TIMELINE_START_MIN) / CONFIG.INTERVAL_MINUTES);
  const trackWidthPx = totalCols * CONFIG.COLUMN_WIDTH_PX;

  let html = `<div class="timeline-scroll" style="width: ${trackWidthPx + 76}px;">`;
  
  // Header Row
  html += `<div class="timeline-header-row"><div class="corner-cell">GATE</div><div class="time-header">`;
  for (let m = TIMELINE_START_MIN; m < TIMELINE_END_MIN; m += CONFIG.INTERVAL_MINUTES) {
    const isHour = m % 60 === 0;
    html += `<div class="time-cell ${isHour ? 'time-cell-hour' : ''}" style="width:${CONFIG.COLUMN_WIDTH_PX}px;">${isHour ? minutesToTime(m) : ''}</div>`;
  }
  html += `</div></div>`;

  // Render Concourse & Gate Tracks
  CONCOURSES.forEach(conc => {
    html += `<div class="concourse-label-row"><div class="concourse-label-body"><span class="concourse-title">CONCOURSE ${conc}</span></div></div>`;
    
    const concGates = GATE_LIST.filter(g => g.concourse === conc);
    concGates.forEach(gate => {
      const gateFlights = FLIGHTS.filter(f => f.gate === gate.id);
      
      html += `<div class="timeline-row">
        <div class="gate-id-cell">${gate.id}</div>
        <div class="gate-track" data-gate="${gate.id}" style="width:${trackWidthPx}px;">`;

      gateFlights.forEach(f => {
        const win = occupancyWindow(f);
        if (!win) return;

        const leftPx = ((win.start - TIMELINE_START_MIN) / CONFIG.INTERVAL_MINUTES) * CONFIG.COLUMN_WIDTH_PX;
        const widthPx = Math.max(30, ((win.end - win.start) / CONFIG.INTERVAL_MINUTES) * CONFIG.COLUMN_WIDTH_PX);
        const isConflicting = conflicts.has(f.id);
        const st = effectiveStatus(f);
        const sim = ensureSim(f);

        html += `
          <div class="flight-card status-${st.toLowerCase().replace(/\s+/g, '-')} ${isConflicting ? 'status-conflict' : ''}"
               style="left:${leftPx}px; width:${widthPx}px; border-left-color:${CONFIG.AIRLINE_COLORS[effectiveAirline(f)] || '#3E7BFA'};"
               onclick="openEditModal('${f.id}')">
            <div class="resize-handle resize-left" onclick="event.stopPropagation(); resizeBlock('${f.id}', -15)"></div>
            <div class="fc-top">
              <span class="fc-flightnum">${f.flightNumber}</span>
              <span class="fc-to">${f.to}</span>
            </div>
            <div class="fc-times">${f.boarding || ''} - ${f.departure || ''}</div>
            <div class="fc-status-line">
              <span class="fc-status-pill pill-${st.toLowerCase().replace(/\s+/g, '-')}">${st}</span>
              ${sim.delayTag !== 'NONE' ? `<span class="fc-status-pill pill-delayed">${sim.delayTag.replace(/_/g, ' ')}</span>` : ''}
            </div>
            ${sim.pendingEvent ? `
              <div class="fc-event">
                <span class="fc-event-label">${sim.pendingEvent.tag} (+${sim.pendingEvent.minutes}m)</span>
                <button class="fc-event-accept" onclick="event.stopPropagation(); acceptEvent('${f.id}')">Accept</button>
              </div>
            ` : ''}
            <div class="resize-handle resize-right" onclick="event.stopPropagation(); resizeBlock('${f.id}', 15)"></div>
          </div>
        `;
      });

      html += `</div></div>`;
    });
  });

  html += `</div>`;
  board.innerHTML = html;
}

// Adjust block length manually via handles
window.resizeBlock = function(flightId, deltaMins) {
  const f = FLIGHTS.find(item => item.id === flightId);
  if (!f) return;
  const sim = ensureSim(f);
  const currentTurnaround = sim.durationOverrideMin !== null ? sim.durationOverrideMin : CONFIG.TURNAROUND_MINUTES;
  sim.durationOverrideMin = Math.max(30, currentTurnaround + deltaMins);
  logHistory(`Resized block for ${f.flightNumber} to ${sim.durationOverrideMin} mins`);
  renderBoard();
};

window.acceptEvent = function(flightId) {
  const f = FLIGHTS.find(item => item.id === flightId);
  if (!f || !f.sim || !f.sim.pendingEvent) return;
  
  const evt = f.sim.pendingEvent;
  f.sim.delayTag = evt.tag;
  f.sim.delayMin += evt.minutes;
  f.sim.status = 'DELAYED';
  f.sim.pendingEvent = null;

  logHistory(`Accepted ${evt.tag} delay for ${f.flightNumber} (+${evt.minutes}m)`);
  renderBoard();
};

window.openEditModal = function(flightId) {
  const f = FLIGHTS.find(item => item.id === flightId);
  if (!f) return;
  
  document.getElementById('modalTitle').textContent = 'Edit Flight';
  document.getElementById('f_id').value = f.id;
  document.getElementById('f_flightnum').value = f.flightNumber;
  document.getElementById('f_to').value = f.to;
  document.getElementById('f_gate').value = f.gate;
  document.getElementById('f_boarding').value = f.boarding;
  document.getElementById('f_departure').value = f.departure;
  document.getElementById('f_status').value = f.status;
  document.getElementById('f_comments').value = f.comments;
  
  document.getElementById('flightModal').classList.remove('hidden');
};

function renderHistoryPanel() {
  const list = document.getElementById('historyList');
  if (!list) return;
  if (HISTORY.length === 0) {
    list.innerHTML = `<div class="history-empty">No activity recorded yet.</div>`;
    return;
  }
  list.innerHTML = HISTORY.map(h => `
    <div class="history-row">
      <span class="history-time">${h.time}</span>
      <span>${h.text}</span>
    </div>
  `).join('');
}

// ---------- Event Listeners & Init ----------
document.addEventListener('DOMContentLoaded', () => {
  // Sync Button
  document.getElementById('syncBtn')?.addEventListener('click', () => {
    document.getElementById('sheetModal')?.classList.remove('hidden');
  });

  document.getElementById('sheetModalSave')?.addEventListener('click', () => {
    const url = document.getElementById('sheetUrlInput').value.trim();
    if (url) {
      SHEET_URL = url;
      localStorage.setItem('gateops_sheet_url', url);
      document.getElementById('sheetModal')?.classList.add('hidden');
      loadFromSheet();
    }
  });

  // Reset Simulation Button
  document.getElementById('resetSimBtn')?.addEventListener('click', () => {
    resetSimulation('Manual User Trigger');
    document.getElementById('settingsModal')?.classList.add('hidden');
  });

  // Modal Closers
  ['modalClose', 'sheetModalClose', 'historyModalClose', 'settingsModalClose'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', (e) => {
      e.target.closest('.modal-overlay').classList.add('hidden');
    });
  });

  document.getElementById('historyBtn')?.addEventListener('click', () => {
    renderHistoryPanel();
    document.getElementById('historyModal')?.classList.remove('hidden');
  });

  document.getElementById('settingsBtn')?.addEventListener('click', () => {
    document.getElementById('settingsModal')?.classList.remove('hidden');
  });

  // Form Submit
  document.getElementById('flightForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('f_id').value;
    let f = FLIGHTS.find(item => item.id === id);
    if (!f) {
      f = { id: id || `f_${Date.now()}` };
      FLIGHTS.push(f);
    }
    f.flightNumber = document.getElementById('f_flightnum').value;
    f.to = document.getElementById('f_to').value;
    f.gate = document.getElementById('f_gate').value;
    f.boarding = document.getElementById('f_boarding').value;
    f.departure = document.getElementById('f_departure').value;
    f.status = document.getElementById('f_status').value;
    f.comments = document.getElementById('f_comments').value;

    syncFlightToSheet(f);
    document.getElementById('flightModal').classList.add('hidden');
    renderBoard();
  });

  // Initial Load
  if (SHEET_URL) {
    loadFromSheet();
  } else {
    FLIGHTS = CONFIG.SAMPLE_FLIGHTS.map(f => ({ ...f }));
    renderBoard();
  }

  startSimulationLoop();
});
