'use strict';

const { post, configured } = require('../../lib/apps-script');
const { cleanText, isSafeCaseId, allowMethod } = require('../../lib/security');

module.exports = async function handler(req, res) {
  if (!allowMethod(req, res, ['POST'])) return;
  if (!configured()) return res.status(503).json({ error:'data_store_unconfigured', fallbackAllowed:true });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const caseId = cleanText(body.caseId, 40);
    if (!isSafeCaseId(caseId)) return res.status(400).json({ error:'invalid_case_id' });

    const response = body.response || {};
    const payload = {
      caseId,
      response: {
        pilotUsername: cleanText(response.pilotUsername, 60),
        understoodInstruction: cleanText(response.understoodInstruction, 2000),
        narrative: cleanText(response.narrative, 5000),
        attemptedCompliance: cleanText(response.attemptedCompliance, 20),
        emergency: cleanText(response.emergency, 10),
        technicalIssue: cleanText(response.technicalIssue, 10),
        technicalDetails: cleanText(response.technicalDetails, 2000),
        additionalInformation: cleanText(response.additionalInformation, 3000)
      }
    };

    const data = await post('respond', payload);
    return res.status(200).json(data);
  } catch (error) {
    console.error(error);
    return res.status(error.status || 500).json({ error:error.code || 'pilot_response_failed', message:error.message });
  }
};
