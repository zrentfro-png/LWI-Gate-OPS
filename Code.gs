/**
 * GATE OPS BOARD — Apps Script backend
 *
 * IMPORTANT: This is a STANDALONE script, separate from any script
 * already bound to your spreadsheet. It does not touch or interfere
 * with an existing Apps Script project (e.g. one powering another
 * flight status board off the same sheet).
 *
 * Setup: go to script.google.com > New project (NOT Extensions > Apps
 * Script from inside the sheet). Paste this in, fill in SHEET_ID below,
 * then deploy as a Web App. See README.md for full steps.
 */

const SHEET_ID = '1CPmhAJ6Pb0wNQKLW3Q8_Nu7nmRtfRL-yGgqqJdPCVIY';
const SHEET_NAME = 'flights';
const KEY_COLUMN = 'FLIGHT NUMBER'; // used to find/update/delete a specific flight row

function doGet(e) {
  const action = (e.parameter.action || 'list');
  if (action === 'list') {
    return jsonResponse(getAllRows());
  }
  if (action === 'upsert') {
    try {
      const row = JSON.parse(e.parameter.row);
      upsertRow(row);
      return jsonResponse({ ok: true });
    } catch (err) {
      return jsonResponse({ error: err.message });
    }
  }
  if (action === 'delete') {
    try {
      deleteRowByKey(e.parameter.id);
      return jsonResponse({ ok: true });
    } catch (err) {
      return jsonResponse({ error: err.message });
    }
  }
  return jsonResponse({ error: 'Unknown action: ' + action });
}

function doPost(e) {
  // Kept as a fallback, but the site now uses doGet for all actions
  // (POST cross-origin can silently fail on Apps Script due to an
  // internal redirect that drops CORS headers, even though GET works
  // fine). See doGet above for the actual logic in use.
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'upsert') {
      upsertRow(body.row);
      return jsonResponse({ ok: true });
    }
    if (body.action === 'delete') {
      deleteRowByKey(body.id);
      return jsonResponse({ ok: true });
    }
    return jsonResponse({ error: 'Unknown action: ' + body.action });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ---------- Helpers ----------

function getSheet() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('No tab named "' + SHEET_NAME + '" found.');
  return sheet;
}

function getHeaders(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
}

function getAllRows() {
  const sheet = getSheet();
  const headers = getHeaders(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values
    .filter(row => row[headers.indexOf(KEY_COLUMN)] !== '') // skip blank rows
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = formatCell(row[i]);
      });
      return obj;
    });
}

// Google Sheets stores TIME values as Date objects internally; convert
// those back to "HH:MM" strings so the frontend gets plain text.
function formatCell(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'HH:mm');
  }
  return value;
}

function findRowIndexByKey(sheet, headers, keyValue) {
  const keyColIdx = headers.indexOf(KEY_COLUMN);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const keyValues = sheet.getRange(2, keyColIdx + 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < keyValues.length; i++) {
    if (String(keyValues[i][0]).trim() === String(keyValue).trim()) {
      return i + 2; // actual sheet row number (1-indexed, +1 for header)
    }
  }
  return -1;
}

function upsertRow(rowObj) {
  const sheet = getSheet();
  const headers = getHeaders(sheet);
  const keyValue = rowObj[KEY_COLUMN];
  if (!keyValue) throw new Error('Missing ' + KEY_COLUMN + ' — cannot save row.');

  const rowIndex = findRowIndexByKey(sheet, headers, keyValue);
  const rowValues = headers.map(h => (h in rowObj ? rowObj[h] : ''));

  if (rowIndex === -1) {
    sheet.appendRow(rowValues);
  } else {
    sheet.getRange(rowIndex, 1, 1, headers.length).setValues([rowValues]);
  }
}

function deleteRowByKey(keyValue) {
  const sheet = getSheet();
  const headers = getHeaders(sheet);
  const rowIndex = findRowIndexByKey(sheet, headers, keyValue);
  if (rowIndex !== -1) {
    sheet.deleteRow(rowIndex);
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
