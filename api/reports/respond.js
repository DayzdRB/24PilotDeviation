'use strict';

const { findOne, append, updateRow, appendAudit, configured, SHEETS } = require('../../lib/sheets');
const { cleanText, isSafeCaseId, allowMethod } = require('../../lib/security');
module.exports = async function handler(req, res) {
  if (!allowMethod(req, res, ['POST'])) return;
  if (!configured()) return res.status(503).json({ error:'data_store_unconfigured', fallbackAllowed:true });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}), caseId = cleanText(body.caseId, 40);
    if (!isSafeCaseId(caseId)) return res.status(400).json({ error:'invalid_case_id' });
    const report = await findOne('Reports', 'CaseID', caseId);
    if (!report) return res.status(404).json({ error:'report_not_found' });
    const existing = await findOne('PilotResponses', 'CaseID', caseId);
    if (existing) return res.status(409).json({ error:'response_already_submitted' });
    const response = body.response || {};
    if (!cleanText(response.pilotUsername,60) || !cleanText(response.narrative,5000)) return res.status(400).json({ error:'missing_required_fields' });
    const submittedAt = new Date().toISOString();
    await append('PilotResponses', [`PILOT-${Date.now()}`,caseId,cleanText(response.pilotUsername,60),cleanText(response.understoodInstruction,2000),cleanText(response.narrative,5000),cleanText(response.attemptedCompliance,20),cleanText(response.emergency,10),cleanText(response.technicalIssue,10),cleanText(response.technicalDetails,2000),cleanText(response.additionalInformation,3000),submittedAt]);
    const headers = SHEETS.Reports, updated = headers.map(h => report[h] ?? '');
    updated[headers.indexOf('Status')] = 'Pilot Responded'; updated[headers.indexOf('UpdatedAt')] = submittedAt; updated[headers.indexOf('PilotResponseReceived')] = 'true';
    await updateRow('Reports', report.__row, updated); await appendAudit(caseId, 'PILOT_RESPONSE_SUBMITTED', cleanText(response.pilotUsername,60));
    return res.status(200).json({ ok:true, caseId, status:'Pilot Responded', submittedAt });
  } catch (error) { console.error(error); return res.status(500).json({ error:'pilot_response_failed' }); }
};
