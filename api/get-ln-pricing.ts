import type { VercelRequest, VercelResponse } from '@vercel/node'

const BROWSERLESS_URL = 'https://production-sfo.browserless.io/chromium/bql'
export const config = { maxDuration: 120 }

// ================= Field Mapping =================
function mapFormToLN(body: any): Record<string, string> {
  const purposeMap: Record<string, string> = {
    purchase: 'Purchase', refinance: 'R/T Refi', cashout: 'C/O Refi',
  }
  const occupancyMap: Record<string, string> = {
    primary: 'Primary', secondary: 'Secondary', investment: 'Investment',
  }
  const propertyMap: Record<string, string> = {
    sfr: 'SFR', condo: 'Condo', townhouse: 'Townhouse',
    '2unit': '2 Unit', '3unit': '3 Unit', '4unit': '4 Unit', '5-9unit': '5+ Unit',
  }
  const docMap: Record<string, string> = {
    fullDoc: 'Full Doc', dscr: 'DSCR', bankStatement: 'Bank Statement',
    bankStatement12: '12 Mo. Bank Statement', bankStatement24: '24 Mo. Bank Statement',
    bankStatementOther: 'Bank Statement', taxReturns1Yr: '1 Yr. Tax Returns',
    assetDepletion: 'Asset Depletion', assetUtilization: 'Asset Utilization',
    voe: 'VOE', noRatio: 'No Ratio',
  }
  const citizenMap: Record<string, string> = {
    usCitizen: 'US Citizen', permanentResident: 'Permanent Resident', foreignNational: 'Foreign National',
  }

  const loanAmount = String(body.loanAmount || '450000').replace(/,/g, '')
  const propertyValue = String(body.propertyValue || '600000').replace(/,/g, '')
  const creditScore = String(body.creditScore || '740')

  const isDSCR = body.documentationType === 'dscr'
  const isInvestment = body.occupancyType === 'investment'
  const loanTypeMap: Record<string, string> = {
    nonqm: 'First Lien', conventional: 'First Lien', fha: 'First Lien', va: 'First Lien',
  }

  // Prefer numeric dscrValue; fall back to extracting from dscrRatio range string
  const dscrNum = body.dscrValue || (body.dscrRatio ? parseFloat(String(body.dscrRatio).replace(/[><=]/g, '').split('-')[0]) : 1.0)
  const dscrVal = isDSCR ? String(dscrNum || '1.0') : ''
  // Always provide rental income default -- LN qualified price form may show Mo. Rental Income for any scenario
  const rentalVal = String(body.grossRent || body.grossRentalIncome || '5000')
  const prepayMap: Record<string, string> = {
    '60mo': '5 Year', '48mo': '4 Year', '36mo': '3 Year',
    '24mo': '2 Year', '12mo': '1 Year', 'none': 'No Penalty',
  }
  const ppVal = body.prepayPeriod && prepayMap[body.prepayPeriod]
    ? prepayMap[body.prepayPeriod]
    : isInvestment ? '5 Year' : 'No Penalty'
  const finProps = isInvestment ? '1' : '1'

  // Income qualification fields -- LN may show "Get Qualified Price" for any scenario
  // Always provide defaults so the qualified price form can be filled if it appears
  const monthlyIncome = String(body.monthlyIncome || '25000')
  const propertyExpenses = String(body.propertyExpenses || '500')
  const liabilities = String(body.liabilities || '2000')
  const householdSize = '1'

  return {
    'Loan Type': loanTypeMap[body.loanType] || 'First Lien',
    'Purpose': purposeMap[body.loanPurpose] || 'Purchase',
    // DSCR forces Investment occupancy -- DSCR programs are investment-only on LoanNex
    'Occupancy': isDSCR ? 'Investment' : (occupancyMap[body.occupancyType] || 'Investment'),
    'Property Type': propertyMap[body.propertyType] || 'SFR',
    'Income Doc': docMap[body.documentationType] || 'DSCR',
    'Citizenship': citizenMap[body.citizenship] || 'US Citizen',
    'State': body.propertyState || 'CA',
    'County': body.propertyCounty || body.county || 'Los Angeles',
    'Appraised Value': propertyValue,
    'Purchase Price': body.loanPurpose === 'purchase' ? propertyValue : '',
    'First Lien Amount': loanAmount,
    'FICO': creditScore,
    'DTI': String(body.dti || ''),
    'Escrows': body.impoundType === 'noescrow' || body.impoundType === '3' ? 'Waived' : 'Yes',
    // DSCR/Investment fields -- include label variants
    'DSCR': dscrVal, 'DSCR Ratio': dscrVal, 'DSCR %': dscrVal,
    'Mo. Rental Income': rentalVal, 'Monthly Rental Income': rentalVal, 'Gross Rental Income': rentalVal,
    'Prepay Penalty': ppVal, 'Prepayment Penalty': ppVal,
    'Months Reserves': '12', 'Reserves': '12',
    '# of Financed Properties': finProps, 'Number of Financed Properties': finProps, 'Financed Properties': finProps,
    // Non-DSCR income qualification fields
    'Income': monthlyIncome, 'Monthly Income': monthlyIncome,
    'Property Expenses': propertyExpenses,
    'Liabilities': liabilities, 'Monthly Liabilities': liabilities,
    'Household Size': householdSize,
  }
}

