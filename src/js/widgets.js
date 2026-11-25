/* MyRecord — UI widgets: icons, mascot, knobs, toast, menus, modal, drag & drop. */
(function () {
  const MR = (window.MR = window.MR || {});
  const ui = (MR.ui = MR.ui || { view: 'rack', tab: 'beats', search: '', inspTab: 'channel', selectedFx: null, metronome: false, drag: null, noteLen: 2 });

  // ---------- helpers ----------
  MR.h = function (tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') { for (const s in v) { if (s.startsWith('--')) el.style.setProperty(s, v[s]); else el.style[s] = v[s]; } }
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => { if (c == null || c === false) return; el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); });
    return el;
  };
  const h = MR.h;
  MR.svg = (markup, cls) => { const s = document.createElement('span'); s.className = cls || ''; s.style.display = 'contents'; s.innerHTML = markup; return s.firstElementChild; };

  // ---------- icons ----------
  const sw = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  MR.ICONS = {
    drum: `<svg viewBox="0 0 24 24"><ellipse cx="12" cy="8" rx="8" ry="3" ${sw}/><path d="M4 8v8c0 1.7 3.6 3 8 3s8-1.3 8-3V8" ${sw}/></svg>`,
    perc: `<svg viewBox="0 0 24 24"><circle cx="9" cy="14" r="5" ${sw}/><path d="M13 10l6-6M16.5 4H20v3.5" ${sw}/></svg>`,
    bass: `<svg viewBox="0 0 24 24"><path d="M3 12c2 0 2-6 4.5-6S10 18 12.5 18 15 6 17.5 6 19 12 21 12" ${sw}/></svg>`,
    keys: `<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="2.5" ${sw}/><path d="M8.5 5v8M12 5v8M15.5 5v8M8.5 13v6M15.5 13v6" ${sw}/></svg>`,
    synth: `<svg viewBox="0 0 24 24"><path d="M3 15l4-8 4 10 4-12 3 10h3" ${sw}/></svg>`,
    sample: `<svg viewBox="0 0 24 24"><path d="M4 12h1.5M7.5 8v8M11 5v14M14.5 9v6M18 7v10M20.5 12H20" ${sw}/></svg>`,
    fx: `<svg viewBox="0 0 24 24"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" ${sw}/><circle cx="12" cy="12" r="3" ${sw}/></svg>`,
    groove: `<svg viewBox="0 0 24 24"><rect x="3" y="9" width="3.5" height="6" rx="1.2" ${sw}/><rect x="10.2" y="9" width="3.5" height="6" rx="1.2" ${sw}/><rect x="17.5" y="9" width="3.5" height="6" rx="1.2" ${sw}/></svg>`,
    chord: `<svg viewBox="0 0 24 24"><path d="M9 18V6l11-2v12" ${sw}/><circle cx="6.5" cy="18" r="2.5" ${sw}/><circle cx="17.5" cy="16" r="2.5" ${sw}/></svg>`,
    wand: `<svg viewBox="0 0 24 24"><path d="M4 20L15 9M14 4v3M19 9h-3M17.5 5.5l-2 2M18 14v2M20 15h-4" ${sw}/></svg>`,
    plus: `<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" ${sw}/></svg>`,
    x: `<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" ${sw} stroke-width="2.2"/></svg>`,
    dots: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18" cy="12" r="1.7"/></svg>`,
    play: `<svg viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>`,
    reverb: `<svg viewBox="0 0 24 24"><path d="M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M7 7a7 7 0 0 0 0 10M17 7a7 7 0 0 1 0 10M4 4a11 11 0 0 0 0 16M20 4a11 11 0 0 1 0 16" ${sw}/></svg>`,
    delay: `<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2.2" ${sw}/><circle cx="12" cy="12" r="1.7" ${sw} opacity=".7"/><circle cx="18" cy="12" r="1.2" ${sw} opacity=".45"/></svg>`,
    filter: `<svg viewBox="0 0 24 24"><path d="M3 9h9c3 0 4 1 5 4l2 6" ${sw}/></svg>`,
    drive: `<svg viewBox="0 0 24 24"><path d="M3 15h4l2-8 3 12 3-12 2 8h4" ${sw}/></svg>`,
    compressor: `<svg viewBox="0 0 24 24"><path d="M4 20L12 12h8M8 4v6M5 7h6M14 4l-3 3" ${sw}/></svg>`,
    eq: `<svg viewBox="0 0 24 24"><path d="M3 15c3 0 3-6 6-6s3 9 6 9 3-6 6-6" ${sw}/></svg>`,
    chorus: `<svg viewBox="0 0 24 24"><path d="M3 10c2-3 4-3 6 0s4 3 6 0 4-3 6 0M3 15c2-3 4-3 6 0s4 3 6 0 4-3 6 0" ${sw}/></svg>`,
    lofi: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" ${sw}/><circle cx="12" cy="12" r="2" ${sw}/><path d="M12 6.5a5.5 5.5 0 0 1 5.5 5.5" ${sw}/></svg>`,
    pump: `<svg viewBox="0 0 24 24"><path d="M3 18V8c3 0 3 10 6 10V8c3 0 3 10 6 10V8c3 0 3 10 6 10" ${sw}/></svg>`,
  };
  MR.icon = (name) => MR.svg(MR.ICONS[name] || MR.ICONS.fx);
  MR.instIcon = (instId) => {
    const c = (MR.INSTRUMENTS[instId] || {}).cat;
    return { Drums: 'drum', Percussion: 'perc', Bass: 'bass', Keys: 'keys', Synth: 'synth', Samples: 'sample' }[c] || 'drum';
  };

  // ---------- mascot ----------
  MR.mascot = function (mood) {
    const happy = mood !== 'calm';
    return MR.svg(`<svg viewBox="0 0 120 120" class="mascot" aria-hidden="true">
      <ellipse cx="60" cy="108" rx="30" ry="4" fill="#0C0F14" opacity=".06"/>
      <path d="M27 60C27 28 93 28 93 60" fill="none" stroke="#2E2F33" stroke-width="6.5" stroke-linecap="round"/>
      <rect x="25" y="38" width="70" height="66" rx="30" fill="#E9E4E0"/>
      <rect x="25" y="38" width="70" height="66" rx="30" fill="none" stroke="#DCD5CF" stroke-width="1.5"/>
      <rect x="16" y="57" width="15" height="25" rx="7.5" fill="#A87C3A"/>
      <rect x="89" y="57" width="15" height="25" rx="7.5" fill="#A87C3A"/>
      <ellipse cx="48" cy="70" rx="4.6" ry="5.6" fill="#0C0F14"/><ellipse cx="72" cy="70" rx="4.6" ry="5.6" fill="#0C0F14"/>
      <circle cx="49.6" cy="68" r="1.5" fill="#fff"/><circle cx="73.6" cy="68" r="1.5" fill="#fff"/>
      <ellipse cx="39.5" cy="80" rx="5" ry="2.8" fill="#B49A85" opacity=".45"/><ellipse cx="80.5" cy="80" rx="5" ry="2.8" fill="#B49A85" opacity=".45"/>
      ${happy ? '<path d="M54.5 80.5q5.5 5 11 0" fill="none" stroke="#0C0F14" stroke-width="2.6" stroke-linecap="round"/>' : '<path d="M55.5 82h9" stroke="#0C0F14" stroke-width="2.6" stroke-linecap="round"/>'}
      <g fill="#A87C3A"><path d="M98 18v14.5a4 4 0 1 1-2-3.4V20.5l8-2v-3z" opacity=".9"/></g>
    </svg>`);
  };
  MR.logo = () => MR.svg(`<svg viewBox="0 0 40 40" class="logo-svg"><rect width="40" height="40" rx="13" fill="#0C0F14"/>
      <path d="M11 19.5C11 11 29 11 29 19.5" fill="none" stroke="#A87C3A" stroke-width="2.6" stroke-linecap="round"/>
      <ellipse cx="16" cy="22" rx="2.1" ry="2.5" fill="#F5F4F2"/><ellipse cx="24" cy="22" rx="2.1" ry="2.5" fill="#F5F4F2"/>
      <path d="M17.6 27.2q2.4 2.1 4.8 0" fill="none" stroke="#FDEBB0" stroke-width="1.9" stroke-linecap="round"/></svg>`);

  // ---------- knob ----------
  const A0 = -135, A1 = 135;
  function polar(a, r) { const t = (a - 90) * Math.PI / 180; return [26 + r * Math.cos(t), 26 + r * Math.sin(t)]; }
  function arcPath(a0, a1, r) {
    const [x0, y0] = polar(a0, r), [x1, y1] = polar(a1, r);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }
  MR.knob = function (o) {
    const el = h('div', { class: 'knob', title: o.title || '' });
    el.innerHTML = `<svg viewBox="0 0 52 52"><path class="track" d="${arcPath(A0, A1, 21)}"/><path class="arc"/><circle class="cap" cx="26" cy="26" r="14.5"/><line class="needle" x1="26" y1="26" x2="26" y2="15"/></svg>`;
    const arc = el.querySelector('.arc'), needle = el.querySelector('.needle');
    const bipolar = o.min < 0 && o.max > 0;
    let v = o.value;
    function draw() {
      const t = (v - o.min) / (o.max - o.min), a = A0 + t * (A1 - A0);
      const from = bipolar ? 0 : A0;
      arc.setAttribute('d', Math.abs(a - from) < 0.5 ? '' : arcPath(Math.min(from, a), Math.max(from, a), 21));
      const [x, y] = polar(a, 11); needle.setAttribute('x2', x.toFixed(2)); needle.setAttribute('y2', y.toFixed(2));
      if (o.label) o.label.textContent = o.format ? o.format(v) : v;
    }
    function set(nv, fire) {
      const s = o.step || 0.01;
      nv = Math.min(o.max, Math.max(o.min, Math.round(nv / s) * s));
      nv = +nv.toFixed(4);
      if (nv === v) return; v = nv; draw(); if (fire && o.onInput) o.onInput(v);
    }
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); el.setPointerCapture(e.pointerId);
      o.onStart && o.onStart();
      const y0 = e.clientY, v0 = v;
      const move = (ev) => { const k = ev.shiftKey ? 0.2 : 1; set(v0 + ((y0 - ev.clientY) / 160) * (o.max - o.min) * k, true); };
      const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); o.onEnd && o.onEnd(v); };
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault(); o.onStart && o.onStart();
      const s = o.step && o.step >= (o.max - o.min) / 100 ? o.step : (o.max - o.min) / 100;
      set(v + (e.deltaY < 0 ? s : -s), true); o.onEnd && o.onEnd(v);
    }, { passive: false });
    el.addEventListener('dblclick', () => { if (o.def == null) return; o.onStart && o.onStart(); set(o.def, true); o.onEnd && o.onEnd(v); });
    el.setValue = (nv) => { v = nv; draw(); };
    draw();
    return el;
  };
  MR.fmt = function (p, v) {
    if (p.unit === 's') return v < 1 ? Math.round(v * 1000) + 'ms' : v.toFixed(2) + 's';
    if (p.unit === 'st') return (v > 0 ? '+' : '') + v + ' st';
    if (p.unit === 'dB') return (v > 0 ? '+' : '') + v + ' dB';
    if (p.unit === 'Hz') return v.toFixed(1) + ' Hz';
    if (p.max === 1 && p.min === 0 && p.step < 1) return Math.round(v * 100) + '%';
    return String(v);
  };

  // ---------- toast ----------
  let toastTimer;
  MR.toast = function (msg, undoable) {
    const t = document.getElementById('toast');
    t.innerHTML = '';
    t.appendChild(h('span', null, msg));
    if (undoable) t.appendChild(h('button', { onclick: () => { MR.undo(); t.classList.remove('show'); } }, 'Undo'));
    t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), undoable ? 4500 : 2600);
  };

  // ---------- context menu ----------
  MR.menu = function (e, items) {
    e.preventDefault();
    document.querySelectorAll('.ctx').forEach((m) => m.remove());
    const m = h('div', { class: 'ctx' });
    items.forEach((it) => {
      if (it === '-') return m.appendChild(h('hr'));
      m.appendChild(h('button', { class: it.danger ? 'danger' : '', onclick: () => { m.remove(); it.run(); } }, it.label));
    });
    document.body.appendChild(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.min(e.clientX, innerWidth - r.width - 8) + 'px';
    m.style.top = Math.min(e.clientY, innerHeight - r.height - 8) + 'px';
    setTimeout(() => document.addEventListener('pointerdown', function off(ev) { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('pointerdown', off); } }), 0);
  };

  // ---------- modal ----------
  MR.modal = function (content, small) {
    const w = document.getElementById('modal');
    w.innerHTML = '';
    const box = h('div', { class: 'modal' + (small ? ' sm' : '') });
    box.appendChild(h('button', { class: 'x-btn close', title: 'Close', onclick: MR.closeModal }, MR.icon('x')));
    box.appendChild(content);
    w.appendChild(box); w.classList.add('show');
    w.onclick = (e) => { if (e.target === w) MR.closeModal(); };
    return box;
  };
  MR.closeModal = () => { const w = document.getElementById('modal'); w.classList.remove('show'); w.innerHTML = ''; };

  // ---------- drag & drop ----------
  // A draggable payload: { kind: 'sound'|'fx'|'template'|'groove'|'chord'|'tool'|'pattern', id, label }
  MR.draggable = function (el, payload) {
    el.setAttribute('draggable', 'true');
    el.addEventListener('dragstart', (e) => {
      ui.drag = payload;
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', payload.label || payload.id);
      const g = h('div', { class: 'drag-ghost' }, payload.label || payload.id);
      document.body.appendChild(g); e.dataTransfer.setDragImage(g, 14, 16);
      setTimeout(() => g.remove(), 0);
      document.body.classList.add('drag-active', 'drag-' + payload.kind);
    });
    el.addEventListener('dragend', endDrag);
  };
  function endDrag() {
    ui.drag = null;
    document.body.className = document.body.className.split(' ').filter((c) => !c.startsWith('drag-')).join(' ');
    document.querySelectorAll('.drop-hot').forEach((x) => x.classList.remove('drop-hot'));
    document.getElementById('dropVeil').classList.remove('show');
  }
  MR.endDrag = endDrag;
  function currentKind(e) {
    if (ui.drag) return ui.drag.kind;
    if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) return 'file';
    return null;
  }
  function findTarget(e, kind) {
    let el = e.target;
    while (el && el !== document) {
      if (el._onDrop && el.dataset && el.dataset.accept && el.dataset.accept.split(' ').includes(kind === 'tool' ? 'chord' : kind)) return el;
      el = el.parentNode;
    }
    return null;
  }
  let hot = null;
  document.addEventListener('dragover', (e) => {
    const kind = currentKind(e); if (!kind) return;
    if (kind === 'file') {
      document.body.classList.add('drag-active', 'drag-file');
      document.getElementById('dropVeil').classList.add('show');
    }
    const t = findTarget(e, kind);
    if (hot && hot !== t) hot.classList.remove('drop-hot');
    hot = t;
    if (t) { t.classList.add('drop-hot'); e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
    else if (kind === 'file') { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
  });
  document.addEventListener('dragleave', (e) => { if (e.relatedTarget == null && currentKind(e) === 'file') endDrag(); });
  document.addEventListener('drop', async (e) => {
    const kind = currentKind(e); if (!kind) return;
    e.preventDefault();
    const t = findTarget(e, kind);
    const payload = ui.drag || { kind: 'file', files: Array.from(e.dataTransfer.files || []) };
    endDrag();
    if (t) t._onDrop(payload, e);
    else if (kind === 'file') MR.importFiles(payload.files);
  });
})();
