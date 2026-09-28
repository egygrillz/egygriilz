const {test}=require('node:test');const assert=require('node:assert/strict');const v=require('../functions/validation');
const sample={name:'Test',phone:'+201234567890',email:'a@example.com',notes:'',service:'Silver',date:'2026-09-28',time:'04:00 PM'};
const schedule={openDays:[1],openHour:16,closeHour:22,slotDuration:60,holidays:[]};
test('valid payload preserves business schema and discards injected status',()=>{assert.deepEqual(v.booking({...sample,status:'cancelled',admin:true}),sample);});
test('reject invalid dates and impossible times',()=>{for(const d of ['2026-02-30','bad','2026-13-01'])assert.throws(()=>v.date(d));for(const t of ['25:00 PM','00:30 AM','04:99 PM'])assert.throws(()=>v.minutes(t));});
test('phone, email, length and type validation',()=>{for(const patch of [{name:'x'.repeat(101)},{phone:'abc'},{email:'a@'},{notes:{}},{name:[]}])assert.throws(()=>v.booking({...sample,...patch}));});
test('Cairo timezone, future slot and one hour lead',()=>{assert.equal(v.cairoNow(new Date('2026-09-28T12:00:00Z')).minute,15*60);assert.throws(()=>v.checkSlot(sample,schedule,new Date('2026-09-28T12:00:00Z')));assert.doesNotThrow(()=>v.checkSlot(sample,schedule,new Date('2026-09-28T11:00:00Z')));});
test('closed days, holidays, off-grid and closing time rejected',()=>{const now=new Date('2026-09-27T09:00:00Z');for(const s of [{...schedule,openDays:[]},{...schedule,holidays:[{date:sample.date,note:'private'}]}])assert.throws(()=>v.checkSlot(sample,s,now));for(const time of ['03:00 PM','04:30 PM','10:00 PM'])assert.throws(()=>v.checkSlot({...sample,time},schedule,now));});
test('midnight closing is supported, date horizon enforced',()=>{assert.doesNotThrow(()=>v.checkSlot({...sample,time:'11:00 PM'},{...schedule,closeHour:0},new Date('2026-09-27T09:00:00Z')));assert.throws(()=>v.checkSlot({...sample,date:'2030-09-28'},schedule,new Date('2026-09-27T09:00:00Z')));});

test('legacy time formats normalize without changing the booked minute',()=>{assert.equal(v.booking({...sample,time:'16:00'}).time,'04:00 PM');assert.equal(v.minutes('4:00 pm'),16*60);});
