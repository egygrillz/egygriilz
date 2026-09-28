'use strict';
function text(value, max, required = true) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || (required && !value.trim())) throw Error('Invalid text');
  return value.trim();
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) throw Error('Invalid date');
  return value;
}
function minutes(value) {
  if(typeof value!=='string')throw Error('Invalid time');
  let m=/^(0?[1-9]|1[0-2]):([0-5]\d) (AM|PM)$/i.exec(value.trim());
  if(m)return (Number(m[1])%12+(m[3].toUpperCase()==='PM'?12:0))*60+Number(m[2]);
  m=/^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if(m)return Number(m[1])*60+Number(m[2]);
  throw Error('Invalid time');
}
function timeLabel(minute){const h=Math.floor(minute/60);return String(h%12||12).padStart(2,'0')+':'+String(minute%60).padStart(2,'0')+' '+(h>=12?'PM':'AM');}
function cairoNow(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`, minute:Number(parts.hour)*60+Number(parts.minute)};
}
function booking(input) {
  const result = {};
  for (const [key,max,required] of [['name',100,true],['phone',30,true],['email',254,false],['notes',2000,false],['service',300,true]]) result[key]=text(input[key] ?? '',max,required);
  if (!/^\+?[\d\s()-]{7,30}$/.test(result.phone) || (result.phone.replace(/\D/g,'').length < 7 || result.phone.replace(/\D/g,'').length > 15)) throw Error('Invalid phone');
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw Error('Invalid email');
  result.date=date(input.date); result.time=timeLabel(minutes(text(input.time,8)));
  return result;
}
function checkSlot(b, s, now = new Date()) {
  const n=cairoNow(now), m=minutes(b.time);
  const horizon=new Date(now.getTime()+60*86400000).toISOString().slice(0,10);
  if (b.date<n.date || b.date>horizon || (b.date===n.date && m<=n.minute+60)) throw Error('Choose a future appointment with at least one hour notice');
  const day=new Date(b.date+'T12:00:00Z').getUTCDay();
  const holidays=(s.holidays||[]).map(h=>typeof h==='string'?h:h.date);
  const open=Number(s.openHour)*60, close=(Number(s.closeHour)||24)*60, step=Number(s.slotDuration);
  if (!Array.isArray(s.openDays) || !s.openDays.map(Number).includes(day) || holidays.includes(b.date) || !Number.isFinite(open) || !Number.isFinite(close) || !(step>0) || m<open || m>=close || (m-open)%step!==0) throw Error('That slot is not available');
}
module.exports={text,date,minutes,timeLabel,cairoNow,booking,checkSlot};
