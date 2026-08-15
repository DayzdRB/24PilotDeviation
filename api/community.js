'use strict';

const { get, post } = require('../lib/apps-script');
const { cleanText, isSafeCaseId } = require('../lib/security');
const { getSession, requireUser } = require('../lib/auth');

function jsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) {
    try { return JSON.parse(req.body); } catch (_) { return {}; }
  }
  return {};
}

function int(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function safePublicComment(comment, viewerId) {
  return {
    id:cleanText(comment.id || comment.CommentID, 80),
    caseId:cleanText(comment.caseId || comment.CaseID, 40),
    parentCommentId:cleanText(comment.parentCommentId || comment.ParentCommentID, 80),
    body:cleanText(comment.body || comment.Body, 1500),
    status:cleanText(comment.status || comment.Status || 'VISIBLE', 30),
    createdAt:cleanText(comment.createdAt || comment.CreatedAt, 60),
    updatedAt:cleanText(comment.updatedAt || comment.UpdatedAt, 60),
    author:{
      displayName:cleanText(comment.author?.displayName || comment.DisplayName || '24PD User', 80),
      username:cleanText(comment.author?.username || comment.DiscordUsername || '', 80),
      avatar:cleanText(comment.author?.avatar || comment.AvatarURL || '', 500),
      role:cleanText(comment.author?.role || comment.Role || 'USER', 20)
    },
    reportCount:Number(comment.reportCount || comment.ReportCount || 0),
    canEdit:Boolean(viewerId && String(comment.userId || comment.UserID || '') === String(viewerId))
  };
}

async function handleGet(req, res, action) {
  if (action === 'comments') {
    const caseId = String(req.query?.caseId || '').trim().toUpperCase();
    if (!isSafeCaseId(caseId)) return res.status(400).json({ error:'invalid_case_id' });
    const offset = int(req.query?.offset, 0, 0, 10000);
    const limit = int(req.query?.limit, 20, 1, 30);
    const data = await get('comments', { caseId, offset, limit }, true);
    const viewer = getSession(req);
    return res.status(200).json({
      ok:true,
      comments:(data.comments || []).map(c => safePublicComment(c, viewer?.id)),
      total:Number(data.total || 0),
      nextOffset:data.nextOffset === null || data.nextOffset === undefined ? null : Number(data.nextOffset)
    });
  }

  if (action === 'stats') {
    const data = await get('communityStats', {}, true);
    // Public aggregate data can be cached briefly at the edge. This avoids an
    // Apps Script round-trip every time someone opens Community.
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
    return res.status(200).json({ ok:true, stats:data.stats || {} });
  }

  if (action === 'profile') {
    const user = await requireUser(req);
    const data = await get('userProfile', { userId:user.id }, true);
    return res.status(200).json({ ok:true, profile:data.profile || {} });
  }

  if (action === 'mycases') {
    const user = await requireUser(req);
    const data = await get('myCases', { userId:user.id }, true);
    return res.status(200).json({ ok:true, cases:data.cases || [] });
  }

  if (action === 'mycomments') {
    const user = await requireUser(req);
    const data = await get('myComments', { userId:user.id }, true);
    return res.status(200).json({ ok:true, comments:data.comments || [] });
  }

  if (action === 'moderationqueue') {
    const moderator = await requireUser(req, { roles:['MODERATOR','ADMIN'] });
    const data = await get('moderationQueue', { moderatorUserId:moderator.id }, true);
    return res.status(200).json({ ok:true, queue:data.queue || {} });
  }

  return res.status(404).json({ error:'unknown_community_action' });
}

async function handlePost(req, res, action) {
  const body = jsonBody(req);

  if (action === 'profileupdate') {
    const user = await requireUser(req);
    const data = await post('updateUserProfile', {
      userId:user.id,
      robloxUsername:cleanText(body.robloxUsername, 60)
    });
    return res.status(200).json({ ok:true, user:data.user });
  }

  if (action === 'commentcreate') {
    const user = await requireUser(req, { requireCommentAccess:true });
    const caseId = String(body.caseId || '').trim().toUpperCase();
    if (!isSafeCaseId(caseId)) return res.status(400).json({ error:'invalid_case_id' });
    const data = await post('createComment', {
      caseId,
      userId:user.id,
      parentCommentId:cleanText(body.parentCommentId, 80),
      body:cleanText(body.body, 1500)
    });
    return res.status(201).json({ ok:true, comment:safePublicComment(data.comment, user.id) });
  }

  if (action === 'commentedit') {
    const user = await requireUser(req);
    const data = await post('editComment', {
      userId:user.id,
      commentId:cleanText(body.commentId, 80),
      body:cleanText(body.body, 1500)
    });
    return res.status(200).json({ ok:true, comment:safePublicComment(data.comment, user.id) });
  }

  if (action === 'commentdelete') {
    const user = await requireUser(req);
    const data = await post('deleteComment', {
      userId:user.id,
      commentId:cleanText(body.commentId, 80)
    });
    return res.status(200).json({ ok:true, commentId:data.commentId });
  }

  if (action === 'commentreport') {
    const user = await requireUser(req);
    const allowedReasons = new Set(['Spam','Harassment','Personal Attack','Off Topic','Inappropriate Content','Other']);
    const reason = cleanText(body.reason, 80);
    if (!allowedReasons.has(reason)) return res.status(400).json({ error:'invalid_report_reason' });
    const data = await post('reportComment', {
      userId:user.id,
      commentId:cleanText(body.commentId, 80),
      reason,
      details:cleanText(body.details, 500)
    });
    return res.status(200).json({ ok:true, status:data.status, reportCount:Number(data.reportCount || 0) });
  }

  if (action === 'moderate') {
    const moderator = await requireUser(req, { roles:['MODERATOR','ADMIN'] });
    const allowed = new Set(['HIDE','DELETE','RESTORE','WARN','MUTE','BAN']);
    const moderationAction = String(body.moderationAction || '').trim().toUpperCase();
    if (!allowed.has(moderationAction)) return res.status(400).json({ error:'invalid_moderation_action' });
    const data = await post('moderate', {
      moderatorUserId:moderator.id,
      commentId:cleanText(body.commentId, 80),
      targetUserId:cleanText(body.targetUserId, 80),
      caseId:cleanText(body.caseId, 40),
      moderationAction,
      reason:cleanText(body.reason, 500)
    });
    return res.status(200).json({ ok:true, result:data.result || {} });
  }

  return res.status(404).json({ error:'unknown_community_action' });
}

module.exports = async function handler(req, res) {
  const action = String(req.query?.action || '').trim().toLowerCase();
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') return await handleGet(req, res, action);
    if (req.method === 'POST') return await handlePost(req, res, action);
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error:'method_not_allowed' });
  } catch (error) {
    console.error('community API failed', action, error);
    return res.status(Number(error.status) || 500).json({
      error:error.code || 'community_request_failed',
      message:error.message || 'Unable to complete this request.'
    });
  }
};