/* Cache only a generic offline document. Never cache authenticated data or API responses. */
const OFFLINE_CACHE='egy-studio-offline-v2';
self.addEventListener('install',event=>event.waitUntil(caches.open(OFFLINE_CACHE).then(cache=>cache.add(new Request(new URL('secure/offline.html',self.registration.scope),{cache:'reload'}))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('egy-studio-offline-')&&k!==OFFLINE_CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method==='GET'&&event.request.mode==='navigate'&&/\/(admin|editx|invoice)\.html$/.test(new URL(event.request.url).pathname)){event.respondWith(fetch(new Request(event.request,{cache:'no-store'})).catch(async()=>{const cached=await caches.match(new URL('secure/offline.html',self.registration.scope).href);return cached||new Response('Offline. Reconnect to use the studio.',{status:503,headers:{'Content-Type':'text/plain'}});}));}});
self.addEventListener('push',event=>{
 let payload={};try{payload=event.data.json();}catch{}
 const data=payload.data||{};
 event.waitUntil(self.registration.showNotification('New EGYGRILLZ booking',{
  body:'Open your dashboard to review the appointment.',
  icon:new URL('web-app-manifest-192x192.png',self.registration.scope).href,
  badge:new URL('apple-touch-icon.png',self.registration.scope).href,
  tag:typeof data.tag==='string'?data.tag.slice(0,100):'egygrillz-booking',
  data:{url:new URL('admin.html',self.registration.scope).href}
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const url=new URL('admin.html',self.registration.scope).href;
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
  for(const client of clients){if(new URL(client.url).pathname===new URL(url).pathname){await client.focus();return;}}
  return self.clients.openWindow(url);
 }));
});
