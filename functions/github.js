'use strict';
const c=require('./core');
function validateRequest(input){
 c.object(input);const method=input.method||'GET';if(!['GET','PUT','DELETE'].includes(method))c.invalid('Unsupported publishing operation');
 if(typeof input.path!=='string'||!input.path.startsWith('contents/')||input.path.length>500||/[#%\\\u0000-\u001f]/.test(input.path))c.invalid('Invalid repository path');
 const [rawFile,query,...extra]=input.path.slice(9).split('?');if(extra.length||(query&&!/^ref=[\w.-]+$/.test(query)))c.invalid('Invalid repository query');
 const parts=rawFile.split('/');if(parts.some(s=>!s||s==='.'||s==='..'))c.invalid('Invalid repository path');
 const folders=['assets/images/','sets/','golds/','silvers/','diamonds/','latest-designs/','logo/','materials/','plating/','levels/'];
 const allowed=folders.some(f=>rawFile.startsWith(f))||/^[\w-]+\.html$/.test(rawFile);
 if(!allowed||/^(admin|editx|invoice|staff-panel-x7k2|MTC)\.html$/i.test(rawFile))throw new c.HttpsError('permission-denied','Security-sensitive pages require a reviewed deployment');
 let body;if(method!=='GET'){
  const b=c.object(input.body);if(typeof b.message!=='string'||b.message.length>200)c.invalid('Invalid commit message');
  body={message:b.message};if(b.sha!==undefined){if(typeof b.sha!=='string'||! /^[a-f\d]{40,64}$/.test(b.sha))c.invalid('Invalid file version');body.sha=b.sha;}
  if(method==='DELETE'&&!body.sha)c.invalid('File version required for deletion');
  if(method==='PUT'){if(typeof b.content!=='string'||b.content.length>11*1024*1024||b.content.length%4!==0||Buffer.from(b.content,'base64').toString('base64')!==b.content)c.invalid('Invalid content or upload exceeds 8 MB. Use a reviewed repository upload for larger files.');body.content=b.content;}
 }
 return {file:rawFile,path:parts.map(encodeURIComponent).join('/'),method,body};
}
async function execute(uid,input,config){
 const p=validateRequest(input);await c.rate(uid,'github',240);
 const branch=config.branch;if(!/^[\w./-]{1,100}$/.test(branch))throw new c.HttpsError('failed-precondition','Invalid publishing configuration');
 const url=`https://api.github.com/repos/${config.owner}/${config.repo}/contents/${p.path}`+(p.method==='GET'?'?ref='+encodeURIComponent(branch):'');
 const audit=c.db().collection('_audit').doc();await audit.set({uid,action:'github:'+p.method,target:p.file,status:'started',at:c.FieldValue.serverTimestamp(),expiresAt:c.Timestamp.fromMillis(Date.now()+30*86400000)});
 const result=await c.boundedFetch(url,{method:p.method,headers:{Authorization:'Bearer '+config.token,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},body:p.body?JSON.stringify({...p.body,branch}):undefined},2500000);
 await audit.update({status:result.ok?'succeeded':'failed',httpStatus:result.status});
 if(result.status===404)throw new c.HttpsError('not-found','Repository file not found');
 if([409,422].includes(result.status))throw new c.HttpsError('aborted','The repository changed. Reload this item before publishing again.');
 if(!result.ok)throw new c.HttpsError('unavailable','Repository publishing is unavailable ('+result.status+').');
 return result.json();
}
module.exports={execute,validateRequest};
