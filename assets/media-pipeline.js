/* ═══════════════════════════════════════════════════════════════════════════
 *  EGYGRILLZ — IMAGE PIPELINE  (browser side)
 *  ---------------------------------------------------------------------------
 *  مهمة واحدة: أي صورة تيجي من الموبايل (2-5 ميجا) تتصغّر وتتضغط **قبل**
 *  ما تطلع من الجهاز، فاللي بيوصل GitHub يبقى 80-120 كيلو بس.
 *
 *  مفيش أي خدمة برة — GitHub بس. مفيش R2، مفيش Cloudflare Storage.
 *
 *  قواعد الحجم:
 *    • أقصى طول أو عرض: 1400 بكسل
 *    • أقصى حجم: 300 كيلو (وبننزل بالجودة لو احتاج)
 *    • الصور الصغيرة أصلاً مابنلمسهاش — مفيش فقدان جودة بدون سبب
 * ═══════════════════════════════════════════════════════════════════════════ */

const MEDIA = {
  MAX_SIDE: 1400,
  JPG_QUALITY: 0.82,
  TARGET_BYTES: 300 * 1024,
  MAX_VIDEO_BYTES: 25 * 1024 * 1024,

  async compressImage(file) {
    const isJpg = /jpe?g$/i.test(file.type) || /\.jpe?g$/i.test(file.name);

    // صغيرة وعالية الجودة أصلاً → نسيها
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

  /** Blob → base64 (GitHub contents API بياخد base64) */
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
