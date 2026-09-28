/* Public configuration only. Backend Functions and Firestore enforce authorization. */
(() => {
 const app=firebase.apps.length?firebase.app():firebase.initializeApp(EGY_CONFIG.firebase);
 const configured=!!EGY_CONFIG.appCheckSiteKey&&!EGY_CONFIG.appCheckSiteKey.startsWith('REPLACE_');
 if(configured)firebase.appCheck(app).activate(EGY_CONFIG.appCheckSiteKey,true);
 const functions=app.functions(EGY_CONFIG.region);
 window.egyCall=async(name,data={})=>{
  if(!configured)throw Error('Service setup is incomplete. Please contact the studio.');
  if(!navigator.onLine)throw Error('You are offline. Reconnect before submitting changes.');
  return (await functions.httpsCallable(name,{timeout:60000})(data)).data;
 };
 window.egyRequestId=()=>crypto.randomUUID().replaceAll('-','');
 window.egyCairoNow=()=>{
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
  return {date:`${p.year}-${p.month}-${p.day}`,minute:Number(p.hour)*60+Number(p.minute)};
 };
 const clean=data=>Object.fromEntries(Object.entries(data).filter(([k])=>!['createdAt','updatedAt','id','requestHash','version'].includes(k)));
 const cached=new Map();
 window.egyRememberAppointments=snap=>{snap.forEach(d=>cached.set(d.id,d.data().version||0));};
 async function mutate(id,mode,data){
  if(!cached.has(id)){const s=await firebase.firestore().doc('appointments/'+id).get({source:'server'});if(!s.exists)throw Error('This appointment no longer exists.');cached.set(id,s.data().version||0);}
  const res=await egyCall('appointmentAdmin',{mode,id,data:data?clean(data):{},version:cached.get(id)});if(res.version!==null)cached.set(id,res.version);else cached.delete(id);return res;
 }
 const createKeys=new Map();
 window.appointmentStore={
  add:async data=>{const key=JSON.stringify(clean(data));if(!createKeys.has(key))createKeys.set(key,egyRequestId());const res=await egyCall('appointmentAdmin',{mode:'create',data:clean(data),requestId:createKeys.get(key)});cached.set(res.id,res.version);createKeys.delete(key);return res;},
  doc:id=>({update:data=>mutate(id,'update',data),delete:()=>mutate(id,'delete')})
 };
})();
