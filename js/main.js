/* PatientMap engine — renders the case graph, handles discovery,
   BEFAST tagging, and Stroke Alert evaluation. No dependencies. */

(function () {
  'use strict';

  const CASE = CASE_001;
  const BEFAST = CASE_BEFAST_INFO;
  const LETTERS = ['B', 'E', 'F', 'A', 'S', 'T'];
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const TYPE_CLASS = {
    scene: 'type-scene',
    dialogue: 'type-dialogue',
    exam: 'type-exam',
    test: 'type-test',
  };
  const TYPE_LABEL = {
    scene: 'Scene',
    dialogue: 'Dialogue',
    exam: 'Exam',
    test: 'Test',
  };

  /* ----------------------------- game state ----------------------------- */

  const state = {
    discovered: new Set(),   // visited nodes
    unlocked: new Set(),     // visible frontier (clickable, not yet visited)
    findings: [],            // finding ids in collection order
    tags: {},                // findingId -> letter (any tag; check correctness separately)
    selectedNode: null,
    alerted: false,
  };

  const findingById = {};
  Object.values(CASE.nodes).forEach((n) => {
    if (n.finding) findingById[n.finding.id] = n.finding;
  });

  /* ------------------------------- layout ------------------------------- */
  /* Horizontal tidy tree: x by depth, y by leaf slots. Computed once over
     the full graph so positions never shift as nodes are revealed. */

  const X_GAP = 235;
  const Y_GAP = 115;
  const positions = {};
  const parentOf = {};

  (function layout() {
    Object.values(CASE.nodes).forEach((n) =>
      (n.unlocks || []).forEach((c) => { parentOf[c] = n.id; }));

    let nextLeafY = 0;
    function place(id, depth) {
      const node = CASE.nodes[id];
      const kids = node.unlocks || [];
      let y;
      if (kids.length === 0) {
        y = nextLeafY;
        nextLeafY += Y_GAP;
      } else {
        const ys = kids.map((k) => place(k, depth + 1));
        y = (Math.min(...ys) + Math.max(...ys)) / 2;
      }
      positions[id] = { x: depth * X_GAP, y };
      return y;
    }
    place(CASE.rootId, 0);
  })();

  /* ------------------------------ DOM refs ------------------------------ */

  const svg = document.getElementById('map');
  const edgeLayer = document.createElementNS(SVG_NS, 'g');
  const nodeLayer = document.createElementNS(SVG_NS, 'g');
  svg.appendChild(edgeLayer);
  svg.appendChild(nodeLayer);

  const interactionEl = document.getElementById('interaction-content');
  const trackerEl = document.getElementById('befast-tracker');
  const untaggedEl = document.getElementById('findings-untagged');
  const taggedEl = document.getElementById('findings-tagged');
  const dataCountEl = document.getElementById('data-count');
  const alertBtn = document.getElementById('stroke-alert-btn');
  const toastEl = document.getElementById('toast');
  const backdrop = document.getElementById('modal-backdrop');
  const modalContent = document.getElementById('modal-content');
  const modalActions = document.getElementById('modal-actions');

  /* ----------------------------- pan & zoom ----------------------------- */

  const view = { x: 0, y: 0, w: 1000, h: 700 };
  let viewAnim = null;

  function applyView() {
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
  }

  function contentBounds() {
    const ids = [...state.discovered, ...state.unlocked];
    const xs = ids.map((id) => positions[id].x);
    const ys = ids.map((id) => positions[id].y);
    const pad = 130;
    return {
      x: Math.min(...xs) - pad,
      y: Math.min(...ys) - pad,
      w: Math.max(...xs) - Math.min(...xs) + pad * 2,
      h: Math.max(...ys) - Math.min(...ys) + pad * 2,
    };
  }

  function fitView(animate) {
    const rect = svg.getBoundingClientRect();
    const b = contentBounds();
    const aspect = rect.width / Math.max(rect.height, 1);
    let w = b.w, h = b.h;
    if (w / h > aspect) h = w / aspect; else w = h * aspect;
    // never zoom in closer than ~520px of world width
    if (w < 520) { h *= 520 / w; w = 520; }
    const target = { x: b.x + (b.w - w) / 2, y: b.y + (b.h - h) / 2, w, h };
    if (!animate) { Object.assign(view, target); applyView(); return; }

    if (viewAnim) cancelAnimationFrame(viewAnim);
    const from = { ...view };
    const t0 = performance.now();
    const DUR = 450;
    (function step(now) {
      const t = Math.min((now - t0) / DUR, 1);
      const e = 1 - Math.pow(1 - t, 3);
      view.x = from.x + (target.x - from.x) * e;
      view.y = from.y + (target.y - from.y) * e;
      view.w = from.w + (target.w - from.w) * e;
      view.h = from.h + (target.h - from.h) * e;
      applyView();
      if (t < 1) viewAnim = requestAnimationFrame(step);
    })(t0);
  }

  function isNodeTarget(el) {
    while (el && el !== svg) {
      if (el.classList && el.classList.contains('node')) return true;
      el = el.parentNode;
    }
    return false;
  }

  function attachNodePointer(g, id) {
    let down = null;
    g.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      down = { x: e.clientX, y: e.clientY };
    });
    g.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      if (!down) return;
      const moved = Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y);
      down = null;
      if (moved <= 8) onNodeClick(id);
    });
    g.addEventListener('pointercancel', () => { down = null; });
  }

  let dragging = false, dragStart = null, dragMoved = false;
  svg.addEventListener('pointerdown', (e) => {
    if (isNodeTarget(e.target)) return;
    dragging = true;
    dragMoved = false;
    dragStart = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y };
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const rect = svg.getBoundingClientRect();
    const dx = (e.clientX - dragStart.px) * (view.w / rect.width);
    const dy = (e.clientY - dragStart.py) * (view.h / rect.height);
    if (Math.abs(e.clientX - dragStart.px) + Math.abs(e.clientY - dragStart.py) > 4) dragMoved = true;
    if (dragMoved) {
      if (viewAnim) cancelAnimationFrame(viewAnim);
      view.x = dragStart.vx - dx;
      view.y = dragStart.vy - dy;
      applyView();
    }
  });
  svg.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    dragMoved = false;
    if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
  });
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (viewAnim) cancelAnimationFrame(viewAnim);
    const rect = svg.getBoundingClientRect();
    const mx = view.x + ((e.clientX - rect.left) / rect.width) * view.w;
    const my = view.y + ((e.clientY - rect.top) / rect.height) * view.h;
    const k = e.deltaY > 0 ? 1.12 : 1 / 1.12;
    const w = Math.min(Math.max(view.w * k, 400), 6000);
    const ratio = w / view.w;
    view.x = mx - (mx - view.x) * ratio;
    view.y = my - (my - view.y) * ratio;
    view.w = w;
    view.h *= ratio;
    applyView();
  }, { passive: false });

  /* ----------------------------- map render ----------------------------- */

  function edgePath(a, b) {
    const midX = (a.x + b.x) / 2;
    return `M ${a.x} ${a.y} C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x} ${b.y}`;
  }

  function renderMap() {
    edgeLayer.innerHTML = '';
    nodeLayer.innerHTML = '';

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
      if (node.finding && state.tags[node.finding.id]) {
        cls += isTagCorrect(node.finding.id, state.tags[node.finding.id]) ? ' tagged' : ' tagged-wrong';
      }
      g.setAttribute('class', cls);
      g.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);

      const hit = document.createElementNS(SVG_NS, 'circle');
      hit.setAttribute('r', 48);
      hit.setAttribute('class', 'node-hit');
      g.appendChild(hit);

      const halo = document.createElementNS(SVG_NS, 'circle');
      halo.setAttribute('r', 38);
      halo.setAttribute('class', 'node-halo');
      g.appendChild(halo);

      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('r', 30);
      circle.setAttribute('class', 'node-circle');
      g.appendChild(circle);

      const icon = document.createElementNS(SVG_NS, 'text');
      icon.setAttribute('class', 'node-icon');
      icon.setAttribute('text-anchor', 'middle');
      icon.setAttribute('dominant-baseline', 'central');
      icon.textContent = isDiscovered ? node.icon : '?';
      g.appendChild(icon);

      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('class', 'node-label');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('y', 50);
      label.textContent = isDiscovered ? node.title : node.actionLabel;
      g.appendChild(label);

      if (node.finding && state.tags[node.finding.id]) {
        const tagLetter = state.tags[node.finding.id];
        const badge = document.createElementNS(SVG_NS, 'g');
        badge.setAttribute('class', 'node-badge' + (isTagCorrect(node.finding.id, tagLetter) ? '' : ' incorrect'));
        badge.setAttribute('transform', 'translate(24, -24)');
        const bc = document.createElementNS(SVG_NS, 'circle');
        bc.setAttribute('r', 11);
        badge.appendChild(bc);
        const bt = document.createElementNS(SVG_NS, 'text');
        bt.setAttribute('text-anchor', 'middle');
        bt.setAttribute('dominant-baseline', 'central');
        bt.textContent = tagLetter;
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
      const node = CASE.nodes[id];
      (node.unlocks || []).forEach((c) => {
        if (!state.discovered.has(c)) state.unlocked.add(c);
      });
      if (node.finding && !state.findings.includes(node.finding.id)) {
        state.findings.push(node.finding.id);
        toast(`New finding collected — tag it in Collected Data.`);
      }
    }
    state.selectedNode = id;
    renderMap();
    renderPanel(id, first);
    renderData();
    if (first) fitView(true);
    setTab('interaction');
  }

  function renderPanel(id, justDiscovered) {
    const node = CASE.nodes[id];
    const frag = document.createDocumentFragment();

    const head = document.createElement('div');
    head.className = 'node-head';
    head.innerHTML =
      `<span class="node-head-icon">${node.icon}</span>` +
      `<div><h2>${node.title}</h2>` +
      `<span class="node-type-pill ${TYPE_CLASS[node.type]}">${TYPE_LABEL[node.type]}</span>` +
      (justDiscovered ? '' : '<span class="revisit-pill">revisited</span>') +
      `</div>`;
    frag.appendChild(head);

    node.content.forEach((block) => {
      const p = document.createElement('p');
      p.className = `block block-${block.kind}`;
      p.textContent = block.text;
      frag.appendChild(p);
    });

    if (node.finding) {
      const f = node.finding;
      const card = document.createElement('div');
      const letter = state.tags[f.id];
      const correct = letter && isTagCorrect(f.id, letter);
      card.className = 'inline-finding' + (letter && !correct ? ' incorrect-tag' : '');
      card.innerHTML =
        `<div class="finding-title">📎 Finding: ${f.label}</div>` +
        `<div class="finding-detail">${f.detail}</div>` +
        (letter
          ? (correct
            ? `<div class="finding-tagged-as">✓ Tagged: <b>${letter}</b> — ${BEFAST[letter].word}</div>`
            : `<div class="finding-tagged-as incorrect">✗ Incorrect tag: <b>${letter}</b> — ${BEFAST[letter].word}</div>`)
          : `<div class="finding-hint">Open <b>Collected Data</b> to tag this to a BEFAST category.</div>`);
      frag.appendChild(card);
    }

    const kids = (node.unlocks || []);
    if (kids.length) {
      const h = document.createElement('h3');
      h.className = 'choices-heading';
      h.textContent = 'Available actions';
      frag.appendChild(h);
      kids.forEach((cid) => {
        const child = CASE.nodes[cid];
        const done = state.discovered.has(cid);
        const btn = document.createElement('button');
        btn.className = 'choice-btn' + (done ? ' done' : '');
        btn.innerHTML = `<span class="choice-icon">${done ? child.icon : '?'}</span>` +
          `<span>${child.actionLabel}</span>` +
          (done ? '<span class="choice-check">✓</span>' : '');
        btn.addEventListener('click', () => onNodeClick(cid));
        frag.appendChild(btn);
      });
    } else {
      const p = document.createElement('p');
      p.className = 'panel-help';
      p.textContent = 'No further actions branch from here. Revisit other nodes on the map to keep investigating.';
      frag.appendChild(p);
    }

    interactionEl.innerHTML = '';
    interactionEl.appendChild(frag);
    interactionEl.scrollTop = 0;
  }

  /* ----------------------------- BEFAST data ---------------------------- */

  function isTagCorrect(findingId, letter) {
    return findingById[findingId].befast === letter;
  }

  function correctTaggedLetters() {
    const letters = new Set();
    state.findings.forEach((id) => {
      const letter = state.tags[id];
      if (letter && isTagCorrect(id, letter)) letters.add(letter);
    });
    return letters;
  }

  function incorrectTagCount() {
    return state.findings.filter((id) => {
      const letter = state.tags[id];
      return letter && !isTagCorrect(id, letter);
    }).length;
  }

  function renderTracker() {
    const tagged = correctTaggedLetters();
    trackerEl.innerHTML = '';
    LETTERS.forEach((L) => {
      const slot = document.createElement('div');
      slot.className = 'befast-slot' + (tagged.has(L) ? ' filled' : '');
      slot.title = `${BEFAST[L].word}: ${BEFAST[L].hint}`;
      slot.innerHTML = `<span class="slot-letter">${L}</span><span class="slot-word">${BEFAST[L].word}</span>`;
      trackerEl.appendChild(slot);
    });
  }

  function appendTagRow(card, findingId) {
    const row = document.createElement('div');
    row.className = 'tag-row';
    LETTERS.forEach((L) => {
      const b = document.createElement('button');
      b.className = 'tag-btn';
      b.textContent = L;
      b.title = BEFAST[L].word;
      b.addEventListener('click', () => tryTag(findingId, L));
      row.appendChild(b);
    });
    card.appendChild(row);
  }

  function renderData() {
    const untagged = state.findings.filter((id) => !state.tags[id]);
    const tagged = state.findings.filter((id) => state.tags[id]);

    dataCountEl.textContent = state.findings.length ? `(${state.findings.length})` : '';
    if (untagged.length || incorrectTagCount()) {
      dataCountEl.textContent += ' •';
      dataCountEl.classList.add('attention');
    } else {
      dataCountEl.classList.remove('attention');
    }

    untaggedEl.innerHTML = untagged.length ? '' : '<p class="panel-empty">Nothing waiting to be tagged.</p>';
    untagged.forEach((id) => {
      const f = findingById[id];
      const card = document.createElement('div');
      card.className = 'finding-card';
      card.innerHTML = `<div class="finding-title">${f.label}</div>` +
        `<div class="finding-detail">${f.detail}</div>` +
        `<div class="tag-prompt">Which BEFAST category does this support?</div>`;
      appendTagRow(card, id);
      untaggedEl.appendChild(card);
    });

    taggedEl.innerHTML = tagged.length ? '' : '<p class="panel-empty">No tags yet.</p>';
    tagged.forEach((id) => {
      const f = findingById[id];
      const L = state.tags[id];
      const correct = isTagCorrect(id, L);
      const card = document.createElement('div');
      card.className = 'finding-card tagged ' + (correct ? 'correct' : 'incorrect');
      card.innerHTML =
        `<span class="tag-chip ${correct ? 'correct' : 'incorrect'}">` +
        `${correct ? '✓' : '✗'} ${L} · ${BEFAST[L].word}` +
        `</span>` +
        `<div class="finding-title">${f.label}</div>` +
        `<div class="finding-detail">${f.detail}</div>` +
        (correct
          ? ''
          : `<div class="tag-feedback incorrect">${tagFeedbackText(f, L)}</div>`) +
        `<div class="tag-prompt">${correct ? 'Change tag:' : 'Try again:'}</div>`;
      appendTagRow(card, id);
      taggedEl.appendChild(card);
    });
  }

  function tagFeedbackText(finding, letter) {
    if (finding.befast === null) {
      return 'This is supporting data — it does not document a BEFAST deficit.';
    }
    return `This finding documents ${BEFAST[finding.befast].word} (${finding.befast}), not ${BEFAST[letter].word}.`;
  }

  function tryTag(findingId, letter) {
    const f = findingById[findingId];
    const correct = isTagCorrect(findingId, letter);
    state.tags[findingId] = letter;
    if (correct) {
      toast(`✓ Correct — ${letter} · ${BEFAST[letter].word}.`, 'good');
    } else if (f.befast === null) {
      toast(`✗ Incorrect — supporting data is not a BEFAST deficit.`, 'bad');
    } else {
      toast(`✗ Incorrect — this documents ${BEFAST[f.befast].word} (${f.befast}), not ${BEFAST[letter].word}.`, 'bad');
    }
    renderTracker();
    renderData();
    renderMap();
    if (state.selectedNode) renderPanel(state.selectedNode, false);
  }

  /* ----------------------------- stroke alert --------------------------- */

  alertBtn.addEventListener('click', evaluateAlert);

  function evaluateAlert() {
    const tagged = correctTaggedLetters();
    const deficits = LETTERS.filter((L) => L !== 'T' && tagged.has(L));
    const problems = [];
    const wrongTags = incorrectTagCount();

    if (!tagged.has('T')) {
      problems.push('No <b>Time</b> evidence — a stroke alert without a last-known-well time can\'t drive treatment decisions. Someone witnessed the onset…');
    }
    if (deficits.length < CASE.alert.minDeficits) {
      problems.push(`Only <b>${deficits.length}</b> BEFAST deficit${deficits.length === 1 ? '' : 's'} correctly tagged (${deficits.join(', ') || 'none'}) — document at least <b>${CASE.alert.minDeficits}</b> objective deficits (B/E/F/A/S) to justify activation.`);
    }
    if (wrongTags) {
      problems.push(`You have <b>${wrongTags}</b> incorrect BEFAST tag${wrongTags === 1 ? '' : 's'} — only correctly tagged evidence counts toward activation.`);
    }
    CASE.alert.requiredNodes.forEach((nid) => {
      if (!state.discovered.has(nid)) {
        problems.push(`You haven\'t excluded the most common stroke mimic. There\'s a ten-second bedside test for it (<b>${CASE.nodes[nid].title}</b>).`);
      }
    });
    const untaggedCount = state.findings.filter((id) => !state.tags[id]).length;

    if (problems.length === 0) {
      state.alerted = true;
      showDebrief();
      return;
    }

    let html = '<h2 class="modal-title bad">⚠ Alert Not Accepted</h2>' +
      '<p>The stroke team pushes back — your activation needs stronger documentation:</p><ul>' +
      problems.map((p) => `<li>${p}</li>`).join('') + '</ul>';
    if (untaggedCount) {
      html += `<p class="modal-note">You have <b>${untaggedCount}</b> collected finding${untaggedCount === 1 ? '' : 's'} sitting untagged in Collected Data.</p>`;
    }
    html += '<p class="modal-note">Keep investigating — every node is revisitable, and unexplored branches may hold new data.</p>';
    showModal(html, [{ label: 'Back to the patient', cls: '', fn: hideModal }]);
  }

  function showDebrief() {
    const total = Object.keys(CASE.nodes).length;
    const tagged = correctTaggedLetters();
    let html = '<h2 class="modal-title good">🚨 Stroke Alert Activated</h2>';
    CASE.debrief.success.forEach((p) => { html += `<p>${p}</p>`; });
    html += `<div class="debrief-stats">` +
      `<div><b>${state.discovered.size}</b>/${total} nodes explored</div>` +
      `<div><b>${state.findings.length}</b> findings collected</div>` +
      `<div><b>${[...tagged].sort((a, b) => LETTERS.indexOf(a) - LETTERS.indexOf(b)).join(' · ')}</b> correctly tagged</div>` +
      `</div>`;
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
    toastTimer = setTimeout(() => { toastEl.className = 'hidden'; }, 3200);
  }

  /* -------------------------------- tabs -------------------------------- */

  const tabs = document.querySelectorAll('#panel-tabs .tab');
  function setTab(name) {
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    document.getElementById('tab-interaction').classList.toggle('active', name === 'interaction');
    document.getElementById('tab-data').classList.toggle('active', name === 'data');
  }
  tabs.forEach((t) => t.addEventListener('click', () => setTab(t.dataset.tab)));

  /* -------------------------------- boot -------------------------------- */

  state.unlocked.add(CASE.rootId);
  renderTracker();
  renderData();
  renderMap();
  fitView(false);
  window.addEventListener('resize', () => fitView(false));
})();
