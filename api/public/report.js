'use strict';

const { get } = require('../../lib/apps-script');
const { allowMethod, isSafeCaseId } = require('../../lib/security');

function fallbackNormalize(caseId, publicRow, privateData) {
  const source = privateData?.report || {};
  const report = source.case || {};
  const atc = source.atcReport || null;
  const pilot = source.pilotResponse || null;

  return {
    caseId,
    status:report.Status || publicRow.Status || '',
    disposition:report.Disposition || publicRow.Disposition || 'Awaiting Review',
    callsign:report.Callsign || publicRow.Callsign || '',
    aircraftType:report.AircraftType || publicRow.AircraftType || '',
    pilotUsername:report.PilotUsername || '',
    createdAt:report.CreatedAt || '',
    updatedAt:report.UpdatedAt || '',
    publishedAt:publicRow.PublishedAt || '',
    incident:{
      type:report.IncidentType || publicRow.IncidentType || '',
      airport:report.Airport || '',
      airspace:report.Airspace || '',
      controllerPosition:report.ControllerPosition || '',
      occurredAt:report.OccurredAt || publicRow.Date || '',
      assignedAltitude:atc?.AssignedAltitude || '',
      observedAltitude:atc?.ObservedAltitude || '',
      assignedHeading:atc?.AssignedHeading || '',
      observedHeading:atc?.ObservedHeading || '',
      assignedRunway:atc?.AssignedRunway || '',
      observedRunway:atc?.ObservedRunway || ''
    },
    atc:atc ? {
      username:atc.ATCUsername || '',
      position:report.ControllerPosition || '',
      instruction:atc.Instruction || '',
      observedAction:atc.ObservedAction || '',
      statement:atc.Narrative || '',
      evidenceUrl:atc.EvidenceURL || '',
      submittedAt:atc.SubmittedAt || ''
    } : null,
    pilot:pilot ? {
      username:pilot.PilotUsername || '',
      understoodInstruction:pilot.UnderstoodInstruction || '',
      statement:pilot.Narrative || '',
      attemptedCompliance:pilot.AttemptedCompliance || '',
      emergency:pilot.Emergency || '',
      technicalIssue:pilot.TechnicalIssue || '',
      technicalDetails:pilot.TechnicalDetails || '',
      additionalInformation:pilot.AdditionalInformation || '',
      submittedAt:pilot.SubmittedAt || ''
    } : null,
    votes:{ atc:0, pilot:0, inconclusive:0, total:0 },
    communityVerdict:{ leader:'NO VOTES', percentage:0 }
  };
}

module.exports = async function handler(req, res) {
  if (!allowMethod(req, res, ['GET'])) return;

  const caseId = String(req.query?.caseId || '').trim().toUpperCase();
  if (!isSafeCaseId(caseId)) {
    return res.status(400).json({ error:'invalid_case_id', message:'Enter a valid public case ID.' });
  }

  try {
    try {
      const data = await get('publicReport', { caseId }, true);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ok:true, report:data.report });
    } catch (error) {
      if (!['apps_script_request_failed', 'unknown_action'].includes(error.code)) throw error;
    }

    const [publicData, privateData] = await Promise.all([
      get('publicReports', {}, false),
      get('report', { caseId }, true)
    ]);
    const publicRow = (publicData.reports || []).find(row => String(row.CaseID || '') === caseId);
    if (!publicRow) {
      return res.status(404).json({ error:'report_not_public', message:'This case is not available in Public Reports.' });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok:true, report:fallbackNormalize(caseId, publicRow, privateData) });
  } catch (error) {
    console.error('public report detail failed', error);
    const status = Number(error.status) || 500;
    return res.status(status).json({
      error:error.code || 'public_report_failed',
      message:error.message || 'Unable to load this public case.'
    });
  }
};
