/* ============================================================
   GATE OPS BOARD — CONFIGURATION
   Edit this file to match your airport. No other file should
   need to change for basic reconfiguration.
   ============================================================ */

const CONFIG = {

  // Timeline grid settings — controls the spreadsheet-style view where
  // time runs across the top in intervals and gates run down the side.
  TIMELINE_START: "05:00",   // earliest time column shown
  TIMELINE_END: "29:00",     // latest time column shown — 29:00 = 5:00 AM the next day, so overnight flights (12:00 AM, 1:30 AM, etc.) have room to display after 11:59 PM instead of being cut off
  INTERVAL_MINUTES: 15,      // width of each time column, in minutes
  COLUMN_WIDTH_PX: 60,       // pixel width of each 15-min column — widen if labels feel cramped

  // ---- Live simulation settings (ephemeral — never written to the sheet) ----
  SIM_TICK_SECONDS: 6,          // how often the simulation checks for new events / weather effects
  EVENT_SPAWN_CHANCE: 0.35,     // chance per tick that a new ATC request spawns on an eligible flight
  EVENT_RESPONSE_SECONDS: 25,   // how long you have to Accept before it auto-extends
  EVENT_EXTEND_MINUTES: 15,     // how much the block grows if an event isn't accepted in time
  STORM_DELAY_CHANCE: 0.12,     // per-tick chance an on-time flight gets weather-delayed during a storm
  DAILY_RESET_HOUR: 5,          // operational day boundary — everything ephemeral resets at 5:00 AM

  // How many minutes before DEPARTURE TIME the aircraft is considered to
  // occupy the gate, used as a fallback when BOARDING TIME can't be read.
  // Also sets the minimum block length even when boarding is close to
  // departure. 90 = 1.5 hours.
  TURNAROUND_MINUTES: 90,

  // Gate ranges and which airline they belong to.
  // "start"/"end" are used to expand into individual gate IDs,
  // e.g. A1, A2, ... A27. For single gates, set start === end.
  GATE_MAP: [
    { concourse: "A", start: 1,  end: 27, airline: "UNITED" },
    { concourse: "A", start: 28, end: 30, airline: "AVELO" },
    { concourse: "B", start: 1,  end: 14, airline: "AMERICAN" },
    { concourse: "B", start: 15, end: 24, airline: "JETBLUE" },
    { concourse: "B", start: 25, end: 30, airline: "ALASKA" },
    { concourse: "C", start: 1,  end: 26, airline: "SOUTHWEST" },
    { concourse: "C", start: 27, end: 30, airline: "BREEZE" },
    { concourse: "D", start: 1,  end: 19, airline: "DELTA" },
    { concourse: "D", start: 20, end: 29, airline: "FRONTIER" },
    { concourse: "D", start: 30, end: 35, airline: "SPIRIT" },
    { concourse: "D", start: 36, end: 40, airline: "ALLEGIANT" },
    { concourse: "D", start: 41, end: 41, airline: "SUN COUNTRY" },
    { concourse: "D", start: 42, end: 45, airline: "HAWAIIAN" },
  ],

  // Airline display colors (used as a small left-edge stripe on
  // each flight card so a concourse full of one airline's own
  // flights is still easy to scan). Pick any hex you like.
  AIRLINE_COLORS: {
    UNITED:      "#3E7BFA",
    AVELO:       "#8B5CF6",
    AMERICAN:    "#E5484D",
    JETBLUE:     "#2DB4C4",
    ALASKA:      "#4F7BFF",
    SOUTHWEST:   "#F5B942",
    BREEZE:      "#4CC38A",
    DELTA:       "#8A2BE2",
    FRONTIER:    "#3AAA35",
    SPIRIT:      "#F5D400",
    ALLEGIANT:   "#F5842A",
    "SUN COUNTRY": "#3E5CE0",
    HAWAIIAN:    "#C4457A",
  },

  // Sample flights so the board is populated the first time
  // someone opens the page, before a sheet is connected.
  // These follow your sheet columns:
  // AIRLINE, FLIGHT NUMBER, TO:, GATE:, BOARDING TIME:, DEPARTURE TIME:, STATUS:, COMMENTS
  SAMPLE_FLIGHTS: [
    { id: "s1", airline: "UNITED",    flightNumber: "UA 1842", to: "DEN", gate: "A3",  boarding: "08:10", departure: "08:40", status: "ON TIME", comments: "" },
    { id: "s2", airline: "UNITED",    flightNumber: "UA 512",  to: "ORD", gate: "A3",  boarding: "09:15", departure: "09:45", status: "ON TIME", comments: "" },
    { id: "s3", airline: "AMERICAN",  flightNumber: "AA 2210", to: "DFW", gate: "B4",  boarding: "08:20", departure: "08:55", status: "DELAYED", comments: "Late inbound aircraft" },
    { id: "s4", airline: "AMERICAN",  flightNumber: "AA 88",   to: "PHX", gate: "B4",  boarding: "09:00", departure: "09:30", status: "ON TIME", comments: "" },
    { id: "s5", airline: "SOUTHWEST", flightNumber: "WN 305",  to: "LAS", gate: "C6",  boarding: "07:50", departure: "08:20", status: "BOARDING", comments: "" },
    { id: "s6", airline: "DELTA",     flightNumber: "DL 1190", to: "ATL", gate: "D2",  boarding: "08:30", departure: "09:05", status: "ON TIME", comments: "" },
    { id: "s7", airline: "FRONTIER",  flightNumber: "F9 640",  to: "MCO", gate: "D22", boarding: "10:00", departure: "10:30", status: "CANCELLED", comments: "Mechanical" },
    { id: "s8", airline: "SPIRIT",    flightNumber: "NK 951",  to: "LAX", gate: "D31", boarding: "08:45", departure: "09:15", status: "ON TIME", comments: "" },
  ],
};
