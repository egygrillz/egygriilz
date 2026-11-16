/* ═══════════════════════════════════════════════════════════════════════════
 *  EGYGRILLZ — IMAGE PIPELINE (browser-side)
 *  ---------------------------------------------------------------------------
 *  Resizes and compresses uploaded images in the browser before committing
 *  to GitHub (GitHub-only storage — no external image services).
 *
 *  Size targets:
 *    • Primary asset: max 1400 px side, <= 300 KB JPEG
 *    • Thumbnail: max 700 px side (_thumb suffix)
 *    • Already small high-quality JPEGs are passed through unchanged
 * ═══════════════════════════════════════════════════════════════════════════ */

const MEDIA = {
  MAX_SIDE: 1400,
  JPG_QUALITY: 0.82,
  TARGET_BYTES: 300 * 1024,
  MAX_VIDEO_BYTES: 25 * 1024 * 1024,

  async compressImage(file) {
    const isJpg = /jpe?g$/i.test(file.type) || /\.jpe?g$/i.test(file.name);

    if (file.size <= this.TARGET_BYTES && isJpg) {
      return { blob: file, name: this.cleanName(file.name), changed: false };
    }

    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = url;
      });

      let { naturalWidth: w, naturalHeight: h } = img;
      const scale = Math.min(1, this.MAX_SIDE / Math.max(w, h));
      w = Math.round(w * scale);
      h = Math.round(h * scale);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      let q = this.JPG_QUALITY;
      let blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', q));
      while (blob && blob.size > this.TARGET_BYTES && q > 0.5) {
        q -= 0.07;
        blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', q));
      }
      if (!blob) return { blob: file, name: this.cleanName(file.name), changed: false };
      if (blob.size >= file.size && scale === 1) {
        return { blob: file, name: this.cleanName(file.name), changed: false };
      }

      const name = this.cleanName(file.name).replace(/\.[^.]+$/, '') + '.jpg';
      return { blob, name, changed: true, from: file.size, to: blob.size, size: [w, h] };
    } catch (e) {
      return { blob: file, name: this.cleanName(file.name), changed: false };
    } finally {
      URL.revokeObjectURL(url);
    }
  },

  /* Optional local thumbnail generator (700px max side) */
  THUMB_SIDE: 700,
  THUMB_QUALITY: 0.78,

  async makeThumb(blob) {
    try {
      const url = URL.createObjectURL(blob);
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = url;
      });
      let { naturalWidth: w, naturalHeight: h } = img;
      if (Math.max(w, h) <= this.THUMB_SIDE) { URL.revokeObjectURL(url); return null; }
      const scale = this.THUMB_SIDE / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const out = await new Promise(r => canvas.toBlob(r, 'image/jpeg', this.THUMB_QUALITY));
      URL.revokeObjectURL(url);
      return out || null;
    } catch (e) { return null; }
  },

  thumbName(name) {
    return String(name).replace(/(\.[^.]+)$/, '_thumb$1');
  },

  cleanName(name) {
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : 'jpg';
    const safe = base.toLowerCase()
      .replace(/[^a-z0-9\-_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'file';
    return safe + '.' + ext;
  },

  human(bytes) {
    return bytes > 1048576 ? (bytes / 1048576).toFixed(1) + ' MB'
         : Math.round(bytes / 1024) + ' KB';
  },

  /** Convert Blob to base64 payload for GitHub Contents API */
  toBase64(blob) {
    return new Promise((ok, no) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(',')[1]);
      r.onerror = no;
      r.readAsDataURL(blob);
    });
  },
};

window.MEDIA = MEDIA;
