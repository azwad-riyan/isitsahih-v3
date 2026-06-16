/**
 * Code.gs — Google Apps Script logging backend for IsItSahih v4
 * ─────────────────────────────────────────────────────────────────────────────
 * The server functions (netlify/functions/*) POST form-encoded rows here. Each
 * row carries a `tab` field that selects the destination sheet:
 *
 *   requests   — one row per verification attempt (incl. rejections)
 *   shares     — one row per share link created
 *   errors     — one row per caught failure (the user only ever sees a generic msg)
 *   api_usage  — one row per upstream call (Kalimat / Gemini), for usage + cost
 *   key_health — Gemini key quota / failure events
 *   daily_summary — written by the midnight trigger (run setupTriggers once)
 *
 * SETUP:
 *  1. Google Sheet → Extensions → Apps Script → paste this file (replace all).
 *  2. Deploy → New deployment → Web App → Execute as: Me → Who has access: Anyone.
 *  3. Put the Web App URL in Netlify env as PRIMARY_LOG_URL (and BACKUP_LOG_URL).
 *  4. Run setupTriggers() once from the editor to install the daily summary.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Column order per tab. Unknown incoming fields are ignored; missing ones blank.
const TAB_HEADERS = {
  requests: [
    'timestamp', 'session_id', 'language', 'app_version',
    'claim', 'claim_length', 'claim_preview', 'latency_ms',
    'verdict', 'explanation', 'references',
    'reference_count', 'verdict_overridden', 'no_sources_found',
    'injection_suspicious', 'gemini_key_index', 'rejection_reason',
    'share_id', 'share_url',
    // client context (geo + device + language preference)
    'country', 'country_code', 'city', 'region', 'timezone',
    'device_type', 'os', 'browser', 'accept_language', 'user_agent',
  ],
  shares: [
    'timestamp', 'share_id', 'share_url', 'session_id', 'verdict',
    'claim_length', 'claim_preview', 'language', 'reference_count',
    'app_version', 'verdict_overridden',
  ],
  errors: [
    'timestamp', 'session_id', 'language', 'app_version',
    'claim_length', 'claim_preview', 'latency_ms',
    'rejection_reason', 'stage', 'message', 'exhaustedAll', 'attempts', 'status',
    'country', 'country_code', 'city', 'region', 'timezone',
    'device_type', 'os', 'browser', 'accept_language', 'user_agent',
  ],
  api_usage: [
    'timestamp', 'session_id', 'upstream', 'detail', 'key_index',
    'status', 'quota', 'result_count', 'ms', 'success',
  ],
  key_health: [
    'timestamp', 'session_id', 'api_key_index', 'failure_type', 'claim_preview',
  ],
  daily_summary: [
    'date', 'total_requests', 'rejections', 'true_count', 'false_count',
    'uncertain_count', 'error_count', 'no_sources_found_count',
    'verdict_overrides', 'avg_latency_ms', 'unique_sessions', 'shares_created',
  ],
};

function styleHeader(sheet, numCols) {
  const headerRange = sheet.getRange(1, 1, 1, numCols);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#1a6b3c');
  headerRange.setFontColor('#ffffff');
  sheet.setFrozenRows(1);
}

// Returns { sheet, headers } where headers is the sheet's ACTUAL header row.
// Creates the sheet if missing, and appends any newly-expected columns to an
// existing sheet so the schema can evolve without misaligning old rows.
function getSheetAndHeaders(ss, name, expected) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(expected);
    styleHeader(sheet, expected.length);
    return { sheet: sheet, headers: expected.slice() };
  }

  const lastCol = sheet.getLastColumn();
  let headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];

  if (headers.length === 0) {
    sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
    styleHeader(sheet, expected.length);
    return { sheet: sheet, headers: expected.slice() };
  }

  const missing = expected.filter(function (h) { return headers.indexOf(h) === -1; });
  if (missing.length) {
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
    headers = headers.concat(missing);
    styleHeader(sheet, headers.length);
  }
  return { sheet: sheet, headers: headers };
}

// Pull a field whether it arrived as form param or JSON, tolerating camel/snake.
function readField(data, key) {
  if (data[key] !== undefined) return data[key];
  const camel = key.replace(/_([a-z])/g, function (_, c) { return c.toUpperCase(); });
  if (data[camel] !== undefined) return data[camel];
  const snake = key.replace(/[A-Z]/g, function (c) { return '_' + c.toLowerCase(); });
  if (data[snake] !== undefined) return data[snake];
  return '';
}

function toCell(val) {
  if (val === undefined || val === null) return '';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  return String(val);
}

function doPost(e) {
  try {
    // Form-encoded posts land in e.parameter; JSON posts in e.postData.contents.
    var data = (e && e.parameter) ? e.parameter : {};
    if ((!data || Object.keys(data).length === 0) && e && e.postData && e.postData.contents) {
      try { data = JSON.parse(e.postData.contents); } catch (_) { /* keep data */ }
    }

    var tab = String(data.tab || 'requests');
    var expected = TAB_HEADERS[tab] || TAB_HEADERS.requests;

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var info = getSheetAndHeaders(ss, tab, expected);
    // Map values to the sheet's ACTUAL header order so columns never misalign.
    info.sheet.appendRow(info.headers.map(function (h) {
      if (h === 'timestamp') return toCell(data.timestamp || new Date().toISOString());
      return toCell(readField(data, h));
    }));

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', tab: tab }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', service: 'IsItSahih Logger v4' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── Daily summary (midnight trigger) ─────────────────────────────────────────

