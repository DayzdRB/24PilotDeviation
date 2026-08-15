'use strict';

/*
 * Incident classification improvements.
 * - Requires the controller to deliberately choose an incident type.
 * - Supports a true custom category whose text is stored as IncidentType.
 * - Keeps the existing backend/schema unchanged: incident.category remains
 *   the canonical value used by pilot lookup and Public Reports.
 */
(function () {
  const PRESETS = [
    'Altitude Deviation',
    'Heading Deviation',
    'Route / Procedure Deviation',
    'Speed Deviation',
    'Runway Incursion',
    'Taxi Instruction Deviation',
    'Unauthorized Takeoff',
    'Unauthorized Landing',
    'Failure to Follow ATC Instruction',
    'Missed / Incorrect Handoff',
    'Airspace Violation',
    'Separation Issue',
    'Communication / Readback Issue',
    'Wrong Runway / Airport'
  ];
  const CUSTOM = '__custom__';
  const originalRenderFileStage = window.renderFileStage;

  if (typeof originalRenderFileStage !== 'function') return;

  function option(value, label, selected) {
    return '<option value="' + esc(value) + '"' + (selected ? ' selected' : '') + '>' + esc(label) + '</option>';
  }

  function renderIncidentClassification() {
    const host = document.getElementById('file-stage');
    const d = state.draft;
    if (!host || !d) return;

    // Older freshDraft() versions defaulted silently to Altitude Deviation.
    // Until the controller explicitly makes a choice in this new UI, treat
    // that legacy default as unselected rather than assuming altitude.
    let selected = '';
    if (d.incident._categoryChosen) {
      selected = PRESETS.includes(d.incident.category) ? d.incident.category : CUSTOM;
    }

    const customValue = selected === CUSTOM ? (d.incident.category || '') : '';
    const categoryOptions = [
      option('', 'Select incident type…', selected === ''),
      ...PRESETS.map(function (item) { return option(item, item, selected === item); }),
      option(CUSTOM, 'Other / Custom…', selected === CUSTOM)
    ].join('');

    host.innerHTML =
      '<div class="form-section">' +
        '<h3>Incident classification</h3>' +
        '<div class="form-grid">' +
          '<div class="field">' +
            '<label>Incident type *</label>' +
            '<select id="f-category">' + categoryOptions + '</select>' +
            '<small>Choose the category that best describes the reported event.</small>' +
          '</div>' +
          '<div class="field" id="custom-category-field"' + (selected === CUSTOM ? '' : ' hidden') + '>' +
            '<label>Custom incident type *</label>' +
            '<input id="f-category-custom" maxlength="80" value="' + esc(customValue) + '" placeholder="Example: Incorrect approach clearance compliance">' +
            '<small>This exact wording will be stored on the case and shown on Public Reports.</small>' +
          '</div>' +
          '<div class="field"><label>Controller position</label><select id="f-position">' +
            ['DEL','GND','TWR','APP','DEP','CTR','OTHER'].map(function (x) { return '<option' + (d.incident.controllerPosition === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') +
          '</select></div>' +
          '<div class="field"><label>Airport</label><input id="f-airport" value="' + esc(d.incident.airport) + '" placeholder="IRFD"></div>' +
          '<div class="field"><label>Airspace / ACC</label><input id="f-airspace" value="' + esc(d.incident.airspace) + '" placeholder="IZOL CTR"></div>' +
          '<div class="field"><label>ATC Roblox username</label><input id="f-atc" value="' + esc(d.atcReport.atcUsername) + '" placeholder="Controller username"></div>' +
          '<div class="field"><label>Occurred at</label><input id="f-time" type="datetime-local" value="' + toLocalInput(d.incident.occurredAt) + '"><small>Stored and displayed in UTC/Zulu after submission.</small></div>' +
        '</div>' +
      '</div>' +
      '<div class="button-row"><button class="btn" id="back">BACK</button><button class="btn primary" id="next">CONTINUE</button></div>';

    const category = document.getElementById('f-category');
    const customField = document.getElementById('custom-category-field');
    const customInput = document.getElementById('f-category-custom');

    category.addEventListener('change', function () {
      const isCustom = category.value === CUSTOM;
      customField.hidden = !isCustom;
      if (isCustom) customInput.focus();
    });

    document.getElementById('back').onclick = function () {
      state.reportStep = 1;
      renderFile();
    };

    document.getElementById('next').onclick = function () {
      const choice = category.value;
      if (!choice) return toast('Choose an incident type before continuing.');

      let finalCategory = choice;
      if (choice === CUSTOM) {
        finalCategory = String(customInput.value || '').trim();
        if (finalCategory.length < 3) return toast('Enter a custom incident type.');
        if (finalCategory.length > 80) return toast('Custom incident type must be 80 characters or fewer.');
      }

      d.incident.category = finalCategory;
      d.incident._categoryChosen = true;
      d.incident.controllerPosition = document.getElementById('f-position').value;
      d.incident.airport = document.getElementById('f-airport').value.trim();
      d.incident.airspace = document.getElementById('f-airspace').value.trim();
      d.atcReport.atcUsername = document.getElementById('f-atc').value.trim();
      d.incident.occurredAt = new Date(document.getElementById('f-time').value || Date.now()).toISOString();
      state.reportStep = 3;
      renderFile();
    };
  }

  window.renderFileStage = function () {
    if (state.reportStep === 2) return renderIncidentClassification();
    return originalRenderFileStage();
  };
})();
