/* ============================================================
   GATE OPS BOARD — APP LOGIC
   ============================================================ */

let FLIGHTS = [];
const SHEET_URL = 'https://script.google.com/macros/s/AKfycby9XfQI4dPTTHNPAoxeVWm0RLUMSeg6dl-H6iOOhPGAkjHODmseogl9h5RAxcRfYst6aA/exec';
let searchTerm = '';
let statusFilterVal = 'all';
let WEATHER = 'CLEAR';
let WEATHER_LAST_HOUR_KEY = null;
let GROUND_STOP = null; // airport-wide movement closure
let GROUND_STOP_LAST_ISSUED_AT = 0;
let ATC_GROUND_STOPS = [];
let HISTORY = [];
let operationalDayKey = getOperationalDayKey();
let randomEventTimer = null;
let syncQueue = new Map();
let SHEET_FLIGHT_IDS = new Set();
let syncTimer = null;
let unreadEventCount = 0;
let nextRandomEventAt = null;
let persistTimer = null;
const OPS_STATE_STORAGE_KEY = 'gateops_operational_state_v1';

const EVENT_ACTIVITY_TYPES = new Set(['DELAY','CANCEL','DIVERT','WEATHER','GROUNDSTOP','ATC','AIRLINE','GATE','CREW','NEW','CONFLICT','AUTOSOLVE']);

const DELAY_TAGS = ['DELAY', 'WEATHER', 'AIRPORT CLOSURE', 'ATC GROUND STOP', 'GROUND STOP', 'LATE ARRIVING AIRCRAFT', 'CREW HOLD', 'OTHER'];

function getOperationalDayKey() {
  const now = new Date();
  const boundary = CONFIG.DAILY_RESET_HOUR || 5;
  const effective = new Date(now);
  if (now.getHours() < boundary) effective.setDate(effective.getDate() - 1);
  return effective.toDateString();
}

function serializeGroundStop(gs) {
  if (!gs) return null;
  return {
    ...gs,
    applied: gs.applied instanceof Set ? [...gs.applied] : (Array.isArray(gs.applied) ? gs.applied : []),
  };
}

function saveOperationalStateNow() {
  try {
    const state = {
      version: 1,
      operationalDayKey,
      savedAt: Date.now(),
      weather: WEATHER,
      weatherLastHourKey: WEATHER_LAST_HOUR_KEY,
      groundStop: serializeGroundStop(GROUND_STOP),
      groundStopLastIssuedAt: GROUND_STOP_LAST_ISSUED_AT,
      atcGroundStops: ATC_GROUND_STOPS.map(gs => ({ ...gs, affected: Array.isArray(gs.affected) ? gs.affected : [] })),
      history: HISTORY.map(h => ({ ...h, time: h.time instanceof Date ? h.time.toISOString() : h.time })),
      unreadEventCount,
      nextRandomEventAt,
      flights: FLIGHTS.map(f => ({
        id: f.id,
        ops: f.ops ? { ...f.ops } : null,
        gate: f.gate,
        boarding: f.boarding,
        departure: f.departure,
        status: f.status,
        comments: f.comments,
        delayTag: f.delayTag || '',
        gateStart: f.gateStart || '',
        airline: f.airline,
        flightNumber: f.flightNumber,
        to: f.to,
        base: f.base || null,
      })),
    };
    localStorage.setItem(OPS_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Could not persist Gate Ops state:', err);
  }
}

function persistOperationalState() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(saveOperationalStateNow, 150);
}

function clearPersistedOperationalState() {
  clearTimeout(persistTimer);
  try { localStorage.removeItem(OPS_STATE_STORAGE_KEY); } catch (_) {}
}

