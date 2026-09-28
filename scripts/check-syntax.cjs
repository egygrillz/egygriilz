const fs=require('node:fs'),path=require('node:path'),acorn=require('acorn');let count=0;
function parse(source,file,module=false){try{acorn.parse(source,{ecmaVersion:'latest',sourceType:module?'module':'script'});count++;}catch(e){console.error(file+': '+e.message);process.exitCode=1;}}
for(const file of fs.readdirSync('.').filter(f=>f.endsWith('.html'))){if(file==='staff-panel-x7k2.html')continue;const text=fs.readFileSync(file,'utf8');for(const [,attrs,source]of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(!source.trim()||/application\/(?:ld\+)?json/.test(attrs))continue;parse(source,file,attrs.includes('module'));}}
for(const dir of ['functions','secure','secure/pages'])for(const f of fs.readdirSync(dir).filter(x=>x.endsWith('.js')))parse(fs.readFileSync(path.join(dir,f),'utf8'),path.join(dir,f),f==='invoice-2.js');
parse(fs.readFileSync('admin-sw.js','utf8'),'admin-sw.js');console.log('Parsed '+count+' first-party JavaScript programs (support panel excluded).');
