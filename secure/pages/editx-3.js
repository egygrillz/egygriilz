// ──────────────────────────────────────
  // INVENTORY CATEGORIES
  // ──────────────────────────────────────
  var CAT = {
    sets:     {folder:'sets',           json:'assets/images/sets/sets.json',               prefix:'set'},
    golds:    {folder:'golds',          json:'assets/images/golds/golds.json',             prefix:'golds'},
    silvers:  {folder:'silvers',        json:'assets/images/silvers/silvers.json',         prefix:'silvers'},
    diamonds: {folder:'diamonds',       json:'assets/images/diamonds/diamonds.json',       prefix:'diamonds'},
    latest:   {folder:'latest-designs', json:'assets/images/latest-designs/designs.json', prefix:'design'},
  };
  var cache = {};
  function getTags(cat,id){ return JSON.parse(localStorage.getItem('tags_'+cat+'_'+id)||'[]'); }
  function setTags(cat,id,tags){ localStorage.setItem('tags_'+cat+'_'+id,JSON.stringify(tags)); }
  function isVideoFile(name){ return /\.(mp4|mov|webm|ogg|avi)$/i.test(name); }

  function parseInfo(text){
    var info={name:'',price:'',desc:'',images:[]};
    text.split('\n').forEach(function(line){
      var idx=line.indexOf(':');if(idx===-1) return;
      var key=line.slice(0,idx).trim().toLowerCase();var val=line.slice(idx+1).trim();
      if(key==='name'||key==='title') info.name=val;
      else if(key==='price') info.price=val;
      else if(key==='description'||key==='desc') info.desc=val;
      else if(key==='images') info.images=val.split(',').map(function(i){return i.trim();}).filter(i=>/^[a-zA-Z0-9_. -]+\.(?:jpe?g|png|gif|webp|avif|mp4|mov|webm)$/i.test(i));
    });
    return info;
  }

  async function loadAllPanels(){
    for(var cat in CAT){ loadCategory(cat).catch(function(){}); }
  }

  async function loadCategory(cat){
    if(!GH.owner||!GH.repo){renderEmptyInv(cat,'Go to GitHub Setup first.');return;}
    var info=CAT[cat];var folder=info.folder;var json=info.json;
    var raw='https://raw.githubusercontent.com/'+GH.owner+'/'+GH.repo+'/'+GH.branch+'/';
    var list=[];
    try{list=await (await fetch(raw+json+'?t='+Date.now())).json();}catch{}
    list=Array.isArray(list)?list.filter(id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id)):[];
    var items=[];
    for(var id of list){
      try{
        var txt=await (await fetch(raw+'assets/images/'+folder+'/'+id+'/info.txt?t='+Date.now())).text();
        var item=parseInfo(txt);item.id=id;items.push(item);
      } catch{}
    }
    cache[cat]={list:list,items:items,folder:folder};
    renderGrid(cat);
  }

  function renderEmptyInv(cat,msg){
    var el=document.getElementById('grid-'+cat);
    if(el) el.innerHTML='<div class="empty-state"><i class="fas fa-images"></i><p>'+msg+'</p></div>';
    var countEl=document.getElementById('count-'+cat);if(countEl) countEl.textContent='';
  }

  // ── BULK SELECT ──
  var bulkSelected={sets:new Set(),golds:new Set(),silvers:new Set(),diamonds:new Set(),latest:new Set()};
  function toggleBulkSelect(cat,id,checkbox){
    if(checkbox.checked) bulkSelected[cat].add(id);else bulkSelected[cat].delete(id);
    updateBulkBar(cat);
    checkbox.closest('.set-card').classList.toggle('bulk-selected',checkbox.checked);
  }
  function updateBulkBar(cat){
    var count=bulkSelected[cat].size;
    document.getElementById('bulk-'+cat).classList.toggle('visible',count>0);
    document.getElementById('bulk-count-'+cat).textContent=count+' item'+(count!==1?'s':'')+' selected';
  }
  function clearBulk(cat){
    bulkSelected[cat].clear();
    document.querySelectorAll('#grid-'+cat+' .card-checkbox').forEach(function(cb){cb.checked=false;cb.closest('.set-card').classList.remove('bulk-selected');});
    updateBulkBar(cat);
  }
  async function bulkDelete(cat){
    var ids=[...bulkSelected[cat]];if(!ids.length) return;
    if(!confirm('Delete '+ids.length+' item(s)?')) return;
    showToast('Deleting…','');
    try{
      var catInfo=CAT[cat];var json=catInfo.json;
      var newList=(cache[cat]&&cache[cat].list||[]).filter(function(i){return !ids.includes(i);});
      await putFile(json,btoa(JSON.stringify(newList,null,2)),'Bulk remove from '+cat);
      if(cache[cat]){cache[cat].list=newList;cache[cat].items=cache[cat].items.filter(function(i){return !ids.includes(i.id);});}
      bulkSelected[cat].clear();updateBulkBar(cat);renderGrid(cat);
      showToast('✓ '+ids.length+' deleted','success');
    } catch(err){showToast('Error: '+err.message,'error');}
  }

  // ── CATEGORY REORDER (drag cards) ──
  var catReorderMode = {};
  var catDragSrc = null;

  function toggleCatReorder(cat) {
    catReorderMode[cat] = !catReorderMode[cat];
    var btn = document.getElementById('reorder-btn-'+cat);
    var saveBtn = document.getElementById('reorder-save-'+cat);
    if(catReorderMode[cat]){
      btn.innerHTML = '× Cancel';
      saveBtn.style.display = '';
      enableCatDrag(cat);
    } else {
      btn.innerHTML = '<i class="fas fa-sort"></i> Reorder';
      saveBtn.style.display = 'none';
      disableCatDrag(cat);
    }
  }

  function enableCatDrag(cat){
    var cards = document.querySelectorAll('#grid-'+cat+' .set-card');
    cards.forEach(function(card){
      card.setAttribute('draggable','true');
      card.style.cursor='grab';
      card.style.outline='2px dashed #ccc';
      card.style.outlineOffset='2px';
      card._dragStart = function(e){ catDragSrc=card; e.dataTransfer.effectAllowed='move'; card.style.opacity='0.4'; };
      card._dragOver = function(e){ e.preventDefault(); e.dataTransfer.dropEffect='move'; if(card!==catDragSrc){card.style.outline='2px solid #000';card.style.outlineOffset='2px';} };
      card._dragLeave = function(){ if(catReorderMode[cat]) card.style.outline='2px dashed #ccc'; };
      card._drop = function(e){
        e.stopPropagation();
        if(catDragSrc&&catDragSrc!==card){
          var grid=document.getElementById('grid-'+cat);
          var items=Array.from(grid.querySelectorAll('.set-card'));
          var srcIdx=items.indexOf(catDragSrc),tgtIdx=items.indexOf(card);
          if(tgtIdx>srcIdx) grid.insertBefore(catDragSrc,card.nextSibling);
          else grid.insertBefore(catDragSrc,card);
        }
      };
      card._dragEnd = function(){
        card.style.opacity='';
        document.querySelectorAll('#grid-'+cat+' .set-card').forEach(function(c){if(catReorderMode[cat])c.style.outline='2px dashed #ccc';});
        catDragSrc=null;
      };
      card.addEventListener('dragstart',card._dragStart);
      card.addEventListener('dragover',card._dragOver);
      card.addEventListener('dragleave',card._dragLeave);
      card.addEventListener('drop',card._drop);
      card.addEventListener('dragend',card._dragEnd);
    });
  }

  function disableCatDrag(cat){
    var cards=document.querySelectorAll('#grid-'+cat+' .set-card');
    cards.forEach(function(card){
      card.setAttribute('draggable','false');
      card.style.cursor='';card.style.outline='';card.style.outlineOffset='';
      if(card._dragStart) card.removeEventListener('dragstart',card._dragStart);
      if(card._dragOver) card.removeEventListener('dragover',card._dragOver);
      if(card._dragLeave) card.removeEventListener('dragleave',card._dragLeave);
      if(card._drop) card.removeEventListener('drop',card._drop);
      if(card._dragEnd) card.removeEventListener('dragend',card._dragEnd);
    });
  }

  async function saveCatOrder(cat){
    if(!GH.owner||!GH.repo){showToast('GitHub not set up','error');return;}
    var cards=document.querySelectorAll('#grid-'+cat+' .set-card');
    var newOrder=Array.from(cards).map(function(c){return c.getAttribute('data-id');}).filter(Boolean);
    try{
      var catInfo=CAT[cat];
      await putFile(catInfo.json,btoa(JSON.stringify(newOrder,null,2)),'Reorder '+cat+' items');
      if(cache[cat]){
        cache[cat].list=newOrder;
        cache[cat].items.sort(function(a,b){return newOrder.indexOf(a.id)-newOrder.indexOf(b.id);});
      }
      showToast('✓ Order saved to GitHub!','success');
      toggleCatReorder(cat);
    } catch(e){showToast('Error: '+e.message,'error');}
  }

  // ── FILTER + RENDER GRID ──
  function filterGrid(cat,query,sort){
    var data=cache[cat]||{};var items=data.items||[];
    var filtered=items.filter(function(item){var q=(query||'').toLowerCase();if(!q) return true;return (item.name||'').toLowerCase().includes(q)||(item.desc||'').toLowerCase().includes(q);});
    if(sort==='tag-featured') filtered=filtered.filter(function(i){return getTags(cat,i.id).includes('featured');});
    if(sort==='tag-sold') filtered=filtered.filter(function(i){return getTags(cat,i.id).includes('sold');});
    if(sort==='name') filtered=[...filtered].sort(function(a,b){return (a.name||'').localeCompare(b.name||'');});
    if(sort==='newest') filtered=[...filtered].reverse();
    renderGridItems(cat,filtered);
  }

  function renderGrid(cat){
    var data=cache[cat]||{};var items=data.items||[];
    var el=document.getElementById('count-'+cat);
    if(el) el.textContent=items.length?items.length+' item'+(items.length!==1?'s':''):'';
    renderGridItems(cat,items);
  }

  function renderGridItems(cat,items){
    var grid=document.getElementById('grid-'+cat);
    var catInfo=cache[cat]||CAT[cat];var folder=catInfo.folder||cat;
    var raw='https://raw.githubusercontent.com/'+GH.owner+'/'+GH.repo+'/'+GH.branch+'/';
    if(!items.length){renderEmptyInv(cat,'No items found.');return;}
    var TAGS_MAP={new:{label:'New',cls:'tag-new'},featured:{label:'⭐ Featured',cls:'tag-featured'},sold:{label:'Sold',cls:'tag-sold'},sale:{label:'Sale',cls:'tag-sale'}};
    grid.innerHTML=items.map(function(item){
      var tags=getTags(cat,item.id);
      var tagHtml=tags.length?'<div class="tag-row">'+tags.map(function(t){return '<span class="tag '+(TAGS_MAP[t]&&TAGS_MAP[t].cls||'')+'">'+( TAGS_MAP[t]&&TAGS_MAP[t].label||escHtml(t))+'</span>';}).join('')+'</div>':'';
      var mediaHtml=item.images.map(function(file,i){
        if(isVideoFile(file)) return '<video src="'+raw+'assets/images/'+folder+'/'+item.id+'/'+file+'" class="'+(i===0?'active':'')+'" muted playsinline loop></video>';
        return '<img src="'+raw+'assets/images/'+folder+'/'+item.id+'/'+file+'" class="'+(i===0?'active':'')+'" alt="" loading="lazy">';
      }).join('');
      var hasVideo=item.images.some(function(f){return isVideoFile(f);});
      var isChecked=bulkSelected[cat]&&bulkSelected[cat].has(item.id);
      return '<div class="set-card '+(isChecked?'bulk-selected':'')+'" data-id="'+item.id+'" data-cat="'+cat+'">'+
        '<input type="checkbox" class="card-checkbox" '+(isChecked?'checked':'')+' onchange="toggleBulkSelect(\''+cat+'\',\''+item.id+'\',this)">'+
        '<div class="mini-slider">'+(mediaHtml||'<div class="no-img"><i class="fas fa-camera"></i></div>')+(hasVideo?'<span class="video-badge">▶ Video</span>':'')+'</div>'+
        '<div class="set-info">'+
          '<div class="editable-field name" data-field="name" data-id="'+item.id+'" data-cat="'+cat+'" onclick="startInlineEdit(this)">'+
            '<div class="field-val name">'+escHtml(item.name||'(Unnamed)')+'</div>'+
            '<input type="text" value="'+escAttr(item.name||'')+'" placeholder="Item name">'+
            '<span class="edit-hint">✏ click to edit name</span>'+
          '</div>'+
          '<div class="editable-field desc" data-field="desc" data-id="'+item.id+'" data-cat="'+cat+'" onclick="startInlineEdit(this)">'+
            '<div class="field-val desc">'+escHtml(item.desc||'')+'</div>'+
            '<textarea placeholder="Description…">'+escHtml(item.desc||'')+'</textarea>'+
            '<span class="edit-hint">✏ click to edit description</span>'+
          '</div>'+
          tagHtml+
          '<div class="editable-field price" data-field="price" data-id="'+item.id+'" data-cat="'+cat+'" onclick="startInlineEdit(this)">'+
            '<div class="field-val price">'+escHtml(item.price||'')+'</div>'+
            '<input type="text" value="'+escAttr(item.price||'')+'" placeholder="Price">'+
            '<span class="edit-hint">✏ click to edit price</span>'+
          '</div>'+
          '<div class="inline-save-row" id="isave-'+cat+'-'+item.id+'">'+
            '<button class="btn-isave" onclick="saveInlineEdit(\''+cat+'\',\''+item.id+'\')">Save to Site</button>'+
            '<button class="btn-icancel" onclick="cancelInlineEdit(\''+cat+'\',\''+item.id+'\')">Cancel</button>'+
          '</div>'+
          '<div class="card-actions">'+
            '<button class="btn-sm-card btn-reorder" onclick="openDrawer(\''+cat+'\',\''+item.id+'\')">⠿ Photos</button>'+
            '<button class="btn-sm-card btn-edit" onclick="editItem(\''+cat+'\',\''+item.id+'\')">Edit</button>'+
            '<button class="btn-sm-card btn-delete" onclick="confirmDelete(\''+cat+'\',\''+item.id+'\')">Delete</button>'+
          '</div>'+
        '</div>'+
      '</div>';
    }).join('');
    // Auto-slide mini sliders
    grid.querySelectorAll('.mini-slider').forEach(function(ms){
      var media=ms.querySelectorAll('img,video');
      if(media.length>1){
        var cur=0;
        setInterval(function(){
          media[cur].classList.remove('active');
          if(media[cur].tagName==='VIDEO') media[cur].pause();
          cur=(cur+1)%media.length;
          media[cur].classList.add('active');
          if(media[cur].tagName==='VIDEO') media[cur].play().catch(function(){});
        },3500);
      } else if(media.length===1&&media[0].tagName==='VIDEO'){ media[0].play().catch(function(){}); }
    });
  }

  // ── INLINE EDIT ──
  function startInlineEdit(fieldEl){
    if(fieldEl.querySelector('input.editing,textarea.editing')) return;
    var cat=fieldEl.dataset.cat;var id=fieldEl.dataset.id;
    var card=fieldEl.closest('.set-card');
    card.querySelectorAll('.editable-field').forEach(function(f){if(f!==fieldEl) cancelInlineField(f);});
    var val=fieldEl.querySelector('.field-val');var inp=fieldEl.querySelector('input,textarea');
    val.classList.add('editing');inp.classList.add('editing');inp.focus();
    if(inp.tagName==='TEXTAREA'){inp.style.minHeight='80px';inp.style.fontSize='13px';}
    document.getElementById('isave-'+cat+'-'+id).classList.add('visible');
    inp.addEventListener('keydown',function handler(e){if(e.key==='Escape'){cancelInlineEdit(cat,id);inp.removeEventListener('keydown',handler);}});
  }
  function cancelInlineField(fieldEl){
    var val=fieldEl.querySelector('.field-val');var inp=fieldEl.querySelector('input,textarea');
    if(!inp) return;
    val.classList.remove('editing');inp.classList.remove('editing');
    var item=cache[fieldEl.dataset.cat]&&cache[fieldEl.dataset.cat].items.find(function(i){return i.id===fieldEl.dataset.id;});
    if(item){if(inp.tagName==='TEXTAREA') inp.value=item.desc||'';else inp.value=item[fieldEl.dataset.field]||'';}
  }
  function cancelInlineEdit(cat,id){
    var card=document.querySelector('.set-card[data-id="'+id+'"][data-cat="'+cat+'"]');
    if(!card) return;
    card.querySelectorAll('.editable-field').forEach(function(f){cancelInlineField(f);});
    document.getElementById('isave-'+cat+'-'+id).classList.remove('visible');
  }
  async function saveInlineEdit(cat,id){
    var card=document.querySelector('.set-card[data-id="'+id+'"][data-cat="'+cat+'"]');
    if(!card) return;
    var nameVal=card.querySelector('.editable-field.name input');nameVal=nameVal?nameVal.value.trim():'';
    var descVal=card.querySelector('.editable-field.desc textarea');descVal=descVal?descVal.value.trim():'';
    var priceVal=card.querySelector('.editable-field.price input');priceVal=priceVal?priceVal.value.trim():'';
    if(!nameVal){showToast('Name cannot be empty','error');return;}
    var btn=card.querySelector('.btn-isave');btn.textContent='Saving…';btn.disabled=true;
    showToast('Saving…','');
    try{
      var folder=CAT[cat].folder;
      var item=cache[cat]&&cache[cat].items.find(function(i){return i.id===id;});
      var images=item&&item.images||[];
      var infoStr='name: '+nameVal+'\nprice: '+priceVal+'\ndescription: '+descVal+'\nimages: '+images.join(',');
      await putFile('assets/images/'+folder+'/'+id+'/info.txt',btoa(unescape(encodeURIComponent(infoStr))),'Update '+id+' text');
      if(item){item.name=nameVal;item.desc=descVal;item.price=priceVal;}
      card.querySelector('.editable-field.name .field-val').textContent=nameVal;
      card.querySelector('.editable-field.desc .field-val').textContent=descVal;
      card.querySelector('.editable-field.price .field-val').textContent=priceVal;
      cancelInlineEdit(cat,id);
      showToast('✓ Saved!','success');
    } catch(err){
      showToast('Error: '+err.message,'error');
      btn.textContent='Save to Site';btn.disabled=false;
    }
  }

  // ── PHOTO REORDER DRAWER ──
  var drawerCat='',drawerId='',drawerImages=[],drawerDragIdx=null;
  function openDrawer(cat,id){
    var item=cache[cat]&&cache[cat].items.find(function(i){return i.id===id;});
    if(!item){showToast('Could not load item','error');return;}
    drawerCat=cat;drawerId=id;drawerImages=[...item.images];
    document.getElementById('drawer-item-name').textContent=item.name||id;
    renderDrawerGrid();
    document.getElementById('drawer-overlay').classList.add('open');
    document.getElementById('reorder-drawer').classList.add('open');
    document.body.style.overflow='hidden';
  }
  function closeDrawer(){
    document.getElementById('drawer-overlay').classList.remove('open');
    document.getElementById('reorder-drawer').classList.remove('open');
    document.body.style.overflow='';
    drawerCat='';drawerId='';drawerImages=[];drawerDragIdx=null;
  }
  function renderDrawerGrid(){
    var grid=document.getElementById('reorder-grid');
    var raw='https://raw.githubusercontent.com/'+GH.owner+'/'+GH.repo+'/'+GH.branch+'/';
    var folder=CAT[drawerCat]&&CAT[drawerCat].folder||drawerCat;
    var html=drawerImages.map(function(file,i){
      var src=raw+'assets/images/'+folder+'/'+drawerId+'/'+file+'?t='+Date.now();
      var isVid=isVideoFile(file);
      var media=isVid?'<video src="'+src+'" muted playsinline></video>':'<img src="'+src+'" alt="">';
      return '<div class="reorder-item" draggable="true" data-idx="'+i+'" ondragstart="drawerDragStart('+i+')" ondragover="drawerDragOver(event,this,'+i+')" ondragleave="this.classList.remove(\'drag-over\')" ondrop="drawerDrop(event,'+i+')" ondragend="drawerDragEnd()">'+
        media+'<span class="reorder-num">'+(i+1)+'</span>'+(i===0?'<span class="reorder-cover">Cover</span>':'')+
        '<button class="reorder-del" onclick="drawerDeleteImg('+i+')">×</button></div>';
    }).join('');
    html+='<div class="reorder-add" onclick="document.getElementById(\'drawer-file-input\').click()"><i class="fas fa-plus"></i><span>Add Photo</span></div>';
    grid.innerHTML=html;
  }
  function drawerDragStart(idx){drawerDragIdx=idx;}
  function drawerDragEnd(){document.querySelectorAll('.reorder-item').forEach(function(el){el.classList.remove('drag-active','drag-over');});}
  function drawerDragOver(e,el,idx){e.preventDefault();document.querySelectorAll('.reorder-item').forEach(function(x){x.classList.remove('drag-active','drag-over');});if(drawerDragIdx!==null&&drawerDragIdx!==idx) el.classList.add('drag-over');}
  function drawerDrop(e,toIdx){e.preventDefault();if(drawerDragIdx===null||drawerDragIdx===toIdx) return;var moved=drawerImages.splice(drawerDragIdx,1)[0];drawerImages.splice(toIdx,0,moved);drawerDragIdx=null;renderDrawerGrid();}
  function drawerDeleteImg(idx){if(drawerImages.length<=1){showToast('Cannot remove the only image','error');return;}drawerImages.splice(idx,1);renderDrawerGrid();}
  function drawerAddFiles(files){
    showToast('Uploading…','');
    var btn=document.getElementById('drawer-save-btn');btn.disabled=true;btn.textContent='Uploading…';
    var folder=CAT[drawerCat]&&CAT[drawerCat].folder||drawerCat;
    var basePath='assets/images/'+folder+'/'+drawerId;
    var existing=drawerImages.map(function(n){return parseInt(n.replace(/\D/g,''),10);}).filter(function(n){return !isNaN(n);});
    var counter=existing.length>0?Math.max.apply(null,existing)+1:drawerImages.length;
    var fileArr=Array.from(files);var done=0;
    fileArr.forEach(function(file){
      var isImg=file.type.startsWith('image/');var isVid=file.type.startsWith('video/');
      if(!isImg&&!isVid){done++;if(done===fileArr.length) finalizeDrawerUpload(btn);return;}
      var r=new FileReader();
      r.onload=async function(ev){
        var ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
        var fname=String(counter).padStart(6,'0')+'.'+ext;counter++;
        try{await putFile(basePath+'/'+fname,ev.target.result.split(',')[1],'Add '+fname+' to '+drawerId);drawerImages.push(fname);}
        catch(err){showToast('Upload error: '+err.message,'error');}
        done++;if(done===fileArr.length) finalizeDrawerUpload(btn);
      };
      r.readAsDataURL(file);
    });
  }
  function finalizeDrawerUpload(btn){renderDrawerGrid();btn.disabled=false;btn.textContent='Save Order';showToast('✓ Photos added','success');}
  async function saveDrawerOrder(){
    if(!drawerCat||!drawerId) return;
    var btn=document.getElementById('drawer-save-btn');btn.disabled=true;btn.textContent='Saving…';
    showToast('Saving order…','');
    try{
      var folder=CAT[drawerCat]&&CAT[drawerCat].folder||drawerCat;
      var item=cache[drawerCat]&&cache[drawerCat].items.find(function(i){return i.id===drawerId;});
      var infoStr='name: '+(item&&item.name||'')+'\nprice: '+(item&&item.price||'')+'\ndescription: '+(item&&item.desc||'')+'\nimages: '+drawerImages.join(',');
      await putFile('assets/images/'+folder+'/'+drawerId+'/info.txt',btoa(unescape(encodeURIComponent(infoStr))),'Reorder images for '+drawerId);
      if(item) item.images=[...drawerImages];
      var card=document.querySelector('.set-card[data-id="'+drawerId+'"][data-cat="'+drawerCat+'"]');
      if(card){
        var raw2='https://raw.githubusercontent.com/'+GH.owner+'/'+GH.repo+'/'+GH.branch+'/';
        var slider=card.querySelector('.mini-slider');
        slider.innerHTML=drawerImages.map(function(file,i){
          if(isVideoFile(file)) return '<video src="'+raw2+'assets/images/'+folder+'/'+drawerId+'/'+file+'?t='+Date.now()+'" class="'+(i===0?'active':'')+'" muted playsinline loop></video>';
          return '<img src="'+raw2+'assets/images/'+folder+'/'+drawerId+'/'+file+'?t='+Date.now()+'" class="'+(i===0?'active':'')+'" alt="" loading="lazy">';
        }).join('');
      }
      showToast('✓ Order saved!','success');closeDrawer();
    } catch(err){showToast('Error: '+err.message,'error');btn.disabled=false;btn.textContent='Save Order';}
  }

  // ── TAGS ──
  function toggleTag(btn){btn.classList.toggle('active');}
  function getActiveTags(){return [...document.querySelectorAll('.tag-toggle.active')].map(function(b){return b.dataset.tag;});}
  function setActiveTagsFromList(tags){document.querySelectorAll('.tag-toggle').forEach(function(b){b.classList.toggle('active',tags.includes(b.dataset.tag));});}

  // ── ITEM MODAL (Add / Edit) ──
  var pendingImages=[],existingImages=[],currentMode='add',currentEditId='',currentEditCat='';
  function resetModal(){
    pendingImages=[];existingImages=[];currentEditId='';currentEditCat='';
    ['edit-id','edit-category','f-name','f-price','f-desc'].forEach(function(id){document.getElementById(id).value='';});
    document.getElementById('file-input').value='';
    document.getElementById('image-previews').innerHTML='';
    document.getElementById('publish-btn').disabled=false;
    document.querySelectorAll('.tag-toggle').forEach(function(b){b.classList.remove('active');});
  }
  function setUploadHint(cat){
    if(cat==='latest'){
      document.getElementById('media-label').textContent='Images & Videos — first file is the cover';
      document.getElementById('upload-icon').className='fas fa-photo-video';
      document.getElementById('upload-hint').innerHTML='<strong>Click or drag images or videos here</strong><br>JPG, PNG, WEBP, MP4, MOV';
      document.getElementById('file-input').accept='image/*,video/*';
    } else {
      document.getElementById('media-label').textContent='Images — first image is the cover';
      document.getElementById('upload-icon').className='fas fa-camera';
      document.getElementById('upload-hint').innerHTML='<strong>Click or drag images here</strong><br>JPG, PNG, WEBP';
      document.getElementById('file-input').accept='image/*';
    }
  }
  function openModal(cat){
    currentMode='add';resetModal();currentEditCat=cat;
    document.getElementById('edit-category').value=cat;
    document.getElementById('modal-title').textContent='Add '+cap(cat);
    document.getElementById('publish-btn').textContent='Publish to Site';
    setUploadHint(cat);
    document.getElementById('modal-overlay').classList.add('open');
  }
  function editItem(cat,id){
    var item=cache[cat]&&cache[cat].items.find(function(i){return i.id===id;});
    if(!item){showToast('Could not load item','error');return;}
    currentMode='edit';currentEditId=id;currentEditCat=cat;
    pendingImages=[];existingImages=[...item.images];
    document.getElementById('edit-id').value=id;
    document.getElementById('edit-category').value=cat;
    document.getElementById('f-name').value=item.name||'';
    document.getElementById('f-price').value=item.price||'';
    document.getElementById('f-desc').value=item.desc||'';
    document.getElementById('file-input').value='';
    document.getElementById('modal-title').textContent='Edit — '+(item.name||id);
    document.getElementById('publish-btn').textContent='Save Changes';
    document.getElementById('publish-btn').disabled=false;
    setActiveTagsFromList(getTags(cat,id));
    setUploadHint(cat);renderPreviews();
    document.getElementById('modal-overlay').classList.add('open');
  }

  // Drag preview
  var dragSrcIdx=null,dragSrcType=null;
  function onDragStart(e,idx,type){dragSrcIdx=idx;dragSrcType=type;e.dataTransfer.effectAllowed='move';}
  function onDragOver(e,wrap){e.preventDefault();wrap.classList.add('drag-over');}
  function onDragLeave(wrap){wrap.classList.remove('drag-over');}
  function onDrop(e,idx,type){
    e.preventDefault();
    document.querySelectorAll('.img-preview-wrap').forEach(function(w){w.classList.remove('drag-over');});
    if(dragSrcIdx===null||dragSrcIdx===idx) return;
    if(dragSrcType==='existing'&&type==='existing'){var m=existingImages.splice(dragSrcIdx,1)[0];existingImages.splice(idx,0,m);}
    else if(dragSrcType==='pending'&&type==='pending'){var m2=pendingImages.splice(dragSrcIdx,1)[0];pendingImages.splice(idx,0,m2);}
    dragSrcIdx=null;renderPreviews();
  }
  function renderPreviews(){
    var cat=document.getElementById('edit-category').value;
    var id=document.getElementById('edit-id').value;
    var html='';
    if(id&&cat){
      var catInfo=CAT[cat];var folder=catInfo&&catInfo.folder||cat;
      var raw='https://raw.githubusercontent.com/'+GH.owner+'/'+GH.repo+'/'+GH.branch+'/';
      existingImages.forEach(function(img,i){
        var isVid=isVideoFile(img);
        html+='<div class="img-preview-wrap" draggable="true" ondragstart="onDragStart(event,'+i+',\'existing\')" ondragover="onDragOver(event,this)" ondragleave="onDragLeave(this)" ondrop="onDrop(event,'+i+',\'existing\')">'+
          (isVid?'<video src="'+raw+'assets/images/'+folder+'/'+id+'/'+img+'?t='+Date.now()+'" muted playsinline></video><span class="media-type-badge">▶ Video</span>':'<img src="'+raw+'assets/images/'+folder+'/'+id+'/'+img+'?t='+Date.now()+'" alt="">')+
          '<button class="remove-img" onclick="removeExisting('+i+')">×</button><span class="img-order">#'+(i+1)+'</span></div>';
      });
    }
    pendingImages.forEach(function(p,i){
      var isVid=p.file.type.startsWith('video/');
      html+='<div class="img-preview-wrap" draggable="true" ondragstart="onDragStart(event,'+i+',\'pending\')" ondragover="onDragOver(event,this)" ondragleave="onDragLeave(this)" ondrop="onDrop(event,'+i+',\'pending\')">'+
        (isVid?'<video src="'+p.dataUrl+'" muted playsinline></video><span class="media-type-badge">▶ Video</span>':'<img src="'+p.dataUrl+'" alt="">')+
        '<button class="remove-img" onclick="removePending('+i+')">×</button><span class="img-order">New '+(i+1)+'</span></div>';
    });
    document.getElementById('image-previews').innerHTML=html;
  }
  function removeExisting(i){existingImages.splice(i,1);renderPreviews();}
  function removePending(i){pendingImages.splice(i,1);renderPreviews();}
  function closeModal(){document.getElementById('modal-overlay').classList.remove('open');resetModal();}
  function closeModalOnBg(e){if(e.target===document.getElementById('modal-overlay')) closeModal();}
  function handleFiles(files){
    Array.from(files).forEach(function(file){
      if(!file.type.startsWith('image/')&&!file.type.startsWith('video/')) return;
      var r=new FileReader();
      r.onload=function(e){pendingImages.push({file:file,dataUrl:e.target.result});renderPreviews();};
      r.readAsDataURL(file);
    });
  }
  function handleDrop(e){e.preventDefault();document.getElementById('upload-zone').classList.remove('drag');handleFiles(e.dataTransfer.files);}

  async function publishItem(){
    if(!GH.token||!GH.owner||!GH.repo){alert('GitHub Setup incomplete!');return;}
    var cat=document.getElementById('edit-category').value;
    var name=document.getElementById('f-name').value.trim();
    var price=document.getElementById('f-price').value.trim();
    var desc=document.getElementById('f-desc').value.trim();
    var editId=document.getElementById('edit-id').value.trim();
    if(!name){showToast('Please enter a name.','error');return;}
    if(!editId&&existingImages.length===0&&pendingImages.length===0){showToast('Please add at least one image.','error');return;}
    var btn=document.getElementById('publish-btn');btn.disabled=true;btn.textContent='Publishing…';showToast('Publishing…','');
    try{
      var catInfo=CAT[cat];var folder=catInfo.folder;var json=catInfo.json;var prefix=catInfo.prefix;
      var itemId=editId;
      if(!itemId){
        var list=cache[cat]&&cache[cat].list||[];var num=list.length+1;
        while(list.includes(prefix+num)) num++;
        itemId=prefix+num;
      }
      var basePath='assets/images/'+folder+'/'+itemId;
      var allExistingNums=existingImages.map(function(n){return parseInt(n.replace(/\D/g,''),10);}).filter(function(n){return !isNaN(n);});
      var imgCounter=allExistingNums.length>0?Math.max.apply(null,allExistingNums)+1:0;
      var newNames=[];
      for(var i=0;i<pendingImages.length;i++){
        var img=pendingImages[i];
        var ext=(img.file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
        var fname=String(imgCounter).padStart(6,'0')+'.'+ext;
        await putFile(basePath+'/'+fname,img.dataUrl.split(',')[1],'Upload '+fname+' for '+itemId);
        newNames.push(fname);imgCounter++;
        btn.textContent='Uploading '+(i+1)+' / '+pendingImages.length+'…';
      }
      var allImages=[...existingImages,...newNames];
      var infoStr='name: '+name+'\nprice: '+price+'\ndescription: '+desc+'\nimages: '+allImages.join(',');
      await putFile(basePath+'/info.txt',btoa(unescape(encodeURIComponent(infoStr))),(currentMode==='edit'?'Update':'Add')+' '+itemId);
      var currentList=cache[cat]&&cache[cat].list||[];
      var newList=currentList.includes(itemId)?currentList:[...currentList,itemId];
      await putFile(json,btoa(JSON.stringify(newList,null,2)),'Update '+cat+' index');
      setTags(cat,itemId,getActiveTags());
      if(!cache[cat]) cache[cat]={list:newList,items:[],folder:folder};
      cache[cat].list=newList;
      var existingEntry=cache[cat].items.find(function(i){return i.id===itemId;});
      var updatedEntry={id:itemId,name:name,price:price,desc:desc,images:allImages};
      if(existingEntry) Object.assign(existingEntry,updatedEntry);else cache[cat].items.push(updatedEntry);
      renderGrid(cat);
      showToast('✓ '+(currentMode==='edit'?'Changes saved!':'Published!'),'success');
      closeModal();
      setTimeout(function(){loadCategory(cat);},3000);
    } catch(err){
      console.error(err);showToast('Error: '+err.message,'error');
      btn.disabled=false;btn.textContent=currentMode==='edit'?'Save Changes':'Publish to Site';
    }
  }

  // ── DELETE ITEM ──
  var _dCat,_dId;
  function confirmDelete(cat,id){
    _dCat=cat;_dId=id;
    document.getElementById('confirm-msg').textContent='This will remove the item from your live site permanently.';
    document.getElementById('confirm-del-btn').onclick=doDelete;
    document.getElementById('confirm-overlay').classList.add('open');
  }
  async function doDelete(){
    closeConfirm();showToast('Removing…','');
    try{
      var catInfo=CAT[_dCat];var json=catInfo.json;
      var newList=(cache[_dCat]&&cache[_dCat].list||[]).filter(function(i){return i!==_dId;});
      await putFile(json,btoa(JSON.stringify(newList,null,2)),'Remove '+_dId);
      if(cache[_dCat]){cache[_dCat].list=newList;cache[_dCat].items=cache[_dCat].items.filter(function(i){return i.id!==_dId;});renderGrid(_dCat);}
      showToast('✓ Item removed','success');
      setTimeout(function(){loadCategory(_dCat);},2000);
    } catch(err){showToast('Error: '+err.message,'error');}
  }

  // ──────────────────────────────────────
  // BACKUP
  // ──────────────────────────────────────
  function exportBackup(){
    var backup={exported:new Date().toISOString(),categories:{}};
    for(var cat in CAT){
      var data=cache[cat]||{};var items=data.items||[];var list=data.list||[];
      backup.categories[cat]={list:list,items:items.map(function(item){return Object.assign({},item,{tags:getTags(cat,item.id)});})};
    }
    var blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
    var a=document.createElement('a');a.href=URL.createObjectURL(blob);
    a.download='egygrillz-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();
    showToast('✓ Backup downloaded','success');
  }
  var restoreData=null;
  function previewRestore(file){
    if(!file) return;
    var r=new FileReader();
    r.onload=function(e){
      try{
        restoreData=JSON.parse(e.target.result);
        var summary='<strong>Backup from:</strong> '+(restoreData.exported||'unknown')+'<br><br>';
        for(var cat in restoreData.categories||{}) summary+='<strong>'+cap(cat)+':</strong> '+((restoreData.categories[cat].list||[]).length)+' items<br>';
        document.getElementById('restore-preview').innerHTML=summary;
        document.getElementById('restore-preview').style.display='block';
        document.getElementById('restore-btn').style.display='inline-block';
      } catch{showToast('Invalid backup file.','error');}
    };
    r.readAsText(file);
  }
  async function doRestore(){
    if(!restoreData) return;
    if(!GH.token||!GH.owner||!GH.repo){alert('Please set up GitHub first.');return;}
    if(!confirm('This will overwrite your current index files. Continue?')) return;
    var btn=document.getElementById('restore-btn');btn.disabled=true;btn.textContent='Restoring…';showToast('Restoring…','');
    try{
      for(var cat in restoreData.categories||{}){
        var catInfo=CAT[cat];if(!catInfo) continue;
        var data=restoreData.categories[cat];
        await putFile(catInfo.json,btoa(JSON.stringify(data.list||[],null,2)),'Restore '+cat+' from backup');
        (data.items||[]).forEach(function(item){if(item.tags&&item.tags.length) setTags(cat,item.id,item.tags);});
      }
      showToast('✓ Backup restored!','success');loadAllPanels();
    } catch(err){showToast('Error: '+err.message,'error');}
    btn.disabled=false;btn.textContent='⬆ Restore to GitHub';
  }

  // ──────────────────────────────────────
  // PAGES EDITOR
  // ──────────────────────────────────────
  var currentPageFile='',currentEditorMode='fields',currentPageHTML='';
  var PAGE_FIELDS={
    'about.html':[
      {id:'about-h1',label:'Page Heading',selector:'h1',type:'text'},
      {id:'about-p1',label:'First Paragraph',selector:'.story-text p:nth-child(1)',type:'textarea'},
      {id:'about-p2',label:'Second Paragraph',selector:'.story-text p:nth-child(2)',type:'textarea'},
    ],
    'contact.html':[
      {id:'contact-h1',label:'Main Heading',selector:'.contact-info h1',type:'text'},
      {id:'contact-email',label:'Email Address',selector:'.detail-item:nth-child(2) a',type:'text'},
    ],
    'booking.html':[{id:'booking-h1',label:'Main Heading',selector:'h1.page-heading',type:'text'}],
    'terms.html':[{id:'terms-h1',label:'Page Title',selector:'h1',type:'text'}],
  };

  function switchEditorMode(mode){
    currentEditorMode=mode;
    document.getElementById('mode-fields').classList.toggle('active',mode==='fields');
    document.getElementById('mode-code').classList.toggle('active',mode==='code');
    document.getElementById('field-editor-panel').style.display=mode==='fields'?'block':'none';
    document.getElementById('code-editor-panel').style.display=mode==='code'?'block':'none';
    if(mode==='fields') buildFieldEditor();else document.getElementById('page-editor-area').value=currentPageHTML;
  }
  function buildFieldEditor(){
    var container=document.getElementById('fields-container');
    var fields=PAGE_FIELDS[currentPageFile];
    if(!fields||!currentPageHTML){container.innerHTML='<p style="font-size:13px;color:#888;padding:20px;border:1px dashed #ddd;border-radius:4px;text-align:center;">Field editor not available for this page.<br>Use <strong>Full HTML</strong> mode.</p>';return;}
    var parser=new DOMParser();var doc=parser.parseFromString(currentPageHTML,'text/html');
    container.innerHTML=fields.map(function(field){
      var value='';
      try{var el=doc.querySelector(field.selector);value=el?el.innerHTML.trim():'';}catch{}
      var input=field.type==='textarea'?'<textarea class="form-textarea" id="field-'+field.id+'" style="min-height:80px;">'+escHtml(value)+'</textarea>':'<input type="text" class="form-input" id="field-'+field.id+'" value="'+escAttr(value)+'">';
      return '<div class="field-editor"><div class="field-editor-header"><span class="field-editor-label">'+field.label+'</span></div>'+input+'</div>';
    }).join('');
  }
  function getFieldEditorHTML(){
    var fields=PAGE_FIELDS[currentPageFile];if(!fields) return currentPageHTML;
    var parser=new DOMParser();var doc=parser.parseFromString(currentPageHTML,'text/html');
    fields.forEach(function(field){try{var el=doc.querySelector(field.selector);var input=document.getElementById('field-'+field.id);if(el&&input) el.innerHTML=input.value;}catch{}});
    return '<!DOCTYPE html>\n'+doc.documentElement.outerHTML;
  }
  async function selectPage(cardId,file,title){
    try{title=decodeURIComponent(title);}catch{}
    if(!GH.token||!GH.owner||!GH.repo){alert('Please set up GitHub first.');return;}
    document.querySelectorAll('.page-card').forEach(function(c){c.classList.remove('selected');});
    document.querySelectorAll('.page-card[onclick*="\''+cardId+'\'"]').forEach(function(c){c.classList.add('selected');});
    currentPageFile=file;
    document.getElementById('page-editor-title').textContent=title;
    document.getElementById('save-page-btn').disabled=true;document.getElementById('save-page-btn').textContent='Loading…';
    document.getElementById('page-editor-wrap').classList.add('active');
    document.getElementById('fields-container').innerHTML='<p style="font-size:13px;color:#aaa;padding:20px;">Loading…</p>';
    try{
      var raw='https://raw.githubusercontent.com/'+GH.owner+'/'+GH.repo+'/'+GH.branch+'/'+file+'?t='+Date.now();
      var res=await fetch(raw);currentPageHTML=res.ok?await res.text():'';
      document.getElementById('page-editor-area').value=currentPageHTML;buildFieldEditor();
    } catch{currentPageHTML='';}
    document.getElementById('save-page-btn').disabled=false;document.getElementById('save-page-btn').textContent='Save to GitHub';
  }
  function closePageEditor(){document.getElementById('page-editor-wrap').classList.remove('active');document.querySelectorAll('.page-card').forEach(function(c){c.classList.remove('selected');});currentPageFile='';currentPageHTML='';}
  async function savePage(){
    if(!currentPageFile) return;
    var content=currentEditorMode==='fields'?getFieldEditorHTML():document.getElementById('page-editor-area').value;
    currentPageHTML=content;
    var btn=document.getElementById('save-page-btn');btn.disabled=true;btn.textContent='Saving…';
    try{await putFile(currentPageFile,btoa(unescape(encodeURIComponent(content))),'Update '+currentPageFile);showToast('✓ Page saved!','success');if(currentEditorMode==='fields') buildFieldEditor();}
    catch(err){showToast('Error: '+err.message,'error');}
    btn.disabled=false;btn.textContent='Save to GitHub';
  }
  function openNewPageModal(){document.getElementById('new-page-modal').classList.add('open');document.getElementById('new-page-title').value='';document.getElementById('new-page-filename').value='';}
  function closeNewPageModal(){document.getElementById('new-page-modal').classList.remove('open');}
  function getCustomPages(){try{var a=JSON.parse(localStorage.getItem('eq_custom_pages')||'[]');return Array.isArray(a)?a.filter(p=>p&&/^[a-zA-Z0-9_-]+\.html$/.test(p.file)&&typeof p.title==='string'):[];}catch{return [];}}
  function saveCustomPages(pages){localStorage.setItem('eq_custom_pages',JSON.stringify(pages));}
  function loadCustomPages(){
    var pages=getCustomPages();var section=document.getElementById('custom-pages-section');var grid=document.getElementById('custom-pages-grid');
    if(!pages.length){section.style.display='none';return;}
    section.style.display='block';
    grid.innerHTML=pages.map(function(p){
      return '<div class="page-card" onclick="selectPage(\''+p.file.replace('.html','')+'\',\''+p.file+'\',\''+encodeURIComponent(p.title).replace(/'/g,'%27')+'\')"><i class="fas fa-file-alt"></i><div><div class="page-card-name">'+escHtml(p.title)+'</div><div class="page-card-sub">'+p.file+'</div></div></div>';
    }).join('')+'<div class="page-card page-card-new" onclick="openNewPageModal()"><i class="fas fa-plus-circle"></i><div><div class="page-card-name">Add Another</div></div></div>';
  }
  async function createNewPage(){
    if(!GH.token||!GH.owner||!GH.repo){alert('Please set up GitHub first.');return;}
    var title=document.getElementById('new-page-title').value.trim();
    var file=document.getElementById('new-page-filename').value.trim();
    if(!title||!file){alert('Please fill in title and file name.');return;}
    if(!file.endsWith('.html')) file+='.html';
    file=file.toLowerCase().replace(/\s+/g,'-');
    var html='<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>'+title+' – EGYGRILLZ</title>\n</head>\n<body>\n  <h1>'+title+'</h1>\n  <p>Edit this page from the Pages Editor.</p>\n</body>\n</html>';
    showToast('Creating…','');
    try{
      await putFile(file,btoa(unescape(encodeURIComponent(html))),'Create '+file);
      var pages=getCustomPages();if(!pages.find(function(p){return p.file===file;})){pages.push({title:title,file:file});saveCustomPages(pages);}
      loadCustomPages();closeNewPageModal();showToast('✓ '+file+' created!','success');
      setTimeout(function(){selectPage(file.replace('.html',''),file,title);},800);
    } catch(err){showToast('Error: '+err.message,'error');}
  }

  document.addEventListener('DOMContentLoaded',function(){
    var ti=document.getElementById('new-page-title');var fi=document.getElementById('new-page-filename');
    if(ti){ti.addEventListener('input',function(){if(!fi.dataset.manual) fi.value=ti.value.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'')+'.html';});fi.addEventListener('input',function(){fi.dataset.manual='1';});}
  });
