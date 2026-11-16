/* ═══════════════════════════════════════════════════════════════════════════
 *  EGYGRILLZ — CLOUDFLARE WORKER  (single file, paste into the dashboard)
 *  ---------------------------------------------------------------------------
 *  1. Telegram bot — schedule, clients, money, invoices, quotes, PDF files
 *  2. Instant alerts — new booking, new message
 *  3. Automatic — daily 12:00 tomorrow summary, 1st of month full report
 *  4. PDF generator — real PDF files, no dependencies
 *
 *  Secrets (Settings -> Variables and Secrets):
 *    FIREBASE_API_KEY    required
 *    STAFF_EMAIL         required
 *    STAFF_PASSWORD      required
 *    TELEGRAM_BOT_TOKEN  required
 *    TELEGRAM_CHAT_ID    required
 *    CRON_SECRET         optional
 *    PDF_KEY             optional
 *
 *  Check it works:  GET /api/telegram/check
 *  Cron Trigger:    * * * * *
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ═══════════════ PDF ENGINE ═══════════════ */

/* ═══════════════════════════════════════════════════════════════════════════
 *  EGYGRILLZ — PDF GENERATOR (pure JS, no dependencies)
 *  ---------------------------------------------------------------------------
 *  Builds a real PDF byte stream by hand. Works inside a Cloudflare Worker
 *  because it never touches a canvas, a font file or a DOM.
 *
 *  Uses the 14 standard PDF fonts (Helvetica / Times) which every reader has,
 *  so the file stays at a few kilobytes and opens everywhere.
 *
 *  Not supported: Arabic glyphs. Those get transliterated away by ascii()
 *  so a PDF never comes out as garbage boxes.
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────── text safety ─────────────────────────── */

const MAP = {
  '—': '-', '–': '-', '·': '-', '×': 'x', '’': "'", '‘': "'",
  '“': '"', '”': '"', '…': '...', '•': '-', '،': ',', '؟': '?',
  'ٔ': '', 'ء': '', 'أ': 'a', 'إ': 'i', 'آ': 'a', 'ا': 'a', 'ب': 'b',
  'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'dh',
  'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't',
  'ظ': 'z', 'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l',
  'م': 'm', 'ن': 'n', 'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ة': 'a',
  'ﻻ': 'la', '\u064B': '', '\u064C': '', '\u064D': '', '\u064E': '',
  '\u064F': '', '\u0650': '', '\u0651': '', '\u0652': '',
};

/** Make any string safe for a standard PDF font */
function ascii(str) {
  let out = '';
  for (const ch of String(str == null ? '' : str)) {
    if (MAP[ch] !== undefined) { out += MAP[ch]; continue; }
    const c = ch.codePointAt(0);
    if (c === 10) { out += '\n'; continue; }
    if (c >= 0x20 && c <= 0x7e) { out += ch; continue; }
    if (c >= 0xa0 && c <= 0xff) { out += ch; continue; }
  }
  return out;
}

