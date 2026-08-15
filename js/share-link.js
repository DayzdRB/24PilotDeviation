'use strict';

(function () {
  const PILOT_PATH = '/pilot';
  const originalRenderIssued = window.renderIssued;

  function pilotUrl() {
    return window.location.origin + PILOT_PATH;
  }

  function formatContactNumber(value) {
    const token = String(value || '').replace(/\D/g, '');
    if (token.length !== 6) return token;
    const digits = '5552' + token;
    return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
  }

  function copyText(value, successMessage) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(function () {
        toast(successMessage);
      }).catch(function () {
        toast('Copy failed. Select the pilot link manually.');
      });
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
      'Possible Pilot Deviation — Pilot Response Required',
      'Open the 24Pilot Deviation link, enter the contact number given by ATC, verify the report details, and submit your response.',
      'Contact number: ' + contact,
      url
    ].join('\n');

    const card = document.createElement('section');
    card.id = 'pilot-share-card';
    card.className = 'pilot-share-card';
    card.innerHTML =
      '<div class="pilot-share-copy">' +
        '<div class="eyebrow">Pilot response link</div>' +
        '<h3>Send this link with the deviation number</h3>' +
        '<p>Discord and compatible chat apps will show a branded 24PD phone-dial preview. The preview title and description tell the pilot how to respond; the contact number is not placed in the URL.</p>' +
        '<div class="pilot-share-url mono">' + esc(url) + '</div>' +
      '</div>' +
      '<div class="pilot-share-actions">' +
        '<button class="btn primary" id="copy-pilot-link">COPY PILOT LINK</button>' +
        '<button class="btn" id="copy-pilot-message">COPY ATC MESSAGE</button>' +
      '</div>';

    screen.appendChild(card);

    document.getElementById('copy-pilot-link').onclick = function () {
      copyText(url, 'Pilot response link copied.');
    };
    document.getElementById('copy-pilot-message').onclick = function () {
      copyText(shareMessage, 'Pilot instructions and link copied.');
    };
  };
})();
