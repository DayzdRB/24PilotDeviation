'use strict';

const crypto = require('crypto');
const { post } = require('../lib/apps-script');
const {
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
  sessionUserShape
} = require('../lib/auth');

const DISCORD_API = 'https://discord.com/api/v10';
const DISCORD_AUTHORIZE = 'https://discord.com/oauth2/authorize';

function origin(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '24-pilot-deviation.vercel.app');
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return proto + '://' + host;
}

function redirectUri(req) {
  return process.env.DISCORD_REDIRECT_URI || (origin(req) + '/api/auth/discord/callback');
}

function configuredResponse(res) {
  return res.status(503).json({
    error:'discord_auth_unconfigured',
    message:'Discord sign-in is not configured yet. Add DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET in Vercel.'
  });
}

function avatarUrl(user) {
  if (!user?.id || !user?.avatar) return '';
  const ext = String(user.avatar).startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${encodeURIComponent(user.id)}/${encodeURIComponent(user.avatar)}.${ext}?size=128`;
}

async function exchangeCode(code, uri) {
  const response = await fetch(DISCORD_API + '/oauth2/token', {
    method:'POST',
    headers:{ 'Content-Type':'application/x-www-form-urlencoded', Accept:'application/json' },
    body:new URLSearchParams({
      client_id:process.env.DISCORD_CLIENT_ID,
      client_secret:process.env.DISCORD_CLIENT_SECRET,
      grant_type:'authorization_code',
      code,
      redirect_uri:uri
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    const error = new Error(body.error_description || body.error || 'Discord token exchange failed.');
    error.code = 'discord_oauth_failed';
    error.status = 502;
    throw error;
  }
  return body.access_token;
}

async function fetchDiscordUser(accessToken) {
  const response = await fetch(DISCORD_API + '/users/@me', {
    headers:{ Authorization:'Bearer ' + accessToken, Accept:'application/json' }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.id) {
    const error = new Error(body.message || 'Discord user lookup failed.');
    error.code = 'discord_profile_failed';
    error.status = 502;
    throw error;
  }
  return body;
}

async function login(req, res) {
  if (!authConfigured()) return configuredResponse(res);
  const token = createOAuthState(safeReturnTo(req.query?.returnTo));
  setOAuthState(res, token);
  const statePayload = readSignedStateFromToken(token);
  const url = new URL(DISCORD_AUTHORIZE);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', process.env.DISCORD_CLIENT_ID);
  url.searchParams.set('scope', 'identify');
  url.searchParams.set('state', statePayload.state);
  url.searchParams.set('redirect_uri', redirectUri(req));
  url.searchParams.set('prompt', 'consent');
  return res.redirect(302, url.toString());
}

// createOAuthState returns a signed token. We only need its random state value
// for Discord's state parameter; decoding the payload is safe because signature
// verification still occurs when the cookie comes back.
function readSignedStateFromToken(token) {
  try {
    const encoded = String(token).split('.')[0];
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch (_) {
    return { state:'' };
  }
}

async function callback(req, res) {
  if (!authConfigured()) return configuredResponse(res);
  const saved = readOAuthState(req);
  const suppliedState = String(req.query?.state || '');
  const code = String(req.query?.code || '');
  clearOAuthState(res);
  if (!saved?.state || !suppliedState || saved.state.length !== suppliedState.length ||
      !crypto.timingSafeEqual(Buffer.from(saved.state), Buffer.from(suppliedState))) {
    return res.status(400).send('Discord sign-in failed: invalid OAuth state. Return to 24Pilot Deviation and try again.');
  }
  if (!code) return res.status(400).send('Discord sign-in failed: authorization code missing.');

  try {
    const accessToken = await exchangeCode(code, redirectUri(req));
    const discord = await fetchDiscordUser(accessToken);
    const data = await post('upsertUser', {
      discordId:String(discord.id),
      discordUsername:String(discord.username || ''),
      displayName:String(discord.global_name || discord.username || ''),
      avatarUrl:avatarUrl(discord)
    });
    const user = sessionUserShape(data.user);
    if (user.status === 'BANNED') {
      return res.status(403).send('This Discord account is not permitted to use authenticated 24Pilot Deviation features.');
    }
    setSession(res, user);
    return res.redirect(302, '/' + safeReturnTo(saved.returnTo));
  } catch (error) {
    console.error('Discord OAuth callback failed', error);
    return res.status(Number(error.status) || 500).send('Discord sign-in could not be completed. Return to 24Pilot Deviation and try again.');
  }
}

async function me(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!authConfigured()) return res.status(200).json({ ok:true, configured:false, loggedIn:false, user:null });
  const session = getSession(req);
  if (!session) return res.status(200).json({ ok:true, configured:true, loggedIn:false, user:null });
  try {
    const user = await requireUser(req);
    setSession(res, user); // refresh signed profile/role snapshot
    return res.status(200).json({ ok:true, configured:true, loggedIn:true, user });
  } catch (error) {
    clearSession(res);
    return res.status(200).json({ ok:true, configured:true, loggedIn:false, user:null, reason:error.code || 'session_invalid' });
  }
}

function logout(req, res) {
  clearSession(res);
  clearOAuthState(res);
  return res.status(200).json({ ok:true });
}

module.exports = async function handler(req, res) {
  const action = String(req.query?.action || '').toLowerCase();
  if (action === 'login') {
    if (req.method !== 'GET') return res.status(405).json({ error:'method_not_allowed' });
    return login(req, res);
  }
  if (action === 'callback') {
    if (req.method !== 'GET') return res.status(405).json({ error:'method_not_allowed' });
    return callback(req, res);
  }
  if (action === 'me') {
    if (req.method !== 'GET') return res.status(405).json({ error:'method_not_allowed' });
    return me(req, res);
  }
  if (action === 'logout') {
    if (req.method !== 'POST') return res.status(405).json({ error:'method_not_allowed' });
    return logout(req, res);
  }
  return res.status(404).json({ error:'unknown_auth_action' });
};
