// Run with your own Application Default Credentials. Never upload private keys.
const {createRequire}=require('node:module');const path=require('node:path');const fromFunctions=createRequire(path.resolve(__dirname,'../functions/index.js'));
const {initializeApp,applicationDefault}=fromFunctions('firebase-admin/app'),{getAuth}=fromFunctions('firebase-admin/auth'),{getFirestore}=fromFunctions('firebase-admin/firestore');
const [projectId,uid,action,mfa]=process.argv.slice(2);
if(!projectId||!uid||!['grant','revoke','require-mfa'].includes(action)){console.error('Usage: node scripts/set-admin.cjs PROJECT_ID USER_UID grant|revoke|require-mfa [totp]');process.exit(1);}
if(!process.env.FIREBASE_AUTH_EMULATOR_HOST&&!['egygrillz-studio',process.env.EGY_STAGING_PROJECT].filter(Boolean).includes(projectId)){console.error('Explicit project safeguard: edit this allowlist for a staging project after review. The support project is outside this release.');process.exit(1);}
initializeApp({credential:applicationDefault(),projectId});
(async()=>{const auth=getAuth(),db=getFirestore(),user=await auth.getUser(uid),claims={...user.customClaims},ref=db.doc('_admins/'+uid);
 if(action==='revoke'){
  // Deny DB and callable access first; do not wait for cached Auth tokens to expire.
  await ref.set({active:false},{merge:true});delete claims.admin;await auth.setCustomUserClaims(uid,claims);await auth.revokeRefreshTokens(uid);console.log('Registry access revoked immediately. Refresh tokens revoked.');return;
 }
 if(action==='require-mfa'){
  if(!user.multiFactor?.enrolledFactors?.some(f=>f.factorId==='totp'))throw Error('Enroll a TOTP authenticator in the studio security screen first.');
  await ref.set({requireMfa:true},{merge:true});await auth.revokeRefreshTokens(uid);console.log('TOTP now required. Sign in again.');return;
 }
 if(mfa==='totp'&&!user.multiFactor?.enrolledFactors?.some(f=>f.factorId==='totp'))throw Error('Enroll a TOTP authenticator first.');
 const previous=(await ref.get()).data();claims.admin=true;await auth.setCustomUserClaims(uid,claims);
 await ref.set({active:true,minAuthTime:Math.floor(Date.now()/1000),requireMfa:mfa==='totp'||previous?.requireMfa===true},{merge:true});console.log('Granted. Sign out and sign in again. Do not grant accounts you do not control.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
