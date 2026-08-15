'use strict';

const { configured, get } = require('../lib/apps-script');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error:'method_not_allowed' });

  let appsScriptReachable = false;
  try {
    const health = await get('health', {}, false);
    appsScriptReachable = health?.ok === true;
  } catch (error) {
    console.error('Apps Script health check failed:', error.message);
  }

  return res.status(200).json({
    ok:true,
    dataStore:'google-apps-script',
    appsScriptReachable,
    appsScriptConfigured:configured(),
    mock24Data:String(process.env.USE_MOCK_24DATA).toLowerCase()==='true'
  });
};
