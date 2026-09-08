/* ============================================================
   GATE OPS BOARD — APP LOGIC
   ============================================================ */

// ---------- State ----------

let FLIGHTS = [];

const SHEET_URL =
  'https://script.google.com/macros/s/AKfycby9XfQI4dPTTHNPAoxeVWm0RLUMSeg6dl-H6iOOhPGAkjHODmseogl9h5RAxcRfYst6aA/exec';

let searchTerm = '';
let statusFilterVal = 'all';

let ACTIVE_DRAG = null;


// ============================================================
// GATE MAP
// ============================================================

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

const GATE_BY_ID = Object.fromEntries(
  GATE_LIST.map(g => [g.id, g])
);

const CONCOURSES = [
  ...new Set(
    GATE_LIST.map(g => g.concourse)
  )
].sort();


// ============================================================
// TIME HELPERS
// ============================================================

function timeToMinutes(raw) {
  if (
    raw === null ||
    raw === undefined ||
    raw === ''
  ) {
    return null;
  }

  const str = raw.toString().trim();

  const match = str.match(
    /^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/
  );

  if (!match) {
    return null;
  }

  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);

  if (h > 23 || m > 59) {
    return null;
  }

  const ampm = match[3]
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


// Always returns 12-hour time.
function minutesToTime(mins) {
  mins =
    ((mins % 1440) + 1440) % 1440;

  const h = Math.floor(mins / 60);

  const m = (mins % 60)
    .toString()
    .padStart(2, '0');

  const ampm = h < 12 ? 'AM' : 'PM';

  let h12 = h % 12;

  if (h12 === 0) {
    h12 = 12;
  }

  return `${h12}:${m} ${ampm}`;
}


function format12HourTime(raw) {
  if (
    raw === null ||
    raw === undefined ||
    raw === ''
  ) {
    return '';
  }

  const mins = timeToMinutes(raw);

  if (mins === null) {
    return raw.toString();
  }

  return minutesToTime(mins);
}


// ============================================================
// TIMELINE
//
// IMPORTANT:
//
// The board is ALWAYS:
// 5:00 AM → 4:59 AM next day.
//
// Internally:
// 5:00 AM = 300
// 12:00 AM = 1440
// 4:59 AM = 1739
// ============================================================

const TIMELINE_START_MIN = 5 * 60;

const TIMELINE_END_MIN =
  TIMELINE_START_MIN + 1440;

const INTERVAL_MIN =
  CONFIG.INTERVAL_MINUTES || 15;

const COL_WIDTH =
  CONFIG.COLUMN_WIDTH_PX || 60;

const TOTAL_COLUMNS =
  Math.ceil(
    (TIMELINE_END_MIN - TIMELINE_START_MIN) /
    INTERVAL_MIN
  );

const TIMELINE_WIDTH =
  TOTAL_COLUMNS * COL_WIDTH;


function toTimelineMinutes(raw) {
  const mins = timeToMinutes(raw);

  if (mins === null) {
    return null;
  }

  /*
    Anything between midnight and 4:59 AM belongs
    AFTER midnight in the airport operating day.
  */

  if (mins < TIMELINE_START_MIN) {
    return mins + 1440;
  }

  return mins;
}


function minutesToClockString(mins) {
  return minutesToTime(
    Math.round(mins)
  );
}


function minutesToX(mins) {
  return (
    (mins - TIMELINE_START_MIN) /
    INTERVAL_MIN
  ) * COL_WIDTH;
}


// ============================================================
// BOARDING / DEPARTURE RELATIONSHIP
// ============================================================

function setBoardingFromDeparture(flight) {
  const departure =
    toTimelineMinutes(
      flight.departure
    );

  if (departure === null) {
    return;
  }

  flight.boarding =
    minutesToClockString(
      departure - 30
    );
}


// Change departure while moving boarding
// by the exact same amount.
//
// This preserves a manually-created boarding
// offset if the user intentionally changed it.
//
// Example:
// Normal:
// Board 5:30 PM
// Dep   6:00 PM
//
// Move departure +30:
// Board 6:00 PM
// Dep   6:30 PM
//
// If manually set:
// Board 5:40 PM
// Dep   6:00 PM
//
// Move departure +30:
// Board 6:10 PM
// Dep   6:30 PM
function changeDepartureTime(
  flight,
  deltaMinutes
) {
  const departure =
    toTimelineMinutes(
      flight.departure
    );

  if (departure === null) {
    return;
  }

  const boarding =
    toTimelineMinutes(
      flight.boarding
    );

  const newDeparture =
    departure + deltaMinutes;

  flight.departure =
    minutesToClockString(
      newDeparture
    );

  if (boarding !== null) {
    flight.boarding =
      minutesToClockString(
        boarding + deltaMinutes
      );
  } else {
    flight.boarding =
      minutesToClockString(
        newDeparture - 30
      );
  }
}


