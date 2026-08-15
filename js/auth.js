'use strict';

(function () {
  const state = window.authState = { loaded:false, configured:false, loggedIn:false, user:null };
  const originalRenderFile = window.renderFile;

  function currentReturnTo() {
    return String(location.hash || '#respond');
  }

  function discordButton(id, extraClass) {
    if (window.PPDUI?.discordButtonHTML) return window.PPDUI.discordButtonHTML(id, extraClass || '');
    return '<button class="auth-login btn-discord ' + esc(extraClass || '') + '" id="' + esc(id) + '" type="button"><span class="discord-login-label">SIGN IN WITH DISCORD</span></button>';
  }

  function beginDiscordLogin(button, returnTo) {
    if (button && window.PPDUI?.setButtonLoading) window.PPDUI.setButtonLoading(button, 'SIGNING IN…');
    const target = String(returnTo || currentReturnTo());
    location.href = '/api/auth/discord?returnTo=' + encodeURIComponent(target);
  }

  window.loginWithDiscord = function (returnTo) {
    beginDiscordLogin(null, returnTo);
  };

  async function authFetch(url, options) {
    const response = await fetch(url, options || {});
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch (_) {}
    if (!response.ok) {
      const error = new Error(body.message || 'Authentication request failed.');
      error.status = response.status; error.body = body; throw error;
    }
    return body;
  }

  function initials(user) {
    const text = String(user?.displayName || user?.username || 'U').trim();
    return (text[0] || 'U').toUpperCase();
  }

  function avatarMarkup(user) {
    if (user?.avatar) return '<img src="' + esc(user.avatar) + '" alt="" referrerpolicy="no-referrer">';
    return '<span>' + esc(initials(user)) + '</span>';
  }

  function renderAuthControls() {
    const topbar = document.querySelector('.topbar');
    if (!topbar) return;
    let slot = document.getElementById('auth-slot');
    if (!slot) {
      slot = document.createElement('div');
      slot.id = 'auth-slot';
      slot.className = 'auth-slot';
      const status = document.getElementById('system-status');
      topbar.insertBefore(slot, status || null);
    }

    if (!state.loaded) {
      slot.innerHTML = window.PPDUI?.loaderHTML
        ? '<div class="auth-loading">' + window.PPDUI.loaderHTML('Checking Discord session', 'inline') + '</div>'
        : '<div class="auth-loading" aria-label="Checking Discord session"><span></span></div>';
      return;
    }

    if (!state.configured) {
      slot.innerHTML = '<button class="auth-login disabled btn-secondary" type="button" disabled title="Discord OAuth needs Vercel configuration">DISCORD SETUP</button>';
      return;
    }

    if (!state.loggedIn || !state.user) {
      slot.innerHTML = discordButton('discord-login');
      const login = document.getElementById('discord-login');
      login.onclick = function () { beginDiscordLogin(login, currentReturnTo()); };
      return;
    }

    const user = state.user;
    slot.innerHTML = '<div class="auth-user"><button class="auth-user-button ui-auth-chip" id="auth-user-button" type="button" aria-haspopup="menu" aria-expanded="false"><span class="auth-avatar">' + avatarMarkup(user) + '</span><span class="auth-name">' + esc(user.displayName || user.username) + '</span><span class="ui-chevron" aria-hidden="true">▾</span></button><div class="auth-menu" id="auth-menu" role="menu"><a href="#profile" role="menuitem">PROFILE</a><a href="#mycases" role="menuitem">MY CASES</a><a href="#mycomments" role="menuitem">MY COMMENTS</a>' + ((user.role === 'MODERATOR' || user.role === 'ADMIN') ? '<a href="#moderation" role="menuitem">MODERATION</a>' : '') + '<div class="ui-menu-separator" aria-hidden="true"></div><button type="button" id="auth-logout" role="menuitem">LOG OUT</button></div></div>';

    const button = document.getElementById('auth-user-button');
    const menu = document.getElementById('auth-menu');
    button.onclick = function () {
      const open = menu.classList.toggle('open');
      button.setAttribute('aria-expanded', String(open));
      if (open) menu.querySelector('[role="menuitem"]')?.focus();
    };
    button.onkeydown = function (event) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        menu.classList.add('open');
        button.setAttribute('aria-expanded', 'true');
        menu.querySelector('[role="menuitem"]')?.focus();
      }
    };
    menu.addEventListener('keydown', function (event) {
      const items = Array.from(menu.querySelectorAll('[role="menuitem"]'));
      const index = items.indexOf(document.activeElement);
      if (event.key === 'ArrowDown') {
        event.preventDefault(); items[(index + 1 + items.length) % items.length]?.focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault(); items[(index - 1 + items.length) % items.length]?.focus();
      } else if (event.key === 'Escape') {
        event.preventDefault(); menu.classList.remove('open'); button.setAttribute('aria-expanded', 'false'); button.focus();
      }
    });
    document.getElementById('auth-logout').onclick = logout;
  }

  function authGateMarkup() {
    if (!state.loaded) {
      const loader = window.PPDUI?.loaderHTML ? window.PPDUI.loaderHTML('Checking controller access', 'section') : '';
      return shellBanner() + '<section class="auth-gate">' + loader + '<div class="skeleton auth-gate-skeleton"></div><div class="skeleton auth-gate-line"></div><div class="skeleton auth-gate-line short"></div></section>';
    }
    if (!state.configured) {
      return shellBanner() + '<section class="auth-gate"><div class="eyebrow">Controller account</div><h1>Discord sign-in needs configuration</h1><p>ATC report filing is protected by Discord accounts. Add the Discord OAuth environment variables in Vercel before filing new reports.</p><div class="auth-gate-note">Pilot responses and public case viewing remain available without Discord login.</div></section>';
    }
    return shellBanner() + '<section class="auth-gate"><div class="eyebrow">Controller login required</div><h1>File a Possible Pilot Deviation</h1><p>Controllers must sign in with Discord before filing a report. Your Discord-backed 24PD account is used to associate the case with you and reduce duplicate/spam filing.</p>' + discordButton('file-discord-login', 'btn-lg') + '<div class="auth-gate-note">Pilots do not need Discord to respond to a 24PD.</div></section>';
  }

  if (typeof originalRenderFile === 'function') {
    window.renderFile = function () {
      if (!state.loaded || !state.loggedIn) {
        app.innerHTML = authGateMarkup();
        const login = document.getElementById('file-discord-login');
        if (login) login.onclick = function () { beginDiscordLogin(login, '#file'); };
        window.PPDUI?.enhance?.(app);
        return;
      }
      originalRenderFile();
      window.PPDUI?.enhance?.(app);
    };
  }

  function rerenderProtectedRoute() {
    if (typeof route === 'function' && route() === 'file' && typeof window.renderFile === 'function') {
      window.renderFile();
    }
  }

  async function logout() {
    const button = document.getElementById('auth-logout');
    if (button && window.PPDUI?.setButtonLoading) window.PPDUI.setButtonLoading(button, 'LOGGING OUT…');
    try { await authFetch('/api/auth/logout', { method:'POST' }); } catch (_) {}
    state.loggedIn = false; state.user = null;
    renderAuthControls();
    window.dispatchEvent(new CustomEvent('24pd:auth', { detail:state }));
    if (String(location.hash || '') === '#file') window.renderFile();
    else location.hash = 'respond';
  }

  async function loadAuth() {
    try {
      const body = await authFetch('/api/auth/me');
      state.loaded = true;
      state.configured = body.configured !== false;
      state.loggedIn = Boolean(body.loggedIn);
      state.user = body.user || null;
    } catch (error) {
      console.error('Unable to load Discord auth state', error);
      state.loaded = true; state.configured = false; state.loggedIn = false; state.user = null;
    }
    renderAuthControls();
    rerenderProtectedRoute();
    window.dispatchEvent(new CustomEvent('24pd:auth', { detail:state }));
  }

  renderAuthControls();
  rerenderProtectedRoute();
  loadAuth();

  document.addEventListener('click', function (event) {
    const menu = document.getElementById('auth-menu');
    const button = document.getElementById('auth-user-button');
    if (!menu || !button || !menu.classList.contains('open')) return;
    if (!menu.contains(event.target) && !button.contains(event.target)) {
      menu.classList.remove('open'); button.setAttribute('aria-expanded', 'false');
    }
  });
})();