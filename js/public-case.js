'use strict';

(function () {
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
    if (String(v.status || '').toUpperCase() === 'CLOSED') {
      const winner = String(v.winner || v.leader || '').toUpperCase();
      if (winner === 'ATC') return 'ATC WON — ' + (Number(v.percentage) || 0) + '%';
      if (winner === 'PILOT') return 'PILOT WON — ' + (Number(v.percentage) || 0) + '%';
      if (winner === 'INCONCLUSIVE') return 'Inconclusive';
      if (winner === 'TIED') return 'Tied';
      if (winner === 'INSUFFICIENT_VOTES') return 'Insufficient votes';
    }
    const leader = String(v.leader || 'NO VOTES').toUpperCase();
    if (leader === 'NO VOTES') return 'No votes yet';
    if (leader === 'TIED') return 'Tied — ' + (Number(v.percentage) || 0) + '%';
    const label = leader === 'INCONCLUSIVE' ? 'Inconclusive' : leader;
    return label + ' — ' + (Number(v.percentage) || 0) + '%';
  }

  function remainingTime(value) {
    const end = Date.parse(String(value || ''));
    if (!Number.isFinite(end)) return '';
    const ms = Math.max(0, end - Date.now());
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    if (days) return days + 'd ' + hours + 'h';
    if (hours) return hours + 'h ' + minutes + 'm';
    return minutes + 'm';
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
        let diff = ((Number(observedHeading) - Number(assignedHeading) + 540) % 360) - 180;
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

  function renderVoteResults(report) {
    const votes = report.votes || { atc:0, pilot:0, inconclusive:0, total:0 };
    const total = Number(votes.total || 0);
    const rows = [['ATC',Number(votes.atc||0)],['PILOT',Number(votes.pilot||0)],['INCONCLUSIVE',Number(votes.inconclusive||0)]];
    const verdict = report.communityVerdict || {};
    const status = String(verdict.status || 'OPEN').toUpperCase();
    const summaryLabel = status === 'CLOSED' ? 'Final community verdict' : 'Current community verdict';
    return '<div class="verdict-summary"><span>' + summaryLabel + '</span><strong>' + esc(verdictText(verdict)) + '</strong><small>' + total.toLocaleString() + ' total vote' + (total === 1 ? '' : 's') + '</small></div>' +
      '<div class="vote-results">' + rows.map(function(row){const pct=votePercent(row[1],total);return '<div class="vote-result"><div class="vote-result-head"><strong>'+esc(row[0])+'</strong><span>'+pct+'% · '+row[1].toLocaleString()+' vote'+(row[1]===1?'':'s')+'</span></div><div class="vote-track"><span style="width:'+pct+'%"></span></div></div>';}).join('') + '</div>';
  }

  function verdictRequirements(verdict) {
    if (!verdict || String(verdict.status || '').toUpperCase() === 'CLOSED') return '';
    const r = verdict.requirements || {}, rules = verdict.rules || {minimumVotes:8,minimumHours:24,winningPercentage:65};
    const item = function(ok,label){return '<div class="verdict-requirement '+(ok?'met':'pending')+'"><span>'+(ok?'✓':'○')+'</span><strong>'+esc(label)+'</strong></div>';};
    return '<div class="verdict-rules"><div><span>VOTING CLOSES IN</span><strong>'+esc(remainingTime(verdict.closesAt) || '—')+'</strong><small>'+esc(verdict.closesAt ? displayDate(verdict.closesAt) : '')+'</small></div><div class="verdict-requirements">' +
      item(Boolean(r.minimumVotesMet),'At least '+Number(rules.minimumVotes||8)+' votes') +
      item(Boolean(r.minimumTimeMet),'Voting open '+Number(rules.minimumHours||24)+' hours') +
      item(Boolean(r.winningPercentageMet),'ATC or Pilot reaches '+Number(rules.winningPercentage||65)+'%') + '</div>' +
      (verdict.qualifyingResult ? '<div class="qualifying-verdict"><span>CURRENT QUALIFYING RESULT</span><strong>'+esc(verdict.qualifyingResult)+'</strong><p>The threshold is currently met, but voting remains open for the full seven-day period.</p></div>' : '') + '</div>';
  }

  function renderVoting(report) {
    const verdict = report.communityVerdict || {};
    const closed = String(verdict.status || '').toUpperCase() === 'CLOSED';
    let actionMarkup = '';
    if (closed) {
      actionMarkup = '<div class="vote-complete"><strong>Community voting closed</strong><span>' + esc(verdict.closedAt ? 'Closed ' + displayDate(verdict.closedAt) + '.' : 'The seven-day voting period has ended.') + '</span></div>';
    } else if (!window.authState || !window.authState.loaded) {
      actionMarkup = '<div class="vote-auth-loading"><div class="skeleton"></div><div class="skeleton short"></div></div>';
    } else if (!window.authState.loggedIn) {
      actionMarkup = '<div class="vote-login-gate"><strong>Sign in to vote</strong><span>Community voting uses your Discord-backed 24PD account so one account can vote only once per case.</span><button class="btn primary" id="vote-discord-login" type="button">LOGIN WITH DISCORD</button></div>';
    } else if (report.viewerVote) {
      actionMarkup = '<div class="vote-complete">Your account voted <strong>' + esc(report.viewerVote) + '</strong> on this case. Votes cannot currently be changed.</div>';
    } else {
      actionMarkup = '<div class="vote-actions"><button class="vote-choice" data-vote="ATC"><strong>ATC</strong><span>The controller’s report is more convincing</span></button><button class="vote-choice" data-vote="PILOT"><strong>PILOT</strong><span>The pilot’s response is more convincing</span></button><button class="vote-choice" data-vote="INCONCLUSIVE"><strong>INCONCLUSIVE</strong><span>There is not enough information to choose a side</span></button></div><div class="vote-confirm" id="vote-confirm" hidden><span>YOUR VOTE</span><strong id="vote-confirm-choice"></strong><p>Votes cannot currently be changed after submission.</p><div><button class="btn primary" id="vote-confirm-submit" type="button">CONFIRM VOTE</button><button class="btn" id="vote-confirm-cancel" type="button">CANCEL</button></div></div>';
    }
    return '<section class="case-panel community-panel"><div class="case-panel-head"><div><div class="eyebrow">Community verdict</div><h2>Who had the stronger case?</h2><p>Community opinion is separate from the case status and is never an official ATC24 ruling.</p></div></div>' + renderVoteResults(report) + verdictRequirements(verdict) + actionMarkup + '<div class="community-vote-disclaimer">Community verdicts reflect user opinion only. They do not determine an official violation, punishment, or administrative finding.</div></section>';
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

  let commentState = { caseId:'', comments:[], nextOffset:null, total:0 };

  function commentAvatar(author) {
    if (author && author.avatar) return '<img src="'+esc(author.avatar)+'" alt="" loading="lazy" referrerpolicy="no-referrer">';
    const initial = String(author && (author.displayName || author.username) || 'U').slice(0,1).toUpperCase();
    return '<span>'+esc(initial)+'</span>';
  }

  function commentMarkup(comment) {
    const author = comment.author || {};
    const mine = Boolean(comment.canEdit);
    const reply = comment.parentCommentId ? ' comment-reply' : '';
    return '<article class="case-comment'+reply+'" data-comment="'+esc(comment.id)+'"><div class="comment-avatar">'+commentAvatar(author)+'</div><div class="comment-content"><div class="comment-head"><strong>'+esc(author.displayName || author.username || '24PD User')+'</strong>'+(author.role && author.role!=='USER'?'<span class="comment-role">'+esc(author.role)+'</span>':'')+'<time>'+esc(displayDate(comment.createdAt))+'</time></div><p>'+esc(comment.body || '')+'</p><div class="comment-actions">'+(!comment.parentCommentId && window.authState?.loggedIn?'<button type="button" data-comment-action="reply">REPLY</button>':'')+(window.authState?.loggedIn && !mine?'<button type="button" data-comment-action="report">REPORT</button>':'')+(mine?'<button type="button" data-comment-action="edit">EDIT</button><button type="button" data-comment-action="delete">DELETE</button>':'')+'</div></div></article>';
  }

  function renderCommentsList() {
    const host = document.getElementById('case-comments-list');
    if (!host) return;
    if (!commentState.comments.length) {
      host.innerHTML = '<div class="empty-state discussion-empty"><strong>No comments yet</strong>Be the first logged-in community member to discuss this case.</div>';
    } else {
      const top = commentState.comments.filter(function(c){return !c.parentCommentId;});
      const replies = {};
      commentState.comments.filter(function(c){return c.parentCommentId;}).forEach(function(c){(replies[c.parentCommentId]||(replies[c.parentCommentId]=[])).push(c);});
      host.innerHTML = top.map(function(c){return '<div class="comment-thread">'+commentMarkup(c)+(replies[c.id]||[]).map(commentMarkup).join('')+'</div>';}).join('');
    }
    const count = document.getElementById('comment-count'); if (count) count.textContent = Number(commentState.total||0).toLocaleString() + ' COMMENT' + (Number(commentState.total||0)===1?'':'S');
    const more = document.getElementById('comments-load-more'); if (more) { more.hidden = commentState.nextOffset === null; more.disabled=false; more.textContent='LOAD MORE'; }
    bindCommentActions();
  }

  function renderDiscussion(caseId) {
    const auth = window.authState || {loaded:false,loggedIn:false};
    const composer = !auth.loaded ? '<div class="comment-composer skeleton-composer"><div class="skeleton"></div><div class="skeleton"></div></div>' : auth.loggedIn ? '<div class="comment-composer"><textarea id="comment-input" maxlength="1500" placeholder="Add to the discussion…" aria-label="Public case comment"></textarea><div><small><span id="comment-chars">0</span>/1500</small><button class="btn primary" id="comment-submit" type="button">POST COMMENT</button></div></div>' : '<div class="comment-login"><strong>Sign in to join the discussion</strong><span>Anyone can read comments. A Discord-backed 24PD account is required to write, reply, or report.</span><button class="btn primary" id="comment-login" type="button">LOGIN WITH DISCORD</button></div>';
    return '<section class="case-panel discussion-panel" id="case-discussion"><div class="case-panel-head"><div><div class="eyebrow">Public discussion</div><h2>Discussion</h2><p>Keep comments focused on the case, evidence, and ATC/pilot statements.</p></div><strong class="comment-count" id="comment-count">COMMENTS</strong></div>'+composer+'<div id="case-comments-list" class="comments-list"><div class="comment-skeleton"><div class="skeleton"></div><div class="skeleton short"></div></div><div class="comment-skeleton"><div class="skeleton"></div><div class="skeleton short"></div></div></div><button class="btn comments-more" id="comments-load-more" type="button" hidden>LOAD MORE</button></section>';
  }

  async function loadComments(caseId, append) {
    if (!append || commentState.caseId !== caseId) commentState = {caseId:caseId,comments:[],nextOffset:null,total:0};
    const offset = append && commentState.nextOffset !== null ? commentState.nextOffset : 0;
    try {
      const body = await api('/api/community?action=comments&caseId='+encodeURIComponent(caseId)+'&offset='+offset+'&limit=20');
      commentState.comments = append ? commentState.comments.concat(body.comments || []) : (body.comments || []);
      commentState.nextOffset = body.nextOffset;
      commentState.total = Number(body.total || 0);
      renderCommentsList();
    } catch (error) {
      const host=document.getElementById('case-comments-list'); if(host)host.innerHTML='<div class="empty-state"><strong>Unable to load discussion</strong><button class="btn" id="comments-retry">TRY AGAIN</button></div>';
      const retry=document.getElementById('comments-retry'); if(retry)retry.onclick=function(){loadComments(caseId,false);};
    }
  }

  async function submitComment(caseId, body, parentCommentId, button) {
    const text=String(body||'').trim(); if(text.length<2)return toast('Comments must be at least 2 characters.');
    if(button){button.disabled=true;button.textContent='POSTING…';}
    try {
      await api('/api/community?action=commentCreate',{method:'POST',body:JSON.stringify({caseId:caseId,parentCommentId:parentCommentId||'',body:text})});
      toast(parentCommentId?'Reply posted.':'Comment posted.'); await loadComments(caseId,false);
    } catch(error) {
      if(error.status===401){window.loginWithDiscord(location.hash);return;}
      toast(error.body?.message || error.message || 'Unable to post comment.'); if(button){button.disabled=false;button.textContent='POST COMMENT';}
    }
  }

  function bindDiscussionControls(caseId) {
    const login=document.getElementById('comment-login'); if(login)login.onclick=function(){window.loginWithDiscord(location.hash);};
    const input=document.getElementById('comment-input'); const chars=document.getElementById('comment-chars'); if(input&&chars)input.oninput=function(){chars.textContent=String(input.value.length);};
    const submit=document.getElementById('comment-submit'); if(submit)submit.onclick=function(){submitComment(caseId,input.value,'',submit);};
    const more=document.getElementById('comments-load-more'); if(more)more.onclick=function(){more.disabled=true;more.textContent='LOADING…';loadComments(caseId,true);};
  }

  function bindCommentActions() {
    document.querySelectorAll('[data-comment-action]').forEach(function(button){
      button.onclick=async function(){
        const card=button.closest('.case-comment'); const id=card && card.dataset.comment; const comment=commentState.comments.find(function(c){return c.id===id;}); if(!comment)return;
        const action=button.dataset.commentAction;
        if(action==='reply'){
          document.querySelectorAll('.inline-reply').forEach(function(x){x.remove();});
          const form=document.createElement('div');form.className='inline-reply';form.innerHTML='<textarea maxlength="1500" placeholder="Reply to '+esc(comment.author?.displayName||'this comment')+'"></textarea><div><button class="btn primary" type="button">POST REPLY</button><button class="btn cancel-reply" type="button">CANCEL</button></div>';
          card.after(form); form.querySelector('.cancel-reply').onclick=function(){form.remove();}; const post=form.querySelector('.btn.primary'); post.onclick=function(){submitComment(activeCase.caseId,form.querySelector('textarea').value,comment.id,post);}; return;
        }
        if(action==='edit'){
          const next=prompt('Edit your comment:',comment.body||''); if(next===null)return; button.disabled=true;
          try{await api('/api/community?action=commentEdit',{method:'POST',body:JSON.stringify({commentId:id,body:next})});toast('Comment updated.');loadComments(activeCase.caseId,false);}catch(e){button.disabled=false;toast(e.body?.message||'Unable to edit comment.');}return;
        }
        if(action==='delete'){
          if(!confirm('Delete this comment?'))return; button.disabled=true; try{await api('/api/community?action=commentDelete',{method:'POST',body:JSON.stringify({commentId:id})});toast('Comment deleted.');loadComments(activeCase.caseId,false);}catch(e){button.disabled=false;toast(e.body?.message||'Unable to delete comment.');}return;
        }
        if(action==='report'){
          const reason=prompt('Report reason: Spam, Harassment, Personal Attack, Off Topic, Inappropriate Content, or Other','Off Topic'); if(reason===null)return; const allowed=['Spam','Harassment','Personal Attack','Off Topic','Inappropriate Content','Other']; if(!allowed.includes(reason))return toast('Use one of the listed report reasons.');
          button.disabled=true; try{await api('/api/community?action=commentReport',{method:'POST',body:JSON.stringify({commentId:id,reason:reason,details:''})});toast('Comment reported for moderator review.');loadComments(activeCase.caseId,false);}catch(e){button.disabled=false;toast(e.body?.message||'Unable to report comment.');}
        }
      };
    });
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
        renderDiscussion(report.caseId) +
        '<div class="case-disclaimer">Community voting and discussion are informal community features. They do not determine whether a deviation is confirmed, dismissed, punished, or officially closed.</div>' +
      '</section>';

    document.getElementById('case-back').onclick = function () { location.hash = 'reports'; };
    const voteLogin = document.getElementById('vote-discord-login');
    if (voteLogin) voteLogin.onclick = function(){ window.loginWithDiscord(location.hash); };
    document.querySelectorAll('.vote-choice').forEach(function(button){
      button.onclick=function(){
        const box=document.getElementById('vote-confirm'); if(!box)return;
        box.hidden=false; box.dataset.vote=button.dataset.vote;
        document.getElementById('vote-confirm-choice').textContent=button.dataset.vote;
        box.scrollIntoView({behavior:'smooth',block:'nearest'});
      };
    });
    const cancelVote=document.getElementById('vote-confirm-cancel'); if(cancelVote)cancelVote.onclick=function(){document.getElementById('vote-confirm').hidden=true;};
    const confirmVote=document.getElementById('vote-confirm-submit'); if(confirmVote)confirmVote.onclick=function(){const box=document.getElementById('vote-confirm');castVote(report.caseId,box.dataset.vote,confirmVote);};
    bindDiscussionControls(report.caseId);
    loadComments(report.caseId,false);
  }

  async function castVote(caseId, vote, submitButton) {
    if (!window.authState?.loggedIn) return window.loginWithDiscord(location.hash);
    document.querySelectorAll('.vote-choice').forEach(function(button){button.disabled=true;});
    if (submitButton) { submitButton.disabled=true; submitButton.textContent='RECORDING…'; }
    try {
      const body=await api('/api/public/vote',{method:'POST',body:JSON.stringify({caseId:caseId,vote:vote})});
      activeCase.votes=body.votes; activeCase.communityVerdict=body.communityVerdict; activeCase.viewerVote=body.viewerVote || body.vote;
      renderCaseDetail(activeCase); toast('Community vote recorded.'); if(typeof window.loadPublicReports==='function')window.loadPublicReports();
    } catch(error) {
      if(error.status===401){window.loginWithDiscord(location.hash);return;}
      if(error.status===409 && error.body?.error==='duplicate_vote'){toast('Your Discord account has already voted on this case.');loadCase(caseId);return;}
      if(error.status===409 && error.body?.error==='community_voting_closed'){toast('Community voting has closed for this case.');loadCase(caseId);return;}
      document.querySelectorAll('.vote-choice').forEach(function(button){button.disabled=false;});
      if(submitButton){submitButton.disabled=false;submitButton.textContent='CONFIRM VOTE';}
      toast(error.body?.message || 'Unable to record your vote.');
    }
  }

  function caseSkeleton(caseId) {
    return shellBanner() + '<section class="case-dossier case-skeleton"><div class="skeleton skeleton-back"></div><header class="case-hero"><div><div class="skeleton skeleton-small"></div><div class="skeleton skeleton-case"></div><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-line"></div></div><div class="skeleton skeleton-status"></div></header><section class="case-panel"><div class="skeleton skeleton-heading"></div><div class="skeleton-meta-grid">'+Array(8).fill('<div class="skeleton"></div>').join('')+'</div></section><section class="case-side-grid"><article class="case-panel">'+Array(5).fill('<div class="skeleton skeleton-line"></div>').join('')+'</article><article class="case-panel">'+Array(5).fill('<div class="skeleton skeleton-line"></div>').join('')+'</article></section><section class="case-panel"><div class="skeleton skeleton-heading"></div><div class="skeleton skeleton-line"></div></section><span class="mono skeleton-case-id">'+esc(caseId)+'</span></section>';
  }

  async function loadCase(caseId) {
    setReportsNavActive();
    app.innerHTML = caseSkeleton(caseId);
    try {
      const body = await api('/api/public/report?caseId=' + encodeURIComponent(caseId));
      renderCaseDetail(body.report);
    } catch (error) {
      app.innerHTML = shellBanner() + '<div class="empty-state case-error"><strong>Public case unavailable</strong>' + (error.status === 404 ? 'This case is not published or no longer exists.' : 'The case could not be loaded right now.') + '<div><button class="btn primary" id="case-error-retry">TRY AGAIN</button><button class="btn" id="case-error-back">PUBLIC REPORTS</button></div></div>';
      document.getElementById('case-error-retry').onclick=function(){loadCase(caseId);};
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
  window.addEventListener('24pd:auth', function () { if (activeCase && hashCaseId()) loadCase(activeCase.caseId); });
})();
