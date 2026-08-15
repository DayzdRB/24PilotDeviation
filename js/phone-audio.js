'use strict';

(function () {
  const KEY = '24pd_sound_enabled';
  const tones = {
    '1':[697,1209], '2':[697,1336], '3':[697,1477],
    '4':[770,1209], '5':[770,1336], '6':[770,1477],
    '7':[852,1209], '8':[852,1336], '9':[852,1477],
    '*':[941,1209], '0':[941,1336], '#':[941,1477]
  };
  let ctx = null;

  function enabled() {
    const value = localStorage.getItem(KEY);
    return value === null ? true : value !== 'false';
  }

  function setEnabled(value) {
    localStorage.setItem(KEY, value ? 'true' : 'false');
    updateToggle();
  }

  function audioContext() {
    if (!enabled()) return null;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') ctx.resume().catch(function(){});
    return ctx;
  }

  function playPair(freqs, duration, volume) {
    const context = audioContext();
    if (!context || !freqs || !freqs.length) return;
    const now = context.currentTime;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume || 0.035, now + 0.008);
    gain.gain.setValueAtTime(volume || 0.035, now + Math.max(0.01, duration - 0.02));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    gain.connect(context.destination);
    freqs.forEach(function(freq){
      const osc = context.createOscillator();
      osc.type = 'sine'; osc.frequency.setValueAtTime(freq, now);
      osc.connect(gain); osc.start(now); osc.stop(now + duration + 0.01);
    });
  }

  function dtmf(key) { if (tones[key]) playPair(tones[key], 0.12, 0.03); }
  function deletion() { playPair([360], 0.055, 0.022); }
  function calling() { playPair([440,480], 0.15, 0.027); }
  function success() { playPair([660],0.07,0.025); setTimeout(function(){playPair([880],0.1,0.025);},85); }
  function error() { playPair([300,420],0.13,0.025); }

  function updateToggle() {
    const button = document.getElementById('dial-sound-toggle');
    if (!button) return;
    button.textContent = 'SOUND ' + (enabled() ? 'ON' : 'OFF');
    button.setAttribute('aria-pressed', String(enabled()));
  }

  function injectToggle() {
    if (!document.querySelector('.dialer-shell') || document.getElementById('dial-sound-toggle')) return;
    const help = document.querySelector('.dialer-help');
    if (!help) return;
    const button = document.createElement('button');
    button.type = 'button'; button.id = 'dial-sound-toggle'; button.className = 'dial-sound-toggle';
    button.onclick = function(){ setEnabled(!enabled()); if (enabled()) success(); };
    help.appendChild(button); updateToggle();
  }

  const originalRenderRespond = window.renderRespond;
  if (typeof originalRenderRespond === 'function') {
    window.renderRespond = function(){ originalRenderRespond(); injectToggle(); };
  }

  const originalLookup = window.lookupPilot;
  if (typeof originalLookup === 'function') {
    window.lookupPilot = async function(value) {
      const valid = typeof window.normalizeNumber === 'function' ? Boolean(window.normalizeNumber(value)) : true;
      if (!valid) error();
      const before = state.pilotStage;
      await originalLookup(value);
      if (state.pilotStage === 'found' && before !== 'found') success();
      else if (valid && state.pilotStage !== 'found') error();
    };
  }

  document.addEventListener('click', function(event){
    const key = event.target.closest('.dial-key');
    if (key) return dtmf(key.dataset.key);
    if (event.target.closest('#dial-delete')) return deletion();
    if (event.target.closest('#pilot-lookup')) return calling();
  }, true);

  window.addEventListener('hashchange', function(){ setTimeout(injectToggle,0); });
  setTimeout(injectToggle,0);
})();