// ============================================================
// OCCUPANCY
// ============================================================

function occupancyWindow(flight) {
  const dep =
    toTimelineMinutes(
      flight.departure
    );

  if (dep === null) {
    return null;
  }

  const turnaroundStart =
    dep -
    CONFIG.TURNAROUND_MINUTES;

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
    (
      flight.status === 'DELAYED'
        ? 20
        : 0
    );

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


// ============================================================
// CONFLICT DETECTION
// ============================================================

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
        (
          toTimelineMinutes(
            a.departure
          ) ?? Infinity
        ) -
        (
          toTimelineMinutes(
            b.departure
          ) ?? Infinity
        )
    );

    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
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


// ============================================================
// AIRLINE HELPERS
// ============================================================

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


// ============================================================
// GATE + TIME SUGGESTIONS
// ============================================================

function gateHasConflict(
  flight,
  gateId,
  departureMinutes
) {
  const testFlight = {
    ...flight,

    gate: gateId,

    departure:
      minutesToClockString(
        departureMinutes
      ),

    boarding:
      minutesToClockString(
        departureMinutes - 30
      )
  };

  const testWindow =
    occupancyWindow(
      testFlight
    );

  if (!testWindow) {
    return true;
  }

  return FLIGHTS
    .filter(
      f =>
        f.id !== flight.id &&
        f.gate === gateId &&
        f.status !== 'CANCELLED' &&
        f.status !== 'DIVERTED'
    )
    .some(f => {
      const otherWindow =
        occupancyWindow(f);

      return (
        otherWindow &&
        windowsOverlap(
          testWindow,
          otherWindow
        )
      );
    });
}


function findNearestAvailableTime(
  flight,
  gateId,
  originalDeparture
) {
  // First try the current time.
  if (
    !gateHasConflict(
      flight,
      gateId,
      originalDeparture
    )
  ) {
    return {
      departure: originalDeparture,
      boarding:
        originalDeparture - 30,
      timeChanged: false,
      timeDifference: 0
    };
  }

  // Then search outward from the current time.
  for (
    let offset = INTERVAL_MIN;
    offset <= 180;
    offset += INTERVAL_MIN
  ) {
    const earlier =
      originalDeparture - offset;

    if (
      earlier >= TIMELINE_START_MIN &&
      !gateHasConflict(
        flight,
        gateId,
        earlier
      )
    ) {
      return {
        departure: earlier,
        boarding: earlier - 30,
        timeChanged: true,
        timeDifference: offset
      };
    }

    const later =
      originalDeparture + offset;

    if (
      later < TIMELINE_END_MIN &&
      !gateHasConflict(
        flight,
        gateId,
        later
      )
    ) {
      return {
        departure: later,
        boarding: later - 30,
        timeChanged: true,
        timeDifference: offset
      };
    }
  }

  return null;
}


