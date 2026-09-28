(function(){
      const header=document.getElementById('site-header'), floatLogo=document.getElementById('floating-logo');
      let lastY=window.scrollY;
      window.addEventListener('scroll',()=>{ const y=window.scrollY; const hiding=y>lastY&&y>80; header.classList.toggle('hidden',hiding); floatLogo.classList.toggle('visible',hiding); lastY=y; },{passive:true});
    })();
    document.querySelector('.menu-toggle').addEventListener('click',()=>{ document.querySelector('.main-nav').classList.toggle('active'); document.body.classList.toggle('menu-open'); });
    document.getElementById('search-input').addEventListener('input',function(){ const q=this.value.trim().toLowerCase(); const cards=document.querySelectorAll('.set-card'); let visible=0; cards.forEach(card=>{ const name=(card.querySelector('.name-on-img')?.textContent||'').toLowerCase(); const match=!q||name.includes(q); card.style.display=match?'':'none'; if(match)visible++; }); document.getElementById('no-results').style.display=(q&&visible===0)?'block':'none'; });
    function parseInfo(text){ let name='',desc='',price='',images=[]; text.split('\n').forEach(line=>{ line=line.replace(/\r/g,'').trim(); const ci=line.indexOf(':'); if(ci===-1)return; const key=line.slice(0,ci).trim().toLowerCase(); const val=line.slice(ci+1).trim(); if(key==='name'||key==='title')name=val; else if(key==='description'||key==='desc')desc=val; else if(key==='price')price=val; else if(key==='images')images=val.split(',').map(i=>i.trim()).filter(Boolean); }); return{name,desc,price,images}; }
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
    const base='assets/images/golds';
    fetch(`${base}/golds.json`).then(r=>r.json()).then(folders=>{
      const container=document.getElementById('golds-grid');
      if(!folders.length){ container.innerHTML=DOMPurify.sanitize('<p class="empty">No golds yet — check back soon.</p>'); return; }
      const promises=folders.map(folder=>fetch(`${base}/${folder}/info.txt`).then(r=>{ if(!r.ok)throw 0; return r.text(); }).then(text=>{ const{name,desc,price,images}=parseInfo(text); return{name,desc,price,images:images.map(img=>`${base}/${folder}/${img}`),folder}; }).catch(()=>null));
      Promise.all(promises).then(items=>{
        const valid=items.filter(Boolean);
        if(!valid.length){ container.innerHTML=DOMPurify.sanitize('<p class="empty">No golds yet — check back soon.</p>'); return; }
        const PAGE=10; let shown=0;
        function getRowType(globalIdx){ let pos=0,toggle=true; while(true){ const size=toggle?3:2; if(globalIdx<pos+size)return size; pos+=size; toggle=!toggle; } }
        function renderNext(){ const batch=valid.slice(shown,shown+PAGE); let batchIdx=0; while(batchIdx<batch.length){ const globalI=shown+batchIdx; const rowType=getRowType(globalI); const count=rowType===3?3:2; const chunk=batch.slice(batchIdx,batchIdx+count); if(!chunk.length)break; const row=document.createElement('div'); row.className=rowType===3?'row-3':'row-2'; chunk.forEach((item,idx)=>{ const globalIdx=globalI+idx; const card=buildCard(item); if((globalIdx+1)%5===0)card.classList.add('mob-full'); row.appendChild(card); }); container.appendChild(row); batchIdx+=chunk.length; } shown+=batch.length; document.getElementById('see-more-wrap').style.display=shown<valid.length?'block':'none'; }
        renderNext();
        document.getElementById('see-more-btn').addEventListener('click',renderNext);
      });
    }).catch(e=>console.error(e));
    function buildCard({name,desc,price,images,folder}){
      const card=document.createElement('div');
      card.className='set-card';

      // dots html
      let dotsHtml='';
      if(images.length>1){
        dotsHtml='<div class="card-dots">';
        images.forEach(function(_,i){ dotsHtml+='<span class="card-dot-pip'+(i===0?' active':'')+'"></span>'; });
        dotsHtml+='</div>';
      }

      // images html
      let imgsHtml='';
      images.forEach(function(s,i){
        imgsHtml+='<img src="'+s+'" class="'+(i===0?'active':'')+'" draggable="false" loading="'+(i===0?'eager':'lazy')+'">';
      });

      const cardImg=document.createElement('div');
      cardImg.className='card-img';
      cardImg.innerHTML=DOMPurify.sanitize(imgsHtml
        +'<div class="card-name-overlay"><div class="name-on-img">'+(name||folder)+'</div></div>'
        +dotsHtml
        +'<button class="card-btn" aria-label="View '+name+'">'
        +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'
        +'<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>'
        +'</svg></button>');
      card.appendChild(cardImg);

      const cardBody=document.createElement('div');
      cardBody.className='card-body';
      cardBody.innerHTML=DOMPurify.sanitize((desc?'<div class="card-desc">'+desc+'</div>':'')+'<div class="price">'+price+'</div>');
      card.appendChild(cardBody);

      let c=0;
      const imgs=card.querySelectorAll('.card-img img');
      const pips=card.querySelectorAll('.card-dot-pip');
      if(imgs.length>1){
        setInterval(function(){
          imgs[c].classList.remove('active');
          if(pips[c]) pips[c].classList.remove('active');
          c=(c+1)%imgs.length;
          imgs[c].classList.add('active');
          if(pips[c]) pips[c].classList.add('active');
        },3500);
      }
      card.addEventListener('click',function(){ openModal({name,desc,price,images}); });
      return card;
    }
