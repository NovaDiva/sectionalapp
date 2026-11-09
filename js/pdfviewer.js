// Full-screen score viewer using PDF.js (bundled, so it works offline).
import * as pdfjsLib from '../vendor/pdfjs/pdf.min.mjs';
import { getBlob } from './db.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

// Renders every page of the PDF into `container`, lazily as pages scroll into view.
// Returns a controller with zoom in/out and destroy().
export async function renderScore(container, item, { onPage } = {}) {
  const blob = await getBlob(item.blobId);
  if (!blob) throw new Error('The score file is missing.');
  const data = new Uint8Array(await blob.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;

  let zoom = 1;
  const pages = [];
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  container.innerHTML = '';
  for (let n = 1; n <= pdf.numPages; n++) {
    const holder = document.createElement('div');
    holder.className = 'pdf-page';
    holder.dataset.page = n;
    container.appendChild(holder);
    pages.push({ n, holder, rendered: 0, task: null });
  }

  const first = await pdf.getPage(1);
  const base = first.getViewport({ scale: 1 });
  const ratio = base.height / base.width;

  function sizeHolders() {
    const width = Math.max(200, (container.clientWidth - 16) * zoom);
    for (const p of pages) {
      p.holder.style.width = `${width}px`;
      p.holder.style.height = `${width * ratio}px`;
    }
    return width;
  }

  async function renderPage(p) {
    const width = sizeHolders();
    if (p.rendered === width) return;
    p.rendered = width;
    if (p.task) { try { p.task.cancel(); } catch {} }
    const page = await pdf.getPage(p.n);
    const vp1 = page.getViewport({ scale: 1 });
    const scale = width / vp1.width;
    const vp = page.getViewport({ scale: scale * dpr });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.className = 'pdf-canvas';
    p.task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
    try {
      await p.task.promise;
      p.holder.style.height = `${width * (vp1.height / vp1.width)}px`;
      p.holder.querySelector('.pdf-canvas')?.remove();
      p.holder.prepend(canvas);
      onPage?.(p.n, p.holder);
    } catch { /* cancelled by a zoom change */ }
  }

  const visible = new Set();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const p = pages[Number(e.target.dataset.page) - 1];
      if (e.isIntersecting) { visible.add(p); renderPage(p); } else visible.delete(p);
    }
  }, { root: container, rootMargin: '600px 0px' });
  sizeHolders();
  pages.forEach((p) => io.observe(p.holder));

  function setZoom(z) {
    const top = container.scrollTop / (container.scrollHeight || 1);
    zoom = Math.max(0.5, Math.min(3, z));
    pages.forEach((p) => { p.rendered = 0; });
    sizeHolders();
    container.scrollTop = top * container.scrollHeight;
    visible.forEach(renderPage);
  }

  const onResize = () => setZoom(zoom);
  window.addEventListener('resize', onResize);

  return {
    pageCount: pdf.numPages,
    zoomIn: () => setZoom(zoom + 0.25),
    zoomOut: () => setZoom(zoom - 0.25),
    fit: () => setZoom(1),
    destroy() { io.disconnect(); window.removeEventListener('resize', onResize); pdf.destroy(); },
  };
}