function suggestGatesFor(
  flight,
  excludeGateId
) {
  const departure =
    toTimelineMinutes(
      flight.departure
    );

  if (departure === null) {
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

  const suggestions = [];

  candidates.forEach(gate => {
    const currentGate =
      GATE_BY_ID[
        excludeGateId
      ];

    const sameConcourse =
      currentGate &&
      gate.concourse ===
        currentGate.concourse;

    const distance =
      currentGate
        ? Math.abs(
            gate.num -
            currentGate.num
          )
        : 0;

    const gateScore =
      (
        sameConcourse
          ? 0
          : 1000
      ) +
      distance;

    const timeOption =
      findNearestAvailableTime(
        flight,
        gate.id,
        departure
      );

    if (!timeOption) {
      return;
    }

    suggestions.push({
      gate: gate.id,

      departure:
        timeOption.departure,

      boarding:
        timeOption.boarding,

      timeChanged:
        timeOption.timeChanged,

      timeDifference:
        timeOption.timeDifference,

      score:
        gateScore +
        timeOption.timeDifference * 0.1
    });
  });

  suggestions.sort(
    (a, b) =>
      a.score -
      b.score
  );

  return suggestions.slice(0, 3);
}


// ============================================================
// RENDER HELPERS
// ============================================================

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
    (
      f.flightNumber || ''
    )
      .toLowerCase()
      .includes(term) ||

    (
      f.gate || ''
    )
      .toLowerCase()
      .includes(term) ||

    (
      f.to || ''
    )
      .toLowerCase()
      .includes(term) ||

    (
      f.airline || ''
    )
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


// ============================================================
// FLIGHT CARD
// ============================================================

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
            flight.status === 'CANCELLED' ||
            flight.status === 'DIVERTED'
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
        ${escapeHtml(
          flight.flightNumber
        )}
      </span>

      <span class="fc-to">
        → ${escapeHtml(
          flight.to
        )}
      </span>
    </div>

    <div class="fc-times">
      <span>
        Board ${escapeHtml(
          format12HourTime(
            flight.boarding
          )
        )}
      </span>

      <span>
        Dep ${escapeHtml(
          format12HourTime(
            flight.departure
          )
        )}
      </span>
    </div>

    <div class="fc-status-line">
      <span class="fc-status-pill ${pillClass}">
        ${escapeHtml(
          pillLabel
        )}
      </span>
    </div>

    ${
      flight.comments
        ? `
          <div class="fc-comment">
            ${escapeHtml(
              flight.comments
            )}
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


  // ==========================================================
  // CLICK
  // ==========================================================

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


  // ==========================================================
  // GATE DRAG START
  // ==========================================================

  card.addEventListener(
    'dragstart',
    e => {
      if (
        e.target.closest(
          '.resize-handle'
        )
      ) {
        e.preventDefault();
        return;
      }

      ACTIVE_DRAG = {
        flightId:
          flight.id,

        gate:
          flight.gate,

        boarding:
          flight.boarding,

        departure:
          flight.departure
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


  card.addEventListener(
    'dragend',
    () => {
      card.classList.remove(
        'dragging'
      );

      card.classList.add(
        'was-dragged'
      );

      setTimeout(() => {
        card.classList.remove(
          'was-dragged'
        );

        ACTIVE_DRAG =
          null;
      }, 100);
    }
  );

  return card;
}


// ============================================================
// TIME HEADER
// ============================================================

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

    // Show every hour.
    if (mins % 60 === 0) {
      cell.textContent =
        minutesToClockString(
          mins
        );
    } else {
      cell.textContent =
        '';
    }

    header.appendChild(
      cell
    );
  }

  return header;
}


// ============================================================
// BOARD
// ============================================================

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

  board.innerHTML =
    '';

  const conflicts =
    computeConflicts();

  updateConflictBanner(
    conflicts
  );

  const scrollArea =
    document.createElement('div');

  scrollArea.className =
    'timeline-scroll';


  // ==========================================================
  // HEADER
  // ==========================================================

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


  // ==========================================================
  // CONCOURSES
  // ==========================================================

  CONCOURSES.forEach(
    concourse => {
      const gatesInConcourse =
        GATE_LIST.filter(
          g =>
            g.concourse ===
            concourse
        );

      const airlinesHere = [
        ...new Set(
          gatesInConcourse.map(
            g =>
              g.airline
          )
        )
      ];


      const labelRow =
        document.createElement('div');

      labelRow.className =
        'concourse-label-row';


      const labelCorner =
        document.createElement('div');

      labelCorner.className =
        'corner-cell concourse-corner';

      labelRow.appendChild(
        labelCorner
      );


      const labelBody =
        document.createElement('div');

      labelBody.className =
        'concourse-label-body';

      labelBody.style.width =
        TIMELINE_WIDTH + 'px';

      labelBody.innerHTML = `
        <span class="concourse-title">
          CONCOURSE ${escapeHtml(
            concourse
          )}
        </span>

        <span class="concourse-sub">
          ${escapeHtml(
            airlinesHere.join(
              ' · '
            )
          )}
        </span>
      `;

      labelRow.appendChild(
        labelBody
      );

      scrollArea.appendChild(
        labelRow
      );


      // ========================================================
      // GATES
      // ========================================================

      gatesInConcourse.forEach(
        gate => {
          const row =
            document.createElement('div');

          row.className =
            'timeline-row';


          const gateIdEl =
            document.createElement('div');

          gateIdEl.className =
            'gate-id-cell';

          gateIdEl.textContent =
            gate.id;


          const track =
            document.createElement('div');

          track.className =
            'gate-track';

          /*
            CRITICAL:
            The track is always the complete 24-hour
            operating day from 5 AM → 5 AM.
          */

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


          flightsHere.forEach(f => {
            const win =
              occupancyWindow(f);

            const card =
              renderFlightCard(
                f,
                conflicts.has(f.id)
              );

            if (win) {
              let left =
                minutesToX(
                  win.start
                );

              let right =
                minutesToX(
                  win.end
                );

              /*
                Keep cards inside the 5 AM → 5 AM
                operating-day timeline.
              */

              left =
                Math.max(
                  left,
                  0
                );

              right =
                Math.min(
                  right,
                  TIMELINE_WIDTH
                );

              let width =
                right - left;

              /*
                If a flight begins before 5 AM
                or extends beyond 5 AM, keep
                its visible portion on screen.
              */

              width =
                Math.max(
                  width,
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
          });


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

  setupBottomScrollButton();
}


// ============================================================
// RESIZE HANDLERS
//
// Pointer Events are used instead of old mouse-only handlers.
// This makes the resize handles much more reliable.
// ============================================================

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

  if (!leftHandle && !rightHandle) {
    return;
  }

  const pxPerMin =
    COL_WIDTH /
    INTERVAL_MIN;


  function startResize(
    e,
    isLeft
  ) {
    e.preventDefault();
    e.stopPropagation();

    card.draggable =
      false;

    card.classList.add(
      'resizing'
    );

    const startX =
      e.clientX;

    const baseLeft =
      parseFloat(
        card.style.left
      ) || 0;

    const baseWidth =
      parseFloat(
        card.style.width
      ) || 40;

    let currentX =
      startX;

    const handle =
      e.currentTarget;

    try {
      if (
        handle.setPointerCapture
      ) {
        handle.setPointerCapture(
          e.pointerId
        );
      }
    } catch (_) {}


    function onMove(ev) {
      currentX =
        ev.clientX;

      ev.preventDefault();

      const dx =
        ev.clientX -
        startX;


      if (isLeft) {
        let newLeft =
          baseLeft + dx;

        let newWidth =
          baseWidth - dx;

        if (newWidth < 30) {
          newWidth =
            30;

          newLeft =
            baseLeft +
            baseWidth -
            30;
        }

        newLeft =
          Math.max(
            0,
            newLeft
          );

        card.style.left =
          newLeft + 'px';

        card.style.width =
          newWidth + 'px';

      } else {
        let newWidth =
          baseWidth + dx;

        newWidth =
          Math.max(
            30,
            newWidth
          );

        newWidth =
          Math.min(
            TIMELINE_WIDTH -
              baseLeft,
            newWidth
          );

        card.style.width =
          newWidth + 'px';
      }
    }


    function onUp() {
      document.removeEventListener(
        'pointermove',
        onMove
      );

      document.removeEventListener(
        'pointerup',
        onUp
      );

      document.removeEventListener(
        'pointercancel',
        onUp
      );

      card.draggable =
        true;

      card.classList.remove(
        'resizing'
      );

      const dx =
        currentX -
        startX;

      let deltaMin =
        dx /
        pxPerMin;

      deltaMin =
        Math.round(
          deltaMin /
          INTERVAL_MIN
        ) *
        INTERVAL_MIN;

      if (
        deltaMin === 0
      ) {
        renderBoard();
        return;
      }


      // --------------------------------------------------------
      // LEFT HANDLE
      //
      // Manually change BOARDING only.
      // --------------------------------------------------------

      if (isLeft) {
        const boarding =
          toTimelineMinutes(
            flight.boarding
          );

        if (
          boarding !== null
        ) {
          flight.boarding =
            minutesToClockString(
              boarding +
              deltaMin
            );
        }
      }


      // --------------------------------------------------------
      // RIGHT HANDLE
      //
      // Change DEPARTURE.
      //
      // BOARDING MOVES WITH DEPARTURE.
      // --------------------------------------------------------

      else {
        changeDepartureTime(
          flight,
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
      'pointermove',
      onMove
    );

    document.addEventListener(
      'pointerup',
      onUp
    );

    document.addEventListener(
      'pointercancel',
      onUp
    );
  }


  if (leftHandle) {
    leftHandle.addEventListener(
      'pointerdown',
      e => {
        startResize(
          e,
          true
        );
      }
    );
  }


  if (rightHandle) {
    rightHandle.addEventListener(
      'pointerdown',
      e => {
        startResize(
          e,
          false
        );
      }
    );
  }
}


// ============================================================
// GATE DRAG / DROP
// ============================================================

function attachDropHandlers(
  track
) {
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


// ============================================================
// GATE DROP
// ============================================================

function handleGateDrop(
  flightId,
  newGate,
  gateOwner
) {
  const flight =
    FLIGHTS.find(
      f =>
        f.id ===
        flightId
    );

  if (!flight) {
    ACTIVE_DRAG =
      null;

    return;
  }

  if (
    flight.gate ===
    newGate
  ) {
    ACTIVE_DRAG =
      null;

    return;
  }


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
      ACTIVE_DRAG =
        null;

      renderBoard();

      return;
    }
  }


  const oldGate =
    flight.gate;

  /*
    GATE MOVE ONLY.

    Boarding and departure are deliberately
    untouched here.
  */

  flight.gate =
    newGate;

  ACTIVE_DRAG =
    null;

  renderBoard();


  if (SHEET_URL) {
    pushFlightToSheet(
      flight
    ).catch(err => {
      console.error(
        'Gate sync failed:',
        err
      );

      flight.gate =
        oldGate;

      renderBoard();

      alert(
        'Could not save the gate change to the sheet. The gate was reverted.'
      );
    });
  }
}


// ============================================================
// CONFLICT BANNER
// ============================================================

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

  if (
    conflicts.size ===
    0
  ) {
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
            f =>
              f.id ===
              id
          )
      )
      .filter(Boolean)
      .map(
        f =>
          f.flightNumber
      );

  banner.textContent =
    `⚠ ${conflicts.size} gate conflict${
      conflicts.size > 1
        ? 's'
        : ''
    }: ${names.join(
      ', '
    )} — reassign or adjust times`;
}


// ============================================================
// AIRLINE OPTIONS
// ============================================================

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
      g =>
        g.airline
    );

  const fromFlights =
    FLIGHTS.map(
      f =>
        f.airline
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
          `<option value="${escapeHtml(
            a
          )}">${escapeHtml(
            a
          )}</option>`
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
          `<option value="${escapeHtml(
            g.id
          )}">`
      )
      .join('');
}


