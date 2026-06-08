const $ = id => document.getElementById(id);
const $$ = sel => document.querySelector(sel);

class SeqDiagram {
  static CFG = {
    hdrW: 120, hdrH: 44,
    pad: { t: 30, b: 30, l: 80, r: 80 },
    msgGap: 80,
    selfOff: 55, selfH: 30,
    minGap: 150, minH: 400,
    reqClr: '#2563eb', respClr: '#64748b', lifeClr: '#94a3b8'
  };

  constructor() {
    this.lifelines = [];
    this.messages = [];
    this.nextId = 1;
    this.lx = new Map();
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.spaceDown = false;
    this.panStart = null;
    this.init();
  }

  init() {
    this.loadFromStorage();
    this.bindEvents();
    this.setupViewportEvents();
    this.render();
  }

  bindEvents() {
    $('btn-lifeline').onclick = () => this.openModal('modal-lifeline');
    $('btn-message').onclick = () => this.openMessageModal();
    $('btn-save').onclick = () => this.save();
    $('btn-load').onclick = () => this.load();
    $('btn-export').onclick = () => this.exportPNG();
    $('btn-clear').onclick = () => this.clear();
    $('btn-zoom-in').onclick = () => this.adjustZoom(0.15);
    $('btn-zoom-out').onclick = () => this.adjustZoom(-0.15);
    $('btn-zoom-reset').onclick = () => { this.zoom = 1; this.panX = 0; this.panY = 0; this.applyTransform(); this.updateZoomLabel(); };

    $$('#modal-lifeline .modal-close').onclick = () => this.closeModal('modal-lifeline');
    $$('#modal-lifeline .modal-cancel').onclick = () => this.closeModal('modal-lifeline');
    $('confirm-lifeline').onclick = () => this.addLifelineFromModal();
    $('lifeline-name').onkeydown = e => { if (e.key === 'Enter') this.addLifelineFromModal(); };

    $$('#modal-message .modal-close').onclick = () => this.closeModal('modal-message');
    $$('#modal-message .modal-cancel').onclick = () => this.closeModal('modal-message');
    $('confirm-message').onclick = () => this.addMessageFromModal();
    $('message-label').onkeydown = e => { if (e.key === 'Enter') this.addMessageFromModal(); };

    document.querySelectorAll('.modal-backdrop').forEach(el => {
      el.onclick = e => { if (e.target === el) this.closeModal(el.id); };
    });

    document.onkeydown = e => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop.active').forEach(el => this.closeModal(el.id));
      }
    };

    $('diagram').addEventListener('click', e => this.onDiagramClick(e));

    let rt;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => this.render(), 150);
    });
  }

  setupViewportEvents() {
    const diagram = $('diagram');

    diagram.addEventListener('wheel', e => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = -e.deltaY * 0.001;
        const nz = Math.max(0.2, Math.min(5, this.zoom * (1 + delta)));
        const rect = diagram.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        this.panX = mx - (mx - this.panX) * (nz / this.zoom);
        this.panY = my - (my - this.panY) * (nz / this.zoom);
        this.zoom = nz;
        this.applyTransform();
      }
    });

    document.addEventListener('keydown', e => {
      if (e.code === 'Space' && !e.repeat && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        this.spaceDown = true;
        diagram.classList.add('diagram-space');
      }
    });

    document.addEventListener('keyup', e => {
      if (e.code === 'Space') {
        this.spaceDown = false;
        diagram.classList.remove('diagram-space', 'diagram-panning');
        this.panStart = null;
      }
    });

    diagram.addEventListener('mousedown', e => {
      if (this.spaceDown && e.button === 0) {
        e.preventDefault();
        this.panStart = { x: e.clientX - this.panX, y: e.clientY - this.panY };
        diagram.classList.add('diagram-panning');
        diagram.classList.remove('diagram-space');
      }
    });

    document.addEventListener('mousemove', e => {
      if (this.panStart && this.spaceDown) {
        this.panX = e.clientX - this.panStart.x;
        this.panY = e.clientY - this.panStart.y;
        this.applyTransform();
      }
    });

    document.addEventListener('mouseup', () => {
      if (this.panStart) {
        this.panStart = null;
        diagram.classList.remove('diagram-panning');
        if (this.spaceDown) diagram.classList.add('diagram-space');
      }
    });
  }

  applyTransform() {
    const vp = $('diagram').querySelector('.diagram-viewport');
    if (vp) {
      vp.style.transform = `translate(${this.panX}px,${this.panY}px) scale(${this.zoom})`;
    }
    this.updateZoomLabel();
  }

  updateZoomLabel() {
    const el = $('zoom-label');
    if (el) el.textContent = Math.round(this.zoom * 100) + '%';
  }

  adjustZoom(delta) {
    const nz = Math.max(0.2, Math.min(5, this.zoom + delta));
    const diagram = $('diagram');
    const rect = diagram.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    this.panX = cx - (cx - this.panX) * (nz / this.zoom);
    this.panY = cy - (cy - this.panY) * (nz / this.zoom);
    this.zoom = nz;
    this.applyTransform();
  }

  onHeaderMouseDown(e, id) {
    if (e.button !== 0 || this.spaceDown) return;
    e.preventDefault();

    const box = e.currentTarget;
    const diagram = $('diagram');
    const vp = diagram.querySelector('.diagram-viewport');
    const boxRect = box.getBoundingClientRect();

    const ghost = box.cloneNode(true);
    ghost.className = 'header-box drag-ghost';
    ghost.style.cssText = `left:${boxRect.left}px;top:${boxRect.top}px;width:${boxRect.width}px;`;
    document.body.appendChild(ghost);

    box.style.opacity = '0.3';

    const indicator = document.createElement('div');
    indicator.className = 'drag-indicator';
    vp.appendChild(indicator);

    const offsetX = e.clientX - boxRect.left;
    const startX = e.clientX;
    const positions = this.lifelines.filter(ll => ll.id !== id).map(ll => ({ id: ll.id, x: this.lx.get(ll.id) }));

    const getInsertIdx = mx => {
      for (let i = 0; i < positions.length; i++) {
        if (mx < positions[i].x) return i;
      }
      return positions.length;
    };

    const showIndicator = mx => {
      if (positions.length === 0) return;
      const insIdx = getInsertIdx(mx);
      const gap = (positions.length > 1) ? (positions[1].x - positions[0].x) : SeqDiagram.CFG.minGap;
      const halfGap = gap / 2;
      let ix;
      if (insIdx === 0) ix = positions[0].x - halfGap;
      else if (insIdx >= positions.length) ix = positions[positions.length - 1].x + halfGap;
      else ix = (positions[insIdx - 1].x + positions[insIdx].x) / 2;
      indicator.style.cssText = `left:${ix}px;top:${SeqDiagram.CFG.pad.t}px;bottom:${SeqDiagram.CFG.pad.b}px;`;
    };

    const onMove = ev => {
      ghost.style.left = (ev.clientX - offsetX) + 'px';
      ghost.style.top = (ev.clientY - 36) + 'px';
      const rect = diagram.getBoundingClientRect();
      showIndicator((ev.clientX - rect.left - this.panX) / this.zoom);
    };

    const onUp = ev => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      ghost.remove();
      box.style.opacity = '1';
      indicator.remove();
      document.body.style.cursor = '';

      if (Math.abs(ev.clientX - startX) > 6) {
        const rect = diagram.getBoundingClientRect();
        const mx = (ev.clientX - rect.left - this.panX) / this.zoom;
        const insIdx = getInsertIdx(mx);
        const fromIdx = this.lifelines.findIndex(ll => ll.id === id);
        if (fromIdx >= 0) {
          const adj = fromIdx < insIdx ? Math.max(0, insIdx - 1) : insIdx;
          if (adj !== fromIdx) {
            const [item] = this.lifelines.splice(fromIdx, 1);
            this.lifelines.splice(adj, 0, item);
            this.saveToStorage();
            this.render();
          }
        }
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  onDiagramClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'del-life') this.removeLifeline(id);
    else if (action === 'del-msg') this.removeMessage(id);
    else if (action === 'rename-life') this.renameLifeline(id);
  }

  openModal(id) { $(id).classList.add('active'); }

  closeModal(id) { $(id).classList.remove('active'); }

  closeAllModals() {
    document.querySelectorAll('.modal-backdrop.active').forEach(el => el.classList.remove('active'));
  }

  openMessageModal() {
    if (this.lifelines.length === 0) {
      this.toast('Add at least one lifeline first.');
      return;
    }
    const fromS = $('message-from');
    const toS = $('message-to');
    fromS.innerHTML = '';
    toS.innerHTML = '';
    this.lifelines.forEach(l => {
      fromS.innerHTML += `<option value="${l.id}">${l.name}</option>`;
      toS.innerHTML += `<option value="${l.id}">${l.name}</option>`;
    });
    if (toS.options.length > 1) toS.selectedIndex = 1;
    $('message-label').value = '';
    $('message-type').value = 'request';
    this.openModal('modal-message');
    setTimeout(() => $('message-label').focus(), 100);
  }

  addLifelineFromModal() {
    const name = $('lifeline-name').value.trim();
    if (!name) { this.toast('Please enter a lifeline name.'); return; }
    this.addLifeline(name);
    $('lifeline-name').value = '';
    this.closeModal('modal-lifeline');
  }

  addMessageFromModal() {
    const fromId = $('message-from').value;
    const toId = $('message-to').value;
    const label = $('message-label').value.trim();
    const type = $('message-type').value;
    if (!label) { this.toast('Please enter a message label.'); return; }
    this.addMessage(fromId, toId, label, type);
    $('message-label').value = '';
    this.closeModal('modal-message');
  }

  addLifeline(name) {
    const id = 'l' + this.nextId++;
    this.lifelines.push({ id, name });
    this.saveToStorage();
    this.render();
  }

  removeLifeline(id) {
    this.lifelines = this.lifelines.filter(l => l.id !== id);
    this.messages = this.messages.filter(m => m.fromId !== id && m.toId !== id);
    this.saveToStorage();
    this.render();
  }

  renameLifeline(id) {
    const l = this.lifelines.find(l => l.id === id);
    if (!l) return;
    const name = prompt('Rename lifeline:', l.name);
    if (name && name.trim() && name.trim() !== l.name) {
      l.name = name.trim();
      this.saveToStorage();
      this.render();
    }
  }

  addMessage(fromId, toId, label, type) {
    const id = 'm' + this.nextId++;
    this.messages.push({ id, fromId, toId, label, type });
    this.saveToStorage();
    this.render();
  }

  removeMessage(id) {
    this.messages = this.messages.filter(m => m.id !== id);
    this.saveToStorage();
    this.render();
  }

  saveToStorage() {
    localStorage.setItem('seqd', JSON.stringify({
      lifelines: this.lifelines,
      messages: this.messages,
      nextId: this.nextId
    }));
  }

  loadFromStorage() {
    try {
      const raw = localStorage.getItem('seqd');
      if (raw) {
        const d = JSON.parse(raw);
        if (d.lifelines && d.lifelines.length) {
          this.lifelines = d.lifelines;
          this.messages = d.messages || [];
          this.nextId = d.nextId || 1;
          return;
        }
      }
    } catch (_) {}
    this.setDefaultData();
  }

  setDefaultData() {
    this.lifelines = [
      { id: 'l1', name: 'User' },
      { id: 'l2', name: 'Server' },
      { id: 'l3', name: 'Database' }
    ];
    this.messages = [
      { id: 'm1', fromId: 'l1', toId: 'l2', label: 'Request', type: 'request' },
      { id: 'm2', fromId: 'l2', toId: 'l3', label: 'Query', type: 'request' },
      { id: 'm3', fromId: 'l3', toId: 'l2', label: 'Result', type: 'response' },
      { id: 'm4', fromId: 'l2', toId: 'l1', label: 'Response', type: 'response' }
    ];
    this.nextId = 10;
  }

  save() {
    this.saveToStorage();
    this.toast('Diagram saved!');
  }

  load() {
    if (this.lifelines.length > 0 || this.messages.length > 0) {
      if (!confirm('Load will replace your current diagram. Continue?')) return;
    }
    this.loadFromStorage();
    this.render();
    this.toast('Diagram loaded.');
  }

  clear() {
    if (this.lifelines.length === 0 && this.messages.length === 0) return;
    if (!confirm('Clear all elements?')) return;
    this.lifelines = [];
    this.messages = [];
    this.nextId = 1;
    localStorage.removeItem('seqd');
    this.render();
    this.toast('Diagram cleared.');
  }

  async exportPNG() {
    if (this.lifelines.length === 0) {
      this.toast('Nothing to export. Add lifelines first.');
      return;
    }
    if (typeof html2canvas === 'undefined') {
      this.toast('Export requires html2canvas library (needs internet).');
      return;
    }
    try {
      const diagram = $('diagram');
      const sv = { z: this.zoom, x: this.panX, y: this.panY };
      this.zoom = 1; this.panX = 0; this.panY = 0;
      this.applyTransform();
      diagram.style.overflow = 'visible';

      const vp = diagram.querySelector('.diagram-viewport');
      const canvas = await html2canvas(vp || diagram, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false
      });

      diagram.style.overflow = '';
      this.zoom = sv.z; this.panX = sv.x; this.panY = sv.y;
      this.applyTransform();

      const link = document.createElement('a');
      link.download = 'sequence-diagram.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      this.toast('Image exported!');
    } catch (err) {
      this.toast('Export failed: ' + err.message);
    }
  }

  render() {
    const container = $('diagram');
    const cw = Math.max(container.clientWidth || 800, 600);

    let vp = container.querySelector('.diagram-viewport');
    if (!vp) {
      container.innerHTML = '';
      vp = document.createElement('div');
      vp.className = 'diagram-viewport';
      container.appendChild(vp);
    }
    vp.innerHTML = '';

    if (this.lifelines.length === 0) {
      vp.innerHTML = '<div class="placeholder">Add a lifeline to get started</div>';
      return;
    }

    this.calcLayout(cw);
    const dims = this.getDims();
    container.style.cssText = 'position:relative;overflow:hidden;';
    vp.style.cssText = `min-width:${dims.w}px;min-height:${dims.h}px;`;
    this.applyTransform();

    const svg = this.createSVG();
    vp.appendChild(svg);

    this.drawStems(svg);
    this.drawArrows(svg);
    this.drawHeaders(vp);
    this.drawLabels(vp);
  }

  calcLayout(cw) {
    const { pad: p, minGap, hdrH, msgGap } = SeqDiagram.CFG;
    const n = this.lifelines.length;
    const avail = Math.max(300, cw - p.l - p.r);
    const gap = Math.max(minGap, n > 1 ? avail / (n - 1) : 0);
    this.lifelines.forEach((l, i) => {
      this.lx.set(l.id, n > 1 ? p.l + i * gap : cw / 2);
    });
    this.messages.forEach((m, i) => {
      m._y = p.t + hdrH + (i + 1) * msgGap;
    });
  }

  getDims() {
    const { pad: p, hdrH, msgGap, minH, minGap } = SeqDiagram.CFG;
    const n = this.lifelines.length;
    const w = Math.max(600, n > 0 ? p.l + (n - 1) * minGap + p.r : 600);
    const h = p.t + hdrH + Math.max(1, this.messages.length + 1) * msgGap + p.b;
    return { w, h: Math.max(minH, h) };
  }

  createSVG() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    const defs = document.createElementNS(ns, 'defs');

    const mkMarker = (id, fill, stroke) => {
      const m = document.createElementNS(ns, 'marker');
      m.setAttribute('id', id);
      m.setAttribute('viewBox', '0 0 10 10');
      m.setAttribute('refX', '10');
      m.setAttribute('refY', '5');
      m.setAttribute('markerWidth', '8');
      m.setAttribute('markerHeight', '8');
      m.setAttribute('orient', 'auto');
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', 'M0,0 L10,5 L0,10 z');
      if (fill) p.setAttribute('fill', fill);
      else { p.setAttribute('fill', 'none'); p.setAttribute('stroke', stroke); p.setAttribute('stroke-width', '1.5'); }
      m.appendChild(p);
      defs.appendChild(m);
    };

    mkMarker('ar-req', SeqDiagram.CFG.reqClr, null);
    mkMarker('ar-resp', null, SeqDiagram.CFG.respClr);

    svg.appendChild(defs);
    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;';
    return svg;
  }

  drawStems(svg) {
    const ns = 'http://www.w3.org/2000/svg';
    const { pad: p, hdrH, lifeClr } = SeqDiagram.CFG;
    const dims = this.getDims();
    this.lifelines.forEach(l => {
      const x = this.lx.get(l.id);
      if (x == null) return;
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', x);
      line.setAttribute('y1', p.t + hdrH + 6);
      line.setAttribute('x2', x);
      line.setAttribute('y2', dims.h - p.b);
      line.setAttribute('stroke', lifeClr);
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('stroke-dasharray', '6,4');
      svg.appendChild(line);
    });
  }

  drawArrows(svg) {
    const ns = 'http://www.w3.org/2000/svg';
    const { reqClr, respClr, selfOff, selfH } = SeqDiagram.CFG;
    this.messages.forEach(m => {
      const fromX = this.lx.get(m.fromId);
      const toX = this.lx.get(m.toId);
      if (fromX == null || toX == null) return;
      const y = m._y;
      if (m.fromId === m.toId) {
        this.drawSelfMsg(svg, m, fromX, y);
        return;
      }
      const isReq = m.type === 'request';
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', fromX);
      line.setAttribute('y1', y);
      line.setAttribute('x2', toX);
      line.setAttribute('y2', y);
      line.setAttribute('stroke', isReq ? reqClr : respClr);
      line.setAttribute('stroke-width', '2');
      line.setAttribute('marker-end', isReq ? 'url(#ar-req)' : 'url(#ar-resp)');
      if (!isReq) line.setAttribute('stroke-dasharray', '7,4');
      svg.appendChild(line);
    });
  }

  drawSelfMsg(svg, msg, lx, y) {
    const ns = 'http://www.w3.org/2000/svg';
    const { reqClr, selfOff: off, selfH: h } = SeqDiagram.CFG;
    const segs = [
      [lx, y, lx + off, y],
      [lx + off, y, lx + off, y + h],
      [lx + off, y + h, lx, y + h]
    ];
    const marks = [null, null, 'url(#ar-req)'];
    segs.forEach((s, i) => {
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', s[0]); line.setAttribute('y1', s[1]);
      line.setAttribute('x2', s[2]); line.setAttribute('y2', s[3]);
      line.setAttribute('stroke', reqClr);
      line.setAttribute('stroke-width', '2');
      if (marks[i]) line.setAttribute('marker-end', marks[i]);
      svg.appendChild(line);
    });
  }

  drawHeaders(container) {
    const { pad: p, hdrH } = SeqDiagram.CFG;
    this.lifelines.forEach(l => {
      const x = this.lx.get(l.id);
      if (x == null) return;
      const div = document.createElement('div');
      div.className = 'lifeline-header';
      div.style.cssText = `left:${x}px;top:${p.t}px;transform:translateX(-50%);`;

      const box = document.createElement('div');
      box.className = 'header-box';
      box.textContent = l.name;
      box.addEventListener('mousedown', e => this.onHeaderMouseDown(e, l.id));
      div.appendChild(box);

      const renameBtn = document.createElement('button');
      renameBtn.className = 'btn-rename-life';
      renameBtn.textContent = '\u270E';
      renameBtn.dataset.action = 'rename-life';
      renameBtn.dataset.id = l.id;
      renameBtn.title = 'Rename';
      div.appendChild(renameBtn);

      const del = document.createElement('button');
      del.className = 'btn-del-life';
      del.textContent = '\u00d7';
      del.dataset.action = 'del-life';
      del.dataset.id = l.id;
      div.appendChild(del);

      container.appendChild(div);
    });
  }

  drawLabels(container) {
    const { selfOff } = SeqDiagram.CFG;
    this.messages.forEach(m => {
      const fromX = this.lx.get(m.fromId);
      const toX = this.lx.get(m.toId);
      if (fromX == null || toX == null) return;
      const y = m._y;
      const label = document.createElement('div');
      label.className = 'message-label';

      let lx, ly;
      if (m.fromId === m.toId) {
        lx = fromX + selfOff / 2;
        ly = y - 20;
      } else {
        lx = (fromX + toX) / 2;
        ly = y - 22;
      }
      label.style.cssText = `left:${lx}px;top:${ly}px;transform:translateX(-50%);`;

      const span = document.createElement('span');
      span.className = 'msg-text';
      span.textContent = m.label;
      label.appendChild(span);

      const del = document.createElement('button');
      del.className = 'btn-del-msg';
      del.textContent = '\u00d7';
      del.dataset.action = 'del-msg';
      del.dataset.id = m.id;
      label.appendChild(del);

      container.appendChild(label);
    });
  }

  toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
  }
}

document.addEventListener('DOMContentLoaded', () => { new SeqDiagram(); });
