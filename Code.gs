const SHEET_ID = '1CPmhAJ6Pb0wNQKLW3Q8_Nu7nmRtfRL-yGgqqJdPCVIY';
const SHEET_NAME = 'flights';
const BASELINE_SHEET_NAME = '_gateops_baseline';
const ID_COLUMN = 'GATEOPS ID';
const EXTRA_COLUMNS = ['GATE BLOCK START:', 'DELAY TAG:', ID_COLUMN];

function doGet(e) {
  try {
    const action = e && e.parameter && e.parameter.action ? e.parameter.action : 'list';
    ensureSystemReady();

    if (action === 'list') return jsonResponse(getAllRowsWithBaseline());

    if (action === 'upsert') {
      if (!e.parameter.row) throw new Error('Missing row data.');
      const row = JSON.parse(e.parameter.row);
      const id = upsertRow(row);
      return jsonResponse({ ok: true, id });
    }

    if (action === 'delete') {
      if (!e.parameter.id) throw new Error('Missing flight ID.');
      deleteRowById(e.parameter.id);
      return jsonResponse({ ok: true });
    }

    if (action === 'reset') {
      const carryovers = e.parameter.carryovers ? JSON.parse(e.parameter.carryovers) : [];
      resetOperationalSheet(carryovers);
      return jsonResponse({ ok: true, rows: getAllRowsWithBaseline() });
    }

    if (action === 'refreshBaseline') {
      refreshBaselineFromLive();
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ error: err && err.message ? err.message : String(err) });
  }
}

function doPost(e) {
  try {
    ensureSystemReady();
    const body = JSON.parse(e.postData.contents || '{}');

    if (body.action === 'upsert') {
      const id = upsertRow(body.row);
      return jsonResponse({ ok: true, id });
    }
    if (body.action === 'delete') {
      deleteRowById(body.id);
      return jsonResponse({ ok: true });
    }
    if (body.action === 'list') return jsonResponse(getAllRowsWithBaseline());
    if (body.action === 'reset') {
      resetOperationalSheet(body.carryovers || []);
      return jsonResponse({ ok: true, rows: getAllRowsWithBaseline() });
    }
    if (body.action === 'refreshBaseline') {
      refreshBaselineFromLive();
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: 'Unknown action: ' + body.action });
  } catch (err) {
    return jsonResponse({ error: err && err.message ? err.message : String(err) });
  }
}

function getSpreadsheet() {
  return SpreadsheetApp.openById(SHEET_ID);
}

function getLiveSheet() {
  const sheet = getSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('No tab named "' + SHEET_NAME + '" found.');
  return sheet;
}

function getHeaders(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
}

function ensureSystemReady() {
  const sheet = getLiveSheet();
  ensureSchema(sheet);
  ensureIds(sheet);
  ensureBaselineExists();
}

function ensureSchema(sheet) {
  let headers = getHeaders(sheet);
  EXTRA_COLUMNS.forEach(header => {
    if (!headers.includes(header)) {
      const col = sheet.getLastColumn() + 1;
      sheet.getRange(1, col).setValue(header);
      headers.push(header);
    }
  });

  const idIndex = headers.indexOf(ID_COLUMN) + 1;
  if (idIndex > 0) {
    try { sheet.hideColumns(idIndex); } catch (_) {}
  }
}

function ensureIds(sheet) {
  const headers = getHeaders(sheet);
  const idIndex = headers.indexOf(ID_COLUMN);
  const flightIndex = headers.indexOf('FLIGHT NUMBER');
  if (idIndex === -1 || flightIndex === -1) throw new Error('Required columns are missing.');

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const flightValues = sheet.getRange(2, flightIndex + 1, lastRow - 1, 1).getValues();
  const idValues = sheet.getRange(2, idIndex + 1, lastRow - 1, 1).getValues();
  let changed = false;
  for (let i = 0; i < flightValues.length; i++) {
    if (String(flightValues[i][0]).trim() && !String(idValues[i][0]).trim()) {
      idValues[i][0] = Utilities.getUuid();
      changed = true;
    }
  }
  // Only write the ID column. Never rewrite the image/formula columns.
  if (changed) sheet.getRange(2, idIndex + 1, idValues.length, 1).setValues(idValues);
}