// ============================================================
// TIME INPUT HELPERS
// ============================================================

function setTimeInputValue(
  id,
  value
) {
  const input =
    document.getElementById(id);

  if (!input) {
    return;
  }

  /*
    If the HTML uses <input type="time">,
    the browser requires HH:mm internally.

    If it is a normal text input,
    show 12-hour AM/PM.
  */

  if (
    input.type === 'time'
  ) {
    const mins =
      timeToMinutes(value);

    input.value =
      mins === null
        ? ''
        : minutesToTimeValue(mins);
  } else {
    input.value =
      format12HourTime(value);
  }
}


function getTimeInputValue(id) {
  const input =
    document.getElementById(id);

  if (!input) {
    return '';
  }

  return input.value;
}


function minutesToTimeValue(
  mins
) {
  mins =
    (
      (
        mins % 1440
      ) +
      1440
    ) % 1440;

  const h =
    Math.floor(
      mins / 60
    );

  const m =
    mins % 60;

  return (
    h.toString().padStart(2, '0') +
    ':' +
    m.toString().padStart(2, '0')
  );
}


// ============================================================
// SUGGESTION UI
// ============================================================

function renderSuggestions(
  flight,
  suggestions
) {
  const box =
    document.getElementById(
      'suggestBox'
    );

  if (!box) {
    return;
  }

  box.classList.remove(
    'hidden'
  );

  if (
    !suggestions.length
  ) {
    box.innerHTML = `
      <strong>
        No open gate/time combinations found.
      </strong>

      <br><br>

      You can still manually change the gate
      while keeping the current flight times.
    `;

    return;
  }


  box.innerHTML = `
    <div class="suggestion-heading">
      Suggested solutions for
      ${escapeHtml(
        flight.airline
      )}:
    </div>

    <div class="suggestion-list">

      ${suggestions
        .map(
          (suggestion, index) => {
            const newDeparture =
              minutesToClockString(
                suggestion.departure
              );

            const newBoarding =
              minutesToClockString(
                suggestion.boarding
              );

            return `
              <div
                class="suggestion-option"
                data-index="${index}"
              >

                <div>
                  <strong>
                    Gate ${escapeHtml(
                      suggestion.gate
                    )}
                  </strong>
                </div>

                ${
                  suggestion.timeChanged
                    ? `
                      <div>
                        New flight time:
                        <strong>
                          ${escapeHtml(
                            newDeparture
                          )}
                        </strong>
                      </div>

                      <div>
                        New boarding:
                        <strong>
                          ${escapeHtml(
                            newBoarding
                          )}
                        </strong>
                      </div>

                      <button
                        type="button"
                        class="suggest-use-time"
                        data-index="${index}"
                      >
                        Go to Gate ${
                          escapeHtml(
                            suggestion.gate
                          )
                        } + change time
                      </button>
                    `
                    : `
                      <div>
                        Current flight time works
                        at this gate.
                      </div>

                      <button
                        type="button"
                        class="suggest-use-time"
                        data-index="${index}"
                      >
                        Go to Gate ${
                          escapeHtml(
                            suggestion.gate
                          )
                        }
                      </button>
                    `
                }

                <button
                  type="button"
                  class="suggest-gate-only"
                  data-index="${index}"
                >
                  Gate only — keep current times
                </button>

              </div>
            `;
          }
        )
        .join('')}

    </div>

    <div class="suggestion-note">
      "Gate only" ALWAYS keeps the current
      boarding and departure times.
    </div>
  `;


  // ----------------------------------------------------------
  // GATE + TIME
  // ----------------------------------------------------------

  box
    .querySelectorAll(
      '.suggest-use-time'
    )
    .forEach(button => {
      button.addEventListener(
        'click',
        () => {
          const index =
            parseInt(
              button.dataset.index,
              10
            );

          const suggestion =
            suggestions[index];

          if (!suggestion) {
            return;
          }

          const gateInput =
            document.getElementById(
              'f_gate'
            );

          if (gateInput) {
            gateInput.value =
              suggestion.gate;
          }

          setTimeInputValue(
            'f_boarding',
            minutesToClockString(
              suggestion.boarding
            )
          );

          setTimeInputValue(
            'f_departure',
            minutesToClockString(
              suggestion.departure
            )
          );
        }
      );
    });


  // ----------------------------------------------------------
  // GATE ONLY
  // ----------------------------------------------------------

  box
    .querySelectorAll(
      '.suggest-gate-only'
    )
    .forEach(button => {
      button.addEventListener(
        'click',
        () => {
          const index =
            parseInt(
              button.dataset.index,
              10
            );

          const suggestion =
            suggestions[index];

          if (!suggestion) {
            return;
          }

          const gateInput =
            document.getElementById(
              'f_gate'
            );

          if (gateInput) {
            gateInput.value =
              suggestion.gate;
          }

          // IMPORTANT:
          // Boarding and departure are NOT changed.
        }
      );
    });
}


