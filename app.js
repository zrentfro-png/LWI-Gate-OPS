/* ============================================================
   GATE OPS BOARD — APP LOGIC
   ============================================================ */

// ---------- State ----------

let FLIGHTS = [];

const SHEET_URL =
  'https://script.google.com/macros/s/AKfycby9XfQI4dPTTHNPAoxeVWm0RLUMSeg6dl-H6iOOhPGAkjHODmseogl9h5RAxcRfYst6aA/exec';

let searchTerm = '';
let statusFilterVal = 'all';

// Stores the exact times when a drag begins.
// This guarantees gate dragging cannot change times.
let ACTIVE_DRAG = null;


// ---------- Gate map expansion ----------

function buildGateList() {
  const gates = [];

  CONFIG.GATE_MAP.forEach(range => {
    for (let n = range.start; n <= range.end; n++) {
      gates.push({
        id: `${range.concourse}${n}`,
        concourse: range.concourse,
        num: n,
        airline: range.airline
      });
    }
  });

  return gates;
}

const GATE_LIST = buildGateList();

const GATE_BY_ID =
  Object.fromEntries(
    GATE_LIST.map(g => [g.id, g])
  );

const CONCOURSES =
  [...new Set(
    GATE_LIST.map(g => g.concourse)
  )].sort();


// ---------- Time helpers ----------

function timeToMinutes(raw) {
  if (!raw) return null;

  const str = raw.toString().trim();

  const match =
    str.match(
      /^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/
    );

  if (!match) return null;

  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);

  const ampm =
    match[3]
      ? match[3].toUpperCase()
      : null;

  if (ampm === 'PM' && h !== 12) {
    h += 12;
  }

  if (ampm === 'AM' && h === 12) {
    h = 0;
  }

  return h * 60 + m;
}

function minutesToTime(mins) {
  mins =
    ((mins % 1440) + 1440) % 1440;

  const h =
    Math.floor(mins / 60)
      .toString()
      .padStart(2, '0');

  const m =
    (mins % 60)
      .toString()
      .padStart(2, '0');

  return `${h}:${m}`;
}

function toTimelineMinutes(raw) {
  const mins = timeToMinutes(raw);

  if (mins === null) return null;

  return mins < TIMELINE_START_MIN
    ? mins + 1440
    : mins;
}

function minutesToClockString(mins) {
  const m =
    ((Math.round(mins) % 1440) + 1440) % 1440;

  const h =
    Math.floor(m / 60);

  const mm =
    (m % 60)
      .toString()
      .padStart(2, '0');

  const ampm =
    h < 12 ? 'AM' : 'PM';

  let h12 = h % 12;

  if (h12 === 0) {
    h12 = 12;
  }

  return `${h12}:${mm} ${ampm}`;
}


// ---------- Occupancy ----------

function occupancyWindow(flight) {
  const dep =
    toTimelineMinutes(
      flight.departure
    );

  if (dep === null) {
    return null;
  }

  const turnaroundStart =
    dep - CONFIG.TURNAROUND_MINUTES;

  const boarding =
    toTimelineMinutes(
      flight.boarding
    );

  const start =
    boarding !== null
      ? Math.min(
          boarding,
          turnaroundStart
        )
      : turnaroundStart;

  const end =
    dep +
    (flight.status === 'DELAYED'
      ? 20
      : 0);

  return {
    start,
    end
  };
}

function windowsOverlap(a, b) {
  return (
    a.start < b.end &&
    b.start < a.end
  );
}


// ---------- Conflict detection ----------

function computeConflicts() {
  const conflicts = new Map();
  const byGate = {};

  FLIGHTS.forEach(f => {
    if (
      f.status === 'CANCELLED' ||
      f.status === 'DIVERTED'
    ) {
      return;
    }

    if (!byGate[f.gate]) {
      byGate[f.gate] = [];
    }

    byGate[f.gate].push(f);
  });

  Object.values(byGate).forEach(list => {
    list.sort(
      (a, b) =>
        toTimelineMinutes(a.departure) -
        toTimelineMinutes(b.departure)
    );

    for (
      let i = 0;
      i < list.length;
      i++
    ) {
      for (
        let j = i + 1;
        j < list.length;
        j++
      ) {
        const wa =
          occupancyWindow(list[i]);

        const wb =
          occupancyWindow(list[j]);

        if (
          wa &&
          wb &&
          windowsOverlap(wa, wb)
        ) {
          conflicts.set(
            list[j].id,
            list[i].id
          );
        }
      }
    }
  });

  return conflicts;
}


// ---------- Airline helpers ----------

function normalizeAirline(str) {
  return (str || '')
    .toString()
    .trim()
    .toUpperCase();
}

function airlinesMatch(a, b) {
  const na = normalizeAirline(a);
  const nb = normalizeAirline(b);

  if (!na || !nb) {
    return false;
  }

  return (
    na === nb ||
    na.includes(nb) ||
    nb.includes(na)
  );
}