/** Escape for a PDF literal string */
function pdfStr(s) {
  return ascii(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/*  Helvetica widths (per 1000 units) — enough for correct right alignment  */
const W = {
  ' ': 278, '!': 278, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667, "'": 191,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278,
  J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722,
  S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222,
  j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333,
  s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  0: 556, 1: 556, 2: 556, 3: 556, 4: 556, 5: 556, 6: 556, 7: 556, 8: 556, 9: 556,
};

/** Approximate rendered width of a string at a font size */
function textWidth(str, size) {
  let w = 0;
  for (const ch of ascii(str)) w += (W[ch] !== undefined ? W[ch] : 500);
  return (w / 1000) * size;
}

/** Wrap text to a max width */
function wrap(str, size, maxWidth) {
  const words = ascii(str).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (textWidth(test, size) > maxWidth && line) {
      lines.push(line); line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/* ─────────────────────────── canvas ─────────────────────────── */

const A4 = { w: 595.28, h: 841.89 };

class Page {
  constructor(doc) {
    this.doc = doc;
    this.ops = [];
  }
  /** filled rectangle — y measured from the TOP, same as text() */
  rect(x, y, w, h, color, opacity) {
    const c = hex(color);
    const op = opacity === undefined ? '' : ` /GS${this.doc.gs(opacity)} gs`;
    const py = A4.h - y - h;
    this.ops.push(`q ${c} rg${op} ${fmt(x)} ${fmt(py)} ${fmt(w)} ${fmt(h)} re f Q`);
    return this;
  }
  /** text at x,y (y measured from the top of the page) */
  text(str, x, y, opt = {}) {
    const size = opt.size || 9;
    const font = opt.bold ? 'F2' : (opt.serif ? (opt.bold ? 'F4' : 'F3') : 'F1');
    let tx = x;
    if (opt.align === 'right') tx = x - textWidth(str, size);
    else if (opt.align === 'center') tx = x - textWidth(str, size) / 2;
    const color = hex(opt.color || '#000000');
    this.ops.push(`BT ${color} rg /${font} ${size} Tf ${fmt(tx)} ${fmt(A4.h - y)} Td (${pdfStr(str)}) Tj ET`);
    return this;
  }
  /** wrapped paragraph, returns the y after the last line */
  para(str, x, y, maxWidth, opt = {}) {
    const size = opt.size || 9;
    const lh = opt.lineHeight || size * 1.45;
    for (const line of wrap(str, size, maxWidth)) {
      this.text(line, x, y, opt);
      y += lh;
    }
    return y;
  }
  line(x1, y1, x2, y2, color = '#dddddd', width = 0.6) {
    const c = hex(color);
    this.ops.push(`q ${c} RG ${fmt(width)} w ${fmt(x1)} ${fmt(A4.h - y1)} m ${fmt(x2)} ${fmt(A4.h - y2)} l S Q`);
  }
}

const fmt = (n) => (Math.round(n * 100) / 100).toString();

function hex(h) {
  const s = String(h).replace('#', '');
  const r = parseInt(s.slice(0, 2), 16) / 255;
  const g = parseInt(s.slice(2, 4), 16) / 255;
  const b = parseInt(s.slice(4, 6), 16) / 255;
  return `${fmt(r)} ${fmt(g)} ${fmt(b)}`;
}

/* ─────────────────────────── document ─────────────────────────── */

class PdfDoc {
  constructor() {
    this.pages = [];
    this._gs = new Map();
    this.createPage();
    this.meta = {
      title: 'EGYGRILLZ',
      author: 'EGYGRILLZ',
      subject: '',
    };
  }
  createPage() {
    const p = new Page(this);
    this.pages.push(p);
    this.current = p;
    return p;
  }
  gs(opacity) {
    const key = String(opacity);
    if (!this._gs.has(key)) this._gs.set(key, this._gs.size + 1);
    return this._gs.get(key);
  }
  /** Serialise to a Uint8Array */
  build() {
    const objs = [];
    const add = (body) => { objs.push(body); return objs.length; };

    // 1 catalogue, 2 pages tree — filled after we know page ids
    const catalogId = add(null);
    const pagesId = add(null);

    const fontIds = {
      F1: add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
      F2: add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'),
      F3: add('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>'),
      F4: add('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>'),
    };

    // opacity states
    const gsIds = [];
    for (const [key, idx] of this._gs) {
      gsIds[idx] = add(`<< /Type /ExtGState /ca ${key} /CA ${key} >>`);
    }

    const pageIds = [];
    for (const page of this.pages) {
      const content = page.ops.join('\n');
      const contentId = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      const res = `<< /Font << /F1 ${fontIds.F1} 0 R /F2 ${fontIds.F2} 0 R /F3 ${fontIds.F3} 0 R /F4 ${fontIds.F4} 0 R >>` +
        (gsIds.length ? ` /ExtGState << ${gsIds.map((id, i) => `/GS${i + 1} ${id} 0 R`).join(' ')} >>` : '') + ' >>';
      const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${fmt(A4.w)} ${fmt(A4.h)}] /Resources ${res} /Contents ${contentId} 0 R >>`);
      pageIds.push(pageId);
    }

    objs[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objs[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

    const infoId = add(`<< /Title (${pdfStr(this.meta.title)}) /Author (${pdfStr(this.meta.author)}) /Subject (${pdfStr(this.meta.subject)}) /Producer (EGYGRILLZ) >>`);

    // assemble
    let out = '%PDF-1.4\n';
    const offsets = [];
    for (let i = 0; i < objs.length; i++) {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${objs[i]}\nendobj\n`;
    }
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\n`;
    out += `startxref\n${xref}\n%%EOF`;

    // to bytes (latin1)
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }
}

/* ─────────────────────────── quotation ─────────────────────────── */

const money = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * Build a quotation PDF.
 * @param {object} q  { clientName, clientPhone, clientEmail, notes, createdAt, id, order, lines }
 * @param {object} opt { studioName, address[], validDays }
 */
function buildQuotePdf(q, opt = {}) {
  const doc = new PdfDoc();
  const M = 46;
  const Wd = A4.w - M * 2;
  const order = q.order || { lines: [], linesSubtotal: 0, total: 0 };
  const lines = order.lines || q.lines || [];
  const cur = order.currency || 'EGP';
  const studio = opt.studioName || 'EGYGRILLZ';
  const address = opt.address || [
    'Inside Smart Smile Clinics',
    '38 Abou Bakr EL-Sdeek, Heliopolis',
    'Floor 5, Apt 504 - Cairo, Egypt',
  ];

  doc.meta.title = `${studio} - Quotation`;
  doc.meta.subject = q.clientName || '';

  const p = doc.current;
  let y = 0;

  /* ── header band ── */
  p.rect(0, 0, A4.w, 112, '#1f1f1f');
  p.text(studio, M, 46, { size: 21, serif: true, bold: true, color: '#ffffff' });
  p.text('CUSTOM GRILLZ STUDIO', M, 62, { size: 7, color: '#bdbdbd' });
  address.forEach((l, i) => p.text(l, M, 74 + i * 9.5, { size: 7, color: '#9a9a9a' }));

  p.text('QUOTATION', A4.w - M, 44, { size: 13, serif: true, bold: true, color: '#ffffff', align: 'right' });
  const dateStr = new Date(q.createdAt || Date.now()).toISOString().slice(0, 10);
  p.text(dateStr, A4.w - M, 62, { size: 8, color: '#bdbdbd', align: 'right' });
  if (q.id) p.text('No. ' + String(q.id).slice(-8).toUpperCase(), A4.w - M, 74, { size: 8, color: '#bdbdbd', align: 'right' });

  y = 146;

  /* ── client ── */
  p.text('PREPARED FOR', M, y, { size: 7, color: '#9a9a9a' });
  y += 16;
  p.text(q.clientName || 'Client', M, y, { size: 13, serif: true, bold: true });
  y += 15;
  if (q.clientPhone) { p.text(q.clientPhone, M, y, { size: 8.5, color: '#555555' }); y += 12; }
  if (q.clientEmail) { p.text(q.clientEmail, M, y, { size: 8.5, color: '#555555' }); y += 12; }

  /* ── table header ── */
  y += 14;
  p.rect(M, y - 11, Wd, 22, '#f3f3f3');
  p.text('DESIGN', M + 8, y + 3, { size: 7, color: '#6b6b6b' });
  p.text('DETAILS', M + 190, y + 3, { size: 7, color: '#6b6b6b' });
  p.text('AMOUNT', A4.w - M - 8, y + 3, { size: 7, color: '#6b6b6b', align: 'right' });
  y += 26;

  /* ── designs ── */
  lines.forEach((l, i) => {
    if (y > A4.h - 190) {
      doc.createPage();
      y = 70;
    }
    const label = lineLabel(l);
    const detail = designDetail(l);

    p.text(`${i + 1}.`, M + 8, y, { size: 9, bold: true });
    p.text(label, M + 26, y, { size: 9 });
    p.text(money(l.subtotal) + ' ' + cur, A4.w - M - 8, y, { size: 9, bold: true, align: 'right' });
    y += 12;
    if (detail) {
      p.text(detail, M + 26, y, { size: 7.2, color: '#8a8a8a' });
      y += 11;
    }
    y += 4;
    p.line(M + 8, y, A4.w - M - 8, y, '#eeeeee', 0.4);
    y += 12;
  });

  const services = order.services || q.services || [];
  if (!lines.length && !services.length) {
    p.text('No designs or services on this quotation.', M + 8, y, { size: 9, color: '#8a8a8a' });
    y += 24;
  }

  services.forEach((s, idx) => {
    if (y > A4.h - 190) {
      doc.createPage();
      y = 70;
    }
    const label = (s.name || s.type || 'Studio Service') + (Number(s.qty) > 1 ? ` (x${s.qty})` : '');
    p.text(`${lines.length + idx + 1}.`, M + 8, y, { size: 9, bold: true });
    p.text(label, M + 26, y, { size: 9 });
    p.text(money(s.subtotal) + ' ' + cur, A4.w - M - 8, y, { size: 9, bold: true, align: 'right' });
    y += 12;
    if (s.notes) {
      p.text(String(s.notes), M + 26, y, { size: 7.2, color: '#8a8a8a' });
      y += 11;
    }
    y += 4;
    p.line(M + 8, y, A4.w - M - 8, y, '#eeeeee', 0.4);
    y += 12;
  });

  /* ── totals ── */
  if (y > A4.h - 150) { doc.createPage(); y = 70; }
  y += 4;
  const left = A4.w - M - 210;
  const right = A4.w - M - 8;

  const kv = (k, v, bold) => {
    p.text(k, left, y, { size: bold ? 10 : 8.5, bold, color: bold ? '#1f1f1f' : '#6b6b6b' });
    p.text(v, right, y, { size: bold ? 10 : 8.5, bold, align: 'right' });
    y += bold ? 18 : 13;
  };

  kv('Lines subtotal', money(order.linesSubtotal) + ' ' + cur);
  if (order.servicesSubtotal) kv('Services subtotal', money(order.servicesSubtotal) + ' ' + cur);
  if (order.timelineAmount) kv(`Timeline (+${order.timelinePct || 0}%)`, money(order.timelineAmount) + ' ' + cur);
  if (order.moldCost) kv('Mold', money(order.moldCost) + ' ' + cur);
  if (order.discountAmount) kv('Discount', '-' + money(order.discountAmount) + ' ' + cur);

  y += 2;
  p.rect(left - 10, y - 13, right - left + 18, 28, '#1f1f1f');
  p.text('TOTAL', left, y + 4, { size: 11, serif: true, bold: true, color: '#ffffff' });
  p.text(money(order.total) + ' ' + cur, right, y + 4, { size: 12, bold: true, color: '#ffffff', align: 'right' });
  y += 34;

  const depPct = Number(order.depositPct) || 0;
  if (depPct) {
    kv(`Deposit (${depPct}%)`, money(order.deposit) + ' ' + cur);
    kv('Balance before delivery', money(order.balance) + ' ' + cur);
  }

  /* ── notes ── */
  if (q.notes) {
    if (y > A4.h - 110) { doc.createPage(); y = 70; }
    y += 8;
    p.text('NOTES', M, y, { size: 7, color: '#9a9a9a' });
    y += 13;
    y = p.para(q.notes, M, y, Wd, { size: 8.5, color: '#4a4a4a', lineHeight: 12 });
  }

  /* ── footer on every page ── */
  const validDays = opt.validDays || 14;
  doc.pages.forEach((pg, i) => {
    pg.line(M, A4.h - 52, A4.w - M, A4.h - 52, '#e4e4e4', 0.5);
    pg.text(`This quotation is valid for ${validDays} days. Prices are confirmed once the deposit is paid.`, M, A4.h - 38, { size: 7, color: '#9a9a9a' });
    pg.text(`${studio} - egygrillz.com`, A4.w - M, A4.h - 38, { size: 7, color: '#9a9a9a', align: 'right' });
    if (doc.pages.length > 1) {
      pg.text(`${i + 1} / ${doc.pages.length}`, A4.w / 2, A4.h - 38, { size: 7, color: '#c0c0c0', align: 'center' });
    }
  });

  return doc.build();
}

/** Short human label for a design or service line */
function lineLabel(l) {
  if (l && l.kind === 'service') {
    const qty = Number(l.teeth) > 1 ? ` (${l.teeth}x)` : '';
    return `${l.serviceLabel || l.service || 'Studio Service'}${qty}`;
  }
  const mat = l.material === 'gold' ? `Gold ${l.karat || '18'}K` : String(l.material || '');
  const bits = [`${mat} / ${l.teeth || 0} teeth / level ${l.level || '1'}`];
  if (l.accent && l.accent.count) bits.push(`${l.accent.count}x ${l.accent.type || ''}`.trim());
  if (l.full && l.full.bars) bits.push('full iced on bars');
  else if (l.full) bits.push(`full iced ${l.full.type || ''}`.trim());
  if (l.plating && l.plating !== 'none') bits.push(String(l.plating));
  if (l.anodize && l.anodize !== 'none') bits.push('anodize ' + l.anodize);
  if (l.enamel && l.enamel !== 'none') bits.push('enamel ' + l.enamel);
  if (l.engraving && l.engraving !== 'none') bits.push('engraving ' + l.engraving);
  return bits.join('  -  ');
}

function designDetail(l) {
  const bits = [];
  if (l.materialTotal) bits.push(`metal ${money(l.materialTotal)}`);
  if (l.designCost) bits.push(`design ${money(l.designCost)}`);
  if (l.stoneCost) bits.push(`stones ${money(l.stoneCost)}`);
  if (l.platingCost) bits.push(`plating ${money(l.platingCost)}`);
  if (l.anodizeCost) bits.push(`anodizing ${money(l.anodizeCost)}`);
  if (l.enamelCost) bits.push(`enamel ${money(l.enamelCost)}`);
  if (l.engravingCost) bits.push(`engraving ${money(l.engravingCost)}`);
  return bits.join('   ');
}

/* ─────────────────────────── simple report ─────────────────────────── */

/** A4 report from a plain multi-line text — used for the monthly digest */
function buildTextPdf(title, body, opt = {}) {
  const doc = new PdfDoc();
  const M = 46;
  const Wd = A4.w - M * 2;
  const p = doc.current;

  p.rect(0, 0, A4.w, 74, '#1f1f1f');
  p.text(opt.studioName || 'EGYGRILLZ', M, 36, { size: 17, serif: true, bold: true, color: '#ffffff' });
  p.text(title, M, 56, { size: 9, color: '#cfcfcf' });
  p.text(new Date().toISOString().slice(0, 10), A4.w - M, 56, { size: 8, color: '#9a9a9a', align: 'right' });

  let y = 104;
  let page = p;
  for (const raw of String(body).split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (y > A4.h - 60) {
      page = doc.createPage();
      y = 60;
    }
    if (!line) { y += 7; continue; }
    if (/^[A-Z][A-Z \-]{2,}$/.test(line.trim()) && line.trim().length < 40) {
      y += 4;
      page.text(line.trim(), M, y, { size: 8.5, bold: true, color: '#1f1f1f' });
      y += 4;
      page.line(M, y, A4.w - M, y, '#e4e4e4', 0.5);
      y += 13;
      continue;
    }
    const isRule = /^[─\-]{3,}$/.test(line.trim());
    if (isRule) { page.line(M, y, A4.w - M, y, '#e4e4e4', 0.5); y += 10; continue; }
    const wrapped = wrap(line, 8.5, Wd);
    for (const w of wrapped) {
      if (y > A4.h - 60) { page = doc.createPage(); y = 60; }
      page.text(w, M, y, { size: 8.5, color: '#3a3a3a' });
      y += 12.5;
    }
  }

  doc.pages.forEach((pg, i) => {
    pg.text('EGYGRILLZ - egygrillz.com', M, A4.h - 34, { size: 7, color: '#b0b0b0' });
    pg.text(`${i + 1} / ${doc.pages.length}`, A4.w - M, A4.h - 34, { size: 7, color: '#b0b0b0', align: 'right' });
  });

  return doc.build();
}


/* ═══════════════ TELEGRAM BOT ═══════════════ */

/* ═══════════════════════════════════════════════════════════════════════════
 *  EGYGRILLZ — TELEGRAM BOT
 *  ---------------------------------------------------------------------------
 *  A real assistant inside Telegram. Plain text only, no emoji, aligned
 *  columns, fixed commands. Talks to Firestore over REST (no SDK on Workers).
 *
 *  Commands
 *    /start /help          command list
 *    /today                today's schedule
 *    /tomorrow             tomorrow's schedule
 *    /week                 next 7 days
 *    /month                next 30 days
 *    /all                  everything upcoming
 *    /next                 the single next appointment
 *    /stats                counts: today / week / month / revenue
 *    /find <text>          search by name, phone or service
 *    /phone <number>       everything for one client
 *    /money                revenue this month + pending
 *    /noshow               no-show log with rates
 *    /unsent               tomorrow's clients with no reminder sent yet
 *    /clients              top clients by visits
 *    /services             most booked services
 *    /slots                how full the next 7 days are
 *    /digest               push tomorrow's summary now
 *    /id                   show your chat id
 * ═══════════════════════════════════════════════════════════════════════════ */


const FS_PROJECT = 'egygrillz-studio';
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${FS_PROJECT}/databases/(default)/documents`;
const FS_DOC = FS_BASE;

/* ─────────────────────────── dates ─────────────────────────── */

const TZ_OFFSET_MS = 2 * 60 * 60 * 1000;                 // Cairo = UTC+2, no DST

/** YYYY-MM-DD for "now + n days" in Cairo */
function cairoDay(n = 0, now = new Date()) {
  const d = new Date(now.getTime() + TZ_OFFSET_MS);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "Sunday 16 November" — readable, no locale surprises */
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function prettyDate(iso) {
  if (!iso || typeof iso !== 'string') return iso || '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${DAY_NAMES[d.getUTCDay()]} ${+m[3]} ${MONTH_NAMES[+m[2] - 1]}`;
}

function shortDate(iso) {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso).trim());
  return m ? `${+m[3]} ${MONTH_NAMES[+m[2] - 1].slice(0, 3)}` : String(iso);
}

/** "6:00 PM" → 18 * 60 ; returns 0 when unparseable */
function timeToMinutes(t) {
  const s = String(t || '').trim().toUpperCase();
  const m = /^(\d{1,2})[:.]?(\d{2})?\s*(AM|PM)?$/.exec(s);
  if (!m) return 0;
  let h = +m[1];
  const min = +(m[2] || 0);
  const ap = m[3];
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

/* ─────────────────────────── money ─────────────────────────── */

/** Pulls the first number out of "1,200 EGP" / "1200" / "From 800" */
function parsePrice(v) {
  if (v === null || v === undefined) return 0;
  const m = String(v).replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return m ? Math.round(parseFloat(m[1])) : 0;
}

/* ─────────────────────────── fields ─────────────────────────── */

const fsVal = (f) => {
  if (!f || typeof f !== 'object') return '';
  if (f.stringValue !== undefined) return f.stringValue;
  if (f.integerValue !== undefined) return Number(f.integerValue);
  if (f.doubleValue !== undefined) return Number(f.doubleValue);
  if (f.booleanValue !== undefined) return f.booleanValue;
  if (f.timestampValue !== undefined) return f.timestampValue;
  return '';
};

const toBool = (v) => {
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  return undefined;
};

/** Firestore doc → flat appointment object */
function mapAppointment(doc) {
  const f = (doc && doc.fields) || {};
  return {
    id: (doc.name || '').split('/').pop(),
    name: String(fsVal(f.name) || ''),
    phone: String(fsVal(f.phone) || ''),
    email: String(fsVal(f.email) || ''),
    service: String(fsVal(f.service) || ''),
    date: String(fsVal(f.date) || ''),
    time: String(fsVal(f.time) || ''),
    notes: String(fsVal(f.notes) || ''),
    status: String(fsVal(f.status) || 'pending'),
    price: parsePrice(fsVal(f.price)) || parsePrice(fsVal(f.service)),
    deposit: parsePrice(fsVal(f.deposit)),
    reminderSentAt: fsVal(f.reminderSentAt),
    showedUp: toBool(fsVal(f.showedUp)),
    paid: toBool(fsVal(f.paid)),
  };
}


/* ─────────────────────────── staff sign-in ───────────────────────────
 * The Firestore rules only let signed-in staff read appointments, clients,
 * invoices and quotes. An API key alone is anonymous, so every read came
 * back 403 — that is why the bot could not open anything.
 *
 * With STAFF_EMAIL + STAFF_PASSWORD set the Worker signs in once, keeps the
 * token in memory, and refreshes it when it expires. Nothing is stored in
 * the database and no extra Firebase permission is needed.
 * ──────────────────────────────────────────────────────────────────── */

const IDENTITY_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword';
let _token = { value: '', expires: 0, key: '' };

/** Returns a valid staff idToken, or '' when the secrets are not set. */
async function staffToken(env, fetchImpl = fetch) {
  const email = env.STAFF_EMAIL;
  const password = env.STAFF_PASSWORD;
  if (!email || !password || !env.FIREBASE_API_KEY) return '';
  const now = Date.now();
  const sig = email + '|' + password + '|' + env.FIREBASE_API_KEY;
  if (_token.value && now < _token.expires && _token.key === sig) return _token.value;
  try {
    const r = await fetchImpl(`${IDENTITY_URL}?key=${env.FIREBASE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    if (!r.ok) { _token = { value:'', expires:0, key:'' }; return ''; }
    const d = await r.json().catch(() => ({}));
    if (!d.idToken) { _token = { value:'', expires:0, key:'' }; return ''; }
    const ttl = (Number(d.expiresIn) || 3600) * 1000;
    _token = { value: d.idToken, expires: now + ttl - 60_000, key: sig };  // refresh a minute early
    return _token.value;
  } catch (e) {
    return '';
  }
}

/** Headers for a Firestore call — signed when we can, anonymous otherwise. */
async function fsHeaders(env, fetchImpl = fetch) {
  const token = await staffToken(env, fetchImpl);
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  return h;
}

/* ─────────────────────────── firestore ─────────────────────────── */

/**
 * Human explanation for every way the database read can fail.
 * The bot never shows a technical code — the studio cannot act on one.
 */
function fsErrorText(err) {
  switch (String(err || '')) {
    case 'no-firebase-key':
      return 'I am not connected to the database yet.\n'
        + 'In Cloudflare open your Worker -> Settings -> Variables and Secrets,\n'
        + 'add FIREBASE_API_KEY, paste the Firebase web key, then Save and Deploy.';
    case 'permission-denied':
    case 'firestore-403':
      return 'The database is refusing to let me read.\n'
        + 'Firestore -> Rules: ensure isStaff() includes this Firebase Auth user UID.';
    case 'not-found':
    case 'firestore-404':
      return 'Firestore cannot find that. Check the project id is egygrillz-studio.';
    case 'bad-key':
    case 'firestore-400':
      return 'The Firebase key in Cloudflare is not accepted.\n'
        + 'Copy it again from Firebase -> Project settings -> Web app -> apiKey.';
    default:
      return 'Could not read the database. Reason: ' + (err || 'unknown');
  }
}

/** Map an HTTP status from Firestore to a short cause */
function fsCause(status) {
  if (status === 403) return 'permission-denied';
  if (status === 404) return 'not-found';
  if (status === 400) return 'bad-key';
  return 'firestore-' + status;
}

async function fsQuery(env, structuredQuery, fetchImpl = fetch) {
  if (!env.FIREBASE_API_KEY) return { ok: false, error: 'no-firebase-key', rows: [] };
  let r;
  try {
    r = await fetchImpl(`${FS_BASE}:runQuery?key=${env.FIREBASE_API_KEY}`, {
      method: 'POST',
      headers: await fsHeaders(env, fetchImpl),
      body: JSON.stringify({ structuredQuery }),
    });
  } catch (e) {
    return { ok: false, error: 'network', rows: [] };
  }
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    return { ok: false, error: fsCause(r.status), detail: t.slice(0, 160), rows: [] };
  }
  const json = await r.json().catch(() => []);
  const rows = (Array.isArray(json) ? json : []).filter(x => x && x.document).map(x => x.document);
  return { ok: true, rows };
}

/** All appointments in a date range [fromIso, toIso] inclusive */
async function fetchRange(env, fromIso, toIso, fetchImpl = fetch) {
  const q = {
    from: [{ collectionId: 'appointments' }],
    where: {
      compositeFilter: {
        op: 'AND',
        filters: [
          { fieldFilter: { field: { fieldPath: 'date' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: fromIso } } },
          { fieldFilter: { field: { fieldPath: 'date' }, op: 'LESS_THAN_OR_EQUAL', value: { stringValue: toIso } } },
        ],
      },
    },
    orderBy: [{ field: { fieldPath: 'date' }, direction: 'ASCENDING' }],
    limit: 2000,
  };
  const res = await fsQuery(env, q, fetchImpl);
  if (!res.ok) return { ok: false, error: res.error, detail: res.detail, appts: [] };
  return { ok: true, appts: res.rows.map(mapAppointment) };
}

/** Appointments for exactly one day */
async function fetchDay(env, iso, fetchImpl = fetch) {
  const q = {
    from: [{ collectionId: 'appointments' }],
    where: { fieldFilter: { field: { fieldPath: 'date' }, op: 'EQUAL', value: { stringValue: iso } } },
    limit: 500,
  };
  const res = await fsQuery(env, q, fetchImpl);
  if (!res.ok) return { ok: false, error: res.error, detail: res.detail, appts: [] };
  return { ok: true, appts: res.rows.map(mapAppointment) };
}

/** Read a whole collection — used for invoices and quotes */
async function fetchCollection(env, name, fetchImpl = fetch) {
  if (!env.FIREBASE_API_KEY) return { ok: false, error: 'no-firebase-key', rows: [] };
  const q = { from: [{ collectionId: String(name) }], limit: 500 };
  const res = await fsQuery(env, q, fetchImpl);
  if (!res.ok) return { ok: false, error: res.error, rows: [] };
  return { ok: true, rows: res.rows };
}

/** invoice / quote doc → flat object */
function mapInvoice(doc) {
  const f = (doc && doc.fields) || {};
  const itemVals = (f.items && f.items.arrayValue && f.items.arrayValue.values) || [];
  const itemsSum = Array.isArray(itemVals)
    ? itemVals.reduce((sum, entry) => {
        const mf = (entry && entry.mapValue && entry.mapValue.fields) || {};
        const qty = Number(fsVal(mf.qty)) || 1;
        const unit = parsePrice(fsVal(mf.price)) || parsePrice(fsVal(mf.subtotal)) || parsePrice(fsVal(mf.amount));
        return sum + (parsePrice(fsVal(mf.total)) || (qty * unit));
      }, 0)
    : 0;
  const total = parsePrice(fsVal(f.total)) || parsePrice(fsVal(f.amount)) || parsePrice(fsVal(f.subtotal)) || itemsSum;
  const lines = (Array.isArray(itemVals) ? itemVals : []).map((entry) => {
    const mf = (entry && entry.mapValue && entry.mapValue.fields) || {};
    return {
      name: String(fsVal(mf.name) || fsVal(mf.label) || ''),
      spec: String(fsVal(mf.spec) || ''),
      qty: Number(fsVal(mf.qty)) || 1,
      price: parsePrice(fsVal(mf.price)) || parsePrice(fsVal(mf.subtotal)) || 0,
      subtotal: parsePrice(fsVal(mf.total)) || 0,
      materialTotal: parsePrice(fsVal(mf.materialTotal)) || 0,
      level: String(fsVal(mf.level) || ''),
      calc: (mf.calc && mf.calc.mapValue) ? mf.calc.mapValue.fields : null,
    };
  });
  return {
    id: (doc.name || '').split('/').pop(),
    lines,
    clientName: String(fsVal(f.clientName) || fsVal(f.client) || fsVal(f.name) || ''),
    phone: String(fsVal(f.clientPhone) || fsVal(f.phone) || ''),
    email: String(fsVal(f.clientEmail) || fsVal(f.email) || ''),
    total: Number(total) || 0,
    status: String(fsVal(f.status) || 'draft'),
    paid: toBool(fsVal(f.paid)) === true || String(fsVal(f.status) || '') === 'paid',
    date: String(fsVal(f.date) || fsVal(f.createdAt) || fsVal(f.updatedAt) || ''),
    createdAt: String(fsVal(f.createdAt) || ''),
  };
}

/** Prices from the catalogue, so revenue can be estimated */
async function fetchCatalogue(env, fetchImpl = fetch) {
  const q = { from: [{ collectionId: 'items' }], limit: 1000 };
  const res = await fsQuery(env, q, fetchImpl);
  if (!res.ok) return {};
  const map = {};
  for (const doc of res.rows) {
    const f = doc.fields || {};
    const name = String(fsVal(f.name) || '').trim();
    const price = parsePrice(fsVal(f.price));
    if (name && price) map[name.toLowerCase()] = price;
  }
  return map;
}

/* ─────────────────────────── formatting ─────────────────────────── */

const LINE = '──────────────────────';

const num = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const pad = (s, n) => {
  const t = String(s === null || s === undefined ? '' : s);
  return t.length >= n ? t.slice(0, n) : t + ' '.repeat(n - t.length);
};
const padL = (s, n) => {
  const t = String(s === null || s === undefined ? '' : s);
  return t.length >= n ? t.slice(0, n) : ' '.repeat(n - t.length) + t;
};

/** Telegram code block — monospace, columns stay aligned */
const monospace = (body) => '```\n' + body + '\n```';

function statusLabel(a) {
  if (a.status === 'cancelled') return 'CANCELLED';
  if (a.showedUp === true) return 'SHOWED';
  if (a.showedUp === false) return 'NO SHOW';
  return 'PENDING';
}

/** One appointment as 6 aligned lines */
function formatAppointment(a, index) {
  const head = index === undefined ? '' : `${index}. `;
  const rows = [
    `${head}${a.time || '--:--'}   ${a.name || '(no name)'}   [${statusLabel(a)}]`,
    `   Phone:   ${a.phone || 'none'}`,
    `   Service: ${a.service || 'none'}`,
    `   Email:   ${a.email || 'none'}`,
  ];
  if (a.price) rows.push(`   Price:   ${String(a.price).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} EGP`);
  if (a.notes) rows.push(`   Notes:   ${a.notes.slice(0, 90)}`);
  if (a.reminderSentAt) rows.push(`   Reminder sent: yes`);
  return rows.join('\n');
}

/**
 * A day block. `title` is the heading; returns '' when the day is empty
 * and `skipEmpty` is true.
 */
function formatDayBlock(iso, appts, opts = {}) {
  const sorted = appts.slice().sort((x, y) => timeToMinutes(x.time) - timeToMinutes(y.time));
  if (!sorted.length) {
    return opts.skipEmpty ? '' : `${prettyDate(iso)}\n${LINE}\nNo appointments.\n`;
  }
  // Single-day report already has its date in the heading
  const parts = opts.singleDay
    ? []
    : [`${prettyDate(iso)}   —   ${sorted.length} appointment(s)`, LINE];
  sorted.forEach((a, i) => parts.push(formatAppointment(a, i + 1)));
  if (opts.totals) {
    const sum = sorted.reduce((n, a) => n + (a.price || 0), 0);
    const dep = sorted.reduce((n, a) => n + (a.deposit || 0), 0);
    parts.push(LINE);
    parts.push(`Total value:    ${num(sum)} EGP`);
    if (dep) parts.push(`Deposits taken: ${num(dep)} EGP`);
    parts.push(`Still due:      ${num(Math.max(0, sum - dep))} EGP`);
  }
  return parts.join('\n');
}

/* ─────────────────────────── report bodies ─────────────────────────── */


function buildSchedule(allAppts, fromIso, toIso, label) {
  const appts = allAppts.filter(a => a.date >= fromIso && a.date <= toIso);
  const byDate = {};
  for (const a of appts) (byDate[a.date] = byDate[a.date] || []).push(a);
  const dates = [];
  const start = Date.parse(fromIso + 'T00:00:00Z');
  const end = Date.parse(toIso + 'T00:00:00Z');
  for (let t = start; t <= end; t += 86400000) dates.push(new Date(t).toISOString().slice(0, 10));

  const blocks = [];
  for (const d of dates) {
    const block = formatDayBlock(d, byDate[d] || [], { skipEmpty: label !== 'day', totals: true, singleDay: fromIso === toIso });
    if (block) blocks.push(block);
  }
  if (!blocks.length) {
    return `${label.toUpperCase()}\n${LINE}\n${fromIso === toIso ? prettyDate(fromIso) : shortDate(fromIso) + ' to ' + shortDate(toIso)}\n\nNothing booked.`;
  }
  const totalValue = appts.reduce((n, a) => n + (a.price || 0), 0);
  const head = [
    label.toUpperCase(),
    LINE,
    fromIso === toIso ? prettyDate(fromIso) : `${shortDate(fromIso)} to ${shortDate(toIso)}`,
    `${appts.length} appointment(s)   —   ${num(totalValue)} EGP total`,
    '',
  ].join('\n');
  return head + blocks.join('\n\n');
}

function buildStats(today, week, future, catalogue, past = []) {
  const value = (list) => list.reduce((n, a) => n + (a.price || catalogue[String(a.service || '').toLowerCase()] || 0), 0);
  const active = (list) => list.filter(a => a.status !== 'cancelled');
  const t = active(today), w = active(week), m = active(future), p = active(past);
  const all = p.concat(m);
  const showed = all.filter(a => a.showedUp === true).length;
  const noshow = all.filter(a => a.showedUp === false).length;
  const settled = showed + noshow;
  const earned = p.concat(t).filter(a => a.showedUp === true);
  const lines = [
    'BUSINESS SNAPSHOT',
    LINE,
    `Today         ${padL(t.length, 3)} appts    ${padL(num(value(t)), 7)} EGP`,
    `Next 7 days   ${padL(w.length, 3)} appts    ${padL(num(value(w)), 7)} EGP`,
    `Next 30 days  ${padL(m.length, 3)} appts    ${padL(num(value(m)), 7)} EGP`,
    LINE,
    `Earned (last 30 days): ${num(value(earned))} EGP`,
    `Average booking:       ${num(m.length ? Math.round(value(m) / m.length) : 0)} EGP`,
    `No-show rate:          ${settled ? Math.round((noshow / settled) * 100) : 0} percent`,
    LINE,
    `Appointments today:    ${t.length}`,
    `Appointments tomorrow: ${(m.filter(a => a.date === cairoDay(1))).length}`,
    `Past 30 days:          ${p.length} booked, ${showed} showed up`,
  ];
  return lines.join('\n');
}

function buildMoney(month, catalogue) {
  const price = (a) => a.price || catalogue[String(a.service || '').toLowerCase()] || 0;
  const active = month.filter(a => a.status !== 'cancelled');
  const showed = active.filter(a => a.showedUp === true);
  const pending = active.filter(a => a.showedUp === undefined || a.showedUp === null || a.showedUp === '');
  const cancelled = month.filter(a => a.status === 'cancelled');
  const due = pending.reduce((n, a) => n + price(a), 0);
  const earned = showed.reduce((n, a) => n + price(a), 0);
  const dep = active.reduce((n, a) => n + (a.deposit || 0), 0);
  return [
    'MONEY — LAST 30 DAYS',
    LINE,
    `Earned (showed up)      ${padL(num(earned), 8)} EGP`,
    `Outstanding (not seen)  ${padL(num(due), 8)} EGP`,
    `Deposits collected      ${padL(num(dep), 8)} EGP`,
    `Projected total         ${padL(num(earned + due), 8)} EGP`,
    LINE,
    `Appointments: ${active.length}   Showed: ${showed.length}   Cancelled: ${cancelled.length}`,
    `Average ticket: ${num(showed.length ? Math.round(earned / showed.length) : 0)} EGP`,
  ].join('\n');
}

function buildNoShow(month) {
  const active = month.filter(a => a.status !== 'cancelled');
  const no = active.filter(a => a.showedUp === false);
  const yes = active.filter(a => a.showedUp === true);
  const open = active.filter(a => a.showedUp === undefined || a.showedUp === null || a.showedUp === '');
  const settled = yes.length + no.length;
  const lines = [
    'NO-SHOW REPORT — LAST 30 DAYS',
    LINE,
    `Showed up  ${padL(yes.length, 4)}`,
    `No show    ${padL(no.length, 4)}`,
    `Undecided  ${padL(open.length, 4)}`,
    `Rate       ${padL(settled ? Math.round((no.length / settled) * 100) : 0, 4)} percent`,
  ];
  if (no.length) {
    lines.push(LINE);
    no.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    no.slice(0, 15).forEach((a, i) => {
      lines.push(`${i + 1}. ${shortDate(a.date)}  ${a.time || '--:--'}  ${a.name || '—'}`);
      if (a.phone) lines.push(`   ${a.phone}`);
    });
    if (no.length > 15) lines.push(`... and ${no.length - 15} more`);
  }
  return lines.join('\n');
}

function buildTopClients(month) {
  const map = {};
  for (const a of month) {
    if (a.status === 'cancelled') continue;
    const k = (a.phone || a.name || '').trim();
    if (!k) continue;
    const c = map[k] = map[k] || { name: a.name, phone: a.phone, visits: 0, value: 0, noshow: 0, last: '' };
    c.visits++;
    c.value += a.price || 0;
    if (a.showedUp === false) c.noshow++;
    if (!c.last || (a.date || '') > c.last) c.last = a.date || '';
    if (a.name) c.name = a.name;
  }
  const list = Object.values(map).sort((x, y) => y.visits - x.visits || y.value - x.value).slice(0, 15);
  if (!list.length) return 'TOP CLIENTS\n' + LINE + '\nNo data yet.';
  const lines = ['TOP CLIENTS — LAST 30 DAYS', LINE];
  list.forEach((c, i) => {
    lines.push(`${padL(i + 1, 2)}. ${pad(c.name || '—', 20)} ${padL(c.visits, 3)} visits   ${padL(num(c.value), 7)} EGP`);
    if (c.phone) lines.push(`     ${c.phone}${c.noshow ? `   (no-show ${c.noshow})` : ''}   last ${shortDate(c.last)}`);
  });
  return lines.join('\n');
}

function buildTopServices(month) {
  const map = {};
  for (const a of month) {
    if (a.status === 'cancelled') continue;
    String(a.service || '').split(',').map(s => s.trim()).filter(Boolean).forEach(s => {
      const c = map[s] = map[s] || { n: 0, value: 0 };
      c.n++; c.value += a.price || 0;
    });
  }
  const list = Object.entries(map).sort((x, y) => y[1].n - x[1].n).slice(0, 15);
  if (!list.length) return 'TOP SERVICES\n' + LINE + '\nNo data yet.';
  const lines = ['TOP SERVICES — LAST 30 DAYS', LINE];
  list.forEach(([name, c], i) => {
    lines.push(`${padL(i + 1, 2)}. ${pad(name, 26)} ${padL(c.n, 3)} booked   ${padL(num(c.value), 7)} EGP`);
  });
  return lines.join('\n');
}

function buildSlots(appts, fromIso) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const iso = cairoDay(i, new Date(Date.parse(fromIso + 'T00:00:00Z') - TZ_OFFSET_MS));
    days.push(iso);
  }
  const lines = ['CAPACITY — NEXT 7 DAYS', LINE, `${padL('Day', 14)}  ${padL('Booked', 6)}   Load`];
  for (const d of days) {
    const n = appts.filter(a => a.date === d && a.status !== 'cancelled').length;
    const bars = Math.min(10, Math.round(n / 1.5));
    lines.push(`${padL(DAY_NAMES[new Date(d + 'T00:00:00Z').getUTCDay()].slice(0, 3) + ' ' + shortDate(d), 14)}  ${padL(n, 6)}   ${'#'.repeat(bars)}${'.'.repeat(10 - bars)}`);
  }
  return lines.join('\n');
}

function buildUnsent(tomorrowAppts) {
  const pending = tomorrowAppts.filter(a => a.status !== 'cancelled' && !a.reminderSentAt);
  const lines = ['REMINDERS NOT SENT — TOMORROW', LINE];
  if (!pending.length) {
    lines.push('All reminders are done. Nothing left.');
    return lines.join('\n');
  }
  const withEmail = pending.filter(a => a.email);
  const noEmail = pending.filter(a => !a.email);
  lines.push(`${pending.length} client(s) still waiting. ${withEmail.length} can be emailed.`, '');
  pending.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time)).forEach((a, i) => {
    lines.push(`${i + 1}. ${a.time || '--:--'}  ${a.name || '—'}`);
    lines.push(`   ${a.email ? 'Email: ' + a.email : 'No email — call ' + (a.phone || 'unknown')}`);
  });
  if (noEmail.length) {
    lines.push(LINE, `${noEmail.length} client(s) have no email. Send them a WhatsApp or call.`);
  }
  lines.push(LINE, 'Open /editx and press EMAIL on each row.');
  return lines.join('\n');
}

/* ─────────────────────────── monthly report ─────────────────────────── */

/** Full report for a month. `back` = 1 means last month. */
async function monthlyReport(env, back, fetchImpl = fetch) {
  const now = new Date(Date.now() + TZ_OFFSET_MS);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() - (back || 1);
  const first = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(y, m + 1, 0));
  const from = first.toISOString().slice(0, 10);
  const to = last.toISOString().slice(0, 10);
  const label = MONTH_NAMES[first.getUTCMonth()] + ' ' + first.getUTCFullYear();

  const appt = await fetchRange(env, from, to, fetchImpl);
  const err = appt && !appt.ok ? fsErrorText(appt.error) : '';
  const appts = (appt && appt.appts) || [];
  const invRes = await fetchCollection(env, 'invoices', fetchImpl).catch(() => ({ ok: false, rows: [] }));
  const quoRes = await fetchCollection(env, 'quotes', fetchImpl).catch(() => ({ ok: false, rows: [] }));
  const invoices = (invRes.rows || []).map(mapInvoice).filter(i => (i.date || '').slice(0, 7) === from.slice(0, 7));
  const quotes = (quoRes.rows || []).map(mapInvoice).filter(q => (q.date || '').slice(0, 7) === from.slice(0, 7));

  const active = appts.filter(a => a.status !== 'cancelled');
  const showed = active.filter(a => a.showedUp === true);
  const noshow = active.filter(a => a.showedUp === false);
  const cancelled = appts.filter(a => a.status === 'cancelled');
  const settled = showed.length + noshow.length;

  const clients = new Set();
  const byPhone = {};
  for (const a of active) {
    const k = (a.phone || a.name || '').trim();
    if (!k) continue;
    clients.add(k);
    const c = byPhone[k] = byPhone[k] || { name: a.name, n: 0 };
    c.n++;
  }
  const repeat = Object.values(byPhone).filter(c => c.n > 1).length;
  const top = Object.values(byPhone).sort((a, b) => b.n - a.n)[0];

  const svc = {};
  for (const a of active) {
    String(a.service || '').split(',').map(x => x.trim()).filter(Boolean).forEach(n => {
      svc[n] = (svc[n] || 0) + 1;
    });
  }
  const topSvc = Object.entries(svc).sort((a, b) => b[1] - a[1])[0];

  const paid = invoices.filter(i => i.paid || i.status === 'paid');
  const unpaid = invoices.filter(i => !i.paid && i.status !== 'cancelled');
  const accepted = quotes.filter(q => q.status === 'accepted');

  const busiest = (() => {
    const map = {};
    for (const a of active) map[a.date] = (map[a.date] || 0) + 1;
    const e = Object.entries(map).sort((a, b) => b[1] - a[1])[0];
    return e ? `${prettyDate(e[0])} (${e[1]})` : 'none';
  })();

  const L2 = LINE;
  return [
    'MONTHLY REPORT - ' + label.toUpperCase(),
    L2,
    'APPOINTMENTS',
    `  Total booked      ${padL(active.length, 5)}`,
    `  Showed up         ${padL(showed.length, 5)}`,
    `  No show           ${padL(noshow.length, 5)}`,
    `  Cancelled         ${padL(cancelled.length, 5)}`,
    `  Attendance rate   ${padL(settled ? Math.round(showed.length / settled * 100) : 0, 4)} percent`,
    `  Busiest day       ${busiest}`,
    L2,
    'CLIENTS',
    `  Unique clients    ${padL(clients.size, 5)}`,
    `  Repeat clients    ${padL(repeat, 5)}`,
    `  Top client        ${top ? top.name + ' (' + top.n + ' visits)' : 'none'}`,
    L2,
    'SERVICES',
    `  Top service       ${topSvc ? topSvc[0] + ' (' + topSvc[1] + ')' : 'none'}`,
    `  Different services ${padL(Object.keys(svc).length, 4)}`,
    L2,
    'MONEY',
    `  Invoices issued   ${padL(invoices.length, 5)}`,
    `  Invoices paid     ${padL(paid.length, 5)}`,
    `  Collected         ${padL(num(paid.reduce((n, i) => n + i.total, 0)), 8)} ${S_CURRENCY}`,
    `  Still unpaid      ${padL(num(unpaid.reduce((n, i) => n + i.total, 0)), 8)} ${S_CURRENCY}`,
    `  Quotes sent       ${padL(quotes.length, 5)}`,
    `  Quotes accepted   ${padL(accepted.length, 5)}`,
    `  Quote value       ${padL(num(quotes.reduce((n, q) => n + q.total, 0)), 8)} ${S_CURRENCY}`,
    L2,
    err ? 'Warning: ' + err : 'That was the full month. Next one arrives on the 1st.',
  ].join('\n');
}

/* ─────────────────────────── command router ─────────────────────────── */

const HELP_TEXT = [
  'EGYGRILLZ BOT',
  LINE,
  'SCHEDULE',
  '  /today        today',
  '  /tomorrow     tomorrow',
  '  /week         next 7 days',
  '  /month        next 30 days',
  '  /all          everything upcoming',
  '  /next         the next appointment',
  '',
  'LOOK UP',
  '  /find ahmed   search name, phone, service',
  '  /phone 0100   all bookings for one client',
  '  /id           your chat id',
  '',
  'REPORTS',
  '  /stats        totals for today, week, month',
  '  /money        revenue and what is still due',
  '  /noshow       no-show log and rate',
  '  /clients      top clients by visits',
  '  /services     most booked services',
  '  /slots        how full the next 7 days are',
  '',
  'MOULD KIT ORDERS',
  '  /moulds       pending orders (buttons on each)',
  '  /moulds all   every order, any status',
  '  /mould ABCD   one order in detail',
  '  /pay ABCD https://link   approve + Gmail draft',
  '  /deliver ABCD mark the kit as delivered',
  '',
  'INVOICES & QUOTES',
  '  /invoices     every invoice you saved',
  '  /unpaid       who still owes money',
  '  /quote name   look up a quote',
  '  /pdf ahmed    send that quotation as a PDF file',
  '  /reportpdf    last month report as a PDF',
  '  /invoice ahmed  lines with live calculator prices',
  '  /calc         the calculator rates in use',
  '  /revenue      this month, invoices and quotes',
  '  /monthreport  full report for last month',
  '',
  'SETS & SITE',
  '  /sets         what is visible on each page',
  '  /setvis id off  hide a design on the site',
  '  /setvis id on   show it again',
  '  /status       one-line status of everything',
  '',
  'REMINDERS',
  '  /unsent       tomorrow, reminder not sent yet',
  '  /digest       push tomorrow summary now',
  '',
  'PLAIN LANGUAGE',
  '  send the quote of ahmed     finds it and tells you how to send',
  '  how many clients this month',
  '  who owes me money',
  '  send reminder to sara',
  '',
  'AUTOMATIC',
  '  Every day 12:00    tomorrow summary',
  '  Every 1st 12:00    full report of last month',
  '',
  'Every command works on its own. Type /help any time.',
].join('\n');

/** Understand plain language before falling back to slash commands */
function parseIntent(raw) {
  const t = String(raw || '').toLowerCase().trim();
  if (!t) return null;
  if (t.startsWith('/')) return null;

  // send the quote of <name>
  let m = /(?:send|email|mail|forward)\s+(?:me\s+)?(?:the\s+)?(?:quote|quotation|offer)\s+(?:of|for|to)\s+(.+)/.exec(t);
  if (m) return { cmd: '/sendquote', arg: m[1].trim() };

  // send me the pdf of <name>
  let mm = /(?:send|give|get)\s+(?:me\s+)?(?:the\s+)?pdf\s+(?:of|for)\s+(.+)/.exec(t);
  if (mm) return { cmd: '/pdf', arg: mm[1].trim() };
  if (/^(?:pdf|pdf report)$/.test(t)) return { cmd: '/pdf', arg: '' };
  if (/(?:report|monthly)\s+(?:as\s+)?pdf/.test(t)) return { cmd: '/reportpdf', arg: '' };

  // how many clients this month
  if (/(?:how many|count|number of)\s+(?:new\s+)?(?:clients|customers)/.test(t)
      || /(?:clients|customers)\s+(?:this|the)\s+(?:month|week)/.test(t)) {
    return { cmd: '/clientscount', arg: /week/.test(t) ? 'week' : 'month' };
  }

  // send reminder / reminder to <name>
  m = /(?:send|push|open)\s+(?:a\s+)?reminder(?:\s+(?:to|for))?\s*(.*)/.exec(t);
  if (m) return { cmd: '/sendreminder', arg: m[1].trim() };

  // plural / synonyms
  const aliases = {
    today: '/today', 'النهاردة': '/today',
    tomorrow: '/tomorrow', 'بكرة': '/tomorrow',
    week: '/week', month: '/month', all: '/all', next: '/next',
    stats: '/stats', money: '/money', revenue: '/revenue',
    invoices: '/invoices', invoices_list: '/invoices', unpaid: '/unpaid',
    noshow: '/noshow', clients: '/clients', services: '/services',
    slots: '/slots', unsent: '/unsent', digest: '/digest',
    quotes: '/quote', help: '/help', id: '/id',
    moulds: '/moulds', mould: '/mould', orders: '/moulds', order: '/mould',
    sets: '/sets', setvis: '/setvis', status: '/status', calc: '/calc', rates: '/calc',
    invoice: '/invoice', pay: '/pay', deliver: '/deliver', delivered: '/deliver',
  };
  const first = t.split(/\s+/)[0].replace(/[^a-z\u0600-\u06FF]/g, '');
  if (aliases[first]) return { cmd: aliases[first], arg: t.slice(first.length).trim() };

  if (/^(hi|hey|hello|salam|السلام)/.test(t)) return { cmd: '/help' };
  if (/report|summary|ملخص|تقرير/.test(t)) return { cmd: '/monthreport', arg: 'last' };
  if (/owe|owed|debt|مستحق|مديون/.test(t)) return { cmd: '/unpaid' };
  if (/how much|earn|made|كسبت|دخل/.test(t)) return { cmd: '/money' };
  return null;
}

/** Build the quote PDF for a client name / phone */
async function findQuote(arg, env, fetchImpl = fetch) {
  const r = await fetchCollection(env, 'quotes', fetchImpl);
  if (!r.ok) return { ok: false, error: r.error };
  const all = r.rows.map(mapInvoice);
  if (!arg) {
    all.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return { ok: true, quote: all[0] || null, all };
  }
  const q = String(arg).toLowerCase();
  const hits = all.filter(x => (x.clientName || '').toLowerCase().includes(q) || (x.phone || '').includes(q));
  hits.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return { ok: true, quote: hits[0] || null, all };
}

/** Read the raw quote document (we need order + lines, not the flat map) */
async function rawQuote(id, env, fetchImpl = fetch) {
  // try every read path we have before giving up
  const urls = [
    `${FS_DOC}/quotes/${encodeURIComponent(id)}?key=${env.FIREBASE_API_KEY}`,
  ];
  let doc = null;
  for (const u of urls) {
    try {
      const r = await fetchImpl(u, { method: 'GET', headers: await fsHeaders(env, fetchImpl) });
      if (!r.ok) continue;
      const d = await r.json().catch(() => null);
      if (d && d.fields) { doc = d; break; }
    } catch (e) { /* next */ }
  }
  if (!doc) return null;
  const val = (f) => {
    if (!f) return undefined;
    if (f.stringValue !== undefined) return f.stringValue;
    if (f.integerValue !== undefined) return Number(f.integerValue);
    if (f.doubleValue !== undefined) return Number(f.doubleValue);
    if (f.booleanValue !== undefined) return f.booleanValue;
    if (f.mapValue) {
      const o = {};
      for (const [k, v] of Object.entries(f.mapValue.fields || {})) o[k] = val(v);
      return o;
    }
    if (f.arrayValue) return (f.arrayValue.values || []).map(val);
    return undefined;
  };
  const out = { id };
  for (const [k, v] of Object.entries(doc.fields)) out[k] = val(v);
  return out;
}

/** /pdf <name> — send the quotation as a real PDF file */
async function sendQuoteFile(arg, env, fetchImpl = fetch) {
  const found = await findQuote(arg, env, fetchImpl);
  if (!found.ok) return fsErrorText(found.error);
  if (!found.quote) {
    return arg ? `No quote for "${arg}".` : 'No quotes saved yet.';
  }
  if (!env.FIREBASE_API_KEY) return fsErrorText('no-firebase-key');

  const raw = await rawQuote(found.quote.id, env, fetchImpl);
  if (!raw) return 'Could not open that quote document.';

  const pricing = await loadPricing(env, fetchImpl);
  const order = recalcOrder(raw.order || { lines: [], total: 0 }, pricing);
  order.currency = (pricing && pricing.currency) || raw.currency || 'EGP';

  const bytes = buildQuotePdf({
    id: raw.id,
    clientName: raw.clientName,
    clientPhone: raw.clientPhone,
    clientEmail: raw.clientEmail,
    notes: raw.notes,
    createdAt: raw.createdAt,
    order,
  }, {
    studioName: (pricing && pricing.studioName) || 'EGYGRILLZ',
    validDays: 14,
  });

  const safeName = asciiName(raw.clientName || 'client');
  return {
    pdf: bytes,
    filename: `EGYGRILLZ-Quote-${safeName}-${String(raw.createdAt || new Date().toISOString()).slice(0, 10)}.pdf`,
    caption: `<b>Quotation</b>\n${escTg(raw.clientName || '')}\n${num(order.total)} ${order.currency || 'EGP'}`,
    _quote: raw,
  };
}

/** /pdfreport — last month's report as a PDF */
async function sendReportFile(env, fetchImpl = fetch) {
  const rep = await monthlyReport(env, 1, fetchImpl);
  const bytes = buildTextPdf('Monthly report', rep);
  return {
    pdf: bytes,
    filename: 'EGYGRILLZ-monthly-report.pdf',
    caption: '<b>Monthly report</b>',
  };
}

const asciiName = (s) => String(s || 'client').replace(/[^\w\-]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'client';
const escTg = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** "send the quote of ahmed" -> returns the quote + PDF */
async function sendQuoteTo(arg, env, fetchImpl) {
  return sendQuoteFile(arg, env, fetchImpl);
}

const S_CURRENCY = 'EGP';

async function runCommand(text, env, fetchImpl = fetch) {
  let raw = String(text || '').trim();
  const intent = parseIntent(raw);
  if (intent) raw = intent.cmd + (intent.arg ? ' ' + intent.arg : '');
  const cmd = (raw.split(/\s+/)[0] || '').toLowerCase().replace(/@[\w_]+$/, '');
  const arg = raw.slice(cmd.length).trim();
  const todayIso = cairoDay(0);

  const need = (r) => {
    if (!r.ok) return fsErrorText(r.error);
    return null;
  };

  switch (cmd) {
    case '/start':
    case '/help':
      return HELP_TEXT;

    case '/id':
      return `Your chat id is:\n\n${arg || 'send /id with nothing after it'}\n\nUse it as TELEGRAM_CHAT_ID in Cloudflare.`;

    /* ── schedule ── */
    case '/today': {
      const r = await fetchDay(env, todayIso, fetchImpl);
      const err = need(r); if (err) return err;
      return buildSchedule(r.appts, todayIso, todayIso, 'today');
    }
    case '/tomorrow': {
      const iso = cairoDay(1);
      const r = await fetchDay(env, iso, fetchImpl);
      const err = need(r); if (err) return err;
      return buildSchedule(r.appts, iso, iso, 'tomorrow');
    }
    case '/week': {
      const to = cairoDay(6);
      const r = await fetchRange(env, todayIso, to, fetchImpl);
      const err = need(r); if (err) return err;
      return buildSchedule(r.appts, todayIso, to, 'next 7 days');
    }
    case '/month': {
      const to = cairoDay(29);
      const r = await fetchRange(env, todayIso, to, fetchImpl);
      const err = need(r); if (err) return err;
      return buildSchedule(r.appts, todayIso, to, 'next 30 days');
    }
    case '/all': {
      const to = cairoDay(365);
      const r = await fetchRange(env, todayIso, to, fetchImpl);
      const err = need(r); if (err) return err;
      // /all is compact: one line per appointment
      const sorted = r.appts.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '') || timeToMinutes(a.time) - timeToMinutes(b.time));
      if (!sorted.length) return 'ALL UPCOMING\n' + LINE + '\nNothing booked.';
      const lines = [`ALL UPCOMING — ${sorted.length} appointment(s)`, LINE];
      let lastDate = '';
      for (const a of sorted) {
        if (a.date !== lastDate) { lines.push('', prettyDate(a.date)); lastDate = a.date; }
        lines.push(`  ${pad(a.time || '--:--', 9)} ${pad(a.name || '—', 20)} ${a.service || ''}`);
      }
      return lines.join('\n');
    }
    case '/next': {
      const to = cairoDay(365);
      const r = await fetchRange(env, todayIso, to, fetchImpl);
      const err = need(r); if (err) return err;
      const list = r.appts.filter(a => a.status !== 'cancelled')
        .sort((x, y) => (x.date || '').localeCompare(y.date || '') || timeToMinutes(x.time) - timeToMinutes(y.time));
      if (!list.length) return 'No upcoming appointments.';
      const a = list[0];
      return ['NEXT APPOINTMENT', LINE, `${prettyDate(a.date)} at ${a.time || '--:--'}`, '',
        formatAppointment(a), LINE,
        `${list.length} more after this one.`].join('\n');
    }

    /* ── look up ── */
    case '/find': {
      if (!arg) return 'Usage: /find ahmed\nFind by name, phone or service.';
      const q = arg.toLowerCase();
      const to = cairoDay(365);
      const from = cairoDay(-365);
      const r = await fetchRange(env, from, to, fetchImpl);
      const err = need(r); if (err) return err;
      const hits = r.appts.filter(a =>
        (a.name || '').toLowerCase().includes(q) ||
        (a.phone || '').includes(q) ||
        (a.service || '').toLowerCase().includes(q));
      if (!hits.length) return `Nothing found for "${arg}".`;
      hits.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const lines = [`SEARCH — "${arg}"`, LINE, `${hits.length} result(s)`, ''];
      hits.slice(0, 20).forEach((a, i) => {
        lines.push(`${i + 1}. ${shortDate(a.date)} ${a.time || '--:--'}  ${a.name || '—'}  [${statusLabel(a)}]`);
        lines.push(`   ${a.phone || 'no phone'}   ${a.service || 'no service'}`);
      });
      if (hits.length > 20) lines.push(`... and ${hits.length - 20} more`);
      return lines.join('\n');
    }
    case '/phone': {
      const digits = arg.replace(/[^\d]/g, '');
      if (!digits) return 'Usage: /phone 01001234567';
      const r = await fetchRange(env, cairoDay(-365), cairoDay(365), fetchImpl);
      const err = need(r); if (err) return err;
      const hits = r.appts.filter(a => (a.phone || '').replace(/[^\d]/g, '').includes(digits));
      if (!hits.length) return `No bookings for ${arg}.`;
      hits.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const spent = hits.filter(a => a.showedUp === true).reduce((n, a) => n + (a.price || 0), 0);
      const lines = [`CLIENT ${hits[0].name || arg}`, LINE,
        `Phone:     ${hits[0].phone}`,
        `Email:     ${hits[0].email || 'none'}`,
        `Bookings:  ${hits.length}`,
        `Showed up: ${hits.filter(a => a.showedUp === true).length}`,
        `No shows:  ${hits.filter(a => a.showedUp === false).length}`,
        `Value:     ${num(spent)} EGP`, LINE, 'HISTORY'];
      hits.slice(0, 15).forEach(a => {
        lines.push(`${shortDate(a.date)} ${a.time || '--:--'}  ${a.service || '—'}  [${statusLabel(a)}]`);
      });
      return lines.join('\n');
    }

    /* ── reports ── */
    case '/stats': {
      const all = await fetchRange(env, cairoDay(-30), cairoDay(29), fetchImpl);
      const err = need(all); if (err) return err;
      const cat = await fetchCatalogue(env, fetchImpl).catch(() => ({}));
      const today = all.appts.filter(a => a.date === todayIso);
      const week = all.appts.filter(a => a.date >= todayIso && a.date <= cairoDay(6));
      const future = all.appts.filter(a => a.date >= todayIso);
      const past = all.appts.filter(a => a.date >= cairoDay(-30) && a.date < todayIso);
      return buildStats(today, week, future, cat, past);
    }
    case '/money': {
      const r = await fetchRange(env, cairoDay(-30), cairoDay(30), fetchImpl);
      const err = need(r); if (err) return err;
      const cat = await fetchCatalogue(env, fetchImpl).catch(() => ({}));
      return buildMoney(r.appts, cat);
    }
    case '/noshow': {
      const r = await fetchRange(env, cairoDay(-30), cairoDay(30), fetchImpl);
      const err = need(r); if (err) return err;
      return buildNoShow(r.appts);
    }
    case '/clients': {
      const r = await fetchRange(env, cairoDay(-30), cairoDay(30), fetchImpl);
      const err = need(r); if (err) return err;
      return buildTopClients(r.appts);
    }
    case '/services': {
      const r = await fetchRange(env, cairoDay(-30), cairoDay(30), fetchImpl);
      const err = need(r); if (err) return err;
      return buildTopServices(r.appts);
    }
    case '/slots': {
      const r = await fetchRange(env, todayIso, cairoDay(6), fetchImpl);
      const err = need(r); if (err) return err;
      return buildSlots(r.appts, todayIso);
    }

    /* ── invoices & quotes ── */
    case '/invoices': {
      const r = await fetchCollection(env, 'invoices', fetchImpl);
      const err = need(r); if (err) return err;
      if (!r.rows.length) return 'INVOICES\n' + LINE + '\nNothing yet.';
      const list = r.rows.map(mapInvoice).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      const pricing = await loadPricingSettings(env, fetchImpl);
      const driftOf = (inv) => (inv.lines || []).reduce((n, l) => {
        const re = recalcInvoiceLine(l, pricing);
        return re ? n + Math.abs(re.price - (l.price || 0)) : n;
      }, 0);
      const lines = ['INVOICES', LINE, `${list.length} saved`, ''];
      list.slice(0, 20).forEach((inv, i) => {
        const d = driftOf(inv);
        lines.push(`${padL(i + 1, 2)}. ${shortDate(String(inv.date).slice(0, 10))}  ${pad(inv.clientName || '—', 18)} ${padL(num(inv.total), 7)} EGP  [${inv.status}]${d > 0.5 ? '  ⚠' : ''}`);
      });
      if (list.length > 20) lines.push(`... and ${list.length - 20} more`);
      const sum = list.reduce((n, i) => n + i.total, 0);
      lines.push(LINE, `Total value: ${num(sum)} EGP`);
      const outOfDate = list.filter(inv => driftOf(inv) > 0.5).length;
      if (outOfDate) {
        lines.push('');
        lines.push(`⚠ ${outOfDate} invoice(s) were priced with older calculator rates.`);
        lines.push('Run /invoice <name> to see the live prices line by line.');
      }
      return lines.join('\n');
    }

    case '/unpaid': {
      const r = await fetchCollection(env, 'invoices', fetchImpl);
      const err = need(r); if (err) return err;
      const list = r.rows.map(mapInvoice)
        .filter(i => !i.paid && i.status !== 'cancelled')
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      if (!list.length) return 'UNPAID INVOICES\n' + LINE + '\nEverything is settled.';
      const lines = ['UNPAID INVOICES', LINE, `${list.length} invoice(s)`, ''];
      list.forEach((inv, i) => {
        lines.push(`${i + 1}. ${inv.clientName || '—'}   ${num(inv.total)} EGP`);
        lines.push(`   ${inv.phone || 'no phone'}   ${shortDate(inv.date)}   ${inv.status}`);
      });
      lines.push(LINE, `Outstanding: ${num(list.reduce((n, i) => n + i.total, 0))} EGP`);
      return lines.join('\n');
    }

    case '/quote': {
      const arg2 = arg.trim();
      const r = await fetchCollection(env, 'quotes', fetchImpl);
      if (!arg2) {
        const err0 = need(r); if (err0) return err0;
        const all = r.rows.map(mapInvoice).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        if (!all.length) return `QUOTES\n${LINE}\nNo quotes saved yet.\n\nCreate one in /quotes.`;
        const out = ['QUOTES', LINE, `${all.length} saved`, ''];
        all.slice(0, 15).forEach((x, i) => {
          out.push(`${padL(i + 1, 2)}. ${pad(x.clientName || '—', 18)} ${padL(num(x.total), 7)} EGP  [${x.status}]`);
        });
        out.push(LINE, `Total value: ${num(all.reduce((n, x) => n + x.total, 0))} EGP`);
        out.push('Type /quote <name> for the details.');
        return out.join('\n');
      }
      const err = need(r); if (err) return err;
      const q = arg2.toLowerCase();
      const hits = r.rows.map(mapInvoice).filter(x =>
        (x.clientName || '').toLowerCase().includes(q) || (x.phone || '').includes(q));
      if (!hits.length) {
        const all = r.rows.map(mapInvoice).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        if (!all.length) return 'No quotes saved yet.';
        const lines = ['RECENT QUOTES', LINE];
        all.slice(0, 15).forEach((x, i) => {
          lines.push(`${padL(i + 1, 2)}. ${pad(x.clientName || '—', 18)} ${padL(num(x.total), 7)} EGP  [${x.status}]`);
        });
        lines.push(LINE, 'Open the quote in /quotes to send the PDF.');
        return lines.join('\n');
      }
      const x = hits[0];
      return ['QUOTE', LINE,
        `Client:  ${x.clientName || '—'}`,
        x.phone ? `Phone:   ${x.phone}` : '',
        `Date:    ${shortDate(x.date)}`,
        `Total:   ${num(x.total)} EGP`,
        `Status:  ${x.status}`,
        LINE,
        'Open /quotes to print or resend the PDF.'].filter(Boolean).join('\n');
    }

    case '/revenue': {
      const inv = await fetchCollection(env, 'invoices', fetchImpl);
      const quo = await fetchCollection(env, 'quotes', fetchImpl);
      const err = need(inv); if (err) return err;
      const invoices = inv.rows.map(mapInvoice);
      const quotes = quo.ok ? quo.rows.map(mapInvoice) : [];
      const month = (d) => (d || '').slice(0, 7) === todayIso.slice(0, 7);
      const invM = invoices.filter(i => month(i.date));
      const quoM = quotes.filter(q => month(q.date));
      const paid = invM.filter(i => i.paid || i.status === 'paid');
      const lines = ['REVENUE — THIS MONTH', LINE,
        `Invoices issued   ${padL(invM.length, 4)}`,
        `Invoices paid     ${padL(paid.length, 4)}`,
        `Collected         ${padL(num(paid.reduce((n, i) => n + i.total, 0)), 7)} EGP`,
        `Still unpaid      ${padL(num(invM.filter(i => !i.paid && i.status !== 'cancelled').reduce((n, i) => n + i.total, 0)), 7)} EGP`,
        LINE,
        `Quotes sent       ${padL(quoM.length, 4)}`,
        `Quotes accepted   ${padL(quoM.filter(q => q.status === 'accepted').length, 4)}`,
        `Quote value       ${padL(num(quoM.reduce((n, q) => n + q.total, 0)), 7)} EGP`,
        LINE,
        'Open /quotes for a new quote, /invoice for a new invoice.'];
      return lines.join('\n');
    }

    /* ── natural language targets ── */
    case '/sendquote':
      return sendQuoteTo(arg, env, fetchImpl);

    case '/clientscount': {
      const isWeek = /week/.test(arg);
      const from = isWeek ? cairoDay(-7) : cairoDay(-30);
      const r = await fetchRange(env, from, cairoDay(30), fetchImpl);
      const err = need(r); if (err) return err;
      const seen = new Set();
      for (const a of r.appts) {
        if (a.status === 'cancelled') continue;
        if (a.date < from) continue;
        seen.add((a.phone || a.name || '').trim());
      }
      const label = isWeek ? 'this week' : 'this month';
      const returning = [...seen].length;
      return ['CLIENTS - ' + label.toUpperCase(), LINE,
        `Unique clients:   ${returning}`,
        `Appointments:     ${r.appts.filter(a => a.date >= from && a.status !== 'cancelled').length}`,
        LINE,
        'Type /clients for the full list.'].join('\n');
    }

    case '/sendreminder': {
      const iso = cairoDay(1);
      const r = await fetchDay(env, iso, fetchImpl);
      const err = need(r); if (err) return err;
      const target = arg.trim().toLowerCase();
      let list = r.appts.filter(a => a.status !== 'cancelled' && !a.reminderSentAt);
      if (target) {
        list = list.filter(a => (a.name || '').toLowerCase().includes(target));
      }
      if (!list.length) {
        return target
          ? `No reminder pending for "${arg}" tomorrow.`
          : 'Every reminder for tomorrow is already done.';
      }
      const withEmail = list.filter(a => a.email);
      const lines = ['REMINDER QUEUE - TOMORROW', LINE,
        `${list.length} client(s) to remind. ${withEmail.length} have an email.`, ''];
      list.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
      list.forEach((a, i) => {
        lines.push(`${i + 1}. ${a.time || '--:--'}  ${a.name || '-'}`);
        lines.push(`   ${a.email ? a.email : 'no email - call ' + (a.phone || 'unknown')}`);
      });
      lines.push(LINE);
      lines.push('Open /editx and press EMAIL on each row.');
      lines.push('Gmail opens with the subject and the message already written.');
      return lines.join('\n');
    }

    case '/monthreport': {
      const rep = await monthlyReport(env, 1, fetchImpl);
      // Attach PDF when explicitly requested
      if (/file|pdf/.test(arg)) {
        const bytes = buildTextPdf('Monthly report', rep);
        return { pdf: bytes, filename: 'EGYGRILLZ-monthly-report.pdf', caption: 'Monthly report' };
      }
      return rep;
    }

    case '/reportpdf':
      return sendReportFile(env, fetchImpl);

    case '/pdf':
      return sendQuoteFile(arg, env, fetchImpl);



    /* ── reminders ── */
    case '/unsent': {
      const iso = cairoDay(1);
      const r = await fetchDay(env, iso, fetchImpl);
      const err = need(r); if (err) return err;
      return buildUnsent(r.appts);
    }
    case '/digest': {
      const iso = cairoDay(1);
      const r = await fetchDay(env, iso, fetchImpl);
      const err = need(r); if (err) return err;
      const sorted = r.appts.slice().sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
      if (!sorted.length) return `REMINDERS — ${prettyDate(iso)}\n${LINE}\nNo appointments tomorrow.`;
      return buildSchedule(sorted, iso, iso, 'reminders for tomorrow') +
        '\n\n' + LINE + '\nOpen /editx to send the emails.';
    }

    /* ═══════════ MOULD KIT ORDERS ═══════════ */
    case '/moulds':
    case '/orders': {
      const filter = ['pending', 'approved', 'delivered', 'all'].includes((arg || '').toLowerCase())
        ? (arg || '').toLowerCase() : 'pending';
      const res = await fetchMouldOrders(env, { status: filter, limit: 60 }, fetchImpl);
      if (!res.ok) return fsErrorText(res.error);
      return { text: mouldListText(res.orders, filter), keyboard: mouldListKeyboard(res.orders, filter) };
    }

    case '/mould':
    case '/order': {
      if (!arg) return 'Usage: /mould ABCD1234\\nShows one mould kit order with its buttons.';
      const found = await findMouldOrder(env, arg, fetchImpl);
      if (!found.ok) return `No mould order found for "${arg}".`;
      const o = found.order;
      const tpl = await loadMouldTemplate(env, fetchImpl);
      const draft = o.paymentLink ? mouldGmailUrl(o, tpl) : '';
      const body = [
        formatMouldOrder(o),
        '',
        o.paymentLink ? `Payment link: ${o.paymentLink}` : '',
        o.status === 'pending' ? `Approve with:\n/pay ${shortRef(o)} https://your-payment-link` : '',
        draft ? `Gmail draft:\n${draft}` : '',
      ].filter(Boolean).join('\n');
      const kb = mouldKeyboard(o);
      if (draft) kb.inline_keyboard.unshift([{ text: `📧 Open Gmail draft ${shortRef(o)}`, url: draft }]);
      return { text: body, keyboard: kb };
    }

    case '/pay':
    case '/approve': {
      const parts = arg.split(/\s+/).filter(Boolean);
      if (parts.length < 2) {
        return 'Usage: /pay ABCD1234 https://payment-link\n'
          + 'Saves the link, marks the order approved and hands you a Gmail draft to send.';
      }
      const ref = parts.shift();
      const link = parts.join(' ');
      if (!/^https?:\/\//i.test(link)) return 'The payment link must start with https://';
      const found = await findMouldOrder(env, ref, fetchImpl);
      if (!found.ok) return `No mould order found for "${ref}".`;
      const r = await approveMouldOrder(env, found.order.id, link, fetchImpl);
      if (!r.ok) return `Could not approve the order (${r.error}).`;
      return {
        text: [
          'ORDER APPROVED — PRESS SEND IN GMAIL',
          LINE,
          `Order:   ${shortRef(r.order)}`,
          `Client:  ${r.order.name}${r.order.email ? ' <' + r.order.email + '>' : ' — no email on file'}`,
          `Moulds:  ${num(r.order.mouldPrice)} EGP`,
          `Delivery: ${num(r.order.deliveryFee)} EGP`,
          `Total:   ${num(r.order.total)} EGP`,
          `Subject: ${r.subject}`,
          '',
          'The message is already written — tap the button, check it, press Send.',
          '',
          r.gmailUrl,
        ].join('\n'),
        keyboard: gmailKeyboard(r.gmailUrl, `📧 Open Gmail draft ${shortRef(r.order)}`),
      };
    }

    case '/deliver':
    case '/delivered': {
      if (!arg) return 'Usage: /deliver ABCD1234';
      const found = await findMouldOrder(env, arg, fetchImpl);
      if (!found.ok) return `No mould order found for "${arg}".`;
      const patch = await saveMouldOrder(env, found.order.id, {
        status: 'delivered',
        statusUpdatedAt: new Date().toISOString(),
      }, fetchImpl);
      if (!patch.ok) return fsErrorText(patch.error);
      return [
        'MARKED DELIVERED',
        LINE,
        `${shortRef(found.order)} · ${found.order.name}`,
        `${archLabelOf(found.order)} · ${num(found.order.total)} EGP`,
        found.order.status === 'approved' ? 'It was already approved.' : 'Note: the payment link had not been sent yet.',
      ].join('\n');
    }

    /* ═══════════ SETS / INVENTORY VISIBILITY ═══════════ */
    case '/sets': {
      const vis = await loadVisibility(env, fetchImpl);
      const cat = await fetchPublicCatalogue(fetchImpl);
      if (!cat.ok) return 'Could not load the catalogue. Reason: ' + (cat.error || 'unknown');
      const pages = ['golds', 'silvers', 'diamonds', 'latest-designs', 'grillz-gallery'];
      const lines = ['SETS & VISIBILITY', LINE, `${cat.items.length} designs in the catalogue`, ''];
      pages.forEach((page) => {
        const onPage = cat.items.filter(i => pageOfDesign(i) === page);
        const shown = onPage.filter(i => !vis.hidden.includes(designKey(i)));
        lines.push(`${pad(cap(page.replace('-', ' ')), 16)} ${padL(shown.length, 3)}/${padL(onPage.length, 3)} visible`);
      });
      const unassigned = cat.items.filter(i => !pageOfDesign(i));
      if (unassigned.length) lines.push('', `Not on any page: ${unassigned.length}`);
      const hidden = cat.items.filter(i => vis.hidden.includes(designKey(i)));
      lines.push('', `Hidden by hand: ${hidden.length}`);
      hidden.slice(0, 8).forEach(i => lines.push(`  ✕ ${designKey(i)}  ${i.name || ''}`));
      lines.push('', 'Hide:  /setvis <id> off', 'Show:  /setvis <id> on');
      return lines.join('\n');
    }

    case '/setvis':
    case '/hide':
    case '/show': {
      const words = arg.split(/\s+/).filter(Boolean);
      let mode = cmd === '/hide' ? 'off' : cmd === '/show' ? 'on' : '';
      if (!mode) mode = (words[1] || '').toLowerCase();
      const id = words[0] || '';
      if (!id || !['on', 'off'].includes(mode)) {
        return 'Usage: /setvis <design-id> on|off\nShortcuts: /hide <design-id>   /show <design-id>\nSee the ids with /sets';
      }
      const vis = await loadVisibility(env, fetchImpl);
      const key = id.toLowerCase();
      const next = new Set(vis.hidden);
      if (mode === 'off') next.add(key); else next.delete(key);
      const saved = await saveVisibility(env, Array.from(next), fetchImpl);
      if (!saved.ok) return fsErrorText(saved.error);
      return [
        mode === 'off' ? 'HIDDEN ON THE SITE' : 'VISIBLE ON THE SITE',
        LINE,
        id,
        '',
        `${next.size} design(s) hidden. The public pages pick this up on the next load.`,
      ].join('\n');
    }

    /* ═══════════ INVOICES & LIVE CALCULATOR PRICES ═══════════ */
    case '/invoice': {
      if (!arg) return 'Usage: /invoice <id or client name>';
      const r = await fetchCollection(env, 'invoices', fetchImpl);
      const err = need(r); if (err) return err;
      const list = r.rows.map(mapInvoice);
      const q = arg.toLowerCase();
      const inv = list.find(i => i.id === arg) || list.find(i => (i.clientName || '').toLowerCase().includes(q));
      if (!inv) return `No invoice found for "${arg}".`;
      const pricing = await loadPricingSettings(env, fetchImpl);
      const lines = [
        `INVOICE ${inv.id.slice(0, 8).toUpperCase()}`,
        LINE,
        `Client: ${inv.clientName || '—'}`,
        `Phone:  ${inv.phone || '—'}`,
        `Date:   ${shortDate(String(inv.date).slice(0, 10))}`,
        `Saved:  ${num(inv.total)} EGP  [${inv.status}]`,
        '',
        'LINES (saved → live calculator)',
      ];
      let drift = 0;
      (inv.lines || []).forEach((l) => {
        const re = recalcInvoiceLine(l, pricing);
        const label = l.name || l.spec || 'line';
        if (re && Math.abs(re.price - (l.price || 0)) > 0.5) {
          drift += Math.abs(re.price - (l.price || 0));
          lines.push(`  ⚠ ${pad(label, 20)} ${padL(num(l.price), 7)} → ${padL(num(re.price), 7)} EGP  (L${l.level || '?'} · ${re.designPct}%)`);
        } else {
          lines.push(`  ✓ ${pad(label, 20)} ${padL(num(l.price), 7)} EGP`);
        }
      });
      lines.push(LINE);
      if (drift) {
        lines.push(`Live calculator rates would change this invoice by ${num(drift)} EGP.`);
        lines.push('Re-open it in /invoice to re-price it with the current rates.');
      } else {
        lines.push('Every line matches the live calculator rates.');
      }
      return lines.join('\n');
    }

    case '/calc':
    case '/rates': {
      const p = await loadPricingSettings(env, fetchImpl);
      const lines = ['CALCULATOR — LIVE RATES', LINE];
      lines.push('Material base (per tooth):');
      Object.entries(p.materialBase).forEach(([k, v]) => lines.push(`  ${pad(cap(k), 12)} ${padL(num(v), 7)} EGP`));
      lines.push('', 'Design level add-on (% of material):');
      Object.entries(p.designPct).forEach(([k, v]) => lines.push(`  level ${pad(k, 4)} ${padL(v + '%', 6)}`));
      lines.push('', `Rounding:   ${p.roundTo} EGP`);
      lines.push(`Deposit:    ${p.depositPct}%`);
      if (p.updatedAt) lines.push(`Updated:    ${String(p.updatedAt).slice(0, 16).replace('T', ' ')}`);
      lines.push('', 'Change them in /staff-panel-x7k2 → Settings.');
      return lines.join('\n');
    }

    /* ═══════════ REAL-TIME STATUS ═══════════ */
    case '/status': {
      const moulds = await fetchMouldOrders(env, { status: 'all', limit: 100 }, fetchImpl);
      const today = await fetchDay(env, todayIso, fetchImpl);
      const invs = await fetchCollection(env, 'invoices', fetchImpl);
      const vis = await loadVisibility(env, fetchImpl);
      const lines = ['EGYGRILLZ — LIVE STATUS', LINE];
      if (moulds.ok) {
        const pending = moulds.orders.filter(o => o.status === 'pending').length;
        const approved = moulds.orders.filter(o => o.status === 'approved').length;
        const delivered = moulds.orders.filter(o => o.status === 'delivered').length;
        lines.push(`Mould kits:  ${pending} pending · ${approved} paid · ${delivered} delivered`);
      } else {
        lines.push('Mould kits:  unavailable (' + moulds.error + ')');
      }
      if (today.ok) lines.push(`Today:       ${today.appts.length} appointment(s)`);
      if (invs.ok) lines.push(`Invoices:    ${invs.rows.length} saved`);
      lines.push(`Sets hidden: ${vis.hidden.length}`);
      lines.push('', 'Type /moulds, /today or /sets for the details.');
      return lines.join('\n');
    }

    default:
      return `I do not know "${cmd}".\n\nType /help to see every command.`;
  }
}

/* ─────────────────────────── telegram plumbing ─────────────────────────── */

/** Split long reports so Telegram does not reject them (4096 char cap) */
function chunkText(text, max = 3800) {
  const s = String(text || '');
  if (s.length <= max) return [s];
  const chunks = [];
  let rest = s;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n\n', max);
    if (cut < max * 0.5) cut = rest.lastIndexOf('\n', max);
    if (cut < max * 0.5) cut = max;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, '');
  }
  if (rest.trim()) chunks.push(rest);
  return chunks;
}

/** Upload a PDF to Telegram as a document */
async function sendPdf(bytes, filename, caption, env, chatId, fetchImpl = fetch) {
  if (!env.TELEGRAM_BOT_TOKEN) return { ok: false, error: 'no-token' };
  const target = chatId || env.TELEGRAM_CHAT_ID;
  if (!target) return { ok: false, error: 'no-chat-id' };
  try {
    const form = new FormData();
    form.append('chat_id', String(target));
    if (caption) { form.append('caption', String(caption).slice(0, 900)); form.append('parse_mode', 'HTML'); }
    form.append('document', new Blob([bytes], { type: 'application/pdf' }), filename || 'document.pdf');
    const r = await fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`, {
      method: 'POST',
      body: form,
    });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok && d.ok !== false, status: r.status, error: d.description };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/* ─────────────── catalogue + set visibility ───────────────
 * The public catalogue lives on GitHub (assets/images/catalog.json).
 * The bot reads it to show which design is on which page, and keeps the
 * "hidden on the site" list in Firestore settings/visibility so the same
 * switch works from Telegram and from /editx.
 * ───────────────────────────────────────────────────────── */

const CATALOG_URL_DEFAULT = 'https://raw.githubusercontent.com/egygrillz/egygrillz/main/assets/images/catalog.json';
const CATALOG_URL_FALLBACK = 'https://egygrillz.com/assets/images/catalog.json?t=';

const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

/** the folder (or id) that identifies a design everywhere */
function designKey(item) {
  if (!item) return '';
  return String(item.folder || item.id || '').trim();
}

/** which public page a design is assigned to (matches the site logic) */
function pageOfDesign(item) {
  if (!item) return '';
  return Object.prototype.hasOwnProperty.call(item, 'page')
    ? String(item.page || '')
    : String(item.category || item.cat || '');
}

/** catalog.json from GitHub, falling back to the live site */
async function fetchPublicCatalogue(fetchImpl = fetch, env = {}) {
  const urls = [
    env.CATALOG_URL || CATALOG_URL_DEFAULT,
    CATALOG_URL_FALLBACK + Date.now(),
  ];
  for (const url of urls) {
    try {
      const r = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' } });
      if (!r.ok) continue;
      const j = await r.json().catch(() => null);
      if (Array.isArray(j)) return { ok: true, items: j, url };
    } catch (e) { /* try the next one */ }
  }
  return { ok: false, error: 'catalogue-unreachable', items: [] };
}

/** settings/visibility → { hidden: [...], updatedAt } */
async function loadVisibility(env, fetchImpl = fetch) {
  const empty = { hidden: [], updatedAt: '' };
  if (!env.FIREBASE_API_KEY) return empty;
  try {
    const r = await fetchImpl(`${FS_BASE}/settings/visibility?key=${env.FIREBASE_API_KEY}`,
      { method: 'GET', headers: await fsHeaders(env, fetchImpl) });
    if (!r.ok) return empty;
    const doc = await r.json().catch(() => null);
    const arr = ((doc && doc.fields && doc.fields.hidden && doc.fields.hidden.arrayValue
      && doc.fields.hidden.arrayValue.values) || []).map((v) => String(fsVal(v) || '').toLowerCase()).filter(Boolean);
    return { hidden: arr, updatedAt: String(fsVal(doc && doc.fields && doc.fields.updatedAt) || '') };
  } catch (e) {
    return empty;
  }
}

/** write the hidden list back */
async function saveVisibility(env, hidden, fetchImpl = fetch) {
  if (!env.FIREBASE_API_KEY) return { ok: false, error: 'no-firebase-key' };
  const list = Array.from(new Set((hidden || []).map(v => String(v).toLowerCase()).filter(Boolean)));
  try {
    const r = await fetchImpl(
      `${FS_BASE}/settings/visibility?key=${env.FIREBASE_API_KEY}`
      + '&updateMask.fieldPaths=hidden&updateMask.fieldPaths=updatedAt',
      {
        method: 'PATCH',
        headers: await fsHeaders(env, fetchImpl),
        body: JSON.stringify({
          fields: {
            hidden: { arrayValue: { values: list.map(v => ({ stringValue: v })) } },
            updatedAt: { stringValue: new Date().toISOString() },
          },
        }),
      });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return { ok: false, error: fsCause(r.status), detail: t.slice(0, 140) };
    }
    return { ok: true, hidden: list };
  } catch (e) {
    return { ok: false, error: 'network' };
  }
}

/** Read the pricing settings so the PDF matches the calculator */
async function loadPricing(env, fetchImpl = fetch) {
  try {
    const r = await fetchImpl(`${FS_BASE}/settings/pricing?key=${env.FIREBASE_API_KEY}`,
      { method: 'GET', headers: await fsHeaders(env, fetchImpl) });
    if (!r.ok) return null;
    const doc = await r.json().catch(() => null);
    // settings/pricing may not exist yet — the calculator's defaults cover that
    if (!doc || !doc.fields) return null;
    const out = {};
    for (const [k, v] of Object.entries(doc.fields)) {
      if (v.mapValue) {
        out[k] = {};
        for (const [k2, v2] of Object.entries(v.mapValue.fields || {})) {
          out[k][k2] = v2.integerValue !== undefined ? Number(v2.integerValue)
            : v2.doubleValue !== undefined ? Number(v2.doubleValue)
            : v2.stringValue !== undefined ? v2.stringValue : null;
        }
      } else if (v.integerValue !== undefined) out[k] = Number(v.integerValue);
      else if (v.doubleValue !== undefined) out[k] = Number(v.doubleValue);
      else if (v.stringValue !== undefined) out[k] = v.stringValue;
    }
    return out;
  } catch (e) {
    return null;
  }
}

/** Recalculate an order from its raw lines, using the live pricing settings */
function recalcOrder(rawOrder, pricing) {
  if (!rawOrder || !Array.isArray(rawOrder.lines)) return rawOrder;
  const pt = (pricing && pricing.designPct) || { '0.5':0,'1':0,'2':10,'3':15,'4':25,'5':40,'6':60 };
  const tlPct = (pricing && pricing.timelinePct) || { standard:0, rush:25, emergency:50 };
  const mold = (pricing && pricing.moldFlat) || { none:0, normalperarch:200, digitalfullmouth:1500 };
  const roundTo = Number(pricing && pricing.roundTo) || 50;

  const lines = rawOrder.lines.map(l => {
    const line = Object.assign({}, l);
    const pct = Number(pt[line.level] || 0);
    line.designPct = pct;
    line.designCost = line.level === '0.5' ? 0 : Math.round((line.materialTotal || 0) * pct / 100);
    line.subtotal = Math.round((line.materialTotal || 0) + line.designCost
      + (line.stoneCost || 0) + (line.platingCost || 0) + (line.enamelCost || 0) + (line.engravingCost || 0));
    return line;
  });

  const subtotal = lines.reduce((n, l) => n + l.subtotal, 0);
  const pct = Number(tlPct[rawOrder.timeline] || 0);
  const tlAmount = Math.round(subtotal * pct / 100);
  const moldCost = Number(mold[rawOrder.mold] || 0);
  const pre = subtotal + tlAmount + moldCost;
  const total = Math.ceil(pre / roundTo) * roundTo;
  const depPct = Number(rawOrder.depositPct) || 0;
  const deposit = Math.round(total * depPct / 100);

  return Object.assign({}, rawOrder, {
    lines,
    linesSubtotal: subtotal,
    timelinePct: pct,
    timelineAmount: tlAmount,
    moldCost,
    total,
    depositPct: depPct,
    deposit,
    balance: total - deposit,
  });
}


/* ═══════════════════════════════════════════════════════════════════════════
 *  MOULD KIT ORDERS  (Get Your Moulds)
 *  ---------------------------------------------------------------------------
 *  Orders live in Firestore  mould_orders/<id>  and go through three states:
 *    pending   → waiting for the studio
 *    approved  → payment link saved, client written to from the studio's Gmail
 *    delivered → kit handed to the courier
 *
 *  NOTHING is emailed by the Worker. Approving an order only stores the link
 *  and flips the status; the message itself is written in Gmail (the panel
 *  opens the compose window, Telegram replies with a tap-to-open draft link)
 *  and a human presses Send. So there are no mail secrets to configure.
 * ═══════════════════════════════════════════════════════════════════════════ */

const MOULD_STATUS = {
  pending: 'Pending',
  approved: 'Approved',
  delivered: 'Delivered',
};

const MOULD_TEMPLATE_DEFAULT = {
  subject: 'Your EGYGRILLZ mould kit — payment link',
  body: [
    'Hi {client_name},',
    '',
    'Thank you for ordering your at-home mould kit.',
    '',
    'Arch:        {arch}',
    'Total:       {total_price} (includes the delivery fee)',
    'Delivered to: {address}',
    '',
    'Confirm your order with the payment link below:',
    '{payment_link}',
    '',
    'Once the payment is in, we courier the kit and send you the impression guide.',
    'Any question — just reply to this email.',
    '',
    'EGYGRILLZ',
    'DR Mohamed Mahdy',
  ].join('\n'),
};

/** JS value → Firestore REST value */
function toFsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsValue) } };
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = toFsValue(val);
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

/** calm numbers out of Firestore fields */
function fsNum(v) {
  const n = Number(fsVal(v));
  return Number.isFinite(n) ? n : 0;
}

/** mould_orders doc → flat object */
function mapMouldOrder(doc) {
  const f = (doc && doc.fields) || {};
  const id = String((doc && doc.name) || '').split('/').pop();
  const arches = String(fsVal(f.arches) || '').toLowerCase();
  const archCount = fsNum(f.archCount) || (arches === 'both' ? 2 : 1);
  const mouldPrice = fsNum(f.mouldPrice) || fsNum(f.perArch) * archCount;
  const deliveryFee = fsNum(f.deliveryFee);
  /* orders written before the delivery fee existed have no total split —
     never print a total that silently dropped the delivery */
  const total = fsNum(f.total) || (mouldPrice + deliveryFee);
  const created = fsVal(f.createdAt);
  return {
    id,
    name: String(fsVal(f.name) || '').trim(),
    phone: String(fsVal(f.phone) || '').trim(),
    email: String(fsVal(f.email) || '').trim(),
    arches,
    archCount,
    total,
    mouldPrice,
    deliveryFee,
    address: String(fsVal(f.address) || '').trim(),
    mapLink: String(fsVal(f.mapLink) || '').trim(),
    status: String(fsVal(f.status) || 'pending').toLowerCase(),
    paymentLink: String(fsVal(f.paymentLink) || '').trim(),
    emailSentAt: fsVal(f.emailSentAt),
    emailChannel: String(fsVal(f.emailChannel) || ''),
    createdAt: created && typeof created === 'object' && created._seconds !== undefined
      ? new Date(created._seconds * 1000).toISOString()
      : String(created || ''),
  };
}

const archLabelOf = (o) => (o.arches === 'both' ? 'Both arches' : o.arches === 'lower' ? 'Lower arch' : 'Upper arch');

/** newest first, optionally filtered by status */
async function fetchMouldOrders(env, opts = {}, fetchImpl = fetch) {
  if (!env.FIREBASE_API_KEY) return { ok: false, error: 'no-firebase-key', orders: [] };
  const q = {
    from: [{ collectionId: 'mould_orders' }],
    orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
    limit: Math.max(1, Math.min(200, opts.limit || 40)),
  };
  if (opts.status && opts.status !== 'all') {
    q.where = { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: opts.status } } };
    // a status filter needs the matching composite index; fall back to a client-side filter
  }
  let res = await fsQuery(env, q, fetchImpl);
  if (!res.ok) {
    delete q.where;
    delete q.orderBy;
    res = await fsQuery(env, q, fetchImpl);
  }
  if (!res.ok) return { ok: false, error: res.error, orders: [] };
  let orders = res.rows.map(mapMouldOrder);
  if (opts.status && opts.status !== 'all') orders = orders.filter(o => o.status === opts.status);
  orders.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return { ok: true, orders };
}

/** one order by id (accepts the full document name too) */
async function fetchMouldOrder(env, id, fetchImpl = fetch) {
  const cleanId = String(id || '').trim().split('/').pop();
  if (!cleanId || !env.FIREBASE_API_KEY) return { ok: false, error: 'not-found' };
  try {
    const r = await fetchImpl(`${FS_BASE}/mould_orders/${encodeURIComponent(cleanId)}?key=${env.FIREBASE_API_KEY}`,
      { method: 'GET', headers: await fsHeaders(env, fetchImpl) });
    if (r.status === 404) return { ok: false, error: 'not-found' };
    if (!r.ok) return { ok: false, error: fsCause(r.status) };
    const doc = await r.json().catch(() => null);
    if (!doc || !doc.fields) return { ok: false, error: 'not-found' };
    return { ok: true, order: mapMouldOrder(doc) };
  } catch (e) {
    return { ok: false, error: 'network' };
  }
}

/** patch fields on a mould order */
async function saveMouldOrder(env, id, fields, fetchImpl = fetch) {
  const cleanId = String(id || '').trim().split('/').pop();
  if (!cleanId || !env.FIREBASE_API_KEY) return { ok: false, error: 'not-found' };
  const body = {};
  for (const [k, v] of Object.entries(fields || {})) body[k] = toFsValue(v);
  const mask = Object.keys(fields || {}).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  try {
    const r = await fetchImpl(`${FS_BASE}/mould_orders/${encodeURIComponent(cleanId)}?key=${env.FIREBASE_API_KEY}${mask ? '&' + mask : ''}`,
      { method: 'PATCH', headers: await fsHeaders(env, fetchImpl), body: JSON.stringify({ fields: body }) });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return { ok: false, error: fsCause(r.status), detail: t.slice(0, 160) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'network' };
  }
}

/** the studio's own payment-email template (settings/moulds_email) */
async function loadMouldTemplate(env, fetchImpl = fetch) {
  try {
    if (!env.FIREBASE_API_KEY) return MOULD_TEMPLATE_DEFAULT;
    const r = await fetchImpl(`${FS_BASE}/settings/moulds_email?key=${env.FIREBASE_API_KEY}`,
      { method: 'GET', headers: await fsHeaders(env, fetchImpl) });
    if (!r.ok) return MOULD_TEMPLATE_DEFAULT;
    const doc = await r.json().catch(() => null);
    const f = (doc && doc.fields) || {};
    const subject = String(fsVal(f.subject) || '').trim();
    const body = String(fsVal(f.body) || '').trim();
    return {
      subject: subject || MOULD_TEMPLATE_DEFAULT.subject,
      body: body || MOULD_TEMPLATE_DEFAULT.body,
    };
  } catch (e) {
    return MOULD_TEMPLATE_DEFAULT;
  }
}

/** {client_name} … placeholders → real values */
function renderMouldTemplate(tpl, order, extra = {}) {
  const values = {
    client_name: order.name || 'there',
    arch: archLabelOf(order),
    total_price: num(order.total) + ' EGP',
    payment_link: order.paymentLink || '',
    address: order.address || 'your pinned location',
    map_link: order.mapLink || '',
    order_id: order.id || '',
    ...extra,
  };
  const fill = (s) => String(s || '').replace(/\{(\w+)\}/g, (m, k) =>
    Object.prototype.hasOwnProperty.call(values, k) ? String(values[k]) : m);
  return { subject: fill(tpl.subject), body: fill(tpl.body) };
}

/* ── Gmail compose link (the Worker writes the draft, never sends) ─────
 * The message is composed from the studio's own template and handed to
 * Gmail as a pre-filled compose window. The studio presses Send, so the
 * mail comes from their real address and nothing needs a mail secret here.
 * ────────────────────────────────────────────────────────────────────── */

/** settings/site → { perArch, delivery } (the mould kit prices) */
async function loadMouldPrices(env, fetchImpl = fetch) {
  const fallback = { perArch: 450, delivery: 100 };
  try {
    if (!env.FIREBASE_API_KEY) return fallback;
    const r = await fetchImpl(`${FS_BASE}/settings/site?key=${env.FIREBASE_API_KEY}`,
      { method: 'GET', headers: await fsHeaders(env, fetchImpl) });
    if (!r.ok) return fallback;
    const doc = await r.json().catch(() => null);
    const f = (doc && doc.fields) || {};
    const perArch = fsNum(f.mouldPerArch);
    const delivery = fsNum(f.mouldDeliveryFee);
    return {
      perArch: perArch > 0 ? perArch : fallback.perArch,
      delivery: delivery >= 0 ? delivery : fallback.delivery,
    };
  } catch (e) {
    return fallback;
  }
}

/** Gmail's "new message" URL with the template already filled in */
function mouldGmailUrl(order, template) {
  const tpl = template || MOULD_TEMPLATE_DEFAULT;
  const { subject, body } = renderMouldTemplate(tpl, order);
  const to = String(order.email || '').trim();
  const parts = [
    'view=cm',
    'fs=1',
    to ? 'to=' + encodeURIComponent(to) : '',
    subject ? 'su=' + encodeURIComponent(subject) : '',
    body ? 'body=' + encodeURIComponent(body) : '',
  ].filter(Boolean);
  return 'https://mail.google.com/mail/?' + parts.join('&');
}

/** Approve one order: store the payment link and flip the status. No email. */
async function approveMouldOrder(env, id, paymentLink, fetchImpl = fetch) {
  const found = await fetchMouldOrder(env, id, fetchImpl);
  if (!found.ok) return { ok: false, error: found.error || 'not-found' };
  const order = found.order;
  const link = String(paymentLink || order.paymentLink || '').trim();
  if (!link) return { ok: false, error: 'no-payment-link', order };
  if (!/^https?:\/\//i.test(link)) return { ok: false, error: 'bad-payment-link', order };

  const nowIso = new Date().toISOString();
  const patch = await saveMouldOrder(env, order.id, {
    paymentLink: link,
    status: 'approved',
    approvedAt: nowIso,
    statusUpdatedAt: nowIso,
  }, fetchImpl);

  if (!patch.ok) return { ok: false, error: patch.error || 'save-failed', order };

  const approved = Object.assign({}, order, { status: 'approved', paymentLink: link, approvedAt: nowIso });
  const tpl = await loadMouldTemplate(env, fetchImpl);
  const rendered = renderMouldTemplate(tpl, approved);
  return {
    ok: true,
    order: approved,
    subject: rendered.subject,
    body: rendered.body,
    gmailUrl: mouldGmailUrl(approved, tpl),
    hasEmail: !!order.email,
  };
}

/** mould order → Telegram alert (with the map link) */
function formatMouldOrder(o) {
  return [
    'NEW MOULD KIT ORDER — EGYGRILLZ',
    '',
    `Name:    ${o.name || '—'}`,
    `Phone:   ${o.phone || '—'}`,
    `Email:   ${o.email || '—'}`,
    `Arch:    ${archLabelOf(o)} (${o.archCount} kit${o.archCount > 1 ? 's' : ''})`,
    `Moulds:  ${num(o.mouldPrice)} EGP`,
    `Delivery: ${num(o.deliveryFee)} EGP`,
    `Total:   ${num(o.total)} EGP`,
    `Address: ${o.address || 'location pinned'}`,
    o.mapLink ? `Map:     ${o.mapLink}` : '',
    '',
    `Status:  ${MOULD_STATUS[o.status] || o.status}`,
    o.id ? `Ref:     ${String(o.id).slice(0, 8).toUpperCase()}` : '',
  ].filter(Boolean).join('\n');
}

/** inline buttons for one order */
function mouldKeyboard(o) {
  const rows = [];
  if (o.status === 'pending') {
    rows.push([{ text: '✅ Approve', callback_data: `mo:a:${o.id}` }]);
  }
  if (o.status === 'approved') {
    rows.push([{ text: '📧 Open Gmail draft', callback_data: `mo:r:${o.id}` }]);
  }
  if (o.status !== 'delivered') {
    rows.push([{ text: '🚚 Mark delivered', callback_data: `mo:d:${o.id}` }]);
  }
  rows.push([{ text: '↻ Refresh', callback_data: 'mo:list:pending' }]);
  return { inline_keyboard: rows };
}

/** a single button that opens the pre-filled Gmail compose window */
function gmailKeyboard(url, label) {
  return { inline_keyboard: [[{ text: label || '📧 Open Gmail draft', url }]] };
}

/** A short, human id for an order: ABCD1234 */
const shortRef = (o) => String(o.id || '').slice(0, 8).toUpperCase();

/** compact list of mould orders */
function mouldListText(orders, filter) {
  const title = filter === 'all' ? 'ALL MOULD ORDERS' : ('MOULD ORDERS — ' + (MOULD_STATUS[filter] || filter).toUpperCase());
  if (!orders.length) return title + '\n' + LINE + '\nNothing here.';
  const lines = [title, LINE, `${orders.length} order(s)`, ''];
  orders.slice(0, 12).forEach((o, i) => {
    const flag = o.status === 'pending' ? '●' : o.status === 'approved' ? '◐' : '○';
    lines.push(`${padL(i + 1, 2)}. ${flag} ${pad(shortRef(o), 9)} ${pad(o.name || '—', 16)} ${padL(num(o.total), 6)} EGP`);
    lines.push(`    ${archLabelOf(o)} · ${o.phone || 'no phone'} · ${MOULD_STATUS[o.status] || o.status}`);
    if (o.mapLink) lines.push(`    map: ${o.mapLink}`);
  });
  if (orders.length > 12) lines.push('', `… and ${orders.length - 12} more. Use /moulds all`);
  lines.push('', '● pending   ◐ approved   ○ delivered');
  lines.push('Approve: /pay <ref> <payment-link>   Delivered: /deliver <ref>');
  return lines.join('\n');
}

/** inline keyboard for a mould order list */
function mouldListKeyboard(orders, filter) {
  const rows = [];
  orders.slice(0, 6).forEach((o) => {
    const ref = shortRef(o);
    if (o.status === 'pending') rows.push([{ text: `📧 Approve ${ref}`, callback_data: `mo:a:${o.id}` }]);
    else if (o.status === 'approved') rows.push([{ text: `🚚 Delivered ${ref}`, callback_data: `mo:d:${o.id}` }]);
    else rows.push([{ text: `👁 ${ref}`, callback_data: `mo:v:${o.id}` }]);
  });
  rows.push([{ text: '↻ Refresh', callback_data: `mo:list:${filter || 'pending'}` }]);
  return { inline_keyboard: rows };
}

/** find one order by full id, short ref, or a name fragment */
async function findMouldOrder(env, needle, fetchImpl = fetch) {
  const q = String(needle || '').trim();
  if (!q) return { ok: false, error: 'missing-id' };
  const res = await fetchMouldOrders(env, { status: 'all', limit: 200 }, fetchImpl);
  if (!res.ok) return { ok: false, error: res.error };
  const up = q.toUpperCase();
  const low = q.toLowerCase();
  const exact = res.orders.find(o => o.id === q || shortRef(o) === up || shortRef(o).startsWith(up));
  if (exact) return { ok: true, order: exact };
  const byName = res.orders.find(o => (o.name || '').toLowerCase().includes(low));
  if (byName) return { ok: true, order: byName };
  return { ok: false, error: 'not-found' };
}

/** live calculator rates, in a shape the bot can print */
async function loadPricingSettings(env, fetchImpl = fetch) {
  const p = await loadPricing(env, fetchImpl);
  return {
    designPct: (p && p.designPct) || { '0.5': 0, '1': 0, '2': 10, '3': 15, '4': 25, '5': 40, '6': 60 },
    materialBase: (p && p.materialBase) || { chrome: 1000, titanium: 2800, silver: 1600 },
    roundTo: Number(p && p.roundTo) || 50,
    depositPct: Number(p && p.depositPct) || 50,
    updatedAt: String((p && p.updatedAt) || ''),
  };
}

/** recalculate one invoice line with the live calculator rates */
function recalcInvoiceLine(line, pricing) {
  const materialTotal = Number(line.materialTotal) || 0;
  if (!materialTotal) return null;
  const level = String(line.level || '');
  const pct = Number((pricing.designPct || {})[level] || 0);
  const designCost = level === '0.5' ? 0 : Math.round(materialTotal * pct / 100);
  return { materialTotal, level, designPct: pct, designCost, price: materialTotal + designCost };
}

/* ─────────────────────────── telegram plumbing ─────────────────────────── */

async function tgCall(method, payload, env, fetchImpl = fetch) {
  if (!env.TELEGRAM_BOT_TOKEN) return { ok: false, error: 'no-token' };
  const r = await fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok && d.ok !== false, status: r.status, error: d.description };
}

/** Send one report, wrapped in a code block so columns line up */
async function sendReport(text, env, chatId, fetchImpl = fetch) {
  const target = chatId || env.TELEGRAM_CHAT_ID;
  if (!target) return { ok: false, error: 'no-chat-id' };
  let allOk = true;
  for (const part of chunkText(text)) {
    const r = await tgCall('sendMessage', {
      chat_id: target,
      text: monospace(part),
      disable_web_page_preview: true,
    }, env, fetchImpl);
    if (!r.ok) {
      // fall back to plain text when Telegram rejects the markdown
      const r2 = await tgCall('sendMessage', { chat_id: target, text: part, disable_web_page_preview: true }, env, fetchImpl);
      if (!r2.ok) allOk = false;
    }
  }
  return { ok: allOk };
}

/** Send a report that carries inline buttons */
async function sendReportWithButtons(text, keyboard, env, chatId, fetchImpl = fetch) {
  const target = chatId || env.TELEGRAM_CHAT_ID;
  if (!target) return { ok: false, error: 'no-chat-id' };
  const chunks = chunkText(text);
  let ok = true;
  for (let i = 0; i < chunks.length; i++) {
    const last = i === chunks.length - 1;
    const r = await tgCall('sendMessage', {
      chat_id: target,
      text: monospace(chunks[i]),
      disable_web_page_preview: true,
      ...(last && keyboard ? { reply_markup: keyboard } : {}),
    }, env, fetchImpl);
    if (!r.ok) {
      const r2 = await tgCall('sendMessage', {
        chat_id: target,
        text: chunks[i],
        disable_web_page_preview: true,
        ...(last && keyboard ? { reply_markup: keyboard } : {}),
      }, env, fetchImpl);
      if (!r2.ok) ok = false;
    }
  }
  return { ok };
}

/**
 * Inline buttons: mo:a:<id>  approve (asks for the link)
 *                  mo:r:<id>  open the Gmail draft again
 *                  mo:d:<id>  mark delivered
 *                  mo:v:<id>  show one order
 *                  mo:list:<status>  refresh the list
 */
async function handleMouldCallback(data, env, chatId, callbackId, fetchImpl = fetch) {
  const answer = (text) => tgCall('answerCallbackQuery', { callback_query_id: callbackId, text }, env, fetchImpl)
    .catch(() => ({}));
  const parts = String(data || '').split(':');
  const action = parts[1] || 'list';
  const arg = parts.slice(2).join(':');

  if (action === 'list') {
    const filter = ['pending', 'approved', 'delivered', 'all'].includes(arg) ? arg : 'pending';
    const res = await fetchMouldOrders(env, { status: filter, limit: 60 }, fetchImpl);
    await answer(filter + ' orders');
    if (!res.ok) return { ok: false, error: res.error };
    await tgCall('sendMessage', {
      chat_id: chatId,
      text: mouldListText(res.orders, filter),
      disable_web_page_preview: true,
      reply_markup: mouldListKeyboard(res.orders, filter),
    }, env, fetchImpl);
    return { ok: true, action: 'list' };
  }

  const found = await findMouldOrder(env, arg, fetchImpl);
  if (!found.ok) {
    await answer('Order not found');
    return { ok: false, error: 'not-found' };
  }
  const o = found.order;

  if (action === 'a') {
    await answer('Send the payment link');
    await tgCall('sendMessage', {
      chat_id: chatId,
      text: `Approve ${shortRef(o)} (${o.name} · ${num(o.total)} EGP) by replying with the payment link:

`
        + `/pay ${shortRef(o)} https://your-payment-link

`
        + 'I save the link, mark the order approved and hand you a Gmail draft to send.',
      disable_web_page_preview: true,
    }, env, fetchImpl);
    return { ok: true, action: 'approve-prompt' };
  }

  if (action === 'r') {
    if (!o.paymentLink) {
      await answer('No payment link saved');
      await tgCall('sendMessage', {
        chat_id: chatId,
        text: `There is no payment link on ${shortRef(o)} yet. Use /pay ${shortRef(o)} <link> first.`,
      }, env, fetchImpl);
      return { ok: true, action: 'no-link' };
    }
    const tpl = await loadMouldTemplate(env, fetchImpl);
    const url = mouldGmailUrl(o, tpl);
    await answer('Gmail draft ready');
    await tgCall('sendMessage', {
      chat_id: chatId,
      text: [
        `GMAIL DRAFT — ${shortRef(o)} · ${o.name}`,
        o.email ? `To: ${o.email}` : 'No email on file — add one in /editx first.',
        '',
        'The message is already written. Tap the button, check it, press Send.',
        '',
        url,
      ].join('\n'),
      disable_web_page_preview: true,
      reply_markup: gmailKeyboard(url, `📧 Open Gmail draft ${shortRef(o)}`),
    }, env, fetchImpl);
    return { ok: true, action: 'draft' };
  }

  if (action === 'd') {
    const patch = await saveMouldOrder(env, o.id, {
      status: 'delivered',
      statusUpdatedAt: new Date().toISOString(),
    }, fetchImpl);
    await answer(patch.ok ? 'Marked delivered' : 'Could not update');
    if (patch.ok) {
      await tgCall('editMessageReplyMarkup', {
        chat_id: chatId,
        message_id: (parts[3] || undefined),
        reply_markup: { inline_keyboard: [] },
      }, env, fetchImpl).catch(() => ({}));
      await tgCall('sendMessage', {
        chat_id: chatId,
        text: `MARKED DELIVERED\n\n${shortRef(o)} · ${o.name}\n${archLabelOf(o)} · ${num(o.total)} EGP`,
        disable_web_page_preview: true,
        reply_markup: mouldKeyboard(Object.assign({}, o, { status: 'delivered' })),
      }, env, fetchImpl);
    }
    return { ok: patch.ok, action: 'delivered' };
  }

  if (action === 'v') {
    await answer(shortRef(o));
    await tgCall('sendMessage', {
      chat_id: chatId,
      text: formatMouldOrder(o),
      disable_web_page_preview: false,
      reply_markup: mouldKeyboard(o),
    }, env, fetchImpl);
    return { ok: true, action: 'view' };
  }

  await answer('Unknown action');
  return { ok: false, error: 'unknown-action' };
}

/** Handle one incoming Telegram update */
async function handleTelegramUpdate(update, env, fetchImpl = fetch) {
  /* ── inline buttons ── */
  if (update && update.callback_query) {
    const cb = update.callback_query;
    const chatId = cb.message && cb.message.chat && cb.message.chat.id;
    const allowed = String(env.TELEGRAM_CHAT_ID || '').trim();
    if (allowed && String(chatId) !== allowed) {
      await tgCall('answerCallbackQuery', { callback_query_id: cb.id, text: 'This bot is private.' }, env, fetchImpl)
        .catch(() => ({}));
      return { ok: true, denied: true };
    }
    const res = await handleMouldCallback(cb.data, env, chatId, cb.id, fetchImpl)
      .catch(e => ({ ok: false, error: String(e) }));
    return { ok: true, callback: cb.data, ...res };
  }

  const msg = update && (update.message || update.edited_message);
  if (!msg || !msg.text) return { ok: true, skipped: true };
  const chatId = msg.chat && msg.chat.id;
  if (!chatId) return { ok: true, skipped: true };

  // only the owner may talk to the bot
  const allowed = String(env.TELEGRAM_CHAT_ID || '').trim();
  if (allowed && String(chatId) !== allowed) {
    await sendReport('This bot is private.', env, chatId, fetchImpl);
    return { ok: true, denied: true };
  }

  const text = String(msg.text).trim();
  if (text === '/id' || text.startsWith('/id ')) {
    await sendReport(`YOUR CHAT ID\n\n${chatId}\n\nUse this in TELEGRAM_CHAT_ID.`, env, chatId, fetchImpl);
    return { ok: true, chatId };
  }
  const out = await runCommand(text, env, fetchImpl);

  // runCommand may hand back a PDF to upload instead of text
  if (out && typeof out === 'object' && out.pdf) {
    const r = await sendPdf(out.pdf, out.filename, out.caption, env, chatId, fetchImpl);
    if (!r.ok) {
      await sendReport('Could not send the PDF. Reason: ' + (r.error || 'unknown'), env, chatId, fetchImpl);
    }
    return { ok: r.ok, command: text.split(/\s+/)[0], pdf: true };
  }

  // …or text that carries inline buttons
  if (out && typeof out === 'object' && typeof out.text === 'string') {
    const r = await sendReportWithButtons(out.text, out.keyboard, env, chatId, fetchImpl);
    return { ok: r.ok, command: text.split(/\s+/)[0], buttons: !!out.keyboard };
  }

  await sendReport(String(out), env, chatId, fetchImpl);
  return { ok: true, command: text.split(/\s+/)[0] };
}

/** Poll Telegram for new messages — called by the Cron Trigger every minute */
async function pollTelegram(env, fetchImpl = fetch) {
  if (!env.TELEGRAM_BOT_TOKEN) return { ok: false, error: 'no-token' };
  try {
    // Skip polling if webhook is already configured
    const wh = await fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`, { method: 'GET' })
      .then(r => r.json()).catch(() => ({}));
    if (wh && wh.ok && wh.result && wh.result.url) return { ok: true, skipped: 'webhook-active' };
  } catch (e) { /* continue with polling */ }
  try {
    const r = await fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getUpdates?timeout=0&limit=50&allowed_updates=message,callback_query`, { method: 'GET' });
    const d = await r.json().catch(() => ({}));
    if (!d.ok) return { ok: false, error: d.description };
    const updates = d.result || [];
    let last = 0;
    for (const u of updates) {
      last = Math.max(last, u.update_id || 0);
      await handleTelegramUpdate(u, env, fetchImpl).catch(() => {});
    }
    if (last) {
      await fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getUpdates?offset=${last + 1}&timeout=0`, { method: 'GET' }).catch(() => {});
    }
    return { ok: true, handled: updates.length };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Delete any webhook so getUpdates works */
async function clearWebhook(env, fetchImpl = fetch) {
  if (!env.TELEGRAM_BOT_TOKEN) return { ok: false, error: 'no-token' };
  const r = await fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/deleteWebhook?drop_pending_updates=false`, { method: 'GET' });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok && d.ok !== false, result: d.result, error: d.description };
}


/* ═══════════════ HTTP + CRON ═══════════════ */

/**
 * EGYGRILLZ — Notification Worker  (Cloudflare Workers, free plan)
 * ─────────────────────────────────────────────────────────────────────────
 * Replaces CallMeBot entirely. Keeps every secret server-side and sends
 * booking alerts through ONE OR MORE free channels:
 *
 *   TELEGRAM   → free, unlimited, no per-message cost   (recommended primary)
 *   NTFY       → free, unlimited, open-source, or self-host later (backup)
 *   WHATSAPP   → Meta Cloud API, optional, 1 000 service msgs/month free
 *   EMAIL      → Resend / MailChannels free tier (optional)
 *
 * Endpoints
 *   POST /api/notify        public, Turnstile-protected, rate-limited
 *   GET  /api/health        sanity check
 *
 * Secrets (wrangler secret put NAME):
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 *   NTFY_TOPIC, NTFY_TOKEN            (optional)
 *   WA_TOKEN, WA_PHONE_ID, WA_TO      (optional — WhatsApp Cloud API)
 *   TURNSTILE_SECRET                  (optional but recommended)
 *
 * Vars (wrangler.toml [vars]):
 *   ALLOWED_ORIGINS = "https://egygrillz.com,https://www.egygrillz.com"
 *   RATE_LIMIT_PER_10MIN = "10"
 */


/* ───────────────────────── helpers ───────────────────────── */

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(extra.origin) },
  });

function cors(origin) {
  /* mirror originAllowed() below, so every host we accept in the body is
     also accepted by the browser (a mismatch here silently blocked the
     /moulds request on GitHub-Pages previews) */
  const allow = (origin && (
    origin.startsWith('https://egygrillz.com')
    || origin.startsWith('https://www.egygrillz.com')
    || /\.egygrillz\.com$/.test(origin)
    || /\.pages\.dev$/.test(origin)
    || /\.workers\.dev$/.test(origin)
    || /\.web\.app$/.test(origin)
    || /\.github\.io$/.test(origin)
    || origin.startsWith('http://localhost')
    || origin.startsWith('http://127.0.0.1')
  )) ? origin : 'https://egygrillz.com';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/**
 * Is this Origin allowed to call the studio endpoints?
 * Studio domains, GitHub previews, *.pages.dev and localhost.
 */
function originAllowed(origin, env = {}) {
  if (!origin) return true;                       // curl / Telegram / server-side
  const configured = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const BUILT_IN = [
    'https://egygrillz.com', 'https://www.egygrillz.com',
    'https://egygrillz.pages.dev', 'https://egygrillz-studio.web.app',
    'https://egygrillz-studio.firebaseapp.com',
  ];
  const allowed = configured.length ? configured.concat(BUILT_IN) : BUILT_IN;
  return allowed.includes(origin)
    || /\.egygrillz\.com$/.test(origin)
    || /\.pages\.dev$/.test(origin)
    || /\.workers\.dev$/.test(origin)
    || /\.web\.app$/.test(origin)
    || /\.github\.io$/.test(origin)
    || origin.startsWith('http://localhost')
    || origin.startsWith('http://127.0.0.1');
}

/** strip control chars, collapse newlines, hard-truncate */
function clean(v, max = 400) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .slice(0, max);
}

/** very small phone sanity check (Egypt + international) */
function cleanPhone(v) {
  const s = clean(v, 25).replace(/[^\d+]/g, '');
  return s.length >= 8 && s.length <= 16 ? s : '';
}

/* ─────────────────── in-memory rate limiter ───────────────────
 * Free-plan friendly: no KV/Durable Object needed. Each isolate keeps
 * a small Map. Good enough to stop casual abuse (a script hammering the
 * endpoint from one IP). For serious limits add a KV binding — see README.
 * ───────────────────────────────────────────────────────────── */
const buckets = new Map();

function rateLimited(ip, limit = 10, windowMs = 10 * 60 * 1000, now = Date.now()) {
  const k = ip || 'unknown';
  const b = buckets.get(k);
  if (!b || now - b.start > windowMs) {
    buckets.set(k, { start: now, n: 1 });
    if (buckets.size > 5000) buckets.clear(); // memory guard
    return false;
  }
  b.n += 1;
  return b.n > limit;
}

/* ───────────────────────── Turnstile ───────────────────────── */

async function verifyTurnstile(token, secret, ip, fetchImpl = fetch) {
  if (!secret) return { ok: true, skipped: true };          // not configured
  if (!token) return { ok: false, reason: 'missing-turnstile-token' };
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  const r = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const d = await r.json().catch(() => ({}));
  return { ok: !!d.success, reason: (d['error-codes'] || []).join(',') };
}

/* ───────────────────── message formatting ───────────────────── */

function formatBooking(d) {
  const lines = [
    'NEW BOOKING — EGYGRILLZ',
    '',
    d.name ? `Name:     ${d.name}` : '',
    d.phone ? `Phone:    ${d.phone}` : '',
    d.email ? `Email:    ${d.email}` : '',
    d.service ? `Service:  ${d.service}` : '',
    `Date:     ${d.date || '—'}  at  ${d.time || '—'}`,
    d.deposit ? `Deposit:  ${d.deposit}` : '',
    d.notes ? `Notes:    ${d.notes}` : '',
    d.ref ? `Ref:      ${d.ref}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

function formatMessage(d) {
  const lines = [
    'NEW MESSAGE — EGYGRILLZ',
    '',
    `Name:     ${d.name || '—'}`,
    d.phone ? `Phone:    ${d.phone}` : '',
    d.email ? `Email:    ${d.email}` : '',
    '',
    d.message || '—',
    d.ref ? `\nRef: ${d.ref}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

/** Tomorrow's appointment summary sent daily at 12:00 Cairo time */
function formatReminderDigest(appts, date) {
  if (!appts.length) {
    return `REMINDERS — ${date}\n\nNo appointments booked for tomorrow.`;
  }
  const lines = [`REMINDERS — ${date}`, `${appts.length} appointment(s) tomorrow`, ''];
  appts.forEach((a, i) => {
    lines.push(`${i + 1}. ${a.time || '--:--'}  —  ${a.name || '—'}`);
    if (a.phone) lines.push(`   Phone:   ${a.phone}`);
    if (a.service) lines.push(`   Service: ${a.service}`);
    lines.push(`   Email:   ${a.email ? a.email : 'none (remind by phone)'}`);
    if (i < appts.length - 1) lines.push('');
  });
  lines.push('');
  lines.push('Open /editx to send the reminder emails.');
  return lines.join('\n');
}

/* ───────────────────────── channels ───────────────────────── */

async function sendTelegram(text, env, fetchImpl = fetch) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return { channel: 'telegram', ok: false, skipped: true };
  const r = await fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text,
      disable_web_page_preview: true,
    }),
  });
  const d = await r.json().catch(() => ({}));
  return { channel: 'telegram', ok: r.ok && d.ok !== false, status: r.status };
}

async function sendNtfy(text, title, env, fetchImpl = fetch) {
  if (!env.NTFY_TOPIC) return { channel: 'ntfy', ok: false, skipped: true };
  const base = env.NTFY_URL || 'https://ntfy.sh';
  const headers = { Title: title || 'EGYGRILLZ', Priority: 'high', Tags: 'gem' };
  if (env.NTFY_TOKEN) headers.Authorization = `Bearer ${env.NTFY_TOKEN}`;
  const r = await fetchImpl(`${base}/${env.NTFY_TOPIC}`, { method: 'POST', headers, body: text });
  return { channel: 'ntfy', ok: r.ok, status: r.status };
}

async function sendWhatsApp(text, env, fetchImpl = fetch) {
  if (!env.WA_TOKEN || !env.WA_PHONE_ID || !env.WA_TO) return { channel: 'whatsapp', ok: false, skipped: true };
  const r = await fetchImpl(`https://graph.facebook.com/v21.0/${env.WA_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: env.WA_TO,
      type: 'text',
      text: { body: text.slice(0, 4000) },
    }),
  });
  let d = {};
  try { d = await r.json(); } catch { /* ignore */ }
  return { channel: 'whatsapp', ok: r.ok, status: r.status, error: d?.error?.message };
}


