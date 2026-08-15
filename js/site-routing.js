'use strict';

/*
 * Primary navigation / real-report presentation overrides.
 * Respond is the home experience. Public Reports never fall back to demo data.
 */
(function () {
  const originalRenderReports = window.renderReports;
  const originalLoadPublicReports = window.loadPublicReports;

  function normalizePrimaryRoute() {
    if (!window.location.hash || window.location.hash === '#home') {
      window.location.replace('#respond');
      return true;
    }
    return false;
  }

  function updatePrimaryNavigation() {
    const brand = document.querySelector('.brand');
    if (brand) {
      brand.href = '#respond';
      brand.setAttribute('aria-label', '24Pilot Deviation respond home');
    }

    const nav = document.getElementById('nav');
    if (!nav) return;

    nav.innerHTML = [
      '<a href="#respond" data-route="respond">Respond</a>',
      '<a href="#file" data-route="file">File Report</a>',
      '<a href="#reports" data-route="reports">Public Reports</a>'
    ].join('');
  }

  async function loadOnlyRealPublicReports() {
    try {
      const body = await api('/api/public/reports');
      state.publicReports = Array.isArray(body.reports) ? body.reports : [];
    } catch (error) {
      console.error('Unable to load real public PPD reports:', error);
      state.publicReports = [];
    }

    if (route() === 'reports') {
      window.renderReports();
    }
  }

  window.loadPublicReports = loadOnlyRealPublicReports;

  window.renderReports = function () {
    // Strip any old/demo records that may have been loaded by the original app
    // before this override initialized.
    state.publicReports = (state.publicReports || []).filter(function (report) {
      return report && report.demo !== true;
    });

    originalRenderReports();

    const head = app.querySelector('.section-head');
    if (head) {
      const paragraph = head.querySelector('p');
      if (paragraph) {
        paragraph.textContent = 'Published reports from the live 24Pilot Deviation datastore. Fictional sample cases are not shown.';
      }
    }

    const empty = app.querySelector('#reports-grid .empty-state');
    if (empty && state.publicReports.length === 0) {
      empty.innerHTML = '<strong>No published PPD reports yet</strong>Real reports will appear here when they are added to the PublicReports datastore.';
    }
  };

  updatePrimaryNavigation();

  if (!normalizePrimaryRoute()) {
    // Re-render once so the new three-button navigation gets the correct active state.
    if (typeof render === 'function') render();
  }

  window.addEventListener('hashchange', function () {
    if (!normalizePrimaryRoute()) updatePrimaryNavigation();
  });

  // The original app may have started its demo fallback fetch before this script
  // loaded. Refresh from the real endpoint after page load and replace that state.
  window.addEventListener('load', function () {
    updatePrimaryNavigation();
    loadOnlyRealPublicReports();
  }, { once: true });
})();
