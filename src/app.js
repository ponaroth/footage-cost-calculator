/* Footage Cost Calculator
 * Plain JS, no framework. All geometry is stored in image pixel coordinates;
 * the view transform (scale + offset) only affects what is drawn on screen.
 */
(() => {
  'use strict';

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');

  // ---------- State ----------
  const STORAGE_PRICES = 'fcc.prices.v1';
  const STORAGE_CONT = 'fcc.contingency.v1';

  const state = {
    items: loadItems(),
    image: null,          // HTMLImageElement
    imageName: '',
    view: { scale: 1, ox: 0, oy: 0 },
    mode: 'draw',         // 'draw' | 'calibrate'
    calPoints: [],        // [{x,y}] image px
    feetPerPixel: null,
    runs: [],             // {id, itemId, color, points:[{x,y}], label}
    activeRunId: null,
    hover: null,          // {x,y} image px of mouse
    contingency: loadNumber(STORAGE_CONT, 30),
    nextRunId: 1,
  };

  // ---------- Storage helpers ----------
  function safeGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
  function safeSet(key, val) { try { localStorage.setItem(key, val); } catch { /* ignore */ } }
  function loadNumber(key, fallback) {
    const v = parseFloat(safeGet(key));
    return Number.isFinite(v) ? v : fallback;
  }
  function loadItems() {
    const items = window.DEFAULT_ITEMS.map((i) => ({ ...i }));
    try {
      const saved = JSON.parse(safeGet(STORAGE_PRICES) || '{}');
      for (const it of items) {
        const o = saved[it.id];
        if (o && Number.isFinite(o.price)) it.price = o.price;
        if (o && (o.unit === 'ft' || o.unit === 'ea')) it.unit = o.unit;
      }
    } catch { /* ignore bad data */ }
    return items;
  }
  function saveItems() {
    const out = {};
    for (const it of state.items) out[it.id] = { price: it.price, unit: it.unit };
    safeSet(STORAGE_PRICES, JSON.stringify(out));
  }

  // ---------- Formatting ----------
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const fmtMoney = (n) => money.format(n || 0);
  const fmtFt = (n) => `${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ft`;
  const itemById = (id) => state.items.find((i) => i.id === id);
  const activeRun = () => state.runs.find((r) => r.id === state.activeRunId) || null;

  // ---------- Measurements ----------
  function pixelLength(points) {
    let d = 0;
    for (let i = 1; i < points.length; i++) d += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    return d;
  }
  function runQuantity(run) {
    const item = itemById(run.itemId);
    if (item.unit === 'ea') return run.points.length;
    return state.feetPerPixel ? pixelLength(run.points) * state.feetPerPixel : 0;
  }
  function runCost(run) { return runQuantity(run) * itemById(run.itemId).price; }
  function runQtyText(run) {
    const item = itemById(run.itemId);
    if (item.unit === 'ea') return `${run.points.length} ea`;
    return state.feetPerPixel ? fmtFt(runQuantity(run)) : 'scale not set';
  }
  function totals() {
    const total = state.runs.reduce((s, r) => s + runCost(r), 0);
    return { total, withCont: total * (1 + (state.contingency || 0) / 100) };
  }

  // ---------- View transform ----------
  const toScreen = (p) => ({ x: p.x * state.view.scale + state.view.ox, y: p.y * state.view.scale + state.view.oy });
  const toImage = (sx, sy) => ({ x: (sx - state.view.ox) / state.view.scale, y: (sy - state.view.oy) / state.view.scale });

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const r = stage.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    canvas.style.width = r.width + 'px';
    canvas.style.height = r.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function fitView() {
    if (!state.image) return;
    const r = stage.getBoundingClientRect();
    const pad = 20;
    const s = Math.min((r.width - pad * 2) / state.image.naturalWidth, (r.height - pad * 2) / state.image.naturalHeight);
    state.view.scale = s;
    state.view.ox = (r.width - state.image.naturalWidth * s) / 2;
    state.view.oy = (r.height - state.image.naturalHeight * s) / 2;
    draw();
  }

  function zoomAt(factor, sx, sy) {
    if (!state.image) return;
    const ns = Math.min(40, Math.max(0.02, state.view.scale * factor));
    const p = toImage(sx, sy);
    state.view.scale = ns;
    state.view.ox = sx - p.x * ns;
    state.view.oy = sy - p.y * ns;
    draw();
  }
  function zoomCenter(factor) {
    const r = stage.getBoundingClientRect();
    zoomAt(factor, r.width / 2, r.height / 2);
  }

  // ---------- Drawing ----------
  // Draws runs + calibration on any context. `map` converts image px to target
  // coordinates; `u` is the size of one "screen pixel" in target units.
  function drawOverlay(c, map, u, opts = {}) {
    for (const run of state.runs) {
      const item = itemById(run.itemId);
      const pts = run.points.map(map);
      const isActive = run.id === state.activeRunId && !opts.export;
      c.strokeStyle = run.color;
      c.fillStyle = run.color;
      if (item.unit === 'ft') {
        if (pts.length > 1) {
          c.lineWidth = (isActive ? 4 : 3) * u;
          c.lineJoin = 'round';
          c.lineCap = 'round';
          c.beginPath();
          pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
          c.stroke();
        }
        for (const p of pts) { c.beginPath(); c.arc(p.x, p.y, 3.5 * u, 0, Math.PI * 2); c.fill(); }
        // rubber band to the cursor
        if (isActive && state.mode === 'draw' && state.hover && pts.length && !opts.export) {
          const last = pts[pts.length - 1];
          const h = map(state.hover);
          c.save();
          c.setLineDash([6 * u, 5 * u]);
          c.lineWidth = 2 * u;
          c.beginPath(); c.moveTo(last.x, last.y); c.lineTo(h.x, h.y); c.stroke();
          c.restore();
          if (state.feetPerPixel) {
            const seg = Math.hypot(state.hover.x - run.points[run.points.length - 1].x, state.hover.y - run.points[run.points.length - 1].y) * state.feetPerPixel;
            label(c, `+${fmtFt(seg)}`, h.x + 12 * u, h.y - 12 * u, run.color, u);
          }
        }
        if (pts.length > 1) {
          const last = pts[pts.length - 1];
          label(c, `${runLabel(run)}: ${runQtyText(run)}`, last.x + 8 * u, last.y + 18 * u, run.color, u);
        }
      } else {
        pts.forEach((p, i) => {
          c.beginPath();
          c.arc(p.x, p.y, 8 * u, 0, Math.PI * 2);
          c.fillStyle = '#ffffff';
          c.fill();
          c.lineWidth = 3 * u;
          c.stroke();
          c.fillStyle = run.color;
          c.font = `bold ${10 * u}px "Segoe UI", Arial, sans-serif`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText(String(i + 1), p.x, p.y + 0.5 * u);
          c.textAlign = 'left';
          c.textBaseline = 'alphabetic';
        });
        if (pts.length) {
          const last = pts[pts.length - 1];
          label(c, `${runLabel(run)}: ${run.points.length} ea`, last.x + 12 * u, last.y - 10 * u, run.color, u);
        }
      }
    }

    // calibration markers
    if (!opts.export && (state.mode === 'calibrate' || state.calPoints.length)) {
      const cp = state.calPoints.map(map);
      c.strokeStyle = '#f97316';
      c.lineWidth = 2 * u;
      if (cp.length === 2) {
        c.save(); c.setLineDash([8 * u, 6 * u]);
        c.beginPath(); c.moveTo(cp[0].x, cp[0].y); c.lineTo(cp[1].x, cp[1].y); c.stroke();
        c.restore();
      } else if (cp.length === 1 && state.hover && state.mode === 'calibrate') {
        const h = map(state.hover);
        c.save(); c.setLineDash([8 * u, 6 * u]);
        c.beginPath(); c.moveTo(cp[0].x, cp[0].y); c.lineTo(h.x, h.y); c.stroke();
        c.restore();
      }
      for (const p of cp) {
        const s = 8 * u;
        c.beginPath();
        c.moveTo(p.x - s, p.y - s); c.lineTo(p.x + s, p.y + s);
        c.moveTo(p.x + s, p.y - s); c.lineTo(p.x - s, p.y + s);
        c.stroke();
      }
    }
  }

  function label(c, text, x, y, color, u) {
    c.font = `600 ${12 * u}px "Segoe UI", Arial, sans-serif`;
    const w = c.measureText(text).width;
    c.fillStyle = 'rgba(255,255,255,0.88)';
    c.fillRect(x - 4 * u, y - 13 * u, w + 8 * u, 18 * u);
    c.fillStyle = color;
    c.fillText(text, x, y);
  }

  function draw() {
    const r = stage.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    if (!state.image) return;
    ctx.imageSmoothingEnabled = state.view.scale < 2;
    ctx.drawImage(state.image, state.view.ox, state.view.oy, state.image.naturalWidth * state.view.scale, state.image.naturalHeight * state.view.scale);
    drawOverlay(ctx, toScreen, 1);
    $('zoomLabel').textContent = Math.round(state.view.scale * 100) + '%';
  }

  // Full-resolution image with all runs drawn on it, for exports.
  function renderComposite(maxSide = 6000) {
    const img = state.image;
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * k);
    const h = Math.round(img.naturalHeight * k);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cc = c.getContext('2d');
    cc.fillStyle = '#fff';
    cc.fillRect(0, 0, w, h);
    cc.drawImage(img, 0, 0, w, h);
    const u = Math.max(1, Math.max(w, h) / 1000); // keep lines readable on big images
    drawOverlay(cc, (p) => ({ x: p.x * k, y: p.y * k }), u, { export: true });
    return c;
  }

  // ---------- Toast ----------
  let toastTimer = null;
  function toast(msg, ms = 2600) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    if (ms) toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }
  function hideToast() { $('toast').hidden = true; }

  // ---------- Image loading ----------
  function loadImageFromBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      state.image = img;
      state.imageName = name || 'Pasted image';
      state.runs = [];
      state.activeRunId = null;
      state.calPoints = [];
      state.feetPerPixel = null;
      state.mode = 'draw';
      $('empty').hidden = true;
      $('imageStatus').textContent = `Loaded: ${state.imageName} (${img.naturalWidth} × ${img.naturalHeight}px). Calibrate the scale next.`;
      fitView();
      refreshUI();
      toast('Image loaded. Start scale calibration next.');
    };
    img.onerror = () => toast('That file could not be opened as an image.');
    img.src = url;
  }

  function confirmReplace() {
    return !state.runs.some((r) => r.points.length) || confirm('Loading a new image clears the current runs. Continue?');
  }

  $('fileInput').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f && confirmReplace()) loadImageFromBlob(f, f.name);
    e.target.value = '';
  });

  document.addEventListener('paste', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const items = e.clipboardData ? [...e.clipboardData.items] : [];
    const imgItem = items.find((i) => i.type.startsWith('image/'));
    if (imgItem) {
      e.preventDefault();
      if (confirmReplace()) loadImageFromBlob(imgItem.getAsFile(), 'Pasted image');
    }
  });

  $('pasteBtn').addEventListener('click', async () => {
    try {
      const clip = await navigator.clipboard.read();
      for (const it of clip) {
        const type = it.types.find((t) => t.startsWith('image/'));
        if (type) {
          if (confirmReplace()) loadImageFromBlob(await it.getType(type), 'Pasted image');
          return;
        }
      }
      toast('No image found on the clipboard.');
    } catch {
      toast('Clipboard not available here. Press Ctrl+V (⌘V on Mac) instead.');
    }
  });

  stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('dragover'); });
  stage.addEventListener('dragleave', () => stage.classList.remove('dragover'));
  stage.addEventListener('drop', (e) => {
    e.preventDefault();
    stage.classList.remove('dragover');
    const f = [...(e.dataTransfer.files || [])].find((x) => x.type.startsWith('image/'));
    if (f && confirmReplace()) loadImageFromBlob(f, f.name);
  });

  // ---------- Calibration ----------
  $('calibrateBtn').addEventListener('click', () => {
    if (!state.image) return toast('Load an image first.');
    state.mode = 'calibrate';
    state.calPoints = [];
    toast('Select two points', 0);
    refreshUI();
    draw();
  });

  $('applyCalBtn').addEventListener('click', () => {
    const feet = parseFloat($('scaleFeet').value);
    if (state.calPoints.length !== 2) return toast('Pick two points on the image first.');
    if (!(feet > 0)) return toast('Enter the length in feet.');
    const px = pixelLength(state.calPoints);
    if (px < 1) return toast('The two points are too close together.');
    state.feetPerPixel = feet / px;
    state.mode = 'draw';
    state.calPoints = [];
    toast('Scale set.');
    refreshUI();
    draw();
  });

  // ---------- Runs ----------
  function runLabel(run) {
    const item = itemById(run.itemId);
    const sameItem = state.runs.filter((r) => r.itemId === run.itemId);
    return sameItem.length > 1 ? `${item.name} #${sameItem.indexOf(run) + 1}` : item.name;
  }

  function pickColor() {
    const used = new Set(state.runs.map((r) => r.color));
    return window.RUN_COLORS.find((c) => !used.has(c)) || window.RUN_COLORS[state.runs.length % window.RUN_COLORS.length];
  }

  function newRun(itemId) {
    const run = { id: state.nextRunId++, itemId, color: pickColor(), points: [] };
    state.runs.push(run);
    state.activeRunId = run.id;
    return run;
  }

  $('newRunBtn').addEventListener('click', () => {
    if (!state.image) return toast('Load an image first.');
    const cur = activeRun();
    // Reuse an empty active run of the same item rather than stacking empties.
    if (cur && !cur.points.length) cur.itemId = $('itemSelect').value;
    else newRun($('itemSelect').value);
    state.mode = 'draw';
    hideToast();
    const item = itemById($('itemSelect').value);
    toast(item.unit === 'ft' ? `Click points to draw the ${item.name} run.` : `Click to place each ${item.name}.`);
    refreshUI();
    draw();
  });

  $('itemSelect').addEventListener('change', () => {
    const cur = activeRun();
    if (cur && !cur.points.length) { cur.itemId = $('itemSelect').value; refreshUI(); draw(); }
  });

  $('runSelect').addEventListener('change', (e) => {
    state.activeRunId = Number(e.target.value) || null;
    const r = activeRun();
    if (r) $('itemSelect').value = r.itemId;
    refreshUI();
    draw();
  });

  function addPoint(p) {
    if (state.mode === 'calibrate') {
      state.calPoints.push(p);
      if (state.calPoints.length === 2) {
        state.mode = 'draw';
        toast('Now enter the length in feet and click Apply calibration.', 4000);
        $('scaleFeet').focus();
        $('scaleFeet').select();
      }
      refreshUI();
      draw();
      return;
    }
    let run = activeRun();
    const selItem = $('itemSelect').value;
    if (!run || run.itemId !== selItem) run = newRun(selItem);
    if (itemById(run.itemId).unit === 'ft' && !state.feetPerPixel && !run.points.length) {
      toast('Tip: calibrate the scale so lengths can be measured.', 3500);
    }
    run.points.push(p);
    refreshUI();
    draw();
  }

  function undoLastPoint(run = activeRun()) {
    if (state.mode === 'calibrate' && state.calPoints.length) { state.calPoints.pop(); draw(); return; }
    if (!run) {
      // fall back to the most recent run with points
      run = [...state.runs].reverse().find((r) => r.points.length);
      if (!run) return;
    }
    run.points.pop();
    refreshUI();
    draw();
  }

  function removeRun(run) {
    state.runs = state.runs.filter((r) => r !== run);
    if (state.activeRunId === run.id) state.activeRunId = state.runs.length ? state.runs[state.runs.length - 1].id : null;
    refreshUI();
    draw();
  }

  $('undoBtn').addEventListener('click', () => undoLastPoint());
  $('clearBtn').addEventListener('click', () => {
    if (!state.runs.length) return;
    if (!confirm('Remove all runs and points?')) return;
    state.runs = [];
    state.activeRunId = null;
    refreshUI();
    draw();
  });

  // ---------- Contingency ----------
  $('contingency').value = state.contingency;
  $('contingency').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    state.contingency = Number.isFinite(v) && v >= 0 ? v : 0;
    safeSet(STORAGE_CONT, String(state.contingency));
    refreshTotals();
  });

  // ---------- Sidebar rendering ----------
  function refreshItemSelect() {
    const sel = $('itemSelect');
    const cur = sel.value || '34.5kv-cable';
    sel.innerHTML = '';
    for (const it of state.items) {
      const o = document.createElement('option');
      o.value = it.id;
      o.textContent = `${it.name} (${it.price ? fmtMoney(it.price) : 'price not set'}/${it.unit})`;
      sel.appendChild(o);
    }
    sel.value = cur;
  }

  function refreshRunSelect() {
    const sel = $('runSelect');
    sel.innerHTML = '';
    if (!state.runs.length) {
      const o = document.createElement('option');
      o.textContent = 'No runs yet';
      o.value = '';
      sel.appendChild(o);
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    for (const r of state.runs) {
      const o = document.createElement('option');
      o.value = r.id;
      o.textContent = `${runLabel(r)} — ${runQtyText(r)}`;
      sel.appendChild(o);
    }
    sel.value = state.activeRunId || '';
  }

  function refreshRunList() {
    const list = $('runList');
    list.innerHTML = '';
    for (const run of state.runs) {
      const item = itemById(run.itemId);
      const el = document.createElement('div');
      el.className = 'run' + (run.id === state.activeRunId ? ' active' : '');
      el.style.setProperty('--c', run.color);

      const title = document.createElement('div');
      title.className = 'run-title';
      title.textContent = `${runLabel(run)}: ${runQtyText(run)} → ${fmtMoney(runCost(run))}`;
      el.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'run-meta';
      meta.textContent = `${fmtMoney(item.price)} per ${item.unit === 'ft' ? 'foot' : 'each'}`;
      if (!item.price) {
        const w = document.createElement('span');
        w.className = 'warn';
        w.textContent = ' · price not set';
        meta.appendChild(w);
      }
      el.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'run-actions';
      const mk = (text, cls, fn) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        if (cls) b.className = cls;
        b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
        actions.appendChild(b);
      };
      mk('Undo last point', '', () => undoLastPoint(run));
      mk('Change color', '', () => el.classList.toggle('show-colors'));
      mk('Remove', 'remove', () => removeRun(run));
      el.appendChild(actions);

      const sw = document.createElement('div');
      sw.className = 'swatches';
      for (const c of window.RUN_COLORS) {
        const s = document.createElement('span');
        s.className = 'swatch' + (c === run.color ? ' selected' : '');
        s.style.background = c;
        s.title = c;
        s.addEventListener('click', (e) => { e.stopPropagation(); run.color = c; refreshUI(); draw(); });
        sw.appendChild(s);
      }
      el.appendChild(sw);

      el.addEventListener('click', () => {
        state.activeRunId = run.id;
        $('itemSelect').value = run.itemId;
        refreshUI();
        draw();
      });
      list.appendChild(el);
    }
  }

  function refreshTotals() {
    const t = totals();
    $('totalCost').textContent = fmtMoney(t.total);
    $('totalWithCont').textContent = fmtMoney(t.withCont);
  }

  function refreshUI() {
    $('fppLabel').textContent = state.feetPerPixel ? state.feetPerPixel.toFixed(6) : 'not set';
    $('calibrateBtn').classList.toggle('active', state.mode === 'calibrate');
    refreshRunSelect();
    refreshRunList();
    refreshTotals();
  }

  // ---------- Canvas interaction ----------
  let drag = null; // {x, y, ox, oy, moved, button}
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    if (!state.image) return;
    canvas.setPointerCapture(e.pointerId);
    drag = { x: e.offsetX, y: e.offsetY, ox: state.view.ox, oy: state.view.oy, moved: false, button: e.button, space: spaceDown };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!state.image) return;
    state.hover = toImage(e.offsetX, e.offsetY);
    if (drag) {
      const dx = e.offsetX - drag.x;
      const dy = e.offsetY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 4) { drag.moved = true; canvas.classList.add('panning'); }
      if (drag.moved) { state.view.ox = drag.ox + dx; state.view.oy = drag.oy + dy; }
    }
    draw();
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const wasClick = !drag.moved && drag.button === 0 && !drag.space;
    drag = null;
    canvas.classList.remove('panning');
    if (wasClick) addPoint(toImage(e.offsetX, e.offsetY));
  });
  canvas.addEventListener('pointerleave', () => { state.hover = null; draw(); });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    zoomAt(factor, e.offsetX, e.offsetY);
  }, { passive: false });

  $('zoomIn').addEventListener('click', () => zoomCenter(1.25));
  $('zoomOut').addEventListener('click', () => zoomCenter(0.8));
  $('zoomFit').addEventListener('click', fitView);

  let spaceDown = false;
  document.addEventListener('keydown', (e) => {
    const inField = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !inField) { e.preventDefault(); undoLastPoint(); return; }
    if (inField) return;
    if (e.key === 'Escape' && state.mode === 'calibrate') { state.mode = 'draw'; state.calPoints = []; hideToast(); refreshUI(); draw(); }
    if (e.key === '+' || e.key === '=') zoomCenter(1.25);
    if (e.key === '-' || e.key === '_') zoomCenter(0.8);
    if (e.key === '0') fitView();
    if (e.key === ' ') { spaceDown = true; e.preventDefault(); }
  });
  document.addEventListener('keyup', (e) => { if (e.key === ' ') spaceDown = false; });

  window.addEventListener('resize', resizeCanvas);

  // ---------- Prices dialog ----------
  function openPrices() {
    const body = $('priceRows');
    body.innerHTML = '';
    for (const it of state.items) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td></td><td><select><option value="ft">per ft</option><option value="ea">each</option></select></td><td><input type="number" min="0" step="0.01"><span class="unset"></span></td>`;
      tr.children[0].textContent = it.name;
      tr.querySelector('select').value = it.unit;
      const inp = tr.querySelector('input');
      inp.value = it.price;
      const flag = tr.querySelector('.unset');
      const upd = () => { flag.textContent = parseFloat(inp.value) > 0 ? '' : 'not set'; };
      inp.addEventListener('input', upd);
      upd();
      tr.dataset.id = it.id;
      body.appendChild(tr);
    }
    $('pricesDialog').returnValue = '';
    $('pricesDialog').showModal();
  }
  $('pricesBtn').addEventListener('click', openPrices);
  $('pricesDialog').addEventListener('close', () => {
    if ($('pricesDialog').returnValue !== 'save') return;
    for (const tr of $('priceRows').children) {
      const it = itemById(tr.dataset.id);
      const v = parseFloat(tr.querySelector('input').value);
      it.price = Number.isFinite(v) && v >= 0 ? v : 0;
      it.unit = tr.querySelector('select').value;
    }
    saveItems();
    refreshItemSelect();
    refreshUI();
    draw();
    toast('Cost values saved.');
  });
  $('resetPricesBtn').addEventListener('click', () => {
    if (!confirm('Reset all prices and units to the built-in defaults?')) return;
    safeSet(STORAGE_PRICES, '{}');
    state.items = loadItems();
    $('pricesDialog').close('cancel');
    refreshItemSelect();
    refreshUI();
    draw();
    toast('Prices reset to defaults.');
  });

  // ---------- Export helpers ----------
  function download(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
  function baseFilename() {
    const name = ($('projectName').value || 'footage-cost-estimate').trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-');
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return `${name || 'estimate'}_${stamp}`;
  }
  function exportRows() {
    return state.runs.filter((r) => r.points.length).map((r, i) => {
      const item = itemById(r.itemId);
      return {
        n: i + 1,
        label: runLabel(r),
        item: item.name,
        unit: item.unit,
        qty: runQuantity(r),
        price: item.price,
        cost: runCost(r),
        color: r.color,
      };
    });
  }
  function canExport() {
    if (!state.image) { toast('Load an image first.'); return false; }
    return true;
  }

  // ---------- PDF ----------
  const PAPER = { letter: [11, 8.5], tabloid: [17, 11], arch: [32, 22] };
  $('pdfBtn').addEventListener('click', () => { if (canExport()) { $('pdfDialog').returnValue = ''; $('pdfDialog').showModal(); } });
  $('pdfDialog').addEventListener('close', () => {
    if ($('pdfDialog').returnValue !== 'export') return;
    const paper = $('pdfDialog').querySelector('input[name=paper]:checked').value;
    try { exportPdf(paper); } catch (err) { console.error(err); toast('PDF export failed: ' + err.message, 5000); }
  });

  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

  function exportPdf(paper) {
    const { jsPDF } = window.jspdf;
    const [W, H] = PAPER[paper];
    const doc = new jsPDF({ orientation: 'landscape', unit: 'in', format: [W, H] });
    const k = H / 8.5;                 // scale fonts/spacing with the page
    const m = 0.4 * k;                 // margin
    const panelW = Math.max(3, W * 0.27);
    const mapW = W - panelW - m * 3;
    const mapH = H - m * 2;

    // map, aspect-fit and centered in its box
    const comp = renderComposite(paper === 'arch' ? 7000 : 4500);
    const ar = comp.width / comp.height;
    let w = mapW, h = mapW / ar;
    if (h > mapH) { h = mapH; w = mapH * ar; }
    const mx = m + (mapW - w) / 2;
    const my = m + (mapH - h) / 2;
    doc.addImage(comp.toDataURL('image/jpeg', 0.92), 'JPEG', mx, my, w, h);
    doc.setDrawColor(200);
    doc.setLineWidth(0.01 * k);
    doc.rect(mx, my, w, h);

    // breakdown panel
    const px = W - panelW - m;
    let y = m + 0.2 * k;
    const rows = exportRows();
    const t = totals();
    // shrink text if there are many rows
    const needed = 2.6 * k + rows.length * 0.42 * k;
    const fit = Math.min(1, (H - m * 2) / needed);
    const fs = (n) => n * k * fit;

    doc.setTextColor(30, 58, 95);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fs(16));
    doc.text('Footage Cost Estimate', px, y);
    y += 0.3 * k * fit;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fs(9));
    doc.setTextColor(90);
    const proj = $('projectName').value.trim();
    if (proj) { doc.text(doc.splitTextToSize(proj, panelW), px, y); y += 0.2 * k * fit; }
    doc.text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), px, y);
    y += 0.2 * k * fit;
    doc.text(state.feetPerPixel ? `Scale: ${state.feetPerPixel.toFixed(5)} ft per image pixel` : 'Scale: not calibrated', px, y);
    y += 0.35 * k * fit;

    doc.setTextColor(30, 58, 95);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fs(11));
    doc.text('Cost breakdown', px, y);
    y += 0.25 * k * fit;

    for (const r of rows) {
      doc.setFillColor(...hexToRgb(r.color));
      doc.rect(px, y - 0.13 * k * fit, 0.05 * k, 0.32 * k * fit, 'F');
      doc.setTextColor(...hexToRgb(r.color));
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(fs(9.5));
      const q = r.unit === 'ft' ? (state.feetPerPixel ? fmtFt(r.qty) : 'scale not set') : `${r.qty} ea`;
      doc.text(`${r.label}: ${q}`, px + 0.12 * k, y);
      doc.text(fmtMoney(r.cost), px + panelW, y, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(fs(8));
      doc.setTextColor(110);
      doc.text(`${fmtMoney(r.price)} per ${r.unit === 'ft' ? 'ft' : 'each'}${r.price ? '' : ' (price not set)'}`, px + 0.12 * k, y + 0.15 * k * fit);
      y += 0.42 * k * fit;
    }
    if (!rows.length) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(fs(9));
      doc.setTextColor(110);
      doc.text('No runs drawn.', px, y);
      y += 0.3 * k * fit;
    }

    y += 0.1 * k * fit;
    doc.setDrawColor(200);
    doc.line(px, y, px + panelW, y);
    y += 0.3 * k * fit;
    doc.setTextColor(30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fs(11));
    doc.text('Total cost', px, y);
    doc.text(fmtMoney(t.total), px + panelW, y, { align: 'right' });
    y += 0.3 * k * fit;
    doc.setTextColor(31, 138, 76);
    doc.text(`Total + ${state.contingency}% contingency`, px, y);
    doc.text(fmtMoney(t.withCont), px + panelW, y, { align: 'right' });

    doc.save(baseFilename() + '.pdf');
  }

  // ---------- Excel ----------
  $('xlsxBtn').addEventListener('click', async () => {
    if (!canExport()) return;
    try { await exportExcel(); } catch (err) { console.error(err); toast('Excel export failed: ' + err.message, 5000); }
  });

  async function exportExcel() {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Footage Cost Calculator';
    wb.created = new Date();
    const ws = wb.addWorksheet('Estimate', { views: [{ showGridLines: false }] });
    ws.columns = [
      { key: 'n', width: 6 },
      { key: 'label', width: 30 },
      { key: 'item', width: 26 },
      { key: 'unit', width: 8 },
      { key: 'qty', width: 14 },
      { key: 'price', width: 14 },
      { key: 'cost', width: 16 },
    ];

    ws.getCell('A1').value = 'Footage Cost Estimate';
    ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF1E3A5F' } };
    ws.getCell('A2').value = $('projectName').value.trim() || '';
    ws.getCell('A3').value = `Date: ${new Date().toLocaleDateString('en-US')}`;
    ws.getCell('A4').value = state.feetPerPixel ? `Scale: ${state.feetPerPixel.toFixed(6)} ft per image pixel` : 'Scale: not calibrated';
    ws.getCell('A5').value = 'Contingency %';
    ws.getCell('C5').value = state.contingency / 100;
    ws.getCell('C5').numFmt = '0%';
    ws.getCell('C5').font = { bold: true };

    const headerRow = 7;
    const header = ws.getRow(headerRow);
    header.values = ['#', 'Run', 'Item', 'Unit', 'Quantity', 'Unit price', 'Cost'];
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }; });

    const rows = exportRows();
    rows.forEach((r, i) => {
      const rn = headerRow + 1 + i;
      const row = ws.getRow(rn);
      row.values = [r.n, r.label, r.item, r.unit, r.unit === 'ft' ? Math.round(r.qty * 100) / 100 : r.qty, r.price, { formula: `E${rn}*F${rn}`, result: r.cost }];
      row.getCell(2).font = { bold: true, color: { argb: 'FF' + r.color.slice(1).toUpperCase() } };
      row.getCell(5).numFmt = r.unit === 'ft' ? '#,##0.00' : '0';
      row.getCell(6).numFmt = '"$"#,##0.00';
      row.getCell(7).numFmt = '"$"#,##0.00';
    });

    const first = headerRow + 1;
    const last = headerRow + Math.max(rows.length, 1);
    const tRow = last + 2;
    ws.getCell(`F${tRow}`).value = 'Total cost';
    ws.getCell(`G${tRow}`).value = { formula: rows.length ? `SUM(G${first}:G${last})` : '0', result: totals().total };
    ws.getCell(`F${tRow + 1}`).value = 'Total + contingency';
    ws.getCell(`G${tRow + 1}`).value = { formula: `G${tRow}*(1+C5)`, result: totals().withCont };
    for (const r of [tRow, tRow + 1]) {
      ws.getCell(`F${r}`).font = { bold: true };
      ws.getCell(`G${r}`).font = { bold: true };
      ws.getCell(`G${r}`).numFmt = '"$"#,##0.00';
    }
    ws.getCell(`G${tRow + 1}`).font = { bold: true, color: { argb: 'FF1F8A4C' } };
    ws.getCell(`A${tRow + 3}`).value = 'Edit Quantity, Unit price or Contingency % and the costs recalculate.';
    ws.getCell(`A${tRow + 3}`).font = { italic: true, color: { argb: 'FF6B7280' } };

    // Marked-up plan on its own sheet
    const comp = renderComposite(3000);
    const dataUrl = comp.toDataURL('image/png');
    const imgId = wb.addImage({ base64: dataUrl, extension: 'png' });
    const plan = wb.addWorksheet('Plan', { views: [{ showGridLines: false }] });
    const maxW = 1400;
    const s = Math.min(1, maxW / comp.width);
    plan.addImage(imgId, { tl: { col: 0, row: 0 }, ext: { width: comp.width * s, height: comp.height * s } });

    const buf = await wb.xlsx.writeBuffer();
    download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), baseFilename() + '.xlsx');
  }

  // ---------- Init ----------
  refreshItemSelect();
  refreshUI();
  resizeCanvas();

  // Exposed for automated tests only.
  window.__fcc = { state, addPoint, toImage, toScreen, totals, runQuantity };
})();
