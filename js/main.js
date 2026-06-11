/* PatientMap engine — node-map exploration, drag highlighted evidence into
   the BEFAST chart (phase 1), then build the SBAR handoff (phase 2).
   A simulated clock scores both phases. No dependencies. */

(function () {
  'use strict';

  const CASE = CASE_001;
  const BEFAST = CASE_BEFAST_INFO;
  const SBAR = CASE_SBAR_INFO;
  const LETTERS = ['B', 'E', 'F', 'A', 'S', 'T'];
  const SBAR_LETTERS = ['S', 'B', 'A', 'R'];
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const TYPE_CLASS = {
    scene: 'type-scene', dialogue: 'type-dialogue', exam: 'type-exam', test: 'type-test',
  };
  const TYPE_LABEL = {
    scene: 'Scene', dialogue: 'Dialogue', exam: 'Exam', test: 'Test',
  };
  // simulated minutes each action costs when first performed
  const TYPE_COST = { scene: 1, dialogue: 2, exam: 4, test: 5 };
  const PENALTY_REJECTED_ALERT = 5;
  const PENALTY_REJECTED_HANDOFF = 3;

  /* ----------------------------- chip registry -------------------------- */

  const chipById = {};
  const chipsByNode = {};
  Object.values(CASE.nodes).forEach((n) => {
    chipsByNode[n.id] = (n.chips || []).map((c, i) => {
      const chip = {
        id: `${n.id}#${i}`, node: n.id, text: c.text,
        befast: c.befast, sbar: c.sbar,
        decisive: !!c.decisive, required: !!c.required,
        gap: c.gap || '', note: c.note || '',
      };
      chipById[chip.id] = chip;
      return chip;
    });
  });

  /* ------------------------------ game state ---------------------------- */

  const state = {
    phase: 1,                 // 1 = BEFAST recognition, 2 = SBAR handoff
    minutes: 0,               // simulated bedside clock
    alertMinutes: null,       // clock value when the alert was accepted
    discovered: new Set(),
    unlocked: new Set(),
    selectedNode: null,
    befastPlacements: {},     // chipId -> 'B'|'E'|'F'|'A'|'S'|'T'|'NOTES'
    sbarPlacements: {},       // chipId -> 'S'|'B'|'A'|'R'|'NOTES'
  };

  function placements() { return state.phase === 1 ? state.befastPlacements : state.sbarPlacements; }
  function correctZone(chip) {
    const home = state.phase === 1 ? chip.befast : chip.sbar;
    return home === null || home === undefined ? 'NOTES' : home;
  }
  function isPlacedCorrect(chip) { return placements()[chip.id] === correctZone(chip); }

  function collectedChips() {
    const out = [];
    state.discovered.forEach((nid) => { chipsByNode[nid].forEach((c) => out.push(c)); });
    return out;
  }
  function chipsInZone(zone) { return collectedChips().filter((c) => placements()[c.id] === zone); }
  function correctBefastLetters() {
    const s = new Set();
    collectedChips().forEach((c) => {
      if (c.befast && state.befastPlacements[c.id] === c.befast) s.add(c.befast);
    });
    return s;
  }
  function decisiveFiled() {
    return collectedChips().some((c) => c.decisive && state.befastPlacements[c.id] === c.befast);
  }
  function misplacedChips() {
    return collectedChips().filter((c) => placements()[c.id] && !isPlacedCorrect(c));
  }
  function unplacedCountForNode(id) {
    if (!state.discovered.has(id)) return 0;
    return chipsByNode[id].filter((c) => !placements()[c.id]).length;
  }
  function stars(time, thresholds) {
    return time <= thresholds[0] ? 3 : time <= thresholds[1] ? 2 : 1;
  }
  function starStr(n) { return '★'.repeat(n) + '☆'.repeat(3 - n); }

  /* ------------------------------- layout ------------------------------- */

  const X_GAP = 235, Y_GAP = 115;
  const positions = {}, parentOf = {};
  (function layout() {
    Object.values(CASE.nodes).forEach((n) => (n.unlocks || []).forEach((c) => { parentOf[c] = n.id; }));
    let nextLeafY = 0;
    function place(id, depth) {
      const kids = CASE.nodes[id].unlocks || [];
      let y;
      if (!kids.length) { y = nextLeafY; nextLeafY += Y_GAP; }
      else { const ys = kids.map((k) => place(k, depth + 1)); y = (Math.min(...ys) + Math.max(...ys)) / 2; }
      positions[id] = { x: depth * X_GAP, y };
      return y;
    }
    place(CASE.rootId, 0);
  })();

  /* ------------------------------ DOM refs ------------------------------ */

  const svg = document.getElementById('map');
  const edgeLayer = document.createElementNS(SVG_NS, 'g');
  const nodeLayer = document.createElementNS(SVG_NS, 'g');
  svg.appendChild(edgeLayer); svg.appendChild(nodeLayer);

  const stage = document.getElementById('stage');
  const stageFigure = document.getElementById('stage-figure');
  const convoBody = document.getElementById('convo-body');
  const boardEl = document.getElementById('befast-board');
  const panelTitle = document.getElementById('panel-title');
  const notesZone = document.getElementById('notes-zone');
  const clockEl = document.getElementById('clock-value');
  const phaseEl = document.getElementById('phase-label');
  const alertBtn = document.getElementById('stroke-alert-btn');
  const toastEl = document.getElementById('toast');
  const ghost = document.getElementById('drag-ghost');
  const backdrop = document.getElementById('modal-backdrop');
  const modalContent = document.getElementById('modal-content');
  const modalActions = document.getElementById('modal-actions');

  stageFigure.src = CASE.patient.portrait;
  document.getElementById('patient-thumb').src = CASE.patient.portrait;
  document.getElementById('patient-name').textContent = CASE.patient.name;
  document.getElementById('patient-dob').textContent = CASE.patient.dob;

  document.getElementById('convo-close').addEventListener('click', closeStage);

  /* ------------------------------- clock -------------------------------- */

  function addMinutes(n) {
    state.minutes += n;
    renderClock();
  }
  function renderClock() {
    clockEl.textContent = state.minutes;
    phaseEl.textContent = state.phase === 1 ? 'recognition' : 'handoff prep';
  }

  /* ----------------------------- pan & zoom ----------------------------- */

  const view = { x: 0, y: 0, w: 1000, h: 700 };
  let viewAnim = null;
  function applyView() { svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`); }

  function contentBounds() {
    const ids = [...state.discovered, ...state.unlocked];
    const xs = ids.map((id) => positions[id].x), ys = ids.map((id) => positions[id].y);
    const pad = 130;
    return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + pad * 2 };
  }
  function fitView(animate) {
    const rect = svg.getBoundingClientRect();
    const b = contentBounds();
    const aspect = rect.width / Math.max(rect.height, 1);
    let w = b.w, h = b.h;
    if (w / h > aspect) h = w / aspect; else w = h * aspect;
    if (w < 520) { h *= 520 / w; w = 520; }
    const target = { x: b.x + (b.w - w) / 2, y: b.y + (b.h - h) / 2, w, h };
    if (!animate) { Object.assign(view, target); applyView(); return; }
    if (viewAnim) cancelAnimationFrame(viewAnim);
    const from = { ...view }, t0 = performance.now(), DUR = 450;
    (function step(now) {
      const t = Math.min((now - t0) / DUR, 1), e = 1 - Math.pow(1 - t, 3);
      view.x = from.x + (target.x - from.x) * e; view.y = from.y + (target.y - from.y) * e;
      view.w = from.w + (target.w - from.w) * e; view.h = from.h + (target.h - from.h) * e;
      applyView();
      if (t < 1) viewAnim = requestAnimationFrame(step);
    })(t0);
  }

  function isNodeTarget(el) {
    while (el && el !== svg) { if (el.classList && el.classList.contains('node')) return true; el = el.parentNode; }
    return false;
  }
  function attachNodePointer(g, id) {
    let down = null;
    g.addEventListener('pointerdown', (e) => { e.stopPropagation(); down = { x: e.clientX, y: e.clientY }; });
    g.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      if (!down) return;
      const moved = Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y);
      down = null;
      if (moved <= 8) onNodeClick(id);
    });
    g.addEventListener('pointercancel', () => { down = null; });
  }

  let panning = false, panStart = null;
  svg.addEventListener('pointerdown', (e) => {
    if (isNodeTarget(e.target)) return;
    panning = true;
    panStart = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y };
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', (e) => {
    if (!panning) return;
    const rect = svg.getBoundingClientRect();
    if (viewAnim) cancelAnimationFrame(viewAnim);
    view.x = panStart.vx - (e.clientX - panStart.px) * (view.w / rect.width);
    view.y = panStart.vy - (e.clientY - panStart.py) * (view.h / rect.height);
    applyView();
  });
  svg.addEventListener('pointerup', (e) => {
    if (!panning) return;
    panning = false;
    if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
  });
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (viewAnim) cancelAnimationFrame(viewAnim);
    const rect = svg.getBoundingClientRect();
    const mx = view.x + ((e.clientX - rect.left) / rect.width) * view.w;
    const my = view.y + ((e.clientY - rect.top) / rect.height) * view.h;
    const k = e.deltaY > 0 ? 1.12 : 1 / 1.12;
    const w = Math.min(Math.max(view.w * k, 400), 6000), ratio = w / view.w;
    view.x = mx - (mx - view.x) * ratio; view.y = my - (my - view.y) * ratio;
    view.w = w; view.h *= ratio; applyView();
  }, { passive: false });

  /* ----------------------------- map render ----------------------------- */

  function edgePath(a, b) {
    const midX = (a.x + b.x) / 2;
    return `M ${a.x} ${a.y} C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x} ${b.y}`;
  }

  function renderMap() {
    edgeLayer.innerHTML = ''; nodeLayer.innerHTML = '';
    const visible = new Set([...state.discovered, ...state.unlocked]);

    visible.forEach((id) => {
      const p = parentOf[id];
      if (!p || !visible.has(p)) return;
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', edgePath(positions[p], positions[id]));
      path.setAttribute('class', 'edge' + (state.discovered.has(id) ? ' edge-active' : ''));
      edgeLayer.appendChild(path);
    });

    visible.forEach((id) => {
      const node = CASE.nodes[id];
      const pos = positions[id];
      const isDiscovered = state.discovered.has(id);
      const g = document.createElementNS(SVG_NS, 'g');
      let cls = `node ${TYPE_CLASS[node.type]} ${isDiscovered ? 'discovered' : 'locked'}`;
      if (state.selectedNode === id) cls += ' selected';
      g.setAttribute('class', cls);
      g.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);

      const hit = document.createElementNS(SVG_NS, 'circle');
      hit.setAttribute('r', 48); hit.setAttribute('class', 'node-hit'); g.appendChild(hit);

      const halo = document.createElementNS(SVG_NS, 'circle');
      halo.setAttribute('r', 38); halo.setAttribute('class', 'node-halo'); g.appendChild(halo);

      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('r', 30); circle.setAttribute('class', 'node-circle'); g.appendChild(circle);

      const icon = document.createElementNS(SVG_NS, 'text');
      icon.setAttribute('class', 'node-icon');
      icon.setAttribute('text-anchor', 'middle'); icon.setAttribute('dominant-baseline', 'central');
      icon.textContent = isDiscovered ? node.icon : '?';
      g.appendChild(icon);

      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('class', 'node-label');
      label.setAttribute('text-anchor', 'middle'); label.setAttribute('y', 50);
      label.textContent = isDiscovered ? node.title : node.actionLabel;
      g.appendChild(label);

      if (isDiscovered && chipsByNode[id].length) {
        const unplaced = unplacedCountForNode(id);
        const badge = document.createElementNS(SVG_NS, 'g');
        badge.setAttribute('class', 'node-badge ' + (unplaced ? 'pending' : 'done'));
        badge.setAttribute('transform', 'translate(24, -24)');
        const bc = document.createElementNS(SVG_NS, 'circle'); bc.setAttribute('r', 11); badge.appendChild(bc);
        const bt = document.createElementNS(SVG_NS, 'text');
        bt.setAttribute('text-anchor', 'middle'); bt.setAttribute('dominant-baseline', 'central');
        bt.textContent = unplaced ? String(unplaced) : '✓';
        badge.appendChild(bt);
        g.appendChild(badge);
      }

      attachNodePointer(g, id);
      nodeLayer.appendChild(g);
    });
  }

  /* ---------------------------- node behavior --------------------------- */

  function onNodeClick(id) {
    const first = !state.discovered.has(id);
    if (first) {
      state.unlocked.delete(id);
      state.discovered.add(id);
      addMinutes(TYPE_COST[CASE.nodes[id].type] || 2);
      (CASE.nodes[id].unlocks || []).forEach((c) => {
        if (state.discovered.has(c)) return;
        if ((CASE.nodes[c].phase || 1) > state.phase) return;  // phase-gated
        state.unlocked.add(c);
      });
      const n = chipsByNode[id].length;
      if (n) toast(`${n} highlighted phrase${n === 1 ? '' : 's'} to drag into the chart.`);
    }
    state.selectedNode = id;
    openStage(id, first);
    renderMap();
    renderBoard();
    if (first) fitView(true);
  }

  function escapeHtml(s) {
    return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  function blockHtml(nodeId, text, replaced) {
    let html = escapeHtml(text);
    chipsByNode[nodeId].forEach((chip) => {
      if (replaced.has(chip.id)) return;
      const esc = escapeHtml(chip.text);
      const idx = html.indexOf(esc);
      if (idx === -1) return;
      const placed = !!placements()[chip.id];
      const span = `<span class="chip${placed ? ' chip-filed' : ''}" data-chip="${chip.id}">${esc}</span>`;
      html = html.slice(0, idx) + span + html.slice(idx + esc.length);
      replaced.add(chip.id);
    });
    return html;
  }

  function openStage(id, justDiscovered) {
    const node = CASE.nodes[id];
    const frag = document.createDocumentFragment();

    const head = document.createElement('div');
    head.className = 'convo-head';
    head.innerHTML =
      `<span class="convo-icon">${node.icon}</span>` +
      `<div><h2>${node.title}</h2>` +
      `<span class="node-type-pill ${TYPE_CLASS[node.type]}">${TYPE_LABEL[node.type]}</span>` +
      (justDiscovered ? '' : '<span class="revisit-pill">revisited</span>') +
      `</div>`;
    frag.appendChild(head);

    const replaced = new Set();
    node.content.forEach((block) => {
      const p = document.createElement('p');
      p.className = `block block-${block.kind}`;
      if (block.kind === 'narrate') p.textContent = block.text;
      else p.innerHTML = blockHtml(id, block.text, replaced);
      frag.appendChild(p);
    });

    const kids = (node.unlocks || []).filter((cid) => (CASE.nodes[cid].phase || 1) <= state.phase);
    if (kids.length) {
      const h = document.createElement('h3');
      h.className = 'choices-heading'; h.textContent = 'Available actions';
      frag.appendChild(h);
      kids.forEach((cid) => {
        const child = CASE.nodes[cid];
        const done = state.discovered.has(cid);
        const btn = document.createElement('button');
        btn.className = 'choice-btn' + (done ? ' done' : '');
        btn.innerHTML = `<span class="choice-icon">${done ? child.icon : '?'}</span>` +
          `<span>${child.actionLabel}</span>` +
          `<span class="choice-cost">${done ? '✓' : '+' + (TYPE_COST[child.type] || 2) + ' min'}</span>`;
        btn.addEventListener('click', () => onNodeClick(cid));
        frag.appendChild(btn);
      });
    } else {
      const p = document.createElement('p');
      p.className = 'panel-help';
      p.textContent = 'No further actions branch from here. Revisit other nodes on the map to keep investigating.';
      frag.appendChild(p);
    }

    convoBody.innerHTML = '';
    convoBody.appendChild(frag);
    convoBody.scrollTop = 0;
    stage.classList.remove('hidden');
  }

  function closeStage() {
    stage.classList.add('hidden');
    state.selectedNode = null;
    renderMap();
  }

  /* ------------------------- evidence board (panel) ---------------------- */

  function renderBoard() {
    boardEl.innerHTML = '';
    if (state.phase === 1) renderBefastBoard();
    else renderSbarBoard();

    const tc = notesZone.querySelector('.zone-chips');
    tc.innerHTML = '';
    chipsInZone('NOTES').forEach((c) => tc.appendChild(placedChipEl(c)));
  }

  function renderBefastBoard() {
    panelTitle.textContent = 'Patient History & Notes';
    const correct = correctBefastLetters();
    LETTERS.forEach((L) => {
      const row = document.createElement('div');
      row.className = 'befast-row' + (correct.has(L) ? ' satisfied' : '');
      const letter = document.createElement('div');
      letter.className = 'befast-letter';
      letter.innerHTML = `<span class="bl">${L}</span><span class="bw">${BEFAST[L].word}</span>`;
      row.appendChild(letter);
      row.appendChild(zoneEl(L, BEFAST[L].hint));
      boardEl.appendChild(row);
    });
  }

  function renderSbarBoard() {
    panelTitle.textContent = 'SBAR Handoff';

    // pool of collected-but-unfiled chips, so nothing has to be re-found
    const pool = collectedChips().filter((c) => !state.sbarPlacements[c.id]);
    const poolWrap = document.createElement('div');
    poolWrap.className = 'sbar-pool';
    poolWrap.innerHTML = `<div class="pool-title">Collected — drag into your SBAR (${pool.length})</div>`;
    const poolChips = document.createElement('div');
    poolChips.className = 'zone-chips';
    pool.forEach((c) => {
      const el = document.createElement('span');
      el.className = 'chip pool';
      el.dataset.chip = c.id;
      el.textContent = c.text;
      poolChips.appendChild(el);
    });
    if (!pool.length) poolChips.innerHTML = '<span class="pool-empty">Everything collected is filed.</span>';
    poolWrap.appendChild(poolChips);
    boardEl.appendChild(poolWrap);

    SBAR_LETTERS.forEach((L) => {
      const hasCorrect = chipsInZone(L).some((c) => isPlacedCorrect(c));
      const row = document.createElement('div');
      row.className = 'befast-row sbar-row' + (hasCorrect ? ' satisfied' : '');
      const letter = document.createElement('div');
      letter.className = 'befast-letter';
      letter.innerHTML = `<span class="bl">${L}</span><span class="bw">${SBAR[L].word}</span>`;
      row.appendChild(letter);
      row.appendChild(zoneEl(L, SBAR[L].hint));
      boardEl.appendChild(row);
    });
  }

  function zoneEl(L, hint) {
    const zone = document.createElement('div');
    zone.className = 'drop-zone';
    zone.dataset.zone = L;
    zone.title = hint;
    const chips = document.createElement('div');
    chips.className = 'zone-chips';
    chipsInZone(L).forEach((c) => chips.appendChild(placedChipEl(c)));
    zone.appendChild(chips);
    return zone;
  }

  function placedChipEl(chip) {
    const correct = isPlacedCorrect(chip);
    const el = document.createElement('span');
    el.className = 'chip placed ' + (correct ? 'correct' : 'incorrect');
    el.dataset.chip = chip.id;
    el.textContent = (correct ? '' : '✗ ') + chip.text;
    el.title = correct ? 'Correctly filed — tap to remove' : 'Incorrect — drag elsewhere or tap to remove';
    return el;
  }

  /* ----------------------------- drag & drop ---------------------------- */

  let drag = null;
  const DRAG_THRESHOLD = 5;

  document.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('[data-chip]');
    if (!handle) return;
    e.preventDefault();
    e.stopPropagation();
    drag = {
      chipId: handle.dataset.chip,
      startX: e.clientX, startY: e.clientY,
      moved: false, fromPlaced: handle.classList.contains('placed'),
    };
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragUp);
  });

  function onDragMove(e) {
    if (!drag) return;
    const dist = Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY);
    if (!drag.moved && dist > DRAG_THRESHOLD) {
      drag.moved = true;
      ghost.textContent = chipById[drag.chipId].text;
      ghost.classList.remove('hidden');
    }
    if (!drag.moved) return;
    ghost.style.left = e.clientX + 'px';
    ghost.style.top = e.clientY + 'px';
    const zone = zoneFromPoint(e.clientX, e.clientY);
    document.querySelectorAll('.drop-zone.drop-hover').forEach((z) => z.classList.remove('drop-hover'));
    if (zone) zone.classList.add('drop-hover');
  }

  function onDragUp(e) {
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragUp);
    document.querySelectorAll('.drop-zone.drop-hover').forEach((z) => z.classList.remove('drop-hover'));
    ghost.classList.add('hidden');
    const d = drag; drag = null;
    if (!d) return;

    if (!d.moved) {
      if (d.fromPlaced) unplaceChip(d.chipId);
      return;
    }
    const zone = zoneFromPoint(e.clientX, e.clientY);
    if (zone) placeChip(d.chipId, zone.dataset.zone);
    else if (d.fromPlaced) unplaceChip(d.chipId);
  }

  function zoneFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    return el ? el.closest('.drop-zone') : null;
  }

  function placeChip(chipId, zone) {
    const chip = chipById[chipId];
    placements()[chipId] = zone;
    const correct = isPlacedCorrect(chip);
    const info = state.phase === 1 ? BEFAST : SBAR;
    const home = correctZone(chip);
    if (correct && zone === 'NOTES') toast(`✓ Noted — not chart evidence. ${chip.note}`, 'good');
    else if (correct) toast(`✓ Filed under ${zone} — ${info[zone].word}. ${chip.note}`, 'good');
    else if (zone === 'NOTES') toast(`✗ That\'s chart-worthy — it belongs under ${home} (${info[home].word}). ${chip.note}`, 'bad');
    else if (home === 'NOTES') toast(`✗ Not chart evidence — leave it in Clinical Notes. ${chip.note}`, 'bad');
    else toast(`✗ That belongs under ${home} (${info[home].word}), not ${info[zone].word}.`, 'bad');
    rerender();
  }

  function unplaceChip(chipId) {
    delete placements()[chipId];
    toast('Returned to unfiled.');
    rerender();
  }

  function rerender() {
    renderBoard();
    renderMap();
    if (state.selectedNode) {
      const scroll = convoBody.scrollTop;
      openStage(state.selectedNode, true);
      convoBody.scrollTop = scroll;
    }
  }

  /* ----------------------------- stroke alert --------------------------- */

  alertBtn.addEventListener('click', () => {
    if (state.phase === 1) evaluateAlert();
    else evaluateHandoff();
  });

  function evaluateAlert() {
    const correct = correctBefastLetters();
    const deficits = LETTERS.filter((L) => L !== 'T' && correct.has(L));
    const problems = [];
    const wrong = misplacedChips().length;
    const prompts = CASE.alert.prompts || {};
    const decisive = decisiveFiled();

    (CASE.alert.requiredLetters || []).forEach((L) => {
      if (!correct.has(L)) problems.push(prompts[L] || `You haven\'t correctly filed a <b>${BEFAST[L].word}</b> (${L}) finding.`);
    });
    // a correctly-filed decisive sign bypasses the accumulation requirements
    if (!decisive) {
      if (deficits.length < CASE.alert.minDeficits) {
        problems.push(prompts.deficits || `Only <b>${deficits.length}</b> BEFAST deficit${deficits.length === 1 ? '' : 's'} correctly filed (${deficits.join(', ') || 'none'}) — file at least <b>${CASE.alert.minDeficits}</b> (B/E/F/A/S), or one decisive sign.`);
      }
      (CASE.alert.requiredNodes || []).forEach((nid) => {
        if (!state.discovered.has(nid)) {
          problems.push((prompts.nodes && prompts.nodes[nid]) || `You still need to perform <b>${CASE.nodes[nid].title}</b> before activating.`);
        }
      });
    }
    if (wrong) {
      problems.push(`You have <b>${wrong}</b> mis-filed item${wrong === 1 ? '' : 's'} in the chart — only correctly filed evidence counts toward activation.`);
    }

    if (!problems.length) { acceptAlert(); return; }

    addMinutes(PENALTY_REJECTED_ALERT);
    let html = '<h2 class="modal-title bad">⚠ Alert Not Accepted</h2>' +
      '<p>The stroke team pushes back — your activation needs stronger documentation:</p><ul>' +
      problems.map((p) => `<li>${p}</li>`).join('') + '</ul>' +
      `<p class="modal-note">The false start cost <b>${PENALTY_REJECTED_ALERT} minutes</b>. Keep investigating — every node is revisitable.</p>`;
    showModal(html, [{ label: 'Back to the patient', cls: '', fn: hideModal }]);
  }

  function acceptAlert() {
    state.alertMinutes = state.minutes;
    state.phase = 2;

    // surface phase-2 nodes whose parent is already discovered
    Object.values(CASE.nodes).forEach((n) => {
      if ((n.phase || 1) === 2 && !state.discovered.has(n.id)) {
        const p = parentOf[n.id];
        if (p && state.discovered.has(p)) state.unlocked.add(n.id);
      }
    });

    alertBtn.innerHTML = '<span class="alert-icon">📞</span> GIVE SBAR';
    alertBtn.classList.add('handoff');
    renderClock();
    renderBoard();
    renderMap();
    if (state.selectedNode) openStage(state.selectedNode, true);

    const s1 = stars(state.alertMinutes, CASE.scoring.alertStars);
    const html =
      '<h2 class="modal-title good">🚨 Stroke Alert Activated</h2>' +
      `<p>The stroke team accepts and mobilizes — <b>${state.alertMinutes} minutes</b> at the bedside. Recognition: <span class="stars">${starStr(s1)}</span></p>` +
      '<p>Now the second half of the job: the neurologist will pick up in a moment and expects a clean <b>SBAR handoff</b>.</p>' +
      '<ul>' +
      '<li>The chart has switched to <b>S / B / A / R</b> — drag your collected evidence into it (a pool of everything you\'ve gathered is at the top).</li>' +
      '<li>Anything you never collected — vitals, glucose, meds, allergies, intake — is still out there on the map. The clock is still running.</li>' +
      '<li>When the chart is ready, press <b>GIVE SBAR</b>.</li>' +
      '</ul>';
    showModal(html, [{ label: 'Prepare the handoff', cls: 'primary', fn: hideModal }]);
    toast('Phase 2 — build your SBAR handoff.', 'good');
  }

  /* ------------------------------ SBAR handoff -------------------------- */

  function evaluateHandoff() {
    const problems = [];
    const collectedIds = new Set(collectedChips().map((c) => c.id));

    Object.values(chipById).forEach((chip) => {
      if (!chip.required) return;
      if (!collectedIds.has(chip.id)) {
        problems.push(`<b>Missing data.</b> ${chip.gap}`);
      } else if (!state.sbarPlacements[chip.id]) {
        problems.push(`You collected "<i>${chip.text}</i>" but haven\'t filed it into the SBAR.`);
      }
    });

    const wrong = misplacedChips().length;
    if (wrong) {
      problems.push(`You have <b>${wrong}</b> item${wrong === 1 ? '' : 's'} filed under the wrong SBAR heading — fix them before you call.`);
    }

    if (!problems.length) { showFinalScorecard(); return; }

    addMinutes(PENALTY_REJECTED_HANDOFF);
    let html = '<h2 class="modal-title bad">📞 The Neurologist Interrupts</h2>' +
      '<p>"Hold on — I\'m missing things here:"</p><ul>' +
      problems.map((p) => `<li>${p}</li>`).join('') + '</ul>' +
      `<p class="modal-note">The fumbled call cost <b>${PENALTY_REJECTED_HANDOFF} minutes</b>. Collect what\'s missing and call back.</p>`;
    showModal(html, [{ label: 'Back to the patient', cls: '', fn: hideModal }]);
  }

  function showFinalScorecard() {
    const total = Object.keys(CASE.nodes).length;
    const handoffTime = state.minutes - state.alertMinutes;
    const s1 = stars(state.alertMinutes, CASE.scoring.alertStars);
    const s2 = stars(handoffTime, CASE.scoring.handoffStars);

    let html = '<h2 class="modal-title good">🏁 Handoff Accepted — Case Complete</h2>' +
      '<div class="scorecard">' +
      `<div class="score-row"><span class="stars">${starStr(s1)}</span><div><b>Recognition</b> — stroke alert accepted at <b>${state.alertMinutes} min</b></div></div>` +
      `<div class="score-row"><span class="stars">${starStr(s2)}</span><div><b>Handoff</b> — SBAR delivered <b>${handoffTime} min</b> after the alert</div></div>` +
      '</div>';
    CASE.debrief.success.forEach((p) => { html += `<p>${p}</p>`; });
    html += `<div class="debrief-stats">` +
      `<div><b>${state.discovered.size}</b>/${total} nodes explored</div>` +
      `<div><b>${collectedChips().filter((c) => state.sbarPlacements[c.id]).length}</b> items in the SBAR</div>` +
      `<div><b>${state.minutes}</b> total bedside minutes</div></div>`;
    showModal(html, [
      { label: 'Keep exploring', cls: '', fn: hideModal },
      { label: 'Restart case', cls: 'primary', fn: () => location.reload() },
    ]);
  }

  /* ------------------------------ modal/toast --------------------------- */

  function showModal(html, actions) {
    modalContent.innerHTML = html;
    modalActions.innerHTML = '';
    actions.forEach((a) => {
      const b = document.createElement('button');
      b.className = 'modal-btn ' + a.cls;
      b.textContent = a.label;
      b.addEventListener('click', a.fn);
      modalActions.appendChild(b);
    });
    backdrop.classList.remove('hidden');
  }
  function hideModal() { backdrop.classList.add('hidden'); }
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) hideModal(); });

  let toastTimer = null;
  function toast(msg, mood) {
    toastEl.textContent = msg;
    toastEl.className = 'show ' + (mood || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.className = 'hidden'; }, 3600);
  }

  /* -------------------------------- boot -------------------------------- */

  state.unlocked.add(CASE.rootId);
  renderClock();
  renderBoard();
  renderMap();
  fitView(false);
  window.addEventListener('resize', () => fitView(false));
})();
