(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var DEF = { size: '512', margin: '4', fg: '#111827', bg: '#ffffff', ecl: 'M', fname: '' };
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, HEX = /^#[0-9a-f]{6}$/i;
  var esc = function (s) { return s.replace(/([\\;,:"])/g, '\\$1'); };
  var vesc = function (s) { return s.replace(/([\\,;])/g, '\\$1').replace(/\r?\n/g, '\\n'); };
  var digits = function (s) { return s.replace(/[\s\-().]/g, ''); };

  // f: [key, label, input type, placeholder, required]; b() returns a payload string or an {key: message} error object
  var T = {
    url: { f: [['u', 'Website URL', 'url', 'https://example.com', 1]], b: function (v) {
      try { var u = new URL(v.u); if (!/^https?:$/.test(u.protocol)) throw 0; return v.u; }
      catch (e) { return { u: 'Enter a full web address starting with http:// or https://.' }; } } },
    text: { f: [['t', 'Text', 'textarea', 'Type or paste your text', 1]], b: function (v) { return v.t ? v.t : { t: 'Enter some text.' }; } },
    wifi: { f: [['ssid', 'Network name (SSID)', 'text', '', 1], ['pw', 'Password', 'text', ''], ['sec', 'Security', 'select', ['WPA', 'WEP', 'nopass']]], b: function (v) {
      if (!v.ssid) return { ssid: 'Enter the Wi-Fi network name.' };
      if (v.sec !== 'nopass' && !v.pw) return { pw: 'Enter the password or choose "nopass".' };
      return 'WIFI:T:' + v.sec + ';S:' + esc(v.ssid) + ';' + (v.sec === 'nopass' ? '' : 'P:' + esc(v.pw) + ';') + ';'; } },
    email: { f: [['to', 'Email address', 'email', 'name@example.com', 1], ['sub', 'Subject', 'text', ''], ['body', 'Message', 'textarea', '']], b: function (v) {
      if (!EMAIL.test(v.to)) return { to: 'Enter a valid email address.' };
      var q = []; if (v.sub) q.push('subject=' + encodeURIComponent(v.sub)); if (v.body) q.push('body=' + encodeURIComponent(v.body));
      return 'mailto:' + v.to + (q.length ? '?' + q.join('&') : ''); } },
    phone: { f: [['p', 'Phone number', 'tel', '+923001234567', 1]], b: function (v) {
      var p = digits(v.p); return /^\+?\d{5,15}$/.test(p) ? 'tel:' + p : { p: 'Enter a valid phone number (5-15 digits, optional +).' }; } },
    sms: { f: [['p', 'Recipient phone number', 'tel', '+923001234567', 1], ['m', 'Message', 'textarea', '']], b: function (v) {
      var p = digits(v.p); if (!/^\+?\d{5,15}$/.test(p)) return { p: 'Enter a valid phone number (5-15 digits, optional +).' };
      return 'sms:' + p + (v.m ? '?body=' + encodeURIComponent(v.m) : ''); } },
    vcard: { f: [['fn', 'First name', 'text', '', 1], ['ln', 'Last name', 'text', ''], ['tel', 'Phone', 'tel', ''], ['em', 'Email', 'email', ''], ['org', 'Organization', 'text', ''], ['url', 'Website', 'url', 'https://']], b: function (v) {
      var e = {};
      if (!v.fn) e.fn = 'Enter a first name.';
      if (v.tel && !/^\+?\d{5,15}$/.test(digits(v.tel))) e.tel = 'Enter a valid phone number.';
      if (v.em && !EMAIL.test(v.em)) e.em = 'Enter a valid email address.';
      if (v.url) { try { new URL(v.url); } catch (x) { e.url = 'Enter a full web address, e.g. https://example.com.'; } }
      if (Object.keys(e).length) return e;
      var L = ['BEGIN:VCARD', 'VERSION:3.0', 'N:' + vesc(v.ln) + ';' + vesc(v.fn) + ';;;', 'FN:' + vesc((v.fn + ' ' + v.ln).trim())];
      if (v.org) L.push('ORG:' + vesc(v.org)); if (v.tel) L.push('TEL:' + digits(v.tel)); if (v.em) L.push('EMAIL:' + v.em); if (v.url) L.push('URL:' + v.url);
      L.push('END:VCARD'); return L.join('\n'); } },
    wa: { f: [['p', 'Phone with country code', 'tel', '923001234567', 1], ['m', 'Message', 'textarea', '']], b: function (v) {
      var p = digits(v.p).replace(/^\+/, '').replace(/^00/, '');
      if (!/^[1-9]\d{7,14}$/.test(p)) return { p: 'Enter an international number with country code, e.g. 923001234567.' };
      return 'https://wa.me/' + p + (v.m ? '?text=' + encodeURIComponent(v.m) : ''); } },
    geo: { f: [['lat', 'Latitude', 'text', '24.8607', 1], ['lng', 'Longitude', 'text', '67.0011', 1]], b: function (v) {
      var e = {}, a = Number(v.lat), o = Number(v.lng);
      if (v.lat === '' || isNaN(a) || a < -90 || a > 90) e.lat = 'Latitude must be a number from -90 to 90.';
      if (v.lng === '' || isNaN(o) || o < -180 || o > 180) e.lng = 'Longitude must be a number from -180 to 180.';
      return Object.keys(e).length ? e : 'geo:' + a + ',' + o; } }
  };

  var els = {}, cur = null, timer = null, statusTimer = null;

  function setStatus(msg, kind) {
    var s = $('#status'); s.textContent = msg; s.className = kind || '';
    clearTimeout(statusTimer); if (msg) statusTimer = setTimeout(function () { s.textContent = ''; s.className = ''; }, 6000);
  }
  function mark(el, errEl, msg) { errEl.textContent = msg || ''; if (msg) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid'); }

  function buildFields() {
    var box = $('#fields'); box.textContent = ''; els = {};
    T[$('#type').value].f.forEach(function (d) {
      var wrap = document.createElement('div'); wrap.className = 'field';
      var lab = document.createElement('label'); lab.htmlFor = 'f-' + d[0]; lab.textContent = d[1] + (d[4] ? ' *' : '');
      var inp;
      if (d[2] === 'textarea') inp = document.createElement('textarea');
      else if (d[2] === 'select') { inp = document.createElement('select'); d[3].forEach(function (o) { var op = document.createElement('option'); op.value = op.textContent = o; inp.appendChild(op); }); }
      else { inp = document.createElement('input'); inp.type = d[2]; if (d[2] === 'url' || d[2] === 'email' || d[2] === 'tel') inp.autocomplete = 'off'; }
      if (d[2] !== 'select') inp.placeholder = d[3] || '';
      inp.id = 'f-' + d[0];
      var er = document.createElement('p'); er.className = 'err'; er.id = 'e-' + d[0]; inp.setAttribute('aria-describedby', er.id);
      inp.addEventListener('input', schedule); inp.addEventListener('change', schedule);
      wrap.appendChild(lab); wrap.appendChild(inp); wrap.appendChild(er); box.appendChild(wrap);
      els[d[0]] = { input: inp, err: er };
    });
  }

  function clearOutput(msg) {
    cur = null; $('#canvas').hidden = true; $('#empty').hidden = false; $('#empty').textContent = msg; $('#info').textContent = '';
    ['#dlPng', '#dlSvg', '#copy', '#print'].forEach(function (s) { $(s).disabled = true; });
  }
  function lum(h) {
    var c = [1, 3, 5].map(function (i) { var x = parseInt(h.substr(i, 2), 16) / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  function update() {
    if (typeof qrcode === 'undefined') { showLibError(); return; }
    var t = T[$('#type').value], v = {}, touched = false;
    Object.keys(els).forEach(function (k) { v[k] = els[k].input.value.trim(); if (v[k] && els[k].input.tagName !== 'SELECT') touched = true; });
    var res = t.b(v), ok = true;
    Object.keys(els).forEach(function (k) { mark(els[k].input, els[k].err, ''); });
    if (typeof res === 'object') {
      ok = false;
      if (touched) Object.keys(res).forEach(function (k) { mark(els[k].input, els[k].err, res[k]); });
    }
    var size = Number($('#size').value), margin = Number($('#margin').value), fg = $('#fgHex').value.trim(), bg = $('#bgHex').value.trim();
    var sz = !Number.isInteger(size) || size < 128 || size > 2048, mg = !Number.isInteger(margin) || margin < 0 || margin > 16;
    mark($('#size'), $('#e-size'), sz ? 'Enter a whole number from 128 to 2048.' : '');
    mark($('#margin'), $('#e-margin'), mg ? 'Enter a whole number from 0 to 16.' : '');
    mark($('#fgHex'), $('#e-fg'), HEX.test(fg) ? '' : 'Use a hex colour like #111827.');
    mark($('#bgHex'), $('#e-bg'), HEX.test(bg) ? '' : 'Use a hex colour like #ffffff.');
    if (sz || mg || !HEX.test(fg) || !HEX.test(bg)) { clearOutput('Fix the highlighted settings to see your QR code.'); return; }
    if (!ok) { clearOutput(touched ? 'Fix the highlighted fields to see your QR code.' : 'Enter your content to see the QR code here.'); return; }
    var qr;
    try {
      qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
      qr = qrcode(0, $('#ecl').value); qr.addData(res); qr.make();
    } catch (e) { clearOutput('This content is too long for a QR code at this error-correction level. Shorten it or choose a lower level.'); return; }
    var n = qr.getModuleCount(), m = [];
    for (var r = 0; r < n; r++) { m[r] = []; for (var c = 0; c < n; c++) m[r][c] = qr.isDark(r, c); }
    cur = { m: m, n: n, size: size, margin: margin, fg: fg, bg: bg };
    draw(); $('#canvas').hidden = false; $('#empty').hidden = true;
    ['#dlPng', '#dlSvg', '#copy', '#print'].forEach(function (s) { $(s).disabled = false; });
    var warn = Math.abs(lum(fg) - lum(bg)) < 0.25 ? ' Warning: low contrast, this code may not scan.' : (lum(fg) > lum(bg) ? ' Note: light-on-dark codes are not read by every scanner.' : '');
    $('#info').textContent = size + ' x ' + size + ' px, ' + n + ' x ' + n + ' modules, level ' + $('#ecl').value + '.' + warn;
  }

  function draw() {
    var o = cur, cv = $('#canvas'), tot = o.n + 2 * o.margin;
    cv.width = cv.height = o.size; var x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
    x.fillStyle = o.bg; x.fillRect(0, 0, o.size, o.size); x.fillStyle = o.fg;
    var px = function (i) { return Math.round(i * o.size / tot); };
    for (var r = 0; r < o.n; r++) for (var c = 0; c < o.n; c++) if (o.m[r][c]) {
      var x0 = px(c + o.margin), y0 = px(r + o.margin); x.fillRect(x0, y0, px(c + o.margin + 1) - x0, px(r + o.margin + 1) - y0);
    }
  }

  function svgText() {
    var o = cur, tot = o.n + 2 * o.margin, d = '';
    for (var r = 0; r < o.n; r++) for (var c = 0; c < o.n; c++) if (o.m[r][c]) d += 'M' + (c + o.margin) + ' ' + (r + o.margin) + 'h1v1h-1z';
    return '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="' + o.size + '" height="' + o.size + '" viewBox="0 0 ' + tot + ' ' + tot + '" shape-rendering="crispEdges"><rect width="' + tot + '" height="' + tot + '" fill="' + o.bg + '"/><path fill="' + o.fg + '" d="' + d + '"/></svg>';
  }
  function fileBase() { return $('#fname').value.trim().replace(/\.(png|svg)$/i, '').replace(/[^\w\-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'qodvex-qr'; }
  function save(blob, name) {
    var u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 5000);
  }
  function guard() { if (!cur) { setStatus('Generate a valid QR code first.', 'bad'); return false; } return true; }

  function showLibError() {
    clearOutput('The QR library could not be loaded.');
    var b = document.createElement('button'); b.className = 'btn'; b.textContent = 'Retry'; b.type = 'button'; b.onclick = function () { location.reload(); };
    $('#empty').appendChild(document.createElement('br')); $('#empty').appendChild(b);
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(update, 250); }
  function bindColor(p, h) {
    $(p).addEventListener('input', function () { $(h).value = $(p).value; schedule(); });
    $(h).addEventListener('input', function () { if (HEX.test($(h).value.trim())) $(p).value = $(h).value.trim(); schedule(); });
  }

  $('#type').addEventListener('change', function () { buildFields(); update(); });
  ['#size', '#margin', '#ecl'].forEach(function (s) { $(s).addEventListener('input', schedule); });
  bindColor('#fg', '#fgHex'); bindColor('#bg', '#bgHex');
  $('#dlPng').addEventListener('click', function () {
    if (!guard()) return;
    $('#canvas').toBlob(function (b) { if (!b) { setStatus('PNG export failed in this browser.', 'bad'); return; } save(b, fileBase() + '.png'); setStatus('PNG created and download started.', 'ok'); }, 'image/png');
  });
  $('#dlSvg').addEventListener('click', function () {
    if (!guard()) return;
    try { save(new Blob([svgText()], { type: 'image/svg+xml' }), fileBase() + '.svg'); setStatus('SVG created and download started.', 'ok'); } catch (e) { setStatus('SVG export failed in this browser.', 'bad'); }
  });
  $('#copy').addEventListener('click', function () {
    if (!guard()) return;
    if (!navigator.clipboard || !window.ClipboardItem) { setStatus('Copying images is not supported here. Use Download PNG.', 'bad'); return; }
    $('#canvas').toBlob(function (b) {
      if (!b) { setStatus('Could not create the image.', 'bad'); return; }
      navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).then(function () { setStatus('QR image copied to clipboard.', 'ok'); }, function () { setStatus('Clipboard access was blocked. Use Download PNG.', 'bad'); });
    }, 'image/png');
  });
  $('#print').addEventListener('click', function () { if (guard()) window.print(); });
  $('#reset').addEventListener('click', function () {
    $('#type').value = 'url'; $('#size').value = DEF.size; $('#margin').value = DEF.margin; $('#fg').value = $('#fgHex').value = DEF.fg;
    $('#bg').value = $('#bgHex').value = DEF.bg; $('#ecl').value = DEF.ecl; $('#fname').value = ''; buildFields(); update(); setStatus('Settings reset to defaults.', 'ok');
  });
  $('#menu').addEventListener('click', function () { var o = $('#nav').classList.toggle('open'); $('#menu').setAttribute('aria-expanded', o); });
  $('#nav').addEventListener('click', function (e) { if (e.target.tagName === 'A') { $('#nav').classList.remove('open'); $('#menu').setAttribute('aria-expanded', 'false'); } });
  $('#gen').addEventListener('click', function () { var f = document.querySelector('#fields input,#fields textarea'); if (f) setTimeout(function () { f.focus({ preventScroll: true }); }, 300); });

  buildFields(); update();
})();
