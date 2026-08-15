'use strict';

(function () {
  const fetchWithLoaders = window.fetch.bind(window);
  let bootstrapArchiveBypassed = false;

  function shouldBypass(input, init) {
    if (bootstrapArchiveBypassed || document.readyState === 'complete') return false;
    const method = String(init?.method || input?.method || 'GET').toUpperCase();
    if (method !== 'GET') return false;

    try {
      const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
      const route = String(location.hash || '#respond').replace(/^#/, '').toLowerCase();
      return url.origin === location.origin && url.pathname === '/api/public/reports' && route !== 'reports';
    } catch (_) {
      return false;
    }
  }

  window.fetch = function (input, init) {
    if (shouldBypass(input, init)) {
      bootstrapArchiveBypassed = true;
      // app.js historically waits for the public archive before rendering any page.
      // Home/Respond do not need that archive, so let startup continue immediately;
      // site-routing.js performs the real archive refresh after the UI is available.
      return Promise.resolve(new Response(JSON.stringify({ ok:true, reports:[] }), {
        status:200,
        headers:{ 'Content-Type':'application/json', 'X-24PD-Bootstrap':'1' }
      }));
    }
    return fetchWithLoaders(input, init);
  };
})();