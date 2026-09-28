'use strict';
const {initializeApp}=require('firebase-admin/app');initializeApp();
const {onCall}=require('firebase-functions/v2/https');
const {onDocumentCreated,onDocumentWrittenWithAuthContext}=require('firebase-functions/v2/firestore');
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {defineSecret,defineString}=require('firebase-functions/params');
require('firebase-functions/v2/options').setGlobalOptions({serviceAccount:defineString('STUDIO_RUNTIME_SERVICE_ACCOUNT',{default:'studio-runtime@egygrillz-studio.iam.gserviceaccount.com'})});
const c=require('./core'),booking=require('./bookings'),invoice=require('./invoices'),github=require('./github'),notifications=require('./notifications');
const GITHUB_TOKEN=defineSecret('GITHUB_TOKEN'),RATE_SALT=defineSecret('RATE_SALT');
const EMAILJS_PUBLIC_KEY=defineSecret('EMAILJS_PUBLIC_KEY'),EMAILJS_PRIVATE_KEY=defineSecret('EMAILJS_PRIVATE_KEY'),CALLMEBOT_API_KEY=defineSecret('CALLMEBOT_API_KEY'),CALLMEBOT_PHONE=defineSecret('CALLMEBOT_PHONE');
const EMAILJS_SERVICE=defineString('EMAILJS_SERVICE',{default:'service_r8fhuah'}),EMAILJS_TEMPLATE=defineString('EMAILJS_TEMPLATE',{default:'template_d2twd6h'});
const GITHUB_OWNER=defineString('GITHUB_OWNER',{default:'egygrillz'}),GITHUB_REPO=defineString('GITHUB_REPO',{default:'egygriilz'}),GITHUB_BRANCH=defineString('GITHUB_BRANCH',{default:'main'});
const notifySecrets=[EMAILJS_PUBLIC_KEY,EMAILJS_PRIVATE_KEY,CALLMEBOT_API_KEY,CALLMEBOT_PHONE];
const notifyConfig=()=>({emailService:EMAILJS_SERVICE.value(),emailTemplate:EMAILJS_TEMPLATE.value(),emailPublicKey:EMAILJS_PUBLIC_KEY.value(),emailPrivateKey:EMAILJS_PRIVATE_KEY.value(),whatsappPhone:CALLMEBOT_PHONE.value(),whatsappKey:CALLMEBOT_API_KEY.value()});
const publicRate=(r,kind,max)=>c.rate(c.hash(RATE_SALT.value()+':'+(r.rawRequest.ip||'unknown')),kind,max);
exports.availability=onCall({...c.options,secrets:[RATE_SALT]},async r=>{await publicRate(r,'availability',240);return booking.availability(r.data);});
exports.createBooking=onCall({...c.options,secrets:[RATE_SALT]},async r=>{await publicRate(r,'booking',12);const data=c.object(r.data);return booking.mutate({mode:'create',input:data,requestId:data.requestId});});
exports.contactMessage=onCall({...c.options,secrets:[RATE_SALT]},async r=>{await publicRate(r,'contact',6);return booking.contact(r.data);});
exports.appointmentAdmin=onCall(c.options,async r=>{const uid=await c.admin(r);await c.rate(uid,'appointment-admin',500);const d=c.object(r.data);return booking.mutate({uid,mode:d.mode,id:d.id,input:d.data,requestId:d.requestId,expectedVersion:d.version});});
exports.invoiceAdmin=onCall(c.options,async r=>{const uid=await c.admin(r);await c.rate(uid,'invoice-admin',300);return invoice.execute(uid,r.data);});
exports.githubAdmin=onCall({...c.options,secrets:[GITHUB_TOKEN]},async r=>{const uid=await c.admin(r);return github.execute(uid,r.data,{token:GITHUB_TOKEN.value(),owner:GITHUB_OWNER.value(),repo:GITHUB_REPO.value(),branch:GITHUB_BRANCH.value()});});
exports.adminSummary=onCall(c.options,async r=>{
 const uid=await c.admin(r);await c.rate(uid,'summary',180);const today=require('./validation').cairoNow().date;
 const [daily,upcoming,messages]=await Promise.all([c.db().collection('appointments').where('date','==',today).get(),c.db().collection('appointments').where('date','>',today).where('status','in',['confirmed','pending','completed']).count().get(),c.db().collection('messages').where('read','==',false).count().get()]);
 const active=daily.docs.map(d=>d.data()).filter(a=>a.status!=='cancelled');return {today:active.length,arrived:active.filter(a=>a.showedUp===true).length,upcoming:upcoming.data().count,unread:messages.data().count};
});
exports.pushDevice=onCall(c.options,async r=>{
 const uid=await c.admin(r);await c.rate(uid,'push-device',60);const d=c.object(r.data),token=c.validate(()=>require('./validation').text(d.token,4096));
 const ref=c.db().doc('_pushDevices/'+c.hash(token));
 await c.db().runTransaction(async tx=>{const old=await tx.get(ref);if(d.remove){if(old.data()?.uid===uid)tx.delete(ref);}else tx.set(ref,{uid,token,updatedAt:c.FieldValue.serverTimestamp(),expiresAt:c.Timestamp.fromMillis(Date.now()+90*86400000)});});return {ok:true};
});
exports.notificationAdmin=onCall(c.options,async r=>{
 const uid=await c.admin(r);await c.rate(uid,'notification-admin',120);const d=c.object(r.data);
 if(d.action==='list'){const jobs=await c.db().collection('_outbox').where('status','==','dead').limit(50).get();return {jobs:jobs.docs.map(x=>({id:x.id,channel:x.data().channel,attempts:x.data().attempts,error:x.data().lastErrorCode||'retry-limit'}))};}
 if(d.action!=='retry')c.invalid('Invalid notification operation');const ref=c.db().doc('_outbox/'+c.documentId(d.id));
 await c.db().runTransaction(async tx=>{const old=await tx.get(ref);if(!old.exists||old.data().status!=='dead')throw new c.HttpsError('failed-precondition','Only failed jobs can be retried');tx.update(ref,{status:'pending',attempts:0,nextAttemptAt:c.Timestamp.now()});c.audit(tx,uid,'notification:retry',ref.id);});return {ok:true};
});
exports.deliverNotification=onDocumentCreated({region:c.options.region,document:'_outbox/{id}',maxInstances:5,timeoutSeconds:540,secrets:notifySecrets},event=>notifications.processJob(event.params.id,notifyConfig()));
exports.retryNotifications=onSchedule({region:c.options.region,schedule:'every 1 minutes',maxInstances:1,timeoutSeconds:540,secrets:notifySecrets},()=>notifications.drain(notifyConfig()));

function auditCollection(collection){return onDocumentWrittenWithAuthContext({region:c.options.region,document:collection+'/{id}',maxInstances:5},async event=>{
 const action=!event.data.before.exists?'create':!event.data.after.exists?'delete':'update';
 await c.db().doc('_audit/event-'+c.hash(event.id)).set({uid:event.authId||'system',authType:event.authType||'unknown',action:collection+':'+action,target:event.params.id,at:c.Timestamp.fromDate(new Date(event.time)),expiresAt:c.Timestamp.fromMillis(Date.now()+30*86400000)});
});}
exports.auditClients=auditCollection('clients');exports.auditMessages=auditCollection('messages');exports.auditSchedule=auditCollection('settings');
