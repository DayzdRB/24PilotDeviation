'use strict';

/*
 * 24Pilot Deviation — phone contact UI enhancement
 *
 * The Apps Script datastore still stores the original six-digit PPD token.
 * The UI maps it losslessly to a phone-style simulated contact number:
 *   PPD 482731 -> (555) 248-2731
 *
 * This preserves every existing report while providing a familiar ten-digit
 * phone-number experience. The number is an in-site identifier only; it is
 * never opened with tel: and is not presented as a real telephone service.
 */

(function () {
  const PHONE_PREFIX = '5552';

  function digitsOnly(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function underlyingPPD(value) {
    const digits = digitsOnly(value);
    if (digits.length === 6) return digits;
    if (digits.length === 10 && digits.startsWith(PHONE_PREFIX)) return digits.slice(4);
    if (digits.length === 11 && digits.startsWith('1' + PHONE_PREFIX)) return digits.slice(5);
    return '';
  }

  function contactDigits(value) {
    const ppd = underlyingPPD(value) || (digitsOnly(value).length === 6 ? digitsOnly(value) : '');
    return ppd ? PHONE_PREFIX + ppd : '';
  }

  function formatPhone(value) {
    let digits = digitsOnly(value);
    if (digits.length === 6) digits = PHONE_PREFIX + digits;
    if (digits.length === 11 && digits[0] === '1') digits = digits.slice(1);
    digits = digits.slice(0, 10);
    if (!digits) return '';
    if (digits.length <= 3) return '(' + digits;
    if (digits.length <= 6) return '(' + digits.slice(0, 3) + ') ' + digits.slice(3);
    return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
  }

  function fullContactNumber(ppd) {
    return formatPhone(contactDigits(ppd));
  }

  function attachPhoneMask(input) {
    if (!input) return;
    input.addEventListener('input', function () {
      const rawDigits = digitsOnly(input.value).slice(0, 11);
      input.value = formatPhone(rawDigits);
    });
  }

  window.normalizeNumber = function (value) {
    return underlyingPPD(value);
  };

  window.renderHome = function () {
    app.innerHTML = `${shellBanner()}<section class="hero"><div class="hero-copy"><div class="eyebrow">ATC24 community reporting</div><h1>Clear reports.<br>Fair responses.</h1><p>Document a possible pilot deviation, issue a simulated phone-style contact number, and give the involved pilot a structured way to respond — built around the way ATC24 actually operates.</p><div class="hero-meta"><div><strong>10 DIGITS</strong>phone-style contact ID</div><div><strong>UTC</strong>incident timestamps</div><div><strong>24DATA</strong>live aircraft + Roblox pilot</div></div></div><div class="radar-card" aria-hidden="true"><div class="radar-grid"></div><div class="radar-rings"></div><div class="sweep"></div><div class="radar-copy"><strong>POSSIBLE PILOT DEVIATION</strong><p>“Advise when ready to copy a number.”<br>Community workflow, adapted for ATC24.</p></div></div></section><section class="workflow-grid"><article class="action-card"><div class="kicker">Controller / ATC</div><h2>File a Possible Pilot Deviation</h2><p>Select an aircraft from the current ATC24 feed. Its callsign, aircraft type, and Roblox pilot username can be carried into the report automatically.</p><button class="btn primary" id="home-file">FILE PPD</button></article><article class="action-card phone-lookup-card"><div class="kicker">Pilot response</div><h2>Were you given a number?</h2><p>Enter the simulated 24PD contact number provided by ATC.</p><div class="phone-mini-input"><span class="phone-mini-icon">☎</span><input id="home-number" inputmode="tel" autocomplete="off" maxlength="16" placeholder="(555) 248-2731" aria-label="24PD contact number"></div><button class="btn primary" id="home-lookup" style="width:100%;margin-top:10px">LOCATE REPORT</button><div class="phone-disclaimer">Simulated contact number — no real telephone call is placed.</div></article></section>`;

    document.getElementById('home-file').onclick = () => setRoute('file');
    const input = document.getElementById('home-number');
    attachPhoneMask(input);
    document.getElementById('home-lookup').onclick = () => {
      sessionStorage.setItem('24pd_lookup', input.value);
      setRoute('respond');
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('home-lookup').click();
    });
  };

  window.renderAircraft = function () {
    const rows = state.aircraft;
    app.innerHTML = `${shellBanner()}<div class="section-head"><div><div class="eyebrow">Live operations</div><h1>ATC24 Aircraft</h1><p>${rows.length ? `${rows.length} aircraft received from ${esc(state.aircraftSource)}. Roblox pilot names are supplied by the current 24Data aircraft feed.` : 'Live feed unavailable — manual report entry remains available.'}</p></div><div class="section-actions"><button class="btn" id="refresh-aircraft">REFRESH</button><button class="btn primary" id="manual-file">MANUAL REPORT</button></div></div><div class="filter-bar"><input id="air-search" placeholder="Search callsign or Roblox pilot"><select id="air-type"><option value="">All aircraft types</option>${[...new Set(rows.map(a => a.aircraftType))].sort().map(x => `<option>${esc(x)}</option>`).join('')}</select><select id="air-status"><option value="">All statuses</option><option value="airborne">Airborne</option><option value="ground">Ground</option><option value="emergency">Emergency</option></select><div class="subtle mono" style="align-self:center;text-align:right">${state.aircraftUpdatedAt ? relative(state.aircraftUpdatedAt) : '—'}</div></div><div class="table-shell"><table><thead><tr><th>Callsign</th><th>Roblox Pilot</th><th>Aircraft</th><th>Altitude</th><th>Heading</th><th>Speed</th><th>Status</th><th></th></tr></thead><tbody id="air-body"></tbody></table></div>`;

    const renderRows = () => {
      const q = document.getElementById('air-search').value.toLowerCase();
      const type = document.getElementById('air-type').value;
      const status = document.getElementById('air-status').value;
      const filtered = rows.filter(a =>
        (!q || String(a.callsign || '').toLowerCase().includes(q) || String(a.playerName || '').toLowerCase().includes(q)) &&
        (!type || a.aircraftType === type) &&
        (!status || (status === 'emergency' ? a.isEmergencyOccuring : status === 'ground' ? a.isOnGround : !a.isOnGround))
      );

      document.getElementById('air-body').innerHTML = filtered.length
        ? filtered.map(a => `<tr><td class="callsign">${esc(a.callsign)}</td><td><span class="roblox-pilot"><span class="roblox-dot"></span>${esc(a.playerName || 'Unknown')}</span></td><td>${esc(a.aircraftType)}</td><td class="mono">${fmtAltitude(a.altitude)}</td><td class="mono">${Math.round(a.heading)}°</td><td class="mono">${Math.round(a.speed)} KT</td><td><span class="status-badge ${a.isEmergencyOccuring ? 'danger' : a.isOnGround ? 'warn' : 'live'}">${a.isEmergencyOccuring ? 'Emergency' : a.isOnGround ? 'Ground' : 'Airborne'}</span></td><td><button class="btn ghost view-aircraft" data-i="${rows.indexOf(a)}">VIEW</button></td></tr>`).join('')
        : `<tr><td colspan="8"><div class="empty-state"><strong>No matching aircraft</strong>Adjust the filters or file a manual report.</div></td></tr>`;

      document.querySelectorAll('.view-aircraft').forEach(b => {
        b.onclick = () => openAircraft(rows[Number(b.dataset.i)]);
      });
    };

    ['air-search', 'air-type', 'air-status'].forEach(id => document.getElementById(id).addEventListener('input', renderRows));
    renderRows();
    document.getElementById('refresh-aircraft').onclick = refreshAircraft;
    document.getElementById('manual-file').onclick = () => {
      state.selectedAircraft = null;
      state.draft = freshDraft();
      state.reportStep = 1;
      setRoute('file');
    };
  };

  window.openAircraft = function (a) {
    state.selectedAircraft = a;
    const back = document.createElement('div');
    back.className = 'drawer-backdrop';
    const drawer = document.createElement('aside');
    drawer.className = 'drawer';
    drawer.innerHTML = `<div class="drawer-head"><span class="eyebrow">Aircraft detail</span><button class="icon-btn" aria-label="Close">×</button></div><div class="aircraft-title">${esc(a.callsign)}</div><div class="subtle">${esc(a.aircraftType)} · ${a.isEmergencyOccuring ? 'EMERGENCY' : a.isOnGround ? 'GROUND' : 'AIRBORNE'}</div><div class="pilot-identity"><span>ROBLOX PILOT</span><strong>${esc(a.playerName || 'Unknown')}</strong><small>Current 24Data aircraft information</small></div><div class="metric-grid"><div class="metric"><span>ALTITUDE</span><strong>${Math.round(a.altitude).toLocaleString()}</strong></div><div class="metric"><span>HEADING</span><strong>${Math.round(a.heading)}°</strong></div><div class="metric"><span>AIRSPEED</span><strong>${Math.round(a.speed)} KT</strong></div><div class="metric"><span>GROUND SPEED</span><strong>${Math.round(a.groundSpeed)} KT</strong></div><div class="metric"><span>STATUS</span><strong style="font-size:13px">${a.isEmergencyOccuring ? 'EMERGENCY' : a.isOnGround ? 'GROUND' : 'NORMAL'}</strong></div><div class="metric"><span>DATA SOURCE</span><strong style="font-size:13px">24DATA</strong></div></div><div class="callout ${a.isEmergencyOccuring ? 'warn' : ''}">${a.isEmergencyOccuring ? '24Data indicates an emergency is active. An emergency is not itself evidence of a deviation.' : 'Selecting this aircraft copies the current callsign, Roblox pilot username, and aircraft type into the PPD report.'}</div><div class="button-row" style="margin-top:18px"><button class="btn primary" id="drawer-file">FILE POSSIBLE PILOT DEVIATION</button></div>`;

    const close = () => { back.remove(); drawer.remove(); };
    back.onclick = close;
    drawer.querySelector('.icon-btn').onclick = close;
    drawer.querySelector('#drawer-file').onclick = () => {
      state.draft = freshDraft();
      state.draft.aircraft = {
        callsign: a.callsign,
        playerName: a.playerName,
        aircraftType: a.aircraftType,
        source: '24data'
      };
      state.reportStep = 1;
      close();
      setRoute('file');
    };
    document.body.append(back, drawer);
  };

  window.renderIssued = function () {
    const r = state.issuedReport;
    const phone = fullContactNumber(r.ppdNumber);
    app.innerHTML = `${shellBanner()}<div class="issue-screen phone-issued"><div class="issue-label">POSSIBLE PILOT DEVIATION</div><h2>${esc(r.aircraft.callsign)}</h2><div class="subtle mono">ADVISE WHEN READY TO COPY A NUMBER</div><div class="phone-number-card"><div class="phone-number-caption">24PD SIMULATED CONTACT NUMBER</div><div class="phone-number-display">${esc(phone)}</div><div class="phone-pilot-line"><span>ROBLOX PILOT</span><strong>${esc(r.aircraft.playerName || 'Not provided')}</strong></div></div><div class="case-id">CASE ${esc(r.id)}</div><div class="phraseology"><strong>Suggested ATC24 wording</strong><br>“${esc(r.aircraft.callsign)}, possible pilot deviation. Advise when ready to copy a number.”<br><br>When ready: “Contact 24Pilot Deviation using number ${esc(phone)}.”</div><div class="button-row" style="justify-content:center"><button class="btn primary" id="copy-number">COPY CONTACT NUMBER</button><button class="btn" id="copy-case">COPY CASE ID</button><button class="btn" id="return-aircraft">RETURN TO AIRCRAFT</button></div><div class="phone-disclaimer issued-disclaimer">This is a simulated in-site contact number, not a real telephone service.</div></div>`;
    document.getElementById('copy-number').onclick = () => copy(phone, 'Contact number copied.');
    document.getElementById('copy-case').onclick = () => copy(r.id, 'Case ID copied.');
    document.getElementById('return-aircraft').onclick = () => {
      state.draft = freshDraft();
      state.reportStep = 1;
      state.issuedReport = null;
      setRoute('aircraft');
    };
  };

  function dialerMarkup(prefill) {
    let formatted = formatPhone(prefill);
    if (!formatted && underlyingPPD(prefill)) formatted = fullContactNumber(prefill);
    const keys = [
      ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
      ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
      ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
      ['*', ''], ['0', '+'], ['#', '']
    ];
    return `<div class="dialer-shell"><div class="dialer-top"><div class="eyebrow">Pilot response</div><h1>Enter Contact Number</h1><p>Use the simulated phone-style number given to you by ATC.</p></div><div class="dialer-display-wrap"><input id="pilot-number" inputmode="tel" autocomplete="off" maxlength="16" value="${esc(formatted)}" placeholder="(555) 248-2731" aria-label="24PD contact number"><div class="dialer-label">24PD CONTACT</div></div><div class="dialer-grid">${keys.map(([n, letters]) => `<button class="dial-key ${n === '*' || n === '#' ? 'dial-key-secondary' : ''}" type="button" data-key="${n}"><span>${n}</span>${letters ? `<small>${letters}</small>` : '<small>&nbsp;</small>'}</button>`).join('')}</div><div class="dialer-actions"><button class="dial-delete" id="dial-delete" type="button" aria-label="Delete last digit">⌫</button><button class="dial-call" id="pilot-lookup" type="button" aria-label="Locate report"><span>☎</span></button><div class="dial-action-spacer"></div></div><div class="dialer-help"><strong>LOCATE REPORT</strong><span>Press the green button when the full number is entered.</span></div><div class="phone-disclaimer">Simulated number only. This page does not place a telephone call. Legacy six-digit PPD numbers are still accepted when typed or pasted.</div></div>`;
  }

  window.renderRespond = function () {
    const prefill = sessionStorage.getItem('24pd_lookup') || '';
    sessionStorage.removeItem('24pd_lookup');

    if (state.pilotStage === 'lookup') {
      app.innerHTML = `${shellBanner()}${dialerMarkup(prefill)}`;
      const input = document.getElementById('pilot-number');
      attachPhoneMask(input);

      document.querySelectorAll('.dial-key').forEach(button => {
        button.addEventListener('click', () => {
          const key = button.dataset.key;
          if (key === '*' || key === '#') {
            button.classList.add('pressed');
            setTimeout(() => button.classList.remove('pressed'), 120);
            return;
          }
          let digits = digitsOnly(input.value);
          if (digits.length >= 10) return;
          digits += key;
          input.value = formatPhone(digits);
          input.focus();
        });
      });

      document.getElementById('dial-delete').onclick = () => {
        const digits = digitsOnly(input.value).slice(0, -1);
        input.value = formatPhone(digits);
        input.focus();
      };
      document.getElementById('pilot-lookup').onclick = () => lookupPilot(input.value);
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('pilot-lookup').click();
      });
      return;
    }

    if (state.pilotStage === 'found') return renderPilotFound();
    if (state.pilotStage === 'contact') return renderContact();
    if (state.pilotStage === 'form') return renderPilotForm();
  };

  window.lookupPilot = async function (value) {
    const n = underlyingPPD(value);
    if (!n) return toast('Enter the complete 24PD contact number, or a legacy six-digit PPD number.');
    const btn = document.getElementById('pilot-lookup');
    btn.disabled = true;
    btn.classList.add('searching');
    let report = null;
    try {
      const body = await api(`/api/reports/lookup?number=${encodeURIComponent(n)}`);
      report = body.report;
    } catch (e) {
      if (e.status === 503 && e.body?.fallbackAllowed) report = localLookup(n);
      else if (e.status === 404) {
        btn.disabled = false;
        btn.classList.remove('searching');
        return toast('No active report was found for that contact number.');
      } else {
        btn.disabled = false;
        btn.classList.remove('searching');
        return toast('Unable to search reports right now.');
      }
    }
    if (!report) {
      btn.disabled = false;
      btn.classList.remove('searching');
      return toast('No local demo report was found for that contact number.');
    }
    state.pilotCase = report;
    state.pilotStage = 'found';
    renderRespond();
  };

  window.renderPilotFound = function () {
    const r = state.pilotCase;
    const phone = fullContactNumber(r.ppdNumber);
    app.innerHTML = `${shellBanner()}<div class="found-card"><div class="eyebrow">Report located</div><h2>${esc(r.id)}</h2><div class="located-contact"><span>CONTACT NUMBER</span><strong>${esc(phone)}</strong></div><div class="review-grid"><div class="review-item"><span>Callsign</span><strong>${esc(r.aircraft.callsign)}</strong></div><div class="review-item"><span>Roblox Pilot</span><strong>${esc(r.aircraft.playerName || 'Not provided')}</strong></div><div class="review-item"><span>Aircraft</span><strong>${esc(r.aircraft.aircraftType)}</strong></div><div class="review-item"><span>Status</span><strong>${esc(r.status)}</strong></div><div class="review-item"><span>Incident</span><strong>${esc(incidentLabel(r.incident.category))}</strong></div><div class="review-item"><span>Location</span><strong>${esc(r.incident.airport || r.incident.airspace || '—')}</strong></div><div class="review-item"><span>Time</span><strong>${esc(fmtTime(r.incident.occurredAt || r.createdAt))}</strong></div></div><div class="callout" style="margin-top:18px">The Roblox pilot name shown here is the name captured with the report. Internal controller notes and moderation information are not exposed by the contact number.</div><div class="button-row" style="margin-top:18px"><button class="btn" id="lookup-back">BACK</button><button class="btn primary" id="lookup-continue">CONTINUE</button></div></div>`;
    document.getElementById('lookup-back').onclick = () => {
      state.pilotStage = 'lookup';
      state.pilotCase = null;
      renderRespond();
    };
    document.getElementById('lookup-continue').onclick = () => {
      state.pilotStage = 'contact';
      renderRespond();
    };
  };

  window.renderContact = function () {
    const r = state.pilotCase;
    const phone = fullContactNumber(r.ppdNumber);
    app.innerHTML = `${shellBanner()}<div class="contact-screen phone-contact-screen"><div class="eyebrow" style="justify-content:center">Online contact system</div><div class="contact-circle phone-circle">☎</div><h1>Case identified</h1><div class="contact-phone-number">${esc(phone)}</div><div class="contact-pilot"><span>ROBLOX PILOT</span><strong>${esc(r.aircraft.playerName || 'Not provided')}</strong></div><p class="subtle">Verify that you are the pilot involved in this ATC24 incident, then continue to the structured response. This is an online workflow; no real telephone call is being represented as completed.</p><button class="btn primary" id="begin-contact">I AM READY TO RESPOND</button></div>`;
    document.getElementById('begin-contact').onclick = () => {
      state.pilotStage = 'form';
      renderRespond();
    };
  };

  const rerender = () => {
    if (typeof render === 'function') render();
  };
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', rerender, { once: true });
  else rerender();
})();
