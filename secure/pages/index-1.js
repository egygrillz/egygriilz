(function(){
    'use strict';

    /* ─── Session cache to avoid refetching on nav ─── */
    const CACHE_VER = 'v1';
    const memCache = new Map();

    async function getJSON(url){
      if (memCache.has('json:'+url)) return memCache.get('json:'+url);
      try {
        const ssKey = CACHE_VER + ':json:' + url;
        const ss = sessionStorage.getItem(ssKey);
        if (ss) { const p = JSON.parse(ss); memCache.set('json:'+url, p); return p; }
      } catch(e){}
      const res = await fetch(url, { cache: 'force-cache' });
      const data = await res.json();
      memCache.set('json:'+url, data);
      try { sessionStorage.setItem(CACHE_VER + ':json:' + url, JSON.stringify(data)); } catch(e){}
      return data;
    }

    async function getText(url){
      if (memCache.has('txt:'+url)) return memCache.get('txt:'+url);
      try {
        const ssKey = CACHE_VER + ':txt:' + url;
        const ss = sessionStorage.getItem(ssKey);
        if (ss) { memCache.set('txt:'+url, ss); return ss; }
      } catch(e){}
      const res = await fetch(url, { cache: 'force-cache' });
      const data = await res.text();
      memCache.set('txt:'+url, data);
      try { sessionStorage.setItem(CACHE_VER + ':txt:' + url, data); } catch(e){}
      return data;
    }

    function parseInfo(text){
      const info = { name:'', price:'', desc:'', images:[] };
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const ci = line.indexOf(':');
        if (ci === -1) continue;
        const k = line.slice(0, ci).trim().toLowerCase();
        const v = line.slice(ci+1).trim();
        if (k === 'name' || k === 'title') info.name = v;
        else if (k === 'price') info.price = v;
        else if (k === 'description' || k === 'desc') info.desc = v;
        else if (k === 'images') info.images = v.split(',').map(s=>s.trim()).filter(Boolean);
      }
      return info;
    }

    function buildSkeleton(container, count = 4) {
      let html = '';
      for (let i = 0; i < count; i++) {
        html += '<div class="skel-card"><div class="skel-img skeleton"></div><div class="skel-line short skeleton"></div><div class="skel-line med skeleton"></div><div class="skel-line short skeleton"></div></div>';
      }
      container.innerHTML = html;
    }

    /* ─── Header hide + floating logo ─── */
    const header = document.getElementById('site-header');
    const floatLogo = document.getElementById('floating-logo');
    let lastY = window.scrollY, ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const y = window.scrollY, hiding = y > lastY && y > 80;
          header.classList.toggle('hidden', hiding);
          floatLogo.classList.toggle('visible', hiding);
          lastY = y;
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });

    /* ─── Mobile nav ─── */
    document.querySelector('.menu-toggle').addEventListener('click', () => {
      document.querySelector('.main-nav').classList.toggle('active');
      document.body.classList.toggle('menu-open');
    });

    /* ─── Scroll reveal ─── */
    const revealObs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); revealObs.unobserve(e.target); } });
    }, { threshold: 0.07, rootMargin: '50px' });
    document.querySelectorAll('.reveal').forEach(el => revealObs.observe(el));

    /* ─── Drag scroll ─── */
    function makeDraggable(el){
      let drag=false, startX, sl;
      el.addEventListener('mousedown', e => { drag=true; startX=e.pageX-el.offsetLeft; sl=el.scrollLeft; el.style.userSelect='none'; });
      el.addEventListener('mouseleave', () => drag=false);
      el.addEventListener('mouseup', () => { drag=false; el.style.userSelect=''; });
      el.addEventListener('mousemove', e => { if(!drag)return; e.preventDefault(); el.scrollLeft=sl-(e.pageX-el.offsetLeft-startX); });
    }

    /* ─── Category card slideshow ─── */
    const slideshowIntervals = new WeakMap();
    function makeCardSlideshow(container, paths){
      container.innerHTML = '';
      const frag = document.createDocumentFragment();
      paths.forEach((src, i) => {
        const img = document.createElement('img');
        img.src = src; img.alt = ''; img.draggable = false;
        img.loading = 'lazy'; img.decoding = 'async';
        if (i === 0) { img.classList.add('active'); img.loading = 'eager'; }
        frag.appendChild(img);
      });
      container.appendChild(frag);
      if (paths.length > 1){
        let cur = 0;
        const id = setInterval(() => {
          const imgs = container.querySelectorAll('img');
          imgs[cur].classList.remove('active');
          cur = (cur+1) % imgs.length;
          imgs[cur].classList.add('active');
        }, 4500);
        slideshowIntervals.set(container, id);
      }
    }

    async function loadCategoryCard(cat, slidesId, nameId, descId){
      try {
        const list = await getJSON(`assets/images/${cat}/${cat}.json`);
        if (!list.length) return;
        const txt = await getText(`assets/images/${cat}/${list[0]}/info.txt`);
        const d = parseInfo(txt);
        if (d.name) document.getElementById(nameId).textContent = d.name;
        if (d.desc) document.getElementById(descId).textContent = d.desc;
        const paths = d.images.map(img => `assets/images/${cat}/${list[0]}/${img}`);
        makeCardSlideshow(document.getElementById(slidesId), paths);
      } catch(e){ console.warn(cat, e); }
    }

    async function loadCategoryRow(cat, stripId, href, catLabel){
      const strip = document.getElementById(stripId);
      buildSkeleton(strip, 5);
      try {
        const list = await getJSON(`assets/images/${cat}/${cat}.json`);
        const slice = list.slice(0, 12);
        const infoPromises = slice.map(folder =>
          getText(`assets/images/${cat}/${folder}/info.txt`)
            .then(txt => ({ folder, data: parseInfo(txt) }))
            .catch(() => null)
        );
        const results = await Promise.all(infoPromises);
        const frag = document.createDocumentFragment();
        for (const r of results) {
          if (!r || !r.data.images[0]) continue;
          const { folder, data: d } = r;
          const card = document.createElement('div');
          card.className = 'lv-prod-card';
          card.setAttribute('role','article');
          const imgWrap = document.createElement('div');
          imgWrap.className = 'lv-prod-img';
          d.images.forEach((img, i) => {
            const el = document.createElement('img');
            el.src = `assets/images/${cat}/${folder}/${img}`;
            el.alt = d.name || folder;
            el.draggable = false;
            el.loading = 'lazy';
            el.decoding = 'async';
            if (i === 0) el.classList.add('active');
            imgWrap.appendChild(el);
          });
          card.appendChild(imgWrap);
          const body = document.createElement('div');
          body.className = 'lv-prod-body';
          body.innerHTML = `<div class="lv-prod-label">${catLabel}</div><div class="lv-prod-name">${d.name||folder}</div><div class="lv-prod-price">${d.price||''}</div>`;
          card.appendChild(body);
          if (d.images.length > 1) {
            let c = 0;
            const imgs = imgWrap.querySelectorAll('img');
            setInterval(() => {
              imgs[c].classList.remove('active');
              c = (c+1) % imgs.length;
              imgs[c].classList.add('active');
            }, 3500 + Math.random()*1000);
          }
          card.addEventListener('click', () => window.location = href);
          frag.appendChild(card);
        }
        strip.innerHTML = '';
        strip.appendChild(frag);
        makeDraggable(strip);
      } catch(e){ console.warn(cat, e); strip.innerHTML = ''; }
    }

    async function loadLatestStrip(){
      const strip = document.getElementById('lv-new-strip');
      buildSkeleton(strip, 5);
      try {
        const list = await getJSON('assets/images/latest-designs/designs.json');
        const slice = list.slice(0, 10);
        const results = await Promise.all(slice.map(folder =>
          getText(`assets/images/latest-designs/${folder}/info.txt`)
            .then(txt => ({ folder, data: parseInfo(txt) }))
            .catch(() => null)
        ));
        const frag = document.createDocumentFragment();
        for (const r of results) {
          if (!r) continue;
          const { folder, data: d } = r;
          const src = d.images[0] ? `assets/images/latest-designs/${folder}/${d.images[0]}` : '';
          if (!src) continue;
          const card = document.createElement('div');
          card.className = 'lv-new-card';
          card.innerHTML = `<div class="lv-new-card-img"><img src="${src}" alt="${d.name}" loading="lazy" decoding="async"></div><div class="lv-new-card-label">Latest</div><div class="lv-new-card-name">${d.name}</div><div class="lv-new-card-price">${d.price}</div>`;
          card.addEventListener('click', () => window.location = 'latest-designs.html');
          frag.appendChild(card);
        }
        strip.innerHTML = '';
        strip.appendChild(frag);
        makeDraggable(strip);
      } catch(e){ console.warn('latest', e); strip.innerHTML = ''; }
    }

    async function loadGallery(){
      const scrollEl = document.getElementById('lv-gallery-scroll');
      try {
        const list = await getJSON('assets/images/sets/sets.json');
        const slice = list.slice(0, 10);
        const results = await Promise.all(slice.map(folder =>
          getText(`assets/images/sets/${folder}/info.txt`)
            .then(txt => ({ folder, data: parseInfo(txt) }))
            .catch(() => null)
        ));
        const frag = document.createDocumentFragment();
        for (const r of results) {
          if (!r) continue;
          const { folder, data: d } = r;
          const src = d.images[0] ? `assets/images/sets/${folder}/${d.images[0]}` : '';
          if (!src) continue;
          const card = document.createElement('div');
          card.className = 'lv-gal-card';
          card.innerHTML = `<div class="lv-gal-card-img"><img src="${src}" alt="${d.name}" loading="lazy" decoding="async"></div><div class="lv-gal-card-info"><div class="gc-name">${d.name||''}</div><div class="gc-desc">${d.desc||''}</div><div class="gc-price">${d.price||''}</div></div>`;
          card.addEventListener('click', () => window.location = 'grillz-gallery.html');
          frag.appendChild(card);
        }
        scrollEl.appendChild(frag);
        makeDraggable(scrollEl);
      } catch(e){ console.warn('gallery', e); }
    }

    /* ─── Lazy loader ─── */
    const lazyLoaders = {
      'latest': loadLatestStrip,
      'cat-golds': () => loadCategoryCard('golds','golds-card-slides','golds-card-name','golds-card-desc'),
      'cat-silvers': () => loadCategoryCard('silvers','silvers-card-slides','silvers-card-name','silvers-card-desc'),
      'cat-diamonds': () => loadCategoryCard('diamonds','diamonds-card-slides','diamonds-card-name','diamonds-card-desc'),
      'row-golds': () => loadCategoryRow('golds','golds-row','golds.html','Gold'),
      'row-silvers': () => loadCategoryRow('silvers','silvers-row','silvers.html','Silver'),
      'row-diamonds': () => loadCategoryRow('diamonds','diamonds-row','diamonds.html','Diamond'),
      'gallery': loadGallery
    };
    const loadedKeys = new Set();
    const lazyObs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          const key = e.target.dataset.lazy;
          if (key && !loadedKeys.has(key)) {
            loadedKeys.add(key);
            lazyLoaders[key]?.();
          }
          lazyObs.unobserve(e.target);
        }
      });
    }, { rootMargin: '500px 0px' });
    document.querySelectorAll('[data-lazy]').forEach(el => lazyObs.observe(el));

    /* ─── IG Interactions ─── */
    let liked=false, saved=false, likes=2847;
    const likeBtn = document.getElementById('ig-like-btn');
    const saveBtn = document.getElementById('ig-save-btn');
    const commentBtn = document.getElementById('ig-comment-btn');
    const shareBtn = document.getElementById('ig-share-btn');
    const likesCount = document.getElementById('ig-likes-count');
    const heartAnim = document.getElementById('ig-heart-anim');
    const imgWrap = document.getElementById('ig-post-img-wrap');
    function updateLikes(){ likesCount.textContent = likes.toLocaleString() + ' likes'; }
    function triggerHeart(){ if(!heartAnim)return; heartAnim.classList.remove('pop'); void heartAnim.offsetWidth; heartAnim.classList.add('pop'); }
    likeBtn?.addEventListener('click', function(){
      liked = !liked; this.classList.toggle('liked', liked);
      likes += liked ? 1 : -1; updateLikes(); if (liked) triggerHeart();
    });
    let lastTap = 0;
    imgWrap?.addEventListener('click', function(){
      const now = Date.now();
      if (now - lastTap < 350){ if (!liked){ liked=true; likeBtn.classList.add('liked'); likes++; updateLikes(); } triggerHeart(); }
      lastTap = now;
    });
    saveBtn?.addEventListener('click', function(){ saved=!saved; this.classList.toggle('saved', saved); });
    commentBtn?.addEventListener('click', () => window.open('https://instagram.com/egygrillz','_blank'));
    shareBtn?.addEventListener('click', () => window.open('https://instagram.com/egygrillz','_blank'));
  })();
