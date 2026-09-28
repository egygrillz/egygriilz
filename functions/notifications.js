'use strict';
const c=require('./core');
const {getMessaging}=require('firebase-admin/messaging');
const {getAuth}=require('firebase-admin/auth');
const esc=s=>String(s||'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
class DeliveryError extends Error{constructor(code){super(code);this.code=code;}}
async function push(jobId,payload){
 let cursor;const users=new Map();let failed=false;
 do{
  let q=c.db().collection('_pushDevices').orderBy('__name__').limit(100);if(cursor)q=q.startAfter(cursor);
  const batch=await q.get();cursor=batch.size===100?batch.docs.at(-1).id:null;
  for(const d of batch.docs){
   const device=d.data(),receipt=c.db().doc('_pushReceipts/'+c.hash(jobId+':'+d.id));if((await receipt.get()).exists)continue;
   if(!users.has(device.uid)){
    const role=await c.db().doc('_admins/'+device.uid).get();let allowed=role.data()?.active===true;
    if(allowed){try{const u=await getAuth().getUser(device.uid);allowed=!u.disabled&&u.customClaims?.admin===true;}catch(e){if(e.code==='auth/user-not-found')allowed=false;else throw new DeliveryError('push-auth-temporary');}}
    users.set(device.uid,allowed);
   }
   if(!users.get(device.uid)||!device.updatedAt||device.updatedAt.toMillis()<Date.now()-90*86400000){await d.ref.delete();continue;}
   try{await getMessaging().send({token:device.token,data:{tag:'booking-'+payload.bookingId},webpush:{headers:{TTL:'3600'}}});await receipt.set({expiresAt:c.Timestamp.fromMillis(Date.now()+30*86400000)});}
   catch(e){if(['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(e.code))await d.ref.delete();else failed=true;}
  }
 }while(cursor);
 if(failed)throw new DeliveryError('push-transient-failure');
}
async function deliver(jobId,job,config){
 const p=job.payload;
 if(job.channel==='push')return push(jobId,p);
 if(job.channel==='email'){
  const result=await c.boundedFetch('https://api.emailjs.com/api/v1.0/email/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({service_id:config.emailService,template_id:config.emailTemplate,user_id:config.emailPublicKey,accessToken:config.emailPrivateKey,template_params:{to_name:esc(p.name),to_email:p.email,service:esc(p.service),date:p.date,time:p.time,notes:esc(p.notes||'None'),booking_reference:p.bookingId}})},65536);
  if(!result.ok||!['OK','"OK"'].includes(result.text.trim()))throw new DeliveryError('emailjs-http-'+result.status);
  return;
 }
 if(job.channel==='whatsapp'){
  const text=p.messageId?'New EGYGRILLZ contact message. Open https://egygrillz.com/editx.html':`New EGYGRILLZ appointment: ${p.date} at ${p.time}. Open https://egygrillz.com/admin.html`;
  const url=new URL('https://api.callmebot.com/whatsapp.php');url.search=new URLSearchParams({phone:config.whatsappPhone,text,apikey:config.whatsappKey}).toString();
  const result=await c.boundedFetch(url,{method:'GET'},65536);
  const plain=result.text.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<[^>]*>/g,' ');
  if(!result.ok||/error\s*:|invalid api|not authorized|not activated|failed to send/i.test(plain)||!/(sent|queued)/i.test(plain))throw new DeliveryError('callmebot-http-'+result.status);
  return;
 }
 throw new DeliveryError('unsupported-channel');
}
async function processJob(id,config,sender=deliver){
 const ref=c.db().doc('_outbox/'+id),leaseId=require('node:crypto').randomUUID();
 let providerDelay=0;
 const job=await c.db().runTransaction(async tx=>{
  const s=await tx.get(ref),j=s.data();if(!j||['sent','dead'].includes(j.status)||!j.nextAttemptAt||j.nextAttemptAt.toMillis()>Date.now())return null;
  if(j.attempts>=8){tx.update(ref,{status:'dead',nextAttemptAt:c.FieldValue.delete()});return null;}
  if(['email','whatsapp'].includes(j.channel)){const pace=c.db().doc('_providerWindows/'+j.channel);const window=await tx.get(pace);const next=Math.max(Date.now(),window.data()?.nextAt?.toMillis()||0);providerDelay=next-Date.now();if(providerDelay>30000){tx.update(ref,{nextAttemptAt:c.Timestamp.fromMillis(next)});return null;}tx.set(pace,{nextAt:c.Timestamp.fromMillis(next+(j.channel==='email'?1250:6000))});}
  tx.update(ref,{status:'running',leaseId,attempts:j.attempts+1,nextAttemptAt:c.Timestamp.fromMillis(Date.now()+10*60000)});return {...j,attempts:j.attempts+1};
 });
 if(!job)return {skipped:true};let error;
 try{if(providerDelay>0)await require('node:timers/promises').setTimeout(providerDelay);await sender(id,job,config);}catch(e){error=e instanceof DeliveryError?e.code:'provider-unavailable';}
 await c.db().runTransaction(async tx=>{const s=await tx.get(ref);if(s.data()?.leaseId!==leaseId)return;
  if(!error)tx.update(ref,{status:'sent',sentAt:c.FieldValue.serverTimestamp(),nextAttemptAt:c.FieldValue.delete(),payload:c.FieldValue.delete(),leaseId:c.FieldValue.delete(),lastErrorCode:c.FieldValue.delete()});
  else tx.update(ref,{status:job.attempts>=8?'dead':'pending',lastErrorCode:error,nextAttemptAt:job.attempts>=8?c.FieldValue.delete():c.Timestamp.fromMillis(Date.now()+Math.min(3600,60*2**job.attempts)*1000),leaseId:c.FieldValue.delete()});
 });
 return {sent:!error,error};
}
async function drain(config){const jobs=await c.db().collection('_outbox').where('nextAttemptAt','<=',c.Timestamp.now()).orderBy('nextAttemptAt').limit(20).get();for(const d of jobs.docs)await processJob(d.id,config);}
module.exports={deliver,processJob,drain,DeliveryError};
