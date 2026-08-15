'use strict';

const { post, configured } = require('../../lib/apps-script');
const { cleanText, allowMethod } = require('../../lib/security');
const { requireUser } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (!allowMethod(req, res, ['POST'])) return;
  if (!configured()) return res.status(503).json({ error:'data_store_unconfigured' });

  try {
    const user = await requireUser(req);
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const aircraft = body.aircraft || {};
    const incident = body.incident || {};
    const atc = body.atcReport || {};

    const payload = {
      controllerUserId:user.id,
      aircraft: {
        callsign: cleanText(aircraft.callsign, 60),
        playerName: cleanText(aircraft.playerName, 60),
        aircraftType: cleanText(aircraft.aircraftType, 80)
      },
      incident: {
        category: cleanText(incident.category, 80),
        airport: cleanText(incident.airport, 30),
        airspace: cleanText(incident.airspace, 50),
        controllerPosition: cleanText(incident.controllerPosition, 30),
        occurredAt: cleanText(incident.occurredAt, 60),
        assignedAltitude: cleanText(incident.assignedAltitude, 20),
        observedAltitude: cleanText(incident.observedAltitude, 20),
        assignedHeading: cleanText(incident.assignedHeading, 20),
        observedHeading: cleanText(incident.observedHeading, 20),
        assignedRunway: cleanText(incident.assignedRunway, 20),
        observedRunway: cleanText(incident.observedRunway, 20)
      },
      atcReport: {
        atcUsername: cleanText(atc.atcUsername || user.robloxUsername || user.displayName || user.username, 60),
        instruction: cleanText(atc.instruction, 2000),
        observedAction: cleanText(atc.observedAction, 2000),
        narrative: cleanText(atc.narrative, 5000),
        evidenceUrl: cleanText(atc.evidenceUrl, 500)
      }
    };

    const data = await post('createReport', payload);
    return res.status(201).json(data);
  } catch (error) {
    console.error(error);
    return res.status(Number(error.status) || 500).json({ error:error.code || 'report_create_failed', message:error.message });
  }
};
