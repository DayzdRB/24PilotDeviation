'use strict';

const { append, all, appendAudit, configured } = require('../../lib/sheets');
const { cleanText, allowMethod } = require('../../lib/security');
function randomSix() { return String(Math.floor(100000 + Math.random() * 900000)); }
function pad4(n) { return String(n).padStart(4, '0'); }

module.exports = async function handler(req, res) {
  if (!allowMethod(req, res, ['POST'])) return;
  if (!configured()) return res.status(503).json({ error:'data_store_unconfigured', fallbackAllowed:true });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const aircraft = body.aircraft || {}, incident = body.incident || {}, atc = body.atcReport || {};
    const callsign = cleanText(aircraft.callsign, 60), aircraftType = cleanText(aircraft.aircraftType, 80), incidentType = cleanText(incident.category, 80);
    if (!callsign || !aircraftType || !incidentType || !cleanText(atc.instruction, 2000) || !cleanText(atc.observedAction, 2000)) return res.status(400).json({ error:'missing_required_fields' });
    const reports = await all('Reports');
    let ppdNumber = '';
    for (let i = 0; i < 15; i++) { const candidate = randomSix(); if (!reports.some(r => r.PPDNumber === candidate)) { ppdNumber = candidate; break; } }
    if (!ppdNumber) return res.status(409).json({ error:'number_generation_failed' });
    const now = new Date(), datePart = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}${String(now.getUTCDate()).padStart(2,'0')}`;
    let suffix = reports.length + 1, caseId = `PPD-${datePart}-${pad4(suffix)}`;
    while (reports.some(r => r.CaseID === caseId)) caseId = `PPD-${datePart}-${pad4(++suffix)}`;
    const createdAt = now.toISOString(), status = 'Awaiting Pilot Response';
    await append('Reports', [caseId,ppdNumber,status,callsign,cleanText(aircraft.playerName,60),aircraftType,incidentType,cleanText(incident.airport,30),cleanText(incident.airspace,50),cleanText(incident.controllerPosition,30),cleanText(incident.occurredAt,60),createdAt,createdAt,'false','false','']);
    await append('ATCReports', [`ATC-${Date.now()}`,caseId,cleanText(atc.atcUsername,60),cleanText(atc.instruction,2000),cleanText(atc.observedAction,2000),cleanText(atc.narrative,5000),cleanText(incident.assignedAltitude,20),cleanText(incident.observedAltitude,20),cleanText(incident.assignedHeading,20),cleanText(incident.observedHeading,20),cleanText(incident.assignedRunway,20),cleanText(incident.observedRunway,20),cleanText(atc.evidenceUrl,500),createdAt]);
    await appendAudit(caseId, 'PPD_ISSUED', cleanText(atc.atcUsername,60) || 'ATC', JSON.stringify({ incidentType }));
    return res.status(201).json({ ok:true, report:{ id:caseId, ppdNumber, status, aircraft:{ callsign, playerName:cleanText(aircraft.playerName,60), aircraftType }, incident:{ ...incident, category:incidentType }, createdAt }});
  } catch (error) { console.error(error); return res.status(500).json({ error:'report_create_failed' }); }
};
