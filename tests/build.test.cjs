const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const build=path.resolve('scripts/build-site.cjs');
test('release rejects missing public configuration, excludes private source, preserves support panel bytes',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'egy-build-'));
 try{
  const files=['index.html','admin.html','booking.html','editx.html','invoice.html','staff-panel-x7k2.html','logo/logo_black.png','web-app-manifest-192x192.png','web-app-manifest-512x512.png','assets/images/hero-grillz.jpg','functions/secret.js','scripts/private.cjs','tests/fixture.cjs','MTC.html','.env','package.json','.secret.html'];
  for(const f of files){fs.mkdirSync(path.dirname(path.join(root,f)),{recursive:true});fs.writeFileSync(path.join(root,f),'test-content');}
  fs.mkdirSync(path.join(root,'secure'));fs.writeFileSync(path.join(root,'secure/config.js'),"window.EGY_CONFIG={appCheckSiteKey:'REPLACE_ME',vapidKey:'REPLACE_ME'};");
  assert.throws(()=>cp.execFileSync(process.execPath,[build],{cwd:root,stdio:'pipe',env:{...process.env,EGY_APP_CHECK_SITE_KEY:'',EGY_VAPID_PUBLIC_KEY:''}}));
  cp.execFileSync(process.execPath,[build],{cwd:root,env:{...process.env,EGY_APP_CHECK_SITE_KEY:'build-test-public-site-key-only',EGY_VAPID_PUBLIC_KEY:'a'.repeat(87)},stdio:'pipe'});
  for(const f of ['functions','tests','scripts','.env','package.json','MTC.html','.secret.html'])assert.equal(fs.existsSync(path.join(root,'dist',f)),false);
  assert.equal(fs.readFileSync(path.join(root,'dist/staff-panel-x7k2.html'),'utf8'),'test-content');assert.equal(fs.existsSync(path.join(root,'dist/.nojekyll')),true);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
