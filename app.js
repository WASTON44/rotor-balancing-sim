(function () {
  'use strict';

  // ---- constants (mirror the design's fixed defaults: angleSnap 5°, labels on, light theme) ----
  var DCX = 215, DCY = 180, DR = 150;
  var SW = 900, SPADL = 64, SIW = 806;
  var ANGLE_SNAP = 5;

  var COLORS = ['#2f5fc4', '#b0621d', '#8248b3', '#0f7f8c', '#b03a5b', '#5b7d1f', '#3d54a8', '#a06a10'];
  var NAMES = ['m₁', 'm₂', 'm₃', 'm₄', 'm₅', 'm₆', 'm₇', 'm₈'];

  function demoSingle() {
    return [
      { id: 'a1', m: 2, r: 0.5, a: 0, x: 0.2 },
      { id: 'a2', m: 4, r: 0.3, a: 120, x: 0.5 },
      { id: 'a3', m: 3, r: 0.4, a: 220, x: 0.8 }
    ];
  }
  function demoTwo() {
    return [
      { id: 'b1', m: 2, r: 0.4, a: 0, x: 0.3 },
      { id: 'b2', m: 3, r: 0.35, a: 100, x: 0.6 },
      { id: 'b3', m: 2.5, r: 0.3, a: 210, x: 0.9 }
    ];
  }

  var state = {
    mode: 'single',
    masses: demoSingle(),
    shaftL: 1.2, planeA: 0, planeB: 1.2, rA: 0.3, rB: 0.3,
    selected: null
  };

  var drag = null; // { type: 'disc'|'shaft', id }
  var _n = 0;
  function uid() { _n++; return 'k' + Date.now().toString(36) + _n; }

  // ---- small helpers (ported 1:1 from the design's math) ----
  function fmt(v) {
    if (!isFinite(v)) return '—';
    var a = Math.abs(v);
    var d = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3;
    var s = v.toFixed(d);
    if (d > 0) s = s.replace(/\.?0+$/, '');
    if (s === '-0') s = '0';
    return s;
  }
  function norm(a) { var x = a % 360; if (x < 0) x += 360; return x; }
  function snapA(a) { return ANGLE_SNAP > 0 ? Math.round(a / ANGLE_SNAP) * ANGLE_SNAP : a; }
  function maxR() { return Math.max(0.001, Math.max.apply(Math, state.masses.map(function (m) { return m.r; }).concat(0.5))); }

  function vecSum(items) {
    var sx = 0, sy = 0;
    for (var i = 0; i < items.length; i++) {
      sx += items[i].mag * Math.cos(items[i].a * Math.PI / 180);
      sy += items[i].mag * Math.sin(items[i].a * Math.PI / 180);
    }
    return { sx: sx, sy: sy, mag: Math.sqrt(sx * sx + sy * sy), ang: norm(Math.atan2(sy, sx) * 180 / Math.PI) };
  }

  function arrowHead(x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1, L = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / L, uy = dy / L, s = 6;
    var bx = x2 - ux * s * 1.7, by = y2 - uy * s * 1.7;
    function f(n) { return n.toFixed(1); }
    return 'M' + f(x2) + ' ' + f(y2) + ' L' + f(bx - uy * s) + ' ' + f(by + ux * s) + ' L' + f(bx + uy * s) + ' ' + f(by - ux * s) + ' Z';
  }

  // builds polygon segments scaled into a 430x360 box; items: {mag, a(deg), label, color}
  function buildPolygon(items) {
    var pts = [{ x: 0, y: 0 }];
    var cx = 0, cy = 0;
    for (var i = 0; i < items.length; i++) {
      cx += items[i].mag * Math.cos(items[i].a * Math.PI / 180);
      cy += items[i].mag * Math.sin(items[i].a * Math.PI / 180);
      pts.push({ x: cx, y: cy });
    }
    var minx = 0, maxx = 0, miny = 0, maxy = 0;
    pts.forEach(function (p) {
      minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x);
      miny = Math.min(miny, p.y); maxy = Math.max(maxy, p.y);
    });
    var w = Math.max(maxx - minx, 1e-9), h = Math.max(maxy - miny, 1e-9);
    var sc = Math.min(360 / w, 290 / h);
    var ox = 215 - (minx + w / 2) * sc, oy = 180 + (miny + h / 2) * sc;
    function X(p) { return +(ox + p.x * sc).toFixed(1); }
    function Y(p) { return +(oy - p.y * sc).toFixed(1); }
    var segs = [];
    for (var j = 0; j < items.length; j++) {
      var a = pts[j], b = pts[j + 1];
      var x1 = X(a), y1 = Y(a), x2 = X(b), y2 = Y(b);
      segs.push({
        x1: x1, y1: y1, x2: x2, y2: y2, color: items[j].color, label: items[j].label,
        head: arrowHead(x1, y1, x2, y2),
        lx: +((x1 + x2) / 2).toFixed(1), ly: +((y1 + y2) / 2 - 7).toFixed(1)
      });
    }
    var first = pts[0], last = pts[pts.length - 1];
    var res = { x1: X(last), y1: Y(last), x2: X(first), y2: Y(first) };
    res.lx = +((res.x1 + res.x2) / 2).toFixed(1);
    res.ly = +((res.y1 + res.y2) / 2 - 7).toFixed(1);
    var gap = Math.sqrt(Math.pow(last.x - first.x, 2) + Math.pow(last.y - first.y, 2));
    return { segs: segs, res: res, gap: gap };
  }

  // ---- mutations ----
  function addMass() {
    if (state.masses.length >= 8) return;
    var id = uid();
    var ang = norm((state.masses.length * 137) % 360);
    state.masses.push({ id: id, m: 1, r: 0.3, a: ang, x: state.shaftL / 2 });
    state.selected = id;
  }
  function addMassAt(clientX, clientY) {
    if (state.masses.length >= 8) return;
    var el = document.getElementById('discSvg'); if (!el) return;
    var rect = el.getBoundingClientRect();
    var sc = rect.width / 430;
    var px = (clientX - rect.left) / sc, py = (clientY - rect.top) / sc;
    var dx = px - DCX, dy = DCY - py;
    var ang = norm(snapA(Math.atan2(dy, dx) * 180 / Math.PI));
    var dist = Math.sqrt(dx * dx + dy * dy);
    var mR = maxR();
    var rad = Math.max(0.05, Math.round((dist / (DR - 18) * mR) * 100) / 100);
    var id = uid();
    state.masses.push({ id: id, m: 1, r: rad, a: ang, x: state.shaftL / 2 });
    state.selected = id;
  }
  function removeMass(id) {
    state.masses = state.masses.filter(function (m) { return m.id !== id; });
    if (state.selected === id) state.selected = null;
  }
  function resetDemo() {
    state.masses = state.mode === 'single' ? demoSingle() : demoTwo();
    state.shaftL = 1.2; state.planeA = 0; state.planeB = 1.2; state.rA = 0.3; state.rB = 0.3;
    state.selected = null;
  }

  function dragMove(e) {
    var d = drag; if (!d) return;
    if (d.type === 'disc') {
      var el = document.getElementById('discSvg'); if (!el) return;
      var rect = el.getBoundingClientRect();
      var sc = rect.width / 430;
      var px = (e.clientX - rect.left) / sc, py = (e.clientY - rect.top) / sc;
      var dx = px - DCX, dy = DCY - py;
      var ang = norm(snapA(Math.atan2(dy, dx) * 180 / Math.PI));
      var dist = Math.sqrt(dx * dx + dy * dy);
      var mR = maxR();
      var newR = Math.max(0.01, Math.round((dist / (DR - 18) * mR) * 100) / 100);
      var m = state.masses.find(function (mm) { return mm.id === d.id; });
      if (m) { m.a = ang; m.r = Math.min(newR, maxR()); }
      render();
    } else if (d.type === 'shaft') {
      var elS = document.getElementById('shaftSvg'); if (!elS) return;
      var rectS = elS.getBoundingClientRect();
      var scS = rectS.width / SW;
      var x = ((e.clientX - rectS.left) / scS - SPADL) / SIW * state.shaftL;
      x = Math.min(state.shaftL, Math.max(0, Math.round(x * 100) / 100));
      var ms = state.masses.find(function (mm) { return mm.id === d.id; });
      if (ms) ms.x = x;
      render();
    }
  }

  function handleChange(e) {
    var t = e.target;
    var field = t.dataset.field;
    if (!field) return;
    var v = parseFloat(t.value);
    if (!isFinite(v)) return;

    if (field === 'shaftL') {
      var L = Math.min(20, Math.max(0.2, v));
      state.shaftL = L;
      state.planeA = Math.min(state.planeA, L);
      state.planeB = Math.min(state.planeB, L);
      state.masses.forEach(function (m) { m.x = Math.min(m.x, L); });
    } else if (field === 'planeA' || field === 'planeB') {
      state[field] = Math.min(state.shaftL, Math.max(0, v));
    } else if (field === 'rA' || field === 'rB') {
      state[field] = Math.max(0.001, v);
    } else {
      var massId = t.dataset.massId;
      var m2 = state.masses.find(function (mm) { return mm.id === massId; });
      if (!m2) return;
      if (field === 'a') v = norm(v);
      else if (field === 'x') v = Math.min(state.shaftL, Math.max(0, v));
      else v = Math.max(0, v);
      m2[field] = v;
    }
    render();
  }

  function handleAction(el) {
    var action = el.dataset.action;
    var massId = el.dataset.massId;
    if (action === 'mode-single') { state.mode = 'single'; state.selected = null; }
    else if (action === 'mode-two') { state.mode = 'two'; state.selected = null; }
    else if (action === 'add-mass') { addMass(); }
    else if (action === 'reset-demo') { resetDemo(); }
    else if (action === 'clear-all') { state.masses = []; state.selected = null; }
    else if (action === 'del-mass') { removeMass(massId); }
    render();
  }

  // ---- derive all view values from state (ported 1:1 from the design's renderVals) ----
  function computeView() {
    var mode = state.mode, masses = state.masses, shaftL = state.shaftL,
        planeA = state.planeA, planeB = state.planeB, rA = state.rA, rB = state.rB,
        selected = state.selected;
    var isTwo = mode === 'two';
    var named = masses.map(function (m, i) {
      var o = {}; for (var k in m) o[k] = m[k];
      o.name = NAMES[i] || ('m' + (i + 1));
      o.color = COLORS[i % 8];
      return o;
    });
    var mR = maxR();

    var discMasses = named.map(function (m) {
      var rr = m.r / mR * (DR - 18);
      var x = +(DCX + rr * Math.cos(m.a * Math.PI / 180)).toFixed(1);
      var y = +(DCY - rr * Math.sin(m.a * Math.PI / 180)).toFixed(1);
      var lr = rr + 24;
      return {
        id: m.id, x: x, y: y,
        r: +(5 + Math.min(9, m.m * 1.6)).toFixed(1),
        color: m.color,
        lx: +(DCX + lr * Math.cos(m.a * Math.PI / 180)).toFixed(1),
        ly: +(DCY - lr * Math.sin(m.a * Math.PI / 180) + 4).toFixed(1),
        label: m.name + ' ' + fmt(m.m) + '·' + fmt(m.r),
        selected: selected === m.id
      };
    });

    var statusText, statusDot, solTitle, solLines = [];
    var polyItems = [], polyTitle, resLabel = '', showEq = false, showRes = false;
    var eqX = 0, eqY = 0, eqLx = 0, eqLy = 0;
    var tableHead, tableCells = [], tableCols;
    var GREEN = 'var(--reac)', INK = 'var(--ink)', AMBER = 'var(--mom)';

    if (!isTwo) {
      polyTitle = 'mr vector polygon';
      var items = named.map(function (m) { return { mag: m.m * m.r, a: m.a, label: m.name + 'r', color: m.color }; });
      polyItems = items;
      var R = vecSum(items);
      var maxMag = items.length ? Math.max.apply(Math, items.map(function (i) { return i.mag; }).concat(1e-9)) : 1e-9;
      var balanced = R.mag < 1e-6 || (items.length > 0 && R.mag / maxMag < 0.005);
      var eqAng = norm(R.ang + 180);
      statusText = masses.length === 0 ? 'Empty rotor' : balanced ? 'Statically balanced — polygon closes' : 'Out of balance — resultant mr = ' + fmt(R.mag) + ' kg·m';
      statusDot = (balanced || masses.length === 0) ? GREEN : AMBER;
      solTitle = 'Equilibrant';
      if (masses.length > 0 && !balanced) {
        showEq = true; showRes = true; resLabel = 'R = ' + fmt(R.mag);
        solLines = [
          'ΣmR·cosθ = ' + fmt(R.sx) + ' kg·m',
          'ΣmR·sinθ = ' + fmt(R.sy) + ' kg·m',
          'mr(E) = ' + fmt(R.mag) + ' kg·m  @ ' + fmt(eqAng) + '°',
          'e.g. m = ' + fmt(R.mag / Math.max(mR, 1e-9)) + ' kg at r = ' + fmt(mR) + ' m'
        ];
        var rr = DR - 18;
        eqX = +(DCX + rr * Math.cos(eqAng * Math.PI / 180)).toFixed(1);
        eqY = +(DCY - rr * Math.sin(eqAng * Math.PI / 180)).toFixed(1);
        eqLx = +(DCX + (rr - 22) * Math.cos(eqAng * Math.PI / 180)).toFixed(1);
        eqLy = +(DCY - (rr - 22) * Math.sin(eqAng * Math.PI / 180) + 4).toFixed(1);
      } else if (balanced && masses.length > 0) {
        solLines = ['No equilibrant needed — Σmr = 0.', 'Rotor is also dynamically balanced', 'at any speed (single plane).'];
      } else {
        solLines = ['Add masses to begin.'];
      }
      tableCols = 'repeat(4, minmax(90px, 1fr))';
      tableHead = ['Mass', 'm (kg)', 'r (m)', 'mr (kg·m) @ θ'];
      named.forEach(function (m) {
        tableCells.push({ text: m.name, color: m.color, w: 500 });
        tableCells.push({ text: fmt(m.m), color: INK, w: 400 });
        tableCells.push({ text: fmt(m.r), color: INK, w: 400 });
        tableCells.push({ text: fmt(m.m * m.r) + ' @ ' + fmt(m.a) + '°', color: INK, w: 400 });
      });
      if (masses.length > 0 && !balanced) {
        tableCells.push({ text: 'E', color: GREEN, w: 500 });
        tableCells.push({ text: fmt(R.mag / Math.max(mR, 1e-9)), color: GREEN, w: 500 });
        tableCells.push({ text: fmt(mR), color: GREEN, w: 500 });
        tableCells.push({ text: fmt(R.mag) + ' @ ' + fmt(eqAng) + '°', color: GREEN, w: 500 });
      }
    } else {
      polyTitle = 'mrx moment polygon (ref: plane A)';
      var rawItems = named.map(function (m) { return { mag: m.m * m.r * (m.x - planeA), a: m.a, label: m.name + 'rx', color: m.color }; });
      var vItems = rawItems.map(function (i) {
        return i.mag < 0 ? { mag: -i.mag, a: norm(i.a + 180), label: i.label + '′', color: i.color } : i;
      });
      polyItems = vItems;
      var MB = vecSum(vItems);
      var dAB = planeB - planeA;
      var okGeom = Math.abs(dAB) > 1e-6;
      var bAng = norm(MB.ang + 180);
      var mrB = okGeom ? MB.mag / dAB : 0;
      var fItems = named.map(function (m) { return { mag: m.m * m.r, a: m.a }; });
      if (okGeom && MB.mag > 1e-9) fItems.push({ mag: mrB, a: bAng });
      var FR = vecSum(fItems);
      var aAng = norm(FR.ang + 180);
      var mrA = FR.mag;
      var forceOnly = vecSum(named.map(function (m) { return { mag: m.m * m.r, a: m.a }; }));
      var balanced2 = masses.length > 0 && MB.mag < 1e-6 && forceOnly.mag < 1e-6;
      statusText = masses.length === 0 ? 'Empty rotor' : !okGeom ? 'Planes A and B coincide — separate them' : balanced2 ? 'Statically & dynamically balanced' : 'Unbalanced — corrections needed in A & B';
      statusDot = (balanced2 || masses.length === 0) ? GREEN : AMBER;
      solTitle = 'Balancing masses';
      showRes = masses.length > 0 && MB.mag > 1e-9;
      resLabel = 'ΣM = ' + fmt(MB.mag);
      if (masses.length === 0) solLines = ['Add masses to begin.'];
      else if (!okGeom) solLines = ['Move plane B away from plane A.'];
      else if (balanced2) solLines = ['No corrections needed.'];
      else solLines = [
        'Σmrx = ' + fmt(MB.mag) + ' kg·m² @ ' + fmt(MB.ang) + '°',
        'B: mr = ' + fmt(mrB) + ' kg·m @ ' + fmt(bAng) + '°',
        '   m = ' + fmt(mrB / Math.max(rB, 1e-9)) + ' kg at r = ' + fmt(rB) + ' m',
        'A: mr = ' + fmt(mrA) + ' kg·m @ ' + fmt(aAng) + '°',
        '   m = ' + fmt(mrA / Math.max(rA, 1e-9)) + ' kg at r = ' + fmt(rA) + ' m'
      ];
      tableCols = 'repeat(6, minmax(72px, 1fr))';
      tableHead = ['Plane', 'm (kg)', 'r (m)', 'θ (°)', 'x from A (m)', 'mrx (kg·m²)'];
      named.forEach(function (m) {
        tableCells.push({ text: m.name, color: m.color, w: 500 });
        tableCells.push({ text: fmt(m.m), color: INK, w: 400 });
        tableCells.push({ text: fmt(m.r), color: INK, w: 400 });
        tableCells.push({ text: fmt(m.a), color: INK, w: 400 });
        tableCells.push({ text: fmt(m.x - planeA), color: INK, w: 400 });
        tableCells.push({ text: fmt(m.m * m.r * (m.x - planeA)), color: INK, w: 400 });
      });
      if (masses.length > 0 && okGeom && !balanced2) {
        tableCells.push({ text: 'B', color: GREEN, w: 500 });
        tableCells.push({ text: fmt(mrB / Math.max(rB, 1e-9)), color: GREEN, w: 500 });
        tableCells.push({ text: fmt(rB), color: GREEN, w: 500 });
        tableCells.push({ text: fmt(bAng), color: GREEN, w: 500 });
        tableCells.push({ text: fmt(dAB), color: GREEN, w: 500 });
        tableCells.push({ text: fmt(MB.mag), color: GREEN, w: 500 });
        tableCells.push({ text: 'A', color: GREEN, w: 500 });
        tableCells.push({ text: fmt(mrA / Math.max(rA, 1e-9)), color: GREEN, w: 500 });
        tableCells.push({ text: fmt(rA), color: GREEN, w: 500 });
        tableCells.push({ text: fmt(aAng), color: GREEN, w: 500 });
        tableCells.push({ text: '0', color: GREEN, w: 500 });
        tableCells.push({ text: '0', color: GREEN, w: 500 });
      }
    }

    var poly = buildPolygon(polyItems.filter(function (i) { return i.mag > 1e-12; }));
    var polySegs = poly.segs;

    function xpx(x) { return +(SPADL + x / Math.max(shaftL, 1e-9) * SIW).toFixed(1); }
    var stStep = 0.1;
    var stepOptions = [0.1, 0.2, 0.25, 0.5, 1, 2, 5];
    for (var si = 0; si < stepOptions.length; si++) { if (shaftL / stepOptions[si] <= 13) { stStep = stepOptions[si]; break; } }
    var shaftTicks = [];
    for (var t = 0; t <= shaftL + 1e-9; t += stStep) shaftTicks.push({ px: xpx(t), label: fmt(t) });
    var shaftMasses = named.map(function (m) {
      var up = Math.sin(m.a * Math.PI / 180) >= 0;
      var len = 18 + m.r / mR * 30;
      var cy = up ? 80 - len : 80 + len;
      return {
        id: m.id, px: xpx(m.x), gx: +(xpx(m.x) - 13).toFixed(1),
        y1: 80, y2: cy, cy: cy, color: m.color,
        ly: up ? cy - 12 : cy + 20,
        label: m.name,
        selected: selected === m.id
      };
    });

    return {
      isTwo: isTwo,
      shaftL: shaftL, planeA: planeA, planeB: planeB, rA: rA, rB: rB,
      planeApx: xpx(planeA), planeBpx: xpx(planeB),
      discChip: masses.length + (masses.length === 1 ? ' mass' : ' masses') + ' · rmax ' + fmt(mR) + ' m',
      polyTitle: polyTitle, polyChip: isTwo ? 'kg·m²' : 'kg·m',
      shaftChip: 'L = ' + fmt(shaftL) + ' m',
      discMasses: discMasses, shaftMasses: shaftMasses, shaftTicks: shaftTicks,
      polySegs: polySegs, polyEmpty: polyItems.filter(function (i) { return i.mag > 1e-12; }).length === 0,
      showRes: showRes && poly.gap > 1e-9, resLabel: resLabel,
      resX1: poly.res.x1, resY1: poly.res.y1, resX2: poly.res.x2, resY2: poly.res.y2,
      resLx: poly.res.lx, resLy: poly.res.ly,
      showEq: showEq, eqX: eqX, eqY: eqY, eqLx: eqLx, eqLy: eqLy,
      statusText: statusText, statusDot: statusDot, solTitle: solTitle, solLines: solLines,
      tableCols: tableCols, tableHead: tableHead, tableCells: tableCells,
      massRows: named.map(function (m) {
        return { id: m.id, name: m.name, color: m.color, m: m.m, r: m.r, a: m.a, x: m.x, selected: selected === m.id };
      }),
      noMasses: masses.length === 0,
      hintText: isTwo
        ? 'Drag a mass along the shaft to set its axial position, or drag it on the disc to set angle and radius. The mrx polygon is taken about reference plane A; the green rows are the correction masses.'
        : 'Double-click the disc to add a mass; drag a mass to set its angle and radius. The green marker E is the equilibrant — the single mass that closes the mr polygon.'
    };
  }

  // ---- HTML/SVG templating ----
  function discSvgContent(V) {
    var out = '';
    out += '<circle cx="215" cy="180" r="150" style="fill:var(--bg);stroke:var(--line);stroke-width:1.4"></circle>';
    out += '<line x1="65" y1="180" x2="365" y2="180" style="stroke:var(--grid);stroke-width:1"></line>';
    out += '<line x1="215" y1="30" x2="215" y2="330" style="stroke:var(--grid);stroke-width:1"></line>';
    out += '<text x="372" y="184" style="fill:var(--muted);font:10px \'IBM Plex Mono\',monospace">0°</text>';
    out += '<text x="215" y="22" text-anchor="middle" style="fill:var(--muted);font:10px \'IBM Plex Mono\',monospace">90°</text>';
    out += '<circle cx="215" cy="180" r="5" style="fill:var(--panel);stroke:var(--ink);stroke-width:1.6"></circle>';
    V.discMasses.forEach(function (dm) {
      out += '<g data-mass-group="' + dm.id + '" class="mass-group">';
      out += '<line x1="215" y1="180" x2="' + dm.x + '" y2="' + dm.y + '" style="stroke:' + dm.color + ';stroke-width:1.4;stroke-dasharray:3 3;opacity:.55"></line>';
      if (dm.selected) out += '<circle cx="' + dm.x + '" cy="' + dm.y + '" r="20" style="fill:var(--acc);opacity:.12"></circle>';
      out += '<circle cx="' + dm.x + '" cy="' + dm.y + '" r="' + dm.r + '" style="fill:' + dm.color + ';stroke:var(--panel);stroke-width:2"></circle>';
      out += '<text x="' + dm.lx + '" y="' + dm.ly + '" text-anchor="middle" style="fill:' + dm.color + ';font:500 11px \'IBM Plex Mono\',monospace">' + dm.label + '</text>';
      out += '<circle cx="' + dm.x + '" cy="' + dm.y + '" r="18" style="fill:transparent"></circle>';
      out += '</g>';
    });
    if (V.showEq) {
      out += '<line x1="215" y1="180" x2="' + V.eqX + '" y2="' + V.eqY + '" style="stroke:var(--reac);stroke-width:2"></line>';
      out += '<circle cx="' + V.eqX + '" cy="' + V.eqY + '" r="8" style="fill:var(--panel);stroke:var(--reac);stroke-width:2;stroke-dasharray:3 2"></circle>';
      out += '<text x="' + V.eqLx + '" y="' + V.eqLy + '" text-anchor="middle" style="fill:var(--reac);font:500 11px \'IBM Plex Mono\',monospace">E</text>';
    }
    return out;
  }

  function polySvgContent(V) {
    var out = '';
    V.polySegs.forEach(function (ps) {
      out += '<line x1="' + ps.x1 + '" y1="' + ps.y1 + '" x2="' + ps.x2 + '" y2="' + ps.y2 + '" style="stroke:' + ps.color + ';stroke-width:2;stroke-linecap:round"></line>';
      out += '<path d="' + ps.head + '" style="fill:' + ps.color + '"></path>';
      out += '<text x="' + ps.lx + '" y="' + ps.ly + '" text-anchor="middle" style="fill:' + ps.color + ';font:500 10.5px \'IBM Plex Mono\',monospace">' + ps.label + '</text>';
    });
    if (V.showRes) {
      out += '<line x1="' + V.resX1 + '" y1="' + V.resY1 + '" x2="' + V.resX2 + '" y2="' + V.resY2 + '" style="stroke:var(--reac);stroke-width:2;stroke-dasharray:5 4"></line>';
      out += '<text x="' + V.resLx + '" y="' + V.resLy + '" text-anchor="middle" style="fill:var(--reac);font:500 10.5px \'IBM Plex Mono\',monospace">' + V.resLabel + '</text>';
    }
    if (V.polyEmpty) {
      out += '<text x="215" y="184" text-anchor="middle" style="fill:var(--muted);font:12px \'IBM Plex Sans\',sans-serif">Add masses to draw the polygon</text>';
    }
    return out;
  }

  function shaftSvgContent(V) {
    var out = '';
    V.shaftTicks.forEach(function (t) {
      out += '<line x1="' + t.px + '" x2="' + t.px + '" y1="20" y2="140" style="stroke:var(--grid);stroke-width:1"></line>';
      out += '<text x="' + t.px + '" y="156" text-anchor="middle" style="fill:var(--muted);font:10px \'IBM Plex Mono\',monospace">' + t.label + '</text>';
    });
    out += '<rect x="64" y="74" width="806" height="12" rx="2" style="fill:var(--beam)"></rect>';
    out += '<line x1="' + V.planeApx + '" y1="24" x2="' + V.planeApx + '" y2="136" style="stroke:var(--reac);stroke-width:1.6;stroke-dasharray:5 4"></line>';
    out += '<text x="' + V.planeApx + '" y="16" text-anchor="middle" style="fill:var(--reac);font:500 11px \'IBM Plex Mono\',monospace">A (ref)</text>';
    out += '<line x1="' + V.planeBpx + '" y1="24" x2="' + V.planeBpx + '" y2="136" style="stroke:var(--reac);stroke-width:1.6;stroke-dasharray:5 4"></line>';
    out += '<text x="' + V.planeBpx + '" y="16" text-anchor="middle" style="fill:var(--reac);font:500 11px \'IBM Plex Mono\',monospace">B</text>';
    V.shaftMasses.forEach(function (sm) {
      out += '<g data-mass-group="' + sm.id + '" class="mass-group">';
      if (sm.selected) out += '<rect x="' + sm.gx + '" y="30" width="26" height="100" rx="9" style="fill:var(--acc);opacity:.12"></rect>';
      out += '<line x1="' + sm.px + '" x2="' + sm.px + '" y1="' + sm.y1 + '" y2="' + sm.y2 + '" style="stroke:' + sm.color + ';stroke-width:2"></line>';
      out += '<circle cx="' + sm.px + '" cy="' + sm.cy + '" r="7" style="fill:' + sm.color + ';stroke:var(--panel);stroke-width:2"></circle>';
      out += '<text x="' + sm.px + '" y="' + sm.ly + '" text-anchor="middle" style="fill:' + sm.color + ';font:500 11px \'IBM Plex Mono\',monospace">' + sm.label + '</text>';
      out += '<rect x="' + sm.gx + '" y="26" width="26" height="108" style="fill:transparent"></rect>';
      out += '</g>';
    });
    return out;
  }

  function massRowHTML(mr, isTwo) {
    var html = '<div class="mass-row" data-mass-row="' + mr.id + '">';
    html += '<span class="mass-color" style="background:' + mr.color + '"></span>';
    html += '<span class="mass-name" style="color:' + mr.color + '">' + mr.name + '</span>';
    html += '<span class="unit-mono">kg</span>';
    html += '<input type="number" class="mass-input w-m" value="' + mr.m + '" data-field="m" data-mass-id="' + mr.id + '" min="0" step="0.1">';
    html += '<span class="unit-mono">r</span>';
    html += '<input type="number" class="mass-input w-r" value="' + mr.r + '" data-field="r" data-mass-id="' + mr.id + '" min="0" step="0.01">';
    html += '<span class="unit-mono">θ°</span>';
    html += '<input type="number" class="mass-input w-a" value="' + mr.a + '" data-field="a" data-mass-id="' + mr.id + '" step="1">';
    if (isTwo) {
      html += '<span class="unit-mono">x</span>';
      html += '<input type="number" class="mass-input w-x" value="' + mr.x + '" data-field="x" data-mass-id="' + mr.id + '" min="0" step="0.05">';
    }
    html += '<button type="button" class="mass-del" data-action="del-mass" data-mass-id="' + mr.id + '">×</button>';
    html += '</div>';
    return html;
  }

  function buildTemplate(V) {
    var html = '';
    html += '<div class="app-inner">';

    html += '<div class="header-row">';
    html += '<div class="header-left">';
    html += '<span class="header-title">Balancing Lab</span>';
    html += '<span class="header-sub">static &amp; dynamic balance of rotating masses, live</span>';
    html += '</div>';
    html += '<span class="header-units">kg · m · deg from +x, CCW positive</span>';
    html += '</div>';

    html += '<div class="toolbar">';
    html += '<div class="tabs">';
    html += '<button type="button" class="tab' + (!V.isTwo ? ' active' : '') + '" data-action="mode-single">Single plane</button>';
    html += '<button type="button" class="tab' + (V.isTwo ? ' active' : '') + '" data-action="mode-two">Two planes</button>';
    html += '</div>';
    html += '<div class="masses-label-group">';
    html += '<span class="label-caps">Masses</span>';
    html += '<button type="button" class="btn" data-action="add-mass">＋ Add mass</button>';
    html += '</div>';
    html += '<div class="spacer"></div>';
    if (V.isTwo) {
      html += '<div class="shaft-len-group">';
      html += '<span class="label-caps">Shaft</span>';
      html += '<input type="number" class="input-mono shaft-len-input" value="' + V.shaftL + '" data-field="shaftL" min="0.2" max="20" step="0.1">';
      html += '<span class="unit-mono">m</span>';
      html += '</div>';
    }
    html += '<div class="toolbar-right">';
    html += '<button type="button" class="btn btn-muted" data-action="reset-demo">Reset demo</button>';
    html += '<button type="button" class="btn btn-muted btn-danger-hover" data-action="clear-all">Clear</button>';
    html += '</div>';
    html += '</div>';

    html += '<div class="grid-main">';
    html += '<div class="col-left">';

    html += '<div class="row-panels">';
    html += '<div class="panel">';
    html += '<div class="panel-head"><div class="panel-head-left"><span class="dot dot-beam"></span><span class="panel-title">Rotor end view</span></div><span class="chip">' + V.discChip + '</span></div>';
    html += '<svg id="discSvg" width="430" height="360" viewBox="0 0 430 360" class="svg-disc">' + discSvgContent(V) + '</svg>';
    html += '</div>';
    html += '<div class="panel">';
    html += '<div class="panel-head"><div class="panel-head-left"><span class="dot dot-acc"></span><span class="panel-title">' + V.polyTitle + '</span></div><span class="chip">' + V.polyChip + '</span></div>';
    html += '<svg width="430" height="360" viewBox="0 0 430 360" class="svg-poly">' + polySvgContent(V) + '</svg>';
    html += '</div>';
    html += '</div>';

    if (V.isTwo) {
      html += '<div class="panel">';
      html += '<div class="panel-head"><div class="panel-head-left"><span class="dot dot-beam"></span><span class="panel-title">Shaft side view · correction planes A &amp; B</span></div><span class="chip">' + V.shaftChip + '</span></div>';
      html += '<svg id="shaftSvg" width="900" height="170" viewBox="0 0 900 170" class="svg-shaft">' + shaftSvgContent(V) + '</svg>';
      html += '</div>';
    }

    html += '<div class="panel table-panel">';
    html += '<div class="panel-head-left small-gap"><span class="dot dot-mom"></span><span class="panel-title">Tabular method</span></div>';
    html += '<div class="table-wrap"><div class="table-grid" style="grid-template-columns:' + V.tableCols + '">';
    V.tableHead.forEach(function (h) { html += '<div class="th">' + h + '</div>'; });
    V.tableCells.forEach(function (c) { html += '<div class="td" style="color:' + c.color + ';font-weight:' + c.w + '">' + c.text + '</div>'; });
    html += '</div></div>';
    html += '</div>';

    html += '</div>'; // .col-left

    html += '<div class="col-right">';

    html += '<div class="panel status-panel">';
    html += '<div class="status-row"><span class="status-dot" style="background:' + V.statusDot + '"></span><span class="status-text">' + V.statusText + '</span></div>';
    html += '<div class="sol-title">' + V.solTitle + '</div>';
    html += '<div class="sol-lines">';
    V.solLines.forEach(function (l) { html += '<div class="sol-line">' + l + '</div>'; });
    html += '</div>';
    html += '</div>';

    html += '<div class="panel masses-panel">';
    html += '<div class="label-caps">Masses</div>';
    V.massRows.forEach(function (mr) { html += massRowHTML(mr, V.isTwo); });
    if (V.noMasses) html += '<div class="empty-msg">No masses — add one, or double-click the disc.</div>';
    html += '</div>';

    if (V.isTwo) {
      html += '<div class="panel planes-panel">';
      html += '<div class="label-caps">Correction planes</div>';
      html += '<div class="plane-row"><span class="plane-label">A</span><span class="unit-mono">x</span>';
      html += '<input type="number" class="plane-input" value="' + V.planeA + '" data-field="planeA" min="0" step="0.05">';
      html += '<span class="unit-mono">m · r</span>';
      html += '<input type="number" class="plane-input" value="' + V.rA + '" data-field="rA" min="0.001" step="0.01">';
      html += '<span class="unit-mono">m</span></div>';
      html += '<div class="plane-row"><span class="plane-label">B</span><span class="unit-mono">x</span>';
      html += '<input type="number" class="plane-input" value="' + V.planeB + '" data-field="planeB" min="0" step="0.05">';
      html += '<span class="unit-mono">m · r</span>';
      html += '<input type="number" class="plane-input" value="' + V.rB + '" data-field="rB" min="0.001" step="0.01">';
      html += '<span class="unit-mono">m</span></div>';
      html += '</div>';
    }

    html += '<div class="hint">' + V.hintText + '</div>';

    html += '</div>'; // .col-right
    html += '</div>'; // .grid-main
    html += '</div>'; // .app-inner
    return html;
  }

  var app;
  function render() {
    app.innerHTML = buildTemplate(computeView());
  }

  function init() {
    app = document.getElementById('app');

    app.addEventListener('click', function (e) {
      var actionEl = e.target.closest('[data-action]');
      if (actionEl) { handleAction(actionEl); return; }

      var massGroup = e.target.closest('[data-mass-group]');
      if (massGroup) {
        var gid = massGroup.getAttribute('data-mass-group');
        if (state.selected !== gid) { state.selected = gid; render(); }
        return;
      }
      var massRow = e.target.closest('[data-mass-row]');
      if (massRow) {
        var rid = massRow.getAttribute('data-mass-row');
        if (state.selected !== rid) { state.selected = rid; render(); }
        return;
      }
      if (e.target.closest('#discSvg') || e.target.closest('#shaftSvg')) {
        if (state.selected) { state.selected = null; render(); }
      }
    });

    app.addEventListener('dblclick', function (e) {
      if (!e.target.closest('#discSvg')) return;
      if (e.target.closest('[data-mass-group]')) return;
      addMassAt(e.clientX, e.clientY);
      render();
    });

    app.addEventListener('pointerdown', function (e) {
      var g = e.target.closest('[data-mass-group]');
      if (!g) return;
      var id = g.getAttribute('data-mass-group');
      var type = g.closest('#discSvg') ? 'disc' : 'shaft';
      drag = { type: type, id: id };
    });

    app.addEventListener('change', function (e) {
      if (e.target.tagName === 'INPUT') handleChange(e);
    });

    window.addEventListener('pointermove', dragMove);
    window.addEventListener('pointerup', function () { drag = null; });

    render();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
