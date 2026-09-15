// ── PDF READER (utility process) ─────────────────────────────────────────────
// PDFs arrive from suppliers and from the internet (the gas price bulletin), so
// they are untrusted input. They are parsed here, in an Electron utility process:
// a separate OS process with no window, no database handle and no channel to the
// app's screens. A malformed or hostile file can at worst crash or stall this
// process, which the main process kills after a timeout.
//
// pdfjs-dist 4 (the line with the fix for arbitrary JavaScript execution when
// opening a crafted PDF) runs with eval disabled and no font loading - text and
// positions are all the app needs.
//
// Message in:  { bytes: Uint8Array, maxPages: number }
// Message out: { ok: true, items, pages, text, numPages } | { ok: false, error }

const HARD_PAGE_LIMIT = 20;
let pdfjs = null;

async function loadPdfjs() {
  if (pdfjs) return pdfjs;
  // pdfjs runs its parser in a worker. This process already is the isolation
  // boundary, so the worker module is loaded here and pdfjs uses it in-process -
  // no worker file URL to resolve inside the packaged app archive.
  globalThis.pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
  pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjs;
}

async function readPdf(bytes, maxPages) {
  pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  }).promise;
  try {
    const limit = Math.min(doc.numPages, Math.max(1, Math.min(Number(maxPages) || 5, HARD_PAGE_LIMIT)));
    const items = [];
    const pages = [];
    let text = '';
    for (let i = 1; i <= limit; i++) {
      const page = await doc.getPage(i);
      const { width, height } = page.getViewport({ scale: 1 });
      pages.push({ page: i, width, height });
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!item.str || !item.str.trim()) continue;
        const [a, b, , d, x, y] = item.transform || [];
        const h = item.height || Math.hypot(b || 0, d || 0) || Math.abs(a || 0) || 8;
        // Top-left origin, the way the bill reader and the screen think about a page.
        items.push({ str: item.str, x: x || 0, y: height - (y || 0) - h, w: item.width || 0, h, page: i });
        text += item.str + ' ';
      }
      text += '\n';
      page.cleanup();
    }
    return { ok: true, items, pages, text, numPages: doc.numPages };
  } finally {
    await doc.destroy();
  }
}

process.parentPort.on('message', async (event) => {
  const { bytes, maxPages } = event.data || {};
  try {
    if (!bytes || !bytes.length) throw new Error('empty_pdf');
    process.parentPort.postMessage(await readPdf(new Uint8Array(bytes), maxPages));
  } catch (err) {
    process.parentPort.postMessage({ ok: false, error: String((err && err.message) || err) });
  }
});