/* ─────────── WhatsApp TEMPLATE to the CLIENT (paid, ~$0.0036/msg in EG) ───────────
 * Meta only allows re-opening a conversation with an APPROVED TEMPLATE.
 * Create it once in WhatsApp Manager → Message templates, category = Utility,
 * with {{1}}=name, {{2}}=date, {{3}}=time. Then set:
 *   wrangler secret put WA_BOOKING_TEMPLATE   (e.g. booking_confirmed)
 *   wrangler secret put WA_CLIENT_LANG        (defaults to ar)
 * Leave WA_BOOKING_TEMPLATE unset and this channel is skipped → still free.
 * ──────────────────────────────────────────────────────────────────────────── */
async function sendWhatsAppToClient(data, type, env, fetchImpl = fetch) {
  if (type !== 'booking') return { channel: 'wa-client', ok: false, skipped: true };
  if (!env.WA_TOKEN || !env.WA_PHONE_ID || !env.WA_BOOKING_TEMPLATE) {
    return { channel: 'wa-client', ok: false, skipped: true };
  }
  const to = data.phone.replace(/^\+/, '');
  if (!to) return { channel: 'wa-client', ok: false, skipped: true };
  const r = await fetchImpl(`https://graph.facebook.com/v21.0/${env.WA_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: env.WA_BOOKING_TEMPLATE,
        language: { code: env.WA_CLIENT_LANG || 'ar' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: data.name || 'there' },
            { type: 'text', text: data.date || '—' },
            { type: 'text', text: data.time || '—' },
          ],
        }],
      },
    }),
  });
  let d = {};
  try { d = await r.json(); } catch { /* ignore */ }
  return { channel: 'wa-client', ok: r.ok, status: r.status, error: d?.error?.message };
}

/* ───────────────── Resend email (free 3 000/month) ─────────────────
 * wrangler secret put RESEND_KEY      (re_XXXXXXXX)
 * wrangler secret put RESEND_FROM     (alerts@egygrillz.com — domain must be verified)
 * wrangler secret put ALERT_EMAIL     (where YOU want the copy)
 * ───────────────────────────────────────────────────────────────── */
async function sendEmail(subject, text, to, env, fetchImpl = fetch) {
  if (!env.RESEND_KEY || !to) return { channel: 'email', ok: false, skipped: true };
  const r = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.RESEND_FROM || 'EGYGRILLZ <onboarding@resend.dev>',
      to: [to],
      subject,
      text,
    }),
  });
  let d = {};
  try { d = await r.json(); } catch { /* ignore */ }
  return { channel: 'email', ok: r.ok, status: r.status, error: d?.message };
}

/** customer-friendly confirmation text */
function formatClientConfirmation(data) {
  return [
    `EGYGRILLZ — Booking Confirmed`,
    ``,
    `Hi ${data.name || 'there'},`,
    `Your appointment is booked.`,
    ``,
    `Service: ${data.service || '—'}`,
    `Date:    ${data.date || '—'}`,
    `Time:    ${data.time || '—'}`,
    ``,
    `Address & directions: https://egygrillz.com/contact`,
    `Questions? WhatsApp us: https://wa.me/201000353839`,
    ``,
    `See you soon `,
    `EGYGRILLZ`,
  ].join('\n');
}


