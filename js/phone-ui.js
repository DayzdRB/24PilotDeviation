'use strict';

/* 24Pilot Deviation phone-style contact UI. The datastore keeps its original
   six-digit PPD token; the UI maps it losslessly to (555) 2XX-XXXX. */
(function(){
  const PREFIX='5552';
  const original={
    home:renderHome, aircraft:renderAircraft, openAircraft:openAircraft,
    issued:renderIssued, respond:renderRespond, found:renderPilotFound,
    contact:renderContact
  };
  const digits=v=>String(v||'').replace(/\D/g,'');
  const token=v=>{const d=digits(v);if(d.length===6)return d;if(d.length===10&&d.startsWith(PREFIX))return d.slice(4);if(d.length===11&&d.startsWith('1'+PREFIX))return d.slice(5);return''};
  const phoneDigits=v=>{const t=token(v);return t?PREFIX+t:''};
  const formatDigits=v=>{let d=digits(v);if(d.length===11&&d[0]==='1')d=d.slice(1);d=d.slice(0,10);if(!d)return'';if(d.length<=3)return`(${d}`;if(d.length<=6)return`(${d.slice(0,3)}) ${d.slice(3)}`;return`(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`};
  const phone=v=>formatDigits(phoneDigits(v));
  const mask=input=>{if(!input)return;input.addEventListener('input',()=>{input.value=formatDigits(digits(input.value).slice(0,11))})};

  window.normalizeNumber=v=>token(v);

  window.renderHome=function(){
    original.home();
    const hero=app.querySelector('.hero-copy p');
    if(hero)hero.textContent='Document a possible pilot deviation, issue a simulated phone-style contact number, and give the involved pilot a structured way to respond — built around the way ATC24 actually operates.';
    const meta=app.querySelector('.hero-meta div:first-child');
    if(meta)meta.innerHTML='<strong>10 DIGITS</strong>phone-style contact ID';
    const cards=app.querySelectorAll('.action-card');
    if(cards[0]){const p=cards[0].querySelector('p');if(p)p.textContent='Select an aircraft from the current ATC24 feed. Callsign, aircraft type, and Roblox pilot username are copied into the report automatically.'}
    if(cards[1]){const p=cards[1].querySelector('p');if(p)p.textContent='Enter the simulated 24PD contact number provided by ATC.'}
    const input=document.getElementById('home-number');
    if(input){input.placeholder='(555) 248-2731';input.maxLength=16;input.inputMode='tel';mask(input)}
  };

  window.renderAircraft=function(){
    original.aircraft();
    const headers=app.querySelectorAll('thead th');
    if(headers[1])headers[1].textContent='Roblox Pilot';
    const search=document.getElementById('air-search');
    if(search)search.placeholder='Search callsign or Roblox pilot';
    app.querySelectorAll('#air-body tr td:nth-child(2)').forEach(td=>{if(td.textContent.trim())td.innerHTML=`<span class="roblox-pilot"><span class="roblox-dot"></span>${esc(td.textContent.trim())}</span>`});
  };

  window.openAircraft=function(a){
    original.openAircraft(a);
    const drawer=document.querySelector('.drawer');
    if(!drawer)return;
    const firstMetric=drawer.querySelector('.metric span');
    if(firstMetric)firstMetric.textContent='ROBLOX PILOT';
  };

  window.renderIssued=function(){
    original.issued();
    const r=state.issuedReport,n=phone(r.ppdNumber);
    const display=app.querySelector('.number-display');
    if(display){display.classList.add('phone-number-display');display.textContent=n}
    const phrase=app.querySelector('.phraseology');
    if(phrase)phrase.innerHTML=phrase.innerHTML.split(esc(r.ppdNumber)).join(esc(n));
    const btn=document.getElementById('copy-number');
    if(btn){btn.textContent='COPY CONTACT NUMBER';btn.onclick=()=>copy(n,'Contact number copied.')}
    const caseId=app.querySelector('.case-id');
    if(caseId)caseId.insertAdjacentHTML('beforebegin',`<div class="phone-pilot-line"><span>ROBLOX PILOT</span><strong>${esc(r.aircraft.playerName||'Not provided')}</strong></div>`);
    app.querySelector('.issue-screen')?.insertAdjacentHTML('beforeend','<div class="phone-disclaimer issued-disclaimer">Simulated in-site contact number — no real telephone call is placed.</div>');
  };

  function dialer(prefill){
    const d=digits(prefill),shown=d.length===6?phone(d):formatDigits(d);
    const keys=[['1',''],['2','ABC'],['3','DEF'],['4','GHI'],['5','JKL'],['6','MNO'],['7','PQRS'],['8','TUV'],['9','WXYZ'],['*',''],['0','+'],['#','']];
    app.innerHTML=`${shellBanner()}<div class="dialer-shell"><div class="dialer-top"><div class="eyebrow">Pilot response</div><h1>Enter Contact Number</h1><p>Use the simulated phone-style number given to you by ATC.</p></div><div class="dialer-display-wrap"><input id="pilot-number" inputmode="tel" autocomplete="off" maxlength="16" value="${esc(shown)}" placeholder="(555) 248-2731"><div class="dialer-label">24PD CONTACT</div></div><div class="dialer-grid">${keys.map(([n,l])=>`<button class="dial-key ${n==='*'||n==='#'?'dial-key-secondary':''}" type="button" data-key="${n}"><span>${n}</span><small>${l||'&nbsp;'}</small></button>`).join('')}</div><div class="dialer-actions"><button class="dial-delete" id="dial-delete" type="button">⌫</button><button class="dial-call" id="pilot-lookup" type="button" aria-label="Locate report">☎</button><div class="dial-action-spacer"></div></div><div class="dialer-help"><strong>LOCATE REPORT</strong><span>Press the green button when the full number is entered.</span></div><div class="phone-disclaimer">Simulated number only. No telephone call is placed. Legacy six-digit PPD numbers are still accepted when typed or pasted.</div></div>`;
    const input=document.getElementById('pilot-number');mask(input);
    app.querySelectorAll('.dial-key').forEach(b=>b.onclick=()=>{const k=b.dataset.key;if(k==='*'||k==='#'){b.classList.add('pressed');setTimeout(()=>b.classList.remove('pressed'),120);return}let d=digits(input.value);if(d.length<10){d+=k;input.value=formatDigits(d);input.focus()}});
    document.getElementById('dial-delete').onclick=()=>{input.value=formatDigits(digits(input.value).slice(0,-1));input.focus()};
    document.getElementById('pilot-lookup').onclick=()=>lookupPilot(input.value);
    input.addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('pilot-lookup').click()});
  }

  window.renderRespond=function(){
    if(state.pilotStage!=='lookup')return original.respond();
    const prefill=sessionStorage.getItem('24pd_lookup')||'';sessionStorage.removeItem('24pd_lookup');dialer(prefill);
  };

  window.lookupPilot=async function(value){
    const n=token(value);if(!n)return toast('Enter the complete 24PD contact number, or a legacy six-digit PPD number.');
    const btn=document.getElementById('pilot-lookup');btn.disabled=true;btn.classList.add('searching');let report=null;
    try{const body=await api(`/api/reports/lookup?number=${encodeURIComponent(n)}`);report=body.report}
    catch(e){if(e.status===503&&e.body?.fallbackAllowed)report=localLookup(n);else{btn.disabled=false;btn.classList.remove('searching');return toast(e.status===404?'No active report was found for that contact number.':'Unable to search reports right now.')}}
    if(!report){btn.disabled=false;btn.classList.remove('searching');return toast('No local demo report was found for that contact number.')}
    state.pilotCase=report;state.pilotStage='found';renderRespond();
  };

  window.renderPilotFound=function(){
    original.found();
    const r=state.pilotCase,grid=app.querySelector('.review-grid');
    if(grid&&r.aircraft.playerName)grid.children[0]?.insertAdjacentHTML('afterend',`<div class="review-item"><span>Roblox Pilot</span><strong>${esc(r.aircraft.playerName)}</strong></div>`);
    const h2=app.querySelector('.found-card h2');if(h2)h2.insertAdjacentHTML('afterend',`<div class="located-contact"><span>CONTACT NUMBER</span><strong>${esc(phone(r.ppdNumber))}</strong></div>`);
  };

  window.renderContact=function(){
    original.contact();
    const r=state.pilotCase,display=app.querySelector('.number-display');
    if(display){display.classList.add('contact-phone-number');display.textContent=phone(r.ppdNumber)}
    const p=app.querySelector('.contact-screen p');if(p)p.insertAdjacentHTML('beforebegin',`<div class="contact-pilot"><span>ROBLOX PILOT</span><strong>${esc(r.aircraft.playerName||'Not provided')}</strong></div>`);
  };

  const rerender=()=>{if(typeof render==='function')render()};
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',rerender,{once:true});else rerender();
})();
