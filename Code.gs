```js
/**
 * ============================================================
 * GATE OPS BOARD — GOOGLE APPS SCRIPT BACKEND
 * ============================================================
 *
 * This script connects the Gate Ops Board to the Google Sheet.
 *
 * Supported actions:
 *   ?action=list
 *   ?action=upsert
 *   ?action=delete
 *
 * The frontend uses GET requests.
 *
 * IMPORTANT:
 * The Web App deployment must use this script/version.
 * ============================================================
 */


// ============================================================
// CONFIGURATION
// ============================================================

const SHEET_ID =
  '1CPmhAJ6Pb0wNQKLW3Q8_Nu7nmRtfRL-yGgqqJdPCVIY';

const SHEET_NAME =
  'flights';

const KEY_COLUMN =
  'FLIGHT NUMBER';


// ============================================================
// GET REQUESTS
// ============================================================

function doGet(e) {

  try {

    const action =
      e &&
      e.parameter &&
      e.parameter.action
        ? e.parameter.action
        : 'list';


    // --------------------------------------------------------
    // LIST
    // --------------------------------------------------------

    if (action === 'list') {

      return jsonResponse(
        getAllRows()
      );
    }


    // --------------------------------------------------------
    // UPSERT
    // --------------------------------------------------------

    if (action === 'upsert') {

      if (
        !e.parameter ||
        !e.parameter.row
      ) {
        throw new Error(
          'Missing row data.'
        );
      }

      const row =
        JSON.parse(
          e.parameter.row
        );

      upsertRow(row);

      return jsonResponse({
        ok: true
      });
    }


    // --------------------------------------------------------
    // DELETE
    // --------------------------------------------------------

    if (action === 'delete') {

      if (
        !e.parameter ||
        !e.parameter.id
      ) {
        throw new Error(
          'Missing flight ID.'
        );
      }

      deleteRowByKey(
        e.parameter.id
      );

      return jsonResponse({
        ok: true
      });
    }


    // --------------------------------------------------------
    // UNKNOWN ACTION
    // --------------------------------------------------------

    return jsonResponse({
      error:
        'Unknown action: ' +
        action
    });

  } catch (err) {

    return jsonResponse({
      error:
        err &&
        err.message
          ? err.message
          : String(err)
    });
  }
}


// ============================================================
// POST REQUESTS
// ============================================================
//
// POST is included as a backup even though the current frontend
// uses GET.
// ============================================================

function doPost(e) {

  try {

    if (
      !e ||
      !e.postData ||
      !e.postData.contents
    ) {
      throw new Error(
        'Missing POST data.'
      );
    }

    const body =
      JSON.parse(
        e.postData.contents
      );


    // --------------------------------------------------------
    // UPSERT
    // --------------------------------------------------------

    if (
      body.action === 'upsert'
    ) {

      upsertRow(
        body.row
      );

      return jsonResponse({
        ok: true
      });
    }


    // --------------------------------------------------------
    // DELETE
    // --------------------------------------------------------

    if (
      body.action === 'delete'
    ) {

      deleteRowByKey(
        body.id
      );

      return jsonResponse({
        ok: true
      });
    }


    // --------------------------------------------------------
    // LIST
    // --------------------------------------------------------

    if (
      body.action === 'list'
    ) {

      return jsonResponse(
        getAllRows()
      );
    }


    return jsonResponse({
      error:
        'Unknown action: ' +
        body.action
    });

  } catch (err) {

    return jsonResponse({
      error:
        err &&
        err.message
          ? err.message
          : String(err)
    });
  }
}


// ============================================================
// SHEET ACCESS
// ============================================================

function getSheet() {

  const spreadsheet =
    SpreadsheetApp.openById(
      SHEET_ID
    );

  const sheet =
    spreadsheet.getSheetByName(
      SHEET_NAME
    );

  if (!sheet) {

    throw new Error(
      'No tab named "' +
      SHEET_NAME +
      '" found.'
    );
  }

  return sheet;
}


// ============================================================
// HEADERS
// ============================================================

function getHeaders(sheet) {

  return sheet
    .getRange(
      1,
      1,
      1,
      sheet.getLastColumn()
    )
    .getValues()[0]
    .map(
      h =>
        String(h).trim()
    );
}


// ============================================================
// GET ALL FLIGHTS
// ============================================================

function getAllRows() {

  const sheet =
    getSheet();

  const headers =
    getHeaders(sheet);

  const lastRow =
    sheet.getLastRow();

  if (
    lastRow < 2
  ) {
    return [];
  }

  const keyIndex =
    headers.indexOf(
      KEY_COLUMN
    );

  if (
    keyIndex === -1
  ) {

    throw new Error(
      'Column "' +
      KEY_COLUMN +
      '" was not found.'
    );
  }


  const values =
    sheet.getRange(
      2,
      1,
      lastRow - 1,
      headers.length
    ).getValues();


  return values

    // Skip completely blank flight rows.
    .filter(
      row =>
        String(
          row[keyIndex]
        ).trim() !== ''
    )

    .map(
      row => {

        const obj = {};

        headers.forEach(
          (header, index) => {

            obj[header] =
              formatCell(
                row[index]
              );
          }
        );

        return obj;
      }
    );
}


// ============================================================
// FORMAT GOOGLE SHEETS VALUES
// ============================================================

function formatCell(value) {

  if (
    Object.prototype.toString.call(
      value
    ) === '[object Date]'
  ) {

    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      'HH:mm'
    );
  }

  return value;
}


// ============================================================
// FIND FLIGHT ROW
// ============================================================

function findRowIndexByKey(
  sheet,
  headers,
  keyValue
) {

  const keyColIndex =
    headers.indexOf(
      KEY_COLUMN
    );

  if (
    keyColIndex === -1
  ) {

    throw new Error(
      'Column "' +
      KEY_COLUMN +
      '" was not found.'
    );
  }

  const lastRow =
    sheet.getLastRow();

  if (
    lastRow < 2
  ) {
    return -1;
  }

  const values =
    sheet.getRange(
      2,
      keyColIndex + 1,
      lastRow - 1,
      1
    ).getValues();


  for (
    let i = 0;
    i < values.length;
    i++
  ) {

    if (
      String(
        values[i][0]
      ).trim() ===
      String(
        keyValue
      ).trim()
    ) {

      return i + 2;
    }
  }

  return -1;
}


// ============================================================
// UPSERT FLIGHT
// ============================================================
//
// IMPORTANT:
// When updating an existing flight, columns that are NOT sent
// by the frontend are preserved.
//
// This prevents things such as airline IMAGE columns,
// formulas, or other Sheet data from being accidentally erased.
// ============================================================

function upsertRow(rowObj) {

  if (
    !rowObj ||
    typeof rowObj !== 'object'
  ) {

    throw new Error(
      'Invalid row data.'
    );
  }


  const sheet =
    getSheet();

  const headers =
    getHeaders(sheet);

  const keyValue =
    rowObj[KEY_COLUMN];


  if (
    keyValue === undefined ||
    keyValue === null ||
    String(
      keyValue
    ).trim() === ''
  ) {

    throw new Error(
      'Missing ' +
      KEY_COLUMN +
      ' — cannot save row.'
    );
  }


  const rowIndex =
    findRowIndexByKey(
      sheet,
      headers,
      keyValue
    );


  // ----------------------------------------------------------
  // NEW FLIGHT
  // ----------------------------------------------------------

  if (
    rowIndex === -1
  ) {

    const rowValues =
      headers.map(
        header =>
          Object.prototype.hasOwnProperty.call(
            rowObj,
            header
          )
            ? rowObj[header]
            : ''
      );

    sheet.appendRow(
      rowValues
    );

    return;
  }


  // ----------------------------------------------------------
  // EXISTING FLIGHT
  // ----------------------------------------------------------
  //
  // Read the existing row first.
  // Then only replace fields actually provided by the frontend.
  //

  const existingValues =
    sheet.getRange(
      rowIndex,
      1,
      1,
      headers.length
    ).getValues()[0];


  const newValues =
    headers.map(
      (header, index) => {

        if (
          Object.prototype.hasOwnProperty.call(
            rowObj,
            header
          )
        ) {

          return rowObj[
            header
          ];
        }

        // Preserve whatever was already in the Sheet.
        return existingValues[
          index
        ];
      }
    );


  sheet
    .getRange(
      rowIndex,
      1,
      1,
      headers.length
    )
    .setValues([
      newValues
    ]);
}


// ============================================================
// DELETE FLIGHT
// ============================================================

function deleteRowByKey(
  keyValue
) {

  if (
    keyValue === undefined ||
    keyValue === null ||
    String(
      keyValue
    ).trim() === ''
  ) {

    throw new Error(
      'Missing flight ID.'
    );
  }


  const sheet =
    getSheet();

  const headers =
    getHeaders(sheet);

  const rowIndex =
    findRowIndexByKey(
      sheet,
      headers,
      keyValue
    );


  if (
    rowIndex !== -1
  ) {

    sheet.deleteRow(
      rowIndex
    );
  }
}


// ============================================================
// JSON RESPONSE
// ============================================================

function jsonResponse(obj) {

  return ContentService
    .createTextOutput(
      JSON.stringify(obj)
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );
}
```