function restoreOperationalState() {
  let raw;
  try { raw = localStorage.getItem(OPS_STATE_STORAGE_KEY); } catch (_) { return false; }
  if (!raw) return false;

  let saved;
  try { saved = JSON.parse(raw); } catch (_) { clearPersistedOperationalState(); return false; }
  if (!saved || saved.operationalDayKey !== operationalDayKey) {
    clearPersistedOperationalState();
    return false;
  }

  WEATHER = saved.weather || 'CLEAR';
  WEATHER_LAST_HOUR_KEY = saved.weatherLastHourKey || null;
  GROUND_STOP = saved.groundStop ? { ...saved.groundStop, applied: new Set(saved.groundStop.applied || []) } : null;
  GROUND_STOP_LAST_ISSUED_AT = Number(saved.groundStopLastIssuedAt) || 0;
  ATC_GROUND_STOPS = Array.isArray(saved.atcGroundStops) ? saved.atcGroundStops.map(gs => ({ ...gs, cities: Array.isArray(gs.cities) ? gs.cities : [], affected: Array.isArray(gs.affected) ? gs.affected : [] })) : [];
  HISTORY = Array.isArray(saved.history) ? saved.history.map(h => ({ ...h, time: new Date(h.time) })) : [];
  unreadEventCount = Number(saved.unreadEventCount) || 0;
  nextRandomEventAt = Number(saved.nextRandomEventAt) || null;

  const savedById = new Map((saved.flights || []).map(f => [String(f.id), f]));
  const liveIds = new Set(FLIGHTS.map(f => String(f.id)));

  // Reattach today's in-browser operational state to the authoritative
  // live rows loaded from the Sheet.
  FLIGHTS.forEach(f => {
    const sf = savedById.get(String(f.id));
    if (!sf) return;
    f.ops = sf.ops ? { ...sf.ops } : null;
  });

  // Only resurrect locally-created simulation flights that may not have
  // reached the Sheet before a refresh. Never resurrect an ordinary scheduled
  // flight: doing that can create a second copy when the Sheet response was
  // briefly stale during a move/save.
  for (const sf of saved.flights || []) {
    const sid = String(sf.id || '');
    if (liveIds.has(sid) || !sid.startsWith('sim_')) continue;
    FLIGHTS.push({
      id: sf.id,
      airline: sf.airline || '',
      flightNumber: sf.flightNumber || '',
      to: sf.to || '',
      gate: sf.gate || '',
      boarding: sf.boarding || '',
      departure: sf.departure || '',
      status: sf.status || 'ON TIME',
      comments: sf.comments || '',
      delayTag: sf.delayTag || '',
      gateStart: sf.gateStart || '',
      base: sf.base || null,
      ops: sf.ops ? { ...sf.ops } : null,
    });
    liveIds.add(sid);
  }
  normalizeFlightCollection();

  const w = document.getElementById('weatherSelect');
  if (w) w.value = WEATHER;
  updateGroundStopStatus();
  updateAtcGroundStopStatus();
  updateActivityBadge();
  updateEventsBadge();
  return true;
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

const AIRLINE_PREFIX_MAP = {
  UA: 'UNITED',
  WN: 'SOUTHWEST',
  DL: 'DELTA',
  AA: 'AMERICAN',
  B6: 'JETBLUE',
  AS: 'ALASKA',
  F9: 'FRONTIER',
  NK: 'SPIRIT',
  G4: 'ALLEGIANT',
  HA: 'HAWAIIAN',
  XP: 'AVELO',
  MX: 'BREEZE',
  SY: 'SUN COUNTRY',
};

function inferAirlineFromFlightNumber(flightNumber) {
  const fn = (flightNumber || '').toString().trim().toUpperCase().replace(/\s+/g, '');
  if (!fn) return '';
  const two = fn.slice(0, 2);
  return AIRLINE_PREFIX_MAP[two] || '';
}

function canonicalAirlineName(value) {
  const raw = normalizeAirline(value);
  if (!raw) return '';
  const aliases = {
    'UNITED AIRLINES': 'UNITED',
    'SOUTHWEST AIRLINES': 'SOUTHWEST',
    'DELTA AIR LINES': 'DELTA',
    'DELTA AIRLINES': 'DELTA',
    'AMERICAN AIRLINES': 'AMERICAN',
    'JETBLUE AIRWAYS': 'JETBLUE',
    'ALASKA AIRLINES': 'ALASKA',
    'FRONTIER AIRLINES': 'FRONTIER',
    'SPIRIT AIRLINES': 'SPIRIT',
    'ALLEGIANT AIR': 'ALLEGIANT',
    'HAWAIIAN AIRLINES': 'HAWAIIAN',
    'AVELO AIRLINES': 'AVELO',
    'BREEZE AIRWAYS': 'BREEZE',
    'SUN COUNTRY AIRLINES': 'SUN COUNTRY',
  };
  return aliases[raw] || raw;
}

function effectiveAirline(flight) {
  const inferred = inferAirlineFromFlightNumber(flight?.flightNumber);
  // Flight number is authoritative when recognizable. This also preserves the
  // special B6/JetBlue behavior even if the Sheet's AIRLINE cell is wrong.
  if (inferred) return inferred;
  return canonicalAirlineName(flight?.airline);
}

function logActivity(text, type = 'INFO', flightId = null, action = null) {
  HISTORY.unshift({ id: `h_${Date.now()}_${Math.random()}`, time: new Date(), text, type, flightId, action });
  if (HISTORY.length > 500) HISTORY.length = 500;
  if (EVENT_ACTIVITY_TYPES.has(type)) unreadEventCount++;
  renderHistoryPanel();
  renderEventsPanel();
  updateActivityBadge();
  updateEventsBadge();
  persistOperationalState();
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

function updateEventsBadge() {
  const badge = document.getElementById('eventsBadge');
  if (!badge) return;
  badge.textContent = unreadEventCount;
  badge.classList.toggle('hidden', unreadEventCount === 0);
}


function markDelayedForTimeChange(flight, reason = 'time changed') {
  if (!flight || flight.status === 'CANCELLED' || flight.status === 'DIVERTED') return;
  const wasDelayed = flight.status === 'DELAYED';
  flight.status = 'DELAYED';
  if (!flight.delayTag) flight.delayTag = 'DELAY';
  if (!wasDelayed) logActivity(`${flight.flightNumber} marked DELAYED (${reason})`, 'DELAY', flight.id);
}

function timeValueChanged(a, b) {
  const am = toTimelineMinutes(a);
  const bm = toTimelineMinutes(b);
  if (am !== null && bm !== null) return am !== bm;
  return String(a || '').trim() !== String(b || '').trim();
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

function displayClockTime(raw) {
  const mins = timeToMinutes(raw);
  return mins === null ? (raw || '') : minutesToClockString(mins);
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
  const na = canonicalAirlineName(a), nb = canonicalAirlineName(b);
  return !!na && !!nb && (na === nb || na.includes(nb) || nb.includes(na));
}
function gateCompatibleForFlight(flight, gateId) {
  const gate = GATE_BY_ID[gateId];
  return !!gate && airlinesMatch(gate.airline, effectiveAirline(flight));
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

function dedupeFlightsById(flights) {
  const out = [];
  const seen = new Set();
  for (const flight of flights || []) {
    const id = String(flight?.id || '').trim();
    if (!id) {
      out.push(flight);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(flight);
  }
  return out;
}

function normalizeFlightCollection() {
  FLIGHTS = dedupeFlightsById(FLIGHTS);
}


function getAllDayConflictPairs() {
  const pairs = [];
  const byGate = {};

  FLIGHTS.forEach(f => {
    if (f.status === 'CANCELLED' || f.status === 'DIVERTED') return;
    const w = occupancyWindow(f);
    if (!w) return;
    (byGate[f.gate] ||= []).push(f);
  });

  Object.values(byGate).forEach(list => {
    list.sort((a, b) => (gateStartMinutes(a) ?? Infinity) - (gateStartMinutes(b) ?? Infinity));
    for (let i = 0; i < list.length; i++) {
      const aw = occupancyWindow(list[i]);
      if (!aw) continue;
      for (let j = i + 1; j < list.length; j++) {
        if (String(list[i].id) === String(list[j].id)) continue;
        const bw = occupancyWindow(list[j]);
        if (!bw) continue;
        if (bw.start >= aw.end) break;
        if (windowsOverlap(aw, bw)) pairs.push([list[i], list[j]]);
      }
    }
  });

  return pairs;
}



function allPhysicalGateIds() {
  return GATE_LIST.map(g => g.id);
}

function getAllDayGateConflictPairsNoDepartedFilter() {
  const active = FLIGHTS.filter(f => {
    const id = String(f.sheetId || f.id || '').trim();
    return id && SHEET_FLIGHT_IDS.has(id) && !id.startsWith('sim_');
  });
  const byGate = {};
  active.forEach(f => { (byGate[f.gate] ||= []).push(f); });

  const pairs = [];
  Object.values(byGate).forEach(list => {
    list.sort((a,b) => (gateStartMinutes(a) ?? Infinity) - (gateStartMinutes(b) ?? Infinity));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const aw = occupancyWindow(list[i]);
        const bw = occupancyWindow(list[j]);
        if (!aw || !bw) continue;
        if (bw.start >= aw.end) break;
        if (windowsOverlap(aw, bw)) pairs.push([list[i], list[j]]);
      }
    }
  });
  return pairs;
}

function forceFitEverythingNoDelays() {
  const gateIds = allPhysicalGateIds();
  if (!gateIds.length) throw new Error('No configured gates were found.');

  const blockMinutes = Math.max(30, Number(CONFIG.TURNAROUND_MINUTES) || 90);
  const boardLead = 30;

  const flights = FLIGHTS
    .filter(f => {
      const id = String(f.sheetId || f.id || '').trim();
      return id && SHEET_FLIGHT_IDS.has(id) && !id.startsWith('sim_');
    })
    .map((f, index) => {
      let desiredDep = toTimelineMinutes(f.departure);
      if (desiredDep === null) desiredDep = TIMELINE_START_MIN + blockMinutes;
      desiredDep = Math.max(TIMELINE_START_MIN + blockMinutes, Math.min(TIMELINE_END_MIN, desiredDep));
      return { flight: f, index, desiredDep, originalGate: f.gate };
    })
    .sort((a,b) => a.desiredDep - b.desiredDep || a.index - b.index);

  // Smooth airport-wide demand curve for the 24 operational hours beginning at 5 AM.
  // Every hour remains active; midday/afternoon is busier, overnight is lighter.
  const hourWeights = [
    0.70, 0.78, 0.86, 0.95, 1.05, 1.15,
    1.22, 1.28, 1.32, 1.35, 1.34, 1.31,
    1.27, 1.20, 1.12, 1.03, 0.94, 0.86,
    0.79, 0.73, 0.68, 0.64, 0.60, 0.58
  ];

  function allocateHourlyCounts(total) {
    const sum = hourWeights.reduce((a,b) => a+b, 0);
    const raw = hourWeights.map(w => total * w / sum);
    const counts = raw.map(Math.floor);
    let remaining = total - counts.reduce((a,b) => a+b, 0);
    const order = raw
      .map((v,i) => ({i, frac: v - Math.floor(v)}))
      .sort((a,b) => b.frac - a.frac);
    for (let k = 0; k < remaining; k++) counts[order[k % order.length].i]++;
    return counts;
  }

  function buildSmoothTargetDepartures(total) {
    const counts = allocateHourlyCounts(total);
    const slots = [];

    counts.forEach((count, hourIndex) => {
      const hourStart = TIMELINE_START_MIN + hourIndex * 60;
      if (!count) return;

      // Spread departures throughout the hour instead of creating banks at :00/:15/:30/:45.
      // The small deterministic phase shift keeps adjacent hours from looking identical.
      const phase = (hourIndex * 7) % Math.max(1, count);
      for (let j = 0; j < count; j++) {
        const k = (j + phase) % count;
        const minuteInHour = Math.min(59, Math.max(0, Math.floor(((k + 0.5) * 60) / count)));
        slots.push(hourStart + minuteInHour);
      }
    });

    slots.sort((a,b) => a-b);
    return slots;
  }

  const targetDeps = buildSmoothTargetDepartures(flights.length);
  flights.forEach((item, i) => {
    item.targetDep = targetDeps[i] ?? item.desiredDep;
    item.targetStart = item.targetDep - blockMinutes;
  });

  const intervalsByGate = Object.fromEntries(gateIds.map(id => [id, []]));
  const departuresByMinute = new Map();
  const departuresByHour = new Map();

  function slotFree(gateId, start, end) {
    return intervalsByGate[gateId].every(w => !(start < w.end && w.start < end));
  }

  function addSlot(gateId, start, end) {
    intervalsByGate[gateId].push({ start, end });
    intervalsByGate[gateId].sort((a,b) => a.start - b.start);
  }

  function compatibleGateIds(flight) {
    return gateIds.filter(id => gateCompatibleForFlight(flight, id));
  }

  function orderedGates(item) {
    const compatible = compatibleGateIds(item.flight);
    const gateNum = id => Number(String(id).replace(/^[A-Z]+/i,'')) || 999;
    const originalPrefix = String(item.originalGate || '').charAt(0);
    return compatible.sort((a,b) => {
      const score = id => {
        let v = 0;
        if (id === item.originalGate) v -= 10000;
        if (String(id).charAt(0) !== originalPrefix) v += 300;
        v += Math.abs(gateNum(id) - gateNum(item.originalGate));
        return v;
      };
      return score(a) - score(b);
    });
  }

  function hourIndexForMinute(depMinute) {
    return Math.max(0, Math.min(23, Math.floor((depMinute - TIMELINE_START_MIN) / 60)));
  }

  function localDeparturePenalty(depMinute) {
    const exact = departuresByMinute.get(depMinute) || 0;
    let near3 = 0, near10 = 0;
    for (let m = depMinute - 10; m <= depMinute + 10; m++) {
      const c = departuresByMinute.get(m) || 0;
      if (Math.abs(m - depMinute) <= 3) near3 += c;
      near10 += c;
    }

    // Exact simultaneous departures are expensive; nearby traffic is allowed but smoothed.
    return exact * 2500 + near3 * 110 + near10 * 14;
  }

  function hourlyPenalty(depMinute) {
    const h = hourIndexForMinute(depMinute);
    const current = departuresByHour.get(h) || 0;
    const target = allocateHourlyCounts(flights.length)[h];
    return Math.max(0, current - target) * 80 + Math.max(0, current + 1 - target - 2) * 240;
  }

  function timeCandidates(item) {
    const minDep = TIMELINE_START_MIN + blockMinutes;
    const maxDep = TIMELINE_END_MIN;
    const base = Math.max(minDep, Math.min(maxDep, item.targetDep));
    const out = [base];

    // Search minute-by-minute around the smooth target time, alternating later/earlier.
    const maxShift = Math.max(base - minDep, maxDep - base);
    for (let d = 1; d <= maxShift; d++) {
      if (base + d <= maxDep) out.push(base + d);
      if (base - d >= minDep) out.push(base - d);
    }
    return out;
  }

  let movedGate = 0;
  let movedTime = 0;
  let placed = 0;
  let maxTimeShift = 0;

  for (const item of flights) {
    const f = item.flight;
    const gates = orderedGates(item);
    if (!gates.length) {
      throw new Error(`No configured ${effectiveAirline(f)} gate exists for ${f.flightNumber || f.id}.`);
    }

    let best = null;
    for (const dep of timeCandidates(item)) {
      const start = dep - blockMinutes;
      const shiftFromTarget = Math.abs(dep - item.targetDep);
      const shiftFromOriginal = Math.abs(dep - item.desiredDep);

      for (let gi = 0; gi < gates.length; gi++) {
        const gateId = gates[gi];
        if (!slotFree(gateId, start, dep)) continue;

        // Preserve the realistic demand curve first, original timing second, and gate familiarity third.
        const score =
          shiftFromTarget * 900 +
          shiftFromOriginal * 6 +
          localDeparturePenalty(dep) +
          hourlyPenalty(dep) +
          (gateId === item.originalGate ? 0 : 8) +
          gi * 0.01;

        if (!best || score < best.score) {
          best = { gateId, start, dep, score, shiftFromTarget, shiftFromOriginal };
        }
      }

      if (best && best.shiftFromTarget === 0) break;
      if (best && shiftFromTarget > 45 && best.shiftFromTarget <= 5) break;
      if (best && shiftFromTarget > 120 && best.shiftFromTarget <= 20) break;
    }

    if (!best) {
      throw new Error(`Could not fit ${f.flightNumber || f.id} within ${effectiveAirline(f)} gates during the operational day.`);
    }

    const oldGate = f.gate;
    const oldDep = toTimelineMinutes(f.departure);
    if (oldGate !== best.gateId) movedGate++;
    if (oldDep === null || oldDep !== best.dep) movedTime++;
    maxTimeShift = Math.max(maxTimeShift, best.shiftFromOriginal);

    f.gate = best.gateId;
    f.gateStart = minutesToClockString(best.start);
    f.departure = minutesToClockString(best.dep);
    f.boarding = minutesToClockString(Math.max(best.start, best.dep - boardLead));
    f.status = 'ON TIME';
    f.delayTag = '';
    f.comments = '';

    const ops = ensureOps(f);
    ops.departed = false;
    ops.taxiRequested = false;
    ops.taxiApproved = false;
    ops.pushbackRequested = false;
    ops.pushbackApproved = false;

    addSlot(best.gateId, best.start, best.dep);
    departuresByMinute.set(best.dep, (departuresByMinute.get(best.dep) || 0) + 1);
    const h = hourIndexForMinute(best.dep);
    departuresByHour.set(h, (departuresByHour.get(h) || 0) + 1);
    queueFlightSync(f);
    placed++;
  }

  renderBoard();
  persistOperationalState();

  const remaining = getAllDayGateConflictPairsNoDepartedFilter().length;
  const hourlyCounts = Array.from({length:24}, (_,h) => departuresByHour.get(h) || 0);
  const maxSameMinute = departuresByMinute.size ? Math.max(...departuresByMinute.values()) : 0;

  return { placed, movedGate, movedTime, remaining, maxTimeShift, hourlyCounts, maxSameMinute };
}


function getWrongAirlineGateAssignments() {
  return FLIGHTS.filter(f => {
    if (!f || f.status === 'CANCELLED' || f.status === 'DIVERTED') return false;
    const id = String(f.sheetId || f.id || '');
    if (id.startsWith('sim_') || f?.ops?.inboundDiversion) return false;
    return !gateCompatibleForFlight(f, f.gate);
  });
}

async function promoteCurrentLayoutToProtectedStandard() {
  if (!SHEET_URL) throw new Error('Sheet connection is not configured.');

  setSyncStatus('online', '● Building realistic conflict-free schedule…');
  const result = forceFitEverythingNoDelays();

  const wrongAirline = getWrongAirlineGateAssignments();
  if (wrongAirline.length) {
    throw new Error(
      `Solver left ${wrongAirline.length} flight${wrongAirline.length === 1 ? '' : 's'} at another airline's gate. The standard was NOT saved.`
    );
  }

  if (result.remaining) {
    throw new Error(`Force-fit finished with ${result.remaining} overlap(s), so the standard was not saved.`);
  }

  // IMPORTANT: write the entire resulting Sheet-backed schedule, not merely
  // whichever flights remain in the debounce queue.
  const syncResult = await syncAllSheetBackedFlightsNow();

  if (!syncResult || syncResult.verified !== syncResult.requested) {
    throw new Error('The Google Sheet was not fully verified, so the protected standard was NOT replaced.');
  }

  setSyncStatus('online', '● Saving verified Sheet layout as protected standard…');
  const params = new URLSearchParams({
    action: 'promoteStandard',
    _: String(Date.now())
  });
  const data = await fetchSheetJson(SHEET_URL + '?' + params.toString());

  if (data?.error || !data?.ok) {
    throw new Error(data?.error || 'Could not save new protected standard.');
  }

  setSyncStatus(
    'online',
    `● Sheet synced + standard saved (${syncResult.verified} flights)`
  );

  logActivity(
    `Built realistic conflict-free standard for ${result.placed} flights; ${result.movedGate} gate changes, ${result.movedTime} time changes, max time shift ${result.maxTimeShift || 0} min, busiest exact minute ${result.maxSameMinute || 0} departures. Google Sheet verified ${syncResult.verified}/${syncResult.requested} before promotion. No automatic delays.`,
    'RESET'
  );

  return { ...result, synced: syncResult.verified };
}

function normalizeResetScheduleToZeroConflicts() {
  const initialPairs = getAllDayConflictPairs();
  if (!initialPairs.length) return { moved: 0, remaining: 0, affected: 0 };

  const affectedIds = new Set();
  initialPairs.forEach(([a, b]) => { affectedIds.add(a.id); affectedIds.add(b.id); });

  const original = new Map();
  for (const f of FLIGHTS) {
    const w = occupancyWindow(f);
    if (!w) continue;
    original.set(f.id, {
      gate: f.gate,
      start: w.start,
      end: w.end,
      duration: Math.max(INTERVAL_MIN, w.end - w.start),
      departure: f.departure,
      boarding: f.boarding,
      gateStart: f.gateStart,
      status: f.status,
      delayTag: f.delayTag,
      comments: f.comments,
    });
  }

  const gateBookings = new Map(GATE_LIST.map(g => [g.id, []]));
  const addBooking = (gate, start, end, flightId) => {
    if (!gateBookings.has(gate)) gateBookings.set(gate, []);
    gateBookings.get(gate).push({ start, end, flightId });
  };

  // Every flight that was clean in the baseline is a fixed reservation.
  // Reset normalization is not allowed to disturb it.
  FLIGHTS.forEach(f => {
    if (affectedIds.has(f.id) || f.status === 'CANCELLED' || f.status === 'DIVERTED') return;
    const w = occupancyWindow(f);
    if (w) addBooking(f.gate, w.start, w.end, f.id);
  });

  const conflictsById = new Map();
  initialPairs.forEach(([a,b]) => {
    conflictsById.set(a.id, (conflictsById.get(a.id) || 0) + 1);
    conflictsById.set(b.id, (conflictsById.get(b.id) || 0) + 1);
  });

  const affectedFlights = FLIGHTS
    .filter(f => affectedIds.has(f.id) && original.has(f.id))
    .sort((a, b) => {
      const ao = original.get(a.id), bo = original.get(b.id);
      return ao.start - bo.start || (conflictsById.get(b.id) || 0) - (conflictsById.get(a.id) || 0);
    });

  function slotFits(gateId, start, end) {
    return !(gateBookings.get(gateId) || []).some(b => start < b.end && end > b.start);
  }

  function gatePreference(gate, originalGate, wrongAirline) {
    const current = GATE_BY_ID[originalGate];
    const sameGate = gate.id === originalGate ? 0 : 20;
    const sameConcourse = current && gate.concourse !== current.concourse ? 140 : 0;
    const distance = current && gate.concourse === current.concourse ? Math.abs(gate.num - current.num) * 3 : 0;
    return sameGate + sameConcourse + distance + (wrongAirline ? 50000 : 0);
  }

  function findPlacement(flight) {
    const o = original.get(flight.id);
    if (!o) return null;
    const own = GATE_LIST.filter(g => airlinesMatch(g.airline, effectiveAirline(flight)));
    const fallback = GATE_LIST.filter(g => !own.some(x => x.id === g.id));
    let best = null;

    const consider = (gates, wrongAirline) => {
      for (const gate of gates) {
        // First try the exact original window. This preserves as many flights as possible.
        if (slotFits(gate.id, o.start, o.end)) {
          const score = gatePreference(gate, o.gate, wrongAirline);
          if (!best || score < best.score) best = { gate: gate.id, start: o.start, end: o.end, score };
        }

        // Otherwise search later through the entire operational day.
        for (let start = o.start + INTERVAL_MIN; start + o.duration <= TIMELINE_END_MIN; start += INTERVAL_MIN) {
          const end = start + o.duration;
          if (!slotFits(gate.id, start, end)) continue;
          const delay = end - o.end;
          const score = delay * 100 + gatePreference(gate, o.gate, wrongAirline);
          if (!best || score < best.score) best = { gate: gate.id, start, end, score };
          break;
        }
      }
    };

    consider(own, false);
    if (!best) consider(fallback, true);
    return best;
  }

  let moved = 0;
  for (const flight of affectedFlights) {
    const o = original.get(flight.id);
    const place = findPlacement(flight);
    if (!o || !place) {
      // Keep its original reservation so a genuine impossible case remains visible.
      if (o) addBooking(o.gate, o.start, o.end, flight.id);
      continue;
    }

    addBooking(place.gate, place.start, place.end, flight.id);
    const gateChanged = place.gate !== o.gate;
    const timeChanged = place.start !== o.start || place.end !== o.end;
    if (!gateChanged && !timeChanged) continue;

    flight.gate = place.gate;
    flight.gateStart = minutesToClockString(place.start);
    flight.departure = minutesToClockString(place.end);

    const oldBoard = toTimelineMinutes(o.boarding);
    if (oldBoard !== null) {
      const boardOffset = oldBoard - o.start;
      flight.boarding = minutesToClockString(place.start + Math.max(0, boardOffset));
    }

    if (timeChanged) {
      flight.status = 'DELAYED';
      flight.delayTag = 'DELAY';
      flight.comments = flight.comments || 'Reset schedule conflict normalization';
    }
    queueFlightSync(flight);
    moved++;
  }

  return { moved, remaining: getAllDayConflictPairs().length, affected: affectedIds.size };
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
        if (String(list[i].id) === String(list[j].id)) continue;
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
  const originalWindow = occupancyWindow(flight);
  if (!originalWindow) return [];

  const currentGate = GATE_BY_ID[flight.gate];
  const duration = Math.max(INTERVAL_MIN, originalWindow.end - originalWindow.start);
  const originalBoard = toTimelineMinutes(flight.boarding);
  const boardOffset = originalBoard === null ? null : originalBoard - originalWindow.start;
  const earliestStart = Math.max(originalWindow.start, Math.ceil(nowTimelineMinutes() / INTERVAL_MIN) * INTERVAL_MIN);
  const latestStart = TIMELINE_END_MIN - duration;

  // Prefer the airline's own gates, but if those cannot produce enough valid
  // choices, allow any physical gate rather than suggesting an impossible slot.
  const compatible = GATE_LIST.filter(g => airlinesMatch(g.airline, effectiveAirline(flight)));
  const fallback = GATE_LIST.filter(g => !compatible.some(c => c.id === g.id));

  function gatePreference(gate) {
    if (!currentGate) return 0;
    const sameGate = gate.id === flight.gate ? -1000 : 0;
    const sameConcourse = gate.concourse === currentGate.concourse ? 0 : 150;
    const distance = gate.concourse === currentGate.concourse ? Math.abs(gate.num - currentGate.num) * 4 : 50;
    return sameGate + sameConcourse + distance;
  }

  compatible.sort((a, b) => gatePreference(a) - gatePreference(b));
  fallback.sort((a, b) => gatePreference(a) - gatePreference(b));

  const out = [];
  const seen = new Set();

  function collectFromGates(gates, wrongAirlinePenalty) {
    for (const gate of gates) {
      // Search the ENTIRE remaining operating day in 15-minute steps. Do not
      // stop at +120m; a conflict-free option 5 hours later is still valid.
      for (let newStart = earliestStart; newStart <= latestStart; newStart += INTERVAL_MIN) {
        const newEnd = newStart + duration;
        if (newEnd <= nowTimelineMinutes() + 5) continue;
        if (testConflict(flight, gate.id, newEnd, newStart)) continue;

        const delay = Math.max(0, newEnd - originalWindow.end);
        const key = `${gate.id}|${newStart}|${newEnd}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const gateChanged = gate.id !== flight.gate;
        const score = delay * 100 + gatePreference(gate) + (gateChanged ? 10 : 0) + wrongAirlinePenalty;
        out.push({
          gate: gate.id,
          gateStart: newStart,
          departure: newEnd,
          boarding: boardOffset === null ? null : newStart + Math.max(0, boardOffset),
          delay,
          offset: delay,
          score,
          wrongAirline: wrongAirlinePenalty > 0
        });

        // Keep multiple genuinely different choices from the same gate, but
        // space them out so the list can include farther fallbacks too.
        newStart += 45;
        if (out.length >= 40) return;
      }
      if (out.length >= 40) return;
    }
  }

  collectFromGates(compatible, 0);
  if (out.length < 8) collectFromGates(fallback, 50000);

  return out
    .sort((a, b) => a.score - b.score)
    .slice(0, 10);
}


function getConflictPairs() {
  const pairs = [];
  const byGate = {};

  FLIGHTS.forEach(f => {
    if (f.status === 'CANCELLED' || f.status === 'DIVERTED' || isDeparted(f)) return;
    if (!occupancyWindow(f)) return;
    (byGate[f.gate] ||= []).push(f);
  });

  Object.values(byGate).forEach(list => {
    list.sort((a, b) => (gateStartMinutes(a) ?? Infinity) - (gateStartMinutes(b) ?? Infinity));
    for (let i = 0; i < list.length; i++) {
      const aw = occupancyWindow(list[i]);
      if (!aw) continue;
      for (let j = i + 1; j < list.length; j++) {
        if (String(list[i].id) === String(list[j].id)) continue;
        const bw = occupancyWindow(list[j]);
        if (!bw) continue;
        if (bw.start >= aw.end) break;
        if (windowsOverlap(aw, bw)) pairs.push([list[i], list[j]]);
      }
    }
  });

  return pairs;
}

function getConflictFlightIds(pairs = getConflictPairs()) {
  const ids = new Set();
  for (const [a, b] of pairs) {
    if (a?.id) ids.add(a.id);
    if (b?.id) ids.add(b.id);
  }
  return ids;
}

function flightHasConflict(flightId) {
  if (!flightId) return false;
  return getConflictFlightIds().has(flightId);
}

function buildConflictComponents(pairs) {
  const graph = new Map();
  for (const [a, b] of pairs) {
    if (!graph.has(a.id)) graph.set(a.id, new Set());
    if (!graph.has(b.id)) graph.set(b.id, new Set());
    graph.get(a.id).add(b.id);
    graph.get(b.id).add(a.id);
  }

  const components = [];
  const seen = new Set();
  for (const id of graph.keys()) {
    if (seen.has(id)) continue;
    const stack = [id];
    const ids = [];
    seen.add(id);
    while (stack.length) {
      const cur = stack.pop();
      ids.push(cur);
      for (const next of graph.get(cur) || []) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    components.push(ids);
  }
  return components;
}

function autoSolveSchedule() {
  const initialPairs = getConflictPairs();
  if (!initialPairs.length) return { moved: 0, remaining: 0, affected: 0 };

  // Critical rule: ONLY flights that are actually involved in a conflict may
  // be rescheduled. Every unrelated flight becomes a fixed reservation. This
  // prevents a 2 PM problem from cascading into clean midnight/3 AM flights.
  const affectedIds = new Set();
  initialPairs.forEach(([a, b]) => { affectedIds.add(a.id); affectedIds.add(b.id); });

  const original = new Map();
  for (const f of FLIGHTS) {
    const w = occupancyWindow(f);
    if (!w) continue;
    original.set(f.id, {
      gate: f.gate,
      start: w.start,
      end: w.end,
      duration: Math.max(INTERVAL_MIN, w.end - w.start),
      departure: f.departure,
      boarding: f.boarding,
      gateStart: f.gateStart,
    });
  }

  const gateBookings = new Map(GATE_LIST.map(g => [g.id, []]));

  function addBooking(gate, start, end, flightId) {
    if (!gateBookings.has(gate)) gateBookings.set(gate, []);
    gateBookings.get(gate).push({ start, end, flightId });
  }

  // All unrelated active flights are immovable obstacles. Departed/cancelled/
  // diverted flights are not part of current gate occupancy.
  FLIGHTS.forEach(f => {
    if (affectedIds.has(f.id)) return;
    if (f.status === 'CANCELLED' || f.status === 'DIVERTED' || isDeparted(f)) return;
    const w = occupancyWindow(f);
    if (w) addBooking(f.gate, w.start, w.end, f.id);
  });

  const components = buildConflictComponents(initialPairs);
  const placements = new Map();
  const searchEnd = TIMELINE_END_MIN;

  function earliestSlot(bookings, desiredStart, duration) {
    let candidate = Math.max(desiredStart, nowTimelineMinutes());
    candidate = Math.ceil(candidate / INTERVAL_MIN) * INTERVAL_MIN;
    const sorted = [...bookings].sort((a, b) => a.start - b.start);

    for (const b of sorted) {
      if (candidate + duration <= b.start) break;
      if (candidate < b.end && candidate + duration > b.start) {
        candidate = Math.ceil(b.end / INTERVAL_MIN) * INTERVAL_MIN;
      }
    }
    return candidate;
  }

  function gateScore(gate, currentGate, delay, wrongAirline) {
    const sameGatePenalty = gate.id === currentGate?.id ? 0 : 15;
    const concoursePenalty = currentGate && gate.concourse !== currentGate.concourse ? 120 : 0;
    const distance = currentGate && gate.concourse === currentGate.concourse ? Math.abs(gate.num - currentGate.num) * 3 : 0;
    const airlinePenalty = wrongAirline ? 50000 : 0;
    return delay * 100 + sameGatePenalty + concoursePenalty + distance + airlinePenalty;
  }

  function findBestPlacement(flight) {
    const o = original.get(flight.id);
    if (!o) return null;
    const currentGate = GATE_BY_ID[o.gate];
    const ownGates = GATE_LIST.filter(g => airlinesMatch(g.airline, effectiveAirline(flight)));
    const otherGates = GATE_LIST.filter(g => !ownGates.some(own => own.id === g.id));
    let best = null;

    const consider = (gates, wrongAirline) => {
      for (const gate of gates) {
        const start = earliestSlot(gateBookings.get(gate.id) || [], o.start, o.duration);
        const end = start + o.duration;
        if (end > searchEnd) continue;
        const delay = Math.max(0, end - o.end);
        const score = gateScore(gate, currentGate, delay, wrongAirline);
        if (!best || score < best.score) best = { gate: gate.id, start, end, delay, score };
      }
    };

    consider(ownGates, false);
    if (!best) consider(otherGates, true);
    return best;
  }

  for (const componentIds of components) {
    const componentFlights = componentIds
      .map(id => FLIGHTS.find(f => f.id === id))
      .filter(Boolean)
      .sort((a, b) => (original.get(a.id)?.start ?? Infinity) - (original.get(b.id)?.start ?? Infinity));

    if (!componentFlights.length) continue;

    // Preserve one flight in each conflict chain whenever possible. Keeping an
    // anchor means a two-flight conflict normally delays ONE aircraft, not both.
    // Prefer the earliest-starting flight as the stable anchor.
    const anchor = componentFlights[0];
    const anchorOrig = original.get(anchor.id);
    if (anchorOrig) {
      placements.set(anchor.id, { gate: anchorOrig.gate, start: anchorOrig.start, end: anchorOrig.end, delay: 0, anchor: true });
      addBooking(anchorOrig.gate, anchorOrig.start, anchorOrig.end, anchor.id);
    }

    // Only the remaining members of this actual conflict chain are candidates
    // for movement. Clean flights elsewhere in the day never enter this loop.
    for (const flight of componentFlights.slice(1)) {
      const best = findBestPlacement(flight);
      if (!best) {
        // If the chosen anchor made this chain impossible, allow this flight to
        // remain unresolved rather than cascading changes into unrelated flights.
        const o = original.get(flight.id);
        if (o) addBooking(o.gate, o.start, o.end, flight.id);
        continue;
      }
      placements.set(flight.id, best);
      addBooking(best.gate, best.start, best.end, flight.id);
    }
  }

  let moved = 0;
  for (const flight of FLIGHTS) {
    if (!affectedIds.has(flight.id)) continue;
    const place = placements.get(flight.id);
    const o = original.get(flight.id);
    if (!place || !o || place.anchor) continue;

    const gateChanged = place.gate !== o.gate;
    const timeChanged = place.start !== o.start || place.end !== o.end;
    if (!gateChanged && !timeChanged) continue;

    flight.gate = place.gate;
    flight.gateStart = minutesToClockString(place.start);
    flight.departure = minutesToClockString(place.end);

    const oldBoard = toTimelineMinutes(o.boarding);
    if (oldBoard !== null) {
      const boardOffset = oldBoard - o.start;
      flight.boarding = minutesToClockString(place.start + Math.max(0, boardOffset));
    }

    if (timeChanged) {
      flight.status = 'DELAYED';
      flight.delayTag = 'DELAY';
      const delayMinutes = Math.max(0, place.end - o.end);
      flight.comments = flight.comments || 'Automatic gate conflict resolution';
      logActivity(
        `AUTO SOLVE: ${flight.flightNumber} ${o.gate} → ${place.gate}, ${displayClockTime(o.departure)} → ${displayClockTime(flight.departure)}${delayMinutes ? ` (+${delayMinutes}m)` : ''}`,
        'AUTOSOLVE',
        flight.id
      );
    } else if (gateChanged) {
      logActivity(`AUTO SOLVE: ${flight.flightNumber} gate ${o.gate} → ${place.gate}`, 'AUTOSOLVE', flight.id);
    }

    queueFlightSync(flight);
    moved++;
  }

  return { moved, remaining: computeConflicts().size, affected: affectedIds.size };
}

function autoSolveAllConflicts() {
  const button = document.getElementById('autoSolveBtn');
  if (button) { button.disabled = true; button.textContent = 'Solving…'; }

  const before = computeConflicts().size;
  const result = autoSolveSchedule();
  const remaining = computeConflicts().size;

  if (remaining === 0) {
    logActivity(`AUTO SOLVE complete: ${result.moved} flight${result.moved === 1 ? '' : 's'} repositioned; ${before} conflict${before === 1 ? '' : 's'} cleared.`, 'AUTOSOLVE');
  } else {
    logActivity(`AUTO SOLVE moved ${result.moved} flight${result.moved === 1 ? '' : 's'}; ${remaining} conflict${remaining === 1 ? '' : 's'} remain because the visible 5 AM–5 AM operating window has no additional physical gate space.`, 'CONFLICT');
  }

  renderBoard();
  persistOperationalState();
  if (button) { button.disabled = remaining === 0; button.textContent = 'Auto Solve'; }
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
  const airportClosed = isGroundStopActive();
  const atcHeld = isFlightAtcHeld(flight);
  if (ops.taxiRequested && !ops.taxiApproved) requests.push(`<button class="fc-event-accept" data-approve="taxi" ${airportClosed ? 'disabled title="Airport closure active"' : ''}>${airportClosed ? 'Airport Closed' : 'Approve Taxi'}</button>`);
  if (ops.pushbackRequested && !ops.pushbackApproved) requests.push(`<button class="fc-event-accept" data-approve="pushback" ${(airportClosed || atcHeld) ? `disabled title="${airportClosed ? 'Airport closure active' : 'ATC destination ground stop active'}"` : ''}>${airportClosed ? 'Airport Closed' : atcHeld ? 'ATC Hold' : 'Approve Pushback'}</button>`);

  card.innerHTML = `
    <div class="fc-top"><span class="fc-flightnum">${escapeHtml(flight.flightNumber)}</span><span class="fc-to">→ ${escapeHtml(flight.to)}</span></div>
    <div class="fc-times"><span>Board ${escapeHtml(displayClockTime(flight.boarding))}</span><span>Dep ${escapeHtml(displayClockTime(flight.departure))}</span></div>
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
  normalizeFlightCollection();
  const board = document.getElementById('board');
  board.innerHTML = '';
  const conflictPairs = getConflictPairs();
  const conflictIds = getConflictFlightIds(conflictPairs);
  const conflicts = computeConflicts();
  updateConflictBanner(conflicts, conflictPairs.length, conflictIds.size);
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

      const flightsHere = FLIGHTS.filter(f => f.gate === gate.id && flightMatchesFilters(f));
      const rowNeedsExtraHeight = flightsHere.some(f => {
        const o = ensureOps(f);
        return (o.taxiRequested && !o.taxiApproved) || (o.pushbackRequested && !o.pushbackApproved) || conflictIds.has(f.id);
      });
      if (rowNeedsExtraHeight) row.classList.add('timeline-row-expanded');

      flightsHere.forEach(f => {
        const win = occupancyWindow(f); const card = renderFlightCard(f, conflictIds.has(f.id));
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
        markDelayedForTimeChange(flight, 'gate block time changed');
        logActivity(`Gate block resized: ${flight.flightNumber} start → ${flight.gateStart}`, 'EDIT', flight.id);
      } else {
        const dep = toTimelineMinutes(flight.departure); if (dep !== null) flight.departure = minutesToClockString(dep + delta);
        markDelayedForTimeChange(flight, 'departure time changed');
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

function updateConflictBanner(conflicts, pairCount = null, conflictedFlightCount = null) {
  const banner = document.getElementById('conflictBanner');
  const autoBtn = document.getElementById('autoSolveBtn');
  if (autoBtn) autoBtn.disabled = conflicts.size === 0;
  if (!conflicts.size) { banner.classList.add('hidden'); return; }
  banner.classList.remove('hidden');
  const pairs = pairCount ?? getConflictPairs().length;
  const flights = conflictedFlightCount ?? getConflictFlightIds().size;
  banner.textContent = `⚠ ${pairs} gate overlap${pairs === 1 ? '' : 's'} involving ${flights} flight${flights === 1 ? '' : 's'} — use Auto Solve or click any marked flight for conflict-free solutions.`;
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
  delete document.getElementById('f_id').dataset.suggestedGateStart;
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
  if (isEdit && flightHasConflict(flight.id)) renderResolutionSuggestions(flight, box);
  document.getElementById('flightModal').classList.remove('hidden');
}

function renderResolutionSuggestions(flight, box) {
  const suggestions = suggestResolutionsFor(flight);
  box.classList.remove('hidden');
  if (!suggestions.length) {
    box.innerHTML = '<strong>No conflict-free opening exists before 5:00 AM.</strong> Auto Solve may need to move other flights first.';
    return;
  }
  box.innerHTML = `<strong>Conflict-free reschedule options:</strong><div class="resolution-list">${suggestions.map((s, i) => {
    const hours = Math.floor(s.delay / 60);
    const mins = s.delay % 60;
    const delayText = s.delay === 0 ? 'no delay' : `+${hours ? `${hours}h ` : ''}${mins ? `${mins}m` : ''}`.trim();
    const ownership = s.wrongAirline ? ' · other-airline gate' : '';
    const timeText = `${delayText} · ${minutesToClockString(s.gateStart)}–${minutesToClockString(s.departure)}${ownership}`;
    return `<button type="button" class="resolution-option" data-i="${i}"><span>${escapeHtml(s.gate)}</span><small>${escapeHtml(timeText)}</small></button>`;
  }).join('')}</div>`;

  box.querySelectorAll('.resolution-option').forEach(btn => btn.addEventListener('click', () => {
    const s = suggestions[Number(btn.dataset.i)];
    document.getElementById('f_gate').value = s.gate;
    document.getElementById('f_departure').value = minutesToClockString(s.departure);
    if (s.boarding !== null) document.getElementById('f_boarding').value = minutesToClockString(s.boarding);
    document.getElementById('f_id').dataset.suggestedGateStart = minutesToClockString(s.gateStart);
  }));
}

function closeFlightModal() { document.getElementById('flightModal').classList.add('hidden'); }

document.getElementById('flightForm').addEventListener('submit', e => {
  e.preventDefault();
  const id = document.getElementById('f_id').value || `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const existing = FLIGHTS.find(f => f.id === id);
  const data = {
    id,
    airline: canonicalAirlineName(document.getElementById('f_airline').value) || inferAirlineFromFlightNumber(document.getElementById('f_flightnum').value),
    flightNumber: document.getElementById('f_flightnum').value.trim(),
    to: document.getElementById('f_to').value.trim().toUpperCase(),
    gate: document.getElementById('f_gate').value.trim().toUpperCase(),
    boarding: document.getElementById('f_boarding').value.trim(),
    departure: document.getElementById('f_departure').value.trim(),
    status: document.getElementById('f_status').value,
    comments: document.getElementById('f_comments').value.trim(),
    delayTag: document.getElementById('f_delaytag').value,
    gateStart: existing ? (document.getElementById('f_id').dataset.suggestedGateStart || existing.gateStart) : '',
    base: existing ? existing.base : null,
    ops: existing ? existing.ops : null,
  };
  if (existing && (timeValueChanged(existing.departure, data.departure) || timeValueChanged(existing.boarding, data.boarding))) {
    markDelayedForTimeChange(data, 'scheduled time changed');
  }

  const gateInfo = GATE_BY_ID[data.gate];
  if (gateInfo && !airlinesMatch(gateInfo.airline, effectiveAirline(data)) && !confirm(`Gate ${data.gate} belongs to ${gateInfo.airline}. Save anyway?`)) return;
  const idx = FLIGHTS.findIndex(f => String(f.id) === String(id));
  let savedFlight;
  if (idx >= 0) {
    Object.assign(FLIGHTS[idx], data);
    savedFlight = FLIGHTS[idx];
  } else {
    FLIGHTS.push(data);
    savedFlight = data;
  }
  normalizeFlightCollection();
  logActivity(`${idx >= 0 ? 'Edited' : 'Added'} ${savedFlight.flightNumber}`, 'EDIT', id);
  queueFlightSync(savedFlight); renderBoard(); closeFlightModal();
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
  const conflictsBefore = computeConflicts();
  const oldDep = dep;

  // Normal delays keep the original gate-occupancy start and extend the
  // right edge of the block. Only true late-arriving-aircraft events may
  // move the start later.
  if (!flight.gateStart) {
    const start = gateStartMinutes(flight);
    if (start !== null) flight.gateStart = minutesToClockString(start);
  }

  flight.departure = minutesToClockString(dep + minutes);
  flight.status = 'DELAYED';
  flight.delayTag = tag || 'DELAY';

  if (moveStart) {
    const start = gateStartMinutes(flight); if (start !== null) flight.gateStart = minutesToClockString(start + minutes);
    const board = toTimelineMinutes(flight.boarding); if (board !== null) flight.boarding = minutesToClockString(board + minutes);
  }

  logActivity(`${flight.flightNumber} delayed +${minutes}m (${reason || tag || 'delay'})`, 'DELAY', flight.id);

  const conflictsAfter = computeConflicts();
  if (!conflictsBefore.has(flight.id) && conflictsAfter.has(flight.id)) {
    const other = FLIGHTS.find(f => f.id === conflictsAfter.get(flight.id));
    logActivity(`CONFLICT: ${flight.flightNumber}'s extended gate block now overlaps ${other ? other.flightNumber : 'another aircraft'} at ${flight.gate}`, 'CONFLICT', flight.id);
  } else {
    // The delayed flight can also be the earlier aircraft causing the later
    // flight to become conflicted, so surface those newly-created conflicts too.
    for (const [conflictedId, blockerId] of conflictsAfter.entries()) {
      if (blockerId !== flight.id || conflictsBefore.has(conflictedId)) continue;
      const later = FLIGHTS.find(f => f.id === conflictedId);
      if (later) logActivity(`CONFLICT: ${flight.flightNumber}'s extended gate block now overlaps ${later.flightNumber} at ${flight.gate}`, 'CONFLICT', later.id);
    }
  }

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


function isGroundStopActive() {
  return !!(GROUND_STOP && nowTimelineMinutes() >= GROUND_STOP.start && nowTimelineMinutes() < GROUND_STOP.end);
}

function shiftFlightWholeBlockTo(flight, newStart, reason = 'ground stop') {
  const oldStart = gateStartMinutes(flight);
  const oldBoard = toTimelineMinutes(flight.boarding);
  const oldDep = toTimelineMinutes(flight.departure);
  if (oldStart === null || oldDep === null) return false;
  const shift = Math.max(0, newStart - oldStart);
  if (!shift) return false;
  flight.gateStart = minutesToClockString(oldStart + shift);
  if (oldBoard !== null) flight.boarding = minutesToClockString(oldBoard + shift);
  flight.departure = minutesToClockString(oldDep + shift);
  flight.status = 'DELAYED';
  flight.delayTag = 'AIRPORT CLOSURE';
  flight.comments = [flight.comments, `Held by airport closure until ${minutesToClockString(GROUND_STOP.end)}`].filter(Boolean).join(' · ');
  logActivity(`${flight.flightNumber} held +${shift}m (${reason})`, 'DELAY', flight.id);
  queueFlightSync(flight);
  return true;
}

function processGroundStopLifecycle() {
  if (!GROUND_STOP) return;
  const nowM = nowTimelineMinutes();
  if (nowM < GROUND_STOP.end) return;
  if (GROUND_STOP.lifted) return;
  GROUND_STOP.lifted = true;
  const graceMs = (CONFIG.APPROVAL_GRACE_MINUTES || 5) * 60000;
  const nowMs = Date.now();
  FLIGHTS.forEach(f => {
    const o = ensureOps(f);
    if (o.taxiRequested && !o.taxiApproved) o.taxiPenaltyAt = nowMs + graceMs;
    if (o.pushbackRequested && !o.pushbackApproved) o.pushbackPenaltyAt = nowMs + graceMs;
  });
  logActivity(`Airport closure lifted at ${minutesToClockString(GROUND_STOP.end)}. Local movement and approvals may resume.`, 'GROUNDSTOP');
  renderBoard();
  persistOperationalState();
}

function processRequiredApprovals() {
  if (isGroundStopActive()) return;
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
      if (applyDelay(f, CONFIG.APPROVAL_DELAY_STEP_MINUTES || 5, 'DELAY', 'taxi approval not granted — gate remains reserved', false)) changed = true;
      ops.taxiPenaltyAt = nowMs + (CONFIG.APPROVAL_GRACE_MINUTES || 5) * 60000;
    }

    const dep2 = toTimelineMinutes(f.departure);
    if (!ops.pushbackRequested && dep2 !== null && nowM >= dep2 - (CONFIG.PUSHBACK_REQUEST_LEAD_MINUTES || 10) && nowM <= dep2 + 30) {
      ops.pushbackRequested = true; ops.pushbackRequestAt = nowMs; ops.pushbackPenaltyAt = nowMs + (CONFIG.APPROVAL_GRACE_MINUTES || 5) * 60000;
      logActivity(`Pushback request: ${f.flightNumber} at ${f.gate}`, 'REQUEST', f.id, 'pushback'); changed = true;
    }

    if (ops.pushbackRequested && !ops.pushbackApproved && isFlightAtcHeld(f)) {
      ops.pushbackPenaltyAt = Number.POSITIVE_INFINITY;
    } else if (ops.pushbackRequested && !ops.pushbackApproved && nowMs >= ops.pushbackPenaltyAt) {
      if (applyDelay(f, CONFIG.APPROVAL_DELAY_STEP_MINUTES || 5, 'DELAY', 'pushback approval not granted', false)) changed = true;
      ops.pushbackPenaltyAt = nowMs + (CONFIG.APPROVAL_GRACE_MINUTES || 5) * 60000;
    }
  });
  if (changed) renderBoard();
}

function approveOperation(flightId, type) {
  const f = FLIGHTS.find(x => x.id === flightId); if (!f) return;
  if (isGroundStopActive()) {
    logActivity(`Approval blocked during airport closure: ${f.flightNumber} ${type}`, 'GROUNDSTOP', f.id);
    renderBoard();
    return;
  }
  if (type === 'pushback' && isFlightAtcHeld(f)) {
    logActivity(`Pushback blocked by ATC destination ground stop: ${f.flightNumber} → ${f.to}`, 'ATC', f.id);
    renderBoard();
    return;
  }
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

function airportClosureCancellationChance(durationMinutes) {
  const d = Math.max(0, Number(durationMinutes) || 0);
  if (d < 30) return 0;
  if (d < 45) return 0.02;
  if (d < 60) return 0.04;
  if (d < 90) return 0.08;
  if (d < 120) return 0.14;
  if (d < 180) return 0.24;
  if (d < 240) return 0.36;
  return 0.48;
}

function issueAirportClosure(durationMinutes, source = 'manual') {
  const start = nowTimelineMinutes();
  const end = start + durationMinutes;
  GROUND_STOP = { id: `closure_${Date.now()}`, start, end, durationMinutes, applied: new Set(), lifted: false, source };
  GROUND_STOP_LAST_ISSUED_AT = Date.now();

  const impacted = FLIGHTS.filter(f => {
    if (f.status === 'CANCELLED' || f.status === 'DIVERTED' || isDeparted(f)) return false;
    const gateStart = gateStartMinutes(f);
    const dep = toTimelineMinutes(f.departure);
    if (gateStart === null || dep === null) return false;
    return (gateStart >= start && gateStart < end) || (dep >= start && dep < end);
  });

  const cancelChance = airportClosureCancellationChance(durationMinutes);
  let cancelled = 0;
  let count = 0;

  impacted.forEach(f => {
    // Airlines increasingly cancel rather than recover every flight as a closure gets longer.
    if (cancelChance > 0 && Math.random() < cancelChance) {
      f.status = 'CANCELLED';
      f.delayTag = 'AIRPORT CLOSURE';
      f.comments = [f.comments, `Cancelled during ${durationMinutes}m airport closure`].filter(Boolean).join(' · ');
      logActivity(`${f.flightNumber} cancelled during airport closure (${durationMinutes}m shutdown)`, 'CANCEL', f.id);
      queueFlightSync(f);
      cancelled++;
      return;
    }

    const gateStart = gateStartMinutes(f);
    const dep = toTimelineMinutes(f.departure);
    let changed = false;

    if (gateStart >= start && gateStart < end) {
      changed = shiftFlightWholeBlockTo(f, end, `airport closure ${minutesToClockString(start)}–${minutesToClockString(end)}`);
    } else if (dep >= start && dep < end) {
      const delay = Math.max(5, Math.ceil((end - dep) / 5) * 5);
      changed = applyDelay(f, delay, 'AIRPORT CLOSURE', `airport closed until ${minutesToClockString(end)}`, false);
    }

    if (changed) {
      GROUND_STOP.applied.add(f.id);
      count++;
    }
  });

  // For a long closure with a meaningful number of affected flights, guarantee at least
  // one cancellation if random chance happened to produce none. This keeps multi-hour
  // closures from unrealistically recovering every single flight.
  if (durationMinutes >= 90 && impacted.length >= 6 && cancelled === 0) {
    const candidate = impacted.find(f => f.status !== 'CANCELLED' && f.status !== 'DIVERTED' && !isDeparted(f));
    if (candidate) {
      candidate.status = 'CANCELLED';
      candidate.delayTag = 'AIRPORT CLOSURE';
      candidate.comments = [candidate.comments, `Cancelled during extended airport closure`].filter(Boolean).join(' · ');
      logActivity(`${candidate.flightNumber} cancelled during extended airport closure`, 'CANCEL', candidate.id);
      queueFlightSync(candidate);
      cancelled++;
    }
  }

  FLIGHTS.forEach(f => {
    const o = ensureOps(f);
    if (o.taxiRequested && !o.taxiApproved) o.taxiPenaltyAt = Number.POSITIVE_INFINITY;
    if (o.pushbackRequested && !o.pushbackApproved) o.pushbackPenaltyAt = Number.POSITIVE_INFINITY;
  });

  logActivity(`AIRPORT CLOSURE ${minutesToClockString(start)}–${minutesToClockString(end)}: all local movement frozen; ${count} flight${count === 1 ? '' : 's'} held/delayed${cancelled ? `; ${cancelled} cancelled` : ''}`, 'GROUNDSTOP');
  updateGroundStopStatus();
  renderBoard();
  persistOperationalState();
}

function updateGroundStopStatus() {
  const el = document.getElementById('groundStopStatus'); if (!el) return;
  if (!GROUND_STOP) { el.textContent = 'No active airport closure'; return; }
  if (nowTimelineMinutes() >= GROUND_STOP.end) { el.textContent = `Lifted at ${minutesToClockString(GROUND_STOP.end)}`; return; }
  el.textContent = `AIRPORT CLOSED — no local movement or approvals until ${minutesToClockString(GROUND_STOP.end)}`;
}


function normalizeDestination(value) {
  return String(value || '').trim().toUpperCase();
}

function activeAtcGroundStops() {
  const nowM = nowTimelineMinutes();
  return ATC_GROUND_STOPS.filter(gs => !gs.lifted && nowM >= gs.start && nowM < gs.end);
}

function isFlightAtcHeld(flight) {
  if (!flight || flight.status === 'CANCELLED' || flight.status === 'DIVERTED') return false;
  const dest = normalizeDestination(flight.to);
  if (!dest) return false;
  return activeAtcGroundStops().some(gs => (gs.cities || []).map(normalizeDestination).includes(dest));
}

function populateAtcCityOptions() {
  const select = document.getElementById('atcCities');
  if (!select) return;
  const previous = new Set([...select.selectedOptions].map(o => o.value));
  const cities = [...new Set(FLIGHTS.map(f => String(f.to || '').trim()).filter(Boolean))]
    .sort((a,b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  select.innerHTML = '';
  cities.forEach(city => {
    const opt = document.createElement('option');
    opt.value = city;
    opt.textContent = city;
    opt.selected = previous.has(city);
    select.appendChild(opt);
  });
}

function issueAtcGroundStop(cities, durationMinutes, source = 'manual') {
  const cleanCities = [...new Set((cities || []).map(c => String(c || '').trim()).filter(Boolean))];
  if (!cleanCities.length) return false;
  const start = nowTimelineMinutes();
  const end = start + durationMinutes;
  const stop = {
    id: `atc_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    cities: cleanCities,
    start,
    end,
    durationMinutes,
    source,
    lifted: false,
    affected: [],
  };
  ATC_GROUND_STOPS.push(stop);

  let held = 0;
  FLIGHTS.forEach(f => {
    if (f.status === 'CANCELLED' || f.status === 'DIVERTED' || isDeparted(f)) return;
    if (!cleanCities.some(city => normalizeDestination(city) === normalizeDestination(f.to))) return;
    const dep = toTimelineMinutes(f.departure);
    if (dep === null || dep < start || dep >= end) return;

    const delay = Math.max(5, Math.ceil((end - dep) / 5) * 5);
    if (applyDelay(f, delay, 'ATC GROUND STOP', `ATC departure hold to ${f.to} until ${minutesToClockString(end)}`, false)) {
      stop.affected.push(f.id);
      held++;
    }

    const o = ensureOps(f);
    if (o.pushbackRequested && !o.pushbackApproved) o.pushbackPenaltyAt = Number.POSITIVE_INFINITY;
  });

  logActivity(`ATC GROUND STOP to ${cleanCities.join(', ')} ${minutesToClockString(start)}–${minutesToClockString(end)}: ${held} departure${held === 1 ? '' : 's'} held; other destinations unaffected`, 'ATC');
  updateAtcGroundStopStatus();
  renderBoard();
  persistOperationalState();
  return true;
}

function processAtcGroundStopLifecycle() {
  const nowM = nowTimelineMinutes();
  let changed = false;
  const graceMs = (CONFIG.APPROVAL_GRACE_MINUTES || 5) * 60000;
  const nowMs = Date.now();

  ATC_GROUND_STOPS.forEach(gs => {
    if (gs.lifted || nowM < gs.end) return;
    gs.lifted = true;
    changed = true;
    const citySet = new Set((gs.cities || []).map(normalizeDestination));
    FLIGHTS.forEach(f => {
      if (!citySet.has(normalizeDestination(f.to))) return;
      const o = ensureOps(f);
      if (o.pushbackRequested && !o.pushbackApproved) o.pushbackPenaltyAt = nowMs + graceMs;
    });
    logActivity(`ATC ground stop lifted for ${gs.cities.join(', ')} at ${minutesToClockString(gs.end)}. Held departures may push once approved.`, 'ATC');
  });

  // Keep the current operational day's stops for history/status, but trim stale ones eventually.
  if (ATC_GROUND_STOPS.length > 30) ATC_GROUND_STOPS = ATC_GROUND_STOPS.slice(-30);
  if (changed) {
    updateAtcGroundStopStatus();
    renderBoard();
    persistOperationalState();
  }
}

function updateAtcGroundStopStatus() {
  const el = document.getElementById('atcGroundStopStatus');
  if (!el) return;
  const active = activeAtcGroundStops();
  if (!active.length) {
    el.textContent = 'No active destination ATC ground stops';
    return;
  }
  el.innerHTML = active.map(gs => `${escapeHtml(gs.cities.join(', '))} held until ${escapeHtml(minutesToClockString(gs.end))}`).join('<br>');
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

function randomAtcGroundStop() {
  const now = nowTimelineMinutes();
  const candidates = FLIGHTS.filter(f => {
    const dep = toTimelineMinutes(f.departure);
    return dep !== null && dep > now && dep <= now + 180 && !isDeparted(f) &&
      f.status !== 'CANCELLED' && f.status !== 'DIVERTED' && normalizeDestination(f.to);
  });
  const cities = [...new Set(candidates.map(f => String(f.to || '').trim()).filter(Boolean))];
  if (!cities.length) return false;

  // Usually one destination, occasionally two related restrictions at once.
  cities.sort(() => Math.random() - 0.5);
  const count = cities.length > 1 && Math.random() < 0.18 ? 2 : 1;
  const selected = cities.slice(0, count);
  const duration = [20, 30, 45, 60, 75, 90][Math.floor(Math.random() * 6)];
  return issueAtcGroundStop(selected, duration, 'rare random ATC event');
}

function spawnRandomEvent() {
  if (isGroundStopActive()) { scheduleNextRandomEvent(); return; }
  const r = Math.random();
  let happened = false;

  // Airport-wide closures and destination ATC stops are intentionally uncommon.
  // At the normal event cadence these should feel exceptional, not routine.
  if (r < 0.001) {
    const cooldownMs = (CONFIG.GROUND_STOP_COOLDOWN_MINUTES || 90) * 60000;
    if (!GROUND_STOP && Date.now() - GROUND_STOP_LAST_ISSUED_AT >= cooldownMs) {
      issueAirportClosure([20,30,45,60][Math.floor(Math.random()*4)], 'rare random airport closure');
      happened = true;
    }
  } else if (r < 0.004) {
    happened = randomAtcGroundStop();
  } else if (r < 0.244) {
    const f = randomFutureFlight(120);
    if (f) happened = applyDelay(f, [5,10,15,20,30][Math.floor(Math.random()*5)], Math.random() < .3 ? 'CREW HOLD' : 'OTHER', 'random operational delay');
  } else if (r < 0.394) {
    happened = randomAirlineDisruption();
  } else if (r < 0.504) {
    happened = randomGateEvent();
  } else if (r < 0.594) {
    happened = randomCrewEvent();
  } else if (r < 0.664) {
    const f = randomFutureFlight(90);
    if (f) { f.status = 'CANCELLED'; f.delayTag = 'OTHER'; logActivity(`Random event: ${f.flightNumber} cancelled`, 'CANCEL', f.id); queueFlightSync(f); happened = true; }
  } else if (r < 0.724) {
    const f = randomFutureFlight(90);
    if (f) { f.status = 'DIVERTED'; f.delayTag = 'OTHER'; logActivity(`Random event: ${f.flightNumber} diverted`, 'DIVERT', f.id); queueFlightSync(f); happened = true; }
  } else if (r < 0.91) {
    WEATHER = Math.random() < .72 ? 'STORM' : 'WINDY';
    WEATHER_LAST_HOUR_KEY = null;
    document.getElementById('weatherSelect').value = WEATHER;
    logActivity(`Random weather event: ${WEATHER === 'STORM' ? 'THUNDERSTORM' : 'WINDY CONDITIONS'}`, 'WEATHER');
    processWeatherHour(); happened = true;
  } else {
    happened = createRandomFlight();
  }

  if (!happened) {
    const f = randomFutureFlight(120);
    if (f) applyDelay(f, 10, 'OTHER', 'minor operational hold');
  }

  renderBoard();
  scheduleNextRandomEvent();
}

function createRandomFlight() {
  // Randomly-created flights represent INBOUND DIVERSIONS arriving at this
  // airport. They may use ANY physical gate regardless of normal airline
  // ownership, but they are never allowed to displace, move, or delay an
  // existing flight. If no conflict-free slot exists, no diversion is added.
  const airlines = [...new Set(CONFIG.GATE_MAP.map(g => g.airline))].filter(Boolean);
  if (!airlines.length || !GATE_LIST.length) return false;

  const airline = airlines[Math.floor(Math.random() * airlines.length)];
  const duration = CONFIG.TURNAROUND_MINUTES || 90;
  const now = nowTimelineMinutes();
  const earliestStart = Math.max(now + 5, Math.ceil((now + 5) / INTERVAL_MIN) * INTERVAL_MIN);
  const latestStart = TIMELINE_END_MIN - duration;
  const candidateStarts = [];

  // Prefer a reasonably soon arrival, but keep searching later if the airport
  // is busy. This delay belongs only to the diversion's placement; it never
  // modifies any scheduled flight already on the board.
  for (let start = earliestStart; start <= latestStart; start += INTERVAL_MIN) {
    candidateStarts.push(start);
  }

  // Randomize gate order so diversions spread around the airport, while still
  // considering every gate as a valid emergency/diversion stand.
  const gates = [...GATE_LIST].sort(() => Math.random() - 0.5);
  let placement = null;

  for (const start of candidateStarts) {
    const end = start + duration;
    for (const gate of gates) {
      const probe = {
        id: '__diversion_probe__',
        gate: gate.id,
        gateStart: minutesToClockString(start),
        departure: minutesToClockString(end),
        status: 'ON TIME'
      };
      const w = occupancyWindow(probe);
      if (!w) continue;
      const blocked = FLIGHTS.some(other => {
        if (other.status === 'CANCELLED' || other.status === 'DIVERTED' || isDeparted(other)) return false;
        if (other.gate !== gate.id) return false;
        const ow = occupancyWindow(other);
        return ow && windowsOverlap(w, ow);
      });
      if (!blocked) {
        placement = { gate, start, end };
        break;
      }
    }
    if (placement) break;
  }

  if (!placement) {
    logActivity('Inbound diversion could not be accepted: no conflict-free gate slot available before 5:00 AM', 'DIVERT');
    return false;
  }

  const id = `sim_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
  const prefixes = { UNITED:'UA', AMERICAN:'AA', DELTA:'DL', SOUTHWEST:'WN', ALASKA:'AS', JETBLUE:'B6', FRONTIER:'F9', SPIRIT:'NK', HAWAIIAN:'HA', AVELO:'XP' };
  const flight = {
    id,
    airline,
    flightNumber: `${prefixes[airline] || 'GT'}${Math.floor(100 + Math.random() * 8900)}`,
    to: ['DEN','ORD','ATL','DFW','LAX','PHX','MCO','SEA'][Math.floor(Math.random() * 8)],
    gate: placement.gate.id,
    boarding: minutesToClockString(placement.end - 30),
    departure: minutesToClockString(placement.end),
    status: 'ON TIME',
    comments: 'Inbound diversion — emergency/open-gate assignment',
    delayTag: '',
    gateStart: minutesToClockString(placement.start),
    base: null,
    ops: { inboundDiversion: true }
  };

  FLIGHTS.push(flight);
  logActivity(`Inbound diversion accepted: ${flight.flightNumber} assigned ${flight.gate} with no scheduled flights displaced`, 'DIVERT', id);
  // Simulation-only diversion: persist in browser operational state, never write it
  // into the authoritative recurring Google Sheet schedule.
  persistOperationalState();
  return true;
}

function scheduleNextRandomEvent(resumeSaved = false) {
  clearTimeout(randomEventTimer);
  let delay;

  if (resumeSaved && nextRandomEventAt && nextRandomEventAt > Date.now()) {
    delay = nextRandomEventAt - Date.now();
  } else {
    let min = CONFIG.RANDOM_EVENT_MIN_SECONDS || 25, max = CONFIG.RANDOM_EVENT_MAX_SECONDS || 110;
    if (WEATHER === 'STORM') { min = CONFIG.STORM_EVENT_MIN_SECONDS || 15; max = CONFIG.STORM_EVENT_MAX_SECONDS || 55; }
    else if (WEATHER === 'WINDY') { min = CONFIG.WINDY_EVENT_MIN_SECONDS || 20; max = CONFIG.WINDY_EVENT_MAX_SECONDS || 80; }
    delay = (min + Math.random() * (max - min)) * 1000;
    nextRandomEventAt = Date.now() + delay;
  }

  persistOperationalState();
  randomEventTimer = setTimeout(() => {
    nextRandomEventAt = null;
    persistOperationalState();
    spawnRandomEvent();
  }, Math.max(250, delay));
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
  clearPersistedOperationalState();
  WEATHER = 'CLEAR'; WEATHER_LAST_HOUR_KEY = null; GROUND_STOP = null; GROUND_STOP_LAST_ISSUED_AT = 0; ATC_GROUND_STOPS = []; nextRandomEventAt = null;
  HISTORY = []; unreadEventCount = 0;
  document.getElementById('weatherSelect').value = 'CLEAR'; updateGroundStopStatus(); updateAtcGroundStopStatus();
  const carryovers = preserveCarryovers ? collectCarryovers() : [];
  logActivity(`— Simulation reset (${reason})${carryovers.length ? `; ${carryovers.length} carryover flight(s)` : ''} —`, 'RESET');
  if (!SHEET_URL) { FLIGHTS = CONFIG.SAMPLE_FLIGHTS.map(f => ({...f})); renderBoard(); return; }
  try {
    const params = new URLSearchParams({ action: 'reset', carryovers: JSON.stringify(carryovers) });
    const data = await fetchSheetJson(SHEET_URL + '?' + params.toString());
    if (data.error) throw new Error(data.error || 'Reset failed');
    const resetRows = Array.isArray(data?.rows) ? data.rows : (Array.isArray(data) ? data : []);
    FLIGHTS = dedupeFlightsById(resetRows.map((row, index) => rowToFlight(row, index)));
    SHEET_FLIGHT_IDS = new Set(
      FLIGHTS.map(f => String(f.sheetId || '').trim()).filter(Boolean)
    );
    const normalized = normalizeResetScheduleToZeroConflicts();
    if (normalized.remaining === 0) {
      logActivity(`Reset schedule normalized to 0 conflicts${normalized.moved ? `; ${normalized.moved} flight${normalized.moved === 1 ? '' : 's'} repositioned` : ''}.`, 'RESET');
    } else {
      logActivity(`Reset schedule cleanup left ${normalized.remaining} all-day overlap${normalized.remaining === 1 ? '' : 's'} that could not fit before 5:00 AM.`, 'CONFLICT');
    }
    renderBoard(); persistOperationalState(); scheduleNextRandomEvent();
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
  const approvalHtml = approvals.map(a => {
    const airportClosed = isGroundStopActive();
    const atcHeld = a.kind === 'pushback' && isFlightAtcHeld(a.f);
    const blocked = airportClosed || atcHeld;
    const pauseText = airportClosed ? ' · PAUSED BY AIRPORT CLOSURE' : atcHeld ? ` · ATC HOLD TO ${escapeHtml(a.f.to)}` : '';
    const buttonText = airportClosed ? 'Airport Closed' : atcHeld ? 'ATC Hold' : a.label;
    return `<div class="activity-request"><div><strong>${escapeHtml(a.f.flightNumber)}</strong> · ${escapeHtml(a.f.gate)}<small>${a.kind === 'taxi' ? 'Taxi to gate requested' : 'Pushback requested'}${pauseText}</small></div><button class="btn btn-primary btn-sm" data-approve-flight="${escapeHtml(a.f.id)}" data-approve-kind="${a.kind}" ${blocked ? 'disabled' : ''}>${buttonText}</button></div>`;
  }).join('');
  const historyHtml = HISTORY.length ? HISTORY.map(h => `<div class="history-row"><span class="history-time">${h.time.toLocaleTimeString([], {hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true})}</span><span>${escapeHtml(h.text)}</span></div>`).join('') : '<div class="history-empty">No activity yet this session.</div>';
  list.innerHTML = `${approvalHtml}${historyHtml}`;
  list.querySelectorAll('[data-approve-flight]').forEach(btn => btn.addEventListener('click', () => approveOperation(btn.dataset.approveFlight, btn.dataset.approveKind)));
}

function renderEventsPanel() {
  const list = document.getElementById('eventsList');
  if (!list) return;
  const events = HISTORY.filter(h => EVENT_ACTIVITY_TYPES.has(h.type));
  if (!events.length) {
    list.innerHTML = '<div class="history-empty">No operational events yet. Taxi and pushback requests stay in Activity.</div>';
    return;
  }
  list.innerHTML = events.map(h => `
    <div class="event-row event-${h.type.toLowerCase()}">
      <div class="event-row-top">
        <span class="event-type">${escapeHtml(h.type)}</span>
        <span class="history-time">${h.time.toLocaleTimeString([], {hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true})}</span>
      </div>
      <div class="event-text">${escapeHtml(h.text)}</div>
    </div>`).join('');
}

function setSyncStatus(state, label) { const el = document.getElementById('syncStatus'); el.className = `sync-status sync-${state}`; el.textContent = label; }

function makeUiOnlyFlightId(row, index = 0) {
  const parts = [
    row['FLIGHT NUMBER'] || '',
    row['TO:'] || '',
    row['GATE:'] || '',
    row['BOARDING TIME:'] || '',
    row['DEPARTURE TIME:'] || '',
    index
  ];
  const raw = parts.join('|').toUpperCase();
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `ui_${(hash >>> 0).toString(36)}`;
}

function rowToFlight(row, index = 0) {
  const dep = row['DEPARTURE TIME:'] || '';
  const gateStart = row['GATE BLOCK START:'] || '';
  const flightNumber = row['FLIGHT NUMBER'] || '';
  const rawAirline = row['AIRLINE'] || row['AIRLINE:'] || '';
  const airline = canonicalAirlineName(rawAirline) || inferAirlineFromFlightNumber(flightNumber);
  const sheetId = String(row['GATEOPS ID'] || row.id || '').trim();

  return {
    id: sheetId || makeUiOnlyFlightId(row, index),
    sheetId: sheetId || '',
    airline,
    flightNumber,
    to: row['TO:'] || '',
    gate: row['GATE:'] || '',
    boarding: row['BOARDING TIME:'] || '',
    departure: dep,
    status: row['STATUS:'] || 'ON TIME',
    comments: row['COMMENTS'] || '',
    delayTag: row['DELAY TAG:'] || '',
    gateStart,
    base: row.__IS_BASELINE ? {
      gate: row.__BASE_GATE || '',
      boarding: row.__BASE_BOARDING || '',
      departure: row.__BASE_DEPARTURE || '',
      status: row.__BASE_STATUS || 'ON TIME',
      comments: row.__BASE_COMMENTS || '',
      gateStart: row.__BASE_GATE_START || ''
    } : null,
    ops: null,
  };
}

function flightToRow(f) {
  return {
    'GATEOPS ID': String(f.sheetId || f.id || '').trim(),
    'GATE:': f.gate,
    'BOARDING TIME:': f.boarding,
    'DEPARTURE TIME:': f.departure,
    'STATUS:': f.status,
    'COMMENTS': f.comments,
    'GATE BLOCK START:': f.gateStart || '',
    'DELAY TAG:': f.delayTag || ''
  };
}

async function fetchSheetJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  const text = await res.text();
  if (!res.ok) {
    const looksHtml = /^\s*</.test(text);
    throw new Error(`Sheet endpoint returned HTTP ${res.status}${looksHtml ? ' (HTML page instead of API JSON)' : ''}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Sheet endpoint did not return JSON${/^\s*</.test(text) ? ' (received an HTML page)' : ''}`);
  }
}

async function loadFromSheet() {
  if (!SHEET_URL) return;
  setSyncStatus('offline', '● Connecting…');
  try {
    const data = await fetchSheetJson(SHEET_URL + '?action=list&_=' + Date.now());
    if (data?.error) throw new Error(data.error || 'Load failed');

    const rows = Array.isArray(data)
      ? data
      : (Array.isArray(data?.rows) ? data.rows : null);

    if (!rows) throw new Error('Sheet endpoint connected, but did not return a flight-row array.');

    FLIGHTS = dedupeFlightsById(rows.map((row, index) => rowToFlight(row, index)));

    // Only real IDs supplied by the Sheet are eligible for writes.
    SHEET_FLIGHT_IDS = new Set(
      FLIGHTS.map(f => String(f.sheetId || '').trim())
        .filter(Boolean)
    );

    const restored = restoreOperationalState();

    if (!FLIGHTS.length) {
      setSyncStatus('error', '● Connected, but 0 flight rows were returned');
    } else {
      const noIdCount = FLIGHTS.filter(f => !String(f.sheetId || '').trim()).length;
      setSyncStatus(
        noIdCount ? 'error' : 'online',
        `● Loaded ${FLIGHTS.length} flight${FLIGHTS.length === 1 ? '' : 's'}${noIdCount ? ` · ${noIdCount} missing Sheet ID${noIdCount === 1 ? '' : 's'}` : ' · synced'}`
      );
    }
    renderBoard();
    populateAtcCityOptions();
    renderHistoryPanel();
    renderEventsPanel();
    scheduleNextRandomEvent(true);
  } catch (e) { console.error(e); setSyncStatus('error', `● Sheet failed: ${e.message}`); }
}

function queueFlightSync(flight) {
  persistOperationalState();
  // Random inbound diversions are simulation-only. They survive reload through
  // operational state, but must never become rows in the recurring Google Sheet.
  const candidateId = String(flight?.sheetId || flight?.id || '').trim();
  if (!candidateId || candidateId.startsWith('ui_') || candidateId.startsWith('legacy_') || candidateId.startsWith('sim_') || flight?.ops?.inboundDiversion) return;
  if (!SHEET_URL) return;
  const flightId = candidateId;
  // Absolute no-append rule: if this flight was not already present in the
  // Google Sheet when loaded, it may exist in the simulation but it cannot
  // create a new Sheet row.
  if (!SHEET_FLIGHT_IDS.has(flightId)) return;
  syncQueue.set(flightId, flightToRow(flight));
  clearTimeout(syncTimer); syncTimer = setTimeout(flushSyncQueue, 500);
}

function normalizeSyncValue(value) {
  return String(value ?? '').trim().toUpperCase();
}

function verifySavedRow(sent, returned) {
  if (!returned || typeof returned !== 'object') throw new Error('Backend did not return the updated Sheet row.');
  const keys = ['GATE:', 'BOARDING TIME:', 'DEPARTURE TIME:', 'STATUS:', 'COMMENTS', 'GATE BLOCK START:', 'DELAY TAG:'];
  for (const key of keys) {
    if (normalizeSyncValue(sent[key]) !== normalizeSyncValue(returned[key])) {
      throw new Error(`Sheet verification failed for ${key}: sent "${sent[key] ?? ''}" but Sheet has "${returned[key] ?? ''}".`);
    }
  }
}

async function flushSyncQueue() {
  syncTimer = null;
  const rows = [...syncQueue.values()];
  syncQueue.clear();
  if (!rows.length) return { requested: 0, updated: 0, failed: 0, errors: [] };

  setSyncStatus('online', `● Saving ${rows.length} change${rows.length === 1 ? '' : 's'}…`);

  let updated = 0;
  let failed = 0;
  const errors = [];

  const batchSize = 10;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    try {
      const params = new URLSearchParams({
        action: 'bulkUpdate',
        rows: JSON.stringify(batch),
        _: String(Date.now())
      });
      const data = await fetchSheetJson(SHEET_URL + '?' + params.toString());
      if (data?.error || !data?.ok) throw new Error(data?.error || 'Bulk save failed.');

      updated += Number(data.updated) || 0;
      failed += Number(data.failed) || 0;
      if (Array.isArray(data.errors)) errors.push(...data.errors);
    } catch (e) {
      failed += batch.length;
      errors.push(e?.message || String(e));
      console.error('Bulk Sheet save failed:', e);
    }
  }

  if (failed || updated !== rows.length) {
    const lastError = errors.length ? errors[errors.length - 1] : '';
    setSyncStatus(
      'error',
      `● Saved ${updated}/${rows.length} · ${failed || (rows.length - updated)} failed${lastError ? ` — ${lastError}` : ''}`
    );
    return { requested: rows.length, updated, failed: Math.max(failed, rows.length - updated), errors };
  }

  setSyncStatus(
    'online',
    `● Synced ${updated} change${updated === 1 ? '' : 's'} (${new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit',hour12:true})})`
  );
  return { requested: rows.length, updated, failed: 0, errors: [] };
}

async function syncAllSheetBackedFlightsNow() {
  if (!SHEET_URL) throw new Error('Sheet connection is not configured.');

  // Do not depend on whatever happened to be left in the debounce queue.
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  syncQueue.clear();

  const rows = [];
  for (const f of FLIGHTS) {
    const id = String(f?.sheetId || f?.id || '').trim();
    if (!id || id.startsWith('ui_') || id.startsWith('legacy_') || id.startsWith('sim_')) continue;
    if (f?.ops?.inboundDiversion) continue;
    if (!SHEET_FLIGHT_IDS.has(id)) continue;
    rows.push(flightToRow(f));
  }

  if (!rows.length) {
    throw new Error('No Sheet-backed flights were available to sync.');
  }

  setSyncStatus('online', `● Writing ${rows.length} flights to Google Sheets…`);

  let updated = 0;
  let failed = 0;
  const errors = [];
  const batchSize = 10;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    try {
      const params = new URLSearchParams({
        action: 'bulkUpdate',
        rows: JSON.stringify(batch),
        _: String(Date.now())
      });
      const data = await fetchSheetJson(SHEET_URL + '?' + params.toString());

      if (data?.error || !data?.ok) {
        throw new Error(data?.error || 'Bulk save failed.');
      }

      const batchUpdated = Number(data.updated) || 0;
      const batchFailed = Number(data.failed) || 0;
      updated += batchUpdated;
      failed += batchFailed;

      if (Array.isArray(data.errors)) errors.push(...data.errors);

      if (batchUpdated !== batch.length || batchFailed) {
        throw new Error(
          `Google Sheets accepted ${batchUpdated}/${batch.length} flights in a batch.` +
          (data?.errors?.length ? ` ${data.errors.join('; ')}` : '')
        );
      }
    } catch (e) {
      failed += batch.length;
      errors.push(e?.message || String(e));
      console.error('Full Sheet sync failed:', e);
      throw new Error(`Google Sheet sync stopped after ${updated}/${rows.length} flights: ${e?.message || e}`);
    }
  }

  if (updated !== rows.length || failed) {
    throw new Error(`Google Sheet sync incomplete: ${updated}/${rows.length} flights updated.`);
  }

  setSyncStatus('online', `● Verifying ${rows.length} Sheet rows…`);

  const liveData = await fetchSheetJson(SHEET_URL + '?action=list&_=' + Date.now());
  const returnedRows = Array.isArray(liveData)
    ? liveData
    : (Array.isArray(liveData?.rows) ? liveData.rows : null);

  if (!returnedRows) {
    throw new Error('Could not reload Google Sheet rows for verification.');
  }

  const byId = new Map();
  returnedRows.forEach((row, index) => {
    const f = rowToFlight(row, index);
    const id = String(f?.sheetId || '').trim();
    if (id) byId.set(id, row);
  });

  let verified = 0;
  const mismatches = [];

  for (const sent of rows) {
    const id = String(sent['GATEOPS ID'] || '').trim();
    const returned = byId.get(id);
    if (!returned) {
      mismatches.push(`${id}: row missing after save`);
      if (mismatches.length >= 8) break;
      continue;
    }

    try {
      verifySavedRow(sent, returned);
      verified++;
    } catch (e) {
      mismatches.push(`${id}: ${e.message}`);
      if (mismatches.length >= 8) break;
    }
  }

  if (mismatches.length || verified !== rows.length) {
    throw new Error(
      `Sheet verification failed after ${verified}/${rows.length} verified.` +
      (mismatches.length ? ` ${mismatches.join(' | ')}` : '')
    );
  }

  setSyncStatus(
    'online',
    `● Google Sheet synced + verified (${verified} flights)`
  );

  return { requested: rows.length, updated, verified };
}

async function deleteFlightFromSheet(id) {
  const params = new URLSearchParams({ action:'delete', id });
  const data = await fetchSheetJson(SHEET_URL + '?' + params.toString());
  if (data.error) throw new Error(data.error || 'Delete failed');
}

document.getElementById('historyBtn').addEventListener('click', () => { renderHistoryPanel(); document.getElementById('historyModal').classList.remove('hidden'); });
document.getElementById('historyModalClose').addEventListener('click', () => document.getElementById('historyModal').classList.add('hidden'));
document.getElementById('eventsBtn').addEventListener('click', () => {
  unreadEventCount = 0;
  updateEventsBadge();
  renderEventsPanel();
  document.getElementById('eventsModal').classList.remove('hidden');
});
document.getElementById('eventsModalClose').addEventListener('click', () => document.getElementById('eventsModal').classList.add('hidden'));
document.getElementById('settingsBtn').addEventListener('click', () => { document.getElementById('weatherSelect').value = WEATHER; populateAtcCityOptions(); updateGroundStopStatus(); updateAtcGroundStopStatus(); document.getElementById('settingsModal').classList.remove('hidden'); });
document.getElementById('settingsModalClose').addEventListener('click', () => document.getElementById('settingsModal').classList.add('hidden'));
document.getElementById('weatherSelect').addEventListener('change', e => { WEATHER = e.target.value; WEATHER_LAST_HOUR_KEY = null; logActivity(`Weather set to ${WEATHER}`, 'WEATHER'); processWeatherHour(); scheduleNextRandomEvent(); renderBoard(); });
document.getElementById('issueGroundStopBtn').addEventListener('click', () => issueAirportClosure(Math.max(5, Number(document.getElementById('groundStopMinutes').value) || 30), 'manual'));
document.getElementById('issueAtcGroundStopBtn').addEventListener('click', () => {
  const select = document.getElementById('atcCities');
  const cities = [...select.selectedOptions].map(o => o.value).filter(Boolean);
  if (!cities.length) { alert('Select at least one destination city.'); return; }
  issueAtcGroundStop(cities, Math.max(5, Number(document.getElementById('atcGroundStopMinutes').value) || 30), 'manual');
});
document.getElementById('resetSimBtn').addEventListener('click', () => { if (confirm('Reset the live board back to the protected baseline schedule now?')) { resetSimulation('manual reset', false); document.getElementById('settingsModal').classList.add('hidden'); } });
document.getElementById('searchBox').addEventListener('input', e => { searchTerm = e.target.value; renderBoard(); });
document.getElementById('statusFilter').addEventListener('change', e => { statusFilterVal = e.target.value; renderBoard(); });
document.getElementById('syncBtn').addEventListener('click', () => loadFromSheet());
document.getElementById('autoSolveBtn').addEventListener('click', autoSolveAllConflicts);

function tickClock() { document.getElementById('clock').textContent = new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true}); }

function init() {
  populateAirlineOptions(); populateGateDatalist(); tickClock();
  if (SHEET_URL) {
    loadFromSheet();
  } else {
    FLIGHTS = CONFIG.SAMPLE_FLIGHTS.map(f => ({...f}));
    restoreOperationalState();
    setSyncStatus('offline', '● Local sample data');
    renderBoard();
    scheduleNextRandomEvent(true);
  }
  setInterval(tickClock, 1000);
  setInterval(() => { processGroundStopLifecycle(); processAtcGroundStopLifecycle(); processRequiredApprovals(); processWeatherHour(); checkDailyReset(); updateGroundStopStatus(); updateAtcGroundStopStatus(); persistOperationalState(); }, 15000);
  setInterval(renderBoard, 60000);
  window.addEventListener('beforeunload', saveOperationalStateNow);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveOperationalStateNow(); });
}

init();


const cleanStandardBtn = document.getElementById('cleanStandardBtn');
if (cleanStandardBtn) {
  cleanStandardBtn.addEventListener('click', async () => {
    cleanStandardBtn.disabled = true;
    try {
      const result = await promoteCurrentLayoutToProtectedStandard();
      alert(`Done. ${result.placed} flights were rebuilt into a realistic 0-overlap schedule. ${result.movedGate} gate changes and ${result.movedTime} time changes were made; maximum time shift was ${result.maxTimeShift || 0} minutes. No automatic delays were added. Google Sheets was synced and verified first, and this layout is now the protected standard.`);
    } catch (e) {
      console.error(e);
      setSyncStatus('error', `● Standard save failed — ${e?.message || e}`);
      alert(e?.message || String(e));
    } finally {
      cleanStandardBtn.disabled = false;
    }
  });
}
