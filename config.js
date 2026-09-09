const CONFIG = {
  TIMELINE_START: "05:00",
  TIMELINE_END: "29:00",
  INTERVAL_MINUTES: 15,
  COLUMN_WIDTH_PX: 60,

  DAILY_RESET_HOUR: 5,
  TURNAROUND_MINUTES: 90,

  // Required operational approvals.
  TAXI_REQUEST_LEAD_MINUTES: 15,
  PUSHBACK_REQUEST_LEAD_MINUTES: 10,
  APPROVAL_GRACE_MINUTES: 5,
  APPROVAL_DELAY_STEP_MINUTES: 5,

  // Random simulation timing. The engine uses a variable timeout instead of a fixed tick.
  RANDOM_EVENT_MIN_SECONDS: 25,
  RANDOM_EVENT_MAX_SECONDS: 110,
  STORM_EVENT_MIN_SECONDS: 15,
  STORM_EVENT_MAX_SECONDS: 55,
  WINDY_EVENT_MIN_SECONDS: 20,
  WINDY_EVENT_MAX_SECONDS: 80,

  // Weather only evaluates the current hour. If the condition continues into
  // the next hour, that hour is evaluated separately.
  STORM_DELAY_MIN_MINUTES: 10,
  STORM_DELAY_MAX_MINUTES: 35,
  STORM_AFFECT_CHANCE: 0.42,
  WINDY_AFFECT_CHANCE: 0.16,

  CONFLICT_SEARCH_MAX_MINUTES: 120,

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

  AIRLINE_COLORS: {
    UNITED: "#3E7BFA", AVELO: "#8B5CF6", AMERICAN: "#E5484D",
    JETBLUE: "#2DB4C4", ALASKA: "#4F7BFF", SOUTHWEST: "#F5B942",
    BREEZE: "#4CC38A", DELTA: "#8A2BE2", FRONTIER: "#3AAA35",
    SPIRIT: "#F5D400", ALLEGIANT: "#F5842A", "SUN COUNTRY": "#3E5CE0",
    HAWAIIAN: "#C4457A",
  },

  SAMPLE_FLIGHTS: [
    { id: "s1", airline: "UNITED", flightNumber: "UA 1842", to: "DEN", gate: "A3", boarding: "8:10 AM", departure: "8:40 AM", status: "ON TIME", comments: "" },
    { id: "s2", airline: "UNITED", flightNumber: "UA 512", to: "ORD", gate: "A3", boarding: "9:15 AM", departure: "9:45 AM", status: "ON TIME", comments: "" },
  ],
};
