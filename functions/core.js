'use strict';
const {HttpsError}=require('firebase-functions/v2/https');
const {getFirestore,FieldValue,Timestamp}=require('firebase-admin/firestore');
const {createHash}=require('node:crypto');
const hash=s=>createHash('sha256').update(s).digest('hex');
const db=()=>getFirestore();
const options={region:'europe-west1',enforceAppCheck:true,maxInstances:10,timeoutSeconds:60,memory:'256MiB'};
function invalid(message){throw new HttpsError('invalid-argument',message);}
function validate(fn){try{return fn();}catch(e){if(e instanceof HttpsError)throw e;invalid(e.message);}}
function object(value){if(!value||typeof value!=='object'||Array.isArray(value))invalid('Expected an object');return value;}
function requestKey(value){if(typeof value!=='string'||!/^[A-Za-z0-9_-]{20,100}$/.test(value))invalid('A valid request ID is required');return value;}
function documentId(value){if(typeof value!=='string'||!value||value.length>128||value.includes('/')||/[\u0000-\u001f]/.test(value)||value==='.'||value==='..')invalid('Invalid document ID');return value;}
async function admin(r){
 if(!r.auth||r.auth.token.admin!==true)throw new HttpsError('permission-denied','Admin access required');
 const s=await db().doc('_admins/'+r.auth.uid).get(), role=s.data();
 if(!s.exists||role.active!==true||Number(r.auth.token.auth_time||0)<Number(role.minAuthTime||0))throw new HttpsError('permission-denied','Admin access has expired or been revoked. Sign in again.');
 if(Date.now()/1000>Number(r.auth.token.auth_time||0)+Number(role.maxSessionSeconds||43200))throw new HttpsError('permission-denied','Session expired. Sign in again.');
 if(role.requireMfa && r.auth.token.firebase?.sign_in_second_factor!=='totp')throw new HttpsError('permission-denied','Authenticator verification is required.');
 return r.auth.uid;
}
async function rate(key,kind,max,windowSeconds=3600){
 const bucket=Math.floor(Date.now()/(windowSeconds*1000)),ref=db().doc('_rateLimits/'+hash(kind+':'+key+':'+bucket));
 await db().runTransaction(async tx=>{const s=await tx.get(ref),count=s.data()?.count||0;if(count>=max)throw new HttpsError('resource-exhausted','Too many requests. Please try again later.');tx.set(ref,{count:count+1,expiresAt:Timestamp.fromMillis((bucket+2)*windowSeconds*1000)});});
}
function audit(tx,uid,action,target){tx.create(db().collection('_audit').doc(),{uid,action,target,at:FieldValue.serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+30*86400000)});}
async function boundedFetch(url,options={},limit=1500000){
 const res=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(20000)});
 const reader=res.body?.getReader();let text='',bytes=0;const decoder=new TextDecoder();
 if(reader)try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>limit)throw Error('Provider response exceeded limit');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel().catch(()=>{});}
 return {ok:res.ok,status:res.status,text,json:()=>JSON.parse(text)};
}
module.exports={db,hash,options,invalid,validate,object,requestKey,documentId,admin,rate,audit,boundedFetch,FieldValue,Timestamp,HttpsError};
