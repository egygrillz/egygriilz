'use strict';
const c=require('./core'),v=require('./validation');
const defaults={openDays:[0,1,2,3,4,6],openHour:16,closeHour:22,slotDuration:60,holidays:[]};
function projectedSchedule(raw){
 const s={...defaults,...raw};
 const days=Array.isArray(s.openDays)?s.openDays.map(Number):[],open=Number(s.openHour),close=Number(s.closeHour),step=Number(s.slotDuration);
 if(!Array.isArray(s.openDays)||days.some(d=>!Number.isInteger(d)||d<0||d>6)||!Number.isInteger(open)||open<0||open>23||!Number.isInteger(close)||close<0||close>24||(close!==0&&close<=open)||![15,30,60,90,120].includes(step)||!Array.isArray(s.holidays)||s.holidays.length>366)throw new c.HttpsError('failed-precondition','Studio hours require review. Contact the studio.');
 return {openDays:days,openHour:open,closeHour:close,slotDuration:step,holidays:s.holidays.map(x=>typeof x==='string'?x:x?.date).filter(x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x))};
}
function job(tx,id,channel,payload){tx.create(c.db().doc('_outbox/'+id+'-'+channel),{channel,payload,status:'pending',attempts:0,nextAttemptAt:c.Timestamp.now(),createdAt:c.FieldValue.serverTimestamp(),expiresAt:c.Timestamp.fromMillis(Date.now()+30*86400000)});}
async function availability(data){
 c.object(data);const start=c.validate(()=>v.date(data.start)),end=c.validate(()=>v.date(data.end));
 if(end<start||Date.parse(end)-Date.parse(start)>42*86400000)c.invalid('Availability window must be 42 days or less');
 const s=await c.db().doc('settings/schedule').get();
 const snap=await c.db().collection('appointments').where('date','>=',start).where('date','<=',end).orderBy('date').limit(6001).get();
 if(snap.size>6000)throw new c.HttpsError('resource-exhausted','Too many bookings in this range. Use a shorter range.');
 const safe=projectedSchedule(s.data()),taken=Object.create(null);
 for(const d of snap.docs){const a=d.data();if(a.status==='cancelled')continue;
  let begin;try{begin=v.minutes(a.time);}catch{throw new c.HttpsError('failed-precondition','The studio schedule requires review. Please contact the studio.');}
  const duration=Number(a.durationMinutes)||60;
  for(let t=Number(safe.openHour)*60;t<(Number(safe.closeHour)||24)*60;t+=Number(safe.slotDuration))if(t<begin+duration&&begin<t+Number(safe.slotDuration))(taken[a.date]??=[]).push(v.timeLabel(t));
 }

 return {schedule:projectedSchedule(s.data()),taken};
}
async function mutate({mode,id,input={},uid,requestId,expectedVersion}){
 c.object(input);const isPublic=!uid;
 if(!['create','update','delete'].includes(mode))c.invalid('Invalid operation');
 if(mode==='create')id=c.hash((uid||'public')+':'+c.requestKey(requestId));else c.documentId(id);
 const ref=c.db().doc('appointments/'+id),receipt=c.db().doc('_requests/'+id);
 const publicData=isPublic?c.validate(()=>v.booking(input)):null;
 if(publicData&&!publicData.service.split(',').map(x=>x.trim()).every(x=>['Impression','Consultation','Pickup','Toothgem Application'].includes(x)))c.invalid('Choose a listed booking service.');
 const fingerprint=mode==='create'?c.hash(JSON.stringify(publicData||c.validate(()=>v.booking(input)))):null;
 if(isPublic&&input.consent!==true)c.invalid('You must accept the booking terms.');
 return c.db().runTransaction(async tx=>{
  const oldDoc=await tx.get(ref),old=oldDoc.data();
  if(mode==='create'){const prior=await tx.get(receipt);if(prior.exists){if(prior.data().fingerprint!==fingerprint)throw new c.HttpsError('already-exists','This request ID was already used.');return {...prior.data().result,replayed:true};}}
  if(mode==='create'&&old){if(isPublic&&old.requestHash!==fingerprint)throw new c.HttpsError('already-exists','This request ID was already used. Start a new booking.');return {id,version:old.version||0,replayed:true};}
  if(mode!=='create'&&!old)throw new c.HttpsError('not-found','Appointment no longer exists');
  if(mode!=='create'&&(!Number.isInteger(expectedVersion)||expectedVersion!==(old.version||0)))throw new c.HttpsError('aborted','This appointment changed on another device. Refresh before saving.');
  const combined=mode==='delete'?old:{...old,...input};
  const clean=mode==='delete'?null:c.validate(()=>v.booking(combined));
  const status=isPublic?'pending':combined.status||'confirmed';
  if(mode!=='delete'&&!['confirmed','pending','cancelled','completed'].includes(status))c.invalid('Invalid booking status');
  const showedUp=isPublic?null:combined.showedUp??null;
  if(mode!=='delete'&&showedUp!==null&&typeof showedUp!=='boolean')c.invalid('Invalid attendance value');
  const dates=[...new Set([old?.date,clean?.date].filter(d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
  const locks=dates.map(d=>c.db().doc('_bookingDays/'+d));for(const lock of locks)await tx.get(lock);
  let duration=Number(old?.durationMinutes)||60;
  const moving=clean&&(!old||old.date!==clean.date||old.time!==clean.time||(old.status==='cancelled'&&status!=='cancelled'));
  if(mode!=='delete'&&moving&&status!=='cancelled'){
   const settings=await tx.get(c.db().doc('settings/schedule'));
   const schedule=projectedSchedule(settings.data());if(!old)duration=Number(schedule.slotDuration);
   if(isPublic){c.validate(()=>v.checkSlot(clean,schedule));if(v.minutes(clean.time)+duration>(Number(schedule.closeHour)||24)*60)c.invalid('Appointment would finish after closing time');}
   if(v.minutes(clean.time)+duration>1440)c.invalid('Appointments cannot span midnight');
   const conflicts=await tx.get(c.db().collection('appointments').where('date','==',clean.date));
   if(conflicts.docs.some(d=>{if(d.id===id||d.data().status==='cancelled')return false;let start;try{start=v.minutes(d.data().time);}catch{throw new c.HttpsError('failed-precondition','Existing schedule data needs review');}const proposed=v.minutes(clean.time);return proposed<start+(Number(d.data().durationMinutes)||60)&&start<proposed+duration;}))throw new c.HttpsError('already-exists','That appointment time has been taken. Choose another.');
  }
  let clientRef,client;if(mode==='create'){clientRef=c.db().doc('clients/'+clean.phone.replace(/\D/g,''));client=await tx.get(clientRef);}
  for(const lock of locks)tx.set(lock,{updatedAt:c.FieldValue.serverTimestamp()});
  if(mode==='delete')tx.delete(ref);else{
   const record={...old,...clean,status,showedUp,durationMinutes:duration,version:(old?.version||0)+1,createdAt:old?.createdAt||c.FieldValue.serverTimestamp(),updatedAt:c.FieldValue.serverTimestamp()};
   if(isPublic){record.requestHash=fingerprint;record.consentAt=c.FieldValue.serverTimestamp();record.termsVersion='2026-09';}
   if(uid&&input.price!==undefined)record.price=c.validate(()=>v.text(String(input.price),30,false));
   tx.set(ref,record);
  }
  if(clientRef){
   const stats={totalAppointments:c.FieldValue.increment(1),services:c.FieldValue.arrayUnion(...clean.service.split(', ').filter(Boolean))};
   if(!client.exists)Object.assign(stats,{name:clean.name,phone:clean.phone,email:clean.email,firstVisit:clean.date,lastVisit:clean.date,totalNoShows:0,notes:'',version:1,createdAt:c.FieldValue.serverTimestamp()});
   else stats.lastVisit=String(client.data().lastVisit||'')>clean.date?client.data().lastVisit:clean.date;
   tx.set(clientRef,stats,{merge:true});
  }
  if(mode==='create'&&isPublic){
   job(tx,id,'push',{bookingId:id});
   if(clean.email)job(tx,id,'email',{...clean,bookingId:id});
   job(tx,id,'whatsapp',{bookingId:id,date:clean.date,time:clean.time});
  }
  if(mode==='create')tx.create(receipt,{fingerprint,result:{id,version:1},expiresAt:c.Timestamp.fromMillis(Date.now()+30*86400000)});
  c.audit(tx,uid||'public','booking:'+mode,id);
  return {id,version:mode==='delete'?null:(old?.version||0)+1};
 });
}
async function contact(data){
 c.object(data);const key=c.requestKey(data.requestId);
 const input=c.validate(()=>({name:v.text(data.name,100),email:v.text(data.email,254),message:v.text(data.message,4000)}));
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))c.invalid('Invalid email address');
 const ref=c.db().doc('messages/'+c.hash('contact:'+key)),fingerprint=c.hash(JSON.stringify(input));
 await c.db().runTransaction(async tx=>{const old=await tx.get(ref);if(old.exists){if(old.data().requestHash!==fingerprint)throw new c.HttpsError('already-exists','Request ID already used');return;}tx.create(ref,{...input,requestHash:fingerprint,read:false,createdAt:c.FieldValue.serverTimestamp()});job(tx,ref.id,'whatsapp',{messageId:ref.id});});return {ok:true};
}
module.exports={availability,mutate,contact,projectedSchedule,job};
