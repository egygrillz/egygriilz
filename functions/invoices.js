'use strict';
const c=require('./core'),v=require('./validation');
const money=value=>{if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1e9)c.invalid('Invalid money amount');return Math.round(value*100)/100;};
function normalize(input){
 c.object(input);if(!Array.isArray(input.items)||!input.items.length||input.items.length>100)c.invalid('Invoice requires 1–100 items');
 const items=input.items.map((i,index)=>{c.object(i);if(typeof i.qty!=='number'||!Number.isFinite(i.qty)||i.qty<=0||i.qty>10000)c.invalid('Invalid quantity');return {id:index+1,name:c.validate(()=>v.text(i.name,200)),qty:i.qty,price:money(i.price)};});
 const subtotal=money(items.reduce((n,i)=>n+Math.round(i.qty*i.price*100)/100,0)),discount=money(input.discount||0);
 if(discount>subtotal)c.invalid('Discount exceeds subtotal');const total=money(subtotal-discount);
 const status=input.status||'pending';if(!['pending','partial','paid'].includes(status))c.invalid('Invalid invoice status');
 const deposit=status==='paid'?total:money(input.deposit||0);if(deposit>total)c.invalid('Deposit exceeds total');
 if(status==='partial'&&!(deposit>0&&deposit<total))c.invalid('Partial payment needs a deposit below the total');
 const record=c.validate(()=>({date:v.date(input.date),due:input.due?v.date(input.due):'',notes:v.text(input.notes||'',4000,false),clientId:v.text(String(input.clientId||''),128),clientName:v.text(input.clientName,100),clientPhone:v.text(input.clientPhone||'',30,false),clientEmail:v.text(input.clientEmail||'',254,false),paymentMethod:v.text(input.paymentMethod||'Cash',40)}));
 if(record.clientEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.clientEmail))c.invalid('Invalid client email');
 if(input.legacyNumber)record.legacyNumber=c.validate(()=>v.text(input.legacyNumber,100,false));
 return {...record,items,subtotal,discount,total,deposit,remaining:money(total-deposit),status};
}
async function execute(uid,data){
 c.object(data);
 if(data.action==='list'){
  let q=c.db().collection('invoices').orderBy('__name__').limit(101);
  if(data.cursor)q=q.startAfter(c.documentId(data.cursor));
  const snap=await q.get(),docs=snap.docs.slice(0,100);
  return {items:docs.map(d=>({...d.data(),id:d.id})),cursor:snap.size>100?docs[docs.length-1].id:null};
 }
 if(!['save','delete'].includes(data.action))c.invalid('Unknown invoice action');
 const creating=data.action==='save'&&!data.id;
 const id=creating?c.hash(uid+':invoice:'+c.requestKey(data.requestId)):c.documentId(data.id);
 const clean=data.action==='save'?normalize(data.invoice):null,ref=c.db().doc('invoices/'+id),counter=c.db().doc('_counters/invoices'),receipt=c.db().doc('_requests/invoice-'+id);
 return c.db().runTransaction(async tx=>{
  const oldDoc=await tx.get(ref),old=oldDoc.data();
  if(creating){const prior=await tx.get(receipt);if(prior.exists&&!old)throw new c.HttpsError('failed-precondition','This invoice request was already processed and its invoice was deleted. Start a new invoice.');}
  if(creating&&old){if(old.creationHash!==c.hash(JSON.stringify(clean)))throw new c.HttpsError('already-exists','Invoice request ID already used');return {...old,id};}
  if(!creating&&!old)throw new c.HttpsError('not-found','Invoice was deleted');
  if(!creating&&data.version!==old.version)throw new c.HttpsError('aborted','Invoice changed on another device. Reload before saving.');
  if(data.action==='delete'){tx.delete(ref);c.audit(tx,uid,'invoice:delete',id);return {id,deleted:true};}
  let number=old?.number;
  if(creating){const sequence=await tx.get(counter),next=(sequence.data()?.value||0)+1;number='EGY-'+String(next).padStart(6,'0');tx.set(counter,{value:next});}
  const record={...clean,number,version:(old?.version||0)+1,createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),createdBy:old?.createdBy||uid,updatedBy:uid,creationHash:old?.creationHash||c.hash(JSON.stringify(clean))};
  tx.set(ref,record);if(creating)tx.create(receipt,{invoiceId:id,expiresAt:c.Timestamp.fromMillis(Date.now()+30*86400000)});c.audit(tx,uid,creating?'invoice:create':'invoice:update',id);return {...record,id};
 });
}
module.exports={execute,normalize};