function isWrongAirlineGate(flight) {
  const gate =
    GATE_BY_ID[flight.gate];

  if (!gate) {
    return false;
  }

  return !airlinesMatch(
    gate.airline,
    flight.airline
  );
}


// ---------- Gate suggestions ----------

function suggestGatesFor(
  flight,
  excludeGateId
) {
  const window =
    occupancyWindow(flight);

  if (!window) {
    return [];
  }

  const candidates =
    GATE_LIST.filter(
      g =>
        airlinesMatch(
          g.airline,
          flight.airline
        ) &&
        g.id !== excludeGateId
    );

  const scored =
    candidates
      .map(g => {
        const conflictsAtGate =
          FLIGHTS
            .filter(
              f =>
                f.id !== flight.id &&
                f.gate === g.id &&
                f.status !== 'CANCELLED' &&
                f.status !== 'DIVERTED'
            )
            .some(f => {
              const w2 =
                occupancyWindow(f);

              return (
                w2 &&
                windowsOverlap(
                  window,
                  w2
                )
              );
            });

        if (conflictsAtGate) {
          return null;
        }

        const currentGate =
          GATE_BY_ID[excludeGateId];

        const sameConcourse =
          currentGate &&
          g.concourse ===
            currentGate.concourse;

        const distance =
          currentGate
            ? Math.abs(
                g.num -
                currentGate.num
              )
            : 0;

        const score =
          (sameConcourse
            ? 0
            : 1000) +
          distance;

        return {
          gate: g.id,
          score
        };
      })
      .filter(Boolean);

  scored.sort(
    (a, b) =>
      a.score - b.score
  );

  return scored
    .slice(0, 3)
    .map(s => s.gate);
}


// ---------- Rendering ----------

function flightMatchesFilters(f) {
  if (
    statusFilterVal !== 'all' &&
    f.status !== statusFilterVal
  ) {
    return false;
  }

  if (!searchTerm) {
    return true;
  }

  const term =
    searchTerm.toLowerCase();

  return (
    (f.flightNumber || '')
      .toLowerCase()
      .includes(term) ||

    (f.gate || '')
      .toLowerCase()
      .includes(term) ||

    (f.to || '')
      .toLowerCase()
      .includes(term) ||

    (f.airline || '')
      .toLowerCase()
      .includes(term)
  );
}

function statusPillClass(status) {
  switch (status) {
    case 'ON TIME':
      return 'pill-on-time';

    case 'DELAYED':
      return 'pill-delayed';

    case 'BOARDING':
      return 'pill-boarding';

    case 'CANCELLED':
      return 'pill-cancelled';

    case 'DIVERTED':
      return 'pill-diverted';

    default:
      return '';
  }
}

function escapeHtml(str) {
  const div =
    document.createElement('div');

  div.textContent =
    str ?? '';

  return div.innerHTML;
}


// ---------- Flight card ----------

function renderFlightCard(
  flight,
  isConflict
) {
  const card =
    document.createElement('div');

  card.className =
    'flight-card';

  card.dataset.flightId =
    flight.id;

  card.draggable = true;

  const statusClass =
    isConflict
      ? 'status-conflict'
      : flight.status === 'DELAYED'
        ? 'status-delayed'
        : (
            flight.status ===
              'CANCELLED' ||
            flight.status ===
              'DIVERTED'
          )
            ? 'status-cancelled'
            : '';

  if (statusClass) {
    card.classList.add(
      statusClass
    );
  }

  const stripeColor =
    CONFIG.AIRLINE_COLORS[
      flight.airline
    ] || '#3E7BFA';

  if (
    !isConflict &&
    flight.status !== 'DELAYED' &&
    flight.status !== 'CANCELLED' &&
    flight.status !== 'DIVERTED'
  ) {
    card.style.borderLeftColor =
      stripeColor;
  }

  const pillClass =
    isConflict
      ? 'pill-conflict'
      : statusPillClass(
          flight.status
        );

  const pillLabel =
    isConflict
      ? 'CONFLICT'
      : flight.status;

  card.innerHTML = `
    <div class="fc-top">
      <span class="fc-flightnum">
        ${escapeHtml(flight.flightNumber)}
      </span>

      <span class="fc-to">
        → ${escapeHtml(flight.to)}
      </span>
    </div>

    <div class="fc-times">
      <span>
        Board ${escapeHtml(flight.boarding)}
      </span>

      <span>
        Dep ${escapeHtml(flight.departure)}
      </span>
    </div>

    <div class="fc-status-line">
      <span class="fc-status-pill ${pillClass}">
        ${escapeHtml(pillLabel)}
      </span>
    </div>

    ${
      flight.comments
        ? `
          <div class="fc-comment">
            ${escapeHtml(flight.comments)}
          </div>
        `
        : ''
    }

    ${
      isConflict
        ? `
          <div class="fc-conflict-note">
            Overlaps another aircraft at this gate
          </div>
        `
        : ''
    }

    ${
      !isConflict &&
      isWrongAirlineGate(flight)
        ? `
          <div class="fc-wrong-airline-note">
            On a ${escapeHtml(
              GATE_BY_ID[
                flight.gate
              ].airline
            )} gate
          </div>
        `
        : ''
    }

    <div
      class="resize-handle resize-left"
      title="Drag to change boarding time"
    ></div>

    <div
      class="resize-handle resize-right"
      title="Drag to change departure time"
    ></div>
  `;


  // ---------- Click ----------

  card.addEventListener(
    'click',
    () => {
      if (
        card.classList.contains(
          'was-dragged'
        )
      ) {
        return;
      }

      openFlightModal(
        flight.id
      );
    }
  );


  // ---------- Drag start ----------

  card.addEventListener(
    'dragstart',
    e => {

      ACTIVE_DRAG = {
        flightId: flight.id,
        gate: flight.gate,
        boarding: flight.boarding,
        departure: flight.departure
      };

      e.dataTransfer.effectAllowed =
        'move';

      e.dataTransfer.setData(
        'text/plain',
        flight.id
      );

      card.classList.add(
        'dragging'
      );
    }
  );


  // ---------- Drag end ----------

  card.addEventListener(
    'dragend',
    () => {
      card.classList.remove(
        'dragging'
      );

      setTimeout(() => {
        ACTIVE_DRAG = null;
      }, 0);
    }
  );

  return card;
}


