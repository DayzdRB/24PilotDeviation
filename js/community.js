'use strict';

(function () {
  function currentHash() { return String(location.hash || '').replace(/^#/, '').toLowerCase(); }

  function ensureCommunityNav() {
    const nav = document.getElementById('nav');
    if (!nav || nav.querySelector('[data-route="community"]')) return;
    const howto = nav.querySelector('[data-route="howto"]');
    const link = document.createElement('a');
    link.href = '#community'; link.dataset.route = 'community'; link.textContent = 'Community';
    nav.insertBefore(link, howto || null);
  }

  function setActive(name) {
    ensureCommunityNav();
    document.querySelectorAll('[data-route]').forEach(function (link) {
      link.classList.toggle('active', link.dataset.route === name);
    });
  }

  async function request(url, options) {
    const response = await fetch(url, options || {});
    const text = await response.text();
    let body = {}; try { body = text ? JSON.parse(text) : {}; } catch (_) {}
    if (!response.ok) { const e = new Error(body.message || 'Request failed.'); e.status=response.status; e.body=body; throw e; }
    return body;
  }

  function loading(title) {
    app.innerHTML = shellBanner() + '<section class="community-page"><div class="section-head"><div><div class="eyebrow">24PD Community</div><h1>' + esc(title) + '</h1></div></div><div class="skeleton-grid"><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div></div></section>';
  }

  function authRequired(title, copy, returnTo) {
    app.innerHTML = shellBanner() + '<section class="auth-gate"><div class="eyebrow">Discord account</div><h1>' + esc(title) + '</h1><p>' + esc(copy) + '</p><button class="btn primary" id="community-login">LOGIN WITH DISCORD</button></section>';
    const b = document.getElementById('community-login');
    if (b) b.onclick = function(){ window.loginWithDiscord(returnTo); };
  }

  function rankRows(rows, metric, suffix) {
    if (!rows || !rows.length) return '<div class="empty-state"><strong>No data yet</strong>Community statistics will populate as more cases are filed.</div>';
    return '<div class="leader-list">' + rows.map(function (row, i) {
      return '<div class="leader-row"><span class="leader-rank">' + (i+1) + '</span><div><strong>' + esc(row.name || 'Unknown') + '</strong>' + (row.side ? '<small>' + esc(row.side) + '</small>' : '') + '</div><span class="leader-value">' + Number(row[metric] ?? row.count ?? 0).toLocaleString() + ' ' + esc(suffix || '') + '</span></div>';
    }).join('') + '</div>';
  }

  async function renderCommunity() {
    setActive('community'); loading('Community Statistics');
    try {
      const body = await request('/api/community?action=stats');
      const s = body.stats || {};
      app.innerHTML = shellBanner() + '<section class="community-page"><div class="section-head"><div><div class="eyebrow">Community data</div><h1>24PD Community</h1><p>Public statistics describe activity in the reporting system. Being reported does not mean a pilot was determined to be at fault, and filing more reports does not make a controller better.</p></div></div>' +
        '<div class="community-total-grid"><div><span>CASES</span><strong>' + Number(s.totals?.cases || 0).toLocaleString() + '</strong></div><div><span>PUBLIC CASES</span><strong>' + Number(s.totals?.publicCases || 0).toLocaleString() + '</strong></div><div><span>COMMUNITY VOTES</span><strong>' + Number(s.totals?.votes || 0).toLocaleString() + '</strong></div></div>' +
        '<div class="community-stat-grid">' +
          '<section class="case-panel"><div class="eyebrow">Activity</div><h2>Most Reported Pilots</h2><p class="stat-note">Reports are allegations, not findings of fault.</p>' + rankRows(s.mostReportedPilots, 'count', 'reports') + '</section>' +
          '<section class="case-panel"><div class="eyebrow">Activity</div><h2>Most Active Controllers</h2><div class="leader-list">' + ((s.mostActiveControllers || []).map(function(row,i){ return '<div class="leader-row"><span class="leader-rank">'+(i+1)+'</span><div><strong>'+esc(row.name)+'</strong><small>'+Number(row.pilotResponsesReceived||0)+' pilot responses</small></div><span class="leader-value">'+Number(row.reportsFiled||0)+' filed</span></div>'; }).join('') || '<div class="empty-state"><strong>No controller data yet</strong></div>') + '</div></section>' +
          '<section class="case-panel"><div class="eyebrow">Closed voting</div><h2>Most Community Case Wins</h2>' + rankRows(s.mostCommunityWins, 'wins', 'wins') + '</section>' +
          '<section class="case-panel"><div class="eyebrow">Patterns</div><h2>Most Common Incidents</h2>' + rankRows(s.mostCommonIncidents, 'count', 'cases') + '</section>' +
          '<section class="case-panel"><div class="eyebrow">Patterns</div><h2>Most Active Airports</h2>' + rankRows(s.mostActiveAirports, 'count', 'cases') + '</section>' +
        '</div><div class="case-disclaimer">Community statistics are descriptive and do not establish fault, guilt, controller quality, or an official ATC24 determination.</div></section>';
    } catch (error) {
      app.innerHTML = shellBanner() + '<div class="empty-state"><strong>Unable to load community statistics</strong><button class="btn primary" id="stats-retry">TRY AGAIN</button></div>';
      document.getElementById('stats-retry').onclick = renderCommunity;
    }
  }

  async function renderProfile() {
    setActive('');
    if (!window.authState?.loaded) return loading('Profile');
    if (!window.authState.loggedIn) return authRequired('Your 24PD Profile', 'Sign in with Discord to view your profile and account-based 24PD activity.', '#profile');
    loading('Your Profile');
    try {
      const body = await request('/api/community?action=profile');
      const p = body.profile || {}, u = p.user || {}, st = p.stats || {};
      app.innerHTML = shellBanner() + '<section class="community-page profile-page"><div class="profile-head"><div class="profile-avatar">' + (u.avatar ? '<img src="'+esc(u.avatar)+'" alt="">' : '<span>'+esc((u.displayName||'U')[0])+'</span>') + '</div><div><div class="eyebrow">Discord account</div><h1>'+esc(u.displayName||u.username)+'</h1><p>@'+esc(u.username||'')+' · '+esc(u.role||'USER')+'</p></div></div>' +
        '<div class="community-total-grid"><div><span>CASES FILED</span><strong>'+Number(st.casesFiled||0)+'</strong></div><div><span>CASES INVOLVING YOU</span><strong>'+Number(st.casesInvolvingUser||0)+'</strong></div><div><span>COMMENTS</span><strong>'+Number(st.comments||0)+'</strong></div><div><span>VOTES</span><strong>'+Number(st.communityVotes||0)+'</strong></div><div><span>COMMUNITY WINS</span><strong>'+Number(st.communityCaseWins||0)+'</strong></div></div>' +
        '<section class="case-panel profile-settings"><div class="eyebrow">Profile settings</div><h2>Roblox Username</h2><p>This is used to connect your account with relevant case statistics and as a filing identity when appropriate.</p><div class="profile-form"><input id="profile-roblox" maxlength="60" value="'+esc(u.robloxUsername||'')+'" placeholder="Roblox username"><button class="btn primary" id="profile-save">SAVE PROFILE</button></div></section></section>';
      document.getElementById('profile-save').onclick = async function(){
        const button=this; button.disabled=true; button.textContent='SAVING…';
        try { await request('/api/community?action=profileUpdate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({robloxUsername:document.getElementById('profile-roblox').value})}); toast('Profile saved.'); window.dispatchEvent(new CustomEvent('24pd:profile-updated')); renderProfile(); }
        catch(e){ button.disabled=false; button.textContent='SAVE PROFILE'; toast(e.message||'Unable to save profile.'); }
      };
    } catch (error) { app.innerHTML=shellBanner()+'<div class="empty-state"><strong>Unable to load profile</strong><button class="btn primary" id="profile-retry">TRY AGAIN</button></div>'; document.getElementById('profile-retry').onclick=renderProfile; }
  }

  function caseStatusLabel(c) {
    if (c.communityVerdict?.status === 'CLOSED') return 'COMMUNITY CLOSED';
    if (c.pilotResponseReceived) return 'PILOT RESPONDED';
    return 'AWAITING PILOT RESPONSE';
  }

  async function renderMyCases() {
    if (!window.authState?.loaded) return loading('My Cases');
    if (!window.authState.loggedIn) return authRequired('My Cases', 'Sign in with Discord to access cases associated with your controller account across devices.', '#mycases');
    loading('My Cases');
    try {
      const body = await request('/api/community?action=myCases');
      const cases = body.cases || [];
      app.innerHTML = shellBanner() + '<section class="community-page"><div class="section-head"><div><div class="eyebrow">Controller account</div><h1>My Cases</h1><p>Cases filed while signed into this Discord-backed 24PD account.</p></div></div><div class="my-case-grid">' + (cases.length ? cases.map(function(c){ return '<article class="tracker-card"><div class="tracker-card-top"><div><span class="tracker-case">'+esc(c.id)+'</span><h3>'+esc(c.callsign||'Unknown callsign')+'</h3></div><span class="status-badge">'+esc(caseStatusLabel(c))+'</span></div><div class="tracker-meta"><span><small>AIRCRAFT</small><strong>'+esc(c.aircraftType||'—')+'</strong></span><span><small>INCIDENT</small><strong>'+esc(c.incidentType||'—')+'</strong></span><span><small>STATUS</small><strong>'+esc(c.status||'—')+'</strong></span></div>' + (c.pilotResponseReceived ? '<a class="btn" href="#reports/'+encodeURIComponent(c.id)+'">VIEW PUBLIC CASE</a>' : '') + '</article>'; }).join('') : '<div class="empty-state"><strong>No account-linked cases yet</strong>New reports filed while logged in will appear here.</div>') + '</div></section>';
    } catch(error){ app.innerHTML=shellBanner()+'<div class="empty-state"><strong>Unable to load your cases</strong></div>'; }
  }

  async function renderMyComments() {
    if (!window.authState?.loaded) return loading('My Comments');
    if (!window.authState.loggedIn) return authRequired('My Comments', 'Sign in with Discord to view comments associated with your account.', '#mycomments');
    loading('My Comments');
    try {
      const body=await request('/api/community?action=myComments'); const rows=body.comments||[];
      app.innerHTML=shellBanner()+'<section class="community-page"><div class="section-head"><div><div class="eyebrow">Discussion history</div><h1>My Comments</h1></div></div><div class="my-comments">'+(rows.length?rows.map(function(r){return '<article class="case-panel"><a class="mono" href="#reports/'+encodeURIComponent(r.CaseID||'')+'">'+esc(r.CaseID||'')+'</a><p class="comment-body">'+esc(r.Body||'')+'</p><small>'+esc(r.Status||'')+' · '+esc(r.CreatedAt||'')+'</small></article>';}).join(''):'<div class="empty-state"><strong>No comments yet</strong>Your public case comments will appear here.</div>')+'</div></section>';
    }catch(e){app.innerHTML=shellBanner()+'<div class="empty-state"><strong>Unable to load comments</strong></div>';}
  }

  async function renderModeration() {
    if (!window.authState?.loaded) return loading('Moderation');
    const role=window.authState.user?.role;
    if (!window.authState.loggedIn || (role!=='MODERATOR'&&role!=='ADMIN')) { app.innerHTML=shellBanner()+'<div class="empty-state"><strong>Moderator access required</strong>This page is only available to 24PD moderators and administrators.</div>'; return; }
    loading('Moderation');
    try {
      const body=await request('/api/community?action=moderationQueue'); const q=body.queue||{};
      const cards=(q.underReview||[]).map(function(c){return '<article class="case-panel moderation-card" data-comment="'+esc(c.id)+'"><div class="eyebrow">Under review · '+esc(c.caseId)+'</div><h3>'+esc(c.author?.displayName||'User')+'</h3><p>'+esc(c.body||'')+'</p><div class="moderation-actions"><button class="btn" data-action="RESTORE">RESTORE</button><button class="btn" data-action="HIDE">HIDE</button><button class="btn danger" data-action="DELETE">DELETE</button><button class="btn" data-action="MUTE">MUTE USER</button><button class="btn danger" data-action="BAN">BAN USER</button></div></article>';}).join('');
      app.innerHTML=shellBanner()+'<section class="community-page"><div class="section-head"><div><div class="eyebrow">Staff tools</div><h1>Moderation</h1><p>Reported comments require human review. Reports are signals, not automatic proof of a violation.</p></div></div><h2>Comments Under Review</h2><div class="moderation-grid">'+(cards||'<div class="empty-state"><strong>Queue clear</strong>No comments are waiting for moderator review.</div>')+'</div></section>';
      document.querySelectorAll('.moderation-card button').forEach(function(btn){btn.onclick=async function(){const card=btn.closest('.moderation-card'); const reason=prompt('Moderator reason (optional):',''); btn.disabled=true; try{await request('/api/community?action=moderate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({commentId:card.dataset.comment,moderationAction:btn.dataset.action,reason:reason||''})});toast('Moderation action applied.');renderModeration();}catch(e){btn.disabled=false;toast(e.message||'Moderation action failed.');}};});
    }catch(e){app.innerHTML=shellBanner()+'<div class="empty-state"><strong>Unable to load moderation queue</strong></div>';}
  }

  function handleRoute() {
    ensureCommunityNav();
    const h=currentHash();
    if (h==='community') return renderCommunity();
    if (h==='profile') return renderProfile();
    if (h==='mycases') return renderMyCases();
    if (h==='mycomments') return renderMyComments();
    if (h==='moderation') return renderModeration();
  }

  ensureCommunityNav();
  window.addEventListener('hashchange', function(){setTimeout(handleRoute,0);});
  window.addEventListener('load', function(){setTimeout(handleRoute,0);});
  window.addEventListener('24pd:auth', function(){setTimeout(handleRoute,0);});
})();
