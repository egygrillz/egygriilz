function doLogin(){location.href='admin.html';}
    function logout(){firebase.auth().signOut().then(()=>location.replace('admin.html'));}
    function toggleSidebar(){document.getElementById('sidebar').classList.toggle('open');document.getElementById('sidebar-overlay').classList.toggle('open');}
    function closeSidebar(){document.getElementById('sidebar').classList.remove('open');document.getElementById('sidebar-overlay').classList.remove('open');}

    function showPage(name){
      document.querySelectorAll('.panel').forEach(function(p){p.classList.remove('active');});
      document.querySelectorAll('.nav-item').forEach(function(n){n.classList.remove('active');});
      var panel=document.getElementById('panel-'+name);
      if(panel) panel.classList.add('active');
      document.querySelectorAll('[data-page="'+name+'"]').forEach(function(n){n.classList.add('active');});
      document.getElementById('topbar-title').textContent=pageTitle(name);
      closeSidebar();
      if(name==='overview') loadOverview();
      if(name==='appointments') loadAppointments();
      if(name==='clients') loadClients();
      if(name==='messages') loadMessages();
      if(name==='schedule') loadScheduleSettings();
      if(name==='sets'||name==='golds'||name==='silvers'||name==='diamonds'||name==='latest') loadCategory(name);
    }

    function pageTitle(n){
      var map={overview:'Overview',appointments:'Appointments',clients:'Clients',messages:'Messages',schedule:'Schedule Settings',sets:'Sets',golds:'Golds',silvers:'Silvers',diamonds:'Diamonds',latest:'Latest Designs',pages:'Pages Editor',backup:'Backup',setup:'GitHub Setup'};
      return map[n]||n;
    }