// ---------- Timeline geometry ----------

const TIMELINE_START_MIN =
  timeToMinutes(
    CONFIG.TIMELINE_START
  ) ?? 300;

const TIMELINE_END_MIN =
  timeToMinutes(
    CONFIG.TIMELINE_END
  ) ?? 1440;

const INTERVAL_MIN =
  CONFIG.INTERVAL_MINUTES || 15;

const COL_WIDTH =
  CONFIG.COLUMN_WIDTH_PX || 60;

const TOTAL_COLUMNS =
  Math.ceil(
    (
      TIMELINE_END_MIN -
      TIMELINE_START_MIN
    ) /
    INTERVAL_MIN
  );

const TIMELINE_WIDTH =
  TOTAL_COLUMNS *
  COL_WIDTH;

function minutesToX(mins) {
  return (
    (
      (
        mins -
        TIMELINE_START_MIN
      ) /
      INTERVAL_MIN
    ) *
    COL_WIDTH
  );
}


// ---------- Time header ----------

function renderTimeHeader() {
  const header =
    document.createElement('div');

  header.className =
    'time-header';

  header.style.width =
    TIMELINE_WIDTH + 'px';

  for (
    let i = 0;
    i < TOTAL_COLUMNS;
    i++
  ) {
    const mins =
      TIMELINE_START_MIN +
      i * INTERVAL_MIN;

    const cell =
      document.createElement('div');

    cell.className =
      'time-cell' +
      (
        mins % 60 === 0
          ? ' time-cell-hour'
          : ''
      );

    cell.style.width =
      COL_WIDTH + 'px';

    cell.textContent =
      mins % 60 === 0
        ? minutesToTime(mins)
        : '';

    header.appendChild(
      cell
    );
  }

  return header;
}


// ---------- Board ----------

