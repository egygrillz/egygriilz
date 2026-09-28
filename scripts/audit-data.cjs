// READ-ONLY data integrity audit. Run locally with ADC. Reports never go into the repo.
const path=require('node:path'),fs=require('node:fs');const fromFunctions=require('node:module').createRequire(path.resolve(__dirname,'../functions/index.js'));
const {initializeApp,applicationDefault}=fromFunctions('firebase-admin/app'),{getFirestore}=fromFunctions('firebase-admin/firestore');
const v=require('../functions/validation');const project=process.argv[2];
if(!project||![process.env.EGY_STAGING_PROJECT,'egygrillz-studio'].filter(Boolean).includes(project)){console.error('Specify egygrillz-studio, or explicitly set EGY_STAGING_PROJECT for a staging audit.');process.exit(1);}
initializeApp({projectId:project,credential:applicationDefault()});const db=getFirestore();
(async()=>{
 const issues=[],slots=new Map(),phones=new Map();let checked=0;
 for(const collection of ['appointments','clients']){
  let cursor;
  do{let query=db.collection(collection).orderBy('__name__').limit(500);if(cursor)query=query.startAfter(cursor);const page=await query.get();cursor=page.size===500?page.docs.at(-1):null;
   for(const doc of page.docs){checked++;const d=doc.data(),ref=collection+'/'+doc.id;
    if(!/^[\w-]{1,128}$/.test(doc.id))issues.push({ref,issue:'Legacy tool excludes unusual document IDs; inspect manually.'});
    if(collection==='appointments'){
     try{v.booking(d);}catch(e){issues.push({ref,issue:'Invalid appointment schema: '+e.message});continue;}
     if(!['pending','confirmed','cancelled','completed'].includes(d.status))issues.push({ref,issue:'Missing or invalid status.'});
     if(!Number.isFinite(d.durationMinutes)||d.durationMinutes<=0||d.durationMinutes>120)issues.push({ref,issue:'Duration missing/invalid. New code conservatively assumes 60 minutes for legacy records. Confirm real duration before launch.'});
     if(d.status!=='cancelled'){const list=slots.get(d.date)||[];const start=v.minutes(d.time),end=start+(Number(d.durationMinutes)||60);for(const old of list)if(start<old.end&&old.start<end)issues.push({ref,issue:'Overlaps '+old.ref});list.push({ref,start,end});slots.set(d.date,list);}
    }else{
     if(typeof d.name!=='string'||typeof d.phone!=='string'||!Array.isArray(d.services||[]))issues.push({ref,issue:'Malformed client fields.'});
     const phone=String(d.phone||'').replace(/\D/g,'');if(phone){if(phones.has(phone))issues.push({ref,issue:'Duplicate phone also appears in '+phones.get(phone)});phones.set(phone,ref);}
    }
   }
  }while(cursor);
 }
 try{const settings=await db.doc('settings/schedule').get();require('../functions/bookings').projectedSchedule(settings.data());}catch(e){issues.push({ref:'settings/schedule',issue:e.message});}
 fs.mkdirSync('.private',{recursive:true,mode:0o700});fs.writeFileSync('.private/data-audit.json',JSON.stringify({project,at:new Date().toISOString(),checked,issues},null,2),{mode:0o600});
 console.log('Checked '+checked+' records; '+issues.length+' issues. Read .private/data-audit.json locally. Do not upload it. No data was changed.');if(issues.length)process.exitCode=2;
})().catch(e=>{console.error(e.message);process.exitCode=1;});
