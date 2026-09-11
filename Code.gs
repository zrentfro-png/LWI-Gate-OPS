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
      SpreadsheetApp.flush();
      return jsonResponse({ ok: true, id, row: getRowById(id) });
    }

    if (action === 'bulkUpdate') {
      if (!e.parameter.rows) throw new Error('Missing rows data.');
      const rows = JSON.parse(e.parameter.rows);
      const result = bulkUpdateExistingRows(rows);
      SpreadsheetApp.flush();
      return jsonResponse({ ok: true, updated: result.updated, failed: result.failed, errors: result.errors });
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
      SpreadsheetApp.flush();
      return jsonResponse({ ok: true, id, row: getRowById(id) });
    }
    if (body.action === 'bulkUpdate') {
      const result = bulkUpdateExistingRows(body.rows || []);
      SpreadsheetApp.flush();
      return jsonResponse({ ok: true, updated: result.updated, failed: result.failed, errors: result.errors });
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
  // Existing rows can be addressed safely by synthetic row_N keys when the
  // hidden GATEOPS ID column is blank, so loading/saving no longer depends on
  // writing hundreds of IDs first.
  removeDuplicateRowsById(sheet);
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
  if (idIndex === -1) throw new Error('Required column "' + ID_COLUMN + '" is missing.');

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return;

  // Read all existing rows so ID repair does not depend on one particular
  // header spelling. Any non-empty existing row gets a durable ID.
  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const idValues = sheet.getRange(2, idIndex + 1, lastRow - 1, 1).getValues();
  let changed = false;

  for (let i = 0; i < values.length; i++) {
    const rowHasData = values[i].some((value, colIndex) => {
      // Ignore the ID column itself when deciding whether this is a real row.
      if (colIndex === idIndex) return false;
      return String(value ?? '').trim() !== '';
    });
    if (rowHasData && !String(idValues[i][0] || '').trim()) {
      idValues[i][0] = Utilities.getUuid();
      changed = true;
    }
  }

  // Only write the hidden ID column. Existing schedule/image/formula cells
  // are never rewritten by this repair.
  if (changed) {
    sheet.getRange(2, idIndex + 1, idValues.length, 1).setValues(idValues);
    SpreadsheetApp.flush();
  }
}

function removeDuplicateRowsById(sheet) {
  const headers = getHeaders(sheet);
  const idIndex = headers.indexOf(ID_COLUMN);
  if (idIndex === -1) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return;

  const ids = sheet.getRange(2, idIndex + 1, lastRow - 1, 1).getValues();
  const seen = new Set();
  const duplicateRows = [];
  for (let i = 0; i < ids.length; i++) {
    const id = String(ids[i][0] || '').trim();
    if (!id) continue;
    if (seen.has(id)) duplicateRows.push(i + 2);
    else seen.add(id);
  }

  // Delete bottom-up so row numbers remain valid. The first occurrence is
  // authoritative because all normal upserts update that row in place.
  for (let i = duplicateRows.length - 1; i >= 0; i--) {
    sheet.deleteRow(duplicateRows[i]);
  }
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
    .map((row, index) => {
      if (!row.some(v => String(v).trim() !== '')) return null;
      const obj = {};
      headers.forEach((header, i) => obj[header] = formatCell(row[i]));
      obj.__ROW_NUMBER = index + 2;
      // If the hidden durable ID is blank, expose a synthetic key tied to this
      // existing row. It can update the row but can never create a new one.
      if (!String(obj[ID_COLUMN] || '').trim()) obj[ID_COLUMN] = `row_${index + 2}`;
      return obj;
    })
    .filter(Boolean);
}

