import type { VercelRequest, VercelResponse } from '@vercel/node'

const BROWSERLESS_URL = 'https://production-sfo.browserless.io/chromium/bql'
const LOANNEX_LOGIN_URL = 'https://web.loannex.com/'

export const config = { maxDuration: 60 }

// ================= Step 2: Login to wrapper =================
function buildLoginScript(email: string, password: string): string {
  return `(async function() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  await sleep(1500);
  var userInput = document.getElementById('UserName');
  var passwordInput = document.getElementById('Password');
  var loginBtn = document.getElementById('btnSubmit');
  if (!userInput || !passwordInput) return JSON.stringify({ ok: false, error: 'no_form' });
  function setInput(el, val) {
    el.focus();
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, val);
    el.dispatchEvent(new Event('input', {bubbles: true}));
    el.dispatchEvent(new Event('change', {bubbles: true}));
  }
  setInput(userInput, '${email}');
  await sleep(200);
  setInput(passwordInput, '${password}');
  await sleep(200);
  if (loginBtn) setTimeout(function() { loginBtn.click(); }, 150);
  return JSON.stringify({ ok: true });
})()`
}

// ================= Step 4: Extract iframe URL and navigate =================
function buildNavToIframeScript(): string {
  return `(async function() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  await sleep(2000);
  var iframes = document.getElementsByTagName('iframe');
  var iframe = null;
  for (var i = 0; i < iframes.length; i++) {
    if (iframes[i].src && iframes[i].src.indexOf('loannex') >= 0) { iframe = iframes[i]; break; }
    if (iframes[i].src && iframes[i].src.indexOf('nex-app') >= 0) { iframe = iframes[i]; break; }
  }
  if (!iframe && iframes.length > 0) iframe = iframes[0];
  if (iframe && iframe.src && iframe.src.length > 10) {
    window.location.href = iframe.src;
    await sleep(500);
    return JSON.stringify({ ok: true, url: iframe.src });
  }
  return JSON.stringify({ ok: false, error: 'no_iframe' });
})()`
}

