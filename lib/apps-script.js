'use strict';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz3sg2Q2ysTL4Zwl4n1nRK5XI8Cplu-GQQhMmzpPgAnMmO9U6-GZnvgr68QPU40WsPirQ/exec';

function configured() {
  return Boolean(process.env.APPS_SCRIPT_SECRET);
}

function statusForError(code) {
  if (code === 'unauthorized') return 401;
  if (code === 'report_not_found') return 404;
  if (code === 'response_already_submitted' || code === 'number_generation_failed') return 409;
  if (code === 'missing_required_fields' || code === 'invalid_ppd_number' || code === 'invalid_case_id' || code === 'invalid_body' || code === 'invalid_json') return 400;
  if (code === 'data_store_unconfigured' || code === 'secret_unconfigured') return 503;
  return 502;
}

async function parseResponse(response) {
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
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
    err.code = 'data_store_unconfigured';
    err.status = 503;
    throw err;
  }

  const url = new URL(APPS_SCRIPT_URL);
  url.searchParams.set('action', action);
  if (requireAuth) url.searchParams.set('secret', process.env.APPS_SCRIPT_SECRET);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    headers: { Accept: 'application/json' }
  });

  return parseResponse(response);
}

async function post(action, payload = {}) {
  if (!configured()) {
    const err = new Error('APPS_SCRIPT_SECRET is not configured.');
    err.code = 'data_store_unconfigured';
    err.status = 503;
    throw err;
  }

  const response = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ...payload, action, secret: process.env.APPS_SCRIPT_SECRET })
  });

  return parseResponse(response);
}

module.exports = { APPS_SCRIPT_URL, configured, get, post };
