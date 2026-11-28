/* Production PDF for download/email. Render the actual print view's layer maps,
   specifications and pen signature on demand. Browser fonts handle client notes
   in either language. Neither these page images nor the PDF are persisted. */
const W = 1120,
  H = 1584,
  M = 72,
  RIGHT = W - M,
  BOTTOM = H - 95;
const ascii = (s) => new TextEncoder().encode(s);
function pdf(jpegs) {
  const chunks = [],
    offsets = [0];
  let pos = 0;
  const raw = (b) => {
    chunks.push(b);
    pos += b.length;
  };
  const write = (s) => raw(ascii(s));
  const object = (id, s) => {
    offsets[id] = pos;
    write(`${id} 0 obj\n${s}\nendobj\n`);
  };
  write('%PDF-1.4\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(
    2,
    `<< /Type /Pages /Count ${jpegs.length} /Kids [${jpegs.map((_, i) => `${3 + 3 * i} 0 R`).join(' ')}] >>`,
  );
  for (const [i, img] of jpegs.entries()) {
    const p = 3 + i * 3,
      draw = 'q 595.28 0 0 841.89 0 0 cm /Sheet Do Q';
    object(
      p,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Sheet ${p + 1} 0 R >> >> /Contents ${p + 2} 0 R >>`,
    );
    offsets[p + 1] = pos;
    write(
      `${p + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`,
    );
    raw(img);
    write('\nendstream\nendobj\n');
    object(p + 2, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);
  }
  const xref = pos;
  write(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (const o of offsets.slice(1)) write(`${String(o).padStart(10, '0')} 00000 n \n`);
  write(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}
export async function build(sheet, q) {
  const view = sheet.cloneNode(true),
    pages = [],
    c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d', { alpha: false });
  let y = 0,
    packedBytes = 0;
  function page() {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#191919';
    ctx.font = 'bold 31px Arial';
    ctx.fillText('EGYGRILLZ', M, 87);
    ctx.font = '20px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(q.orderNo, RIGHT, 85);
    ctx.textAlign = 'left';
    ctx.fillRect(M, 108, W - 2 * M, 2);
    y = 162;
  }
  function flush() {
    ctx.fillStyle = '#595959';
    ctx.font = '17px Arial';
    ctx.fillText('STUDIO  /  CLIENT ORDER SHEET', M, H - 46);
    ctx.textAlign = 'right';
    ctx.fillText(String(pages.length + 1), RIGHT, H - 46);
    ctx.textAlign = 'left';
    const str = atob(c.toDataURL('image/jpeg', 0.84).split(',')[1]);
    packedBytes += str.length;
    if (packedBytes > 6 * 1024 * 1024 - 12000)
      throw Object.assign(
        new Error(
          'Order PDF is too large to build in this browser. Use Print order sheet and choose Save as PDF.',
        ),
        { code: 'order/document' },
      );
    pages.push(Uint8Array.from(str, (ch) => ch.charCodeAt(0)));
  }
  function space(h) {
    if (y + h > BOTTOM) {
      flush();
      page();
    }
  }
  function paragraph(s, size = 22, bold = false) {
    const font = `${bold ? 'bold ' : ''}${size}px Arial, sans-serif`,
      height = size * 1.42;
    for (const line of String(s || '').split('\n')) {
      ctx.font = font;
      let text = '';
      const put = () => {
        space(height);
        ctx.font = font;
        ctx.fillStyle = bold ? '#151515' : '#393939';
        ctx.fillText(text, M, y, W - 2 * M);
        y += height;
      };
      for (const w of line.split(/\s+/)) {
        if (text && ctx.measureText(text + ' ' + w).width > W - 2 * M) {
          put();
          text = '';
        }
        text += (text ? ' ' : '') + w;
      }
      if (text) put();
    }
  }
  function heading(s) {
    space(98);
    y += 14;
    paragraph(s, 26, true);
    ctx.fillStyle = '#d3d3d3';
    ctx.fillRect(M, y - 18, W - 2 * M, 1);
    y += 10;
  }
  const img = async (el) => {
    await el.decode();
    return el;
  };
  page();
  paragraph('Client order sheet', 38, true);
  paragraph([q.clientName || q.label, q.clientPhone, q.clientEmail].filter(Boolean).join('   /   '));
  for (const el of view.querySelectorAll('.print-meta > div'))
    if (!el.textContent.startsWith('Client'))
      paragraph(`${el.querySelector('span').textContent}: ${el.querySelector('strong').textContent}`, 20);
  paragraph(view.querySelector('.print-heading div').lastChild.textContent.trim(), 18);
  const maps = [...view.querySelectorAll('.design-layer-print')];
  if (q.order.lines.length && !maps.length) throw Error('The design illustration is not ready.');
  for (const design of view.querySelectorAll('.print-design')) {
    const figure = design.querySelector('.design-layer-print');
    const [x, y0, w, h] = (figure?.dataset.crop || '0,0,1,1').split(',').map(Number);
    const aspect = (900 * w) / (330.6 * h),
      width = Math.min(840, 220 * aspect),
      height = width / aspect;
    space(figure ? height + 145 : 100);
    heading(design.querySelector('h4').textContent);
    if (figure) {
      const [teeth, ink] = await Promise.all([...figure.querySelectorAll('.print-layer-map img')].map(img));
      // Draw the entire SVG at its intended aspect ratio, then clip. SVGs
      // without intrinsic pixels do not share a bitmap's source-rect semantics.
      const left = (W - width) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, y, width, height);
      ctx.clip();
      for (const image of [teeth, ink])
        ctx.drawImage(image, left - (x * width) / w, y - (y0 * height) / h, width / w, height / h);
      ctx.restore();
      y += height + 25;
    }
    for (const group of design.querySelectorAll('.print-group')) {
      space(72);
      paragraph(group.querySelector('h5').textContent, 21, true);
      for (const pair of group.querySelectorAll('.print-detail'))
        paragraph([...pair.querySelectorAll('span')].map((x) => x.textContent).join(': '), 20);
    }
  }
  const finishes = [...view.querySelectorAll('.rollup-item')];
  if (finishes.length) {
    heading('Materials & finishes');
    const col = (W - 2 * M) / 3;
    for (let i = 0; i < finishes.length; i += 3) {
      space(84);
      for (const [j, item] of finishes.slice(i, i + 3).entries()) {
        const x = M + j * col,
          photo = item.querySelector('img');
        if (photo) {
          try {
            await img(photo);
            const k = Math.min(64 / photo.naturalWidth, 55 / photo.naturalHeight);
            ctx.drawImage(photo, x, y - 15, photo.naturalWidth * k, photo.naturalHeight * k);
          } catch {
            /* The written finish is still present. */
          }
        }
        ctx.fillStyle = '#222';
        ctx.font = '18px Arial';
        ctx.fillText(item.querySelector('span').textContent, x + 70, y + 12, col - 82);
      }
      y += 74;
    }
  }
  heading('Production & payment');
  for (const p of view.querySelectorAll('.print-notes p')) paragraph(p.textContent, 20);
  paragraph(`Quoted total: ${q.total.toLocaleString('en-US')} ${q.order.currency || 'EGP'}`, 26, true);
  const signature = view.querySelector('.signature-line img');
  space(signature ? 216 : 110);
  heading('Client approval');
  paragraph(view.querySelector('.print-legal').textContent, 18);
  if (signature) {
    space(106);
    ctx.drawImage(await img(signature), M, y, 400, 100);
    y += 104;
  } else paragraph('No signature recorded.', 18);
  flush();
  return pdf(pages);
}
export function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}
