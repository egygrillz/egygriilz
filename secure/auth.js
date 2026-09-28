(() => {
 if(/\/(admin|editx|invoice)\.html$/.test(location.pathname)&&window.top!==window.self){
  document.documentElement.hidden=true;window.egyWatchAdmin=()=>()=>{};
  window.addEventListener('DOMContentLoaded',()=>{const main=document.createElement('main'),heading=document.createElement('h1'),link=document.createElement('a');heading.textContent='Open the studio directly';link.textContent='Open in a new tab';link.href=location.href;link.target='_blank';link.rel='noopener noreferrer';main.append(heading,link);document.body.replaceChildren(main);document.documentElement.hidden=false;},{once:true});return;
 }
 const auth=firebase.auth();
 // Hide sensitive views immediately on sign-out/revocation, including restored BFCache documents.
 window.egyWatchAdmin=(allowed,denied)=>{
  let roleUnsubscribe,epoch=0,expiryTimer;
  const unsubscribe=auth.onIdTokenChanged(async user=>{
   const current=++epoch;roleUnsubscribe?.();clearTimeout(expiryTimer);
   if(!user){denied('signed-out');return;}
   try{
    const token=await user.getIdTokenResult();if(current!==epoch)return;
    if(token.claims.admin!==true){denied('not-admin');return;}
    roleUnsubscribe=firebase.firestore().doc('_admins/'+user.uid).onSnapshot(s=>{
     if(current!==epoch)return;const r=s.data(),authTime=Number(token.claims.auth_time||0);
     if(!s.exists||r.active!==true||authTime<Number(r.minAuthTime||0)){denied('revoked');return;}
     const remaining=(authTime+Number(r.maxSessionSeconds||43200))*1000-Date.now();
     if(remaining<=0){denied('expired');return;}
     if(r.requireMfa&&token.claims.firebase?.sign_in_second_factor!=='totp'){denied('mfa');return;}
     clearTimeout(expiryTimer);expiryTimer=setTimeout(()=>denied('expired'),Math.min(remaining,2147483647));allowed(user,r);
    },()=>denied('unavailable'));
   }catch{denied('unavailable');}
  });
  return ()=>{++epoch;roleUnsubscribe?.();unsubscribe();clearTimeout(expiryTimer);};
 };
 window.egyRemovePush=async()=>{
  if(!('Notification' in window)||Notification.permission!=='granted'||!await firebase.messaging.isSupported()||EGY_CONFIG.vapidKey.startsWith('REPLACE_'))return;
  const registration=await navigator.serviceWorker.getRegistration(new URL('.',location.href).href);if(!registration)return;
  const m=firebase.messaging(),token=await m.getToken({vapidKey:EGY_CONFIG.vapidKey,serviceWorkerRegistration:registration});
  if(token)await egyCall('pushDevice',{token,remove:true});await m.deleteToken();
 };
 window.egySignOut=async()=>{try{await egyRemovePush();}catch{ /* Device permissions can also be revoked through OS settings. */ }finally{await auth.signOut();}};
 window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
})();
