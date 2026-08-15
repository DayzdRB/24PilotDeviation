'use strict';

const { google } = require('googleapis');

const SHEETS = {
  Reports: ['CaseID','PPDNumber','Status','Callsign','PilotUsername','AircraftType','IncidentType','Airport','Airspace','ControllerPosition','OccurredAt','CreatedAt','UpdatedAt','PilotResponseReceived','Public','Disposition'],
  ATCReports: ['ReportID','CaseID','ATCUsername','Instruction','ObservedAction','Narrative','AssignedAltitude','ObservedAltitude','AssignedHeading','ObservedHeading','AssignedRunway','ObservedRunway','EvidenceURL','SubmittedAt'],
  PilotResponses: ['ResponseID','CaseID','PilotUsername','UnderstoodInstruction','Narrative','AttemptedCompliance','Emergency','TechnicalIssue','TechnicalDetails','AdditionalInformation','SubmittedAt'],
  PublicReports: ['CaseID','Callsign','AircraftType','IncidentType','Location','Date','Status','Disposition','Summary','PublishedAt'],
  AuditLog: ['EventID','CaseID','Event','Actor','Metadata','CreatedAt']
};

function configured() {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY && process.env.GOOGLE_SHEET_ID);
}

function client() {
  if (!configured()) {
    const error = new Error('Google Sheets is not configured.');
    error.code = 'SHEETS_UNCONFIGURED';
    throw error;
  }
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return google.sheets({ version: 'v4', auth });
}

async function getValues(range) {
  const sheets = client();
  const result = await sheets.spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID, range });
  return result.data.values || [];
}

async function append(sheetName, values) {
  const sheets = client();
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${sheetName}!A:ZZ`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] }
  });
}

async function updateRow(sheetName, rowNumber, values) {
  const sheets = client();
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${sheetName}!A${rowNumber}:ZZ${rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [values] }
  });
}

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const headers = rows[0];
  return rows.slice(1).map((row, index) => {
    const object = { __row: index + 2 };
    headers.forEach((header, i) => { object[header] = row[i] ?? ''; });
    return object;
  });
}

async function all(sheetName) { return rowsToObjects(await getValues(`${sheetName}!A:ZZ`)); }
async function findOne(sheetName, key, value) { const rows = await all(sheetName); return rows.find(row => String(row[key]) === String(value)) || null; }
async function appendAudit(caseId, event, actor = 'system', metadata = '') {
  await append('AuditLog', [`EVT-${Date.now()}-${Math.floor(Math.random() * 1000)}`, caseId, event, actor, metadata, new Date().toISOString()]);
}

module.exports = { SHEETS, configured, getValues, append, updateRow, all, findOne, appendAudit };