function writeDailySummary() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var requests = ss.getSheetByName('requests');
  if (!requests) return;

  var summary = getSheetAndHeaders(ss, 'daily_summary', TAB_HEADERS.daily_summary).sheet;

  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  var dateStr = Utilities.formatDate(yesterday, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  var all = requests.getDataRange().getValues();
  var headers = all[0];
  var rows = all.slice(1);
  var col = function (name) { return headers.indexOf(name); };

  var dayRows = rows.filter(function (r) {
    return String(r[col('timestamp')] || '').slice(0, 10) === dateStr;
  });
  if (dayRows.length === 0) return;

  var trueCount = 0, falseCount = 0, uncertainCount = 0, errorCount = 0,
      rejections = 0, noSources = 0, overrides = 0, totalLatency = 0, latencyN = 0;
  var sessions = {};

  dayRows.forEach(function (r) {
    var verdict = String(r[col('verdict')] || '');
    if (verdict === 'True') trueCount++;
    else if (verdict === 'False') falseCount++;
    else if (verdict === 'Uncertain') uncertainCount++;
    else if (verdict === 'ERROR') errorCount++;
    else if (verdict === 'REJECTED') rejections++;
    if (r[col('no_sources_found')] === 'TRUE') noSources++;
    if (r[col('verdict_overridden')] === 'TRUE') overrides++;
    var lat = Number(r[col('latency_ms')] || 0);
    if (lat > 0) { totalLatency += lat; latencyN++; }
    var sid = String(r[col('session_id')] || '');
    if (sid) sessions[sid] = true;
  });

  var sharesSheet = ss.getSheetByName('shares');
  var sharesCreated = 0;
  if (sharesSheet) {
    var sAll = sharesSheet.getDataRange().getValues();
    var sHeaders = sAll[0];
    var tsIdx = sHeaders.indexOf('timestamp');
    sharesCreated = sAll.slice(1).filter(function (r) {
      return String(r[tsIdx] || '').slice(0, 10) === dateStr;
    }).length;
  }

  summary.appendRow([
    dateStr, dayRows.length, rejections, trueCount, falseCount, uncertainCount,
    errorCount, noSources, overrides,
    latencyN > 0 ? Math.round(totalLatency / latencyN) : 0,
    Object.keys(sessions).length, sharesCreated,
  ]);
}

function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('writeDailySummary').timeBased().atHour(0).everyDays(1).create();
  Logger.log('Triggers installed.');
}