/** EGYGRILLZ branded confirmation — designed markup, inline styles only */
const CLIENT_EMAIL_HTML = `<table style="background: #f5f5f3; padding: 50px 20px;" width="100%" cellspacing="0" cellpadding="0">
<tbody>
<tr>
<td align="center">
<table style="max-width: 560px; background: #ffffff; border: 1px solid #e8e8e8;" width="100%" cellspacing="0" cellpadding="0"><!-- HEADER -->
<tbody>
<tr>
<td style="padding: 50px 40px 40px; border-bottom: 1px solid #eeeeee;" align="center">
<p style="margin: 0 0 6px; font-family: 'Arial',sans-serif; font-size: 9px; text-transform: uppercase; letter-spacing: 6px; color: #bbbbbb;">Est. Cairo, Egypt</p>
<h1 style="margin: 0; font-family: 'Georgia',serif; font-size: 28px; font-weight: 400; letter-spacing: 6px; text-transform: uppercase; color: #1a1a1a;">EGYGRILLZ</h1>
<div style="width: 30px; height: 1px; background: #1a1a1a; margin: 16px auto 0;"> </div>
</td>
</tr>
<!-- CONFIRMATION TITLE -->
<tr>
<td style="padding: 40px 40px 10px;" align="center">
<p style="margin: 0 0 10px; font-family: 'Arial',sans-serif; font-size: 9px; text-transform: uppercase; letter-spacing: 4px; color: #aaaaaa;">Appointment Confirmed</p>
<h2 style="margin: 0; font-family: 'Georgia',serif; font-size: 22px; font-weight: 400; letter-spacing: 2px; text-transform: uppercase; color: #1a1a1a;">We'll See You Soon</h2>
</td>
</tr>
<!-- GREETING -->
<tr>
<td style="padding: 24px 40px 30px;">
<p style="margin: 0; font-family: 'Arial',sans-serif; font-size: 13px; color: #555555; line-height: 1.9; text-align: center;">Dear {{name}},

Your appointment at <strong style="color: #1a1a1a;">EGYGRILLZ Studio</strong> has been confirmed. We look forward to crafting something truly unique for you.</p>
</td>
</tr>
<!-- BOOKING DETAILS -->
<tr>
<td style="padding: 0 40px 10px;">
<table style="border: 1px solid #eeeeee;" width="100%" cellspacing="0" cellpadding="0">
<tbody>
<tr>
<td style="padding: 10px 20px; background: #fafaf9;">
<p style="margin: 0; font-family: 'Arial',sans-serif; font-size: 9px; text-transform: uppercase; letter-spacing: 3px; color: #aaaaaa;">Booking Details</p>
</td>
</tr>
<tr>
<td style="padding: 16px 20px; border-top: 1px solid #eeeeee;">
<table width="100%" cellspacing="0" cellpadding="0">
<tbody>
<tr>
<td style="font-family: 'Arial',sans-serif; font-size: 9px; text-transform: uppercase; letter-spacing: 2px; color: #aaaaaa; width: 90px; vertical-align: top; padding-top: 2px;">Service</td>
<td style="font-family: 'Arial',sans-serif; font-size: 13px; color: #1a1a1a; font-weight: bold;">{{service}}</td>
</tr>
</tbody>
</table>
</td>
</tr>
<tr>
<td style="padding: 16px 20px; border-top: 1px solid #eeeeee;">
<table width="100%" cellspacing="0" cellpadding="0">
<tbody>
<tr>
<td style="font-family: 'Arial',sans-serif; font-size: 9px; text-transform: uppercase; letter-spacing: 2px; color: #aaaaaa; width: 90px; vertical-align: top; padding-top: 2px;">Date</td>
<td style="font-family: 'Arial',sans-serif; font-size: 13px; color: #1a1a1a;">{{date}}</td>
</tr>
</tbody>
</table>
</td>
</tr>
<tr>
<td style="padding: 16px 20px; border-top: 1px solid #eeeeee;">
<table width="100%" cellspacing="0" cellpadding="0">
<tbody>
<tr>
<td style="font-family: 'Arial',sans-serif; font-size: 9px; text-transform: uppercase; letter-spacing: 2px; color: #aaaaaa; width: 90px; vertical-align: top; padding-top: 2px;">Time</td>
<td style="font-family: 'Arial',sans-serif; font-size: 13px; color: #1a1a1a;">{{time}}</td>
</tr>
</tbody>
</table>
</td>
</tr>
<tr>
<td style="padding: 16px 20px; border-top: 1px solid #eeeeee;">
<table width="100%" cellspacing="0" cellpadding="0">
<tbody>
<tr>
<td style="font-family: 'Arial',sans-serif; font-size: 9px; text-transform: uppercase; letter-spacing: 2px; color: #aaaaaa; width: 90px; vertical-align: top; padding-top: 2px;">Location</td>
<td style="font-family: 'Arial',sans-serif; font-size: 13px; color: #1a1a1a; line-height: 1.7;">Inside Smart Smile Clinics
38 Abou Bakr EL-Sdeek, Heliopolis
Floor 5, Apt 504 &mdash; Cairo</td>
</tr>
</tbody>
</table>
</td>
</tr>
</tbody>
</table>
</td>
</tr>
<!-- PAYMENT NOTE -->
<tr>
<td style="padding: 24px 40px;">
<table style="border-left: 2px solid #1a1a1a; padding-left: 0;" width="100%" cellspacing="0" cellpadding="0">
<tbody>
<tr>
<td style="padding: 16px 20px; background: #fafaf9;">
<p style="margin: 0 0 6px; font-family: 'Arial',sans-serif; font-size: 9px; text-transform: uppercase; letter-spacing: 3px; color: #aaaaaa;">Payment Policy</p>
<p style="margin: 0; font-family: 'Arial',sans-serif; font-size: 13px; color: #1a1a1a; line-height: 1.8;">A <strong>100% deposit</strong> is required upon arrival at the studio.</p>
<p style="margin: 0; font-family: 'Arial',sans-serif; font-size: 13px; color: #1a1a1a; line-height: 1.8;">All deposits are non-refundable.</p>
</td>
</tr>
</tbody>
</table>
</td>
</tr>
<!-- CLOSING MESSAGE -->
<tr>
<td style="padding: 10px 40px 40px;">
<p style="margin: 0; font-family: 'Arial',sans-serif; font-size: 13px; color: #555555; line-height: 1.9; text-align: center;">If you have any questions or need to reschedule,
feel free to reach out &mdash; we're always happy to help.

<em style="font-family: 'Georgia',serif; font-size: 14px; color: #1a1a1a;">We can't wait to create something extraordinary for you.</em></p>
</td>
</tr>
<!-- DIVIDER -->
<tr>
<td style="padding: 0 40px;">
<div style="height: 1px; background: #eeeeee;"> </div>
</td>
</tr>
<!-- FOOTER -->
<tr>
<td style="padding: 30px 40px 40px;" align="center">
<p style="margin: 0 0 12px; font-family: 'Georgia',serif; font-size: 18px; font-weight: 400; letter-spacing: 4px; text-transform: uppercase; color: #1a1a1a;">EGYGRILLZ</p>
<p style="margin: 0 0 16px; font-family: 'Arial',sans-serif; font-size: 10px; color: #aaaaaa; letter-spacing: 1px;">Handcrafted Dental Jewelry &middot; Cairo, Egypt</p>
<a style="font-family: 'Arial',sans-serif; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #1a1a1a; text-decoration: none; border-bottom: 1px solid #1a1a1a; padding-bottom: 2px;" href="https://instagram.com/egygrillz">@egygrillz</a>
<p style="margin: 14px 0 0; font-family: 'Arial',sans-serif; font-size: 12px; color: #555555;">Need help? Call us at <a style="color: #1a1a1a; font-weight: bold; text-decoration: none;" href="https://wa.me/201000353839">+20 100 035 3839</a></p>
<p style="margin: 20px 0 0; font-family: 'Arial',sans-serif; font-size: 9px; color: #cccccc; text-transform: uppercase; letter-spacing: 2px;">&copy; 2026 EGYGRILLZ &middot; All Rights Reserved</p>
</td>
</tr>
</tbody>
</table>
</td>
</tr>
</tbody>
</table>
`;