function ensureBaselineExists() {
  const ss = getSpreadsheet();
  let baseline = ss.getSheetByName(BASELINE_SHEET_NAME);
  if (baseline) return;

  const live = getLiveSheet();
  baseline = ss.insertSheet(BASELINE_SHEET_NAME);
  live.getDataRange().copyTo(baseline.getRange(1, 1), { contentsOnly: false });
  try { baseline.hideSheet(); } catch (_) {}
}

function refreshBaselineFromLive() {
  const ss = getSpreadsheet();
  const live = getLiveSheet();
  let baseline = ss.getSheetByName(BASELINE_SHEET_NAME);
  if (!baseline) baseline = ss.insertSheet(BASELINE_SHEET_NAME);
  baseline.clear();
  live.getDataRange().copyTo(baseline.getRange(1, 1), { contentsOnly: false });
  try { baseline.hideSheet(); } catch (_) {}
}

function readRows(sheet) {
  const headers = getHeaders(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values
    .filter(row => row.some(v => String(v).trim() !== ''))
    .map(row => {
      const obj = {};
      headers.forEach((header, i) => obj[header] = formatCell(row[i]));
      return obj;
    });
}

function getAllRowsWithBaseline() {
  const liveRows = readRows(getLiveSheet());
  const baselineSheet = getSpreadsheet().getSheetByName(BASELINE_SHEET_NAME);
  const baselineRows = baselineSheet ? readRows(baselineSheet) : [];
  const baseById = new Map(baselineRows.map(r => [String(r[ID_COLUMN] || ''), r]));

  return liveRows.map(row => {
    const base = baseById.get(String(row[ID_COLUMN] || '')) || null;
    return Object.assign({}, row, {
      __BASE_GATE: base ? base['GATE:'] : null,
      __BASE_BOARDING: base ? base['BOARDING TIME:'] : null,
      __BASE_DEPARTURE: base ? base['DEPARTURE TIME:'] : null,
      __BASE_STATUS: base ? base['STATUS:'] : null,
      __BASE_COMMENTS: base ? base['COMMENTS'] : null,
      __BASE_GATE_START: base ? base['GATE BLOCK START:'] : null,
      __IS_BASELINE: !!base,
    });
  });
}

function formatCell(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'h:mm a');
  }
  return value;
}

function findRowIndexById(sheet, id) {
  const headers = getHeaders(sheet);
  const idIndex = headers.indexOf(ID_COLUMN);
  if (idIndex === -1) throw new Error('Column "' + ID_COLUMN + '" was not found.');
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const values = sheet.getRange(2, idIndex + 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === String(id).trim()) return i + 2;
  }
  return -1;
}

function upsertRow(rowObj) {
  if (!rowObj || typeof rowObj !== 'object') throw new Error('Invalid row data.');
  const sheet = getLiveSheet();
  const headers = getHeaders(sheet);

  let id = String(rowObj[ID_COLUMN] || rowObj.id || '').trim();
  if (!id) id = Utilities.getUuid();
  rowObj[ID_COLUMN] = id;

  const rowIndex = findRowIndexById(sheet, id);
  if (rowIndex === -1) {
    const rowValues = headers.map(header => Object.prototype.hasOwnProperty.call(rowObj, header) ? rowObj[header] : '');
    sheet.appendRow(rowValues);
    return id;
  }

  Object.keys(rowObj).forEach(header => {
    const columnIndex = headers.indexOf(header);
    if (columnIndex === -1) return;
    sheet.getRange(rowIndex, columnIndex + 1).setValue(rowObj[header]);
  });
  return id;
}

function deleteRowById(id) {
  if (!id) throw new Error('Missing flight ID.');
  const sheet = getLiveSheet();
  const rowIndex = findRowIndexById(sheet, id);
  if (rowIndex !== -1) sheet.deleteRow(rowIndex);
}

function resetOperationalSheet(carryovers) {
  const ss = getSpreadsheet();
  const live = getLiveSheet();
  const baseline = ss.getSheetByName(BASELINE_SHEET_NAME);
  if (!baseline) throw new Error('Baseline schedule is missing.');

  live.clear();
  baseline.getDataRange().copyTo(live.getRange(1, 1), { contentsOnly: false });
  ensureSchema(live);
  ensureIds(live);

  (carryovers || []).forEach(row => {
    const copy = Object.assign({}, row);
    copy[ID_COLUMN] = copy[ID_COLUMN] || Utilities.getUuid();
    upsertRow(copy);
  });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