// ================= Fill form + Get Price + Scrape =================
function buildFillAndScrapeScript(fieldMap: Record<string, string>, email: string, password: string, isRetry: boolean = false): string {
  const mapJson = JSON.stringify(fieldMap)
  return `(async function() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  var diag = { steps: [], fills: [] };
  var fieldMap = ${mapJson};
  var isRetry = ${isRetry};

  // Simple rate detection -- no regex, no complex char parsing
  function hasRateNum(s) { return s.indexOf('.') > 0 && s.indexOf('%') > 0; }

  diag.steps.push('url: ' + window.location.href);
  diag.steps.push('mode: ' + (isRetry ? 'retry' : 'initial'));

  var formReady = false;

  if (!isRetry) {
  // Initial: handle Angular login + Lock Desk redirect
  for (var w = 0; w < 6; w++) {
    await sleep(1000);
    var usernameField = document.getElementById('username');
    var passwordField = document.getElementById('password');
    var allInputs = document.querySelectorAll('input:not([type=hidden])');

    if (usernameField && passwordField) {
      diag.steps.push('angular_login_at: ' + ((w+1)) + 's');
      // Do Angular login
      function setLoginInput(el, val) {
        el.focus(); el.value = '';
        el.dispatchEvent(new Event('focus', {bubbles: true}));
        var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        if (setter) setter.call(el, val);
        el.dispatchEvent(new Event('input', {bubbles: true}));
        el.dispatchEvent(new Event('change', {bubbles: true}));
        el.dispatchEvent(new Event('blur', {bubbles: true}));
      }
      setLoginInput(usernameField, '${email}');
      await sleep(300);
      setLoginInput(passwordField, '${password}');
      await sleep(300);
      var signInBtn = document.querySelector('button.login-button') || document.querySelector('button');
      if (signInBtn) { signInBtn.click(); diag.steps.push('login_clicked'); }

      // Wait for app to load after login
      await sleep(2000);
      diag.steps.push('post_login_url: ' + window.location.href);

      // Check if we landed on Quick Pricer or elsewhere
      var bodyText = (document.body.innerText || '');
      var hasQuickPricer = bodyText.indexOf('Get Price') >= 0;
      diag.steps.push('has_get_price: ' + hasQuickPricer);

      if (!hasQuickPricer) {
        // On Lock Desk -- full page navigation for proper Angular form init
        diag.steps.push('on_lock_desk_hard_nav_to_qp');
        setTimeout(function() { window.location.href = '/nex-app'; }, 200);
        return JSON.stringify({ success: true, needsNextStep: true, rates: [], diag: diag });
      }
      formReady = true;
      break;
    }

    if (allInputs.length > 10) {
      diag.steps.push('form_at: ' + ((w+1)) + 's, fields: ' + allInputs.length);
      formReady = true;
      break;
    }
  }
  } else {
    // Retry: wait for properly initialized QP form after hard navigation
    for (var rw = 0; rw < 8; rw++) {
      await sleep(1000);
      var retryInputs = document.querySelectorAll('input:not([type=hidden])');
      if (retryInputs.length > 10) {
        var retryText = (document.body.innerText || '');
        if (retryText.indexOf('Get Price') >= 0) {
          diag.steps.push('retry_form_at: ' + ((rw+1)) + 's, fields: ' + retryInputs.length);
          formReady = true;
          break;
        }
      }
    }
  }

  if (!formReady) {
    diag.steps.push('form_not_loaded');
    diag.bodyPreview = (document.body.innerText || '').substring(0, 1000);
    diag.inputCount = document.querySelectorAll('input').length;
    return JSON.stringify({ success: false, error: 'form_not_loaded', rates: [], diag: diag });
  }

  // Find field input by label text -- walk DOM to find associated PrimeNG component
  function findFieldInput(labelText) {
    // Strategy: find text node matching label, then walk up to find container with input/dropdown
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    var node;
    while (node = walker.nextNode()) {
      if (node.textContent.trim() !== labelText) continue;
      var labelEl = node.parentElement;
      if (!labelEl) continue;

      // Walk up DOM levels looking for a container that has an input or dropdown
      var levels = [labelEl, labelEl.parentElement, labelEl.parentElement && labelEl.parentElement.parentElement];
      for (var lvl = 0; lvl < levels.length; lvl++) {
        var container = levels[lvl];
        if (!container) continue;

        // Look for PrimeNG dropdown/select
        var pDropdown = container.querySelector('p-dropdown, .p-dropdown, p-select, .p-select');
        if (pDropdown) return { el: pDropdown, type: 'dropdown', container: container };

        // Look for PrimeNG input number
        var pInputNum = container.querySelector('p-inputnumber, .p-inputnumber');
        if (pInputNum) {
          var innerInput = pInputNum.querySelector('input');
          return { el: innerInput || pInputNum, type: 'number', container: container };
        }

        // Look for regular input
        var input = container.querySelector('input:not([type=hidden]):not([type=checkbox])');
        if (input) return { el: input, type: 'input', container: container };
      }

      // Last resort: check next siblings of the label element
      var sib = labelEl.nextElementSibling;
      for (var s = 0; s < 3 && sib; s++) {
        var pDrop = sib.querySelector ? sib.querySelector('p-dropdown, .p-dropdown, p-select, .p-select') : null;
        if (pDrop) return { el: pDrop, type: 'dropdown', container: sib };
        var pNum = sib.querySelector ? sib.querySelector('p-inputnumber, .p-inputnumber, input:not([type=hidden])') : null;
        if (pNum) {
          var iInput = pNum.querySelector ? pNum.querySelector('input') || pNum : pNum;
          return { el: iInput, type: pNum.tagName === 'INPUT' ? 'input' : 'number', container: sib };
        }
        sib = sib.nextElementSibling;
      }
      break; // Only process first match
    }
    return null;
  }

  // Set PrimeNG Autocomplete value by typing + keyboard selection
  async function setDropdown(labelText, optionText) {
    var field = findFieldInput(labelText);
    if (!field) { diag.fills.push(labelText + ': NOT_FOUND'); return false; }

    var input = field.el;
    if (input.tagName !== 'INPUT') {
      input = field.el.querySelector ? field.el.querySelector('input') || field.el : field.el;
    }

    // Focus and clear
    input.focus();
    input.dispatchEvent(new Event('focus', {bubbles: true}));
    await sleep(100);

    // Select all text and delete it
    input.select();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));
    await sleep(50);

    // Clear via setter + input event
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    if (setter) setter.call(input, '');
    input.dispatchEvent(new Event('input', {bubbles: true}));
    await sleep(200);

    // Type the search text to trigger autocomplete suggestions
    var searchText = optionText.length > 3 ? optionText.substring(0, 3) : optionText;
    if (setter) setter.call(input, searchText);
    input.dispatchEvent(new Event('input', {bubbles: true}));
    await sleep(600);

    // Find THIS input's specific autocomplete panel using aria-controls
    function findMyPanel() {
      // Method 1: use aria-controls/aria-owns link
      var panelId = input.getAttribute('aria-controls') || input.getAttribute('aria-owns');
      if (panelId) {
        var linked = document.getElementById(panelId);
        if (linked && linked.offsetHeight > 0) return linked;
      }
      // Method 2: find P-POPOVER inside same nex-app-field, check if it has visible content
      var nexField = input.closest('.nex-app-field');
      if (nexField) {
        var popover = nexField.querySelector('p-popover');
        if (popover) {
          // PrimeNG popover renders content at body level, linked by ng-tns class
          var ngClass = '';
          var classes = (popover.className || '').split(' ');
          for (var ci2 = 0; ci2 < classes.length; ci2++) {
            if (classes[ci2].indexOf('ng-tns-') === 0) { ngClass = classes[ci2]; break; }
          }
          if (ngClass) {
            // Find visible overlay with same ng-tns class at body level
            var overlays = document.querySelectorAll('.' + ngClass + '[role=listbox], .' + ngClass + ' [role=listbox], .' + ngClass + ' ul');
            for (var ovi = 0; ovi < overlays.length; ovi++) {
              if (overlays[ovi].offsetHeight > 0) return overlays[ovi];
            }
          }
        }
      }
      // Method 3: find the most recently visible panel (last resort)
      var allPanels = document.querySelectorAll('[role=listbox]');
      for (var api = allPanels.length - 1; api >= 0; api--) {
        if (allPanels[api].offsetHeight > 0 && allPanels[api].offsetWidth > 0) return allPanels[api];
      }
      return null;
    }

    var panel = findMyPanel();

    if (!panel) {
      // Type full text and try again
      if (setter) setter.call(input, optionText);
      input.dispatchEvent(new Event('input', {bubbles: true}));
      await sleep(600);
      panel = findMyPanel();
    }

    if (!panel) {
      // Try ArrowDown to open
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      await sleep(400);
      panel = findMyPanel();
    }

    if (panel) {
      // Find matching item and navigate to it with keyboard
      var items = panel.querySelectorAll('li, [class*=autocomplete-item], [class*=option], [role=option]');
      var targetIdx = -1;
      for (var oi = 0; oi < items.length; oi++) {
        var itemText = (items[oi].textContent || '').trim();
        if (itemText === optionText || itemText.indexOf(optionText) >= 0) {
          targetIdx = oi;
          break;
        }
      }

      if (targetIdx === -1) {
        // Case-insensitive search
        var lower = optionText.toLowerCase();
        for (var oi2 = 0; oi2 < items.length; oi2++) {
          if ((items[oi2].textContent || '').trim().toLowerCase().indexOf(lower) >= 0) {
            targetIdx = oi2;
            break;
          }
        }
      }

      if (targetIdx >= 0) {
        var targetItem = items[targetIdx];

        // Method 1: Click the suggestion item directly
        targetItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        await sleep(50);
        targetItem.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        targetItem.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        await sleep(300);

        var afterVal = (input.value || '').trim();
        if (afterVal.length > searchText.length || afterVal.toLowerCase().indexOf(optionText.substring(0, 3).toLowerCase()) >= 0) {
          input.dispatchEvent(new Event('blur', {bubbles: true}));
          await sleep(100);
          diag.fills.push(labelText + ': ' + optionText + ' (click, val=' + afterVal + ')');
          return true;
        }

        // Method 2: Try keyboard ArrowDown + Enter as fallback
        input.focus();
        if (setter) setter.call(input, searchText);
        input.dispatchEvent(new Event('input', {bubbles: true}));
        await sleep(600);
        panel = findMyPanel();
        if (panel) {
          for (var ad = 0; ad <= targetIdx; ad++) {
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
            await sleep(50);
          }
          await sleep(100);
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
          await sleep(200);
        }

        var afterVal2 = (input.value || '').trim();
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        input.dispatchEvent(new Event('blur', {bubbles: true}));
        await sleep(100);
        diag.fills.push(labelText + ': ' + optionText + ' (kbd, val=' + afterVal2 + ')');
        return true;
      } else {
        var optTexts = [];
        for (var x = 0; x < items.length && x < 10; x++) optTexts.push((items[x].textContent || '').trim());
        diag.fills.push(labelText + ': NO_MATCH(' + optionText + ') avail=[' + optTexts.join(',') + ']');
      }
    } else {
      diag.fills.push(labelText + ': NO_PANEL');
    }

    // Close any open panels before moving to next field
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(100);
    // Last resort: set value directly and blur
    if (setter) setter.call(input, optionText);
    input.dispatchEvent(new Event('input', {bubbles: true}));
    input.dispatchEvent(new Event('change', {bubbles: true}));
    input.dispatchEvent(new Event('blur', {bubbles: true}));
    await sleep(100);
    return false;
  }

  // Set numeric input value
  async function setNumeric(labelText, val) {
    if (!val || val === '0') return;
    var field = findFieldInput(labelText);
    if (!field) { diag.fills.push(labelText + ': NOT_FOUND'); return false; }
    var input = field.el;
    if (input.tagName !== 'INPUT') {
      input = field.el.querySelector ? field.el.querySelector('input') || field.el : field.el;
    }
    if (!input || input.tagName !== 'INPUT') { diag.fills.push(labelText + ': NO_INPUT_EL'); return false; }
    input.focus();
    input.value = '';
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    if (setter) setter.call(input, val);
    input.dispatchEvent(new Event('input', {bubbles: true}));
    input.dispatchEvent(new Event('change', {bubbles: true}));
    input.dispatchEvent(new Event('blur', {bubbles: true}));
    diag.fills.push(labelText + ': ' + val);
    await sleep(150);
    return true;
  }

  // Fill dropdown fields (order matters -- Income Doc triggers dynamic fields)
  var dropdowns = ['Loan Type', 'Purpose', 'Occupancy', 'Property Type', 'Income Doc'];
  for (var di = 0; di < dropdowns.length; di++) {
    var key = dropdowns[di];
    if (fieldMap[key]) {
      await setDropdown(key, fieldMap[key]);
      await sleep(200);
    }
  }

  // Wait for Angular to re-render dynamic fields based on Income Doc selection
  await sleep(1500);

  // Fill remaining dropdowns (includes DSCR-specific fields that appeared after Income Doc selection)
  var dropdowns2 = ['Citizenship', 'State', 'County', 'Escrows', 'Prepay Penalty'];
  for (var di2 = 0; di2 < dropdowns2.length; di2++) {
    var key2 = dropdowns2[di2];
    if (fieldMap[key2]) {
      await setDropdown(key2, fieldMap[key2]);
      await sleep(200);
    }
  }

  // Fill ONLY main form numeric fields -- DO NOT fill qualified-price-only fields here
  // (Mo. Rental Income, Property Expenses, Liabilities, Reserves, # of Financed Properties
  //  are filled later in the scoped qualified price section after clicking "Get Price")
  var numerics = ['Appraised Value', 'Purchase Price', 'First Lien Amount', 'FICO', 'DTI',
    'Months Reserves'];

  // DSCR ratio field -- appears only when Income Doc = DSCR, needs special handling
  if (fieldMap['DSCR'] && fieldMap['DSCR'] !== '') {
    // Try exact label match first
    var dscrFilled = false;
    var dscrLabels = ['DSCR', 'DSCR Ratio', 'DSCR %'];
    for (var dli = 0; dli < dscrLabels.length && !dscrFilled; dli++) {
      var dscrField = findFieldInput(dscrLabels[dli]);
      if (dscrField) {
        var dscrInput = dscrField.el;
        if (dscrInput.tagName !== 'INPUT') {
          dscrInput = dscrField.el.querySelector ? dscrField.el.querySelector('input') || dscrField.el : dscrField.el;
        }
        if (dscrInput && dscrInput.tagName === 'INPUT') {
          dscrInput.focus();
          var dscrSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          if (dscrSetter) dscrSetter.call(dscrInput, fieldMap['DSCR']);
          dscrInput.dispatchEvent(new Event('input', {bubbles: true}));
          dscrInput.dispatchEvent(new Event('change', {bubbles: true}));
          dscrInput.dispatchEvent(new Event('blur', {bubbles: true}));
          diag.fills.push('DSCR: ' + fieldMap['DSCR'] + ' (via ' + dscrLabels[dli] + ')');
          dscrFilled = true;
        }
      }
    }
    if (!dscrFilled) diag.fills.push('DSCR: NOT_FOUND (tried all labels)');
  }
  for (var ni = 0; ni < numerics.length; ni++) {
    var nkey = numerics[ni];
    if (fieldMap[nkey]) {
      await setNumeric(nkey, fieldMap[nkey]);
    }
  }

  diag.steps.push('form_filled');

  // Click "Get Price" button
  var getPriceBtn = document.querySelector('button.quick-price-button') ||
    document.querySelector('[class*=quick-price]') ||
    null;
  if (!getPriceBtn) {
    var allBtns = document.querySelectorAll('button');
    for (var bi = 0; bi < allBtns.length; bi++) {
      if ((allBtns[bi].textContent || '').trim() === 'Get Price') { getPriceBtn = allBtns[bi]; break; }
    }
  }
  if (getPriceBtn) {
    getPriceBtn.click();
    diag.steps.push('clicked_get_price');
  } else {
    diag.steps.push('no_get_price_button');
    return JSON.stringify({ success: false, error: 'no_get_price_button', diag: diag });
  }

  // ========== MAIN RESULTS LOOP ==========
  // LoanNex flow: Get Price -> [Qualified Price form] -> [Product list -> click product] -> Rate table
  var resultsFound = false;
  var qualifiedPriceHandled = false;
  var productClicked = false;

  for (var attempt = 0; attempt < 10; attempt++) {
    await sleep(1500);
    var bodyText = (document.body.innerText || '');

    // ---- STEP A: Check for final rate table (many rows = success) ----
    var tables = document.querySelectorAll('table, p-table, .p-datatable');
    for (var ti = 0; ti < tables.length; ti++) {
      var rows = tables[ti].querySelectorAll('tr');
      if (rows.length > 3) {
        diag.steps.push('results_at: ' + ((attempt+1)*1.5) + 's, rows: ' + rows.length);
        resultsFound = true;
        break;
      }
    }
    if (resultsFound) break;

    // ---- STEP B: Handle "Get Qualified Price" form (appears after Get Price) ----
    if (!qualifiedPriceHandled && bodyText.indexOf('Get Qualified Price') >= 0) {
      diag.steps.push('qualified_price_form_at: ' + ((attempt+1)*1.5) + 's');
      await sleep(500);

      // Find the button
      var qualBtn = null;
      var allBtns2 = document.querySelectorAll('button');
      for (var qbi = 0; qbi < allBtns2.length; qbi++) {
        var btnText = (allBtns2[qbi].textContent || '').trim();
        if (btnText.indexOf('Get Qualified Price') >= 0) { qualBtn = allBtns2[qbi]; break; }
      }

      // Scope fill to qualified price section only
      var qualSection = null;
      if (qualBtn) {
        var qp = qualBtn.parentElement;
        for (var qwalk = 0; qwalk < 6 && qp; qwalk++) {
          var qInputs = qp.querySelectorAll('input:not([type=hidden]):not([type=checkbox])');
          if (qInputs.length >= 3 && qInputs.length <= 15) { qualSection = qp; break; }
          qp = qp.parentElement;
        }
      }

      var filledQual = 0;
      if (qualSection) {
        var qualFieldValues = [
          { keywords: ['rental', 'rent'], value: fieldMap['Mo. Rental Income'] || '5000' },
          { keywords: ['property exp'], value: fieldMap['Property Expenses'] || '500' },
          { keywords: ['liabilit'], value: fieldMap['Liabilities'] || '2000' },
          { keywords: ['reserve'], value: fieldMap['Reserves'] || '12' },
          { keywords: ['financed', '# of fin'], value: fieldMap['# of Financed Properties'] || '1' },
        ];
        var qLabels = qualSection.querySelectorAll('label, span, div');
        var filledQualInputs = [];
        for (var qfi = 0; qfi < qualFieldValues.length; qfi++) {
          var qfv = qualFieldValues[qfi];
          var matched = false;
          for (var ql = 0; ql < qLabels.length && !matched; ql++) {
            var lt = (qLabels[ql].textContent || '').trim().toLowerCase();
            if (!lt || lt.length > 40) continue;
            for (var kwi = 0; kwi < qfv.keywords.length; kwi++) {
              if (lt.indexOf(qfv.keywords[kwi]) < 0) continue;
              var qContainer = qLabels[ql].parentElement;
              for (var qlvl = 0; qlvl < 4 && qContainer; qlvl++) {
                var qInput = qContainer.querySelector('input:not([type=hidden]):not([type=checkbox])');
                if (qInput && qInput.offsetHeight > 0 && filledQualInputs.indexOf(qInput) < 0) {
                  var qSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                  qInput.focus();
                  if (qSetter) qSetter.call(qInput, qfv.value);
                  qInput.dispatchEvent(new Event('input', {bubbles: true}));
                  qInput.dispatchEvent(new Event('change', {bubbles: true}));
                  qInput.dispatchEvent(new Event('blur', {bubbles: true}));
                  diag.fills.push('QUAL_' + qfv.keywords[0] + ': ' + qfv.value);
                  filledQual++;
                  filledQualInputs.push(qInput);
                  matched = true;
                  break;
                }
                qContainer = qContainer.parentElement;
              }
              break;
            }
          }
        }
        diag.steps.push('qual_fields_filled: ' + filledQual);
      }
      await sleep(300);

      // Click "Get Qualified Price"
      if (qualBtn) {
        qualBtn.click();
        diag.steps.push('clicked_get_qualified_price');
        await sleep(3000); // longer wait for products to load
      }
      qualifiedPriceHandled = true;
      continue;
    }

    // ---- STEP C: Handle product selection (click first eligible product) ----
    if (!productClicked && qualifiedPriceHandled) {
      // Strategy 1: Look for clickable product rows in a table
      var productRows = [];
      for (var pti = 0; pti < tables.length; pti++) {
        var pRows = tables[pti].querySelectorAll('tr');
        for (var pri = 1; pri < pRows.length; pri++) {
          var pText = (pRows[pri].textContent || '').trim();
          if (pText.length > 5 && pText.indexOf('Choose a product') < 0) {
            productRows.push(pRows[pri]);
          }
        }
      }
      if (productRows.length > 0) {
        diag.steps.push('product_rows_found: ' + productRows.length + ', clicking_first: ' + (productRows[0].textContent || '').trim().substring(0, 80));
        productRows[0].click();
        // Also try clicking the first cell/link inside
        var firstCell = productRows[0].querySelector('td, a, span');
        if (firstCell) firstCell.click();
        productClicked = true;
        await sleep(3000);
        continue;
      }

      // Strategy 2: Look for clickable elements with product-like text (not in table)
      var clickables = document.querySelectorAll('a, button, [role=button], [class*=product], [class*=clickable], div[style*=cursor], span[style*=cursor]');
      for (var cli = 0; cli < clickables.length; cli++) {
        var clText = (clickables[cli].textContent || '').trim();
        // Product names often contain "30 YR", "DSCR", "Fixed", "ARM", investor names
        if (clText.length > 10 && clText.length < 200 &&
            (clText.indexOf('YR') >= 0 || clText.indexOf('Year') >= 0 || clText.indexOf('DSCR') >= 0 ||
             clText.indexOf('Fixed') >= 0 || clText.indexOf('ARM') >= 0 || clText.indexOf('NonQM') >= 0 ||
             clText.indexOf('Non QM') >= 0 || clText.indexOf('Non-QM') >= 0)) {
          diag.steps.push('product_link_found: ' + clText.substring(0, 80));
          clickables[cli].click();
          productClicked = true;
          await sleep(3000);
          break;
        }
      }
      if (productClicked) continue;

      // Strategy 3: Look for any row/item that appeared after qualified price
      var allRows = document.querySelectorAll('tr, [role=row], [role=listitem], [class*=item]');
      for (var ari = 0; ari < allRows.length; ari++) {
        var arText = (allRows[ari].textContent || '').trim();
        if (arText.length > 20 && arText.length < 300 &&
            (hasRateNum(arText) || arText.indexOf('Eligible') >= 0)) {
          diag.steps.push('row_item_click: ' + arText.substring(0, 80));
          allRows[ari].click();
          var firstChild = allRows[ari].querySelector('td, a, span, div');
          if (firstChild) firstChild.click();
          productClicked = true;
          await sleep(3000);
          break;
        }
      }
      if (productClicked) continue;
    }

    // ---- STEP D: Check for error/empty states ----
    if (bodyText.indexOf('No results') >= 0 || bodyText.indexOf('no eligible') >= 0 ||
        bodyText.indexOf('No prices') >= 0 || bodyText.indexOf('No programs') >= 0 ||
        bodyText.indexOf('not eligible') >= 0 || bodyText.indexOf('Not Eligible') >= 0) {
      diag.steps.push('no_results_text_at: ' + ((attempt+1)*1.5) + 's');
      break;
    }

    // ---- STEP E: Still loading ----
    var spinners = document.querySelectorAll('.p-progress-spinner, [class*=spinner], [class*=loading]');
    if (spinners.length > 0 && attempt < 9) {
      diag.steps.push('loading_at: ' + ((attempt+1)*1.5) + 's');
      continue;
    }

    // Late attempts: log what's on page
    if (attempt >= 8) {
      diag.steps.push('waiting_at: ' + ((attempt+1)*1.5) + 's');
    }
  }

  // ========== SCRAPE RESULTS ==========
  var rates = [];

  // Method 1: Standard HTML table scrape
  var allTables = document.querySelectorAll('table, p-table, .p-datatable');
  for (var ti2 = 0; ti2 < allTables.length; ti2++) {
    var trs = allTables[ti2].querySelectorAll('tr');
    if (trs.length < 2) continue;
    var ths = trs[0].querySelectorAll('th, td');
    var headers = [];
    for (var h = 0; h < ths.length; h++) headers.push((ths[h].textContent || '').trim());
    diag.headers = headers;
    for (var ri = 1; ri < trs.length && ri < 100; ri++) {
      var tds = trs[ri].querySelectorAll('td');
      if (tds.length < 2) continue;
      var row = {};
      for (var ci = 0; ci < tds.length && ci < headers.length; ci++) {
        row[headers[ci] || 'col' + ci] = (tds[ci].textContent || '').trim();
      }
      rates.push(row);
    }
    if (rates.length > 0) break;
  }

  // Method 2: PrimeNG grid rows (div-based)
  if (rates.length === 0) {
    var gridRows = document.querySelectorAll('[role=row], [class*=p-datatable-row], [class*=datatable] tr');
    if (gridRows.length > 1) {
      diag.steps.push('grid_rows: ' + gridRows.length);
      for (var gri = 0; gri < gridRows.length && gri < 100; gri++) {
        var cells = gridRows[gri].querySelectorAll('td, [role=cell], [role=gridcell]');
        if (cells.length < 2) continue;
        var cellTexts = [];
        for (var gci = 0; gci < cells.length; gci++) cellTexts.push((cells[gci].textContent || '').trim());
        rates.push({ cells: cellTexts });
      }
    }
  }

  // Method 3: Text scrape for rate patterns
  if (rates.length === 0) {
    var fullText = (document.body.innerText || '');
    // Capture rich diagnostic context
    var gqpIdx = fullText.indexOf('Get Qualified Price');
    if (gqpIdx >= 0) diag.afterQualifiedPrice = fullText.substring(gqpIdx, Math.min(gqpIdx + 3000, fullText.length));
    var epIdx = fullText.indexOf('Eligible');
    if (epIdx >= 0) diag.eligibleContext = fullText.substring(epIdx, Math.min(epIdx + 1500, fullText.length));

    // Capture full page text for the response handler to parse with real regex
    diag.pageText = fullText.substring(0, 5000);
    diag.pageTextTail = fullText.substring(Math.max(0, fullText.length - 5000));

    // Capture DOM structure for debugging
    var containers = document.querySelectorAll('[class*=product], [class*=rate], [class*=pricing], [class*=result], [class*=eligible]');
    var cInfo = [];
    for (var dci = 0; dci < containers.length && dci < 15; dci++) {
      cInfo.push({ tag: containers[dci].tagName, cls: (containers[dci].className || '').substring(0, 80), text: (containers[dci].textContent || '').trim().substring(0, 200) });
    }
    if (cInfo.length > 0) diag.dataContainers = cInfo;

    // Capture full page text (last 3000 chars likely have results)
    diag.pageTextTail = fullText.substring(Math.max(0, fullText.length - 3000));
  }

  diag.steps.push('scraped: ' + rates.length + ' rows');
  return JSON.stringify({ success: true, rates: rates, diag: diag });
})()`
}