function renderBoard() {
  const board =
    document.getElementById(
      'board'
    );

  if (!board) {
    console.error(
      'Gate Ops: #board element not found.'
    );
    return;
  }

  board.innerHTML = '';

  const conflicts =
    computeConflicts();

  updateConflictBanner(
    conflicts
  );

  const scrollArea =
    document.createElement('div');

  scrollArea.className =
    'timeline-scroll';


  // ---------- Header ----------

  const headerRow =
    document.createElement('div');

  headerRow.className =
    'timeline-header-row';

  const corner =
    document.createElement('div');

  corner.className =
    'corner-cell';

  corner.textContent =
    'GATE';

  headerRow.appendChild(
    corner
  );

  headerRow.appendChild(
    renderTimeHeader()
  );

  scrollArea.appendChild(
    headerRow
  );


  // ---------- Concourses ----------

  CONCOURSES.forEach(
    concourse => {

      const gatesInConcourse =
        GATE_LIST.filter(
          g =>
            g.concourse ===
            concourse
        );

      const airlinesHere =
        [
          ...new Set(
            gatesInConcourse.map(
              g => g.airline
            )
          )
        ];

      const labelRow =
        document.createElement(
          'div'
        );

      labelRow.className =
        'concourse-label-row';

      const labelCorner =
        document.createElement(
          'div'
        );

      labelCorner.className =
        'corner-cell concourse-corner';

      labelRow.appendChild(
        labelCorner
      );

      const labelBody =
        document.createElement(
          'div'
        );

      labelBody.className =
        'concourse-label-body';

      labelBody.style.width =
        TIMELINE_WIDTH + 'px';

      labelBody.innerHTML = `
        <span class="concourse-title">
          CONCOURSE ${escapeHtml(concourse)}
        </span>

        <span class="concourse-sub">
          ${escapeHtml(
            airlinesHere.join(' · ')
          )}
        </span>
      `;

      labelRow.appendChild(
        labelBody
      );

      scrollArea.appendChild(
        labelRow
      );


      // ---------- Gates ----------

      gatesInConcourse.forEach(
        gate => {

          const row =
            document.createElement(
              'div'
            );

          row.className =
            'timeline-row';

          const gateIdEl =
            document.createElement(
              'div'
            );

          gateIdEl.className =
            'gate-id-cell';

          gateIdEl.textContent =
            gate.id;

          const track =
            document.createElement(
              'div'
            );

          track.className =
            'gate-track';

          track.style.width =
            TIMELINE_WIDTH + 'px';

          track.style.backgroundSize =
            `${COL_WIDTH}px 100%`;

          track.dataset.gateId =
            gate.id;

          track.dataset.airline =
            gate.airline;

          const flightsHere =
            FLIGHTS.filter(
              f =>
                f.gate === gate.id &&
                flightMatchesFilters(f)
            );

          flightsHere.forEach(
            f => {

              const win =
                occupancyWindow(f);

              const card =
                renderFlightCard(
                  f,
                  conflicts.has(f.id)
                );

              if (win) {

                const left =
                  Math.max(
                    minutesToX(
                      win.start
                    ),
                    0
                  );

                const width =
                  Math.max(
                    minutesToX(
                      win.end
                    ) -
                    minutesToX(
                      win.start
                    ),
                    40
                  );

                card.style.position =
                  'absolute';

                card.style.left =
                  left + 'px';

                card.style.width =
                  width + 'px';

              } else {

                card.style.position =
                  'absolute';

                card.style.left =
                  '0px';

                card.style.width =
                  '150px';
              }

              track.appendChild(
                card
              );

              attachResizeHandlers(
                card,
                f
              );
            }
          );

          attachDropHandlers(
            track
          );

          row.appendChild(
            gateIdEl
          );

          row.appendChild(
            track
          );

          scrollArea.appendChild(
            row
          );
        }
      );
    }
  );

  board.appendChild(
    scrollArea
  );
}


// ---------- Resize handlers ----------

function attachResizeHandlers(
  card,
  flight
) {
  const leftHandle =
    card.querySelector(
      '.resize-left'
    );

  const rightHandle =
    card.querySelector(
      '.resize-right'
    );

  const pxPerMin =
    COL_WIDTH /
    INTERVAL_MIN;


  function startResize(
    e,
    isLeft
  ) {
    e.stopPropagation();
    e.preventDefault();

    card.draggable = false;

    const startX =
      e.clientX;

    const baseLeft =
      parseFloat(
        card.style.left
      );

    const baseWidth =
      parseFloat(
        card.style.width
      );


    function onMoveSimple(ev) {
      const dx =
        ev.clientX -
        startX;

      if (isLeft) {

        let newLeft =
          baseLeft + dx;

        let newWidth =
          baseWidth - dx;

        if (newWidth < 30) {
          newWidth = 30;

          newLeft =
            baseLeft +
            (
              baseWidth -
              30
            );
        }

        card.style.left =
          newLeft + 'px';

        card.style.width =
          newWidth + 'px';

      } else {

        let newWidth =
          baseWidth + dx;

        if (newWidth < 30) {
          newWidth = 30;
        }

        card.style.width =
          newWidth + 'px';
      }
    }


    function onUp(ev) {

      document.removeEventListener(
        'mousemove',
        onMoveSimple
      );

      document.removeEventListener(
        'mouseup',
        onUp
      );

      card.draggable = true;

      const dx =
        ev.clientX -
        startX;

      const deltaMinRaw =
        dx /
        pxPerMin;

      const deltaMin =
        Math.round(
          deltaMinRaw /
          INTERVAL_MIN
        ) *
        INTERVAL_MIN;


      // LEFT HANDLE = BOARDING TIME

      if (isLeft) {

        const win =
          occupancyWindow(
            flight
          );

        const baseStart =
          win
            ? win.start
            : (
                toTimelineMinutes(
                  flight.departure
                ) -
                CONFIG.TURNAROUND_MINUTES
              );

        flight.boarding =
          minutesToClockString(
            baseStart +
            deltaMin
          );


      // RIGHT HANDLE = DEPARTURE TIME

      } else {

        const dep =
          toTimelineMinutes(
            flight.departure
          ) ?? 0;

        flight.departure =
          minutesToClockString(
            dep +
            deltaMin
          );
      }

      renderBoard();

      if (SHEET_URL) {
        pushFlightToSheet(
          flight
        ).catch(err => {

          console.error(
            'Time sync failed:',
            err
          );

          alert(
            'The time changed locally, but could not sync to the sheet.'
          );
        });
      }
    }


    document.addEventListener(
      'mousemove',
      onMoveSimple
    );

    document.addEventListener(
      'mouseup',
      onUp
    );
  }


  leftHandle.addEventListener(
    'mousedown',
    e =>
      startResize(
        e,
        true
      )
  );

  rightHandle.addEventListener(
    'mousedown',
    e =>
      startResize(
        e,
        false
      )
  );
}


