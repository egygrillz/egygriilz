/* ── Header ── */
    (function(){
      const header=document.getElementById('site-header'), floatLogo=document.getElementById('floating-logo');
      let lastY=window.scrollY;
      window.addEventListener('scroll',()=>{ const y=window.scrollY; const hiding=y>lastY&&y>80; header.classList.toggle('hidden',hiding); floatLogo.classList.toggle('visible',hiding); lastY=y; },{passive:true});
    })();
    document.querySelector('.menu-toggle').addEventListener('click',()=>{ document.querySelector('.main-nav').classList.toggle('active'); document.body.classList.toggle('menu-open'); });

    /* ── Parse info.txt ── */
    function parseInfo(text){ let name='',desc='',price='',images=[]; text.split('\n').forEach(line=>{ line=line.replace(/\r/g,'').trim(); const ci=line.indexOf(':'); if(ci===-1)return; const key=line.slice(0,ci).trim().toLowerCase(); const val=line.slice(ci+1).trim(); if(key==='name'||key==='title')name=val; else if(key==='description'||key==='desc')desc=val; else if(key==='price')price=val; else if(key==='images')images=val.split(',').map(i=>i.trim()).filter(Boolean); }); return{name,desc,price,images}; }

    /* ── Modal ── */
    const modalBg=document.getElementById('modal-bg'),modalSlides=document.getElementById('modal-slides'),modalDots=document.getElementById('modal-dots'),modalName=document.getElementById('modal-name'),modalDesc=document.getElementById('modal-desc'),modalPrice=document.getElementById('modal-price'),modalCtr=document.getElementById('modal-counter');
    let mCur=0,mTot=0;
    function openModal({name,desc,price,images}){ modalName.textContent=name; modalDesc.textContent=desc; modalPrice.textContent=price; modalSlides.innerHTML=DOMPurify.sanitize(''); modalDots.innerHTML=DOMPurify.sanitize(''); mCur=0; mTot=images.length; images.forEach((src,i)=>{ const s=document.createElement('div'); s.className='modal-slide'+(i===0?' active':''); s.innerHTML=DOMPurify.sanitize('<img src="'+src+'" draggable="false" loading="'+(i===0?'eager':'lazy')+'">');
        modalSlides.appendChild(s); const d=document.createElement('button'); d.className='modal-dot'+(i===0?' active':''); d.addEventListener('click',()=>goTo(i)); modalDots.appendChild(d); }); updateCtr(); modalBg.classList.add('open'); document.body.classList.add('modal-open'); }
    function goTo(idx){ modalSlides.querySelectorAll('.modal-slide')[mCur].classList.remove('active'); modalDots.querySelectorAll('.modal-dot')[mCur].classList.remove('active'); mCur=(idx+mTot)%mTot; modalSlides.querySelectorAll('.modal-slide')[mCur].classList.add('active'); modalDots.querySelectorAll('.modal-dot')[mCur].classList.add('active'); updateCtr(); }
    function updateCtr(){ modalCtr.textContent=mTot>1?`${mCur+1} / ${mTot}`:''; }
    function closeModal(){ modalBg.classList.remove('open'); document.body.classList.remove('modal-open'); }
    document.getElementById('modal-prev').addEventListener('click',()=>goTo(mCur-1));
    document.getElementById('modal-next').addEventListener('click',()=>goTo(mCur+1));
    document.getElementById('modal-close').addEventListener('click',closeModal);
    modalBg.addEventListener('click',e=>{ if(e.target===modalBg)closeModal(); });
    document.addEventListener('keydown',e=>{ if(!modalBg.classList.contains('open'))return; if(e.key==='Escape')closeModal(); if(e.key==='ArrowLeft')goTo(mCur-1); if(e.key==='ArrowRight')goTo(mCur+1); });

    /* ── Build panel ── */
    function buildPanel(item){
      const panel=document.createElement('div');
      panel.className='ed-panel loading';

      const dotsHtml=item.images.length>1
        ? '<div class="ed-dots">'+item.images.map(function(_,i){ return '<span class="ed-dot'+(i===0?' active':'')+'"></span>'; }).join('')+'</div>'
        : '';

      let imgsHtml='';
      item.images.forEach(function(s,i){
        imgsHtml+='<img src="'+s+'" class="'+(i===0?'active':'')+'" draggable="false" loading="'+(i===0?'eager':'lazy')+'">';
      });

      panel.innerHTML=DOMPurify.sanitize(imgsHtml
        +'<div class="ed-panel-info">'
        +'<div class="name">'+item.name+'</div>'
        +'<div class="desc">'+item.desc+'</div>'
        +'<div class="price">'+item.price+'</div>'
        +'</div>'
        +dotsHtml);

      const firstImg=panel.querySelector('img');
      if(firstImg){
        if(firstImg.complete&&firstImg.naturalWidth) panel.classList.remove('loading');
        else firstImg.addEventListener('load',function(){ panel.classList.remove('loading'); },{once:true});
      }

      let c=0;
      const imgs=panel.querySelectorAll('img');
      const dots=panel.querySelectorAll('.ed-dot');
      if(imgs.length>1){
        setInterval(function(){
          imgs[c].classList.remove('active');
          if(dots[c]) dots[c].classList.remove('active');
          c=(c+1)%imgs.length;
          imgs[c].classList.add('active');
          if(dots[c]) dots[c].classList.add('active');
        }, 3500+Math.random()*1000);
      }

      panel.addEventListener('click',function(){ openModal(item); });
      return panel;
    }

    /* ── Layout engine: A(2) → B(2) → C(3) → repeat
       Last row always 100vh. Lone leftover = full-width 100vh.
    ── */
    const PATTERNS=['a','b','c'];
    const SIZES={a:2,b:2,c:3};
    const galleryWrap=document.getElementById('gallery-wrap');
    const PAGE=10;
    let shown=0, allItems=[], patternIdx=0;

    function renderBatch(items){
      const batch=items.slice(shown,shown+PAGE);
      if(!batch.length) return;

      /* remove is-last-row from previously last row */
      const prevLast=galleryWrap.querySelector('.is-last-row');
      if(prevLast) prevLast.classList.remove('is-last-row');

      const newRows=[];
      let bi=0;

      while(bi<batch.length){
        const pat=PATTERNS[patternIdx%PATTERNS.length];
        const size=SIZES[pat];
        const chunk=batch.slice(bi,bi+size);
        if(!chunk.length) break;

        const row=document.createElement('div');

        if(chunk.length===1){
          row.className='ed-row layout-single';
          row.appendChild(buildPanel(chunk[0]));
        } else {
          row.className='ed-row layout-'+pat;
          if(chunk.length<size){
            row.style.gridTemplateColumns=chunk.map(function(){ return '1fr'; }).join(' ');
          }
          chunk.forEach(function(it){ row.appendChild(buildPanel(it)); });
          patternIdx++;
        }

        newRows.push(row);
        bi+=chunk.length;
      }

      newRows.forEach(function(r){ galleryWrap.appendChild(r); });
      if(newRows.length) newRows[newRows.length-1].classList.add('is-last-row');

      shown+=batch.length;
      document.getElementById('see-more-wrap').style.display=shown<items.length?'block':'none';
    }

    /* ── Search ── */
    let searchTimer=null;
    document.getElementById('search-input').addEventListener('input',function(){
      clearTimeout(searchTimer);
      searchTimer=setTimeout(()=>{
        const q=this.value.trim().toLowerCase();
        const noRes=document.getElementById('no-results');
        noRes.style.display='none';
        galleryWrap.innerHTML=DOMPurify.sanitize('');
        shown=0; patternIdx=0;
        const items=q?allItems.filter(item=>item.name.toLowerCase().includes(q)||item.desc.toLowerCase().includes(q)):allItems;
        if(!items.length){ noRes.style.display='block'; document.getElementById('see-more-wrap').style.display='none'; return; }
        renderBatch(items);
        document.getElementById('see-more-btn').onclick=()=>renderBatch(items);
      },200);
    });

    /* ── Load ── */
    const BASE='assets/images/sets';
    fetch(`${BASE}/sets.json`)
      .then(r=>r.json())
      .then(folders=>{
        const promises=folders.map(folder=>fetch(`${BASE}/${folder}/info.txt`).then(r=>{ if(!r.ok)throw 0; return r.text(); }).then(text=>{ const{name,desc,price,images}=parseInfo(text); return{name,desc,price,images:images.map(img=>`${BASE}/${folder}/${img}`),folder}; }).catch(()=>null));
        return Promise.all(promises);
      })
      .then(items=>{
        allItems=items.filter(Boolean);
        if(!allItems.length){ document.getElementById('no-results').style.display='block'; return; }
        renderBatch(allItems);
        document.getElementById('see-more-btn').addEventListener('click',()=>renderBatch(allItems));
      })
      .catch(e=>{ console.error(e); document.getElementById('no-results').style.display='block'; });
