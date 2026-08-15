'use strict';

const { configured, get } = require('../lib/apps-script');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error:'method_not_allowed' });

  const appsScriptConfigured = configured();
  const deep = String(req.query?.deep || '') === '1';

  // Page startup only needs configuration state. Do not block the whole UI on a
  // Google Apps Script network round-trip. Deep monitoring can still request it.
  if (!deep) {
    res.setHeader('Cache-Control', 'private, max-age=30');
    return res.status(200).json({
      ok:true,
      dataStore:'google-apps-script',
      appsScriptReachable:null,
      appsScriptConfigured,
      sheetsConfigured:appsScriptConfigured,
      mock24Data:String(process.env.USE_MOCK_24DATA).toLowerCase()==='true'
    });
  }

  let appsScriptReachable = false;
  try {
    const health = await get('health', {}, false);
    appsScriptReachable = health?.ok === true;
  } catch (error) {
    console.error('Apps Script health check failed:', error.message);
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok:true,
    dataStore:'google-apps-script',
    appsScriptReachable,
    appsScriptConfigured,
    sheetsConfigured:appsScriptConfigured,
    mock24Data:String(process.env.USE_MOCK_24DATA).toLowerCase()==='true'
  });
};