// ---------- Gate drag/drop ----------

function attachDropHandlers(track) {

  track.addEventListener(
    'dragover',
    e => {
      e.preventDefault();

      e.dataTransfer.dropEffect =
        'move';

      track.classList.add(
        'drag-over'
      );
    }
  );


  track.addEventListener(
    'dragleave',
    () => {
      track.classList.remove(
        'drag-over'
      );
    }
  );


  track.addEventListener(
    'drop',
    e => {
      e.preventDefault();

      track.classList.remove(
        'drag-over'
      );

      const flightId =
        e.dataTransfer.getData(
          'text/plain'
        );

      const newGate =
        track.dataset.gateId;

      const gateOwner =
        track.dataset.airline;

      handleGateDrop(
        flightId,
        newGate,
        gateOwner
      );
    }
  );
}


// ---------- Gate drop handler ----------

function handleGateDrop(
  flightId,
  newGate,
  gateOwner
) {
  const flight =
    FLIGHTS.find(
      f =>
        f.id === flightId
    );

  if (!flight) {
    ACTIVE_DRAG = null;
    return;
  }

  if (
    flight.gate === newGate
  ) {
    ACTIVE_DRAG = null;
    return;
  }


  // Check airline ownership.

  if (
    gateOwner &&
    !airlinesMatch(
      gateOwner,
      flight.airline
    )
  ) {
    const proceed =
      confirm(
        `Gate ${newGate} belongs to ${gateOwner}, but ${flight.flightNumber} is a ${flight.airline} flight.\n\nMove it here anyway?`
      );

    if (!proceed) {
      ACTIVE_DRAG = null;
      renderBoard();
      return;
    }
  }


  // IMPORTANT:
  // Take the original values from the drag snapshot.

  const originalBoarding =
    ACTIVE_DRAG &&
    ACTIVE_DRAG.flightId === flight.id
      ? ACTIVE_DRAG.boarding
      : flight.boarding;

  const originalDeparture =
    ACTIVE_DRAG &&
    ACTIVE_DRAG.flightId === flight.id
      ? ACTIVE_DRAG.departure
      : flight.departure;

  const oldGate =
    flight.gate;


  // ONLY CHANGE THE GATE.

  flight.gate =
    newGate;

  // Explicitly restore the original times.

  flight.boarding =
    originalBoarding;

  flight.departure =
    originalDeparture;

  ACTIVE_DRAG = null;

  renderBoard();


  // Save the gate change.

  if (SHEET_URL) {

    pushFlightToSheet(
      flight
    ).catch(err => {

      console.error(
        'Gate sync failed:',
        err
      );

      // Revert ONLY the gate.

      flight.gate =
        oldGate;

      flight.boarding =
        originalBoarding;

      flight.departure =
        originalDeparture;

      renderBoard();

      alert(
        'Could not save the gate change to the sheet. The gate was reverted.'
      );
    });
  }
}


// ---------- Conflict banner ----------

function updateConflictBanner(
  conflicts
) {
  const banner =
    document.getElementById(
      'conflictBanner'
    );

  if (!banner) {
    return;
  }

  if (conflicts.size === 0) {
    banner.classList.add(
      'hidden'
    );
    return;
  }

  banner.classList.remove(
    'hidden'
  );

  const names =
    [...conflicts.keys()]
      .map(
        id =>
          FLIGHTS.find(
            f => f.id === id
          )
      )
      .filter(Boolean)
      .map(
        f => f.flightNumber
      );

  banner.textContent =
    `⚠ ${conflicts.size} gate conflict${
      conflicts.size > 1
        ? 's'
        : ''
    }: ${names.join(', ')} — reassign or adjust times`;
}


// ---------- Flight modal ----------

function populateAirlineOptions() {
  const select =
    document.getElementById(
      'f_airline'
    );

  if (!select) {
    return;
  }

  const fromConfig =
    CONFIG.GATE_MAP.map(
      g => g.airline
    );

  const fromFlights =
    FLIGHTS.map(
      f => f.airline
    );

  const airlines =
    [
      ...new Set([
        ...fromConfig,
        ...fromFlights
      ])
    ]
      .filter(Boolean)
      .sort();

  select.innerHTML =
    airlines
      .map(
        a =>
          `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`
      )
      .join('');
}

function populateGateDatalist() {
  const list =
    document.getElementById(
      'gateList'
    );

  if (!list) {
    return;
  }

  list.innerHTML =
    GATE_LIST
      .map(
        g =>
          `<option value="${escapeHtml(g.id)}">`
      )
      .join('');
}