function clientEmailHTML(d) {
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return CLIENT_EMAIL_HTML
    .replace(/\{\{name\}\}/g, esc(d.name || 'there'))
    .replace(/\{\{service\}\}/g, esc(d.service || '—'))
    .replace(/\{\{date\}\}/g, esc(d.date || '—'))
    .replace(/\{\{time\}\}/g, esc(d.time || '—'));
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  EMAILJS (server-side) — uses EmailJS Private Key for scheduled reminders
 *  (EmailJS -> Account -> General -> API Keys).
 *  Secrets: EMAILJS_PRIVATE_KEY
 *  Vars  : EMAILJS_SERVICE_ID (service_r8fhuah)
 *          EMAILJS_PUBLIC_KEY  (rvcNsK9pAj-jhd9RE)
 *          EMAILJS_REMINDER_TEMPLATE
 * ═══════════════════════════════════════════════════════════════════════════ */
async function sendViaEmailJS(templateId, params, env, fetchImpl = fetch) {
  if (!env.EMAILJS_PRIVATE_KEY) return { channel: 'emailjs', ok: false, skipped: true };
  if (!templateId) return { channel: 'emailjs', ok: false, skipped: true, error: 'no-template' };

  const r = await fetchImpl('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: env.EMAILJS_SERVICE_ID || 'service_r8fhuah',
      template_id: templateId,
      user_id: env.EMAILJS_PUBLIC_KEY || 'rvcNsK9pAj-jhd9RE',
      accessToken: env.EMAILJS_PRIVATE_KEY,
      template_params: params,
    }),
  });
  const txt = await r.text().catch(() => '');
  return { channel: 'emailjs', ok: r.ok, status: r.status, error: r.ok ? undefined : txt.slice(0, 200) };
}

