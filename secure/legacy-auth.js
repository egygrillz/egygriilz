(() => {
 let started=false;
 localStorage.removeItem('eq_token');localStorage.removeItem('eq_lockout');
 window.doLogin=()=>location.assign('admin.html');
 window.logout=async()=>{await egySignOut();location.replace('admin.html');};
 egyWatchAdmin(()=>{
  document.getElementById('login-screen').style.display='none';document.getElementById('app').style.display='block';
  if(!started){started=true;initApp();}
 },()=>{
  document.getElementById('app').style.display='none';
  document.getElementById('app').replaceChildren();
  location.replace('admin.html');
 });
})();
