'use strict';

(function () {
  if (typeof state === 'undefined' || typeof api !== 'function') return;

  const AUTO_REFRESH_MS = 15000;
  const filters = { query:'', type:'', status:'' };
  let lastFetchAt = 0;
  let aircraftRequest = null;

  function text(value) {
    return String(value || '');
  }

  function lower(value) {
    return text(value).toLowerCase();
  }

  function matchesAircraft(a, query, type, status) {
    const q = lower(query).trim();
    const matchesText = !q || lower(a?.callsign).includes(q) || lower(a?.playerName).includes(q) || lower(a?.aircraftType).includes(q);
    const matchesType = !type || text(a?.aircraftType) === type;
    const matchesStatus = !status || (
      status === 'emergency' ? a?.isEmergencyOccuring === true :
      status === 'ground' ? a?.isOnGround === true :
      a?.isOnGround !== true
    );
    return matchesText && matchesType && matchesStatus;
  }

  function currentFiltersFromDom() {
    const search = document.getElementById('air-search');
    const type = document.getElementById('air-type');
    const status = document.getElementById('air-status');
    if (search) filters.query = search.value;
    if (type) filters.type = type.value;
    if (status) filters.status = status.value;
    return filters;
  }

  function updateAircraftMeta() {
    const count = document.getElementById('aircraft-count-copy');
    if (count) {
      const total = Array.isArray(state.aircraft) ? state.aircraft.length : 0;
      count.textContent = total ? total + ' aircraft received from ' + text(state.aircraftSource) + '.' : 'Live feed unavailable — manual report entry remains available.';
    }
    const updated = document.getElementById('aircraft-updated');
    if (updated) updated.textContent = state.aircraftUpdatedAt ? relative(state.aircraftUpdatedAt) : '—';
  }

  function updateAircraftRows() {
    const body = document.getElementById('air-body');
    if (!body) return;

    const active = currentFiltersFromDom();
    const rows = Array.isArray(state.aircraft) ? state.aircraft : [];
    const filtered = rows
      .map(function (aircraft, index) { return { aircraft, index }; })
      .filter(function (item) { return matchesAircraft(item.aircraft, active.query, active.type, active.status); });

    body.innerHTML = filtered.length ? filtered.map(function (item) {
      const a = item.aircraft || {};
      return '<tr>' +
        '<td class="callsign">' + esc(a.callsign) + '</td>' +
        '<td>' + esc(a.playerName) + '</td>' +
        '<td>' + esc(a.aircraftType) + '</td>' +
        '<td class="mono">' + fmtAltitude(a.altitude) + '</td>' +
        '<td class="mono">' + Math.round(Number(a.heading) || 0) + '°</td>' +
        '<td class="mono">' + Math.round(Number(a.speed) || 0) + ' KT</td>' +
        '<td><span class="status-badge ' + (a.isEmergencyOccuring ? 'danger' : a.isOnGround ? 'warn' : 'live') + '">' + (a.isEmergencyOccuring ? 'Emergency' : a.isOnGround ? 'Ground' : 'Airborne') + '</span></td>' +
        '<td><button class="btn ghost view-aircraft" data-i="' + item.index + '">VIEW</button></td>' +
      '</tr>';
    }).join('') : '<tr><td colspan="8"><div class="empty-state"><strong>No matching aircraft</strong>Try a callsign, Roblox username, or aircraft type.</div></td></tr>';

    body.querySelectorAll('.view-aircraft').forEach(function (button) {
      button.onclick = function () {
        const aircraft = rows[Number(button.dataset.i)];
        if (aircraft) openAircraft(aircraft);
      };
    });

    const resultCount = document.getElementById('aircraft-filter-count');
    if (resultCount) resultCount.textContent = filtered.length + ' shown';
    updateAircraftMeta();
  }

  function bindAircraftFilters() {
    const search = document.getElementById('air-search');
    const type = document.getElementById('air-type');
    const status = document.getElementById('air-status');

    if (search) {
      search.value = filters.query;
      search.addEventListener('input', function () {
        filters.query = search.value;
        updateAircraftRows();
      });
    }
    if (type) {
      type.value = filters.type;
      type.addEventListener('change', function () {
        filters.type = type.value;
        updateAircraftRows();
      });
    }
    if (status) {
      status.value = filters.status;
      status.addEventListener('change', function () {
        filters.status = status.value;
        updateAircraftRows();
      });
    }
  }

  function optimizedRenderAircraft() {
    const rows = Array.isArray(state.aircraft) ? state.aircraft : [];
    const aircraftTypes = Array.from(new Set(rows.map(function (a) { return text(a?.aircraftType); }).filter(Boolean))).sort();

    app.innerHTML = shellBanner() +
      '<div class="section-head"><div><div class="eyebrow">Live operations</div><h1>ATC24 Aircraft</h1><p id="aircraft-count-copy">' +
      (rows.length ? rows.length + ' aircraft received from ' + esc(state.aircraftSource) + '.' : 'Live feed unavailable — manual report entry remains available.') +
      '</p></div><div class="section-actions"><button class="btn" id="refresh-aircraft">REFRESH</button><button class="btn primary" id="manual-file">MANUAL REPORT</button></div></div>' +
      '<div class="filter-bar"><input id="air-search" autocomplete="off" spellcheck="false" placeholder="Search callsign, pilot, or aircraft" value="' + esc(filters.query) + '">' +
      '<select id="air-type"><option value="">All aircraft types</option>' + aircraftTypes.map(function (x) { return '<option value="' + esc(x) + '"' + (filters.type === x ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select>' +
      '<select id="air-status"><option value="">All statuses</option><option value="airborne"' + (filters.status === 'airborne' ? ' selected' : '') + '>Airborne</option><option value="ground"' + (filters.status === 'ground' ? ' selected' : '') + '>Ground</option><option value="emergency"' + (filters.status === 'emergency' ? ' selected' : '') + '>Emergency</option></select>' +
      '<div class="subtle mono" style="align-self:center;text-align:right"><span id="aircraft-filter-count"></span> · <span id="aircraft-updated">' + (state.aircraftUpdatedAt ? relative(state.aircraftUpdatedAt) : '—') + '</span></div></div>' +
      '<div class="table-shell"><table><thead><tr><th>Callsign</th><th>Pilot</th><th>Aircraft</th><th>Altitude</th><th>Heading</th><th>Speed</th><th>Status</th><th></th></tr></thead><tbody id="air-body"></tbody></table></div>';

    bindAircraftFilters();
    updateAircraftRows();

    const refresh = document.getElementById('refresh-aircraft');
    if (refresh) refresh.onclick = function () { optimizedRefreshAircraft({ force:true, interactive:true, button:refresh }); };

    const manual = document.getElementById('manual-file');
    if (manual) manual.onclick = function () {
      state.selectedAircraft = null;
      state.draft = freshDraft();
      state.reportStep = 1;
      setRoute('file');
    };

    window.PPDUI?.enhance?.(app);
  }

  async function optimizedRefreshAircraft(options) {
    const opts = options && typeof options === 'object' ? options : {};
    const force = opts.force === true;
    const interactive = opts.interactive === true;
    const button = opts.button || null;
    const now = Date.now();

    if (aircraftRequest) return aircraftRequest;
    if (!force && lastFetchAt && now - lastFetchAt < AUTO_REFRESH_MS) {
      if (route() === 'aircraft') updateAircraftRows();
      return state.aircraft;
    }

    if (button) window.PPDUI?.setButtonLoading?.(button, 'REFRESHING…');

    aircraftRequest = (async function () {
      try {
        const body = await api('/api/aircraft', {
          headers: { 'X-24PD-Silent': interactive ? '0' : '1' }
        });
        state.aircraft = Array.isArray(body.aircraft) ? body.aircraft : [];
        state.aircraftUpdatedAt = body.updatedAt;
        state.aircraftSource = body.source;
        lastFetchAt = Date.now();
        setDataStatus(body.source === 'mock' ? 'MOCK DATA' : '24DATA LIVE', 'live', body.stale ? 'stale' : 'updated ' + relative(body.updatedAt));
      } catch (error) {
        // Keep the most recent usable list on screen instead of clearing it during a transient upstream failure.
        state.aircraftSource = state.aircraft.length ? state.aircraftSource : 'offline';
        setDataStatus(state.aircraft.length ? '24DATA STALE' : 'OFFLINE', state.aircraft.length ? 'connecting' : 'offline', state.aircraft.length ? 'showing last update' : 'manual entry available');
      }

      if (route() === 'aircraft') {
        if (document.getElementById('air-body')) updateAircraftRows();
        else optimizedRenderAircraft();
      }
      return state.aircraft;
    })().finally(function () {
      aircraftRequest = null;
      if (button) window.PPDUI?.restoreButton?.(button);
    });

    return aircraftRequest;
  }

  // Replace the original full-page-refresh behavior. The app's existing timer can
  // continue calling refreshAircraft; this implementation throttles it and only
  // updates table rows, so typing in the search box is never interrupted.
  renderAircraft = optimizedRenderAircraft;
  refreshAircraft = optimizedRefreshAircraft;
  window.renderAircraft = optimizedRenderAircraft;
  window.refreshAircraft = optimizedRefreshAircraft;

  window.addEventListener('hashchange', function () {
    if (route() !== 'aircraft') return;
    setTimeout(function () {
      if (!state.aircraft.length) optimizedRefreshAircraft({ force:true, interactive:true });
      else if (!lastFetchAt || Date.now() - lastFetchAt >= AUTO_REFRESH_MS) optimizedRefreshAircraft({ interactive:false });
    }, 0);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && route() === 'aircraft') optimizedRefreshAircraft({ interactive:false });
  });
})();