function getAllRowsWithBaseline() {
  const liveRows = readRows(getLiveSheet());
  const baselineSheet = getSpreadsheet().getSheetByName(BASELINE_SHEET_NAME);
  const baselineRows = baselineSheet ? readRows(baselineSheet) : [];
  const baseById = new Map(baselineRows.map(r => [String(r[ID_COLUMN] || ''), r]));
  const baseByRow = new Map(baselineRows.map(r => [Number(r.__ROW_NUMBER), r]));

  return liveRows.map(row => {
    const rowId = String(row[ID_COLUMN] || '');
    const base = baseById.get(rowId) || baseByRow.get(Number(row.__ROW_NUMBER)) || null;
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
  const rawId = String(id || '').trim();

  // Synthetic row key fallback for existing rows whose GATEOPS ID is blank.
  const rowMatch = /^row_(\d+)$/.exec(rawId);
  if (rowMatch) {
    const rowNumber = Number(rowMatch[1]);
    if (Number.isInteger(rowNumber) && rowNumber >= 2 && rowNumber <= sheet.getLastRow()) {
      return rowNumber;
    }
    return -1;
  }

  const headers = getHeaders(sheet);
  const idIndex = headers.indexOf(ID_COLUMN);
  if (idIndex === -1) throw new Error('Column "' + ID_COLUMN + '" was not found.');
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const values = sheet.getRange(2, idIndex + 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === rawId) return i + 2;
  }
  return -1;
}


function getRowById(id) {
  const sheet = getLiveSheet();
  const rowIndex = findRowIndexById(sheet, id);
  if (rowIndex === -1) throw new Error('Could not verify updated row for GATEOPS ID "' + id + '".');
  const headers = getHeaders(sheet);
  const values = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
  const obj = {};
  headers.forEach((header, i) => obj[header] = formatCell(values[i]));
  if (!String(obj[ID_COLUMN] || '').trim()) obj[ID_COLUMN] = String(id);
  obj.__ROW_NUMBER = rowIndex;
  return obj;
}

function upsertRow(rowObj) {
  if (!rowObj || typeof rowObj !== 'object') throw new Error('Invalid row data.');
  const sheet = getLiveSheet();
  const headers = getHeaders(sheet);

  const id = String(rowObj[ID_COLUMN] || rowObj.id || '').trim();
  if (!id) throw new Error('Missing GATEOPS ID. New flight rows are not allowed.');

  const rowIndex = findRowIndexById(sheet, id);
  if (rowIndex === -1) {
    throw new Error('Unknown GATEOPS ID "' + id + '". New flight rows are not allowed; only existing rows may be updated.');
  }

  const allowedHeaders = ['GATE:', 'BOARDING TIME:', 'DEPARTURE TIME:', 'STATUS:', 'COMMENTS', 'GATE BLOCK START:', 'DELAY TAG:'];
  allowedHeaders.forEach(header => {
    if (!Object.prototype.hasOwnProperty.call(rowObj, header)) return;
    const columnIndex = headers.indexOf(header);
    if (columnIndex === -1) return;
    sheet.getRange(rowIndex, columnIndex + 1).setValue(rowObj[header]);
  });

  return id;
}

function bulkUpdateExistingRows(rows) {
  if (!Array.isArray(rows)) throw new Error('Invalid rows data.');

  const sheet = getLiveSheet();
  const headers = getHeaders(sheet);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return { updated: 0, failed: 0, errors: [] };

  const allowedHeaders = [
    'GATE:',
    'BOARDING TIME:',
    'DEPARTURE TIME:',
    'STATUS:',
    'COMMENTS',
    'GATE BLOCK START:',
    'DELAY TAG:'
  ];

  const allowedIndexes = {};
  allowedHeaders.forEach(header => {
    const idx = headers.indexOf(header);
    if (idx !== -1) allowedIndexes[header] = idx;
  });

  const allValues = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const touchedRows = new Set();
  let updated = 0;
  let failed = 0;
  const errors = [];

  rows.forEach(rowObj => {
    try {
      if (!rowObj || typeof rowObj !== 'object') throw new Error('Invalid row data.');
      const id = String(rowObj[ID_COLUMN] || rowObj.id || '').trim();
      if (!id) throw new Error('Missing GATEOPS ID.');

      const rowIndex = findRowIndexById(sheet, id);
      if (rowIndex === -1) throw new Error('Unknown GATEOPS ID "' + id + '".');

      const arrayIndex = rowIndex - 2;
      Object.keys(allowedIndexes).forEach(header => {
        if (!Object.prototype.hasOwnProperty.call(rowObj, header)) return;
        allValues[arrayIndex][allowedIndexes[header]] = rowObj[header];
      });

      touchedRows.add(rowIndex);
      updated++;
    } catch (err) {
      failed++;
      if (errors.length < 10) errors.push(err && err.message ? err.message : String(err));
    }
  });

  // Write only the operational columns, one column at a time, across touched row ranges.
  // This avoids rewriting static roster/image/formula columns like AAAAIRLINE.
  if (touchedRows.size) {
    const sortedRows = Array.from(touchedRows).sort((a, b) => a - b);

    Object.keys(allowedIndexes).forEach(header => {
      const colIndex = allowedIndexes[header];
      let rangeStart = null;
      let previous = null;

      function flushRange(startRow, endRow) {
        if (startRow === null) return;
        const values = [];
        for (let rowNum = startRow; rowNum <= endRow; rowNum++) {
          values.push([allValues[rowNum - 2][colIndex]]);
        }
        sheet.getRange(startRow, colIndex + 1, values.length, 1).setValues(values);
      }

      sortedRows.forEach(rowNum => {
        if (rangeStart === null) {
          rangeStart = rowNum;
          previous = rowNum;
          return;
        }
        if (rowNum === previous + 1) {
          previous = rowNum;
          return;
        }
        flushRange(rangeStart, previous);
        rangeStart = rowNum;
        previous = rowNum;
      });
      flushRange(rangeStart, previous);
    });
  }

  return { updated, failed, errors };
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

  // Never append carryover rows. This Sheet is an authoritative fixed roster:
  // reset may only restore/update rows that already exist in the baseline/live sheet.
  (carryovers || []).forEach(row => {
    const copy = Object.assign({}, row);
    const id = String(copy[ID_COLUMN] || copy.id || '').trim();
    if (!id) return;
    if (findRowIndexById(live, id) === -1) return;
    copy[ID_COLUMN] = id;
    upsertRow(copy);
  });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
