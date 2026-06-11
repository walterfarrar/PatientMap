/* PatientMap engine — node-map exploration + drag highlighted evidence into
   the BEFAST chart. No dependencies. */

(function () {
  'use strict';

  const CASE = CASE_001;
  const BEFAST = CASE_BEFAST_INFO;
  const LETTERS = ['B', 'E', 'F', 'A', 'S', 'T'];
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const TYPE_CLASS = {
    scene: 'type-scene', dialogue: 'type-dialogue', exam: 'type-exam', test: 'type-test',
  };
  const TYPE_LABEL = {
    scene: 'Scene', dialogue: 'Dialogue', exam: 'Exam', test: 'Test',
  };

  /* ----------------------------- chip registry -------------------------- */

  const chipById = {};
  const chipsByNode = {};
  Object.values(CASE.nodes).forEach((n) => {
    chipsByNode[n.id] = (n.chips || []).map((c, i) => {
      const chip = { id: `${n.id}#${i}`, node: n.id, text: c.text, befast: c.befast, note: c.note || '' };
      chipById[chip.id] = chip;
      return chip;
    });
  });

  /* ------------------------------ game state ---------------------------- */

  const state = {
    discovered: new Set(),
    unlocked: new Set(),
    selectedNode: null,
    placements: {},   // chipId -> 'B'|'E'|'F'|'A'|'S'|'T'|'TRASH'
    alerted: false,
  };

  function collectedChips() {
    const out = [];
    state.discovered.forEach((nid) => { chipsByNode[nid].forEach((c) => out.push(c)); });
    return out;
  }
  function correctZone(chip) { return chip.befast === null ? 'TRASH' : chip.befast; }
  function isPlacedCorrect(chip) { return state.placements[chip.id] === correctZone(chip); }
  function chipsInZone(zone) { return collectedChips().filter((c) => state.placements[c.id] === zone); }
  function correctLetters() {
    const s = new Set();
    collectedChips().forEach((c) => { if (state.placements[c.id] && isPlacedCorrect(c) && c.befast) s.add(c.befast); });
    return s;
  }
  function incorrectPlacements() {
    return collectedChips().filter((c) => state.placements[c.id] && !isPlacedCorrect(c));
  }
  function unplacedCountForNode(id) {
    if (!state.discovered.has(id)) return 0;
    return chipsByNode[id].filter((c) => !state.placements[c.id]).length;
  }

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
  const trashZone = document.getElementById('trash-zone');
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

      // evidence badge: amber count of unplaced chips, or green check once all filed
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
      (CASE.nodes[id].unlocks || []).forEach((c) => { if (!state.discovered.has(c)) state.unlocked.add(c); });
      const n = chipsByNode[id].length;
      if (n) toast(`${n} highlighted phrase${n === 1 ? '' : 's'} to drag into the chart.`);
    }
    state.selectedNode = id;
    openStage(id, first);
    renderMap();
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
      const placed = !!state.placements[chip.id];
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

    const kids = node.unlocks || [];
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
          `<span>${child.actionLabel}</span>` + (done ? '<span class="choice-check">✓</span>' : '');
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

  /* ----------------------------- BEFAST board --------------------------- */

  function renderBoard() {
    boardEl.innerHTML = '';
    const correct = correctLetters();
    LETTERS.forEach((L) => {
      const row = document.createElement('div');
      row.className = 'befast-row' + (correct.has(L) ? ' satisfied' : '');
      const letter = document.createElement('div');
      letter.className = 'befast-letter';
      letter.innerHTML = `<span class="bl">${L}</span><span class="bw">${BEFAST[L].word}</span>`;
      row.appendChild(letter);

      const zone = document.createElement('div');
      zone.className = 'drop-zone';
      zone.dataset.zone = L;
      zone.title = BEFAST[L].hint;
      const chips = document.createElement('div');
      chips.className = 'zone-chips';
      chipsInZone(L).forEach((c) => chips.appendChild(placedChipEl(c)));
      zone.appendChild(chips);
      row.appendChild(zone);
      boardEl.appendChild(row);
    });

    const tc = trashZone.querySelector('.zone-chips');
    tc.innerHTML = '';
    chipsInZone('TRASH').forEach((c) => tc.appendChild(placedChipEl(c)));
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
      pointerId: e.pointerId,
    };
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragUp);
  });

  function onDragMove(e) {
    if (!drag) return;
    const dist = Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY);
    if (!drag.moved && dist > DRAG_THRESHOLD) {
      drag.moved = true;
      const chip = chipById[drag.chipId];
      ghost.textContent = chip.text;
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

    if (!d.moved) { // treat as a tap
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
    state.placements[chipId] = zone;
    const correct = isPlacedCorrect(chip);
    if (correct && zone === 'TRASH') toast('✓ Distractor discarded.', 'good');
    else if (correct) toast(`✓ Filed under ${zone} — ${BEFAST[zone].word}. ${chip.note}`, 'good');
    else if (zone === 'TRASH') toast(`✗ That\'s real evidence — it belongs in BEFAST, not the trash. ${chip.note}`, 'bad');
    else if (chip.befast === null) toast(`✗ Not a BEFAST deficit. ${chip.note}`, 'bad');
    else toast(`✗ That documents ${BEFAST[chip.befast].word} (${chip.befast}), not ${BEFAST[zone].word}.`, 'bad');
    rerender();
  }

  function unplaceChip(chipId) {
    delete state.placements[chipId];
    toast('Returned to the conversation.');
    rerender();
  }

  function rerender() {
    renderBoard();
    renderMap();
    if (state.selectedNode) {
      // re-render convo to update filed/draggable state without resetting scroll jump
      const node = CASE.nodes[state.selectedNode];
      const scroll = convoBody.scrollTop;
      openStage(state.selectedNode, true);
      convoBody.scrollTop = scroll;
      void node;
    }
  }

  /* ----------------------------- stroke alert --------------------------- */

  alertBtn.addEventListener('click', evaluateAlert);

  function evaluateAlert() {
    const correct = correctLetters();
    const deficits = LETTERS.filter((L) => L !== 'T' && correct.has(L));
    const problems = [];
    const wrong = incorrectPlacements().length;
    const prompts = CASE.alert.prompts || {};

    (CASE.alert.requiredLetters || []).forEach((L) => {
      if (!correct.has(L)) problems.push(prompts[L] || `You haven\'t correctly filed a <b>${BEFAST[L].word}</b> (${L}) finding.`);
    });
    if (deficits.length < CASE.alert.minDeficits) {
      problems.push(prompts.deficits || `Only <b>${deficits.length}</b> BEFAST deficit${deficits.length === 1 ? '' : 's'} correctly filed (${deficits.join(', ') || 'none'}) — file at least <b>${CASE.alert.minDeficits}</b> (B/E/F/A/S).`);
    }
    if (wrong) {
      problems.push(`You have <b>${wrong}</b> mis-filed item${wrong === 1 ? '' : 's'} in the chart — only correctly filed evidence counts toward activation.`);
    }
    (CASE.alert.requiredNodes || []).forEach((nid) => {
      if (!state.discovered.has(nid)) {
        problems.push((prompts.nodes && prompts.nodes[nid]) || `You still need to perform <b>${CASE.nodes[nid].title}</b> before activating.`);
      }
    });

    if (!problems.length) { state.alerted = true; showDebrief(); return; }

    let html = '<h2 class="modal-title bad">⚠ Alert Not Accepted</h2>' +
      '<p>The stroke team pushes back — your activation needs stronger documentation:</p><ul>' +
      problems.map((p) => `<li>${p}</li>`).join('') + '</ul>' +
      '<p class="modal-note">Keep investigating — every node is revisitable, and unexplored branches may hold new data.</p>';
    showModal(html, [{ label: 'Back to the patient', cls: '', fn: hideModal }]);
  }

  function showDebrief() {
    const total = Object.keys(CASE.nodes).length;
    const correct = [...correctLetters()].sort((a, b) => LETTERS.indexOf(a) - LETTERS.indexOf(b));
    let html = '<h2 class="modal-title good">🚨 Stroke Alert Activated</h2>';
    CASE.debrief.success.forEach((p) => { html += `<p>${p}</p>`; });
    html += `<div class="debrief-stats">` +
      `<div><b>${state.discovered.size}</b>/${total} nodes explored</div>` +
      `<div><b>${collectedChips().filter((c) => state.placements[c.id]).length}</b> items filed</div>` +
      `<div><b>${correct.join(' · ') || '—'}</b> correct</div></div>`;
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
  renderBoard();
  renderMap();
  fitView(false);
  window.addEventListener('resize', () => fitView(false));
})();