// ============================================================
// MODAL
// ============================================================

let MODAL_BOARDING_MANUAL =
  false;

let MODAL_LAST_DEPARTURE =
  '';


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
            f.id ===
            flightId
        )
      : null;

  if (
    isEdit &&
    !flight
  ) {
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
      : CONFIG.GATE_MAP[0]
          .airline;


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


  setTimeInputValue(
    'f_boarding',
    isEdit
      ? flight.boarding
      : ''
  );

  setTimeInputValue(
    'f_departure',
    isEdit
      ? flight.departure
      : ''
  );


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


  // Determine whether boarding was already
  // manually changed from the normal 30-minute rule.

  if (isEdit) {
    const dep =
      toTimelineMinutes(
        flight.departure
      );

    const boarding =
      toTimelineMinutes(
        flight.boarding
      );

    MODAL_BOARDING_MANUAL =
      dep !== null &&
      boarding !== null &&
      dep - boarding !== 30;

  } else {
    MODAL_BOARDING_MANUAL =
      false;
  }


  MODAL_LAST_DEPARTURE =
    getTimeInputValue(
      'f_departure'
    );


  // ==========================================================
  // SUGGESTIONS
  // ==========================================================

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

      renderSuggestions(
        flight,
        suggestions
      );
    }
  }

  modal.classList.remove(
    'hidden'
  );
}


