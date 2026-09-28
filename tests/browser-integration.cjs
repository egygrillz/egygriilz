/* Exercises the production HTML/JS against Auth + Firestore emulators.
   This local callable adapter verifies emulator ID tokens, then invokes real handlers.
   It does NOT assert real App Check attestation or live provider delivery. Never deployed. */
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('Both emulators are required');
process.env.GCLOUD_PROJECT='demo-egygrillz';process.env.RATE_SALT='test';
const f=require('../functions'),c=require('../functions/core');
const fromFunctions=require('node:module').createRequire(path.resolve('functions/index.js'));const {getAuth}=fromFunctions('firebase-admin/auth');
const {chromium}=require('playwright');
const artifacts=path.resolve('../review/browser');fs.mkdirSync(artifacts,{recursive:true});
const root=path.resolve('.'),uid='browser-owner',email='owner@example.test',password='EmulatorOnly!234';
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.ico':'image/x-icon','.svg':'image/svg+xml'};
let api,site,browser;
(async()=>{
 await getAuth().createUser({uid,email,password});await getAuth().setCustomUserClaims(uid,{admin:true});await c.db().doc('_admins/'+uid).set({active:true,minAuthTime:0});
 await c.db().doc('settings/schedule').set({openDays:[0,1,2,3,4,5,6],openHour:0,closeHour:0,slotDuration:60,holidays:[]});
 api=http.createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:4173');res.setHeader('Access-Control-Allow-Headers','authorization,content-type,x-firebase-appcheck');if(req.method==='OPTIONS'){res.end();return;}
  try{const name=req.url.split('/').at(-1);if(!f[name]?.run)throw new c.HttpsError('not-found','Unknown endpoint');let text='';for await(const b of req){text+=b;if(text.length>1e6)throw Error('too large');}let auth;const token=req.headers.authorization?.split(' ')[1];if(token){const decoded=await getAuth().verifyIdToken(token);auth={uid:decoded.uid,token:decoded};}const result=await f[name].run({data:JSON.parse(text).data,auth,rawRequest:{ip:'browser-tests'}});res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:result}));}
  catch(e){res.statusCode=e.code==='permission-denied'?403:400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:{status:(e.code||'internal').replaceAll('-','_').toUpperCase(),message:e.message}}));}
 }).listen(5001,'127.0.0.1');
 site=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:4173');
  if(url.pathname==='/secure/config.js'){res.setHeader('Content-Type','text/javascript');res.end("window.EGY_CONFIG="+JSON.stringify({firebase:{apiKey:'demo-key',projectId:'demo-egygrillz',authDomain:'localhost',appId:'1:123:web:test',messagingSenderId:'123'},region:'europe-west1',appCheckSiteKey:'emulator-test-only-site-key',vapidKey:'REPLACE_WITH_PUBLIC_VAPID_KEY'})+';');return;}
  if(url.pathname==='/assets/images/golds/golds.json'){res.setHeader('Content-Type','application/json');res.end('["test"]');return;}
  if(url.pathname==='/assets/images/golds/test/info.txt'){res.end('name: <img src=x onerror="window.catalogXss=1">\ndescription: <svg onload="window.catalogXss=1">\nprice: 100 EGP\nimages: broken.jpg');return;}
  const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.statusCode=404;res.end();return;}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');let content=fs.readFileSync(file);
  if(url.pathname==='/secure/api.js')content=content.toString().replace('if(configured)firebase.appCheck(app).activate(EGY_CONFIG.appCheckSiteKey,true);',"firebase.auth().useEmulator('http://127.0.0.1:9099',{disableWarnings:true});firebase.firestore().useEmulator('127.0.0.1',8080);").replace('const functions=app.functions(EGY_CONFIG.region);',"const functions=app.functions(EGY_CONFIG.region);functions.useEmulator('127.0.0.1',5001);");
  if(file.endsWith('.html'))content=content.toString().replace("connect-src 'self'","connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*");
  res.end(content);
 }).listen(4173,'127.0.0.1');
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}}),errors=[];
 await context.route(/https:\/\/(?!127\.0\.0\.1)/,route=>route.fulfill({status:200,body:'',contentType:route.request().resourceType()==='stylesheet'?'text/css':'text/plain'}));
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:4173/admin.html');await p.locator('#login-form').waitFor();assert.equal(await p.locator('#workspace').isVisible(),false);
 await p.locator('#email').fill(email);await p.locator('#password').fill(password);await p.locator('#sign-in').click();await p.locator('#workspace').waitFor({state:'visible'});
 await p.locator('#new-booking').click();await p.locator('#edit-name').fill('Browser customer');await p.locator('#edit-phone').fill('+201666666666');await p.locator('#edit-email').fill('browser@example.test');await p.locator('#edit-service').fill('Gold fitting');await p.locator('#edit-time').fill('16:00');await p.locator('#save-booking').click();await p.locator('#booking-editor').waitFor({state:'hidden'});await p.locator('.booking').filter({hasText:'Browser customer'}).waitFor();
 await p.locator('.booking').filter({hasText:'Browser customer'}).getByRole('button',{name:'Arrived',exact:true}).click();await p.waitForFunction(()=>document.querySelector('#stat-arrived').textContent==='1');
 await p.screenshot({path:path.join(artifacts,'live-admin-desktop.png'),fullPage:true});await p.setViewportSize({width:390,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.screenshot({path:path.join(artifacts,'live-admin-mobile.png'),fullPage:true});
 // Complete an unauthenticated booking through its actual form, not a preview fixture.
 const publicContext=await browser.newContext({viewport:{width:390,height:844}});await publicContext.route(/https:\/\//,route=>route.fulfill({status:200,body:'',contentType:route.request().resourceType()==='stylesheet'?'text/css':'text/plain'}));
 const customer=await publicContext.newPage();customer.on('pageerror',e=>errors.push('public: '+e.message));await customer.goto('http://127.0.0.1:4173/booking.html');
 await customer.locator('.service-option').filter({hasText:'Consultation'}).click();await customer.locator('#step1-next').click();
 const cairoDate=require('../functions/validation').cairoNow().date;const tomorrow=new Date(Date.parse(cairoDate+'T00:00:00Z')+86400000).toISOString().slice(0,10);const target=Number(tomorrow.slice(-2));
 if(Number(tomorrow.slice(5,7))!==(await customer.evaluate(()=>calMonth))+1)await customer.locator('.cal-nav').last().click();
 await customer.locator('.cal-cell:not(.disabled):not(.empty)').filter({hasText:new RegExp('^'+target+'$')}).click();await customer.locator('.time-slot').first().waitFor();await customer.locator('.time-slot').first().click();await customer.locator('#step2-next').click();
 await customer.locator('#f-name').fill('<img src=x onerror="window.customerXss=1">');await customer.locator('#f-phone').fill('+201555555555');await customer.locator('#f-email').fill('public@example.test');await customer.locator('#termsBox').check();await customer.locator('#step3-next').click();assert.equal(await customer.evaluate(()=>window.customerXss),undefined);await customer.locator('#confirm-btn').click();await customer.locator('#step5').waitFor({state:'visible'});
 const created=await c.db().collection('appointments').where('email','==','public@example.test').get();assert.equal(created.size,1);assert.equal(created.docs[0].data().status,'pending');
 // Form submission -> private message in Firestore.
 await customer.goto('http://127.0.0.1:4173/contact.html');await customer.locator('#c-name').fill('Browser enquiry');await customer.locator('#c-email').fill('question@example.test');await customer.locator('#c-message').fill('Please contact me.');await customer.locator('#submit-btn').click();await customer.locator('#success-message').waitFor({state:'visible'});
 // Catalog data cannot execute scripts in the shared website origin.
 await customer.goto('http://127.0.0.1:4173/golds.html');await customer.locator('.set-card').first().waitFor();assert.equal(await customer.evaluate(()=>window.catalogXss),undefined);assert.equal(await customer.locator('[onerror],[onload]').count(),0);
 // Legacy private tools use the same account and registry, and show backend data.
 await p.goto('http://127.0.0.1:4173/editx.html');await p.locator('#app').waitFor({state:'visible'});await p.waitForFunction(()=>typeof window.allAppts!=='undefined');await p.evaluate(()=>showPage('appointments'));await p.locator('#appt-tbody').filter({hasText:'Browser customer'}).waitFor();
 // New cloud invoice reaches the actual invoice page; no localStorage authorization flag is used.
 const inv=await require('../functions/invoices').execute(uid,{action:'save',requestId:'browserinvoice12345678901234567890',invoice:{date:tomorrow,clientId:'201666666666',clientName:'Browser customer',clientEmail:'browser@example.test',items:[{name:'Gold fitting',qty:1,price:1000}],status:'pending',discount:0,deposit:0}});
 await p.goto('http://127.0.0.1:4173/invoice.html');await p.locator('#app').waitFor({state:'visible'});await p.locator('[data-tab="accounting"]').click();await p.locator('#invoices-list-wrap').filter({hasText:inv.number}).waitFor();
 await p.locator('[data-edit="'+inv.id+'"]').click();await p.locator('#discount-val').fill('100');await p.locator('#save-invoice-btn').click();await p.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Saved securely'));assert.equal((await c.db().doc('invoices/'+inv.id).get()).data().total,900);
 const download=p.waitForEvent('download',{timeout:30000});await p.locator('#download-pdf-btn').click();const pdf=await download;await pdf.saveAs(path.join(artifacts,'test-invoice.pdf'));assert.ok(fs.statSync(path.join(artifacts,'test-invoice.pdf')).size>1000);
 const embedded=await context.newPage();await embedded.setContent('<iframe src="http://127.0.0.1:4173/admin.html"></iframe>');await embedded.frameLocator('iframe').getByRole('heading',{name:'Open the studio directly'}).waitFor();assert.equal(await embedded.frameLocator('iframe').locator('#workspace').count(),0);await embedded.close();
 // Revoke membership while a genuine browser session is still active.
 await p.goto('http://127.0.0.1:4173/admin.html');await p.locator('#workspace').waitFor({state:'visible'});await c.db().doc('_admins/'+uid).update({active:false});await p.locator('#workspace').waitFor({state:'hidden'});assert.equal(await p.locator('.booking').count(),0);
 await context.setOffline(true);await p.reload();await p.getByRole('heading',{name:'You’re offline.'}).waitFor();assert.equal(await p.locator('.booking').count(),0);await context.setOffline(false);
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(artifacts,'result.txt'),'PASS: real admin login, creation, attendance, mobile layout, public booking, XSS rendering, contact submission, catalog sanitizer, legacy tools, cloud invoice display, live revocation.\n');console.log('BROWSER INTEGRATION PASS');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(r=>site?site.close(r):r());await new Promise(r=>api?api.close(r):r());});
