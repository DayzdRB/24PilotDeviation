'use strict';
const { configured } = require('../lib/sheets');
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error:'method_not_allowed' });
  res.status(200).json({ ok:true, sheetsConfigured:configured(), mock24Data:String(process.env.USE_MOCK_24DATA).toLowerCase()==='true' });
};
