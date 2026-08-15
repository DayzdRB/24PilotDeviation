'use strict';

const { all, configured } = require('../../lib/sheets');
const { allowMethod } = require('../../lib/security');
module.exports = async function handler(req, res) {
  if (!allowMethod(req, res, ['GET'])) return;
  if (!configured()) return res.status(200).json({ ok:true, demo:true, reports:[] });
  try {
    const rows = await all('PublicReports');
    const reports = rows.filter(r => r.CaseID).map(r => ({ id:r.CaseID,callsign:r.Callsign,aircraftType:r.AircraftType,incidentType:r.IncidentType,location:r.Location,date:r.Date,status:r.Status,disposition:r.Disposition,summary:r.Summary,publishedAt:r.PublishedAt }));
    return res.status(200).json({ ok:true, reports });
  } catch (error) { console.error(error); return res.status(500).json({ error:'public_reports_failed' }); }
};
