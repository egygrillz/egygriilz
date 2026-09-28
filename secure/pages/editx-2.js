// ── FIREBASE INIT ──
  var db = firebase.firestore();
  function initApp() {
    loadConfig();
    loadAllPanels();
    loadCustomPages();
    loadOverview();
    watchUnreadCount();
    populateHourSelects();
  }

  // ──────────────────────────────────────
  // CALENDAR STATE
  // ──────────────────────────────────────
  var calYear, calMonth, allApptsDatesMap = {};

  function initCalendar(appts) {
    var now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
    // Build date map
    allApptsDatesMap = {};
    appts.forEach(function(a) {
      if(a.date) {
        if(!allApptsDatesMap[a.date]) allApptsDatesMap[a.date] = [];
        allApptsDatesMap[a.date].push(a);
      }
    });
    renderCalendar();
  }

  function renderCalendar() {
    var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    document.getElementById('cal-month-label').textContent = monthNames[calMonth]+' '+calYear;
    var grid = document.getElementById('cal-grid');
    var html = '';
    var dows = ['Su','Mo','Tu','We','Th','Fr','Sa'];
    dows.forEach(function(d){ html += '<div class="cal-dow">'+d+'</div>'; });
    var firstDay = new Date(calYear, calMonth, 1).getDay();
    var daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
    var today = new Date().toISOString().slice(0,10);
    // Prev month padding
    var prevDays = new Date(calYear, calMonth, 0).getDate();
    for(var p = firstDay-1; p >= 0; p--) {
      html += '<div class="cal-day other-month">'+(prevDays-p)+'</div>';
    }
    for(var d = 1; d <= daysInMonth; d++) {
      var mm = String(calMonth+1).padStart(2,'0');
      var dd = String(d).padStart(2,'0');
      var dateStr = calYear+'-'+mm+'-'+dd;
      var isToday = dateStr === today;
      var hasAppts = allApptsDatesMap[dateStr] && allApptsDatesMap[dateStr].length > 0;
      html += '<div class="cal-day'+(isToday?' today':'')+(hasAppts?' has-appts':'')+'" onclick="calSelectDay(\''+dateStr+'\','+d+')">'+d+'</div>';
    }
    // Next month padding
    var total = firstDay + daysInMonth;
    var remaining = 7 - (total % 7);
    if(remaining < 7) for(var n=1;n<=remaining;n++) html += '<div class="cal-day other-month">'+n+'</div>';
    grid.innerHTML = html;
  }

  function calPrev() { calMonth--; if(calMonth<0){calMonth=11;calYear--;} renderCalendar(); }
  function calNext() { calMonth++; if(calMonth>11){calMonth=0;calYear++;} renderCalendar(); }

  function calSelectDay(dateStr, dayNum) {
    // Deselect all
    document.querySelectorAll('.cal-day.selected').forEach(function(el){el.classList.remove('selected');});
    // Select clicked
    var allDays = document.querySelectorAll('.cal-day:not(.other-month)');
    allDays.forEach(function(el){ if(el.textContent==dayNum) el.classList.add('selected'); });
    var detail = document.getElementById('cal-day-detail');
    var appts = allApptsDatesMap[dateStr] || [];
    if(!appts.length) {
      detail.style.display = 'block';
      detail.innerHTML = '<div class="cal-day-detail-date">'+formatDateNice(dateStr)+'</div><p style="font-size:13px;color:#ccc;padding:8px 0;">No appointments</p>';
      return;
    }
    var sorted = appts.slice().sort(function(a,b){return (a.time||'').localeCompare(b.time||'');});
    var html = '<div class="cal-day-detail-date">'+formatDateNice(dateStr)+'</div>';
    sorted.forEach(function(a){
      html += '<div class="cal-appt-item"><div class="cal-appt-time">'+escHtml(a.time||'')+'</div><div class="cal-appt-name">'+escHtml(a.name||'')+'</div><div class="cal-appt-svc">'+escHtml(a.service||'')+'</div></div>';
    });
    detail.style.display = 'block';
    detail.innerHTML = html;
  }

  function formatDateNice(dateStr) {
    if(!dateStr) return '';
    var d = new Date(dateStr+'T00:00:00');
    return d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
  }

  // ──────────────────────────────────────
  // OVERVIEW
  // ──────────────────────────────────────
  async function loadOverview() {
    if(!db) return;
    try {
      var today = new Date().toISOString().slice(0,10);
      var thisMonth = today.slice(0,7);
      // Get start of week (Sunday)
      var now = new Date();
      var dow = now.getDay();
      var weekStart = new Date(now); weekStart.setDate(now.getDate()-dow); weekStart.setHours(0,0,0,0);
      var weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate()+6);
      var wStartStr = weekStart.toISOString().slice(0,10);
      var wEndStr = weekEnd.toISOString().slice(0,10);

      var [apptSnap, msgSnap, clientSnap] = await Promise.all([
        db.collection('appointments').get(),
        db.collection('messages').get(),
        db.collection('clients').get()
      ]);

      var appts = [];
      egyRememberAppointments(apptSnap);
      apptSnap.forEach(function(d){ if(!/^[\w-]{1,128}$/.test(d.id))return; appts.push(Object.assign({},d.data(),{id:d.id})); });

      var unread = 0;
      msgSnap.forEach(function(d){ if(!d.data().read) unread++; });

      var showed = appts.filter(function(a){return a.showedUp===true;}).length;
      var noshow = appts.filter(function(a){return a.showedUp===false;}).length;
      var todayCount = appts.filter(function(a){return a.date===today;}).length;
      var weekCount = appts.filter(function(a){return a.date>=wStartStr&&a.date<=wEndStr;}).length;
      var monthCount = appts.filter(function(a){return (a.date||'').startsWith(thisMonth);}).length;

      document.getElementById('st-total').textContent = appts.length;
      document.getElementById('st-showed').textContent = showed;
      document.getElementById('st-noshow').textContent = noshow;
      document.getElementById('st-unread').textContent = unread;
      document.getElementById('st-clients').textContent = clientSnap.size;
      document.getElementById('st-today').textContent = todayCount;
      document.getElementById('st-week').textContent = weekCount;
      document.getElementById('st-month').textContent = monthCount;

      // Today label
      document.getElementById('today-date').textContent = formatDateNice(today);
      // Week range label
      document.getElementById('week-range').textContent = wStartStr+' – '+wEndStr;

      // Today's appointments
      var todayAppts = appts.filter(function(a){return a.date===today;}).sort(function(a,b){return (a.time||'').localeCompare(b.time||'');});
      var todayEl = document.getElementById('today-appts-list');
      if(!todayAppts.length) {
        todayEl.innerHTML = '<div style="text-align:center;padding:30px;color:#ccc;font-size:13px;">No appointments today</div>';
      } else {
        todayEl.innerHTML = todayAppts.map(function(a){
          var dot = '<div class="appt-week-dot today-dot"></div>';
          return '<div class="appt-week-item">'+dot+'<div class="appt-week-info"><div class="appt-week-name">'+escHtml(a.name||'')+'</div><div class="appt-week-meta">'+escHtml(a.service||'')+'</div></div><div class="appt-week-time">'+escHtml(a.time||'')+'</div></div>';
        }).join('');
      }

      // This week's appointments
      var weekAppts = appts.filter(function(a){return a.date>=wStartStr&&a.date<=wEndStr;}).sort(function(a,b){return (a.date+a.time).localeCompare(b.date+b.time);});
      var weekEl = document.getElementById('week-appts-list');
      if(!weekAppts.length) {
        weekEl.innerHTML = '<div style="text-align:center;padding:30px;color:#ccc;font-size:13px;">No appointments this week</div>';
      } else {
        weekEl.innerHTML = weekAppts.map(function(a){
          var isToday2 = a.date===today;
          var dot = '<div class="appt-week-dot'+(isToday2?' today-dot':'')+'"></div>';
          return '<div class="appt-week-item">'+dot+'<div class="appt-week-info"><div class="appt-week-name">'+escHtml(a.name||'')+'</div><div class="appt-week-meta">'+escHtml(a.service||'')+' — '+escHtml(a.date||'')+'</div></div><div class="appt-week-time">'+escHtml(a.time||'')+'</div></div>';
        }).join('');
      }

      // All appointments table (upcoming first)
      var sorted = appts.slice().sort(function(a,b){return (b.date+b.time).localeCompare(a.date+a.time);});
      var tbody = document.getElementById('upcoming-tbody');
      tbody.innerHTML = sorted.length ? sorted.map(function(a){
        var badgeCls = a.showedUp===true?'badge-confirmed':a.showedUp===false?'badge-noshow':'badge-pending';
        var badgeTxt = a.showedUp===true?'Showed':a.showedUp===false?'No Show':'Pending';
        return '<tr><td>'+escHtml(a.date||'')+'</td><td>'+escHtml(a.time||'')+'</td><td>'+escHtml(a.name||'')+'<br><small style="color:#aaa;">'+escHtml(a.phone||'')+'</small></td><td>'+escHtml(a.phone||'')+'</td><td>'+escHtml(a.service||'')+'</td><td><span class="status-badge '+badgeCls+'">'+badgeTxt+'</span></td></tr>';
      }).join('') : '<tr><td colspan="6" style="text-align:center;color:#ccc;padding:30px;">No appointments</td></tr>';

      // Init calendar
      initCalendar(appts);

    } catch(e){ console.error('Overview error:', e); }
  }

  function watchUnreadCount() {
    if(!db) return;
    db.collection('messages').where('read','==',false).onSnapshot(function(snap){
      var count = snap.size;
      var badge = document.getElementById('unread-badge');
      badge.style.display = count>0?'inline-block':'none';
      badge.textContent = count;
    });
  }

  // ──────────────────────────────────────
  // APPOINTMENTS
  // ──────────────────────────────────────
  var allAppts = [], apptFilter = 'all', apptSearch = '';

  async function loadAppointments() {
    if(!db) return;
    try {
      var snap = await db.collection('appointments').orderBy('date','desc').get();
      allAppts = [];
      egyRememberAppointments(snap);
      snap.forEach(function(d){ if(!/^[\w-]{1,128}$/.test(d.id))return; allAppts.push(Object.assign({},d.data(),{id:d.id})); });
      renderAppts();
    } catch(e){ console.error('Appointments error:', e); }
  }

  function setApptFilter(f, btn) {
    apptFilter = f;
    document.querySelectorAll('#panel-appointments .filter-tab').forEach(function(b){b.classList.remove('active');});
    btn.classList.add('active');
    renderAppts();
  }

  function filterAppts(q){ apptSearch=q.toLowerCase(); renderAppts(); }

  function renderAppts() {
    var today = new Date().toISOString().slice(0,10);
    var list = allAppts.filter(function(a){
      if(apptFilter==='upcoming') return a.date>=today;
      if(apptFilter==='past') return a.date<today;
      if(apptFilter==='noshow') return a.showedUp===false;
      return true;
    }).filter(function(a){
      if(!apptSearch) return true;
      return (a.name||'').toLowerCase().includes(apptSearch)||(a.phone||'').includes(apptSearch)||(a.email||'').toLowerCase().includes(apptSearch)||(a.service||'').toLowerCase().includes(apptSearch);
    });
    var tbody = document.getElementById('appt-tbody');
    if(!list.length){tbody.innerHTML='<tr><td colspan="7" style="text-align:center;color:#ccc;padding:40px;">No appointments found</td></tr>';return;}
    tbody.innerHTML = list.map(function(a){
      var yesActive = a.showedUp===true?'active':'';
      var noActive = a.showedUp===false?'active':'';
      var statusBadge = a.showedUp===true?'<span class="status-badge badge-confirmed">Showed</span>':a.showedUp===false?'<span class="status-badge badge-noshow">No Show</span>':'<span class="status-badge badge-pending">Pending</span>';
      return '<tr>'+
        '<td>'+escHtml(a.date||'')+'</td>'+
        '<td>'+escHtml(a.time||'')+'</td>'+
        '<td>'+escHtml(a.name||'')+'<br><small style="color:#aaa;">'+escHtml(a.phone||'')+'</small></td>'+
        '<td>'+escHtml(a.service||'')+'</td>'+
        '<td><div class="show-toggle"><button class="show-btn yes '+yesActive+'" onclick="setShowedUp(\''+a.id+'\',true,this)">✓</button><button class="show-btn no '+noActive+'" onclick="setShowedUp(\''+a.id+'\',false,this)">✗</button></div></td>'+
        '<td>'+statusBadge+'</td>'+
        '<td><button class="btn-sm btn-edit" onclick="editAppt(\''+a.id+'\')">Edit</button> <button class="btn-sm btn-del" onclick="confirmDeleteAppt(\''+a.id+'\')">Delete</button></td>'+
      '</tr>';
    }).join('');
  }

  async function setShowedUp(id, val, btn) {
    if(!db) return;
    try {
      await appointmentStore.doc(id).update({showedUp:val});
      var appt = allAppts.find(function(a){return a.id===id;});
      if(appt) appt.showedUp = val;
      renderAppts();
      showToast('✓ Updated','success');
    } catch(e){ showToast('Error: '+e.message,'error'); }
  }

  function openApptModal() {
    document.getElementById('appt-edit-id').value='';
    document.getElementById('appt-modal-title').textContent='Add Appointment';
    ['appt-name','appt-phone','appt-email','appt-date','appt-time','appt-service','appt-notes'].forEach(function(id){document.getElementById(id).value='';});
    document.getElementById('appt-modal-overlay').classList.add('open');
  }

  function editAppt(id) {
    var a = allAppts.find(function(x){return x.id===id;});
    if(!a) return;
    document.getElementById('appt-edit-id').value = id;
    document.getElementById('appt-modal-title').textContent = 'Edit Appointment';
    document.getElementById('appt-name').value = a.name||'';
    document.getElementById('appt-phone').value = a.phone||'';
    document.getElementById('appt-email').value = a.email||'';
    document.getElementById('appt-date').value = a.date||'';
    document.getElementById('appt-time').value = a.time||'';
    document.getElementById('appt-service').value = a.service||'';
    document.getElementById('appt-notes').value = a.notes||'';
    document.getElementById('appt-modal-overlay').classList.add('open');
  }

  function closeApptModal(){ document.getElementById('appt-modal-overlay').classList.remove('open'); }

  async function saveAppt() {
    if(!db) return;
    var id = document.getElementById('appt-edit-id').value;
    var data = {
      name: document.getElementById('appt-name').value.trim(),
      phone: document.getElementById('appt-phone').value.trim(),
      email: document.getElementById('appt-email').value.trim(),
      date: document.getElementById('appt-date').value,
      time: document.getElementById('appt-time').value.trim(),
      service: document.getElementById('appt-service').value.trim(),
      notes: document.getElementById('appt-notes').value.trim(),
      status: 'confirmed'
    };
    if(!data.name||!data.phone||!data.date||!data.service){showToast('Please fill required fields','error');return;}
    try {
      if(id){
        await appointmentStore.doc(id).update(data);
        var idx = allAppts.findIndex(function(a){return a.id===id;});
        if(idx>-1) Object.assign(allAppts[idx], data);allAppts[idx].version=(allAppts[idx].version||0)+1;
      } else {
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        data.showedUp = null;
        var ref = await appointmentStore.add(data);
        allAppts.unshift(Object.assign({id:ref.id},data));
      }
      renderAppts();
      closeApptModal();
      showToast('✓ Saved','success');
    } catch(e){ showToast('Error: '+e.message,'error'); }
  }

  var _deleteApptId = null;
  function confirmDeleteAppt(id){
    _deleteApptId=id;
    document.getElementById('confirm-msg').textContent='This will permanently delete this appointment.';
    document.getElementById('confirm-del-btn').onclick=doDeleteAppt;
    document.getElementById('confirm-overlay').classList.add('open');
  }
  async function doDeleteAppt() {
    if(!db||!_deleteApptId) return;
    closeConfirm();
    try {
      await appointmentStore.doc(_deleteApptId).delete();
      allAppts = allAppts.filter(function(a){return a.id!==_deleteApptId;});
      renderAppts();
      showToast('✓ Deleted','success');
    } catch(e){ showToast('Error: '+e.message,'error'); }
  }

  function importCSV(){ document.getElementById('csv-input').click(); }
  function handleCSVImport(file) {
    if(!file||!db) return;
    var r = new FileReader();
    r.onload = async function(e){
      var text = e.target.result;
      var lines = text.split(/\r?\n/);
      var headers = lines[0].split(',').map(function(h){return h.replace(/^"|"$/g,'').trim().toLowerCase();});
      var count=0,errs=0;
      for(var i=1;i<lines.length;i++){
        if(!lines[i].trim()) continue;
        var vals = parseCSVLine(lines[i]);
        var row={};
        headers.forEach(function(h,j){row[h]=vals[j]||'';});
        var rname = row.name||row['full name']||'';
        var rphone = row.phone||row['phone number']||'';
        if(!rname&&!rphone) continue;
        var su=null;
        if(['true','1','yes'].indexOf((row.showedup||'').toLowerCase())>-1) su=true;
        else if(['false','0','no'].indexOf((row.showedup||'').toLowerCase())>-1) su=false;
        try {
          await appointmentStore.add({
            name:rname.trim(),phone:rphone.trim(),email:(row.email||'').trim(),
            service:row.service||row.services||'Appointment',
            date:row.date||'',time:row.time||'',
            notes:(row.notes||'').trim(),price:row.price||'0',
            status:'confirmed',showedUp:su,
            createdAt:firebase.firestore.FieldValue.serverTimestamp()
          });
          count++;
        } catch(err){ errs++; }
      }
      showToast('✓ Imported '+count+' appointments'+(errs?' ('+errs+' errors)':''),'success');
      loadAppointments();
    };
    r.readAsText(file);
  }
  function exportApptCSV() {
    var headers = ['date','time','name','phone','email','service','notes','showedUp','status'];
    var rows = allAppts.map(function(a){
      return headers.map(function(h){return safeCSV(a[h]);}).join(',');
    });
    var csv = [headers.join(','),...rows].join('\n');
    var blob = new Blob([csv],{type:'text/csv'});
    var a = document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download='appointments-'+new Date().toISOString().slice(0,10)+'.csv'; a.click();
    showToast('✓ Exported','success');
  }

  // ──────────────────────────────────────
  // CLIENTS
  // ──────────────────────────────────────
  var allClients = [], _viewingClientId = null;

  async function loadClients() {
    if(!db) return;
    try {
      var snap = await db.collection('clients').get();
      allClients = [];
      snap.forEach(function(d){ if(!/^[\w-]{1,128}$/.test(d.id))return; allClients.push(Object.assign({},d.data(),{id:d.id})); });
      renderClients(allClients);
    } catch(e){ console.error('Clients error:', e); }
  }

  function filterClients(q) {
    q = q.toLowerCase();
    renderClients(allClients.filter(function(c){
      return (c.name||'').toLowerCase().includes(q)||(c.phone||'').includes(q)||(c.email||'').toLowerCase().includes(q);
    }));
  }

  function renderClients(list) {
    var grid = document.getElementById('clients-grid');
    if(!list.length){grid.innerHTML='<div class="empty-state"><i class="fas fa-users"></i><p>No clients found</p></div>';return;}
    grid.innerHTML = list.map(function(c){
      return '<div class="client-card" onclick="openClientModal(\''+c.id+'\')">'+'<div class="client-name">'+escHtml(c.name||'Unknown')+'</div>'+'<div class="client-phone">'+escHtml(c.phone||'')+'</div>'+'<div class="client-stats"><div class="client-stat"><span class="client-stat-val">'+(Number(c.totalAppointments)||0)+'</span><span class="client-stat-lbl">Appts</span></div><div class="client-stat"><span class="client-stat-val">'+(Number(c.totalNoShows)||0)+'</span><span class="client-stat-lbl">No Shows</span></div></div></div>';
    }).join('');
  }

  async function openClientModal(id) {
    var c = allClients.find(function(x){return x.id===id;});
    if(!c) return;
    _viewingClientId = id;
    document.getElementById('client-modal-name').textContent = c.name||'Client';
    var body = document.getElementById('client-modal-body');
    body.innerHTML = '<p style="color:#888;text-align:center;padding:20px;">Loading history…</p>';
    document.getElementById('client-modal-overlay').classList.add('open');
    var apptHistory = '';
    try {
      var snap = await db.collection('appointments').where('phone','==',c.phone||'').orderBy('date','desc').get();
      var rows='';
      snap.forEach(function(d){ var a=d.data(); rows+='<tr><td>'+escHtml(a.date||'')+'</td><td>'+escHtml(a.time||'')+'</td><td>'+escHtml(a.service||'')+'</td><td>'+(a.showedUp===true?'✓':a.showedUp===false?'✗':'–')+'</td></tr>'; });
      apptHistory = rows?'<div class="table-wrap"><table><thead><tr><th>Date</th><th>Time</th><th>Service</th><th>Showed</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<p style="color:#ccc;font-size:13px;padding:16px 0;">No appointment history found.</p>';
    } catch(e){}
    body.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;"><div><label class="form-label">Phone</label><p style="font-size:14px;">'+escHtml(c.phone||'—')+'</p></div><div><label class="form-label">Email</label><p style="font-size:14px;">'+escHtml(c.email||'—')+'</p></div><div><label class="form-label">First Visit</label><p style="font-size:14px;">'+escHtml(c.firstVisit||'—')+'</p></div><div><label class="form-label">Last Visit</label><p style="font-size:14px;">'+escHtml(c.lastVisit||'—')+'</p></div><div><label class="form-label">Services</label><p style="font-size:14px;">'+escHtml((c.services||[]).join(', ')||'—')+'</p></div><div><label class="form-label">Notes</label><p style="font-size:14px;">'+escHtml(c.notes||'—')+'</p></div></div><label class="form-label" style="margin-bottom:10px;">Appointment History</label>'+apptHistory;
  }
  function closeClientModal(){ document.getElementById('client-modal-overlay').classList.remove('open'); }

  function openAddClientModal(prefill) {
    document.getElementById('client-edit-id').value='';
    document.getElementById('add-client-modal-title').textContent='Add Client';
    ['client-name','client-phone','client-email','client-first-visit','client-last-visit','client-services','client-notes'].forEach(function(id){document.getElementById(id).value='';});
    if(prefill){
      if(prefill.name) document.getElementById('client-name').value=prefill.name;
      if(prefill.phone) document.getElementById('client-phone').value=prefill.phone;
      if(prefill.email) document.getElementById('client-email').value=prefill.email;
    }
    document.getElementById('add-client-modal-overlay').classList.add('open');
  }
  function closeAddClientModal(){ document.getElementById('add-client-modal-overlay').classList.remove('open'); }

  function editClientFromModal() {
    var c = allClients.find(function(x){return x.id===_viewingClientId;});
    if(!c) return;
    closeClientModal();
    document.getElementById('client-edit-id').value=c.id;
    document.getElementById('add-client-modal-title').textContent='Edit Client';
    document.getElementById('client-name').value=c.name||'';
    document.getElementById('client-phone').value=c.phone||'';
    document.getElementById('client-email').value=c.email||'';
    document.getElementById('client-first-visit').value=c.firstVisit||'';
    document.getElementById('client-last-visit').value=c.lastVisit||'';
    document.getElementById('client-services').value=Array.isArray(c.services)?c.services.join(', '):(c.services||'');
    document.getElementById('client-notes').value=c.notes||'';
    document.getElementById('add-client-modal-overlay').classList.add('open');
  }

  async function deleteClientFromModal() {
    if(!db||!_viewingClientId) return;
    if(!confirm('Delete this client permanently?')) return;
    closeClientModal();
    try {
      await db.collection('clients').doc(_viewingClientId).delete();
      allClients = allClients.filter(function(c){return c.id!==_viewingClientId;});
      renderClients(allClients);
      showToast('✓ Client deleted','success');
    } catch(e){ showToast('Error: '+e.message,'error'); }
  }

  async function saveClient() {
    if(!db) return;
    var id = document.getElementById('client-edit-id').value;
    var name = document.getElementById('client-name').value.trim();
    var phone = document.getElementById('client-phone').value.trim();
    if(!name||!phone){showToast('Name and phone are required','error');return;}
    var svcsRaw = document.getElementById('client-services').value;
    var services = svcsRaw?svcsRaw.split(',').map(function(s){return s.trim();}).filter(Boolean):[];
    var data = {name:name,phone:phone,email:document.getElementById('client-email').value.trim(),firstVisit:document.getElementById('client-first-visit').value,lastVisit:document.getElementById('client-last-visit').value,services:services,notes:document.getElementById('client-notes').value.trim()};
    try {
      if(id){
        await db.collection('clients').doc(id).update(data);
        var idx = allClients.findIndex(function(c){return c.id===id;});
        if(idx>-1) Object.assign(allClients[idx],data);
        showToast('✓ Client updated','success');
      } else {
        data.createdAt=firebase.firestore.FieldValue.serverTimestamp();data.totalAppointments=0;
        var ref = await db.collection('clients').add(data);
        allClients.unshift(Object.assign({id:ref.id},data));
        showToast('✓ Client added','success');
      }
      renderClients(allClients);
      closeAddClientModal();
    } catch(e){ showToast('Error: '+e.message,'error'); }
  }

  function importClientsCSV(){ document.getElementById('client-csv-input').click(); }
  function handleClientCSVImport(file) {
    if(!file||!db) return;
    var r = new FileReader();
    r.onload = async function(e){
      var text=e.target.result;
      var lines=text.split(/\r?\n/);
      var headers=lines[0].split(',').map(function(h){return h.replace(/^"|"$/g,'').trim().toLowerCase();});
      var count=0,errors=0;
      for(var i=1;i<lines.length;i++){
        if(!lines[i].trim()) continue;
        var vals=parseCSVLine(lines[i]);
        var row={};
        headers.forEach(function(h,j){row[h]=vals[j]||'';});
        var name=row.name||row['full name']||'';
        var phone=row.phone||row['phone number']||'';
        if(!name&&!phone) continue;
        var services=row.services?row.services.split(',').map(function(s){return s.trim();}).filter(Boolean):[];
        try {
          await db.collection('clients').add({name:name.trim(),phone:phone.trim(),email:(row.email||'').trim(),firstVisit:row.firstvisit||row['first visit']||'',lastVisit:row.lastvisit||row['last visit']||'',services:services,notes:(row.notes||'').trim(),totalAppointments:parseInt(row.totalappointments||'0')||0,createdAt:firebase.firestore.FieldValue.serverTimestamp()});
          count++;
        } catch(err){ errors++; }
      }
      showToast('✓ Imported '+count+' clients'+(errors?' ('+errors+' errors)':''),'success');
      loadClients();
    };
    r.readAsText(file);
    document.getElementById('client-csv-input').value='';
  }
  function exportClientsCSV() {
    var headers=['name','phone','email','totalAppointments','firstVisit','lastVisit','services','notes'];
    var rows=allClients.map(function(c){
      return headers.map(function(h){var v=h==='services'?(Array.isArray(c[h])?c[h].join('; '):c[h]||''):(c[h]||'');return safeCSV(v);}).join(',');
    });
    var csv=[headers.join(','),...rows].join('\n');
    var blob=new Blob([csv],{type:'text/csv'});
    var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='clients-'+new Date().toISOString().slice(0,10)+'.csv';a.click();
    showToast('✓ Exported '+allClients.length+' clients','success');
  }

  function parseCSVLine(line){
    var result=[],cur='',inQ=false;
    for(var i=0;i<line.length;i++){
      var ch=line[i];
      if(ch==='"'){if(inQ&&line[i+1]==='"'){cur+='"';i++;}else{inQ=!inQ;}}
      else if(ch===','&&!inQ){result.push(cur.trim());cur='';}
      else{cur+=ch;}
    }
    result.push(cur.trim());
    return result;
  }

  // ──────────────────────────────────────
  // MESSAGES
  // ──────────────────────────────────────
  var allMessages=[], msgFilter='all', selectedMsgId=null;

  async function loadMessages() {
    if(!db) return;
    try {
      var snap = await db.collection('messages').orderBy('createdAt','desc').get();
      allMessages=[];
      snap.forEach(function(d){ if(!/^[\w-]{1,128}$/.test(d.id))return; allMessages.push(Object.assign({},d.data(),{id:d.id})); });
      renderMsgList();
    } catch(e){ console.error('Messages error:', e); }
  }

  function setMsgFilter(f, btn){
    msgFilter=f;
    document.querySelectorAll('#panel-messages .filter-tab').forEach(function(b){b.classList.remove('active');});
    btn.classList.add('active');
    renderMsgList();
  }

  function renderMsgList(){
    var list=allMessages.filter(function(m){
      if(msgFilter==='unread') return !m.read;
      if(msgFilter==='read') return m.read;
      return true;
    });
    var el=document.getElementById('msg-list');
    if(!list.length){el.innerHTML='<div style="text-align:center;padding:40px;color:#ccc;font-size:13px;">No messages</div>';return;}
    el.innerHTML=list.map(function(m){
      var ts=m.createdAt?new Date(m.createdAt.toDate()).toLocaleDateString():'';
      return '<div class="msg-item '+(selectedMsgId===m.id?'active':'')+' '+(m.read?'':'unread')+'" onclick="openMsg(\''+m.id+'\')"><div class="msg-sender">'+escHtml(m.name||'Unknown')+(m.read?'':'<span class="msg-unread-dot"></span>')+'</div><div class="msg-preview">'+escHtml((m.message||'').slice(0,60))+'</div><div class="msg-time">'+ts+'</div></div>';
    }).join('');
  }

  async function openMsg(id){
    var m=allMessages.find(function(x){return x.id===id;});
    if(!m) return;
    selectedMsgId=id;
    if(!m.read){ try{await db.collection('messages').doc(id).update({read:true});m.read=true;}catch(e){} }
    renderMsgList();
    var ts=m.createdAt?new Date(m.createdAt.toDate()).toLocaleString():'';
    document.getElementById('msg-detail').innerHTML='<div class="msg-detail-header"><div class="msg-detail-from">'+escHtml(m.name||'Unknown')+'</div><div class="msg-detail-email">'+escHtml(m.email||'')+'</div><div style="font-size:11px;color:#ccc;margin-top:4px;">'+ts+'</div></div><div class="msg-detail-body">'+escHtml(m.message||'')+'</div><div class="msg-actions"><a href="mailto:'+escAttr(m.email||'')+'" class="btn-sm btn-edit" style="text-decoration:none;">Reply in Gmail</a><button class="btn-sm btn-edit" onclick="markMsgUnread(\''+id+'\')">Mark Unread</button><button class="btn-sm btn-del" onclick="confirmDeleteMsg(\''+id+'\')">Delete</button></div>';
  }

  async function markMsgUnread(id){
    var m=allMessages.find(function(x){return x.id===id;});
    if(!m||!db) return;
    try{await db.collection('messages').doc(id).update({read:false});m.read=false;renderMsgList();showToast('Marked unread','success');}
    catch(e){showToast('Error','error');}
  }

  function confirmDeleteMsg(id){
    document.getElementById('confirm-msg').textContent='This will permanently delete this message.';
    document.getElementById('confirm-del-btn').onclick=function(){doDeleteMsg(id);};
    document.getElementById('confirm-overlay').classList.add('open');
  }
  async function doDeleteMsg(id){
    closeConfirm();if(!db) return;
    try{
      await db.collection('messages').doc(id).delete();
      allMessages=allMessages.filter(function(m){return m.id!==id;});
      selectedMsgId=null;
      document.getElementById('msg-detail').innerHTML='<div class="msg-empty">Select a message to read</div>';
      renderMsgList();showToast('✓ Deleted','success');
    } catch(e){showToast('Error: '+e.message,'error');}
  }

  // ──────────────────────────────────────
  // SCHEDULE SETTINGS
  // ──────────────────────────────────────
  var scheduleHolidays=[];

  function populateHourSelects(){
    var openSel=document.getElementById('open-hour');
    var closeSel=document.getElementById('close-hour');
    var html='';
    for(var h=1;h<24;h++){
      var label=h<12?h+':00 AM':h===12?'12:00 PM':(h-12)+':00 PM';
      html+='<option value="'+h+'">'+label+'</option>';
    }
    openSel.innerHTML=html;
    closeSel.innerHTML=html+'<option value="0">12:00 AM (Midnight)</option>';
    openSel.value='16';closeSel.value='22';
  }

  async function loadScheduleSettings(){
    if(!db) return;
    try{
      var snap=await db.collection('settings').doc('schedule').get();
      if(!snap.exists) return;
      var d=snap.data();
      var days=d.openDays||[];
      document.querySelectorAll('.day-toggle').forEach(function(el){
        el.classList.toggle('active',days.includes(parseInt(el.dataset.dow)));
      });
      if(typeof d.openHour!=='undefined') document.getElementById('open-hour').value=d.openHour;
      if(typeof d.closeHour!=='undefined') document.getElementById('close-hour').value=d.closeHour;
      if(typeof d.slotDuration!=='undefined') document.getElementById('slot-duration').value=d.slotDuration;
      scheduleHolidays=(d.holidays||[]).map(h=>typeof h==='string'?h:h.date).filter(h=>/^\d{4}-\d{2}-\d{2}$/.test(h));
      renderHolidayPills();
    } catch(e){console.error('Schedule settings error:', e);}
  }

  function toggleDay(el){ el.classList.toggle('active'); }
  function addHoliday(){
    var val=document.getElementById('holiday-input').value;
    if(!val||scheduleHolidays.includes(val)) return;
    scheduleHolidays.push(val);
    document.getElementById('holiday-input').value='';
    renderHolidayPills();
  }
  function removeHoliday(date){ scheduleHolidays=scheduleHolidays.filter(function(d){return d!==date;}); renderHolidayPills(); }
  function renderHolidayPills(){
    document.getElementById('holiday-pills').innerHTML=scheduleHolidays.map(function(d){
      return '<div class="holiday-pill">'+escHtml(d)+'<button onclick="removeHoliday(\''+d+'\')">×</button></div>';
    }).join('');
  }

  async function saveScheduleSettings(){
    if(!db){showToast('Firebase not connected','error');return;}
    var openDays=[];
    document.querySelectorAll('.day-toggle.active').forEach(function(el){openDays.push(parseInt(el.dataset.dow));});
    var data={
      openDays:openDays,
      openHour:parseInt(document.getElementById('open-hour').value),
      closeHour:parseInt(document.getElementById('close-hour').value),
      slotDuration:parseInt(document.getElementById('slot-duration').value)||60,
      holidays:scheduleHolidays
    };
    try{
      await db.collection('settings').doc('schedule').set(data,{merge:true});
      showToast('✓ Schedule settings saved! Booking page will now show correct slots.','success');
    } catch(e){showToast('Error: '+e.message,'error');}
  }

  // ──────────────────────────────────────
  // GITHUB CONFIG
  // ──────────────────────────────────────
  var GH={token:'',owner:'',repo:'',branch:'main'};
  function loadConfig(){
    localStorage.removeItem('eq_token');
    var repository=EGY_CONFIG.repository||{owner:'egygrillz',name:'egygriilz',branch:'main'};GH={token:'server-managed',owner:repository.owner,repo:repository.name,branch:repository.branch};
    for (var k of ['token','owner','repo','branch']) {var el=document.getElementById('cfg-'+k); el.value=k==='token'?'Managed securely by backend':GH[k];el.disabled=true;}
  }
  function saveConfig(){loadConfig();showToast('GitHub credentials are managed in Firebase Secret Manager.','success');}
  async function ghFetch(path,method,body){return egyCall('githubAdmin',{path:path,method:method||'GET',...(body?{body:body}:{})});}
  async function getFileSHA(path){try{return (await ghFetch('contents/'+path+'?ref='+GH.branch)).sha;}catch(e){if(e.code==='functions/not-found')return null;throw e;}}
  async function putFile(path,content,message){
    var sha=await getFileSHA(path);
    var body={message:message,content:content,branch:GH.branch};
    if(sha) body.sha=sha;
    return ghFetch('contents/'+path,'PUT',body);
  }

  // ──────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────
  function safeCSV(value){var s=String(value??'');if(/^[\s]*[=+@-]/.test(s)||/^[\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
  function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function escAttr(s){ return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
  function closeConfirm(){ document.getElementById('confirm-overlay').classList.remove('open'); }

  var toastTimer;
  function showToast(msg,type){
    var t=document.getElementById('toast');t.textContent=msg;
    t.className='toast show '+(type||'');clearTimeout(toastTimer);
    if(type!=='') toastTimer=setTimeout(function(){t.classList.remove('show');},3500);
  }
