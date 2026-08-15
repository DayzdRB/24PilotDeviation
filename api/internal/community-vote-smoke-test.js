'use strict';

const crypto = require('crypto');
const { post } = require('../../lib/apps-script');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error:'method_not_allowed' });
  }

  try {
    const secret = process.env.APPS_SCRIPT_SECRET;
    if (!secret) return res.status(503).json({ error:'data_store_unconfigured' });
    const voterHash = crypto.createHmac('sha256', secret)
      .update('24pd-community-vote-smoke-test-v1', 'utf8')
      .digest('hex');
    const data = await post('vote', {
      caseId:'PPD-2026-0815-0004',
      vote:'INCONCLUSIVE',
      voterHash
    });
    return res.status(200).json({ ok:true, vote:data.vote, votes:data.votes, communityVerdict:data.communityVerdict });
  } catch (error) {
    return res.status(Number(error.status) || 500).json({ error:error.code || 'smoke_test_failed', message:error.message });
  }
};
