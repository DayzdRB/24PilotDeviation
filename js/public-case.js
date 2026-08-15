'use strict';

(function () {
  const VOTER_KEY = '24pd_voter_id';
  const VOTE_KEY_PREFIX = '24pd_vote_';
  const CASE_PATTERN = /^PPD-\d{4}-\d{4}-\d{4}$/;
  let activeCase = null;

  function hashCaseId() {
    const raw = String(location.hash || '').replace(/^#/, '');
    if (!raw.toLowerCase().startsWith('reports/')) return '';
    const id = decodeURIComponent(raw.slice('reports/'.length)).trim().toUpperCase();
    return CASE_PATTERN.test(id) ? id : '';
  }

  function setReportsNavActive() {
    document.querySelectorAll('[data-route]').forEach(function (link) {
      link.classList.toggle('active', link.dataset.route === 'reports');
    });
  }

  function displayDate(value) {
    if (!value) return 'Date unavailable';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString([], {
      year:'numeric', month:'short', day:'2-digit',
      hour:'2-digit', minute:'2-digit', timeZone:'UTC', timeZoneName:'short'
    });
  }

  function verdictText(verdict) {
    const v = verdict || {};
    const leader = String(v.leader || 'NO VOTES').toUpperCase();
    if (leader === 'NO VOTES') return 'No votes yet';
    if (leader === 'TIED') return 'Tied — ' + (Number(v.percentage) || 0) + '%';
    const label = leader === 'INCONCLUSIVE' ? 'Inconclusive' : leader;
    return label + ' — ' + (Number(v.percentage) || 0) + '%';
  }

  function votePercent(count, total) {
    if (!total) return 0;
    return Math.round((Number(count || 0) / Number(total)) * 100);
  }

  function safeEvidenceUrl(raw) {
    try {
      const url = new URL(String(raw || ''));
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
      return url;
    } catch (_) {
      return null;
    }
  }

  function imageEvidence(url) {
    if (!url) return false;
    const path = url.pathname.toLowerCase();
    return /\.(png|jpe?g|gif|webp)$/i.test(path) ||
      /(?:cdn|media)\.discordapp\.(?:com|net)$/i.test(url.hostname);
  }

  function metadataItem(label, value, mono) {
    if (value === undefined || value === null || String(value).trim() === '') return '';
    return '<div class="case-meta-item"><span>' + esc(label) + '</span><strong class="' + (mono ? 'mono' : '') + '">' + esc(value) + '</strong></div>';
  }

  function dynamicIncidentItems(incident) {
    const out = [];
    const assignedAlt = String(incident.assignedAltitude || '').trim();
    const observedAlt = String(incident.observedAltitude || '').trim();
    if (assignedAlt || observedAlt) {
      out.push(metadataItem('Assigned Altitude', assignedAlt ? assignedAlt + ' FT' : '', true));
      out.push(metadataItem('Observed Altitude', observedAlt ? observedAlt + ' FT' : '', true));
      if (assignedAlt && observedAlt && Number.isFinite(Number(assignedAlt)) && Number.isFinite(Number(observedAlt))) {
        const diff = Number(observedAlt) - Number(assignedAlt);
        out.push(metadataItem('Altitude Difference', (diff >= 0 ? '+' : '') + diff.toLocaleString() + ' FT', true));
      }
    }

    const assignedHeading = String(incident.assignedHeading || '').trim();
    const observedHeading = String(incident.observedHeading || '').trim();
    if (assignedHeading || observedHeading) {
      out.push(metadataItem('Assigned Heading', assignedHeading ? assignedHeading + '°' : '', true));
      out.push(metadataItem('Observed Heading', observedHeading ? observedHeading + '°' : '', true));
      if (assignedHeading && observedHeading && Number.isFinite(Number(assignedHeading)) && Number.isFinite(Number(observedHeading))) {
        const diff = ((Number(observedHeading) - Number(assignedHeading) + 540) % 360) - 180;
        out.push(metadataItem('Heading Difference', (diff >= 0 ? '+' : '') + diff + '°', true));
      }
    }

    if (incident.assignedRunway || incident.observedRunway) {
      out.push(metadataItem('Assigned Runway', incident.assignedRunway, true));
      out.push(metadataItem('Observed Runway', incident.observedRunway, true));
    }
    return out.join('');
  }

  function statementBlock(label, value) {
    if (!value) return '';
    return '<div class="case-statement-block"><span>' + esc(label) + '</span><p>' + esc(value) + '</p></div>';
  }

  function getVoterToken() {
    let token = localStorage.getItem(VOTER_KEY);
    if (token && token.length >= 16) return token;
    if (window.crypto && crypto.randomUUID) token = crypto.randomUUID();
    else if (window.crypto && crypto.getRandomValues) {
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      token = Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    } else {
      token = Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    }
    localStorage.setItem(VOTER_KEY, token);
    return token;
  }

  function votedLocally(caseId) {
    return localStorage.getItem(VOTE_KEY_PREFIX + caseId) || '';
  }

  function renderVoteResults(report) {
    const votes = report.votes || { atc:0, pilot:0, inconclusive:0, total:0 };
    const total = Number(votes.total || 0);
    const rows = [
      ['ATC', Number(votes.atc || 0)],
      ['PILOT', Number(votes.pilot || 0)],
      ['INCONCLUSIVE', Number(votes.inconclusive || 0)]
    ];

    return '<div class="verdict-summary"><span>Current community verdict</span><strong>' + esc(verdictText(report.communityVerdict)) + '</strong><small>' + total.toLocaleString() + ' total vote' + (total === 1 ? '' : 's') + '</small></div>' +
      '<div class="vote-results">' + rows.map(function (row) {
        const pct = votePercent(row[1], total);
        return '<div class="vote-result"><div class="vote-result-head"><strong>' + esc(row[0]) + '</strong><span>' + pct + '% · ' + row[1].toLocaleString() + ' vote' + (row[1] === 1 ? '' : 's') + '</span></div><div class="vote-track"><span style="width:' + pct + '%"></span></div></div>';
      }).join('') + '</div>';
  }

  function renderVoting(report) {
    const voted = votedLocally(report.caseId);
    return '<section class="case-panel community-panel"><div class="case-panel-head"><div><div class="eyebrow">Community verdict</div><h2>Who had the stronger case?</h2><p>Community opinion is separate from the official case status and never changes the disposition.</p></div></div>' +
      renderVoteResults(report) +
      (voted
        ? '<div class="vote-complete">Your browser voted <strong>' + esc(voted) + '</strong> on this case.</div>'
        : '<div class="vote-actions"><button class="vote-choice" data-vote="ATC"><strong>ATC</strong><span>The controller’s report is more convincing</span></button><button class="vote-choice" data-vote="PILOT"><strong>PILOT</strong><span>The pilot’s response is more convincing</span></button><button class="vote-choice" data-vote="INCONCLUSIVE"><strong>INCONCLUSIVE</strong><span>There is not enough information to choose a side</span></button></div>') +
      '</section>';
  }

  function evidenceMarkup(raw) {
    if (!raw) return '<div class="empty-evidence"><strong>No evidence submitted</strong><span>This case does not include an ATC evidence link.</span></div>';
    const url = safeEvidenceUrl(raw);
    if (!url) return '<div class="empty-evidence warn"><strong>Evidence link unavailable</strong><span>The submitted evidence URL is not a valid HTTP/HTTPS link.</span></div>';
    const href = esc(url.href);
    return '<div class="evidence-card">' +
      (imageEvidence(url) ? '<a href="' + href + '" target="_blank" rel="noopener noreferrer" class="evidence-preview"><img src="' + href + '" alt="Evidence submitted by ATC" loading="lazy"></a>' : '') +
      '<div class="evidence-copy"><span>Evidence submitted by ATC</span><strong>' + esc(url.hostname) + '</strong><a class="btn primary" href="' + href + '" target="_blank" rel="noopener noreferrer">OPEN EVIDENCE</a></div></div>';
  }

  function renderCaseDetail(report) {
    activeCase = report;
    setReportsNavActive();
    const incident = report.incident || {};
    const atc = report.atc || {};
    const pilot = report.pilot || {};
    const location = incident.airport || incident.airspace || 'ATC24 airspace';

    app.innerHTML = shellBanner() +
      '<section class="case-dossier">' +
        '<button class="btn case-back" id="case-back">← PUBLIC REPORTS</button>' +
        '<header class="case-hero"><div><div class="eyebrow">Possible Pilot Deviation</div><div class="mono case-number">' + esc(report.caseId) + '</div><h1>' + esc(report.callsign || 'Unknown callsign') + '</h1><p>' + esc(report.aircraftType || 'Unknown aircraft') + ' · ' + esc(incident.type || 'Possible Pilot Deviation') + ' · ' + esc(location) + '</p></div><div class="case-status-stack"><span class="status-badge ' + statusClass(report.status) + '">' + esc(report.status || 'Unknown status') + '</span><div><small>CASE DISPOSITION</small><strong>' + esc(report.disposition || 'Awaiting Review') + '</strong></div><div><small>COMMUNITY VERDICT</small><strong>' + esc(verdictText(report.communityVerdict)) + '</strong></div></div></header>' +

        '<section class="case-panel"><div class="case-panel-head"><div><div class="eyebrow">Incident overview</div><h2>Case information</h2></div></div><div class="case-meta-grid">' +
          metadataItem('Callsign', report.callsign, true) +
          metadataItem('Aircraft', report.aircraftType, false) +
          metadataItem('Roblox Pilot', report.pilotUsername || pilot.username, false) +
          metadataItem('ATC Controller', atc.username, false) +
          metadataItem('Controller Position', incident.controllerPosition || atc.position, true) +
          metadataItem('Incident Type', incident.type, false) +
          metadataItem('Airport', incident.airport, true) +
          metadataItem('Airspace', incident.airspace, true) +
          metadataItem('Occurred At', displayDate(incident.occurredAt), true) +
          metadataItem('Report Created', displayDate(report.createdAt), true) +
          dynamicIncidentItems(incident) +
        '</div></section>' +

        '<section class="case-side-grid">' +
          '<article class="case-panel statement-panel atc-panel"><div class="case-panel-head"><div><div class="eyebrow">Controller submission</div><h2>ATC Report</h2></div><span class="party-chip">ATC</span></div>' +
            metadataItem('Controller', atc.username, false) +
            statementBlock('ATC Instruction / Clearance', atc.instruction) +
            statementBlock('Observed Aircraft Action', atc.observedAction) +
            statementBlock('Controller Statement', atc.statement) +
            (!report.atc ? '<div class="empty-evidence"><strong>ATC report unavailable</strong></div>' : '') +
          '</article>' +
          '<article class="case-panel statement-panel pilot-panel"><div class="case-panel-head"><div><div class="eyebrow">Pilot submission</div><h2>Pilot Response</h2></div><span class="party-chip pilot">PILOT</span></div>' +
            metadataItem('Pilot', pilot.username || report.pilotUsername, false) +
            statementBlock('Instruction Understood', pilot.understoodInstruction) +
            statementBlock('Pilot Statement', pilot.statement) +
            metadataItem('Attempted Compliance', pilot.attemptedCompliance, false) +
            metadataItem('Emergency', pilot.emergency, false) +
            metadataItem('Technical / Game Issue', pilot.technicalIssue, false) +
            statementBlock('Technical Details', pilot.technicalDetails) +
            statementBlock('Additional Information', pilot.additionalInformation) +
            (!report.pilot ? '<div class="empty-evidence"><strong>Pilot response unavailable</strong></div>' : '') +
          '</article>' +
        '</section>' +

        '<section class="case-panel"><div class="case-panel-head"><div><div class="eyebrow">Submitted material</div><h2>Evidence</h2></div></div>' + evidenceMarkup(atc.evidenceUrl) + '</section>' +
        renderVoting(report) +
        '<div class="case-disclaimer">Community voting is informal opinion only. It does not determine whether a deviation is confirmed, dismissed, or closed.</div>' +
      '</section>';

    document.getElementById('case-back').onclick = function () { location.hash = 'reports'; };
    document.querySelectorAll('.vote-choice').forEach(function (button) {
      button.onclick = function () { castVote(report.caseId, button.dataset.vote); };
    });
  }

  async function castVote(caseId, vote) {
    if (votedLocally(caseId)) return toast('This browser has already voted on this case.');
    document.querySelectorAll('.vote-choice').forEach(function (button) { button.disabled = true; });
    try {
      const body = await api('/api/public/vote', {
        method:'POST',
        body:JSON.stringify({ caseId:caseId, vote:vote, voterToken:getVoterToken() })
      });
      localStorage.setItem(VOTE_KEY_PREFIX + caseId, vote);
      activeCase.votes = body.votes;
      activeCase.communityVerdict = body.communityVerdict;
      renderCaseDetail(activeCase);
      toast('Community vote recorded.');
      if (typeof window.loadPublicReports === 'function') window.loadPublicReports();
    } catch (error) {
      if (error.status === 409) {
        localStorage.setItem(VOTE_KEY_PREFIX + caseId, 'ALREADY RECORDED');
        toast('A vote from this browser identity is already recorded.');
        loadCase(caseId);
        return;
      }
      document.querySelectorAll('.vote-choice').forEach(function (button) { button.disabled = false; });
      toast(error.status === 429 ? 'Please wait a moment before voting.' : 'Unable to record your vote.');
    }
  }

  async function loadCase(caseId) {
    setReportsNavActive();
    app.innerHTML = shellBanner() + '<div class="case-loading"><div class="status-dot connecting"></div><strong>Loading public case…</strong><span class="mono">' + esc(caseId) + '</span></div>';
    try {
      const body = await api('/api/public/report?caseId=' + encodeURIComponent(caseId));
      renderCaseDetail(body.report);
    } catch (error) {
      app.innerHTML = shellBanner() + '<div class="empty-state case-error"><strong>Public case unavailable</strong>' +
        (error.status === 404 ? 'This case is not published or no longer exists.' : 'The case could not be loaded right now.') +
        '<div><button class="btn primary" id="case-error-back">RETURN TO PUBLIC REPORTS</button></div></div>';
      document.getElementById('case-error-back').onclick = function () { location.hash = 'reports'; };
    }
  }

  function renderPublicList() {
    const reports = (state.publicReports || []).filter(function (report) { return report && report.demo !== true; });
    app.innerHTML = shellBanner() +
      '<div class="section-head"><div><div class="eyebrow">Public case archive</div><h1>Public PPD Reports</h1><p>Open a case to review the submitted ATC report, pilot response, evidence, and community verdict.</p></div></div>' +
      '<div class="filter-bar public-filter"><input id="report-search" placeholder="Search callsign, case, location, or incident"><select id="report-incident"><option value="">All incidents</option>' +
      [...new Set(reports.map(function (r) { return r.incidentType; }).filter(Boolean))].sort().map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('') +
      '</select><select id="report-status"><option value="">All statuses</option>' +
      [...new Set(reports.map(function (r) { return r.status; }).filter(Boolean))].sort().map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('') +
      '</select></div><div id="reports-grid" class="reports-grid public-report-grid"></div>';

    function draw() {
      const q = String(document.getElementById('report-search').value || '').toLowerCase();
      const inc = document.getElementById('report-incident').value;
      const st = document.getElementById('report-status').value;
      const rows = reports.filter(function (r) {
        const haystack = [r.id, r.callsign, r.location, r.aircraftType, r.incidentType].join(' ').toLowerCase();
        return (!q || haystack.includes(q)) && (!inc || r.incidentType === inc) && (!st || r.status === st);
      });

      document.getElementById('reports-grid').innerHTML = rows.length ? rows.map(function (r) {
        return '<article class="report-card public-case-card" tabindex="0" role="link" data-case="' + esc(r.id) + '">' +
          '<div class="case">' + esc(r.id) + '</div><div class="public-card-head"><div><h3>' + esc(r.callsign) + '</h3><span>' + esc(r.aircraftType || 'Unknown aircraft') + '</span></div><span class="status-badge ' + statusClass(r.status) + '">' + esc(r.status) + '</span></div>' +
          '<div class="public-card-data"><span><small>INCIDENT</small><strong>' + esc(r.incidentType || 'Possible Pilot Deviation') + '</strong></span><span><small>LOCATION</small><strong>' + esc(r.location || 'ATC24 airspace') + '</strong></span><span><small>COMMUNITY VERDICT</small><strong>' + esc(verdictText(r.communityVerdict)) + '</strong></span></div>' +
          '<p class="public-summary">' + esc(r.summary || 'No public summary available.') + '</p><button class="btn primary view-case" data-case="' + esc(r.id) + '">VIEW CASE</button></article>';
      }).join('') : '<div class="empty-state" style="grid-column:1/-1"><strong>No public PPD reports found</strong>Try a different filter, or check back after a pilot responds to a case.</div>';

      document.querySelectorAll('.public-case-card').forEach(function (card) {
        const open = function () { location.hash = 'reports/' + encodeURIComponent(card.dataset.case); };
        card.onclick = function (event) {
          if (event.target.closest('button, a')) return;
          open();
        };
        card.onkeydown = function (event) {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            open();
          }
        };
      });
      document.querySelectorAll('.view-case').forEach(function (button) {
        button.onclick = function () { location.hash = 'reports/' + encodeURIComponent(button.dataset.case); };
      });
    }

    ['report-search', 'report-incident', 'report-status'].forEach(function (id) {
      document.getElementById(id).addEventListener('input', draw);
    });
    draw();
  }

  function updateHowToPrivacyCopy() {
    document.querySelectorAll('.tutorial-card').forEach(function (card) {
      const heading = card.querySelector('h2');
      if (!heading || !/what becomes public/i.test(heading.textContent)) return;
      const paragraph = card.querySelector('p');
      if (paragraph) paragraph.textContent = 'After a pilot responds, the public case archive can show case metadata, the submitted ATC report, the pilot response, and evidence. Internal secrets, audit metadata, voter identifiers, and backend information remain private.';
    });
  }

  window.renderReports = renderPublicList;

  function handlePublicRoute() {
    const caseId = hashCaseId();
    if (caseId) {
      loadCase(caseId);
      return;
    }
    if (String(location.hash || '').replace(/^#/, '') === 'reports') {
      setReportsNavActive();
      renderPublicList();
      return;
    }
    if (String(location.hash || '').replace(/^#/, '') === 'howto') {
      setTimeout(updateHowToPrivacyCopy, 0);
    }
  }

  window.addEventListener('hashchange', function () { setTimeout(handlePublicRoute, 0); });
  window.addEventListener('load', function () { setTimeout(handlePublicRoute, 0); });
})();