// ================= Step 5: Angular login + discover Quick Pricer nav =================
function buildAngularDiscoverScript(email: string, password: string): string {
  return `(async function() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  var diag = { steps: [] };

  // Poll for Angular login form or pricing form
  var usernameField = null;
  var passwordField = null;
  var pricingReady = false;
  for (var w = 0; w < 10; w++) {
    await sleep(1500);
    usernameField = document.getElementById('username');
    passwordField = document.getElementById('password');
    var allInputs = document.querySelectorAll('input:not([type=hidden]), select');
    if (usernameField && passwordField) {
      diag.steps.push('login_form_at: ' + ((w+1)*1.5) + 's');
      break;
    }
    if (allInputs.length > 5) {
      diag.steps.push('form_ready_at: ' + ((w+1)*1.5) + 's, fields: ' + allInputs.length);
      pricingReady = true;
      break;
    }
  }

  // Angular login if needed
  if (usernameField && passwordField) {
    function setInput(el, val) {
      el.focus(); el.value = '';
      el.dispatchEvent(new Event('focus', {bubbles: true}));
      var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      if (setter) setter.call(el, val);
      el.dispatchEvent(new Event('input', {bubbles: true}));
      el.dispatchEvent(new Event('change', {bubbles: true}));
      el.dispatchEvent(new Event('blur', {bubbles: true}));
    }
    setInput(usernameField, '${email}');
    await sleep(300);
    setInput(passwordField, '${password}');
    await sleep(300);
    var signInBtn = document.querySelector('button.login-button') || document.querySelector('button');
    if (signInBtn) { signInBtn.click(); diag.steps.push('login_clicked'); }

    // Wait for app to load after login
    for (var i = 0; i < 10; i++) {
      await sleep(1500);
      var inputs = document.querySelectorAll('input:not([type=hidden]), select');
      if (inputs.length > 5) { diag.steps.push('app_loaded_at: ' + ((i+1)*1.5) + 's, fields: ' + inputs.length); break; }
    }
  }

  diag.steps.push('url: ' + window.location.href);
  diag.steps.push('title: ' + document.title);

  // Search for ALL clickable navigation items
  var navItems = [];
  var allEls = document.querySelectorAll('a, button, [role="menuitem"], [role="button"], li, span, div');
  for (var n = 0; n < allEls.length; n++) {
    var el = allEls[n];
    var text = '';
    // Get direct text content (not children)
    for (var c = 0; c < el.childNodes.length; c++) {
      if (el.childNodes[c].nodeType === 3) text += el.childNodes[c].textContent;
    }
    text = text.trim();
    if (!text) text = (el.textContent || '').trim();
    if (text.length > 0 && text.length < 40) {
      var tag = el.tagName;
      var cls = (el.className || '').substring(0, 60);
      // Only include potentially clickable/nav items
      if (tag === 'A' || tag === 'BUTTON' || cls.indexOf('nav') >= 0 || cls.indexOf('menu') >= 0 ||
          cls.indexOf('item') >= 0 || cls.indexOf('link') >= 0 || cls.indexOf('sidebar') >= 0 ||
          el.getAttribute('role') || el.onclick || el.getAttribute('routerlink')) {
        navItems.push({ tag: tag, text: text.substring(0, 40), cls: cls, id: el.id || '', href: el.getAttribute('href') || el.getAttribute('routerlink') || '' });
      }
    }
  }

  // Search specifically for "Quick Pricer" or "Pricing" or "Search" elements
  var pricerElements = [];
  var allElements = document.querySelectorAll('*');
  for (var p = 0; p < allElements.length; p++) {
    var txt = (allElements[p].textContent || '').trim().toLowerCase();
    if (txt.length < 50 && (txt.indexOf('quick') >= 0 || txt.indexOf('pricer') >= 0 || txt.indexOf('pricing') >= 0 || txt.indexOf('scenario') >= 0)) {
      pricerElements.push({
        tag: allElements[p].tagName,
        text: (allElements[p].textContent || '').trim().substring(0, 50),
        cls: (allElements[p].className || '').substring(0, 60),
        id: allElements[p].id || '',
        routerLink: allElements[p].getAttribute('routerlink') || '',
        clickable: !!(allElements[p].onclick || allElements[p].getAttribute('href') || allElements[p].getAttribute('routerlink'))
      });
    }
  }

  // Also check for Angular router-link attributes
  var routerLinks = document.querySelectorAll('[routerlink], [ng-reflect-router-link]');
  var routes = [];
  for (var r = 0; r < routerLinks.length; r++) {
    routes.push({
      tag: routerLinks[r].tagName,
      text: (routerLinks[r].textContent || '').trim().substring(0, 40),
      route: routerLinks[r].getAttribute('routerlink') || routerLinks[r].getAttribute('ng-reflect-router-link') || ''
    });
  }

  // Dump form fields on current page
  var formFields = [];
  var inputs = document.querySelectorAll('input:not([type=hidden]), select, textarea');
  for (var f = 0; f < inputs.length; f++) {
    var fEl = inputs[f];
    var label = '';
    var labelEl = fEl.closest('label') || document.querySelector('label[for="' + fEl.id + '"]');
    if (labelEl) label = (labelEl.textContent || '').trim();
    if (!label) label = fEl.getAttribute('aria-label') || fEl.getAttribute('placeholder') || '';
    formFields.push({
      tag: fEl.tagName, id: fEl.id || '', name: fEl.name || '', type: fEl.type || '',
      label: label.substring(0, 40), value: (fEl.value || '').substring(0, 30)
    });
  }

  // Body text preview
  var bodyPreview = (document.body.innerText || '').substring(0, 2000);

  return JSON.stringify({
    navItems: navItems.slice(0, 30),
    pricerElements: pricerElements.slice(0, 15),
    routerLinks: routes,
    formFields: formFields,
    bodyPreview: bodyPreview,
    diag: diag
  });
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
    const loginScript = buildLoginScript(loannexUser, loannexPassword)
    const waitScript = `(async function() { await new Promise(r => setTimeout(r, 5000)); return JSON.stringify({ ok: true }); })()`
    const navScript = buildNavToIframeScript()
    const discoverScript = buildAngularDiscoverScript(loannexUser, loannexPassword)

    // 5-step BQL:
    // 1. goto wrapper login page
    // 2. fill + click login (setTimeout avoids nav error)
    // 3. wait for redirect (expected error)
    // 4. extract iframe URL + navigate (expected error)
    // 5. on Angular app: login + discover Quick Pricer nav
    const bqlQuery = `mutation LoginAndDiscover {
  loginPage: goto(url: "${LOANNEX_LOGIN_URL}", waitUntil: networkIdle) { status time }
  login: evaluate(content: ${JSON.stringify(loginScript)}, timeout: 8000) { value }
  waitForRedirect: evaluate(content: ${JSON.stringify(waitScript)}, timeout: 8000) { value }
  navToAngular: evaluate(content: ${JSON.stringify(navScript)}, timeout: 10000) { value }
  discover: evaluate(content: ${JSON.stringify(discoverScript)}, timeout: 40000) { value }
}`

    const bqlResp = await fetch(`${BROWSERLESS_URL}?token=${browserlessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: bqlQuery }),
      signal: AbortSignal.timeout(55000),
    })

    if (!bqlResp.ok) {
      const errText = await bqlResp.text()
      return res.json({ success: false, error: `Browserless: ${bqlResp.status}`, debug: errText.substring(0, 300) })
    }

    const bqlResult = await bqlResp.json()

    if (bqlResult.errors && !bqlResult.data) {
      return res.json({ success: false, error: 'BQL error', debug: bqlResult.errors })
    }

    // Parse discover step result
    let discoverData: any = null
    try {
      const raw = bqlResult.data?.discover?.value
      discoverData = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null
    } catch { discoverData = null }

    const loginData = (() => {
      try {
        const raw = bqlResult.data?.login?.value
        return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null
      } catch { return null }
    })()

    return res.json({
      success: true,
      mode: 'discovery',
      login: loginData,
      data: discoverData,
      debug: { keys: Object.keys(bqlResult.data || {}), errors: bqlResult.errors || null }
    })
  } catch (error) {
    console.error('LN pricing error:', error)
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Pricing unavailable',
    })
  }
}
