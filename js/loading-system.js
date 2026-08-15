'use strict';

(function () {
  const nativeFetch = window.fetch.bind(window);
  const activePageRequests = new Map();
  const activeSectionRequests = new Map();
  const activeBootRequests = new Set();
  const bootStartedAt = performance.now();
  const PAGE_MIN_MS = 650;
  const SECTION_MIN_MS = 450;
  const BOOT_MIN_MS = 900;
  let pageOverlay = null;
  let pageOverlayStartedAt = 0;

  function currentRoute() {
    return String(location.hash || '#respond').replace(/^#/, '').toLowerCase();
  }

  function requestUrl(input) {
    try {
      if (typeof input === 'string') return new URL(input, location.origin);
      if (input && input.url) return new URL(input.url, location.origin);
    } catch (_) {}
    return null;
  }

  function requestMethod(input, init) {
    return String(init?.method || input?.method || 'GET').toUpperCase();
  }

  function classifyRequest(input, init) {
    const url = requestUrl(input);
    if (!url || url.origin !== location.origin) return null;
    const method = requestMethod(input, init);
    if (method !== 'GET') return null;

    const path = url.pathname;
    const action = url.searchParams.get('action') || '';
    const route = currentRoute();

    if (path === '/api/health') {
      return { mode:'boot', label:'Connecting to 24PD services' };
    }
    if (path === '/api/public/reports') {
      return { mode:'page', boot:true, label:'Loading public reports', detail:'Retrieving the latest public 24PD cases.' };
    }
    if (path === '/api/public/report') {
      return { mode:'page', label:'Loading case dossier', detail:'Retrieving case statements, evidence, and community data.' };
    }
    if (path === '/api/community' && action === 'stats') {
      return { mode:'page', label:'Loading community statistics', detail:'Calculating current public activity and leaderboard totals.' };
    }
    if (path === '/api/community' && action === 'profile') {
      return { mode:'page', label:'Loading your profile', detail:'Retrieving your Discord-backed 24PD account data.' };
    }
    if (path === '/api/community' && action === 'myCases') {
      return { mode:'page', label:'Loading your cases', detail:'Retrieving reports associated with your account.' };
    }
    if (path === '/api/community' && action === 'myComments') {
      return { mode:'page', label:'Loading your comments', detail:'Retrieving your public discussion history.' };
    }
    if (path === '/api/community' && action === 'moderationQueue') {
      return { mode:'page', label:'Loading moderation queue', detail:'Retrieving comments currently awaiting review.' };
    }
    if (path === '/api/community' && action === 'comments') {
      return { mode:'section', target:'#case-discussion', label:'Loading discussion' };
    }
    if (path === '/api/reports/lookup') {
      return { mode:'section', target:'.phone-shell, .respond-shell, #app', label:'Locating report' };
    }
    if (path === '/api/reports/status') {
      return { mode:'section', target:'#controller-tracker, #app', label:'Refreshing case status' };
    }
    if (path === '/api/aircraft' && route === 'aircraft') {
      return { mode:'section', target:'.table-shell, #app', label:'Refreshing live aircraft' };
    }
    if (path === '/api/auth/me' && !document.querySelector('#app > *')) {
      return { mode:'boot', label:'Checking Discord session' };
    }
    return null;
  }

  function makeLoader(label, mode) {
    if (window.PPDUI?.loaderHTML) return window.PPDUI.loaderHTML(label, mode || 'section');
    return '<div class="ui-loader ui-loader-section" role="status" aria-live="polite"><span>' + String(label || 'Loading…') + '</span></div>';
  }

  function ensurePageOverlay(label, detail) {
    const app = document.getElementById('app');
    if (!app) return;
    if (!pageOverlay || !pageOverlay.isConnected) {
      pageOverlay = document.createElement('div');
      pageOverlay.id = 'data-fetch-overlay';
      pageOverlay.className = 'data-fetch-overlay';
      app.appendChild(pageOverlay);
    }
    pageOverlay.classList.remove('is-leaving');
    pageOverlay.innerHTML = '<div class="data-fetch-overlay__panel">' + makeLoader(label, 'full') + '<small>' + String(detail || 'Retrieving 24PD data…') + '</small></div>';
    pageOverlayStartedAt = performance.now();
  }

  function removePageOverlayWhenReady() {
    if (activePageRequests.size || !pageOverlay?.isConnected) return;
    const elapsed = performance.now() - pageOverlayStartedAt;
    const wait = Math.max(0, PAGE_MIN_MS - elapsed);
    setTimeout(function () {
      if (activePageRequests.size || !pageOverlay?.isConnected) return;
      pageOverlay.classList.add('is-leaving');
      setTimeout(function () {
        if (!activePageRequests.size && pageOverlay?.isConnected) pageOverlay.remove();
      }, 180);
    }, wait);
  }

  function beginPageLoader(config) {
    const token = Symbol('page-loader');
    activePageRequests.set(token, performance.now());
    ensurePageOverlay(config.label, config.detail);
    return token;
  }

  function endPageLoader(token) {
    activePageRequests.delete(token);
    removePageOverlayWhenReady();
  }

  function beginSectionLoader(config) {
    const target = document.querySelector(config.target || '#app');
    if (!target) return null;
    const token = Symbol('section-loader');
    const node = document.createElement('div');
    node.className = 'data-section-loader';
    node.innerHTML = makeLoader(config.label || 'Loading data', 'section');
    target.prepend(node);
    activeSectionRequests.set(token, { node, startedAt:performance.now() });
    return token;
  }

  function endSectionLoader(token) {
    const entry = activeSectionRequests.get(token);
    activeSectionRequests.delete(token);
    if (!entry?.node) return;
    const elapsed = performance.now() - entry.startedAt;
    const wait = Math.max(0, SECTION_MIN_MS - elapsed);
    setTimeout(function () {
      if (entry.node.isConnected) {
        entry.node.classList.add('is-leaving');
        setTimeout(function () { if (entry.node.isConnected) entry.node.remove(); }, 150);
      }
    }, wait);
  }

  function beginBootRequest() {
    const token = Symbol('boot-request');
    activeBootRequests.add(token);
    return token;
  }

  function endBootRequest(token) {
    activeBootRequests.delete(token);
    maybeDismissBootLoader();
  }

  function beginLoading(config) {
    if (!config) return null;
    const handle = { mode:config.mode, token:null, bootToken:null };
    if (config.boot || config.mode === 'boot') handle.bootToken = beginBootRequest();
    if (config.mode === 'page') handle.token = beginPageLoader(config);
    else if (config.mode === 'section') handle.token = beginSectionLoader(config);
    return handle;
  }

  function endLoading(handle) {
    if (!handle) return;
    if (handle.mode === 'page') endPageLoader(handle.token);
    if (handle.mode === 'section') endSectionLoader(handle.token);
    if (handle.bootToken) endBootRequest(handle.bootToken);
  }

  window.fetch = async function (input, init) {
    const config = classifyRequest(input, init);
    const handle = beginLoading(config);
    try {
      return await nativeFetch(input, init);
    } finally {
      endLoading(handle);
    }
  };

  function buttonArea(head) {
    let actions = head.querySelector('.section-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'section-actions ui-page-actions';
      head.appendChild(actions);
    } else {
      actions.classList.add('ui-page-actions');
    }
    return actions;
  }

  function addRefreshButton(id, text, handler) {
    const head = document.querySelector('#app .section-head');
    if (!head || document.getElementById(id)) return;
    const actions = buttonArea(head);
    const button = document.createElement('button');
    button.id = id;
    button.type = 'button';
    button.className = 'btn btn-secondary ui-refresh-button';
    button.textContent = text;
    button.onclick = function () { handler(button); };
    actions.appendChild(button);
    window.PPDUI?.enhance?.(actions);
  }

  function rerunCurrentRoute(button, loadingText) {
    window.PPDUI?.setButtonLoading?.(button, loadingText || 'REFRESHING…');
    setTimeout(function () {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }, 30);
  }

  function ensureRouteButtons() {
    const route = currentRoute();
    if (route === 'reports') {
      addRefreshButton('reports-refresh', 'REFRESH REPORTS', function (button) {
        window.PPDUI?.setButtonLoading?.(button, 'REFRESHING…');
        Promise.resolve(window.loadPublicReports?.()).finally(function () {
          setTimeout(function () { window.PPDUI?.restoreButton?.(button); }, PAGE_MIN_MS);
        });
      });
      return;
    }
    if (route === 'community') {
      addRefreshButton('community-refresh', 'REFRESH STATISTICS', function (button) { rerunCurrentRoute(button, 'REFRESHING…'); });
      return;
    }
    if (route === 'mycases') {
      addRefreshButton('mycases-refresh', 'REFRESH CASES', function (button) { rerunCurrentRoute(button, 'REFRESHING…'); });
      return;
    }
    if (route === 'mycomments') {
      addRefreshButton('mycomments-refresh', 'REFRESH COMMENTS', function (button) { rerunCurrentRoute(button, 'REFRESHING…'); });
      return;
    }
    if (route === 'moderation') {
      addRefreshButton('moderation-refresh', 'REFRESH QUEUE', function (button) { rerunCurrentRoute(button, 'REFRESHING…'); });
    }
  }

  function refreshReportsWhenEntered() {
    if (currentRoute() !== 'reports') return;
    setTimeout(function () {
      if (typeof window.loadPublicReports === 'function') window.loadPublicReports();
    }, 0);
  }

  function maybeDismissBootLoader() {
    const boot = document.getElementById('site-boot-loader');
    if (!boot || boot.dataset.dismissed === '1') return;
    const app = document.getElementById('app');
    if (!app || !app.children.length || activeBootRequests.size) return;
    const elapsed = performance.now() - bootStartedAt;
    const wait = Math.max(0, BOOT_MIN_MS - elapsed);
    boot.dataset.dismissed = '1';
    setTimeout(function () {
      boot.classList.add('is-ready');
      setTimeout(function () { if (boot.isConnected) boot.remove(); }, 260);
    }, wait);
  }

  const observer = new MutationObserver(function () {
    maybeDismissBootLoader();
    ensureRouteButtons();
  });

  const app = document.getElementById('app');
  if (app) observer.observe(app, { childList:true, subtree:true });

  window.addEventListener('hashchange', function () {
    setTimeout(function () {
      ensureRouteButtons();
      refreshReportsWhenEntered();
    }, 0);
  });

  window.addEventListener('load', function () {
    maybeDismissBootLoader();
    ensureRouteButtons();
  });

  setTimeout(function () {
    const boot = document.getElementById('site-boot-loader');
    if (boot && boot.dataset.dismissed !== '1') {
      boot.dataset.dismissed = '1';
      boot.classList.add('is-ready');
      setTimeout(function () { if (boot.isConnected) boot.remove(); }, 260);
    }
  }, 12000);

  ensureRouteButtons();
  maybeDismissBootLoader();
})();