// ================= Main Handler =================
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' })

  const browserlessToken = process.env.BROWSERLESS_TOKEN
  if (!browserlessToken) return res.json({ success: false, error: 'Browserless not configured' })

  const loannexUser = process.env.LOANNEX_USER || ''
  const loannexPassword = process.env.LOANNEX_PASSWORD || ''
  if (!loannexUser || !loannexPassword) return res.json({ success: false, error: 'Credentials not configured' })

  try {
    const body = req.body || {}
    const fieldMap = mapFormToLN(body)
    const fillScript = buildFillAndScrapeScript(fieldMap, loannexUser, loannexPassword, false)
    const retryScript = buildFillAndScrapeScript(fieldMap, loannexUser, loannexPassword, true)

    // Wrapper login script (fills web.loannex.com form)
    const loginScript = `(async function() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  await sleep(1000);
  var u = document.getElementById('UserName');
  var p = document.getElementById('Password');
  var b = document.getElementById('btnSubmit');
  if (!u || !p) return JSON.stringify({ ok: false, error: 'no_form' });
  function si(el, val) {
    el.focus();
    var s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    s.call(el, val);
    el.dispatchEvent(new Event('input', {bubbles: true}));
    el.dispatchEvent(new Event('change', {bubbles: true}));
  }
  si(u, '${loannexUser}');
  await sleep(150);
  si(p, '${loannexPassword}');
  await sleep(150);
  if (b) setTimeout(function() { b.click(); }, 100);
  return JSON.stringify({ ok: true });
})()`

    // Navigate to iframe URL (extracts tokenKey URL from wrapper page)
    const navScript = `(async function() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  await sleep(1500);
  var iframes = document.getElementsByTagName('iframe');
  for (var i = 0; i < iframes.length; i++) {
    if (iframes[i].src && iframes[i].src.indexOf('nex-app') >= 0) {
      window.location.href = iframes[i].src;
      return JSON.stringify({ ok: true, src: iframes[i].src });
    }
  }
  if (iframes.length > 0 && iframes[0].src) {
    window.location.href = iframes[0].src;
    return JSON.stringify({ ok: true, src: iframes[0].src });
  }
  return JSON.stringify({ ok: false, error: 'no_iframe', iframes: iframes.length });
})()`

    // 7-step BQL: wrapper login -> wait -> nav to iframe -> fill/scrape -> wait -> retry
    // Steps 3-4 error from navigation (expected). Step 5 returns needsNextStep if on Lock Desk.
    // Steps 6-7 handle retry after hard nav to /nex-app for proper Angular form init.
    const bqlQuery = `mutation FillAndPrice {
  loginPage: goto(url: "https://web.loannex.com/", waitUntil: networkIdle) { status time }
  login: evaluate(content: ${JSON.stringify(loginScript)}, timeout: 5000) { value }
  waitForNav: evaluate(content: "new Promise(r => setTimeout(r, 2000)).then(() => JSON.stringify({ok:true}))", timeout: 3000) { value }
  navToIframe: evaluate(content: ${JSON.stringify(navScript)}, timeout: 5000) { value }
  price: evaluate(content: ${JSON.stringify(fillScript)}, timeout: 25000) { value }
  waitForQP: evaluate(content: "new Promise(r => setTimeout(r, 2000)).then(() => JSON.stringify({ok:true}))", timeout: 3000) { value }
  retryPrice: evaluate(content: ${JSON.stringify(retryScript)}, timeout: 25000) { value }
}`

    const bqlResp = await fetch(`${BROWSERLESS_URL}?token=${browserlessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: bqlQuery }),
      signal: AbortSignal.timeout(110000),
    })

    if (!bqlResp.ok) {
      const errText = await bqlResp.text()
      return res.json({ success: false, error: `Browserless: ${bqlResp.status}`, debug: errText.substring(0, 300) })
    }

    const bqlResult = await bqlResp.json()

    if (bqlResult.errors && !bqlResult.data) {
      return res.json({ success: false, error: 'BQL error', bqlErrors: (bqlResult.errors || []).map((e: any) => e.message).slice(0, 5) })
    }

    // Parse results
    const safeParseValue = (val: any) => {
      if (!val) return null
      try { return typeof val === 'string' ? JSON.parse(val) : val } catch { return null }
    }

    const priceData = safeParseValue(bqlResult.data?.price?.value)
    const retryData = safeParseValue(bqlResult.data?.retryPrice?.value)

    // Use retry data if initial step hit Lock Desk (needsNextStep), or if initial step errored
    const resultData = (priceData?.needsNextStep && retryData) ? retryData
      : (!priceData && retryData) ? retryData
      : priceData

    if (!resultData) {
      return res.json({
        success: false,
        error: 'No data from pricing step',
        debug: {
          bqlErrors: (bqlResult.errors || []).map((e: any) => ({ msg: e.message?.substring(0, 100), path: e.path })).slice(0, 5),
          hasData: !!bqlResult.data,
          dataKeys: bqlResult.data ? Object.keys(bqlResult.data) : [],
          priceNeedsRetry: priceData?.needsNextStep || false,
          retryAvailable: !!retryData,
        }
      })
    }

    // If no table rates but page text captured, try regex scraping here (safe outside template)
    let rates = resultData.rates || []
    if (rates.length === 0 && resultData.diag) {
      const pageText = resultData.diag.pageText || resultData.diag.pageTextTail || ''
      if (pageText) {
        const rateLines = pageText.match(/[5-9]\.\d{3}\s*%[^\n]{0,300}/g)
        if (rateLines) {
          for (const line of rateLines) {
            const rateM = line.match(/([5-9]\.\d{3})\s*%/)
            const priceM = line.match(/(1\d{2}\.\d{3})/)
            const lockM = line.match(/(\d+)\s*Days/i)
            const pmtM = line.match(/\$([\d,]+\.\d{2})/)
            if (rateM) {
              rates.push({
                'Rate': (rateM[1] || '') + '% ' + (lockM ? lockM[1] + ' Days' : ''),
                'Price': priceM ? priceM[1] : '',
                'Payment': pmtM ? '$' + pmtM[1] : '',
              })
            }
          }
        }
      }
    }

    // Transform scraped table rows into rate options
    // Header names vary (e.g. "Rate  Lock Period 1", "Price 2") -- use keyword matching
    const findCol = (row: any, keywords: string[]): string => {
      for (const k of Object.keys(row)) {
        const kl = k.toLowerCase()
        if (keywords.some(kw => kl.includes(kw))) return row[k] || ''
      }
      return ''
    }
    const rateOptions = rates.map((row: any) => {
      const rateField = findCol(row, ['rate'])
      const rateMatch = rateField.match(/([\d.]+)%/)
      const lockMatch = rateField.match(/(\d+)\s*Days/)

      const priceField = findCol(row, ['price'])
      const priceMatch = priceField.match(/([\d.]+)/)
      const costMatch = priceField.match(/\$([\d,.]+)/)

      const product = findCol(row, ['product'])
      const investorField = findCol(row, ['investor', 'lender'])
      const pmtField = findCol(row, ['pmt', 'payment'])
      const pmtMatch = pmtField.match(/\$([\d,.]+)/)

      // Clean double spaces from collapsed newlines in scraped text
      const cleanText = (s: string) => s.replace(/\s{2,}/g, ' ').trim()

      return {
        rate: rateMatch ? parseFloat(rateMatch[1]) : 0,
        price: priceMatch ? parseFloat(priceMatch[1]) : 0,
        cost: costMatch ? parseFloat(costMatch[1].replace(/,/g, '')) : 0,
        lockPeriod: lockMatch ? parseInt(lockMatch[1]) : 30,
        program: cleanText(product),
        investor: cleanText(investorField),
        payment: pmtMatch ? parseFloat(pmtMatch[1].replace(/,/g, '')) : 0,
      }
    }).filter((r: any) => r.rate > 0)

    // Filter to 99.000 - 103.000 price range
    const filteredRates = rateOptions.filter((r: any) => r.price >= 99.0 && r.price <= 103.0)

    return res.json({
      success: true,
      data: {
        rateOptions: filteredRates,
        totalRates: filteredRates.length,
        unfilteredTotal: rateOptions.length,
        rawRows: rates.length,
        priceRange: '99.000 - 103.000',
        diag: resultData.diag,
      },
    })
  } catch (error) {
    console.error('LN pricing error:', error)
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Pricing unavailable',
    })
  }
}
