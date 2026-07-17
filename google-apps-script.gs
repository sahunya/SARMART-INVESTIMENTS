/**
 * SARMART INVESTIMENTS transaction service for Google Apps Script.
 *
 * Setup:
 * 1. Create a Google Sheet named "SARMART INVESTIMENTS Ledger".
 * 2. Open Extensions > Apps Script, replace its default file with this code,
 *    and update API_TOKEN below with a long private value.
 * 3. Deploy > New deployment > Web app. Execute as: Me. Who has access:
 *    Anyone. Copy the Web app URL into app.js.
 */
const API_TOKEN = 'Sarmart_2026!xR7kP2vN9mQ4zL8tH5wC';
const RECORDS_SHEET = 'Transactions';
const CONTACTS_SHEET = 'Contacts';
const STOCK_SHEET = 'Out of stock';
const HEADERS = ['id', 'type', 'name', 'category', 'party', 'amount', 'paidAmount', 'payments', 'status', 'date', 'time', 'due', 'notes', 'noteEntries', 'enteredBy', 'color', 'createdAt'];
const CONTACT_HEADERS = ['id', 'name', 'type', 'phone', 'email', 'createdAt'];
const STOCK_HEADERS = ['id', 'name', 'date', 'replaced', 'replacedDate', 'createdAt'];
const SESSION_VERSION_KEY = 'sarmart_session_version';

function doGet(e) {
  if ((e.parameter || {}).token !== API_TOKEN) return output_({ ok: false, error: 'Unauthorized' });
  if (e.parameter.action === 'listContacts') return output_({ ok: true, data: listContacts_() });
  if (e.parameter.action === 'listStock') return output_({ ok: true, data: listStock_() });
  if (e.parameter.action === 'getSessionVersion') return output_({ ok: true, data: { version: sessionVersion_() } });
  return output_({ ok: true, data: listRecords_() });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse((e.postData && e.postData.contents) || '{}');
  } catch (error) {
    return output_({ ok: false, error: 'Invalid request body.' });
  }
  if (body.token !== API_TOKEN) return output_({ ok: false, error: 'Unauthorized' });
  if (body.action === 'create') return output_({ ok: true, data: createRecord_(body.record) });
  if (body.action === 'update') return output_({ ok: true, data: updateRecord_(body.record) });
  if (body.action === 'delete') return output_({ ok: true, data: deleteRecord_(body.id) });
  if (body.action === 'createContact') return output_({ ok: true, data: createContact_(body.contact) });
  if (body.action === 'createStock') return output_({ ok: true, data: createStock_(body.item) });
  if (body.action === 'updateStock') return output_({ ok: true, data: updateStock_(body.item) });
  if (body.action === 'logoutOtherDevices') return output_({ ok: true, data: rotateSessionVersion_() });
  return output_({ ok: false, error: 'Unknown action' });
}

function output_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function sessionVersion_() {
  return PropertiesService.getScriptProperties().getProperty(SESSION_VERSION_KEY) || '1';
}

function rotateSessionVersion_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const version = String(Date.now());
    PropertiesService.getScriptProperties().setProperty(SESSION_VERSION_KEY, version);
    return { version: version };
  } finally {
    lock.releaseLock();
  }
}

function sheet_() {
  return ensureSheet_(RECORDS_SHEET, HEADERS);
}

function contactsSheet_() {
  return ensureSheet_(CONTACTS_SHEET, CONTACT_HEADERS);
}

function stockSheet_() {
  return ensureSheet_(STOCK_SHEET, STOCK_HEADERS);
}

function ensureSheet_(name, headers) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  } else {
    const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    headers.filter(header => !existingHeaders.includes(header)).forEach(header => sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header));
  }
  return sheet;
}

function listRecords_() {
  const values = sheet_().getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values.shift();
  return values.map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

function createRecord_(record) {
  if (!record || !record.id || !record.type || !Number.isFinite(Number(record.amount)) || !record.date) throw new Error('Missing transaction details.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = sheet_();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const values = { ...record, createdAt: new Date().toISOString() };
    sheet.appendRow(headers.map(header => serialize_(values[header])));
  } finally {
    lock.releaseLock();
  }
  return record;
}

function updateRecord_(record) {
  if (!record || !record.id) throw new Error('Missing transaction ID.');
  const sheet = sheet_();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const ids = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), 1).getValues().flat();
  const index = ids.indexOf(record.id);
  if (index === -1) throw new Error('Transaction not found.');
  const old = Object.fromEntries(headers.map((header, i) => [header, sheet.getRange(index + 2, i + 1).getValue()]));
  const values = { ...old, ...record };
  sheet.getRange(index + 2, 1, 1, headers.length).setValues([headers.map(header => serialize_(values[header]))]);
  return record;
}

function serialize_(value) {
  return value && typeof value === 'object' ? JSON.stringify(value) : value ?? '';
}

function deleteRecord_(id) {
  const sheet = sheet_();
  const rowCount = sheet.getLastRow() - 1;
  if (rowCount < 1) throw new Error('Transaction not found.');
  const ids = sheet.getRange(2, 1, rowCount, 1).getValues().flat();
  const index = ids.indexOf(id);
  if (index === -1) throw new Error('Transaction not found.');
  sheet.deleteRow(index + 2);
  return { id: id };
}

function listContacts_() {
  const values = contactsSheet_().getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values.shift();
  return values.map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

function createContact_(contact) {
  if (!contact || !contact.id || !contact.name) throw new Error('Missing contact details.');
  const sheet = contactsSheet_();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const values = { ...contact, createdAt: new Date().toISOString() };
  sheet.appendRow(headers.map(header => values[header] ?? ''));
  return contact;
}

function listStock_() {
  const values = stockSheet_().getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values.shift();
  return values.map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

function createStock_(item) {
  if (!item || !item.id || !item.name || !item.date) throw new Error('Missing out-of-stock item details.');
  const sheet = stockSheet_();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const values = { ...item, createdAt: new Date().toISOString() };
  sheet.appendRow(headers.map(header => serialize_(values[header])));
  return item;
}

function updateStock_(item) {
  if (!item || !item.id) throw new Error('Missing out-of-stock item ID.');
  const sheet = stockSheet_();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const ids = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), 1).getValues().flat();
  const index = ids.indexOf(item.id);
  if (index === -1) throw new Error('Out-of-stock item not found.');
  const old = Object.fromEntries(headers.map((header, i) => [header, sheet.getRange(index + 2, i + 1).getValue()]));
  const values = { ...old, ...item };
  sheet.getRange(index + 2, 1, 1, headers.length).setValues([headers.map(header => serialize_(values[header]))]);
  return item;
}
