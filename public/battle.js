/* Aman battle layer: the rules of one real-time battle. No DOM. Runs in the browser (window.AmanBattle) and in Node.
   A battle is always against Company forces, never a power. See docs/battle.md.

   Deterministic: a fixed tick of 10 per second, and all randomness from B.rng, seeded from the campaign.
   The UI calls setup once, command() for each player order, and step() once per tick; it never changes B itself.

   M1 greybox: one site, a dam on a river. You hold a Depot, the Dam, and a Town against waves of Company drones,
   contractor squads, and a convoy. Lose the Depot or the Dam and you lose. Survive every wave and you win. The Town is the civilians' cost. */
(function (root) {
  'use strict';

  const HZ = 10, DT = 1 / HZ;
  const W = 960, H = 600;

  /* ---------- the field: a river with two crossings ---------- */
  const RIVER_W = 46;
  function riverX(y) { return 410 + 34 * Math.sin(y / 110) + 0.04 * (y - 300); }
  const CROSSINGS = [
    { key: 'dam', x: riverX(300), y: 300 },
    { key: 'ford', x: riverX(530), y: 530 }
  ];
  function side(x, y) { return x < riverX(y) ? 'w' : 'e'; }
  function inRiver(x, y) { return Math.abs(x - riverX(y)) < RIVER_W / 2 + 4; }

  /* ---------- what things are ---------- */
  /* Player units and buildings, and the Company's forces. dmg is per hit, cd is ticks between hits,
     air: multiplier against drones (0 means it cannot hit them), ground: multiplier against ground. */
  const KINDS = {
    depot:       { side: 'you', bld: true, hp: 700, r: 26, trains: ['engineer'] },
    dam:         { side: 'you', bld: true, hp: 520, r: 24, site: true },
    town:        { side: 'you', bld: true, hp: 420, r: 30, site: true },
    barricade:   { side: 'you', bld: true, hp: 340, r: 15, cost: 10, build: 4, blocks: true, name: 'Barricade', text: 'Blocks contractors and convoys. Drones fly over it.' },
    watchtower:  { side: 'you', bld: true, hp: 240, r: 15, cost: 25, build: 8, range: 150, dmg: 8, cd: 9, air: 2.2, ground: 1, name: 'Watchtower', text: 'Fires on anything in range, drones hardest.' },
    workshop:    { side: 'you', bld: true, hp: 320, r: 22, cost: 30, build: 10, trains: ['guard', 'interceptor'], name: 'Workshop', text: 'Trains guards and interceptors.' },
    guard:       { side: 'you', hp: 150, r: 7, cost: 15, train: 6, speed: 46, range: 24, dmg: 13, cd: 8, air: 0, ground: 1, aggro: 95, leash: 130, name: 'Guard', text: 'Holds a point against contractors. Cannot hit drones.' },
    interceptor: { side: 'you', hp: 75, r: 7, cost: 20, train: 7, speed: 56, range: 115, dmg: 8, cd: 6, air: 2.4, ground: 0.6, aggro: 120, leash: 40, name: 'Interceptor', text: 'Shoots drones down from range. Weak against contractors.' },
    engineer:    { side: 'you', hp: 60, r: 6, cost: 10, train: 5, speed: 62, buildRate: 1, repair: 9, name: 'Engineer', text: 'Builds what you place, then repairs damage.' },
    drone:       { side: 'co', air: true, hp: 34, r: 6, speed: 72, range: 18, dmg: 6, cd: 8, bounty: 2 },
    contractor:  { side: 'co', hp: 92, r: 7, speed: 38, range: 24, dmg: 10, cd: 9, aggro: 70, bounty: 3 },
    convoy:      { side: 'co', hp: 640, r: 13, speed: 21, range: 30, dmg: 26, cd: 12, structures: true, bounty: 15 }
  };
  const BUILDS = ['barricade', 'watchtower', 'workshop'];

  /* ---------- the waves ---------- */
  /* at: seconds. Each group: kind, n (before scaling), from ('n' or 's' spawn), goal ('dam', 'town', 'depot'). */
  const SPAWN = { n: { x: W - 8, y: 150 }, s: { x: W - 8, y: 450 } };
  const WAVES = [
    { at: 45,  g: [['drone', 4, 'n', 'dam']] },
    { at: 85,  g: [['contractor', 3, 's', 'town']] },
    { at: 125, g: [['drone', 5, 'n', 'dam'], ['contractor', 2, 'n', 'dam']] },
    { at: 170, g: [['contractor', 3, 'n', 'dam'], ['contractor', 3, 's', 'town']] },
    { at: 215, g: [['drone', 8, 'n', 'dam'], ['drone', 3, 's', 'town']] },
    { at: 260, g: [['contractor', 4, 'n', 'dam'], ['drone', 5, 's', 'town']] },
    { at: 305, g: [['contractor', 5, 's', 'town'], ['contractor', 3, 'n', 'dam'], ['drone', 4, 'n', 'dam']] },
    { at: 355, g: [['convoy', 1, 'n', 'depot'], ['contractor', 5, 'n', 'dam'], ['drone', 7, 's', 'town']] }
  ];
  const SUPPLY_RATE = 1;      // supply per second
  let MULT_AT = 1.55;         // Company numbers scale by (MULT_AT - odds)

  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  /* ---------- setup ---------- */
  /* ctx: { seed, odds, f } from the campaign (S.battle). odds is the auto-resolve chance; it scales the Company's numbers. */
  function setup(ctx) {
    ctx = ctx || {};
    const odds = ctx.odds == null ? 0.6 : ctx.odds;
    const B = {
      tick: 0, seed: (ctx.seed >>> 0) || 1, rng: null, odds: odds, f: ctx.f || null,
      mult: clamp(MULT_AT - odds, 0.5, 1.2),
      supply: Math.round(35 + 30 * odds), ents: [], nextId: 1, pending: [], wave: 0, over: false, won: false,
      fx: [], kills: 0, lost: 0, spent: 0
    };
    B.rng = mulberry32(B.seed);
    add(B, 'depot', 105, 300, { built: 1 });
    add(B, 'dam', CROSSINGS[0].x, 300, { built: 1 });
    add(B, 'town', 190, 488, { built: 1 });
    add(B, 'engineer', 140, 270); add(B, 'engineer', 140, 330);
    add(B, 'guard', 325, 292, { post: 0 }); add(B, 'guard', 310, 515, { post: 1 });
    // the wave plan, scaled by the odds: better odds, fewer Company troops
    WAVES.forEach(function (w, wi) {
      w.g.forEach(function (g) {
        const n = g[0] === 'convoy' ? g[1] : Math.max(1, Math.round(g[1] * B.mult));
        for (let i = 0; i < n; i++) B.pending.push({ tick: Math.round((w.at + i * 0.7) * HZ), kind: g[0], from: g[2], goal: g[3], wave: wi });
      });
    });
    B.pending.sort(function (a, b) { return a.tick - b.tick; });
    B.endTick = B.pending[B.pending.length - 1].tick;
    return B;
  }

  function add(B, kind, x, y, extra) {
    const k = KINDS[kind];
    const e = { id: B.nextId++, kind: kind, side: k.side, x: x, y: y, px: x, py: y, hp: k.hp, max: k.hp, cd: 0, ax: x, ay: y, path: [], target: null, built: k.bld ? 0 : 1, queue: [], qt: 0, task: null };
    if (extra) Object.keys(extra).forEach(function (q) { e[q] = extra[q]; });
    if (k.bld && e.built < 1) e.hp = Math.max(1, Math.round(k.hp * 0.1));
    if (k.trains) { e.rx = kind === 'depot' ? 150 : 330; e.ry = kind === 'depot' ? 300 : 300; }
    B.ents.push(e);
    return e;
  }
  function byId(B, id) { for (let i = 0; i < B.ents.length; i++) if (B.ents[i].id === id) return B.ents[i]; return null; }
  function alive(e) { return e && e.hp > 0; }

  /* A ground route from (x, y) to (tx, ty): straight on one bank, through the nearer crossing otherwise. */
  function route(x, y, tx, ty) {
    if (side(x, y) === side(tx, ty)) return [{ x: tx, y: ty }];
    let best = null, bd = Infinity;
    CROSSINGS.forEach(function (c) { const d = Math.hypot(c.x - x, c.y - y) + Math.hypot(tx - c.x, ty - c.y); if (d < bd) { bd = d; best = c; } });
    const off = 34;   // step onto and off the crossing, so a unit never cuts the corner through the water
    const a = side(x, y) === 'w' ? -off : off;
    return [{ x: best.x + a, y: best.y }, { x: best.x - a, y: best.y }, { x: tx, y: ty }];
  }
  function routeVia(x, y, c, tx, ty) {
    const a = side(x, y) === 'w' ? -34 : 34;
    return [{ x: c.x + a, y: c.y }, { x: c.x - a, y: c.y }].concat(route(c.x - a, c.y, tx, ty));
  }

  /* ---------- placing ---------- */
  function canPlace(B, kind, x, y) {
    const k = KINDS[kind];
    if (!k || BUILDS.indexOf(kind) < 0) return { ok: false, why: 'That cannot be built.' };
    if (B.supply < k.cost) return { ok: false, why: 'Needs ' + k.cost + ' supply. You have ' + Math.floor(B.supply) + '.' };
    if (x < k.r + 6 || y < k.r + 6 || y > H - k.r - 6) return { ok: false, why: 'Too close to the edge.' };
    if (side(x, y) !== 'w' || x > riverX(y) - RIVER_W / 2 - k.r) {
      // a barricade may sit on the dam crossing's west end, or the ford's, but nothing in the water
      return { ok: false, why: 'Build on your bank of the river.' };
    }
    for (let i = 0; i < B.ents.length; i++) {
      const e = B.ents[i], ek = KINDS[e.kind];
      if (ek.bld && alive(e) && Math.hypot(e.x - x, e.y - y) < ek.r + k.r + 4) return { ok: false, why: 'Too close to another building.' };
    }
    return { ok: true, why: '' };
  }

  /* Every order the player could give now, with ok and why, for the UI's buttons and for the bot. */
  function available(B) {
    const out = [];
    BUILDS.forEach(function (kind) {
      const k = KINDS[kind], ok = B.supply >= k.cost;
      out.push({ t: 'build', kind: kind, name: k.name, cost: k.cost, text: k.text, ok: ok, why: ok ? '' : 'Needs ' + k.cost + ' supply.' });
    });
    B.ents.forEach(function (e) {
      const k = KINDS[e.kind];
      if (!k.trains || !alive(e) || e.built < 1) return;
      k.trains.forEach(function (u) {
        const uk = KINDS[u], ok = B.supply >= uk.cost && e.queue.length < 5;
        out.push({ t: 'train', id: e.id, kind: u, name: uk.name, cost: uk.cost, text: uk.text, ok: ok, why: ok ? '' : e.queue.length >= 5 ? 'The queue is full.' : 'Needs ' + uk.cost + ' supply.' });
      });
    });
    return out;
  }

  /* cmd: { t: 'build', kind, x, y } | { t: 'train', id, kind } | { t: 'move', ids, x, y } | { t: 'rally', id, x, y } */
  function command(B, cmd) {
    if (B.over) return { ok: false, why: 'The battle is over.' };
    if (cmd.t === 'build') {
      const c = canPlace(B, cmd.kind, cmd.x, cmd.y);
      if (!c.ok) return c;
      B.supply -= KINDS[cmd.kind].cost; B.spent += KINDS[cmd.kind].cost;
      const e = add(B, cmd.kind, cmd.x, cmd.y);
      return { ok: true, id: e.id };
    }
    if (cmd.t === 'train') {
      const e = byId(B, cmd.id), k = e && KINDS[e.kind], uk = KINDS[cmd.kind];
      if (!alive(e) || !k.trains || k.trains.indexOf(cmd.kind) < 0) return { ok: false, why: 'That building cannot train it.' };
      if (e.built < 1) return { ok: false, why: 'It is still being built.' };
      if (e.queue.length >= 5) return { ok: false, why: 'The queue is full.' };
      if (B.supply < uk.cost) return { ok: false, why: 'Needs ' + uk.cost + ' supply.' };
      B.supply -= uk.cost; B.spent += uk.cost;
      e.queue.push(cmd.kind); if (e.queue.length === 1) e.qt = uk.train * HZ;
      return { ok: true };
    }
    if (cmd.t === 'move') {
      const us = (cmd.ids || []).map(function (id) { return byId(B, id); }).filter(function (e) { return alive(e) && e.side === 'you' && !KINDS[e.kind].bld; });
      if (!us.length) return { ok: false, why: 'Nothing selected can move.' };
      const x = clamp(cmd.x, 8, W - 8), y = clamp(cmd.y, 8, H - 8);
      // a loose formation around the point, so a group does not stack on one pixel
      us.forEach(function (u, i) {
        const ang = i * 2.4, rad = i === 0 ? 0 : 10 + 4 * Math.sqrt(i);
        let ax = x + Math.cos(ang) * rad, ay = y + Math.sin(ang) * rad;
        if (inRiver(ax, ay)) { ax = x; ay = y; }
        u.ax = ax; u.ay = ay; u.path = route(u.x, u.y, ax, ay); u.target = null; u.task = null; u.ordered = HZ * 2;
      });
      return { ok: true };
    }
    if (cmd.t === 'rally') {
      const e = byId(B, cmd.id);
      if (!alive(e) || !KINDS[e.kind].trains) return { ok: false, why: 'Only a building that trains has a rally point.' };
      e.rx = clamp(cmd.x, 8, W - 8); e.ry = clamp(cmd.y, 8, H - 8);
      return { ok: true };
    }
    return { ok: false, why: 'Unknown order.' };
  }

  /* ---------- one tick ---------- */
  function step(B) {
    if (B.over) return B;
    B.tick += 1;
    B.ents.forEach(function (e) { e.px = e.x; e.py = e.y; });
    B.fx = B.fx.filter(function (f) { return --f.t > 0; });
    if (B.tick % HZ === 0) B.supply += SUPPLY_RATE;

    // spawn
    while (B.pending.length && B.pending[0].tick <= B.tick) {
      const p = B.pending.shift(), s = SPAWN[p.from];
      const e = add(B, p.kind, s.x, s.y + (B.rng() - 0.5) * 60, { goal: p.goal });
      B.wave = Math.max(B.wave, p.wave + 1);
      planCo(B, e);
    }

    B.ents.forEach(function (e) {
      if (!alive(e)) return;
      const k = KINDS[e.kind];
      if (e.cd > 0) e.cd -= 1;
      if (k.bld) { building(B, e, k); return; }
      if (e.side === 'co') coUnit(B, e, k); else if (e.kind === 'engineer') engineer(B, e, k); else fighter(B, e, k);
    });
    separate(B);

    // the dead: bounty for Company losses, a count of yours
    B.ents = B.ents.filter(function (e) {
      if (e.hp > 0) return true;
      const k = KINDS[e.kind];
      if (e.side === 'co') { B.kills += 1; B.supply += k.bounty || 0; }
      else if (!k.site && e.kind !== 'depot') B.lost += 1;
      B.fx.push({ k: 'down', x: e.x, y: e.y, side: e.side, air: !!k.air, t: 8 });
      // a site is not removed: it stays as a ruin the Company has taken
      if (k.site || e.kind === 'depot') { e.hp = 0; e.ruined = true; return true; }
      return false;
    });

    // lose the Depot, or let the Company take the Dam, and the battle is lost
    const depot = siteOf(B, 'depot'), dam = siteOf(B, 'dam');
    if (!depot || !dam) { B.over = true; B.won = false; B.lostTo = !depot ? 'depot' : 'dam'; return B; }
    if (B.tick > B.endTick && !B.pending.length && !B.ents.some(function (e) { return e.side === 'co' && alive(e); })) { B.over = true; B.won = true; }
    return B;
  }

  function hit(B, a, ak, t) {
    const tk = KINDS[t.kind];
    let d = ak.dmg;
    if (ak.air !== undefined && ak.air !== true) d *= tk.air ? ak.air : (ak.ground == null ? 1 : ak.ground);
    t.hp -= d; a.cd = ak.cd;
    B.fx.push({ k: 'shot', x1: a.x, y1: a.y, x2: t.x, y2: t.y, side: a.side, t: 2 });
  }
  function canHit(ak, t) { const tk = KINDS[t.kind]; return !(tk.air && ak.air === 0) && !(t.ruined); }

  function nearest(B, e, pred, maxD) {
    let best = null, bd = maxD;
    for (let i = 0; i < B.ents.length; i++) {
      const o = B.ents[i];
      if (!alive(o) || o === e || !pred(o)) continue;
      const d = Math.hypot(o.x - e.x, o.y - e.y) - KINDS[o.kind].r;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  function moveAlong(B, e, k) {
    if (!e.path.length) return true;
    const p = e.path[0], dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy), s = k.speed * DT;
    if (d <= s) { e.x = p.x; e.y = p.y; e.path.shift(); return !e.path.length; }
    let nx = e.x + dx / d * s, ny = e.y + dy / d * s;
    // ground Company units are stopped by barricades and attack them
    if (e.side === 'co' && !k.air) {
      const blk = nearest(B, { x: nx, y: ny }, function (o) { return KINDS[o.kind].blocks && o.built >= 1; }, k.r);
      if (blk && Math.hypot(blk.x - nx, blk.y - ny) < KINDS[blk.kind].r + k.r) { e.target = blk.id; return false; }
    }
    e.x = nx; e.y = ny;
    return false;
  }

  function building(B, e, k) {
    if (e.built < 1) return;
    if (k.range && e.cd <= 0) {
      const t = nearest(B, e, function (o) { return o.side === 'co' && canHit(k, o); }, k.range);
      if (t) hit(B, e, k, t);
    }
    if (k.trains && e.queue.length) {
      e.qt -= 1;
      if (e.qt <= 0) {
        const kind = e.queue.shift(), u = add(B, kind, e.x + 18, e.y + 14);
        u.ax = e.rx; u.ay = e.ry; u.path = route(u.x, u.y, e.rx, e.ry);
        if (e.queue.length) e.qt = KINDS[e.queue[0]].train * HZ;
      }
    }
  }

  /* Guards and interceptors: hold the anchor, engage what comes within aggro, return when it is gone or too far. */
  function fighter(B, e, k) {
    if (e.ordered > 0) { e.ordered -= 1; if (e.path.length) { moveAlong(B, e, k); return; } }
    let t = e.target ? byId(B, e.target) : null;
    if (!alive(t) || Math.hypot(t.x - e.ax, t.y - e.ay) > k.aggro + k.leash) t = null;
    if (!t) t = nearest(B, e, function (o) { return o.side === 'co' && canHit(k, o) && Math.hypot(o.x - e.ax, o.y - e.ay) < k.aggro + k.leash; }, k.aggro);
    e.target = t ? t.id : null;
    if (t) {
      const d = dist(e, t) - KINDS[t.kind].r;
      if (d <= k.range) { if (e.cd <= 0) hit(B, e, k, t); return; }
      if (k.leash > 50 || d > k.range) { e.path = route(e.x, e.y, t.x, t.y); moveAlong(B, e, k); }
      return;
    }
    if (Math.hypot(e.x - e.ax, e.y - e.ay) > 3) { if (!e.path.length) e.path = route(e.x, e.y, e.ax, e.ay); moveAlong(B, e, k); }
  }

  /* Engineers: build the nearest foundation, else repair the most damaged structure, else wait at the anchor. */
  function engineer(B, e, k) {
    if (e.ordered > 0) { e.ordered -= 1; if (e.path.length) { moveAlong(B, e, k); return; } }
    let t = e.task ? byId(B, e.task) : null;
    if (!alive(t) || (t.built >= 1 && t.hp >= t.max) || t.ruined) t = null;
    if (!t) t = nearest(B, e, function (o) { return o.side === 'you' && KINDS[o.kind].bld && o.built < 1; }, 700);
    if (!t) t = nearest(B, e, function (o) { return o.side === 'you' && KINDS[o.kind].bld && !o.ruined && o.hp < o.max * 0.97; }, 900);
    e.task = t ? t.id : null;
    if (t) {
      const tk = KINDS[t.kind], d = dist(e, t) - tk.r;
      if (d > 10) { if (!e.path.length || e.retarget !== t.id) { e.path = route(e.x, e.y, t.x, t.y); e.retarget = t.id; } moveAlong(B, e, k); return; }
      e.path = [];
      if (t.built < 1) {
        // building: progress per tick is 1 / (build seconds * HZ); hit points rise with it
        const step = 1 / (tk.build * HZ);
        t.built = Math.min(1, t.built + step); t.hp = Math.min(t.max, t.hp + t.max * 0.9 * step);
        if (B.tick % 3 === 0) B.fx.push({ k: 'work', x: t.x, y: t.y, t: 3 });
      } else {
        t.hp = Math.min(t.max, t.hp + k.repair * DT);
        if (B.tick % 4 === 0) B.fx.push({ k: 'work', x: t.x, y: t.y, t: 3 });
      }
      return;
    }
    if (Math.hypot(e.x - e.ax, e.y - e.ay) > 3) { if (!e.path.length) e.path = route(e.x, e.y, e.ax, e.ay); moveAlong(B, e, k); }
  }

  /* ---------- the Company ---------- */
  function siteOf(B, goal) { return B.ents.filter(function (o) { return o.kind === goal && alive(o); })[0] || null; }
  function goalTarget(B, e) {
    let g = siteOf(B, e.goal);
    if (!g) { e.goal = 'depot'; g = siteOf(B, 'depot'); }
    return g;
  }
  function planCo(B, e) {
    const g = goalTarget(B, e), k = KINDS[e.kind];
    if (!g) return;
    if (k.air) { e.path = [{ x: g.x, y: g.y }]; return; }
    // contractors heading for the town use the ford; the rest the dam
    const c = e.goal === 'town' ? CROSSINGS[1] : CROSSINGS[0];
    e.path = side(e.x, e.y) === side(g.x, g.y) ? [{ x: g.x, y: g.y }] : routeVia(e.x, e.y, c, g.x, g.y);
  }
  function coUnit(B, e, k) {
    let t = e.target ? byId(B, e.target) : null;
    if (!alive(t) || t.ruined) t = null;
    // contractors turn on whatever of yours comes near; the convoy only on structures; drones only on their goal
    if (!t && k.aggro) t = nearest(B, e, function (o) { return o.side === 'you' && !o.ruined && (o.kind !== 'town' || e.goal === 'town'); }, k.aggro);
    if (!t && k.structures) t = nearest(B, e, function (o) { return o.side === 'you' && KINDS[o.kind].bld && !o.ruined; }, k.range + 6);
    const g = goalTarget(B, e);
    if (!t && g && dist(e, g) - KINDS[g.kind].r <= k.range + 2) t = g;
    e.target = t ? t.id : null;
    if (t) {
      const d = dist(e, t) - KINDS[t.kind].r;
      if (d <= k.range) { if (e.cd <= 0) hit(B, e, k, t); return; }
      if (k.air) { e.x += (t.x - e.x) / Math.hypot(t.x - e.x, t.y - e.y) * k.speed * DT; e.y += (t.y - e.y) / Math.hypot(t.x - e.x, t.y - e.y) * k.speed * DT; return; }
      if (side(e.x, e.y) === side(t.x, t.y) && d < 140) { e.path = [{ x: t.x, y: t.y }]; moveAlong(B, e, k); e.replan = true; return; }
    }
    if (e.replan || !e.path.length) { e.replan = false; planCo(B, e); }
    moveAlong(B, e, k);
  }

  /* keep units of a side from stacking */
  function separate(B) {
    const us = B.ents.filter(function (e) { return alive(e) && !KINDS[e.kind].bld; });
    for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) {
      const a = us[i], b = us[j];
      if (a.side !== b.side || !!KINDS[a.kind].air !== !!KINDS[b.kind].air) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = KINDS[a.kind].r + KINDS[b.kind].r;
      if (d > 0 && d < m) { const p = (m - d) / 2 * 0.5; a.x -= dx / d * p; a.y -= dy / d * p; b.x += dx / d * p; b.y += dy / d * p; }
    }
  }

  /* ---------- reading the battle ---------- */
  function frac(B, kind) { const e = B.ents.filter(function (o) { return o.kind === kind; })[0]; return e ? Math.max(0, e.hp) / e.max : 0; }
  function result(B) {
    return { over: B.over, won: B.won, seconds: Math.round(B.tick / HZ), dam: frac(B, 'dam'), town: frac(B, 'town'), depot: frac(B, 'depot'), kills: B.kills, lost: B.lost };
  }
  /* What the HUD shows about the waves: the next one, its time, and how many are left. */
  function waves(B) {
    const next = B.pending.length ? B.pending[0] : null;
    return { total: WAVES.length, done: B.wave, next: next ? next.wave + 1 : null, inSec: next ? Math.max(0, Math.ceil((next.tick - B.tick) / HZ)) : 0,
      enemies: B.ents.filter(function (e) { return e.side === 'co' && alive(e); }).length, at: WAVES.map(function (w) { return w.at; }) };
  }

  /* ---------- the bot: a fixed plan, for tests and the sim ---------- */
  const BOT_PLAN = [
    ['watchtower', 335, 255], ['barricade', 345, 300], ['watchtower', 320, 495], ['workshop', 215, 380], ['barricade', 335, 530],
    ['watchtower', 330, 350], ['watchtower', 290, 560], ['watchtower', 300, 200], ['watchtower', 260, 440], ['watchtower', 250, 330]
  ];
  const POSTS = [[325, 300], [310, 520]];
  function bot(B) {
    if (B.tick % 5) return [];
    const cmds = [];
    // new troops alternate between the dam and the ford
    B.ents.forEach(function (e) {
      if (e.side !== 'you' || (e.kind !== 'guard' && e.kind !== 'interceptor') || e.post != null) return;
      e.post = (B.posted = (B.posted || 0) + 1) % 2;
      cmds.push({ t: 'move', ids: [e.id], x: POSTS[e.post][0], y: POSTS[e.post][1] });
    });
    const have = B.ents.filter(function (e) { return e.side === 'you' && KINDS[e.kind].bld; });
    for (let i = 0; i < BOT_PLAN.length; i++) {
      const p = BOT_PLAN[i];
      if (have.some(function (e) { return e.kind === p[0] && Math.hypot(e.x - p[1], e.y - p[2]) < 4; })) continue;
      const c = canPlace(B, p[0], p[1], p[2]);
      if (c.ok) { cmds.push({ t: 'build', kind: p[0], x: p[1], y: p[2] }); return cmds; }
      if (B.supply < KINDS[p[0]].cost) break;   // save up for it, but keep training meanwhile
    }
    const ws = have.filter(function (e) { return e.kind === 'workshop' && e.built >= 1 && alive(e) && !e.queue.length; })[0];
    if (ws && B.supply >= 45) {
      const n = B.ents.filter(function (e) { return e.kind === 'guard' || e.kind === 'interceptor'; }).length;
      const kind = n % 3 === 2 ? 'interceptor' : 'guard';
      cmds.push({ t: 'train', id: ws.id, kind: kind });
    }
    return cmds;
  }

  /* Play a whole battle with the bot, without a screen. For the sim and tests. */
  function simulate(ctx, maxSec) {
    const B = setup(ctx), lim = (maxSec || 900) * HZ;
    while (!B.over && B.tick < lim) { bot(B).forEach(function (c) { command(B, c); }); step(B); }
    return result(B);
  }

  root.AmanBattle = {
    HZ: HZ, W: W, H: H, KINDS: KINDS, BUILDS: BUILDS, WAVES: WAVES, CROSSINGS: CROSSINGS, RIVER_W: RIVER_W, riverX: riverX,
    setup: setup, tune: function (o) { if (o.multAt != null) MULT_AT = o.multAt; if (o.convoyHp) KINDS.convoy.hp = o.convoyHp; }, step: step, command: command, available: available, canPlace: canPlace, result: result, waves: waves, bot: bot, simulate: simulate, byId: byId
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.AmanBattle;
})(typeof window !== 'undefined' ? window : globalThis);
