'use strict';

(function () {
  const PILOT_PATH = '/pilot';
  const originalRenderIssued = window.renderIssued;

  function pilotUrl() { return window.location.origin + PILOT_PATH; }
  function formatContactNumber(value) {
    const token = String(value || '').replace(/\D/g, '');
    if (token.length !== 6) return token;
    const digits = '5552' + token;
    return '(' + digits.slice(0,3) + ') ' + digits.slice(3,6) + '-' + digits.slice(6);
  }
  function copyText(value, successMessage) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(function(){ toast(successMessage); }).catch(function(){ toast('Copy failed. Select and copy the message manually.'); });
      return;
    }
    toast(value);
  }

  window.renderIssued = function () {
    originalRenderIssued();
    const report = state.issuedReport;
    const screen = app.querySelector('.issue-screen');
    if (!report || !screen || document.getElementById('pilot-share-card')) return;

    const contact = formatContactNumber(report.ppdNumber);
    const url = pilotUrl();
    const shareMessage = [
      'Possible Pilot Deviation',
      '',
      'You have received a 24Pilot Deviation report.',
      '',
      '24PD Number:',
      contact,
      '',
      'Respond here:',
      url,
      '',
      'Enter the number above, review the report, and submit your response.',
      '',
      '24Pilot Deviation is an unofficial ATC24 community tool.'
    ].join('\n');

    const card = document.createElement('section');
    card.id = 'pilot-share-card'; card.className = 'pilot-share-card';
    card.innerHTML = '<div class="pilot-share-copy"><div class="eyebrow">Pilot response message</div><h3>Send the complete ATC message</h3><p>The copied message includes the pilot instructions, 24PD contact number, and clean response link. Discord will display the branded phone-dial preview automatically.</p><div class="pilot-share-url mono">' + esc(url) + '</div></div><div class="pilot-share-actions"><button class="btn primary" id="copy-pilot-message">COPY ATC MESSAGE</button></div>';
    screen.appendChild(card);
    document.getElementById('copy-pilot-message').onclick = function(){ copyText(shareMessage, 'ATC message copied.'); };
  };
})();
