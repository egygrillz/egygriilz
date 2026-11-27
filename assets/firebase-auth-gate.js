/**
 * EGYGRILLZ — Firebase Auth gate (shared by editx, quotes, invoice, MTC)
 *
 * Waits for a real Firebase session, then every Firestore call in the page
 * runs with that user's token. Explicit visibility:visible ensures the sign-in
 * dialog is always visible even when the host page hides body.auth-locked.
 */
import { initializeApp, getApps }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, setPersistence, browserLocalPersistence,
         onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDg8i3Bk1LVvScITFL1rDd5NSa0B5TjBZk',   // public by design
  authDomain: 'egygrillz-studio.firebaseapp.com',
  projectId: 'egygrillz-studio',
  storageBucket: 'egygrillz-studio.firebasestorage.app',
  messagingSenderId: '1022362401463',
  appId: '1:1022362401463:web:fec76b9c73e24d9cfeeb32',
};

export function firebaseApp() {
  const apps = getApps();
  const studio = apps.find(app => app.options.projectId === FIREBASE_CONFIG.projectId);
  if (studio) return studio;
  return apps.some(app => app.name === '[DEFAULT]')
    ? initializeApp(FIREBASE_CONFIG, 'egygz-studio') : initializeApp(FIREBASE_CONFIG);
}
export function firebaseAuth() {
  return getAuth(firebaseApp());
}

let _auth = null;
let _authPromise = null;

function overlay() {
  let el = document.getElementById('egygz-auth-gate');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'egygz-auth-gate';
  el.style.cssText = 'visibility:visible!important;opacity:1!important;';
  el.innerHTML = `
  <div style="position:fixed;inset:0;z-index:99999;visibility:visible!important;opacity:1!important;background:#faf9f7;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Helvetica,Arial,sans-serif">
    <form id="egygz-gate-form" style="width:100%;max-width:340px;background:#fff;border:1px solid #efefef;padding:28px;box-sizing:border-box;visibility:visible!important">
      <div style="font-size:10px;letter-spacing:2px;color:#9a9a9a;margin-bottom:6px">EGYGRILLZ — RESTRICTED</div>
      <div style="font-size:20px;font-weight:700;color:#1a1a1a;margin-bottom:18px">Staff sign-in</div>
      <label for="egygz-gate-email" style="display:block;font-size:12px;color:#666">Email</label>
      <input id="egygz-gate-email" type="email" required autocomplete="username"
             style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #ddd;margin:6px 0 12px;font-size:14px;color:#1a1a1a;background:#fff">
      <label for="egygz-gate-pass" style="display:block;font-size:12px;color:#666">Password</label>
      <input id="egygz-gate-pass" type="password" required autocomplete="current-password"
             style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #ddd;margin:6px 0 12px;font-size:14px;color:#1a1a1a;background:#fff">
      <div id="egygz-gate-err" role="alert" style="color:#b42318;font-size:12px;min-height:16px;margin-bottom:8px"></div>
      <button id="egygz-gate-btn" type="submit"
              style="width:100%;padding:11px;background:#1a1a1a;color:#fff;border:0;font-size:13px;letter-spacing:1px;cursor:pointer">
        Sign in
      </button>
    </form>
  </div>`;
  (document.body || document.documentElement).appendChild(el);
  setTimeout(() => {
    const inp = el.querySelector('#egygz-gate-email');
    if (inp) { try { inp.focus(); } catch (e) {} }
  }, 50);
  return el;
}

const LOG = (m, d) => { try { console.log('[gate]', m, d === undefined ? '' : d); } catch (e) {} };
const WARN = (m, d) => { try { console.warn('[gate]', m, d === undefined ? '' : d); } catch (e) {} };

function readStoredUser(auth) {
  try {
    const key = 'firebase:authUser:' + FIREBASE_CONFIG.apiKey + ':' + (auth && auth.name ? auth.name : '[DEFAULT]');
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const u = JSON.parse(raw);
    if (!u || !u.uid) return null;
    return u;
  } catch (e) {
    return null;
  }
}

export async function requireAuth() {
  try { window.__gateLoaded = true; } catch (e) {}
  if (_auth && _auth.currentUser) return _auth.currentUser;
  if (_authPromise) return _authPromise;

  _authPromise = (async () => {
    const auth = firebaseAuth();
    _auth = auth;

    const restored = await new Promise((resolve) => {
      let un = null;
      let settled = false;
      const finish = (u) => {
        if (settled) return;
        settled = true;
        try { if (un) un(); } catch (e) {}
        resolve(u || null);
      };
      try {
        un = onAuthStateChanged(auth, (u) => finish(u), (err) => {
          WARN('onAuthStateChanged error', err && err.code);
          finish(auth.currentUser || null);
        });
      } catch (e) {
        WARN('onAuthStateChanged threw', e && e.message);
        finish(null);
        return;
      }
      setTimeout(() => {
        const stored = readStoredUser(auth);
        finish(auth.currentUser || stored || null);
      }, 3500);
    });

    if (restored) {
      LOG('restored session');
      return restored;
    }

    await setPersistence(auth, browserLocalPersistence).catch(() => {});

    const gate = overlay();
    return await new Promise((resolve) => {
      let settled = false;
      let un = null;
      const done = (user) => {
        if (settled) return;
        settled = true;
        try { if (un) un(); } catch (e) {}
        gate.remove();
        resolve(user);
      };

      un = onAuthStateChanged(auth, (user) => { if (user) done(user); });

      gate.querySelector('#egygz-gate-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = gate.querySelector('#egygz-gate-email').value.trim();
        const pass = gate.querySelector('#egygz-gate-pass').value;
        const btn = gate.querySelector('#egygz-gate-btn');
        const err = gate.querySelector('#egygz-gate-err');
        if (!email || !pass) {
          err.textContent = 'Please enter your email and password.';
          return;
        }
        err.textContent = '';
        btn.disabled = true;
        btn.style.opacity = '0.7';
        btn.textContent = 'Signing in…';
        try {
          const cred = await signInWithEmailAndPassword(auth, email, pass);
          done(cred.user);
        } catch (ex) {
          const map = {
            'auth/invalid-credential': 'Wrong email or password.',
            'auth/invalid-login-credentials': 'Wrong email or password.',
            'auth/invalid-email': 'Please enter a valid email address.',
            'auth/too-many-requests': 'Too many attempts. Wait a few minutes.',
            'auth/network-request-failed': 'Network error. Check your connection and try again.',
            'auth/user-not-found': 'Wrong email or password.',
            'auth/wrong-password': 'Wrong email or password.',
            'auth/user-disabled': 'This staff account has been disabled.',
          };
          err.textContent = map[ex && ex.code] || ((ex && (ex.code || ex.message)) || 'Could not sign in.');
          btn.disabled = false;
          btn.style.opacity = '1';
          btn.textContent = 'Sign in';
        }
      });
    });
  })().finally(() => {
    _authPromise = null;
  });

  return _authPromise;
}

export function signOut() {
  const auth = _auth || (() => { try { return firebaseAuth(); } catch (e) { return null; } })();
  if (auth) return fbSignOut(auth).catch(() => {});
  return Promise.resolve();
}