/** Send reminder via EmailJS */
async function sendReminderTo(appt, env, f) {
  const params = {
    to_name: appt.name || 'there',
    to_email: appt.email,
    name: appt.name || 'there',
    email: appt.email,
    service: appt.service || '—',
    date: appt.date || '—',
    time: appt.time || '—',
    message: formatReminderText(appt),
    subject: 'Reminder — your EGYGRILLZ appointment is tomorrow',
    html: reminderEmailHTML(appt),
  };
  return sendViaEmailJS(env.EMAILJS_REMINDER_TEMPLATE || 'template_reminder', params, env, f);
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  REMINDERS — called once a day by a Cloudflare Cron Trigger at 10:00 UTC
 *  (= 12:00 Cairo). Reads Firestore REST (no SDK needed on Workers), finds
 *  every appointment dated TOMORROW, and emails each client.
 *
 *  Secrets needed:  FIREBASE_API_KEY (the same public web key),
 *                   EMAILJS_PRIVATE_KEY (EmailJS → Account → API Keys)
 *  Optional:        ALERT_EMAIL (a summary copy for the owner)
 * ═══════════════════════════════════════════════════════════════════════════ */
const FIRESTORE_PROJECT = 'egygrillz-studio';

function cairoTomorrow() {
  // Cairo is UTC+2 (no DST since 2023) → midnight Cairo = 22:00 UTC yesterday
  const now = new Date();
  const cairo = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  cairo.setUTCDate(cairo.getUTCDate() + 1);
  return cairo.toISOString().slice(0, 10);
}

async function fetchTodaysAppointments(env, fetchImpl = fetch) {
  if (!env.FIREBASE_API_KEY) return { ok: false, error: 'no-firebase-key', appts: [] };
  const base = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'appointments' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'date' },
          op: 'EQUAL',
          value: { stringValue: cairoTomorrow() },
        },
      },
    },
  };
  const r = await fetchImpl(`${base}:runQuery?key=${env.FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    return { ok: false, error: `firestore-${r.status}`, detail: t.slice(0, 200), appts: [] };
  }
  const rows = await r.json().catch(() => []);
  const appts = [];
  for (const row of rows) {
    const doc = row && row.document;
    if (!doc) continue;
    const f = doc.fields || {};
    const val = (k) => (f[k] && (f[k].stringValue ?? '')) || '';
    appts.push({
      id: (doc.name || '').split('/').pop(),
      name: val('name'), phone: val('phone'), email: val('email'),
      service: val('service'), date: val('date'), time: val('time'),
    });
  }
  return { ok: true, appts, date: cairoTomorrow() };
}

/** Send tomorrow's appointment summary to Telegram (manual or Cron) */
async function sendTelegramDigest(env) {
  const f = env.fetchImpl || fetch;
  const date = cairoTomorrow();
  const res = await fetchTodaysAppointments(env, f);
  if (!res.ok) {
    const msg = `EGYGRILLZ reminders failed\nReason: ${res.error || 'unknown'}\nDate: ${date}`;
    await sendTelegram(msg, env, f).catch(() => {});
    return json({ ok: false, error: res.error, date }, 500);
  }
  const text = formatReminderDigest(res.appts, date);
  const r = await sendTelegram(text, env, f).catch(e => ({ ok: false, error: String(e) }));
  return json({ ok: !!r.ok, date, found: res.appts.length, telegram: !!r.ok, error: r.error });
}

async function sendReminders(env) {
  const f = env.fetchImpl || fetch;
  const today = cairoTomorrow();
  const res = await fetchTodaysAppointments(env, f);
  if (!res.ok) {
    return json({ ok: false, error: res.error, detail: res.detail, date: today }, 500);
  }
  if (!res.appts.length) {
    return json({ ok: true, date: today, found: 0, sent: 0, skipped: 0 });
  }

  const results = [];
  for (const a of res.appts) {
    if (!a.email) { results.push({ id: a.id, email: false, reason: 'no-email' }); continue; }
    const r = await sendReminderTo(a, env, f).catch(e => ({ ok: false, error: String(e) }));
    results.push({ id: a.id, email: r.ok, status: r.status, error: r.error });
  }

  const sent = results.filter(r => r.email).length;

  // optional summary to the owner
  if (env.ALERT_EMAIL) {
    const summary = `EGYGRILLZ reminders sent: ${sent}/${res.appts.length} for ${today}`;
    await sendViaEmailJS(env.EMAILJS_SUMMARY_TEMPLATE || env.EMAILJS_REMINDER_TEMPLATE, {
      to_name: 'EGYGRILLZ', to_email: env.ALERT_EMAIL,
      name: 'EGYGRILLZ', service: '—', date: today, time: '—',
      message: summary, subject: 'Daily reminders summary',
    }, env, f).catch(() => {});
  }

  return json({ ok: true, date: today, found: res.appts.length, sent, results });
}

/* ───────────────────────── handler ───────────────────────── */

export default {
  /** Cron Trigger — daily 12:00 Cairo time + 1-min Telegram polling */
  async scheduled(event, env = {}, ctx = {}) {
    const work = (async () => {
      // Every minute: poll incoming Telegram bot updates
      const bot = await pollTelegram(env).catch(e => ({ ok: false, error: String(e) }));
      // First day of month at 12:00 Cairo time: send previous month's report
      const cairoNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
      if (cairoNow.getUTCDate() === 1 && cairoNow.getUTCHours() === 12 && cairoNow.getUTCMinutes() === 0) {
        const report = await monthlyReport(env, 1).catch(e => 'Report failed: ' + e);
        await sendReport(report, env, env.TELEGRAM_CHAT_ID).catch(() => {});
      }
      let digest = { skipped: true };
      if (cairoNow.getUTCHours() === 12 && cairoNow.getUTCMinutes() === 0) {
        digest = await sendTelegramDigest(env).catch(e => ({ ok: false, error: String(e) }));
      }
      console.log('[cron] bot', JSON.stringify(bot), 'digest', JSON.stringify(digest));
      return { bot, digest };
    })();
    if (ctx && ctx.waitUntil) ctx.waitUntil(work);
    return work;
  },

  async fetch(req, env = {}, ctx = {}) {
    const origin = req.headers.get('Origin') || '';
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

    if (url.pathname === '/api/health') {
      return json({
        ok: true,
        channels: {
          telegram: !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
          ntfy: !!env.NTFY_TOPIC,
          whatsapp_staff: !!(env.WA_TOKEN && env.WA_PHONE_ID && env.WA_TO),
          whatsapp_client: !!(env.WA_TOKEN && env.WA_PHONE_ID && env.WA_BOOKING_TEMPLATE),
          turnstile: !!env.TURNSTILE_SECRET,
          firebase: !!env.FIREBASE_API_KEY,
          staff_login: !!(env.STAFF_EMAIL && env.STAFF_PASSWORD),
        },
        endpoints: {
          health: '/api/health',
          telegram_digest: '/api/remind',
          telegram_bot: 'POST /api/telegram',
          pdf: 'POST /api/pdf',
          moulds_order: 'POST /api/moulds/order',
          moulds_approve: 'POST /api/moulds/approve',
          moulds_status: 'POST /api/moulds/status',
          notify: 'POST /api/notify',
        },
      }, 200, { origin });
    }

    // ── cron: send tomorrow's reminders (called by Cloudflare Cron Trigger) ──
    /* ── Telegram bot webhook ── */
    if (url.pathname === '/api/telegram') {
      const secret = env.TELEGRAM_WEBHOOK_SECRET || '';
      const given = req.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
      if (secret && given !== secret) return json({ ok: false, error: 'unauthorized' }, 401, { origin });
      if (req.method !== 'POST') return json({ ok: true, hint: 'POST here from Telegram' }, 200, { origin });
      let update;
      try { update = await req.json(); } catch { return json({ ok: false, error: 'bad-json' }, 400, { origin }); }
      const r = await handleTelegramUpdate(update, env, env.fetchImpl || fetch).catch(e => ({ ok: false, error: String(e) }));
      return json({ ok: true, ...r }, 200, { origin });
    }

    /* ── register the webhook (call once after deploying) ── */
    if (url.pathname === '/api/telegram/setup') {
      const secret = env.CRON_SECRET || '';
      const given = url.searchParams.get('key') || '';
      if (secret && given !== secret) return json({ ok: false, error: 'unauthorized' }, 401, { origin });
      const host = url.host;
      const f = env.fetchImpl || fetch;
      await clearWebhook(env, f).catch(() => {});
      const hook = `https://${host}/api/telegram`;
      const r = await f(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: hook,
          secret_token: env.TELEGRAM_WEBHOOK_SECRET || undefined,
          allowed_updates: ['message', 'edited_message', 'callback_query'],
        }),
      });
      const d = await r.json().catch(() => ({}));
      return json({ ok: !!d.ok, webhook: hook, telegram: d.description || d.ok }, 200, { origin });
    }

    if (url.pathname === '/api/remind') {
      const secret = env.CRON_SECRET || '';
      const given = url.searchParams.get('key') || req.headers.get('X-Cron-Key') || '';
      if (secret && given !== secret) return json({ ok: false, error: 'unauthorized' }, 401, { origin });
      // Reminders are sent manually from /editx; Cron sends tomorrow's digest to Telegram only
      return sendTelegramDigest(env);
    }


    /* GET /api/telegram/check — verify bot access to Firestore */
    if (url.pathname === '/api/telegram/check') {
      if (!env.FIREBASE_API_KEY) {
        return json({ ok:false, step:'key', message:'FIREBASE_API_KEY is not set in Cloudflare.' }, 200, { origin });
      }
      const token = await staffToken(env).catch(() => '');
      if (!token) {
        return json({ ok:false, step:'login',
          message:'STAFF_EMAIL / STAFF_PASSWORD are not set (or wrong), so the bot is anonymous and Firestore refuses it.' }, 200, { origin });
      }
      // Run lightweight read check
      const r = await fetch(`https://firestore.googleapis.com/v1/projects/egygrillz-studio/databases/(default)/documents:runQuery?key=${env.FIREBASE_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'appointments' }], limit: 1 } }),
      }).catch(() => null);
      if (!r) return json({ ok:false, step:'network', message:'Could not reach Firestore.' }, 200, { origin });
      if (!r.ok) {
        const t = await r.text().catch(()=> '');
        return json({ ok:false, step:'read', status:r.status,
          message: r.status === 403
            ? 'Signed in, but the rules still refuse. The staff UID in isStaff() does not match this account.'
            : 'Firestore said ' + r.status,
          detail: t.slice(0,200) }, 200, { origin });
      }
      return json({ ok:true, step:'ready', message:'The bot can read the database. Everything is connected.' }, 200, { origin });
    }


    /* POST /api/pdf — Quotes Studio forwards PDF directly to Telegram (multipart, not stored) */
    if (url.pathname === '/api/pdf') {
      if (req.method !== 'POST') return json({ ok: false, error: 'use-post' }, 200, { origin });
      const key = env.PDF_KEY || '';
      if (!key) return json({ ok: false, error: 'PDF_KEY-not-set' }, 503, { origin });
      if (req.headers.get('X-Pdf-Key') !== key) return json({ ok: false, error: 'unauthorized' }, 401, { origin });

      let form;
      try { form = await req.formData(); } catch { return json({ ok: false, error: 'bad-form' }, 400, { origin }); }
      const file = form.get('file');
      if (!file || typeof file === 'string') return json({ ok: false, error: 'no-file' }, 400, { origin });
      if (file.size > 45 * 1024 * 1024) return json({ ok: false, error: 'too-big', limit: '45MB' }, 413, { origin });

      const caption = clean(form.get('caption'), 900);
      const r = await sendPdf(new Uint8Array(await file.arrayBuffer()),
        file.name || 'document.pdf', caption, env);
      return json(r, r.ok ? 200 : 502, { origin });
    }

    /* ── mould kit: a new order from /moulds ──
     * The page posts here first. The Worker signs in as the studio account
     * (STAFF_EMAIL / STAFF_PASSWORD) before writing, so the create passes
     * Firestore's rules — a visitor's browser is anonymous and is refused.
     * The delivery fee is added here too, from settings/site, so the total
     * on the order can never be missing it.
     */
    if (url.pathname === '/api/moulds/order') {
      if (req.method !== 'POST') return json({ ok: false, error: 'use-post' }, 405, { origin });
      if (!originAllowed(origin, env)) return json({ ok: false, error: 'bad-origin' }, 403, { origin });

      let body;
      try { body = await req.json(); } catch { return json({ ok: false, error: 'bad-json' }, 400, { origin }); }
      const ip = req.headers.get('CF-Connecting-IP') || '';
      const limit = parseInt(env.RATE_LIMIT_PER_10MIN || '10', 10);
      if (rateLimited('mould:' + ip, limit)) return json({ ok: false, error: 'rate-limited' }, 429, { origin });

      const src = body.data || body || {};
      const name = clean(src.name, 80);
      const phone = cleanPhone(src.phone);
      const email = clean(src.email, 120);
      if (!name || !phone) return json({ ok: false, error: 'missing-fields' }, 422, { origin });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        return json({ ok: false, error: 'bad-email' }, 422, { origin });
      }

      const archesRaw = clean(src.arches, 20).toLowerCase();
      const arches = archesRaw.includes('both') ? 'both' : archesRaw.includes('lower') ? 'lower' : 'upper';
      const archCount = arches === 'both' ? 2 : 1;
      /* the price always comes from settings/site — never from the browser,
         so the delivery fee can neither be dropped nor edited away */
      const prices = await loadMouldPrices(env, env.fetchImpl || fetch);
      const mouldPrice = prices.perArch * archCount;
      const deliveryFee = Math.max(0, prices.delivery);
      const total = mouldPrice + deliveryFee;

      const nowIso = new Date().toISOString();
      const order = {
        name,
        phone,
        email,
        arches,
        archCount,
        perArch: prices.perArch,
        mouldPrice,
        deliveryFee,
        total,
        currency: 'EGP',
        address: clean(src.address, 300),
        mapLink: clean(src.mapLink, 300),
        location: (src.location && typeof src.location === 'object') ? src.location : null,
        status: 'pending',
        source: 'moulds-page',
        paymentLink: '',
        createdAt: nowIso,
      };

      const f = env.fetchImpl || fetch;
      let id = '';
      let stored = false;
      try {
        const fields = {};
        for (const [k, v] of Object.entries(order)) fields[k] = toFsValue(v);
        const r = await f(`${FS_BASE}/mould_orders?key=${env.FIREBASE_API_KEY}`, {
          method: 'POST',
          headers: await fsHeaders(env, f),
          body: JSON.stringify({ fields }),
        });
        if (r.ok) {
          const doc = await r.json().catch(() => null);
          id = String((doc && doc.name) || '').split('/').pop();
          stored = !!id;
        } else {
          const t = await r.text().catch(() => '');
          console.log('[moulds] create refused', r.status, t.slice(0, 200));
        }
      } catch (e) {
        console.log('[moulds] create failed', String(e));
      }

      /* the studio still hears about the order even if the database refused
         it — an order in Telegram can be typed in by hand, a lost one cannot */
      const saved = Object.assign({}, order, { id });
      const text = formatMouldOrder(saved) + (stored
        ? ''
        : '\n\n⚠ Not saved to the database — type this order into /editx by hand.');
      const tg = env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID
        ? await tgCall('sendMessage', {
            chat_id: env.TELEGRAM_CHAT_ID,
            text,
            disable_web_page_preview: false,
            ...(stored ? { reply_markup: mouldKeyboard(saved) } : {}),
          }, env, f).catch(e => ({ ok: false, error: String(e) }))
        : { ok: false, skipped: true };
      const ntfy = await sendNtfy(text, 'New mould kit order', env, f)
        .catch(e => ({ channel: 'ntfy', ok: false, error: String(e) }));
      const staffMail = await sendEmail('New mould kit order — EGYGRILLZ', text, env.ALERT_EMAIL, env, f)
        .catch(e => ({ channel: 'email', ok: false, error: String(e) }));

      /* nothing was written and nobody was told — let the page use its own
         browser write instead of pretending the order went through */
      if (!stored && !(tg.ok || ntfy.ok || staffMail.ok)) {
        return json({ ok: false, error: 'not-saved' }, 502, { origin });
      }

      return json({
        ok: true,
        stored,
        id,
        ref: id ? id.slice(0, 8).toUpperCase() : '',
        name,
        arches,
        archCount,
        perArch: prices.perArch,
        mouldPrice,
        deliveryFee,
        total,
        notified: !!(tg.ok || ntfy.ok || staffMail.ok),
      }, 200, { origin });
    }

    /* ── mould kit: approve — save the link + status only ──
     * Nothing is emailed here. The response carries the Gmail draft URL so
     * /editx and the bot can open the compose window; a human presses Send.
     */
    if (url.pathname === '/api/moulds/approve') {
      if (req.method !== 'POST') return json({ ok: false, error: 'use-post' }, 405, { origin });
      if (!originAllowed(origin, env)) return json({ ok: false, error: 'bad-origin' }, 403, { origin });
      const key = env.MOULDS_KEY || '';
      const given = req.headers.get('X-Moulds-Key') || url.searchParams.get('key') || '';
      if (key && given !== key) return json({ ok: false, error: 'unauthorized' }, 401, { origin });

      let body;
      try { body = await req.json(); } catch { return json({ ok: false, error: 'bad-json' }, 400, { origin }); }
      const id = clean(body.id, 120);
      const paymentLink = clean(body.paymentLink, 500);
      if (!id) return json({ ok: false, error: 'missing-id' }, 422, { origin });

      const r = await approveMouldOrder(env, id, paymentLink, env.fetchImpl || fetch)
        .catch(e => ({ ok: false, error: String(e) }));
      if (!r.ok) {
        const status = r.error === 'not-found' ? 404
          : (r.error === 'no-payment-link' || r.error === 'bad-payment-link') ? 422 : 502;
        return json(r, status, { origin });
      }
      return json({
        ok: true,
        order: r.order,
        subject: r.subject,
        body: r.body,
        gmailUrl: r.gmailUrl,
      }, 200, { origin });
    }

    /* ── mould kit: mark delivered / back to pending ── */
    if (url.pathname === '/api/moulds/status') {
      if (req.method !== 'POST') return json({ ok: false, error: 'use-post' }, 405, { origin });
      if (!originAllowed(origin, env)) return json({ ok: false, error: 'bad-origin' }, 403, { origin });
      const key = env.MOULDS_KEY || '';
      const given = req.headers.get('X-Moulds-Key') || url.searchParams.get('key') || '';
      if (key && given !== key) return json({ ok: false, error: 'unauthorized' }, 401, { origin });

      let body;
      try { body = await req.json(); } catch { return json({ ok: false, error: 'bad-json' }, 400, { origin }); }
      const id = clean(body.id, 120);
      const status = clean(body.status, 20).toLowerCase();
      if (!id || !['pending', 'approved', 'delivered'].includes(status)) {
        return json({ ok: false, error: 'bad-request' }, 422, { origin });
      }
      const patch = await saveMouldOrder(env, id, { status, statusUpdatedAt: new Date().toISOString() }, env.fetchImpl || fetch);
      return json({ ok: patch.ok, status, error: patch.ok ? undefined : patch.error }, patch.ok ? 200 : 502, { origin });
    }

    if (url.pathname !== '/api/notify' || req.method !== 'POST') {
      return json({ ok: false, error: 'not-found' }, 404, { origin });
    }

    // ── origin check ──
    // Accept the studio's own domains, GitHub previews and *.pages.dev.
    // A visitor's booking must never be dropped because the domain list
    // was not updated after a move.
    if (!originAllowed(origin, env)) {
      return json({ ok: false, error: 'bad-origin' }, 403, { origin });
    }

    // ── body ──
    let body;
    try { body = await req.json(); } catch { return json({ ok: false, error: 'bad-json' }, 400, { origin }); }

    const ip = req.headers.get('CF-Connecting-IP') || '';
    const limit = parseInt(env.RATE_LIMIT_PER_10MIN || '10', 10);
    if (rateLimited(ip, limit)) return json({ ok: false, error: 'rate-limited' }, 429, { origin });

    /* ── mould kit order → instant Telegram alert with buttons ──
     * The order itself is already saved in Firestore by the page, so this
     * call is only the notification. It must never block the client. */
    if (body.type === 'mould') {
      const src = body.data || {};
      if (src.website) return json({ ok: true, notified: true, channels: [] }, 200, { origin }); // honeypot
      const f = env.fetchImpl || fetch;
      const order = {
        id: clean(src.ref, 60),
        name: clean(src.name, 80),
        phone: cleanPhone(src.phone),
        email: clean(src.email, 120),
        arches: clean(src.arches, 20).toLowerCase().includes('both') ? 'both'
          : clean(src.arches, 20).toLowerCase().includes('lower') ? 'lower' : 'upper',
        archCount: Math.max(1, Math.min(2, Number(src.archCount) || 1)),
        mouldPrice: Math.max(0, Number(src.mouldPrice) || 0),
        deliveryFee: Math.max(0, Number(src.deliveryFee) || 0),
        total: Math.max(0, Number(src.total) || 0),
        address: clean(src.address, 300),
        mapLink: clean(src.mapLink, 300),
        status: 'pending',
        paymentLink: '',
      };
      if (!order.name || !order.phone) {
        return json({ ok: false, error: 'missing-fields' }, 422, { origin });
      }
      const text = formatMouldOrder(order);
      const tg = env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID
        ? await tgCall('sendMessage', {
            chat_id: env.TELEGRAM_CHAT_ID,
            text,
            disable_web_page_preview: false,
            reply_markup: mouldKeyboard(order),
          }, env, f).catch(e => ({ ok: false, error: String(e) }))
        : { ok: false, skipped: true };
      const ntfy = await sendNtfy(text, 'New mould kit order', env, f)
        .catch(e => ({ channel: 'ntfy', ok: false, error: String(e) }));
      const staffMail = await sendEmail('New mould kit order — EGYGRILLZ', text, env.ALERT_EMAIL, env, f)
        .catch(e => ({ channel: 'email', ok: false, error: String(e) }));
      return json({
        ok: true,
        notified: !!(tg.ok || ntfy.ok || staffMail.ok),
        channels: [
          { c: 'telegram', ok: !!tg.ok },
          { c: 'ntfy', ok: !!ntfy.ok },
          { c: 'email-staff', ok: !!staffMail.ok },
        ],
      }, 200, { origin });
    }

    const ts = await verifyTurnstile(body.turnstile, env.TURNSTILE_SECRET, ip, env.fetchImpl || fetch);
    if (!ts.ok) return json({ ok: false, error: 'turnstile-failed', detail: ts.reason }, 403, { origin });

    // ── payload ──
    const type = body.type === 'message' ? 'message' : 'booking';
    const src = body.data || {};
    const data = {
      name: clean(src.name, 80),
      phone: cleanPhone(src.phone),
      email: clean(src.email, 120),
      service: clean(src.service, 200),
      date: clean(src.date, 20),
      time: clean(src.time, 20),
      notes: clean(src.notes, 800),
      message: clean(src.message, 1500),
      deposit: clean(src.deposit, 40),
      ref: clean(src.ref, 30),
    };
    // honeypot: bots fill hidden fields
    if (src.website) return json({ ok: true, sent: [] }, 200, { origin }); // silently drop

    if (type === 'booking' && (!data.name || !data.phone || !data.date)) {
      return json({ ok: false, error: 'missing-fields' }, 422, { origin });
    }
    if (type === 'message' && (!data.name || !(data.message || data.phone))) {
      return json({ ok: false, error: 'missing-fields' }, 422, { origin });
    }

    const text = type === 'booking' ? formatBooking(data) : formatMessage(data);
    const title = type === 'booking' ? 'New booking' : 'New message';

    const f = env.fetchImpl || fetch;   // injectable for tests
    const results = await Promise.all([
      sendTelegram(text, env, f).catch(e => ({ channel: 'telegram', ok: false, error: String(e) })),
      sendNtfy(text, title, env, f).catch(e => ({ channel: 'ntfy', ok: false, error: String(e) })),
      sendWhatsApp(text, env, f).catch(e => ({ channel: 'whatsapp', ok: false, error: String(e) })),
      sendWhatsAppToClient(data, type, env, f).catch(e => ({ channel: 'wa-client', ok: false, error: String(e) })),
      sendEmail(`New ${type} — EGYGRILLZ`, text, env.ALERT_EMAIL, env, f)
        .catch(e => ({ channel: 'email-staff', ok: false, error: String(e) })),
      /* Client confirmation email is handled browser-side by EmailJS */
      Promise.resolve({ channel: 'email-client', ok: false, skipped: true }),
    ]);

    const anySent = results.some(r => r.ok);
    // Never fail the visitor's booking because a channel is down.
    return json({ ok: true, notified: anySent, channels: results.map(r => ({ c: r.channel, ok: !!r.ok, skipped: !!r.skipped })) }, 200, { origin });
  },
};