function openFlightModal(
  flightId
) {
  populateAirlineOptions();

  const modal =
    document.getElementById(
      'flightModal'
    );

  const isEdit =
    !!flightId;

  const flight =
    isEdit
      ? FLIGHTS.find(
          f =>
            f.id === flightId
        )
      : null;

  if (isEdit && !flight) {
    return;
  }

  document.getElementById(
    'modalTitle'
  ).textContent =
    isEdit
      ? 'Edit Flight'
      : 'Add Flight';

  document.getElementById(
    'deleteFlightBtn'
  ).classList.toggle(
    'hidden',
    !isEdit
  );

  document.getElementById(
    'suggestBox'
  ).classList.add(
    'hidden'
  );

  document.getElementById(
    'f_id'
  ).value =
    isEdit
      ? flight.id
      : '';

  document.getElementById(
    'f_airline'
  ).value =
    isEdit
      ? flight.airline
      : CONFIG.GATE_MAP[0].airline;

  document.getElementById(
    'f_flightnum'
  ).value =
    isEdit
      ? flight.flightNumber
      : '';

  document.getElementById(
    'f_to'
  ).value =
    isEdit
      ? flight.to
      : '';

  document.getElementById(
    'f_gate'
  ).value =
    isEdit
      ? flight.gate
      : '';

  document.getElementById(
    'f_boarding'
  ).value =
    isEdit
      ? flight.boarding
      : '';

  document.getElementById(
    'f_departure'
  ).value =
    isEdit
      ? flight.departure
      : '';

  document.getElementById(
    'f_status'
  ).value =
    isEdit
      ? flight.status
      : 'ON TIME';

  document.getElementById(
    'f_comments'
  ).value =
    isEdit
      ? flight.comments
      : '';


  if (isEdit) {

    const conflicts =
      computeConflicts();

    if (
      conflicts.has(
        flight.id
      ) ||
      flight.status ===
        'DELAYED'
    ) {

      const suggestions =
        suggestGatesFor(
          flight,
          flight.gate
        );

      const box =
        document.getElementById(
          'suggestBox'
        );

      if (suggestions.length) {

        box.classList.remove(
          'hidden'
        );

        box.innerHTML =
          `<strong>Suggested open gates for ${escapeHtml(flight.airline)}:</strong><br/>` +
          suggestions
            .map(
              g =>
                `<span class="suggest-option" data-gate="${escapeHtml(g)}">${escapeHtml(g)}</span>`
            )
            .join('');

        box
          .querySelectorAll(
            '.suggest-option'
          )
          .forEach(
            el => {
              el.addEventListener(
                'click',
                () => {
                  document.getElementById(
                    'f_gate'
                  ).value =
                    el.dataset.gate;
                }
              );
            }
          );

      } else {

        box.classList.remove(
          'hidden'
        );

        box.innerHTML =
          `<strong>No open ${escapeHtml(flight.airline)} gates found in this window.</strong> Consider adjusting the time or checking a neighboring concourse manually.`;
      }
    }
  }

  modal.classList.remove(
    'hidden'
  );
}

function closeFlightModal() {
  document.getElementById(
    'flightModal'
  ).classList.add(
    'hidden'
  );
}


// ---------- Add / Edit flight ----------

document
  .getElementById(
    'flightForm'
  )
  .addEventListener(
    'submit',
    e => {

      e.preventDefault();

      const id =
        document.getElementById(
          'f_id'
        ).value ||
        `f_${Date.now()}`;

      const flightData = {

        id,

        airline:
          document.getElementById(
            'f_airline'
          ).value,

        flightNumber:
          document.getElementById(
            'f_flightnum'
          ).value.trim(),

        to:
          document.getElementById(
            'f_to'
          ).value
            .trim()
            .toUpperCase(),

        gate:
          document.getElementById(
            'f_gate'
          ).value
            .trim()
            .toUpperCase(),

        boarding:
          document.getElementById(
            'f_boarding'
          ).value,

        departure:
          document.getElementById(
            'f_departure'
          ).value,

        status:
          document.getElementById(
            'f_status'
          ).value,

        comments:
          document.getElementById(
            'f_comments'
          ).value.trim()
      };


      const gateInfo =
        GATE_BY_ID[
          flightData.gate
        ];

      if (
        gateInfo &&
        !airlinesMatch(
          gateInfo.airline,
          flightData.airline
        )
      ) {

        const proceed =
          confirm(
            `Gate ${flightData.gate} belongs to ${gateInfo.airline}, but this is a ${flightData.airline} flight.\n\nSave it here anyway?`
          );

        if (!proceed) {
          return;
        }
      }


      const existingIdx =
        FLIGHTS.findIndex(
          f =>
            f.id === id
        );

      let previousFlight =
        null;

      if (existingIdx >= 0) {

        previousFlight =
          {
            ...FLIGHTS[
              existingIdx
            ]
          };

        FLIGHTS[
          existingIdx
        ] =
          flightData;

      } else {

        FLIGHTS.push(
          flightData
        );
      }

      renderBoard();

      closeFlightModal();


      if (SHEET_URL) {

        pushFlightToSheet(
          flightData
        ).catch(err => {

          console.error(
            'Flight save failed:',
            err
          );

          if (existingIdx >= 0) {
            FLIGHTS[
              existingIdx
            ] =
              previousFlight;
          } else {
            FLIGHTS =
              FLIGHTS.filter(
                f =>
                  f.id !== id
              );
          }

          renderBoard();

          alert(
            'Could not save the flight to the sheet. The change was reverted.'
          );
        });
      }
    }
  );


