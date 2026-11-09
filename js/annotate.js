// Drawing on a score: pen, highlighter, typed notes, eraser and undo.
// Marks are stored on the score's item record as fractions of the page size,
// so they stay in place at any zoom:
//   item.annotations = { [pageNumber]: [ {k:'pen'|'hl', c, w, pts:[[x,y],…]} | {k:'text', c, x, y, text} ] }

import * as db from './db.js';

export const PEN_COLOURS = ['#1d1b20', '#c62828', '#1565c0'];
export const HL_COLOURS = ['#ffeb3b', '#7ee081', '#ff9ecb'];
const WIDTH = { pen: 0.0035, hl: 0.022 }; // fraction of page width
const TEXT_SIZE = 0.024; // fraction of page width

export function createAnnotator(item, { onChange } = {}) {
  const ann = structuredCloneSafe(item.annotations || {});
  const pages = new Map(); // page number -> { holder, canvas, layer }
  const undoStack = [];
  let tool = 'move';
  const colour = { pen: PEN_COLOURS[1], hl: HL_COLOURS[0], text: PEN_COLOURS[1] };
  let saveTimer = null;

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const fresh = await db.get('items', item.id);
      if (!fresh) return;
      fresh.annotations = ann;
      await db.put('items', fresh);
    }, 300);
    onChange?.();
  }

  function list(n) { return ann[n] || (ann[n] = []); }

  // ---------------------------------------------------------------- drawing
  function drawStroke(ctx, o, W, H) {
    if (!o.pts.length) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1, o.w * W);
    ctx.strokeStyle = o.c;
    if (o.k === 'hl') { ctx.globalAlpha = 0.38; ctx.globalCompositeOperation = 'multiply'; }
    ctx.beginPath();
    ctx.moveTo(o.pts[0][0] * W, o.pts[0][1] * H);
    if (o.pts.length === 1) ctx.lineTo(o.pts[0][0] * W + 0.1, o.pts[0][1] * H + 0.1);
    for (let i = 1; i < o.pts.length; i++) ctx.lineTo(o.pts[i][0] * W, o.pts[i][1] * H);
    ctx.stroke();
    ctx.restore();
  }

  function redraw(n, extra) {
    const pg = pages.get(n);
    if (!pg) return;
    const { canvas, layer, holder } = pg;
    const W = holder.clientWidth, H = holder.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // highlighter first so pen marks sit on top
    const objs = list(n);
    for (const o of objs) if (o.k === 'hl') drawStroke(ctx, o, W, H);
    for (const o of objs) if (o.k === 'pen') drawStroke(ctx, o, W, H);
    if (extra) drawStroke(ctx, extra, W, H);

    layer.replaceChildren(...objs.filter((o) => o.k === 'text').map((o) => {
      const d = document.createElement('div');
      d.className = 'ann-note';
      d.textContent = o.text;
      d.style.left = `${o.x * 100}%`;
      d.style.top = `${o.y * 100}%`;
      d.style.color = o.c;
      d.style.fontSize = `${Math.max(11, TEXT_SIZE * W)}px`;
      d.addEventListener('click', (e) => {
        if (tool === 'text') { e.stopPropagation(); editNote(n, o); }
        else if (tool === 'erase') { e.stopPropagation(); remove(n, o); }
      });
      return d;
    }));
  }

  // ---------------------------------------------------------------- edits
  function add(n, o) { list(n).push(o); undoStack.push({ n, op: 'add', o }); redraw(n); save(); }
  function remove(n, o) {
    const arr = list(n);
    const i = arr.indexOf(o);
    if (i < 0) return;
    arr.splice(i, 1);
    undoStack.push({ n, op: 'remove', o, i });
    redraw(n); save();
  }
  function editNote(n, o) {
    const text = prompt('Edit the note (empty to delete):', o.text);
    if (text == null) return;
    if (!text.trim()) { remove(n, o); return; }
    undoStack.push({ n, op: 'edit', o, before: o.text });
    o.text = text.trim();
    redraw(n); save();
  }

  function undo() {
    const u = undoStack.pop();
    if (!u) return false;
    const arr = list(u.n);
    if (u.op === 'add') { const i = arr.indexOf(u.o); if (i >= 0) arr.splice(i, 1); }
    else if (u.op === 'remove') arr.splice(Math.min(u.i, arr.length), 0, u.o);
    else if (u.op === 'edit') u.o.text = u.before;
    redraw(u.n); save();
    return true;
  }

  function clearAll() {
    for (const k of Object.keys(ann)) delete ann[k];
    undoStack.length = 0;
    pages.forEach((_, n) => redraw(n));
    save();
  }

  function count() { return Object.values(ann).reduce((a, arr) => a + arr.length, 0); }

  // ---------------------------------------------------------------- pointer input
  function eraseAt(n, x, y, W, H) {
    const tol = 14; // px
    const arr = list(n);
    for (let i = arr.length - 1; i >= 0; i--) {
      const o = arr[i];
      if (o.k === 'text') continue; // notes are erased by tapping them
      const reach = tol + (o.w * W) / 2;
      if (o.pts.some(([px, py]) => Math.hypot(px * W - x, py * H - y) <= reach)) { remove(n, o); return; }
    }
  }

  function wire(n, canvas, holder) {
    let current = null;
    let raf = 0;
    const pos = (e) => {
      const r = holder.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, W: r.width, H: r.height };
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (tool === 'move') return;
      e.preventDefault();
      canvas.setPointerCapture?.(e.pointerId);
      const p = pos(e);
      if (tool === 'pen' || tool === 'hl') {
        current = { k: tool, c: colour[tool], w: WIDTH[tool], pts: [[p.x / p.W, p.y / p.H]] };
        redraw(n, current);
      } else if (tool === 'erase') {
        current = { erasing: true };
        eraseAt(n, p.x, p.y, p.W, p.H);
      } else if (tool === 'text') {
        const text = prompt('Type your note:');
        if (text && text.trim()) add(n, { k: 'text', c: colour.text, x: p.x / p.W, y: p.y / p.H, text: text.trim() });
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!current) return;
      e.preventDefault();
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of events.length ? events : [e]) {
        const p = pos(ev);
        if (current.erasing) eraseAt(n, p.x, p.y, p.W, p.H);
        else current.pts.push([p.x / p.W, p.y / p.H]);
      }
      if (!current.erasing && !raf) raf = requestAnimationFrame(() => { raf = 0; if (current) redraw(n, current); });
    });
    const finish = () => {
      if (current && !current.erasing && current.pts.length) {
        current.pts = current.pts.map(([x, y]) => [round(x), round(y)]);
        add(n, current);
      }
      current = null;
    };
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', finish);
  }

  // Called by the PDF viewer each time a page is drawn (also after zooming).
  function attach(n, holder) {
    let canvas = holder.querySelector('.ann-canvas');
    let layer = holder.querySelector('.ann-layer');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'ann-canvas';
      layer = document.createElement('div');
      layer.className = 'ann-layer';
      holder.append(canvas, layer);
      wire(n, canvas, holder);
    }
    pages.set(n, { holder, canvas, layer });
    applyTool(holder);
    redraw(n);
  }

  function applyTool(holder) {
    holder.classList.toggle('drawing', tool !== 'move');
    holder.dataset.tool = tool;
  }

  return {
    attach,
    undo,
    clearAll,
    count,
    get tool() { return tool; },
    setTool(t) { tool = t; pages.forEach(({ holder }) => applyTool(holder)); },
    colourFor: (t) => colour[t],
    setColour(t, c) { colour[t] = c; },
    flush() { clearTimeout(saveTimer); return (async () => { const f = await db.get('items', item.id); if (f) { f.annotations = ann; await db.put('items', f); } })(); },
  };
}

function round(v) { return Math.round(v * 10000) / 10000; }
function structuredCloneSafe(o) { return JSON.parse(JSON.stringify(o)); }
