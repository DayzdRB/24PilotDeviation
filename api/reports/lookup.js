'use strict';

const { findOne, configured } = require('../../lib/sheets');
const { normalizePPDNumber, allowMethod } = require('../../lib/security');
module.exports = async function handler(req, res) {
  if (!allowMethod(req, res, ['GET'])) return;
  if (!configured()) return res.status(503).json({ error:'data_store_unconfigured', fallbackAllowed:true });
  const number = normalizePPDNumber(req.query?.number);
  if (!number) return res.status(400).json({ error:'invalid_ppd_number' });
  try {
    const report = await findOne('Reports', 'PPDNumber', number);
    if (!report) return res.status(404).json({ error:'report_not_found' });
    const atc = await findOne('ATCReports', 'CaseID', report.CaseID);
    return res.status(200).json({ ok:true, report:{ id:report.CaseID, ppdNumber:report.PPDNumber, status:report.Status, aircraft:{ callsign:report.Callsign, playerName:report.PilotUsername, aircraftType:report.AircraftType }, incident:{ category:report.IncidentType, airport:report.Airport, airspace:report.Airspace, controllerPosition:report.ControllerPosition, occurredAt:report.OccurredAt }, reported:{ instruction:atc?.Instruction || '', observedAction:atc?.ObservedAction || '' }, createdAt:report.CreatedAt }});
  } catch (error) { console.error(error); return res.status(500).json({ error:'report_lookup_failed' }); }
};
