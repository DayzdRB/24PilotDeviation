'use strict';

const { get, configured } = require('../../lib/apps-script');
const { cleanText, isSafeCaseId, allowMethod } = require('../../lib/security');

module.exports = async function handler(req, res) {
  if (!allowMethod(req, res, ['GET'])) return;
  if (!configured()) return res.status(503).json({ error:'data_store_unconfigured' });

  try {
    const caseId = cleanText(req.query?.caseId, 40);
    if (!isSafeCaseId(caseId)) return res.status(400).json({ error:'invalid_case_id' });

    const data = await get('report', { caseId });
    const report = data?.report || {};
    const record = report.case || {};
    const pilotResponse = report.pilotResponse || null;
    const responded = Boolean(pilotResponse) || String(record.PilotResponseReceived || '').toLowerCase() === 'true' || String(record.Status || '') === 'Pilot Responded';

    return res.status(200).json({
      ok: true,
      case: {
        id: cleanText(record.CaseID || caseId, 40),
        ppdNumber: cleanText(record.PPDNumber, 20),
        status: cleanText(record.Status || (responded ? 'Pilot Responded' : 'Awaiting Pilot Response'), 80),
        pilotResponseReceived: responded,
        respondedAt: pilotResponse ? cleanText(pilotResponse.SubmittedAt, 60) : '',
        callsign: cleanText(record.Callsign, 60),
        aircraftType: cleanText(record.AircraftType, 80),
        pilotUsername: cleanText(record.PilotUsername, 60),
        incidentType: cleanText(record.IncidentType, 80),
        createdAt: cleanText(record.CreatedAt, 60),
        updatedAt: cleanText(record.UpdatedAt, 60)
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(error.status || 500).json({ error:error.code || 'case_status_failed', message:error.message });
  }
};