// ---------- Delete flight ----------

document
  .getElementById(
    'deleteFlightBtn'
  )
  .addEventListener(
    'click',
    () => {

      const id =
        document.getElementById(
          'f_id'
        ).value;

      if (!id) {
        return;
      }

      if (
        !confirm(
          'Remove this flight from the board?'
        )
      ) {
        return;
      }

      const deletedFlight =
        FLIGHTS.find(
          f => f.id === id
        );

      FLIGHTS =
        FLIGHTS.filter(
          f =>
            f.id !== id
        );

      renderBoard();

      closeFlightModal();


      if (SHEET_URL) {

        deleteFlightFromSheet(
          id
        ).catch(err => {

          console.error(
            'Delete failed:',
            err
          );

          if (deletedFlight) {
            FLIGHTS.push(
              deletedFlight
            );
          }

          renderBoard();

          alert(
            'Could not remove the flight from the sheet. The flight was restored.'
          );
        });
      }
    }
  );


// ---------- Modal controls ----------

document
  .getElementById(
    'addFlightBtn'
  )
  .addEventListener(
    'click',
    () =>
      openFlightModal(null)
  );

document
  .getElementById(
    'modalClose'
  )
  .addEventListener(
    'click',
    closeFlightModal
  );

document
  .getElementById(
    'modalCancel'
  )
  .addEventListener(
    'click',
    closeFlightModal
  );


// ---------- Search / filter ----------

document
  .getElementById(
    'searchBox'
  )
  .addEventListener(
    'input',
    e => {

      searchTerm =
        e.target.value;

      renderBoard();
    }
  );

document
  .getElementById(
    'statusFilter'
  )
  .addEventListener(
    'change',
    e => {

      statusFilterVal =
        e.target.value;

      renderBoard();
    }
  );


// ============================================================
// GOOGLE SHEET SYNC
// ============================================================

function setSyncStatus(
  state,
  label
) {
  const el =
    document.getElementById(
      'syncStatus'
    );

  if (!el) {
    return;
  }

  el.className =
    `sync-status sync-${state}`;

  el.textContent =
    label;
}


// ---------- Load flights from sheet ----------

async function loadFromSheet() {

  if (!SHEET_URL) {
    return;
  }

  setSyncStatus(
    'offline',
    '● Connecting…'
  );

  try {

    const res = await fetch(
      SHEET_URL +
      '?action=list&_=' +
      Date.now(),
      {
        method: 'GET',
        redirect: 'follow',
        cache: 'no-store'
      }
    );

    if (!res.ok) {
      throw new Error(
        `HTTP ${res.status}`
      );
    }

    const data = await res.json();

    if (!Array.isArray(data)) {
      throw new Error(
        'Invalid response from Google Sheet'
      );
    }

    FLIGHTS = data.map(rowToFlight);

    setSyncStatus(
      'online',
      `● Synced with sheet (${new Date().toLocaleTimeString()})`
    );

    renderBoard();

  } catch (err) {

    console.error(
      'Sheet load failed:',
      err
    );

    setSyncStatus(
      'error',
      '● Sheet connection failed'
    );

    if (!FLIGHTS.length) {
      FLIGHTS =
        CONFIG.SAMPLE_FLIGHTS.map(
          f => ({
            ...f
          })
        );
    }

    renderBoard();
  }
}

// ---------- Convert sheet row to flight ----------

function rowToFlight(row) {
  return {
    id:
      row.id ||
      row['FLIGHT NUMBER'],

    airline:
      row['AIRLINE'] || '',

    flightNumber:
      row['FLIGHT NUMBER'] || '',

    to:
      row['TO:'] || '',

    gate:
      row['GATE:'] || '',

    boarding:
      row['BOARDING TIME:'] || '',

    departure:
      row['DEPARTURE TIME:'] || '',

    status:
      row['STATUS:'] ||
      row['STATUS'] ||
      'ON TIME',

    comments:
      row['COMMENTS:'] ||
      row['COMMENTS'] ||
      ''
  };
}


// ---------- Convert flight to sheet row ----------

function flightToRow(flight) {
  return {
    id:
      flight.id,

    'AIRLINE':
      flight.airline,

    'FLIGHT NUMBER':
      flight.flightNumber,

    'TO:':
      flight.to,

    'GATE:':
      flight.gate,

    'BOARDING TIME:':
      flight.boarding,

    'DEPARTURE TIME:':
      flight.departure,

    'STATUS:':
      flight.status,

    'COMMENTS':
      flight.comments
  };
}


// ============================================================
// SAVE FLIGHT TO GOOGLE SHEET
//
// IMPORTANT:
// Uses POST instead of GET for upsert/delete.
// Your Code.gs already has doPost() handlers.
// ============================================================

