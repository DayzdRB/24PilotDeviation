'use strict';

const { post } = require('../../lib/apps-script');
const { allowMethod, isSafeCaseId } = require('../../lib/security');
const { requireUser } = require('../../lib/auth');

const ALLOWED = new Set(['ATC', 'PILOT', 'INCONCLUSIVE']);

module.exports = async function handler(req, res) {
  if (!allowMethod(req, res, ['POST'])) return;
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const caseId = String(body.caseId || '').trim().toUpperCase();
  const vote = String(body.vote || '').trim().toUpperCase();

  if (!isSafeCaseId(caseId)) return res.status(400).json({ error:'invalid_case_id', message:'Invalid case ID.' });
  if (!ALLOWED.has(vote)) return res.status(400).json({ error:'invalid_vote', message:'Vote must be ATC, PILOT, or INCONCLUSIVE.' });

  try {
    const user = await requireUser(req);
    const data = await post('vote', { caseId, vote, userId:user.id });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok:true,
      caseId:data.caseId,
      vote:data.vote,
      votes:data.votes,
      communityVerdict:data.communityVerdict,
      viewerVote:data.vote
    });
  } catch (error) {
    console.error('community vote failed', error);
    return res.status(Number(error.status) || 500).json({
      error:error.code || 'vote_failed',
      message:error.message || 'Unable to record this vote.'
    });
  }
};
