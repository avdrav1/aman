/* Aman battle screen: draws a battle from battle.js on a canvas and turns clicks into orders.
   It owns no rules. It calls AmanBattle.command() for orders and AmanBattle.step() on a fixed clock.
   Opened by index.html with AmanBattleUI.open({ ctx, place, onDone }); it lives in its own layer (#battle),
   outside #app, so the campaign's re-renders never touch it. */
(function (root) {
  'use strict';
  var AB = root.AmanBattle;
  var B = null, opts = null, el = null, cv = null, cx = null, raf = 0, ro = null;
  var paused = true, speed = 1, acc = 0, last = 0, started = false, ended = false;
  var placing = null, mouse = null, drag = null, selIds = [], selBld = null, colors = {}, colorAt = 0, hint = '';
  var view = { s: 1, ox: 0, oy: 0 };
  var reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    ['bg', 'surface', 'sunk', 'ink', 'muted', 'line', 'accent', 'accent-ink', 'river', 'good', 'warn', 'bad', 'company', 'sand', 'relief'].forEach(function (k) { colors[k] = cs.getPropertyValue('--' + k).trim() || '#888'; });
  }
  function alpha(c, a) {
    // tokens are hex; return rgba
    var h = c.replace('#', ''); if (h.length === 3) h = h.split('').map(function (x) { return x + x; }).join('');
    var n = parseInt(h, 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* ---------- small pictures for the buttons, the same shapes the field draws ---------- */
  var ICON = {
    barricade: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="18" rx="2" fill="currentColor"/></svg>',
    watchtower: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2.4"/><rect x="9" y="10" width="6" height="6" fill="currentColor"/></svg>',
    workshop: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M3 9 L9 4 L15 9" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>',
    guard: '<svg viewBox="0 0 24 24"><path d="M12 3 L20 6 V12 C20 17 16 20 12 21 C8 20 4 17 4 12 V6 Z" fill="currentColor"/></svg>',
    interceptor: '<svg viewBox="0 0 24 24"><path d="M12 3 L21 20 H3 Z" fill="currentColor"/></svg>',
    engineer: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2.6"/><rect x="10" y="10" width="4" height="4" fill="currentColor"/></svg>'
  };
  var KEYS = { barricade: 'Q', watchtower: 'W', workshop: 'E' };

  /* ---------- open and close ---------- */
  function open(o) {
    opts = o || {};
    B = AB.setup(opts.ctx || {});
    paused = true; speed = 1; acc = 0; started = false; ended = false; placing = null; selIds = []; selBld = null; hint = '';
    readColors();
    el = document.createElement('div');
    el.id = 'battle'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'bt-title');
    el.innerHTML = '<header class="bt-top"></header><div class="bt-field"><canvas aria-label="The battlefield. A river runs north to south. Your bank is on the left." role="img"></canvas><div class="bt-card"></div></div><footer class="bt-bar"></footer>';
    document.body.appendChild(el);
    document.body.classList.add('in-battle');
    cv = el.querySelector('canvas'); cx = cv.getContext('2d');
    bind();
    hud();
    resize();
    // the bars above and below can change height; keep the canvas fitted to what is left
    if (root.ResizeObserver) { ro = new ResizeObserver(resize); ro.observe(el.querySelector('.bt-field')); }
    introCard();
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function close() {
    cancelAnimationFrame(raf); raf = 0;
    unbind();
    if (ro) { ro.disconnect(); ro = null; }
    if (el) el.remove();
    el = null; document.body.classList.remove('in-battle');
    var done = opts.onDone, r = AB.result(B);
    B = null;
    if (done) done(r);
  }

  /* ---------- the clock ---------- */
  function frame(now) {
    if (!el) return;
    var dt = Math.min(0.25, (now - last) / 1000); last = now;
    if (!paused && !ended) {
      acc += dt * speed;
      var tick = 1 / AB.HZ, n = 0;
      while (acc >= tick && n++ < 8) { AB.step(B); acc -= tick; }
      if (B.over) finish();
    }
    if (now - colorAt > 1000) { readColors(); colorAt = now; }
    draw(paused || ended ? 1 : Math.min(1, acc * AB.HZ));
    if (B && B.tick % 2 === 0) hudLive();
    raf = requestAnimationFrame(frame);
  }
  function setPaused(p) { if (ended || !started) return; paused = p; hud(); }

  /* ---------- geometry ---------- */
  function resize() {
    if (!el) return;
    var box = el.querySelector('.bt-field').getBoundingClientRect(), dpr = root.devicePixelRatio || 1;
    cv.width = Math.round(box.width * dpr); cv.height = Math.round(box.height * dpr);
    cv.style.width = box.width + 'px'; cv.style.height = box.height + 'px';
    var s = Math.min(box.width / AB.W, box.height / AB.H);
    view = { s: s * dpr, ox: (box.width - AB.W * s) / 2 * dpr, oy: (box.height - AB.H * s) / 2 * dpr, css: s, cssx: (box.width - AB.W * s) / 2, cssy: (box.height - AB.H * s) / 2 };
  }
  function toWorld(ev) {
    var r = cv.getBoundingClientRect();
    return { x: (ev.clientX - r.left - view.cssx) / view.css, y: (ev.clientY - r.top - view.cssy) / view.css };
  }
  function entAt(p) {
    var best = null, bd = 1e9;
    B.ents.forEach(function (e) {
      if (e.hp <= 0 || e.side !== 'you') return;
      var k = AB.KINDS[e.kind], d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < k.r + 6 && d < bd) { bd = d; best = e; }
    });
    return best;
  }

  /* ---------- input ---------- */
  var handlers = {};
  function bind() {
    handlers.down = function (ev) {
      if (!started || ended) return;
      var p = toWorld(ev);
      if (ev.button === 2) { cancel(); return; }
      if (placing) {
        var r = AB.command(B, { t: 'build', kind: placing, x: p.x, y: p.y });
        if (r.ok) { if (!ev.shiftKey) placing = null; hint = ''; } else hint = r.why;
        hud(); return;
      }
      drag = { x: p.x, y: p.y, x2: p.x, y2: p.y, moved: false };
    };
    handlers.move = function (ev) {
      if (!el) return;
      mouse = toWorld(ev);
      if (drag) { drag.x2 = mouse.x; drag.y2 = mouse.y; if (Math.hypot(drag.x2 - drag.x, drag.y2 - drag.y) > 6) drag.moved = true; }
      if (placing) { var c = AB.canPlace(B, placing, mouse.x, mouse.y); hint = c.ok ? '' : c.why; hudHint(); }
    };
    handlers.up = function (ev) {
      if (!drag) return;
      var d = drag; drag = null;
      if (d.moved) {
        // a box: select your units inside it
        var x1 = Math.min(d.x, d.x2), x2 = Math.max(d.x, d.x2), y1 = Math.min(d.y, d.y2), y2 = Math.max(d.y, d.y2);
        selIds = B.ents.filter(function (e) { return e.side === 'you' && e.hp > 0 && !AB.KINDS[e.kind].bld && e.x >= x1 && e.x <= x2 && e.y >= y1 && e.y <= y2; }).map(function (e) { return e.id; });
        selBld = null; hud(); return;
      }
      var hitE = entAt({ x: d.x, y: d.y });
      if (hitE && !AB.KINDS[hitE.kind].bld) {
        // a click on a unit selects it; shift adds; a double click selects every unit of that kind
        if (ev.detail >= 2) selIds = B.ents.filter(function (e) { return e.side === 'you' && e.hp > 0 && e.kind === hitE.kind; }).map(function (e) { return e.id; });
        else if (ev.shiftKey) { if (selIds.indexOf(hitE.id) < 0) selIds.push(hitE.id); }
        else selIds = [hitE.id];
        selBld = null; hud(); return;
      }
      if (hitE && AB.KINDS[hitE.kind].bld && !selIds.length) { selBld = hitE.id; hud(); return; }
      if (selIds.length) {
        var r = AB.command(B, { t: 'move', ids: selIds, x: d.x, y: d.y });
        hint = r.ok ? '' : r.why;
        if (r.ok) B.fx.push({ k: 'order', x: d.x, y: d.y, t: 6 });
        hud(); return;
      }
      if (hitE) { selBld = hitE.id; hud(); return; }
      selBld = null; hud();
    };
    handlers.ctx = function (ev) { ev.preventDefault(); };
    handlers.key = function (ev) {
      if (!el) return;
      var k = ev.key;
      if (k === ' ' || k === 'p' || k === 'P') { if (!started) start(); else setPaused(!paused); ev.preventDefault(); }
      else if (k === 'Escape') { cancel(); ev.preventDefault(); }
      else if (k === '1' || k === '2') { speed = +k; hud(); }
      else if (started && !ended) {
        var kind = Object.keys(KEYS).filter(function (q) { return KEYS[q] === k.toUpperCase(); })[0];
        if (kind) startPlacing(kind);
      }
      ev.stopPropagation();
    };
    handlers.click = function (ev) {
      var b = ev.target.closest('[data-bt]');
      if (!b || b.disabled) return;
      var a = b.getAttribute('data-bt'), v = b.getAttribute('data-v');
      if (a === 'start') start();
      else if (a === 'pause') setPaused(!paused);
      else if (a === 'speed') { speed = speed === 1 ? 2 : 1; hud(); }
      else if (a === 'build') startPlacing(v);
      else if (a === 'train') { var r = AB.command(B, { t: 'train', id: selBld, kind: v }); hint = r.ok ? '' : r.why; hud(); }
      else if (a === 'all') { selIds = B.ents.filter(function (e) { return e.side === 'you' && e.hp > 0 && (e.kind === 'guard' || e.kind === 'interceptor'); }).map(function (e) { return e.id; }); selBld = null; hud(); }
      else if (a === 'done') close();
    };
    handlers.vis = function () { if (document.hidden && started && !ended) setPaused(true); };
    cv.addEventListener('pointerdown', handlers.down);
    root.addEventListener('pointermove', handlers.move);
    root.addEventListener('pointerup', handlers.up);
    cv.addEventListener('contextmenu', handlers.ctx);
    root.addEventListener('keydown', handlers.key, true);
    el.addEventListener('click', handlers.click);
    root.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', handlers.vis);
  }
  function unbind() {
    root.removeEventListener('pointermove', handlers.move);
    root.removeEventListener('pointerup', handlers.up);
    root.removeEventListener('keydown', handlers.key, true);
    root.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', handlers.vis);
  }
  function cancel() { placing = null; selIds = []; selBld = null; hint = ''; hud(); }
  function startPlacing(kind) {
    var c = AB.available(B).filter(function (a) { return a.t === 'build' && a.kind === kind; })[0];
    if (!c || !c.ok) { hint = c ? c.why : ''; hud(); return; }
    placing = kind; selIds = []; selBld = null; hint = ''; hud();
  }
  function start() { started = true; paused = false; el.querySelector('.bt-card').innerHTML = ''; el.querySelector('.bt-card').className = 'bt-card'; hud(); }

  /* ---------- the cards: how to play, and the result ---------- */
  function introCard() {
    var c = el.querySelector('.bt-card');
    c.className = 'bt-card on';
    c.innerHTML = '<div class="bt-panel"><h2 id="bt-title">' + esc(opts.title || 'Hold the dam') + '</h2><p>' + esc(opts.lede || 'Company contractors want the dam. Hold it, and your depot, through ' + AB.WAVES.length + ' waves.') + '</p>' +
      '<div class="bt-how">' +
      '<div><span class="ic">' + ICON.watchtower + '</span><b>Build</b><small>Pick a building, then click your bank. Engineers build it.</small></div>' +
      '<div><span class="ic">' + ICON.guard + '</span><b>Train</b><small>Click the workshop to train guards and interceptors.</small></div>' +
      '<div><span class="ic">' + ICON.interceptor + '</span><b>Move</b><small>Click or drag to select troops, then click where they should hold.</small></div>' +
      '</div><p class="bt-note">Guards stop contractors but cannot hit drones. Interceptors and watchtowers shoot drones down. Space pauses; you can give orders while paused.</p>' +
      '<button class="primary" data-bt="start">Start the battle</button></div>';
    var b = c.querySelector('button'); if (b) b.focus();
  }
  function finish() {
    if (ended) return;
    ended = true; paused = true; placing = null;
    var r = AB.result(B), c = el.querySelector('.bt-card');
    var why = r.won ? 'You held the dam through all ' + AB.WAVES.length + ' waves.' : B.lostTo === 'dam' ? 'The Company took the dam.' : 'The Company overran your depot.';
    function pct(v) { return Math.round(v * 100) + '%'; }
    c.className = 'bt-card on';
    c.innerHTML = '<div class="bt-panel"><h2 id="bt-title" class="' + (r.won ? 'up' : 'down') + '">' + (r.won ? 'Battle won' : 'Battle lost') + '</h2><p>' + esc(why) + '</p>' +
      '<div class="bt-stats"><span><b>' + Math.floor(r.seconds / 60) + ':' + ('0' + r.seconds % 60).slice(-2) + '</b>time</span><span><b>' + pct(r.dam) + '</b>dam</span><span><b>' + pct(r.town) + '</b>town</span><span><b>' + r.kills + '</b>Company units stopped</span><span><b>' + r.lost + '</b>of yours lost</span></div>' +
      '<button class="primary" data-bt="done">Continue</button></div>';
    hud();
    var b = c.querySelector('button'); if (b) b.focus();
  }

  /* ---------- the HUD ---------- */
  function gauge(label, kind) {
    var e = B.ents.filter(function (o) { return o.kind === kind; })[0], v = e ? Math.max(0, e.hp) / e.max : 0;
    return '<span class="bt-g' + (v < 0.35 ? ' low' : '') + '" data-g="' + kind + '"><small>' + label + '</small><i><i style="width:' + Math.round(v * 100) + '%"></i></i></span>';
  }
  function hud() {
    if (!el) return;
    var w = AB.waves(B);
    var pips = AB.WAVES.map(function (x, i) { return '<i class="' + (i < w.done ? 'done' : '') + '"></i>'; }).join('');
    el.querySelector('.bt-top').innerHTML =
      '<div class="bt-name"><b>' + esc(opts.title || 'Hold the dam') + '</b><small>' + esc(opts.place || '') + '</small></div>' +
      '<div class="bt-waves" aria-label="Waves"><span class="pips">' + pips + '</span><small data-live="wave"></small></div>' +
      '<div class="bt-gs">' + gauge('Dam', 'dam') + gauge('Depot', 'depot') + gauge('Town', 'town') + '</div>' +
      '<div class="bt-supply" title="Supply. One a second, more for each Company unit stopped."><span class="dot"></span><b data-live="supply">' + Math.floor(B.supply) + '</b><small>supply</small></div>' +
      '<div class="bt-ctl"><button data-bt="pause" aria-pressed="' + (paused && started) + '"' + (!started || ended ? ' disabled' : '') + '>' + (paused && started && !ended ? 'Resume' : 'Pause') + '</button><button data-bt="speed"' + (ended ? ' disabled' : '') + '>' + speed + 'x</button></div>';
    var av = AB.available(B), bar = '';
    bar += '<div class="bt-build">' + av.filter(function (a) { return a.t === 'build'; }).map(function (a) {
      return '<button data-bt="build" data-v="' + a.kind + '" class="' + (placing === a.kind ? 'on' : '') + '"' + (a.ok && started && !ended ? '' : ' disabled') + ' title="' + esc(a.text + ' Key ' + KEYS[a.kind] + '.') + '"><span class="ic">' + ICON[a.kind] + '</span><b>' + a.name + '</b><small>' + a.cost + '</small></button>';
    }).join('') + '</div>';
    var sel = '';
    var sb = selBld ? AB.byId(B, selBld) : null;
    if (sb && sb.hp > 0) {
      var k = AB.KINDS[sb.kind];
      var trains = av.filter(function (a) { return a.t === 'train' && a.id === sb.id; });
      sel = '<b>' + esc(k.name || sb.kind.charAt(0).toUpperCase() + sb.kind.slice(1)) + '</b> ' +
        (sb.built < 1 ? '<small>Being built: ' + Math.round(sb.built * 100) + '%</small>' :
          trains.map(function (a) { return '<button data-bt="train" data-v="' + a.kind + '"' + (a.ok && !ended ? '' : ' disabled') + ' title="' + esc(a.text) + '"><span class="ic">' + ICON[a.kind] + '</span><b>' + a.name + '</b><small>' + a.cost + '</small></button>'; }).join('') +
          (sb.queue.length ? '<span class="bt-q">' + sb.queue.map(function (q) { return '<span class="ic">' + ICON[q] + '</span>'; }).join('') + '</span>' : '') +
          (!trains.length ? '<small>' + esc(k.text || (k.site ? 'Protect it.' : '')) + '</small>' : ''));
    } else if (selIds.length) {
      var count = {};
      selIds.forEach(function (id) { var e = AB.byId(B, id); if (e && e.hp > 0) count[e.kind] = (count[e.kind] || 0) + 1; });
      sel = Object.keys(count).map(function (q) { return '<span class="bt-cnt"><span class="ic">' + ICON[q] + '</span>' + count[q] + '</span>'; }).join('') + '<small>Click the field to move them there.</small>';
    } else {
      sel = '<button data-bt="all"' + (started && !ended ? '' : ' disabled') + '>Select all troops</button><small>Click a building to use it. Drag to select troops.</small>';
    }
    bar += '<div class="bt-sel">' + sel + '</div><div class="bt-hint" role="status">' + esc(hint) + '</div>';
    el.querySelector('.bt-bar').innerHTML = bar;
    lastSupply = -1; lastWave = '';   // the rebuild cleared the live text
    hudLive();
  }
  var lastSupply = -1, lastWave = '', lastTrainable = '';
  function hudLive() {
    if (!el || !B) return;
    var w = AB.waves(B), s = Math.floor(B.supply);
    var sEl = el.querySelector('[data-live="supply"]'); if (sEl && s !== lastSupply) { sEl.textContent = s; lastSupply = s; }
    var t = w.next ? 'Wave ' + w.next + ' of ' + w.total + (w.inSec > 0 ? ' in ' + w.inSec + ' s' : ' arriving') : w.enemies ? 'Last wave: ' + w.enemies + ' left' : 'All waves stopped';
    var wEl = el.querySelector('[data-live="wave"]'); if (wEl && t !== lastWave) { wEl.textContent = t; lastWave = t; }
    ['dam', 'depot', 'town'].forEach(function (kind) {
      var e = B.ents.filter(function (o) { return o.kind === kind; })[0], g = el.querySelector('[data-g="' + kind + '"]');
      if (!g || !e) return; var v = Math.max(0, e.hp) / e.max;
      g.querySelector('i i').style.width = Math.round(v * 100) + '%'; g.classList.toggle('low', v < 0.35);
    });
    // buttons whose affordability changed, and the wave pips, need a rebuild; do it only when they change
    var key = AB.available(B).map(function (a) { return a.ok ? 1 : 0; }).join('') + '|' + w.done + '|' + (selBld ? (AB.byId(B, selBld) || {}).built + ':' + ((AB.byId(B, selBld) || {}).queue || []).length : '');
    if (key !== lastTrainable) { lastTrainable = key; hud(); }
  }
  function hudHint() { var h = el && el.querySelector('.bt-hint'); if (h) h.textContent = hint; }

  /* ---------- drawing ---------- */
  function draw(a) {
    var C = colors, g = cx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = C.bg; g.fillRect(0, 0, cv.width, cv.height);
    g.setTransform(view.s, 0, 0, view.s, view.ox, view.oy);
    // ground, your bank slightly warmer
    g.fillStyle = C.sunk; g.fillRect(0, 0, AB.W, AB.H);
    g.beginPath(); g.moveTo(0, 0);
    for (var y = 0; y <= AB.H; y += 10) g.lineTo(AB.riverX(y), y);
    g.lineTo(0, AB.H); g.closePath(); g.fillStyle = alpha(C.accent, 0.07); g.fill();
    g.strokeStyle = C.line; g.lineWidth = 1; g.strokeRect(0.5, 0.5, AB.W - 1, AB.H - 1);
    // the river
    g.beginPath();
    for (y = -10; y <= AB.H + 10; y += 8) { var rx = AB.riverX(y); if (y === -10) g.moveTo(rx, y); else g.lineTo(rx, y); }
    g.strokeStyle = alpha(C.river, 0.55); g.lineWidth = AB.RIVER_W; g.lineCap = 'butt'; g.stroke();
    g.strokeStyle = alpha(C.river, 0.35); g.lineWidth = AB.RIVER_W * 0.4; g.stroke();
    // the ford: stepping stones
    var fd = AB.CROSSINGS[1];
    g.fillStyle = C.sand;
    for (var i = -2; i <= 2; i++) { g.beginPath(); g.arc(fd.x + i * 11, fd.y + (i % 2 ? 4 : -4), 4, 0, Math.PI * 2); g.fill(); }
    label('Ford', fd.x, fd.y + 22, C.muted);
    // Company side: entry arrows
    ['n', 's'].forEach(function (s, j) {
      var yy = j ? 450 : 150;
      g.fillStyle = alpha(C.company, 0.75);
      g.beginPath(); g.moveTo(AB.W - 4, yy - 12); g.lineTo(AB.W - 22, yy); g.lineTo(AB.W - 4, yy + 12); g.closePath(); g.fill();
    });
    var w = AB.waves(B);
    if (w.next && w.inSec <= 10 && started) {
      g.font = '600 13px ' + font(); g.fillStyle = C.company; g.textAlign = 'right';
      g.fillText('Wave ' + w.next + ' in ' + w.inSec + ' s', AB.W - 28, 24);
    }

    // range rings: placing a tower, or a selected tower
    if (placing && mouse) {
      var pk = AB.KINDS[placing], ok = AB.canPlace(B, placing, mouse.x, mouse.y).ok;
      if (pk.range) ring(mouse.x, mouse.y, pk.range, ok ? C.accent : C.bad);
      g.globalAlpha = 0.6; shape(placing, mouse.x, mouse.y, 1, ok ? C.accent : C.bad, false); g.globalAlpha = 1;
    }
    var sb = selBld ? AB.byId(B, selBld) : null;
    if (sb && AB.KINDS[sb.kind].range) ring(sb.x, sb.y, AB.KINDS[sb.kind].range, C.accent);

    // structures, then ground units, then drones above
    var ents = B.ents.slice().sort(function (p, q) { return rank(p) - rank(q); });
    ents.forEach(function (e) {
      var x = e.px + (e.x - e.px) * a, y = e.y === e.py ? e.y : e.py + (e.y - e.py) * a;
      var k = AB.KINDS[e.kind], sel = selIds.indexOf(e.id) >= 0 || e.id === selBld;
      if (sel) { g.beginPath(); g.arc(x, y, k.r + 5, 0, Math.PI * 2); g.strokeStyle = C.accent; g.lineWidth = 2; g.stroke(); }
      shape(e.kind, x, y, e.built, e.side === 'you' ? C.accent : C.company, e.ruined, e);
      if (e.hp > 0 && e.hp < e.max && e.built >= 1) bar(x, y - k.r - 7, Math.max(16, k.r * 2), e.hp / e.max);
      if (e.built < 1) progress(x, y, k.r + 3, e.built);
    });

    // shots and losses
    B.fx.forEach(function (f) {
      if (f.k === 'shot') {
        g.strokeStyle = f.side === 'you' ? C.accent : C.company; g.lineWidth = 1.6; g.globalAlpha = reduce ? 0.5 : 0.9;
        g.beginPath(); g.moveTo(f.x1, f.y1); g.lineTo(f.x2, f.y2); g.stroke(); g.globalAlpha = 1;
      } else if (f.k === 'down') {
        var t = 1 - f.t / 8;
        g.strokeStyle = f.side === 'you' ? C.bad : C.company; g.lineWidth = 2; g.globalAlpha = 1 - t;
        g.beginPath(); g.arc(f.x, f.y, reduce ? 8 : 6 + t * 14, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
      } else if (f.k === 'work' && !reduce) {
        g.fillStyle = C.accent; g.beginPath(); g.arc(f.x + (f.t - 2) * 5, f.y - 10 - (3 - f.t) * 3, 2, 0, Math.PI * 2); g.fill();
      } else if (f.k === 'order') {
        g.strokeStyle = C.accent; g.lineWidth = 2; g.globalAlpha = f.t / 6;
        g.beginPath(); g.arc(f.x, f.y, 10 - f.t, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
      }
    });

    if (drag && drag.moved) {
      g.strokeStyle = C.accent; g.lineWidth = 1.5; g.setLineDash([5, 4]);
      g.strokeRect(drag.x, drag.y, drag.x2 - drag.x, drag.y2 - drag.y); g.setLineDash([]);
      g.fillStyle = alpha(C.accent, 0.08); g.fillRect(drag.x, drag.y, drag.x2 - drag.x, drag.y2 - drag.y);
    }
    if (paused && started && !ended) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = alpha(C.ink, 0.06); g.fillRect(0, 0, cv.width, cv.height);
      g.setTransform(view.s, 0, 0, view.s, view.ox, view.oy);
      g.font = '700 22px ' + font(true); g.fillStyle = C.muted; g.textAlign = 'center';
      g.fillText('Paused', AB.W / 2, 40);
    }
  }
  function rank(e) { var k = AB.KINDS[e.kind]; return k.bld ? 0 : k.air ? 2 : 1; }
  function font(d) { return d ? 'Bricolage Grotesque, system-ui, sans-serif' : 'IBM Plex Sans, system-ui, sans-serif'; }
  function label(t, x, y, c) { cx.font = '600 12px ' + font(); cx.fillStyle = c; cx.textAlign = 'center'; cx.fillText(t, x, y); }
  function ring(x, y, r, c) { var g = cx; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.strokeStyle = alpha(c, 0.5); g.setLineDash([6, 5]); g.lineWidth = 1.5; g.stroke(); g.setLineDash([]); g.fillStyle = alpha(c, 0.05); g.fill(); }
  function bar(x, y, w, v) {
    var g = cx;
    g.fillStyle = colors.line; g.fillRect(x - w / 2, y, w, 4);
    g.fillStyle = v < 0.35 ? colors.bad : v < 0.7 ? colors.warn : colors.good; g.fillRect(x - w / 2, y, w * v, 4);
  }
  function progress(x, y, r, v) {
    var g = cx; g.beginPath(); g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * v); g.strokeStyle = colors.accent; g.lineWidth = 3; g.stroke();
  }
  /* One drawing per kind. c: the side's color. built < 1 draws an outline under construction. */
  function shape(kind, x, y, built, c, ruined, e) {
    var g = cx, C = colors, k = AB.KINDS[kind];
    var ghost = built < 1;
    g.lineWidth = 2;
    if (kind === 'depot') {
      rrect(x - 24, y - 20, 48, 40, 6); g.fillStyle = ruined ? C.line : C.accent; g.fill(); g.strokeStyle = C.ink; g.stroke();
      g.fillStyle = C['accent-ink']; g.fillRect(x - 10, y - 2, 20, 14);
      label('Depot', x, y + 36, C.ink);
    } else if (kind === 'dam') {
      var half = AB.RIVER_W / 2 + 10;
      g.fillStyle = ruined ? C.line : C.relief; rrect(x - half, y - 11, half * 2, 22, 4); g.fill();
      g.strokeStyle = C.ink; g.stroke();
      if (ruined) { g.strokeStyle = C.company; g.beginPath(); g.moveTo(x - 8, y - 11); g.lineTo(x + 4, y + 11); g.stroke(); }
      else { g.strokeStyle = alpha(C.surface, 0.7); g.lineWidth = 1.5; for (var i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(x + i * 10, y - 7); g.lineTo(x + i * 10, y + 7); g.stroke(); } }
      label('Dam', x, y - 18, C.ink);
    } else if (kind === 'town') {
      var hs = [[-18, -10], [0, -16], [18, -8], [-12, 10], [8, 8], [22, 14]];
      hs.forEach(function (h) {
        var hx = x + h[0], hy = y + h[1];
        g.fillStyle = ruined ? C.line : C.surface; g.strokeStyle = ruined ? C.muted : C.ink; g.lineWidth = 1.5;
        g.beginPath(); g.rect(hx - 6, hy - 3, 12, 9); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(hx - 8, hy - 3); g.lineTo(hx, hy - 10); g.lineTo(hx + 8, hy - 3); g.closePath(); g.fillStyle = ruined ? C.line : C.sand; g.fill(); g.stroke();
      });
      label('Town', x, y + 36, C.ink);
    } else if (kind === 'barricade') {
      rrect(x - 5, y - 15, 10, 30, 3);
      if (ghost) { g.setLineDash([4, 3]); g.strokeStyle = c; g.stroke(); g.setLineDash([]); }
      else { g.fillStyle = C.ink; g.fill(); g.strokeStyle = c; g.lineWidth = 1.5; g.stroke(); }
    } else if (kind === 'watchtower') {
      g.beginPath(); g.arc(x, y, 13, 0, Math.PI * 2);
      if (ghost) { g.setLineDash([4, 3]); g.strokeStyle = c; g.stroke(); g.setLineDash([]); }
      else { g.fillStyle = C.surface; g.fill(); g.strokeStyle = c; g.lineWidth = 3; g.stroke(); g.fillStyle = C.ink; g.fillRect(x - 5, y - 5, 10, 10); }
    } else if (kind === 'workshop') {
      g.beginPath(); g.moveTo(x - 20, y - 6); g.lineTo(x - 8, y - 18); g.lineTo(x + 4, y - 6); g.lineTo(x + 20, y - 6); g.lineTo(x + 20, y + 16); g.lineTo(x - 20, y + 16); g.closePath();
      if (ghost) { g.setLineDash([4, 3]); g.strokeStyle = c; g.stroke(); g.setLineDash([]); }
      else { g.fillStyle = C.surface; g.fill(); g.strokeStyle = c; g.lineWidth = 2.5; g.stroke(); g.fillStyle = C.ink; g.fillRect(x - 4, y + 4, 8, 12); }
      if (e && e.queue && e.queue.length && e.built >= 1) { var tot = AB.KINDS[e.queue[0]].train * AB.HZ; bar(x, y + 22, 34, 1 - e.qt / tot); }
    } else if (kind === 'guard') {
      g.beginPath(); g.moveTo(x, y - 8); g.lineTo(x + 7, y - 5); g.lineTo(x + 7, y + 1); g.quadraticCurveTo(x + 6, y + 7, x, y + 9); g.quadraticCurveTo(x - 6, y + 7, x - 7, y + 1); g.lineTo(x - 7, y - 5); g.closePath();
      g.fillStyle = c; g.fill(); g.strokeStyle = C.ink; g.lineWidth = 1.5; g.stroke();
    } else if (kind === 'interceptor') {
      g.beginPath(); g.moveTo(x, y - 9); g.lineTo(x + 8, y + 7); g.lineTo(x - 8, y + 7); g.closePath();
      g.fillStyle = c; g.fill(); g.strokeStyle = C.ink; g.lineWidth = 1.5; g.stroke();
    } else if (kind === 'engineer') {
      rrect(x - 6, y - 6, 12, 12, 3); g.fillStyle = C.surface; g.fill(); g.strokeStyle = c; g.lineWidth = 2.5; g.stroke();
      g.fillStyle = C.ink; g.fillRect(x - 2, y - 2, 4, 4);
    } else if (kind === 'drone') {
      g.strokeStyle = c; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x - 6, y - 6); g.lineTo(x + 6, y + 6); g.moveTo(x + 6, y - 6); g.lineTo(x - 6, y + 6); g.stroke();
      [[-6, -6], [6, 6], [6, -6], [-6, 6]].forEach(function (p) { g.beginPath(); g.arc(x + p[0], y + p[1], 2.6, 0, Math.PI * 2); g.fillStyle = c; g.fill(); });
    } else if (kind === 'contractor') {
      g.beginPath(); g.moveTo(x, y - 8); g.lineTo(x + 8, y); g.lineTo(x, y + 8); g.lineTo(x - 8, y); g.closePath();
      g.fillStyle = c; g.fill(); g.strokeStyle = C.ink; g.lineWidth = 1.5; g.stroke();
    } else if (kind === 'convoy') {
      rrect(x - 16, y - 10, 32, 20, 4); g.fillStyle = c; g.fill(); g.strokeStyle = C.ink; g.lineWidth = 2; g.stroke();
      g.fillStyle = C.ink; [-9, 0, 9].forEach(function (d) { g.beginPath(); g.arc(x + d, y + 11, 3, 0, Math.PI * 2); g.fill(); });
    }
    function rrect(rx, ry, w, h, r) { g.beginPath(); g.moveTo(rx + r, ry); g.arcTo(rx + w, ry, rx + w, ry + h, r); g.arcTo(rx + w, ry + h, rx, ry + h, r); g.arcTo(rx, ry + h, rx, ry, r); g.arcTo(rx, ry, rx + w, ry, r); g.closePath(); }
  }

  /* ---------- for tests: play the rest of the battle with the bot, at once ---------- */
  function runBot() {
    if (!B) return null;
    if (!started) start();
    var lim = B.tick + 900 * AB.HZ;
    while (!B.over && B.tick < lim) { AB.bot(B).forEach(function (c) { AB.command(B, c); }); AB.step(B); }
    if (B.over) finish();
    return AB.result(B);
  }

  root.AmanBattleUI = { open: open, runBot: runBot, isOpen: function () { return !!el; }, state: function () { return B; } };
})(typeof window !== 'undefined' ? window : globalThis);
