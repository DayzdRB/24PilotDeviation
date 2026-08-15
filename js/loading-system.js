'use strict';

(function () {
  const nativeFetch = window.fetch.bind(window);
  const activePageRequests = new Set();
  const activeSectionRequests = new Map();
  let overlayShownAt = 0;
  let overlayTimer = null;
  const bootStartedAt = performance.now();

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

    if (path === '/api/public/reports') return { mode:'page', label:'Loading public reports', detail:'Retrieving the latest public 24PD cases.' };
    if (path === '/api/public/report') return { mode:'page', label:'Loading case dossier', detail:'Retrieving case statements, evidence, and community data.' };
    if (path === '/api/community' && action === 'stats') return { mode:'page', label:'Loading community statistics', detail:'Calculating current public activity and leaderboard totals.' };
    if (path === '/api/community' && action === 'profile') return { mode:'page', label:'Loading your profile', detail:'Retrieving your Discord-backed 24PD account data.' };
    if (path === '/api/community' && action === 'myCases') return { mode:'page', label:'Loading your cases', detail:'Retrieving reports associated with your account.' };
    if (path === '/api/community' && action === 'myComments') return { mode:'page', label:'Loading your comments', detail:'Retrieving your public discussion history.' };
    if (path === '/api/community' && action === 'moderationQueue') return { mode:'page', label:'Loading moderation queue', detail:'Retrieving comments currently awaiting review.' };
    if (path === '/api/community' && action === 'comments') return { mode:'section', target:'#case-discussion', label:'Loading discussion' };
    if (path === '/api/reports/lookup') return { mode:'section', target:'.phone-shell, .respond-shell, #app', label:'Locating report' };
    if (path === '/api/aircraft' && route === 'aircraft') return { mode:'section', target:'.table-shell, #app', label:'Refreshing live aircraft' };
    return null;
  }

  function makeLoader(label, mode) {
    if (window.PPDUI?.loaderHTML) return window.PPDUI.loaderHTML(label, mode || 'section');
    return '<div class="ui-loader ui-loader-section" role="status" aria-live="polite"><span>' + String(label || 'Loading…') + '</span></div>';
  }

  function ensurePageOverlay(label, detail) {
    const app = document.getElementById('app');
    if (!app) return;
    let overlay = document.getElementById('data-fetch-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'data-fetch-overlay';
      overlay.className = 'data-fetch-overlay';
      app.appendChild(overlay);
    }
    overlay.classList.remove('is-leaving');
    overlay.innerHTML = '<div class="data-fetch-overlay__panel">' + makeLoader(label, 'full') + '<small>' + String(detail || 'Retrieving 24PD data…') + '</small></div>';
    overlayShownAt = performance.now();
  }

  function schedulePageOverlay(label, detail) {
    clearTimeout(overlayTimer);
    overlayTimer = setTimeout(function () {
      if (activePageRequests.size) ensurePageOverlay(label, detail);
    }, 90);
  }

  function hidePageOverlay() {
    if (activePageRequests.size) return;
    clearTimeout(overlayTimer);
    const overlay = document.getElementById('data-fetch-overlay');
    if (!overlay) return;
    const elapsed = performance.now() - overlayShownAt;
    const wait = Math.max(0, 240 - elapsed);
    setTimeout(function () {
      if (activePageRequests.size || !overlay.isConnected) return;
      overlay.classList.add('is-leaving');
      setTimeout(function () { overlay.remove(); }, 170);
    }, wait);
  }

  function beginSectionLoader(config) {
    const target = document.querySelector(config.target || '#app');
    if (!target) return null;
    const token = Symbol('section-loader');
    const node = document.createElement('div');
    node.className = 'data-section-loader';
    node.innerHTML = makeLoader(config.label || 'Loading data', 'section');
    if (target.firstChild) target.insertBefore(node, target.firstChild);
    else target.appendChild(node);
    activeSectionRequests.set(token, node);
    return token;
  }

  function endSectionLoader(token) {
    const node = activeSectionRequests.get(token);
    activeSectionRequests.delete(token);
    if (node?.isConnected) node.remove();
  }

  function beginLoading(config) {
    if (!config) return null;
    if (config.mode === 'section') return { mode:'section', token:beginSectionLoader(config) };
    const token = Symbol('page-loader');
    activePageRequests.add(token);
    schedulePageOverlay(config.label, config.detail);
    return { mode:'page', token };
  }

  function endLoading(handle) {
    if (!handle) return;
    if (handle.mode === 'section') return endSectionLoader(handle.token);
    activePageRequests.delete(handle.token);
    hidePageOverlay();
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

  function rerunCurrentRoute(button, label) {
    window.PPDUI?.setButtonLoading?.(button, label || 'REFRESHING…');
    setTimeout(function () {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }, 20);
  }

  function ensureRouteButtons() {
    const route = currentRoute();
    if (route === 'reports') {
      addRefreshButton('reports-refresh', 'REFRESH REPORTS', function (button) {
        window.PPDUI?.setButtonLoading?.(button, 'REFRESHING…');
        Promise.resolve(window.loadPublicReports?.()).catch(function () {
          window.PPDUI?.restoreButton?.(button);
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

  function dismissBootLoader() {
    const boot = document.getElementById('site-boot-loader');
    if (!boot || boot.dataset.dismissed === '1') return;
    const app = document.getElementById('app');
    if (!app || !app.children.length) return;
    const wait = Math.max(0, 420 - (performance.now() - bootStartedAt));
    boot.dataset.dismissed = '1';
    setTimeout(function () {
      boot.classList.add('is-ready');
      setTimeout(function () { boot.remove(); }, 240);
    }, wait);
  }

  const observer = new MutationObserver(function () {
    dismissBootLoader();
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
    dismissBootLoader();
    ensureRouteButtons();
  });

  setTimeout(function () {
    const boot = document.getElementById('site-boot-loader');
    if (boot && boot.dataset.dismissed !== '1') {
      boot.dataset.dismissed = '1';
      boot.classList.add('is-ready');
      setTimeout(function () { boot.remove(); }, 240);
    }
  }, 8000);

  ensureRouteButtons();
  dismissBootLoader();
})();