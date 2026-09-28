/* ── Header hide + floating logo ── */
    (function(){
      const header   = document.getElementById('site-header');
      const floatLogo = document.getElementById('floating-logo');
      const schedBtn  = document.getElementById('sched-btn');
      let lastY = window.scrollY;
      window.addEventListener('scroll', () => {
        const y = window.scrollY;
        const hiding = y > lastY && y > 80;
        header.classList.toggle('hidden', hiding);
        floatLogo.classList.toggle('visible', hiding);
        schedBtn.classList.toggle('show', y > 200);
        lastY = y;
      }, { passive: true });
    })();

    /* ── Mobile nav ── */
    document.querySelector('.menu-toggle').addEventListener('click', () => {
      document.querySelector('.main-nav').classList.toggle('active');
      document.body.classList.toggle('menu-open');
    });

    /* ── Lightbox ── */
    const lightbox  = document.getElementById('lightbox');
    const lbContent = document.getElementById('lb-content');
    document.getElementById('lb-close').addEventListener('click', closeLB);
    lightbox.addEventListener('click', e => { if(e.target===lightbox) closeLB(); });
    document.addEventListener('keydown', e => { if(e.key==='Escape') closeLB(); });
    function openLB(src, vid) {
      lbContent.innerHTML = DOMPurify.sanitize(vid
        ? `<video src="${src}" autoplay loop muted playsinline></video>`
        : `<img src="${src}" alt="">`);
      lightbox.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
    function closeLB() {
      lightbox.classList.remove('open');
      lbContent.innerHTML = DOMPurify.sanitize('');
      document.body.style.overflow = '';
    }

    /* ── Observers ── */
    const revealObs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if(e.target.classList.contains('spread') && e.isIntersecting) {
          e.target.classList.add('visible');
          revealObs.unobserve(e.target);
        }
        if(e.target.tagName==='VIDEO') {
          e.isIntersecting ? e.target.play().catch(()=>{}) : e.target.pause();
        }
      });
    }, { threshold:0.06, rootMargin:'0px 0px -40px 0px' });

    const lazyObs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if(e.isIntersecting && e.target.dataset.src && !e.target.src) {
          e.target.src = e.target.dataset.src;
          e.target.load();
          lazyObs.unobserve(e.target);
        }
      });
    }, { rootMargin:'400px' });

    function parseInfo(text) {
      const info = { name:'', price:'', desc:'', images:[] };
      text.split('\n').forEach(line => {
        const ci = line.indexOf(':'); if(ci===-1) return;
        const k = line.slice(0,ci).trim().toLowerCase();
        const v = line.slice(ci+1).trim();
        if(k==='name'||k==='title') info.name=v;
        else if(k==='price') info.price=v;
        else if(k==='description'||k==='desc') info.desc=v;
        else if(k==='images') info.images=v.split(',').map(s=>s.trim()).filter(Boolean);
      });
      return info;
    }

    function isVid(f) { return /\.(mp4|mov|webm|avi|m4v)$/i.test(f); }

    function makeMedia(src, alt, click) {
      const box = document.createElement('div');
      box.className = 'media-box';

      if(isVid(src)) {
        const wrap = document.createElement('div');
        wrap.className = 'vid-wrap';

        const v = document.createElement('video');
        v.dataset.src = src;
        v.loop = true; v.muted = true; v.playsInline = true; v.preload = 'none';
        v.setAttribute('playsinline','');
        wrap.appendChild(v);

        const btn = document.createElement('button');
        btn.className = 'mute-btn';
        btn.innerHTML = DOMPurify.sanitize('<i class="fas fa-volume-mute"></i>');
        btn.addEventListener('click', ev => {
          ev.stopPropagation();
          v.muted = !v.muted;
          btn.innerHTML = DOMPurify.sanitize(v.muted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>');
        });
        wrap.appendChild(btn);
        box.appendChild(wrap);

        lazyObs.observe(v);
        revealObs.observe(v);
      } else {
        const img = document.createElement('img');
        img.src = src; img.alt = alt||''; img.loading = 'lazy';
        box.appendChild(img);
      }

      if(click) {
        box.style.cursor = 'pointer';
        box.addEventListener('click', () => openLB(src, isVid(src)));
      }
      return box;
    }

    function buildA(d, folder) {
      const row = document.createElement('div');
      row.className = 'la';
      const hero = makeMedia(`assets/images/latest-designs/${folder}/${d.images[0]}`, d.name, true);
      hero.classList.add('la-hero');
      row.appendChild(hero);
      const right = document.createElement('div');
      right.className = 'la-right';
      const txt = document.createElement('div');
      txt.innerHTML = DOMPurify.sanitize(`
        <div class="spread-kicker">New Arrival</div>
        <div class="spread-title">${d.name}</div>
        ${d.price?`<div class="spread-price">${d.price}</div>`:''}
        ${d.desc?`<div class="spread-desc">${d.desc}</div>`:''}`);
      right.appendChild(txt);
      if(d.images.length > 1) {
        const g = document.createElement('div');
        g.className = 'la-grid';
        d.images.slice(1,7).forEach(f => {
          g.appendChild(makeMedia(`assets/images/latest-designs/${folder}/${f}`, d.name, true));
        });
        right.appendChild(g);
      }
      row.appendChild(right);
      return row;
    }

    function buildB(d, folder) {
      const outer = document.createElement('div');
      outer.className = 'lb-outer';
      const bg = document.createElement('div');
      bg.className = 'lb-bg';
      const heroSrc = `assets/images/latest-designs/${folder}/${d.images[0]}`;
      if(isVid(heroSrc)) {
        const wrap = document.createElement('div');
        wrap.className = 'vid-wrap';
        const v = document.createElement('video');
        v.dataset.src = heroSrc; v.loop=true; v.muted=true; v.playsInline=true; v.preload='none';
        v.setAttribute('playsinline','');
        v.style.opacity = '0.62';
        wrap.appendChild(v);
        bg.appendChild(wrap);
        lazyObs.observe(v); revealObs.observe(v);
      } else {
        const img = document.createElement('img');
        img.src = heroSrc; img.alt = d.name; img.loading = 'eager';
        bg.appendChild(img);
      }
      outer.appendChild(bg);
      const content = document.createElement('div');
      content.className = 'lb-content';
      const words = d.name.split(' ');
      const h = Math.ceil(words.length/2);
      const l1 = words.slice(0,h).join(' ');
      const l2 = words.slice(h).join(' ');
      content.innerHTML = DOMPurify.sanitize(`
        <div class="lb-kicker">EGYGRILLZ &nbsp;·&nbsp; Exclusive Drop</div>
        <div class="lb-title">${l1}${l2?`<br><em>${l2}</em>`:''}</div>
        <div class="lb-row">
          ${d.desc?`<div class="lb-desc">${d.desc}</div>`:'<div></div>'}
          ${d.price?`<div class="lb-price">${d.price}</div>`:''}
        </div>`);
      if(d.images.length > 1) {
        const strip = document.createElement('div');
        strip.className = 'lb-strip';
        d.images.slice(1,6).forEach(f => {
          strip.appendChild(makeMedia(`assets/images/latest-designs/${folder}/${f}`, d.name, true));
        });
        content.appendChild(strip);
      }
      outer.appendChild(content);
      return outer;
    }

    function buildC(d, folder) {
      const row = document.createElement('div');
      row.className = 'lc';
      const left = document.createElement('div');
      left.className = 'lc-left';
      left.innerHTML = DOMPurify.sanitize(`
        <div class="spread-kicker">Latest Design</div>
        <div class="spread-title" style="font-size:clamp(32px,4vw,62px);">${d.name}</div>
        ${d.price?`<div class="spread-price">${d.price}</div>`:''}
        ${d.desc?`<div class="spread-desc">${d.desc}</div>`:''}`);
      row.appendChild(left);
      const right = document.createElement('div');
      right.className = 'lc-right';
      d.images.slice(0,3).forEach(f => {
        right.appendChild(makeMedia(`assets/images/latest-designs/${folder}/${f}`, d.name, true));
      });
      row.appendChild(right);
      return row;
    }

    function buildD(d, folder) {
      const wrap = document.createElement('div');
      wrap.className = 'ld';
      const hdr = document.createElement('div');
      hdr.className = 'ld-header';
      const tc = document.createElement('div');
      tc.innerHTML = DOMPurify.sanitize(`
        <div class="spread-kicker">Curated Piece</div>
        <div class="spread-title" style="font-size:clamp(30px,4vw,58px);">${d.name}</div>
        ${d.price?`<div class="spread-price">${d.price}</div>`:''}`);
      hdr.appendChild(tc);
      const rule = document.createElement('div');
      rule.className = 'ld-rule';
      hdr.appendChild(rule);
      const dc = document.createElement('div');
      dc.style.display = 'flex'; dc.style.flexDirection = 'column'; dc.style.justifyContent = 'flex-end';
      if(d.desc) dc.innerHTML = DOMPurify.sanitize(`<div class="spread-desc">${d.desc}</div>`);
      hdr.appendChild(dc);
      wrap.appendChild(hdr);
      const grid = document.createElement('div');
      grid.className = 'ld-grid';
      d.images.slice(0,6).forEach(f => {
        grid.appendChild(makeMedia(`assets/images/latest-designs/${folder}/${f}`, d.name, true));
      });
      wrap.appendChild(grid);
      return wrap;
    }

    /* ── MAIN ── */
    const container = document.getElementById('designs-container');
    const loadEl    = document.getElementById('loading-state');
    const errEl     = document.getElementById('error-state');
    const layouts   = [buildA, buildB, buildC, buildD];

    fetch('assets/images/latest-designs/designs.json')
      .then(r => r.json())
      .then(async names => {
        if(!Array.isArray(names)||!names.length) throw new Error('empty');
        loadEl.style.display = 'none';
        container.style.display = 'block';
        for(let i=0; i<names.length; i++) {
          const folder = names[i];
          try {
            const txt = await fetch(`assets/images/latest-designs/${folder}/info.txt`).then(r=>r.text());
            const d = parseInfo(txt);
            if(!d.images.length) continue;
            if(i > 0) {
              const rule = document.createElement('div');
              rule.className = 'spread-rule';
              container.appendChild(rule);
            }
            const spread = document.createElement('div');
            spread.className = 'spread';
            spread.appendChild(layouts[i % layouts.length](d, folder));
            container.appendChild(spread);
            revealObs.observe(spread);
          } catch(e) { console.warn('Failed:', folder, e); }
        }
      })
      .catch(() => {
        loadEl.style.display = 'none';
        errEl.style.display = 'block';
      });