async function pushFlightToSheet(flight) {
  if (!SHEET_URL) {
    return;
  }

  setSyncStatus('online', '● Saving…');

  const row = flightToRow(flight);

  const url =
    SHEET_URL +
    '?action=upsert&row=' +
    encodeURIComponent(JSON.stringify(row));

  try {
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error('HTTP ' + res.status);
    }

    const data = await res.json();

    if (data.error) {
      throw new Error(data.error);
    }

    if (data.ok !== true) {
      throw new Error('Google Sheet did not confirm the save.');
    }

    setSyncStatus(
      'online',
      '● Synced with sheet (' +
      new Date().toLocaleTimeString() +
      ')'
    );

    return data;

  } catch (err) {
    console.error('Google Sheet save failed:', err);
    setSyncStatus('error', '● Sheet connection failed');
    throw err;
  }
}

// ============================================================
// DELETE FLIGHT FROM GOOGLE SHEET
// ============================================================

async function deleteFlightFromSheet(id) {
  if (!SHEET_URL) return;

  setSyncStatus('online', '● Saving…');

  const url =
    SHEET_URL +
    '?action=delete&id=' +
    encodeURIComponent(id) +
    '&_=' +
    Date.now();

  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store'
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    if (data && data.error) throw new Error(data.error);
    if (!data || data.ok !== true) {
      throw new Error('Google Sheet did not confirm the deletion.');
    }

    setSyncStatus(
      'online',
      `● Synced with sheet (${new Date().toLocaleTimeString()})`
    );

    return data;
  } catch (err) {
    console.error('Google Sheet delete failed:', err);
    setSyncStatus('error', '● Sheet connection failed');
    throw err;
  }
}
  id
) {
  if (!SHEET_URL) {
    return;
  }

  setSyncStatus(
    'online',
    '● Saving…'
  );

  const payload = {
    action: 'delete',
    id: id
  };

  let res;

  try {

    res =
      await fetch(
        SHEET_URL,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'text/plain;charset=utf-8'
          },

          body:
            JSON.stringify(payload)
        }
      );

  } catch (err) {

    console.error(
      'Google Sheet delete request failed:',
      err
    );

    throw new Error(
      'Could not connect to the Google Sheet.'
    );
  }

  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status}`
    );
  }

  let data = null;

  try {
    data =
      await res.json();
  } catch (err) {
    throw new Error(
      'Google Sheet returned an invalid response.'
    );
  }

  if (
    data &&
    data.error
  ) {
    throw new Error(
      data.error
    );
  }

  if (
    !data ||
    data.ok !== true
  ) {
    throw new Error(
      'Google Sheet did not confirm the deletion.'
    );
  }

  setSyncStatus(
    'online',
    `● Synced with sheet (${new Date().toLocaleTimeString()})`
  );

  return data;
}


// ---------- Sheet connection ----------

// The URL is permanently built into the app.
// Users cannot change it.

const syncBtn =
  document.getElementById(
    'syncBtn'
  );

const sheetModal =
  document.getElementById(
    'sheetModal'
  );

const sheetModalClose =
  document.getElementById(
    'sheetModalClose'
  );

const sheetModalCancel =
  document.getElementById(
    'sheetModalCancel'
  );

const sheetModalSave =
  document.getElementById(
    'sheetModalSave'
  );

const sheetUrlInput =
  document.getElementById(
    'sheetUrlInput'
  );


if (sheetUrlInput) {
  sheetUrlInput.value =
    SHEET_URL;

  sheetUrlInput.readOnly =
    true;
}


if (syncBtn) {
  syncBtn.addEventListener(
    'click',
    () => {

      if (sheetUrlInput) {
        sheetUrlInput.value =
          SHEET_URL;
      }

      if (sheetModal) {
        sheetModal.classList.remove(
          'hidden'
        );
      }
    }
  );
}


if (sheetModalClose) {
  sheetModalClose.addEventListener(
    'click',
    () => {
      if (sheetModal) {
        sheetModal.classList.add(
          'hidden'
        );
      }
    }
  );
}


if (sheetModalCancel) {
  sheetModalCancel.addEventListener(
    'click',
    () => {
      if (sheetModal) {
        sheetModal.classList.add(
          'hidden'
        );
      }
    }
  );
}


if (sheetModalSave) {
  sheetModalSave.addEventListener(
    'click',
    () => {

      // The URL cannot be changed.
      if (sheetUrlInput) {
        sheetUrlInput.value =
          SHEET_URL;
      }

      if (sheetModal) {
        sheetModal.classList.add(
          'hidden'
        );
      }

      loadFromSheet();
    }
  );
}


// ---------- Clock ----------

function tickClock() {
  const clock =
    document.getElementById(
      'clock'
    );

  if (!clock) {
    return;
  }

  clock.textContent =
    new Date().toLocaleTimeString(
      [],
      {
        hour12: false
      }
    );
}

setInterval(
  tickClock,
  1000
);


// ---------- Init ----------

function init() {

  populateAirlineOptions();

  populateGateDatalist();

  tickClock();

  // Always try the Google Sheet first.
  loadFromSheet();

  setInterval(
    renderBoard,
    60000
  );
}

init();