function closeFlightModal() {
  const modal =
    document.getElementById(
      'flightModal'
    );

  if (modal) {
    modal.classList.add(
      'hidden'
    );
  }
}


// ============================================================
// LIVE MODAL TIME RELATIONSHIP
// ============================================================

const departureInput =
  document.getElementById(
    'f_departure'
  );

const boardingInput =
  document.getElementById(
    'f_boarding'
  );


if (boardingInput) {
  boardingInput.addEventListener(
    'input',
    () => {
      MODAL_BOARDING_MANUAL =
        true;
    }
  );

  boardingInput.addEventListener(
    'change',
    () => {
      MODAL_BOARDING_MANUAL =
        true;
    }
  );
}


if (departureInput) {
  departureInput.addEventListener(
    'input',
    () => {
      updateModalBoardingFromDeparture();
    }
  );

  departureInput.addEventListener(
    'change',
    () => {
      updateModalBoardingFromDeparture();
    }
  );
}


function updateModalBoardingFromDeparture() {
  const departure =
    getTimeInputValue(
      'f_departure'
    );

  const newDeparture =
    timeToMinutes(
      departure
    );

  if (
    newDeparture === null
  ) {
    return;
  }


  /*
    If the boarding time is still following
    the normal rule, keep it exactly 30 minutes
    before departure.
  */

  if (
    !MODAL_BOARDING_MANUAL
  ) {
    setTimeInputValue(
      'f_boarding',
      minutesToClockString(
        newDeparture - 30
      )
    );

    MODAL_LAST_DEPARTURE =
      departure;

    return;
  }


  /*
    If the user manually changed boarding,
    preserve their custom offset when departure moves.
  */

  const oldDeparture =
    timeToMinutes(
      MODAL_LAST_DEPARTURE
    );

  const currentBoarding =
    timeToMinutes(
      getTimeInputValue(
        'f_boarding'
      )
    );

  if (
    oldDeparture !== null &&
    currentBoarding !== null
  ) {
    const delta =
      newDeparture -
      oldDeparture;

    setTimeInputValue(
      'f_boarding',
      minutesToClockString(
        currentBoarding +
        delta
      )
    );
  }

  MODAL_LAST_DEPARTURE =
    departure;
}


// ============================================================
// ADD / EDIT FLIGHT
// ============================================================

const flightForm =
  document.getElementById(
    'flightForm'
  );


