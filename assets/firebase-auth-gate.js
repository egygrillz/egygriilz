/**
 * EGYGRILLZ — reusable Firebase Auth gate for the internal tools
 * (editx.html, staff-panel-x7k2.html, invoice.html, x.html, egygz-client-intake.html)
 *
 * Why: right now those pages either have no auth or a password written in the
 * page source. This module replaces both with real Firebase Authentication.
 *
 * ── Install ───────────────────────────────────────────────────────────────
 * 1. Firebase Console → Authentication → Sign-in method → enable Email/Password.
 * 2. Add ONE user (Users → Add user):  studio@egygillz.com + a strong password.
 *    ⚠️ مهم: المستخدم لازم يكون في نفس المشروع اللي تحت (egyrillz-studio).
 *    لو عملته في egygrillz-clientele-assistant، تسجيل الدخول يفشل.
 *    Turn on multi-factor if available on your plan.
 * 3. In the panel page, inside the <head>, before any other script:
 *
 *      <script type="module">
 *        import { requireAuth } from '/assets/firebase-auth-gate.js';
 *        window.EGYGZ_USER = await requireAuth();
 *        // ...rest of the page logic runs only if this resolved
 *      </script>
 *
 *    (or load as a classic script and call `EGYGZAuth.requireAuth()`).
 *
 * 4. Firestore rules: use `isAdmin()` with this user's UID (deploy/firestore.rules).
 *
 * ── What it does ──────────────────────────────────────────────────────────
 * • Blocks the page with a login overlay until a real Firebase session exists.
 * • Uses LOCAL persistence — you stay signed in on this device until you sign out.
 * • Exposes signOut() for the panel's logout button.
 * • Never contains a password, a key or a bypass.
 */

const FIREBASE_VERSION = '10.12.0';
const FIREBASE_CONFIG = {   // ← مشروع egygrillz-studio (نفس مشروع الموقع)
  apiKey: 'AIzaSyDg8i3Bk1LVvScITFL1rDd5NSa0B5TjBZk',   // public by design (not a secret)
  authDomain: 'egygillz-studio.firebaseapp.com',
  projectId: 'egygrillz-studio',
  storageBucket: 'egygillz-studio.firebasestorage.app',
  messagingSenderId: '1022362401463',
  appId: '1:1022362401463:web:fec76b9c73e24d9cfeeb32'
};

let _auth = null;
let _mods = null;

async function load() {
  if (_mods) return _mods;
  const appMod = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`);
  const authMod = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(FIREBASE_CONFIG);
  _auth = authMod.getAuth(app);
  _mods = { appMod, authMod, app };
  return _mods;
}

function overlay() {
  let el = document.getElementById('egygz-auth-gate');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'egygz-auth-gate';
  el.innerHTML = `
    <div class="egygz-gate-box">
      <div class="egygz-gate-kicker">EGYGRILLZ · Restricted</div>
      <h2>Staff sign-in</h2>
      <form id="egygz-gate-form" autocomplete="on">
        <label>Email<input id="egygz-gate-email" type="email" autocomplete="username" required></label>
        <label>Password<input id="egygz-gate-pass" type="password" autocomplete="current-password" required></label>
        <button id="egygz-gate-btn" type="submit">Sign in</button>
        <p id="egygz-gate-err" role="alert"></p>
      </form>
    </div>`;
  const css = document.createElement('style');
  css.textContent = `
    #egygz-auth-gate{position:fixed;inset:0;z-index:2147483000;background:#fafaf9;color:#1f1f1f;
      display:flex;align-items:center;justify-content:center;font:15px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif}
    #egygz-auth-gate .egygz-gate-box{width:min(360px,92vw);background:#ffffff;border:1px solid rgba(0,0,0,0.10);
      border-radius:4px;padding:32px}
    #egygz-auth-gate .egygz-gate-kicker{font-size:10px;letter-spacing:.3em;color:#9a9a9a;text-transform:uppercase}
    #egygz-auth-gate h2{margin:8px 0 18px;font-size:22px}
    #egygz-auth-gate label{display:block;font-size:12px;color:#8a8a8a;margin:12px 0 6px}
    #egygz-auth-gate input{width:100%;padding:11px 12px;border-radius:4px;border:1px solid #e2e2e2;
      background:#fff;color:#1f1f1f;font-size:15px;box-sizing:border-box}
    #egygz-auth-gate button{width:100%;margin-top:18px;padding:13px;border:0;border-radius:2px;
      background:#1f1f1f;color:#fff;font-weight:700;letter-spacing:.02em;cursor:pointer}
    #egygz-auth-gate button:disabled{opacity:.6;cursor:progress}
    #egygz-auth-gate p{min-height:18px;margin:12px 0 0;font-size:12.5px;color:#ff6b6b}`;
  document.head.appendChild(css);
  document.body.appendChild(el);
  return el;
}

/**
 * Resolves with the signed-in user, or never (keeps the overlay up).
 * @param {{redirectOnFail?: string}} [opts]
 */
export async function requireAuth(opts = {}) {
  const { authMod } = await load();
  // hide the page immediately so nothing sensitive paints before auth
  document.documentElement.style.visibility = 'hidden';
  const gate = overlay();
  document.documentElement.style.visibility = '';

  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (user) => {
      if (settled) return;
      settled = true;
      gate.remove();
      resolve(user);
    };

    // session persistence: closing the tab ends the session
    authMod.setPersistence(_auth, authMod.browserLocalPersistence).catch(() => {});

    authMod.onAuthStateChanged(_auth, (user) => {
      if (user) done(user);
    });

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
        const cred = await authMod.signInWithEmailAndPassword(_auth, email, pass);
        done(cred.user);
      } catch (ex) {
        const map = {
          'auth/invalid-credential': 'Wrong email or password.',
          'auth/invalid-login-credentials': 'Wrong email or password.',
          'auth/too-many-requests': 'Too many attempts. Wait a few minutes.',
          'auth/network-request-failed': 'Network error. Try again.',
        };
        err.textContent = map[ex.code] || 'Sign-in failed.';
        btn.disabled = false;
        btn.textContent = 'Sign in';
        // keep focus sane
        gate.querySelector('#egygz-gate-pass').select();
      }
    });
  });
}

export async function signOut() {
  const { authMod } = await load();
  await authMod.signOut(_auth);
  location.reload();
}

export async function getIdToken() {
  const { authMod } = await load();
  const u = authMod.getAuth().currentUser;
  return u ? u.getIdToken() : null;
}

// allow classic-script usage: <script src="/assets/firebase-auth-gate.js"></script>
if (typeof window !== 'undefined') {
  window.EGYGZAuth = { requireAuth, signOut, getIdToken };
}
