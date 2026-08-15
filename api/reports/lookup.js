'use strict';

const { get, configured } = require('../../lib/apps-script');
const { normalizePPDNumber, allowMethod } = require('../../lib/security');

module.exports = async function handler(req, res) {
  if (!allowMethod(req, res, ['GET'])) return;
  if (!configured()) return res.status(503).json({ error:'data_store_unconfigured', fallbackAllowed:true });

  const number = normalizePPDNumber(req.query?.number);
  if (!number) return res.status(400).json({ error:'invalid_ppd_number' });

  try {
    const data = await get('lookup', { number });
    return res.status(200).json(data);
  } catch (error) {
    console.error(error);
    return res.status(error.status || 500).json({ error:error.code || 'report_lookup_failed', message:error.message });
  }
};
