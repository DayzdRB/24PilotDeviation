'use strict';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyjfGBGWItb-vBU8DoazyjAosd6mPf-HAr2LWUPiRv2z1a48daiZbTUwRaOcHiM_aSLxA/exec';

function configured() {
  return Boolean(process.env.APPS_SCRIPT_SECRET);
}

function statusForError(code) {
  if (code === 'unauthorized') return 401;
  if (['forbidden','account_banned','account_muted'].includes(code)) return 403;
  if (['report_not_found','report_not_public','user_not_found','comment_not_found'].includes(code)) return 404;
  if (['response_already_submitted','number_generation_failed','duplicate_vote','community_voting_closed','duplicate_comment','duplicate_comment_report','cannot_report_own_comment'].includes(code)) return 409;
  if (code === 'comment_rate_limited') return 429;
  if ([
    'missing_required_fields','invalid_ppd_number','invalid_case_id','invalid_body','invalid_json','invalid_vote',
    'invalid_voter_hash','invalid_discord_id','invalid_report_reason','invalid_parent_comment','comment_too_short',
    'comment_not_editable','invalid_moderation_action'
  ].includes(code)) return 400;
  if (['data_store_unconfigured','secret_unconfigured','missing_sheet','datastore_busy'].includes(code)) return 503;
  return 502;
}

async function parseResponse(response) {
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); }
  catch (_) {
    const err = new Error('Apps Script returned a non-JSON response.');
    err.code = 'apps_script_invalid_response';
    err.status = 502;
    err.details = text.slice(0, 500);
    throw err;
  }
  if (!data || data.ok !== true) {
    const err = new Error(data?.message || data?.error || 'Apps Script request failed.');
    err.code = data?.error || 'apps_script_request_failed';
    err.status = statusForError(err.code);
    throw err;
  }
  return data;
}

async function get(action, params = {}, requireAuth = true) {
  if (requireAuth && !configured()) {
    const err = new Error('APPS_SCRIPT_SECRET is not configured.');
    err.code = 'data_store_unconfigured'; err.status = 503; throw err;
  }
  const url = new URL(APPS_SCRIPT_URL);
  url.searchParams.set('action', action);
  if (requireAuth) url.searchParams.set('secret', process.env.APPS_SCRIPT_SECRET);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, { method:'GET', redirect:'follow', headers:{ Accept:'application/json' } });
  return parseResponse(response);
}

async function post(action, payload = {}) {
  if (!configured()) {
    const err = new Error('APPS_SCRIPT_SECRET is not configured.');
    err.code = 'data_store_unconfigured'; err.status = 503; throw err;
  }
  const response = await fetch(APPS_SCRIPT_URL, {
    method:'POST', redirect:'follow',
    headers:{ Accept:'application/json', 'Content-Type':'application/json' },
    body:JSON.stringify({ ...payload, action, secret:process.env.APPS_SCRIPT_SECRET })
  });
  return parseResponse(response);
}

module.exports = { APPS_SCRIPT_URL, configured, get, post };
