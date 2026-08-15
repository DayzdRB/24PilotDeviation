'use strict';

const crypto = require('crypto');
const { get } = require('./apps-script');

const SESSION_COOKIE = '24pd_session';
const OAUTH_COOKIE = '24pd_oauth_state';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const OAUTH_TTL_SECONDS = 10 * 60;

function secret() {
  return process.env.SESSION_SECRET || process.env.APPS_SCRIPT_SECRET || '';
}

function authConfigured() {
  return Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET && secret());
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function unbase64url(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function hmac(value) {
  const key = secret();
  if (!key) return '';
  return crypto.createHmac('sha256', key).update(value).digest('base64url');
}

function signPayload(payload) {
  const encoded = base64url(JSON.stringify(payload));
  return encoded + '.' + hmac(encoded);
}

function verifyPayload(token, expectedType) {
  if (!token || typeof token !== 'string' || !secret()) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const expected = hmac(parts[0]);
  const supplied = parts[1];
  if (!expected || expected.length !== supplied.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return null;
  let payload;
  try { payload = JSON.parse(unbase64url(parts[0])); } catch (_) { return null; }
  if (!payload || (expectedType && payload.type !== expectedType)) return null;
  if (!Number.isFinite(payload.exp) || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function parseCookies(req) {
  const header = String(req.headers?.cookie || '');
  const out = {};
  header.split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  });
  return out;
}

function cookie(name, value, options = {}) {
  const chunks = [name + '=' + encodeURIComponent(value || '')];
  chunks.push('Path=/');
  chunks.push('HttpOnly');
  chunks.push('Secure');
  chunks.push('SameSite=Lax');
  if (options.maxAge !== undefined) chunks.push('Max-Age=' + Math.max(0, Math.floor(options.maxAge)));
  return chunks.join('; ');
}

function appendSetCookie(res, value) {
  const current = res.getHeader('Set-Cookie');
  if (!current) res.setHeader('Set-Cookie', value);
  else if (Array.isArray(current)) res.setHeader('Set-Cookie', current.concat(value));
  else res.setHeader('Set-Cookie', [current, value]);
}

function safeReturnTo(value) {
  const text = String(value || '#respond').trim();
  if (/^#[A-Za-z0-9/_-]{1,160}$/.test(text)) return text;
  return '#respond';
}

function createOAuthState(returnTo) {
  const now = Math.floor(Date.now() / 1000);
  return signPayload({
    type: 'oauth',
    state: crypto.randomBytes(24).toString('hex'),
    returnTo: safeReturnTo(returnTo),
    iat: now,
    exp: now + OAUTH_TTL_SECONDS
  });
}

function setOAuthState(res, token) {
  appendSetCookie(res, cookie(OAUTH_COOKIE, token, { maxAge: OAUTH_TTL_SECONDS }));
}

function readOAuthState(req) {
  const token = parseCookies(req)[OAUTH_COOKIE];
  return verifyPayload(token, 'oauth');
}

function clearOAuthState(res) {
  appendSetCookie(res, cookie(OAUTH_COOKIE, '', { maxAge: 0 }));
}

function sessionUserShape(user) {
  return {
    id: String(user?.id || user?.UserID || ''),
    discordId: String(user?.discordId || user?.DiscordID || ''),
    username: String(user?.username || user?.DiscordUsername || ''),
    displayName: String(user?.displayName || user?.DisplayName || user?.username || user?.DiscordUsername || ''),
    avatar: String(user?.avatar || user?.AvatarURL || ''),
    robloxUsername: String(user?.robloxUsername || user?.RobloxUsername || ''),
    role: String(user?.role || user?.Role || 'USER').toUpperCase(),
    status: String(user?.status || user?.Status || 'ACTIVE').toUpperCase()
  };
}

function createSession(user) {
  const safe = sessionUserShape(user);
  if (!safe.id || !safe.discordId) throw new Error('Cannot create a session without a user identity.');
  const now = Math.floor(Date.now() / 1000);
  return signPayload({ type:'session', user:safe, iat:now, exp:now + SESSION_TTL_SECONDS });
}

function setSession(res, user) {
  appendSetCookie(res, cookie(SESSION_COOKIE, createSession(user), { maxAge: SESSION_TTL_SECONDS }));
}

function clearSession(res) {
  appendSetCookie(res, cookie(SESSION_COOKIE, '', { maxAge: 0 }));
}

function getSession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  const payload = verifyPayload(token, 'session');
  return payload?.user ? sessionUserShape(payload.user) : null;
}

function authError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

async function requireUser(req, options = {}) {
  const session = getSession(req);
  if (!session?.id) throw authError('login_required', 'Sign in with Discord to continue.', 401);

  // Refresh role/status/profile data from Google so a stale cookie cannot bypass
  // a mute/ban/role change. The cookie itself only proves the signed identity.
  let data;
  try {
    data = await get('user', { userId: session.id }, true);
  } catch (error) {
    if (error.code === 'report_not_found' || error.code === 'user_not_found') {
      throw authError('login_required', 'Your 24PD account could not be found. Sign in again.', 401);
    }
    throw error;
  }
  const user = sessionUserShape(data.user);
  if (!user.id) throw authError('login_required', 'Sign in with Discord to continue.', 401);
  if (user.status === 'BANNED') throw authError('account_banned', 'This account is not permitted to use authenticated 24PD features.', 403);
  if (options.requireCommentAccess && user.status === 'MUTED') {
    throw authError('account_muted', 'This account is currently muted from community discussion.', 403);
  }
  if (options.roles && !options.roles.includes(user.role)) {
    throw authError('forbidden', 'You do not have permission to perform this action.', 403);
  }
  return user;
}

module.exports = {
  SESSION_COOKIE,
  OAUTH_COOKIE,
  authConfigured,
  safeReturnTo,
  createOAuthState,
  setOAuthState,
  readOAuthState,
  clearOAuthState,
  setSession,
  clearSession,
  getSession,
  requireUser,
  sessionUserShape,
  authError
};