if (flightForm) {
  flightForm.addEventListener(
    'submit',
    e => {
      e.preventDefault();

      const id =
        document.getElementById(
          'f_id'
        ).value ||
        `f_${Date.now()}`;

      const existingIdx =
        FLIGHTS.findIndex(
          f =>
            f.id ===
            id
        );

      const previousFlight =
        existingIdx >= 0
          ? {
              ...FLIGHTS[
                existingIdx
              ]
            }
          : null;


      let boarding =
        format12HourTime(
          getTimeInputValue(
            'f_boarding'
          )
        );

      const departure =
        format12HourTime(
          getTimeInputValue(
            'f_departure'
          )
        );


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

        boarding,

        departure,

        status:
          document.getElementById(
            'f_status'
          ).value,

        comments:
          document.getElementById(
            'f_comments'
          ).value.trim()
      };


      // ========================================================
      // TIME RULE
      // ========================================================

      if (
        !previousFlight
      ) {
        if (
          flightData.departure &&
          !flightData.boarding
        ) {
          setBoardingFromDeparture(
            flightData
          );
        }
      }


      if (
        previousFlight
      ) {
        const oldDeparture =
          toTimelineMinutes(
            previousFlight.departure
          );

        const newDeparture =
          toTimelineMinutes(
            flightData.departure
          );

        const oldBoarding =
          toTimelineMinutes(
            previousFlight.boarding
          );

        const newBoarding =
          toTimelineMinutes(
            flightData.boarding
          );

        const departureChanged =
          oldDeparture !== null &&
          newDeparture !== null &&
          oldDeparture !==
            newDeparture;

        const boardingChanged =
          oldBoarding !== null &&
          newBoarding !== null &&
          oldBoarding !==
            newBoarding;

        /*
          Departure changed but boarding didn't:
          automatically make boarding 30 minutes prior.
        */

        if (
          departureChanged &&
          !boardingChanged
        ) {
          flightData.boarding =
            minutesToClockString(
              newDeparture - 30
            );
        }
      }


      // ========================================================
      // AIRLINE / GATE CHECK
      // ========================================================

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


      // ========================================================
      // SAVE LOCALLY
      // ========================================================

      if (
        existingIdx >= 0
      ) {
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


      // ========================================================
      // SAVE TO SHEET
      // ========================================================

      if (SHEET_URL) {
        pushFlightToSheet(
          flightData
        ).catch(err => {
          console.error(
            'Flight save failed:',
            err
          );

          if (
            existingIdx >= 0
          ) {
            FLIGHTS[
              existingIdx
            ] =
              previousFlight;
          } else {
            FLIGHTS =
              FLIGHTS.filter(
                f =>
                  f.id !==
                  id
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
}


// ============================================================
// DELETE FLIGHT
// ============================================================

const deleteFlightBtn =
  document.getElementById(
    'deleteFlightBtn'
  );


if (deleteFlightBtn) {
  deleteFlightBtn.addEventListener(
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
          f =>
            f.id ===
            id
        );

      FLIGHTS =
        FLIGHTS.filter(
          f =>
            f.id !==
            id
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

          if (
            deletedFlight
          ) {
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
}


// ============================================================
// MODAL CONTROLS
// ============================================================

const addFlightBtn =
  document.getElementById(
    'addFlightBtn'
  );

if (addFlightBtn) {
  addFlightBtn.addEventListener(
    'click',
    () =>
      openFlightModal(
        null
      )
  );
}


const modalClose =
  document.getElementById(
    'modalClose'
  );

if (modalClose) {
  modalClose.addEventListener(
    'click',
    closeFlightModal
  );
}


const modalCancel =
  document.getElementById(
    'modalCancel'
  );

if (modalCancel) {
  modalCancel.addEventListener(
    'click',
    closeFlightModal
  );
}


// ============================================================
// SEARCH / FILTER
// ============================================================

const searchBox =
  document.getElementById(
    'searchBox'
  );

if (searchBox) {
  searchBox.addEventListener(
    'input',
    e => {
      searchTerm =
        e.target.value;

      renderBoard();
    }
  );
}


const statusFilter =
  document.getElementById(
    'statusFilter'
  );

if (statusFilter) {
  statusFilter.addEventListener(
    'change',
    e => {
      statusFilterVal =
        e.target.value;

      renderBoard();
    }
  );
}


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


function syncTimeText() {
  return new Date().toLocaleTimeString(
    [],
    {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }
  );
}


// ============================================================
// LOAD FLIGHTS
// ============================================================

async function loadFromSheet() {
  if (!SHEET_URL) {
    return;
  }

  setSyncStatus(
    'offline',
    '● Connecting…'
  );

  try {
    const res =
      await fetch(
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

    const data =
      await res.json();

    if (
      !Array.isArray(data)
    ) {
      throw new Error(
        'Invalid response from Google Sheet'
      );
    }

    FLIGHTS =
      data.map(
        rowToFlight
      );

    setSyncStatus(
      'online',
      `● Synced with sheet (${syncTimeText()})`
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

    if (
      !FLIGHTS.length
    ) {
      FLIGHTS =
        CONFIG.SAMPLE_FLIGHTS.map(
          f => ({
            ...f,

            boarding:
              format12HourTime(
                f.boarding
              ),

            departure:
              format12HourTime(
                f.departure
              )
          })
        );
    }

    renderBoard();
  }
}


// ============================================================
// SHEET → FLIGHT
// ============================================================

function rowToFlight(row) {
  const departure =
    format12HourTime(
      row[
        'DEPARTURE TIME:'
      ] || ''
    );

  let boarding =
    format12HourTime(
      row[
        'BOARDING TIME:'
      ] || ''
    );


  if (
    !boarding &&
    departure
  ) {
    const dep =
      timeToMinutes(
        departure
      );

    if (
      dep !== null
    ) {
      boarding =
        minutesToClockString(
          dep - 30
        );
    }
  }


  return {
    id:
      row.id ||
      row[
        'FLIGHT NUMBER'
      ],

    airline:
      row[
        'AIRLINE'
      ] || '',

    flightNumber:
      row[
        'FLIGHT NUMBER'
      ] || '',

    to:
      row[
        'TO:'
      ] || '',

    gate:
      row[
        'GATE:'
      ] || '',

    boarding,

    departure,

    status:
      row[
        'STATUS:'
      ] ||
      row[
        'STATUS'
      ] ||
      'ON TIME',

    comments:
      row[
        'COMMENTS:'
      ] ||
      row[
        'COMMENTS'
      ] ||
      ''
  };
}


// ============================================================
// FLIGHT → SHEET
// ============================================================

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
      format12HourTime(
        flight.boarding
      ),

    'DEPARTURE TIME:':
      format12HourTime(
        flight.departure
      ),

    'STATUS:':
      flight.status,

    'COMMENTS':
      flight.comments
  };
}


// ============================================================
// SAVE FLIGHT
// ============================================================

async function pushFlightToSheet(
  flight
) {
  if (!SHEET_URL) {
    return;
  }

  setSyncStatus(
    'online',
    '● Saving…'
  );

  const row =
    flightToRow(
      flight
    );

  const url =
    SHEET_URL +
    '?action=upsert&row=' +
    encodeURIComponent(
      JSON.stringify(row)
    ) +
    '&_=' +
    Date.now();

  try {
    const res =
      await fetch(
        url,
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

    const data =
      await res.json();

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
        'Google Sheet did not confirm the save.'
      );
    }

    setSyncStatus(
      'online',
      `● Synced with sheet (${syncTimeText()})`
    );

    return data;

  } catch (err) {
    console.error(
      'Google Sheet save failed:',
      err
    );

    setSyncStatus(
      'error',
      '● Sheet connection failed'
    );

    throw err;
  }
}


// ============================================================
// DELETE FROM SHEET
// ============================================================

async function deleteFlightFromSheet(
  id
) {
  if (!SHEET_URL) {
    return;
  }

  setSyncStatus(
    'online',
    '● Saving…'
  );

  const url =
    SHEET_URL +
    '?action=delete&id=' +
    encodeURIComponent(id) +
    '&_=' +
    Date.now();

  try {
    const res =
      await fetch(
        url,
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

    const data =
      await res.json();

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
      `● Synced with sheet (${syncTimeText()})`
    );

    return data;

  } catch (err) {
    console.error(
      'Google Sheet delete failed:',
      err
    );

    setSyncStatus(
      'error',
      '● Sheet connection failed'
    );

    throw err;
  }
}


// ============================================================
// SHEET CONNECTION UI
// ============================================================

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


// ============================================================
// ALWAYS-VISIBLE BOTTOM BUTTON
// ============================================================

function setupBottomScrollButton() {
  let button =
    document.getElementById(
      'bottomScrollButton'
    );

  if (!button) {
    button =
      document.createElement(
        'button'
      );

    button.id =
      'bottomScrollButton';

    button.type =
      'button';

    button.textContent =
      '↓ Bottom';

    document.body.appendChild(
      button
    );
  }

  button.style.position =
    'fixed';

  button.style.right =
    '20px';

  button.style.bottom =
    '20px';

  button.style.zIndex =
    '99999';

  button.style.display =
    'block';

  button.style.visibility =
    'visible';

  button.style.opacity =
    '1';

  button.style.cursor =
    'pointer';

  if (
    button.dataset.bottomReady ===
    'true'
  ) {
    return;
  }

  button.dataset.bottomReady =
    'true';

  button.addEventListener(
    'click',
    () => {
      const scrollArea =
        document.querySelector(
          '.timeline-scroll'
        );

      if (scrollArea) {
        scrollArea.scrollTo({
          top:
            scrollArea.scrollHeight,

          behavior:
            'smooth'
        });
      } else {
        window.scrollTo({
          top:
            document.documentElement
              .scrollHeight,

          behavior:
            'smooth'
        });
      }
    }
  );
}


// ============================================================
// CLOCK
// ============================================================

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
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }
    );
}


setInterval(
  tickClock,
  1000
);


// ============================================================
// INIT
// ============================================================

function init() {
  populateAirlineOptions();

  populateGateDatalist();

  tickClock();

  setupBottomScrollButton();

  loadFromSheet();

  setInterval(
    renderBoard,
    60000
  );
}


init();
