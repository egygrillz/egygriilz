/* Publish an explicit static artifact, never the repository root. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve('.'),out=path.join(root,'dist');
const context={window:{}};vm.runInNewContext(fs.readFileSync('secure/config.js','utf8'),context,{timeout:1000});const config=context.window.EGY_CONFIG;
if(process.env.EGY_APP_CHECK_SITE_KEY)config.appCheckSiteKey=process.env.EGY_APP_CHECK_SITE_KEY;
if(process.env.EGY_VAPID_PUBLIC_KEY)config.vapidKey=process.env.EGY_VAPID_PUBLIC_KEY;
if(!config.appCheckSiteKey||config.appCheckSiteKey.startsWith('REPLACE_')||config.appCheckSiteKey.length<20)throw Error('Release blocked: set the public EGY_APP_CHECK_SITE_KEY repository variable.');
if(!config.vapidKey||config.vapidKey.startsWith('REPLACE_')||!/^[\w-]{80,120}$/.test(config.vapidKey))throw Error('Release blocked: set the PUBLIC Web Push VAPID key in EGY_VAPID_PUBLIC_KEY.');
for(const file of ['index.html','admin.html','booking.html','editx.html','invoice.html','logo/logo_black.png','web-app-manifest-192x192.png','web-app-manifest-512x512.png','assets/images/hero-grillz.jpg'])if(!fs.existsSync(file))throw Error('Release blocked: missing '+file+'. Merge this overlay into the complete repository first.');
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
const folders=new Set(['assets','logo','levels','materials','plating','secure']);
const rootFiles=new Set(['CNAME','.nojekyll','robots.txt','humans.txt','llms.txt','sitemap.xml','structured-data.json','site.webmanifest','admin-sw.js']);
const allowedRoot=name=>rootFiles.has(name)||(!name.startsWith('.')&&(/\.(html|png|jpg|jpeg|gif|webp|avif|ico|svg|css)$/i.test(name)&&name!=='MTC.html'));
function copy(src,dest){const info=fs.lstatSync(src);if(info.isSymbolicLink())throw Error('Symlinks are not allowed in the publication artifact: '+src);if(info.isDirectory()){fs.mkdirSync(dest,{recursive:true});for(const name of fs.readdirSync(src)){if(name.startsWith('.')||name==='node_modules')continue;copy(path.join(src,name),path.join(dest,name));}}else{fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(src,dest);}}
for(const name of fs.readdirSync(root)){if(folders.has(name)||allowedRoot(name))copy(path.join(root,name),path.join(out,name));}
fs.writeFileSync(path.join(out,'secure/config.js'),'window.EGY_CONFIG = '+JSON.stringify(config,null,2)+';\n');fs.writeFileSync(path.join(out,'.nojekyll'),'');
for(const forbidden of ['functions','tests','scripts','package.json','.env','firestore.rules','MTC.html'])if(fs.existsSync(path.join(out,forbidden)))throw Error('Unsafe artifact: '+forbidden);
for(const file of fs.readdirSync(out).filter(x=>x.endsWith('.html')&&x!=='staff-panel-x7k2.html')){const target=path.join(out,file);let html=fs.readFileSync(target,'utf8');html=html.replace(/(src|href)="(secure\/[^"?]+\.(?:js|css))"/g,(_,attr,url)=>{const hash=require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(out,url))).digest('hex').slice(0,12);return attr+'="'+url+'?v='+hash+'"';});fs.writeFileSync(target,html);}
console.log('Built dist/ for GitHub Pages. Source, tests, credentials and the old migration utility are excluded.');
