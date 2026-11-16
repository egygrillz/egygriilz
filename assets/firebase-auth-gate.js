/**
 * EGYGRILLZ — Firebase Auth gate (shared by editx, quotes, invoice, staff panel)
 *
 * The page waits for a real Firebase session, then every Firestore call in the
 * page runs with that user's token. Read-only pages never show a "connection
 * error" just because the session was still loading.
 */
import { initializeApp, getApps, getApp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, setPersistence, browserLocalPersistence,
         onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDg8i3Bk1LVvScITFL1rDd5NSa0B5TjBZk',   // public by design
  authDomain: 'egygillz-studio.firebaseapp.com',
  projectId: 'egygrillz-studio',
  storageBucket: 'egygrillz-studio.firebasestorage.app',
  messagingSenderId: '1022362401463',
  appId: '1:1022362401463:web:fec76b9c73e24d9cfeeb32',
};

/* نفس التطبيق ونفس الجلسة لكل الصفحات — مش نسخة جديدة كل مرة */
export function firebaseApp() {
  return getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
}
export function firebaseAuth() {
  return getAuth(firebaseApp());
}

let _auth = null;
function overlay() {
  let el = document.getElementById('egygz-auth-gate');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'egygz-auth-gate';
  el.innerHTML = `
  <div style="position:fixed;inset:0;z-index:99999;background:#faf9f7;display:flex;align-items:center;justify-content:center;font-family:Helvetica,Arial,sans-serif">
    <form id="egygz-gate-form" style="width:320px;background:#fff;border:1px solid #e6e3df;padding:28px">
      <div style="font-size:10px;letter-spacing:2px;color:#9a9a9a;margin-bottom:6px">EGYGRILLZ — RESTRICTED</div>
      <div style="font-size:20px;font-weight:700;margin-bottom:18px">Staff sign-in</div>
      <label style="font-size:12px;color:#666">Email</label>
      <input id="egygz-gate-email" type="email" required autocomplete="username"
             style="width:100%;box-sizing:border-box;padding:9px;border:1px solid #ddd;margin:6px 0 12px;font-size:14px">
      <label style="font-size:12px;color:#666">Password</label>
      <input id="egygz-gate-pass" type="password" required autocomplete="current-password"
             style="width:100%;box-sizing:border-box;padding:9px;border:1px solid #ddd;margin:6px 0 12px;font-size:14px">
      <div id="egygz-gate-err" style="color:#b03030;font-size:12px;min-height:16px;margin-bottom:8px"></div>
      <button id="egygz-gate-btn" type="submit"
              style="width:100%;padding:11px;background:#1a1a1a;color:#fff;border:0;font-size:13px;letter-spacing:1px;cursor:pointer">
        Sign in
      </button>
    </form>
  </div>`;
  (document.body || document.documentElement).appendChild(el);
  return el;
}

export async function requireAuth() {
  if (_auth) {
    if (_auth.currentUser) return _auth.currentUser;
  }
  const auth = firebaseAuth();
  _auth = auth;
  await setPersistence(auth, browserLocalPersistence).catch(() => {});

  /* لو فيه جلسة محفوظة، بنرجع فوراً من غير ما نعرض شاشة الدخول */
  if (auth.currentUser) return auth.currentUser;

  const gate = overlay();
  return new Promise((resolve) => {
    let settled = false;
    const done = (user) => {
      if (settled) return;
      settled = true;
      gate.remove();
      resolve(user);
    };

    onAuthStateChanged(auth, (user) => { if (user) done(user); });

    gate.querySelector('#egygz-gate-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = gate.querySelector('#egygz-gate-email').value.trim();
      const pass = gate.querySelector('#egygz-gate-pass').value;
      const btn = gate.querySelector('#egygz-gate-btn');
      const err = gate.querySelector('#egygz-gate-err');
      err.textContent = '';
      btn.disabled = true;
      btn.textContent = 'Checking…';
      try {
        const cred = await signInWithEmailAndPassword(auth, email, pass);
        done(cred.user);
      } catch (ex) {
        const map = {
          'auth/invalid-credential': 'Wrong email or password.',
          'auth/invalid-login-credentials': 'Wrong email or password.',
          'auth/too-many-requests': 'Too many attempts. Wait a few minutes.',
          'auth/network-request-failed': 'Network error. Try again.',
          'auth/user-not-found': 'Wrong email or password.',
          'auth/wrong-password': 'Wrong email or password.',
        };
        err.textContent = map[ex.code] || (ex.code || ex.message || 'Could not sign in.');
        btn.disabled = false;
        btn.textContent = 'Sign in';
      }
    });
  });
}

export function signOut() {
  if (_auth) fbSignOut(_auth).catch(() => {});
}
