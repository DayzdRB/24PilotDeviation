'use strict';

const crypto = require('crypto');
const { post } = require('../../lib/apps-script');
const { allowMethod, isSafeCaseId, cleanText } = require('../../lib/security');

const ALLOWED = new Set(['ATC', 'PILOT', 'INCONCLUSIVE']);
const recent = new Map();

function voterHash(token) {
  const key = process.env.APPS_SCRIPT_SECRET;
  if (!key) {
    const error = new Error('Voting backend is not configured.');
    error.code = 'data_store_unconfigured';
    error.status = 503;
    throw error;
  }
  return crypto.createHmac('sha256', key).update(token, 'utf8').digest('hex');
}

function rateLimited(hash) {
  const now = Date.now();
  const previous = recent.get(hash) || 0;
  recent.set(hash, now);
  if (recent.size > 500) {
    for (const [key, at] of recent) if (now - at > 60000) recent.delete(key);
  }
  return now - previous < 2500;
}

module.exports = async function handler(req, res) {
  if (!allowMethod(req, res, ['POST'])) return;

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const caseId = String(body.caseId || '').trim().toUpperCase();
  const vote = String(body.vote || '').trim().toUpperCase();
  const voterToken = cleanText(body.voterToken, 200);

  if (!isSafeCaseId(caseId)) {
    return res.status(400).json({ error:'invalid_case_id', message:'Invalid case ID.' });
  }
  if (!ALLOWED.has(vote)) {
    return res.status(400).json({ error:'invalid_vote', message:'Vote must be ATC, PILOT, or INCONCLUSIVE.' });
  }
  if (voterToken.length < 16) {
    return res.status(400).json({ error:'invalid_voter_token', message:'Voting token is missing or invalid.' });
  }

  try {
    const hash = voterHash(voterToken);
    if (rateLimited(hash)) {
      return res.status(429).json({ error:'rate_limited', message:'Please wait a moment before voting again.' });
    }

    const data = await post('vote', { caseId, vote, voterHash:hash });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok:true,
      caseId:data.caseId,
      vote:data.vote,
      votes:data.votes,
      communityVerdict:data.communityVerdict
    });
  } catch (error) {
    console.error('community vote failed', error);
    const status = Number(error.status) || 500;
    return res.status(status).json({
      error:error.code || 'vote_failed',
      message:error.message || 'Unable to record this vote.'
    });
  }
};
