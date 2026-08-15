'use strict';

/*
 * Primary navigation, controller case tracking, tutorial page, and real-only
 * public report presentation.
 */
(function () {
  const TRACK_KEY = '24pd_controller_cases';
  const originalRenderReports = window.renderReports;
  const originalRenderFile = window.renderFile;
  const originalRenderIssued = window.renderIssued;

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
      brand.setAttribute('aria-label', '24Pilot Deviation home');
    }

    const nav = document.getElementById('nav');
    if (!nav) return;

    nav.innerHTML = [
      '<a href="#respond" data-route="respond">Home</a>',
      '<a href="#file" data-route="file">File Report</a>',
      '<a href="#reports" data-route="reports">Public Reports</a>',
      '<a href="#howto" data-route="howto">How To</a>'
    ].join('');

    const current = route() === 'howto' ? 'howto' : route();
    nav.querySelectorAll('[data-route]').forEach(function (link) {
      link.classList.toggle('active', link.dataset.route === current);
    });
  }

  async function loadOnlyRealPublicReports() {
    try {
      const body = await api('/api/public/reports');
      state.publicReports = Array.isArray(body.reports) ? body.reports : [];
    } catch (error) {
      console.error('Unable to load real public PPD reports:', error);
      state.publicReports = [];
    }

    if (route() === 'reports') window.renderReports();
  }

  window.loadPublicReports = loadOnlyRealPublicReports;

  window.renderReports = function () {
    state.publicReports = (state.publicReports || []).filter(function (report) {
      return report && report.demo !== true;
    });

    originalRenderReports();

    const head = app.querySelector('.section-head');
    if (head) {
      const paragraph = head.querySelector('p');
      if (paragraph) {
        paragraph.textContent = 'Real cases from the live 24Pilot Deviation datastore. A safe public entry appears after the pilot responds; private statements are never published here.';
      }
    }

    const empty = app.querySelector('#reports-grid .empty-state');
    if (empty && state.publicReports.length === 0) {
      empty.innerHTML = '<strong>No public PPD reports yet</strong>Cases will appear here after a pilot responds to a filed deviation.';
    }
  };

  function getTrackedCases() {
    try {
      const value = JSON.parse(localStorage.getItem(TRACK_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (error) {
      return [];
    }
  }

  function saveTrackedCases(cases) {
    localStorage.setItem(TRACK_KEY, JSON.stringify(cases.slice(0, 30)));
  }

  function rememberCase(report) {
    if (!report || !report.id) return;
    const cases = getTrackedCases().filter(function (item) { return item.id !== report.id; });
    cases.unshift({
      id: report.id,
      ppdNumber: report.ppdNumber || '',
      callsign: report.aircraft?.callsign || '',
      aircraftType: report.aircraft?.aircraftType || '',
      pilotUsername: report.aircraft?.playerName || '',
      status: report.status || 'Awaiting Pilot Response',
      pilotResponseReceived: String(report.status || '').toLowerCase().includes('responded'),
      createdAt: report.createdAt || new Date().toISOString(),
      respondedAt: ''
    });
    saveTrackedCases(cases);
  }

  function contactNumber(ppdNumber) {
    const token = String(ppdNumber || '').replace(/\D/g, '');
    if (token.length !== 6) return token || '—';
    const digits = '5552' + token;
    return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
  }

  function humanTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }

  async function fetchCaseStatus(caseId) {
    return api('/api/reports/status?caseId=' + encodeURIComponent(caseId));
  }

  async function refreshTrackedCases(showToast) {
    const cases = getTrackedCases();
    if (!cases.length) {
      renderControllerTracker();
      return;
    }

    const settled = await Promise.allSettled(cases.map(function (item) {
      return fetchCaseStatus(item.id);
    }));

    settled.forEach(function (result, index) {
      if (result.status !== 'fulfilled' || !result.value?.case) return;
      const current = cases[index];
      const status = result.value.case;
      current.ppdNumber = status.ppdNumber || current.ppdNumber;
      current.callsign = status.callsign || current.callsign;
      current.aircraftType = status.aircraftType || current.aircraftType;
      current.pilotUsername = status.pilotUsername || current.pilotUsername;
      current.status = status.status || current.status;
      current.pilotResponseReceived = Boolean(status.pilotResponseReceived);
      current.respondedAt = status.respondedAt || current.respondedAt || '';
      current.updatedAt = status.updatedAt || '';
    });

    saveTrackedCases(cases);
    renderControllerTracker();
    if (showToast) toast('Controller case statuses refreshed.');
  }

  function statusBadge(item) {
    if (item.pilotResponseReceived || String(item.status || '').toLowerCase().includes('responded')) {
      return '<span class="status-badge responded">PILOT RESPONDED</span>';
    }
    return '<span class="status-badge awaiting">AWAITING PILOT RESPONSE</span>';
  }

  function renderControllerTracker() {
    if (route() !== 'file') return;
    const host = document.getElementById('controller-tracker');
    if (!host) return;

    const cases = getTrackedCases();
    host.innerHTML = '<div class="tracker-head"><div><div class="eyebrow">Controller tools</div><h2>Case Tracker</h2><p>Cases filed from this browser are saved automatically. You can also enter a Case ID to check a case from another device.</p></div><button class="btn" id="tracker-refresh">REFRESH STATUS</button></div>' +
      '<div class="tracker-lookup"><input id="tracker-case-id" placeholder="PPD-2026-0814-0001" aria-label="Case ID"><button class="btn primary" id="tracker-add">TRACK CASE ID</button></div>' +
      '<div class="tracker-grid">' + (cases.length ? cases.map(function (item) {
        const respondedCopy = item.pilotResponseReceived
          ? '<div class="tracker-response"><strong>Response received</strong><span>' + esc(humanTime(item.respondedAt) || 'Pilot response is on file.') + '</span></div>'
          : '<div class="tracker-response waiting"><strong>No pilot response yet</strong><span>This case is still waiting for the pilot.</span></div>';
        return '<article class="tracker-card">' +
          '<div class="tracker-card-top"><div><span class="tracker-case">' + esc(item.id) + '</span><h3>' + esc(item.callsign || 'Unknown callsign') + '</h3></div>' + statusBadge(item) + '</div>' +
          '<div class="tracker-meta"><span><small>ROBLOX PILOT</small><strong>' + esc(item.pilotUsername || 'Not provided') + '</strong></span><span><small>CONTACT NUMBER</small><strong>' + esc(contactNumber(item.ppdNumber)) + '</strong></span><span><small>AIRCRAFT</small><strong>' + esc(item.aircraftType || '—') + '</strong></span></div>' +
          respondedCopy +
          '</article>';
      }).join('') : '<div class="empty-state tracker-empty"><strong>No cases tracked yet</strong>File a deviation and it will appear here automatically.</div>') + '</div>';

    const refresh = document.getElementById('tracker-refresh');
    if (refresh) refresh.onclick = function () { refreshTrackedCases(true); };

    const add = document.getElementById('tracker-add');
    if (add) add.onclick = async function () {
      const input = document.getElementById('tracker-case-id');
      const caseId = String(input.value || '').trim().toUpperCase();
      if (!/^PPD-\d{4}-\d{4}-\d{4}$/.test(caseId)) return toast('Enter a valid Case ID such as PPD-2026-0814-0001.');
      add.disabled = true;
      add.textContent = 'CHECKING…';
      try {
        const body = await fetchCaseStatus(caseId);
        const data = body.case;
        const casesNow = getTrackedCases().filter(function (item) { return item.id !== caseId; });
        casesNow.unshift({
          id: data.id,
          ppdNumber: data.ppdNumber,
          callsign: data.callsign,
          aircraftType: data.aircraftType,
          pilotUsername: data.pilotUsername,
          status: data.status,
          pilotResponseReceived: Boolean(data.pilotResponseReceived),
          createdAt: data.createdAt,
          respondedAt: data.respondedAt || '',
          updatedAt: data.updatedAt || ''
        });
        saveTrackedCases(casesNow);
        renderControllerTracker();
        toast('Case added to the controller tracker.');
      } catch (error) {
        add.disabled = false;
        add.textContent = 'TRACK CASE ID';
        toast(error.status === 404 ? 'No case was found with that Case ID.' : 'Unable to check that case right now.');
      }
    };
  }

  window.renderFile = function () {
    originalRenderFile();
    const tracker = document.createElement('section');
    tracker.id = 'controller-tracker';
    tracker.className = 'controller-tracker';
    app.appendChild(tracker);
    renderControllerTracker();
  };

  window.renderIssued = function () {
    originalRenderIssued();
    rememberCase(state.issuedReport);
    const screen = app.querySelector('.issue-screen');
    if (screen) {
      screen.insertAdjacentHTML('beforeend', '<div class="tracker-issued-note"><strong>Controller tracking enabled</strong><span>This case was saved to the Case Tracker under File Report. It will show when the pilot responds.</span></div>');
    }
  };

  function renderHowTo() {
    updatePrimaryNavigation();
    app.innerHTML = shellBanner() + '<section class="tutorial-page">' +
      '<div class="section-head tutorial-heading"><div><div class="eyebrow">24Pilot Deviation guide</div><h1>How To Use 24PD</h1><p>A short guide for pilots and controllers using the community Possible Pilot Deviation workflow.</p></div></div>' +
      '<div class="tutorial-grid">' +
      '<article class="tutorial-card"><span class="tutorial-number">01</span><div><div class="kicker">Pilot</div><h2>Respond to a deviation</h2><p>Open <strong>Home</strong> and enter the 10-digit 24PD contact number ATC gave you. The green phone button locates the report; it does not place a real phone call.</p><ol><li>Enter the contact number.</li><li>Verify the callsign, aircraft, incident, and time.</li><li>Continue to the response form.</li><li>Explain what you understood and what happened from your perspective.</li><li>Submit once. Your response becomes part of the case.</li></ol></div></article>' +
      '<article class="tutorial-card"><span class="tutorial-number">02</span><div><div class="kicker">Controller</div><h2>File a report</h2><p>Use <strong>File Report</strong> after a possible deviation. Selecting a live aircraft copies the callsign, aircraft type, and Roblox pilot username from the current 24Data feed.</p><ol><li>Select the involved aircraft or enter it manually.</li><li>Choose the incident type and controller position.</li><li>Record the ATC instruction and observed aircraft action.</li><li>Review the facts and issue the PPD.</li><li>Give the pilot the displayed 24PD contact number.</li></ol></div></article>' +
      '<article class="tutorial-card"><span class="tutorial-number">03</span><div><div class="kicker">Controller</div><h2>Track the pilot response</h2><p>Every case filed on the current browser is added to the <strong>Case Tracker</strong> at the bottom of File Report.</p><ol><li>Open File Report.</li><li>Scroll to Case Tracker.</li><li>Look for Awaiting Pilot Response or Pilot Responded.</li><li>Use Refresh Status for an immediate check.</li><li>If you changed devices, enter the Case ID to add it back to your tracker.</li></ol></div></article>' +
      '<article class="tutorial-card"><span class="tutorial-number">04</span><div><div class="kicker">Public record</div><h2>What becomes public?</h2><p>After a pilot responds, a sanitized case entry can appear in <strong>Public Reports</strong>. Private pilot narratives, controller statements, usernames, and evidence are not automatically published.</p><div class="callout">24Pilot Deviation is an unofficial ATC24 community tool. It is not an FAA system and does not represent real-world enforcement.</div></div></article>' +
      '</div></section>';
    updatePrimaryNavigation();
  }

  function handleSpecialRoute() {
    updatePrimaryNavigation();
    if (route() === 'howto') renderHowTo();
    if (route() === 'file') setTimeout(renderControllerTracker, 0);
  }

  updatePrimaryNavigation();
  if (!normalizePrimaryRoute()) handleSpecialRoute();

  window.addEventListener('hashchange', function () {
    if (!normalizePrimaryRoute()) setTimeout(handleSpecialRoute, 0);
  });

  window.addEventListener('load', function () {
    updatePrimaryNavigation();
    loadOnlyRealPublicReports();
    handleSpecialRoute();
  }, { once: true });

  setInterval(function () {
    if (route() === 'file' && getTrackedCases().length) refreshTrackedCases(false);
  }, 20000);
})();
