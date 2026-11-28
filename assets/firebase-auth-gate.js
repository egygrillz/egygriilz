/**
 * EGYGRILLZ — Firebase Auth gate (shared by Quotes, Invoice, MTC and the assistant pricing editor)
 *
 * Waits for a real Firebase session, then every Firestore call in the page
 * runs with that user's token. Explicit visibility:visible ensures the sign-in
 * dialog is always visible even when the host page hides body.auth-locked.
 */
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

import {
  getFirestore,
  doc,
  getDocFromServer,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDg8i3Bk1LVvScITFL1rDd5NSa0B5TjBZk', // public by design
  authDomain: 'egygrillz-studio.firebaseapp.com',
  projectId: 'egygrillz-studio',
  storageBucket: 'egygrillz-studio.firebasestorage.app',
  messagingSenderId: '1022362401463',
  appId: '1:1022362401463:web:fec76b9c73e24d9cfeeb32',
};

export function firebaseApp() {
  const apps = getApps();
  const studio = apps.find((app) => app.options.projectId === FIREBASE_CONFIG.projectId);
  if (studio) return studio;
  return apps.some((app) => app.name === '[DEFAULT]')
    ? initializeApp(FIREBASE_CONFIG, 'egygz-studio')
    : initializeApp(FIREBASE_CONFIG);
}
export function firebaseAuth() {
  return getAuth(firebaseApp());
}

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
      <div id="egygz-gate-fields" hidden>
      <label for="egygz-gate-email" style="display:block;font-size:12px;color:#666">Email</label>
      <input id="egygz-gate-email" type="email" required autocomplete="username"
             style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #ddd;margin:6px 0 12px;font-size:14px;color:#1a1a1a;background:#fff">
      <label for="egygz-gate-pass" style="display:block;font-size:12px;color:#666">Password</label>
      <input id="egygz-gate-pass" type="password" required autocomplete="current-password"
             style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #ddd;margin:6px 0 12px;font-size:14px;color:#1a1a1a;background:#fff">
      </div>
      <div id="egygz-gate-err" role="alert" style="color:#b42318;font-size:12px;min-height:16px;margin-bottom:8px"></div>
      <button id="egygz-gate-btn" hidden type="submit"
              style="width:100%;padding:11px;background:#1a1a1a;color:#fff;border:0;font-size:13px;letter-spacing:1px;cursor:pointer">
        Sign in
      </button>
      <div id="egygz-gate-access" hidden>
        <button id="egygz-gate-retry" type="button">Retry access</button>
        <button id="egygz-gate-switch" type="button">Use another account</button>
      </div>
    </form>
  </div>`;
  (document.body || document.documentElement).appendChild(el);
  return el;
}

function accessHint(err) {
  if (err?.code === 'permission-denied' || err?.code === 'unauthenticated')
    return 'Private reads denied. Check the owner UID and published rules in egygrillz-studio.';
  if (err?.code === 'resource-exhausted') return 'Studio database quota reached. Check usage, then retry.';
  return 'Could not reach the studio database. Check your connection, then retry.';
}

// Sign-in establishes identity, not staff status. In particular, never unlock
// invoice/client caches based on localStorage or a public settings read.
async function enterStudio() {
  const auth = firebaseAuth(),
    gate = overlay();
  const el = (id) => gate.querySelector('#egygz-gate-' + id);
  const fields = el('fields'),
    btn = el('btn'),
    err = el('err'),
    actions = el('access');
  err.textContent = 'Checking studio access…';
  return new Promise((resolve, reject) => {
    let generation = 0,
      openedUid = '';
    async function check(user, refresh = false) {
      const turn = ++generation;
      if (openedUid) {
        if (user?.uid !== openedUid) location.reload(); // clear the open desk on sign-out/account switch
        return;
      }
      fields.hidden = btn.hidden = !!user;
      actions.hidden = true;
      if (!user) {
        err.textContent = '';
        el('email').focus();
        return;
      }
      err.textContent = 'Checking studio access…';
      try {
        if (refresh) await user.getIdToken(true);
        await getDocFromServer(doc(getFirestore(firebaseApp()), 'clients', 'editx-access-probe-v1'));
      } catch (e) {
        if (turn !== generation) return;
        err.textContent = `Signed in as ${user.email || user.uid}. ${accessHint(e)}`;
        actions.hidden = false;
        return;
      }
      if (turn !== generation || auth.currentUser?.uid !== user.uid) return;
      openedUid = user.uid;
      gate.remove();
      resolve(user);
    }
    el('retry').onclick = () => check(auth.currentUser, true);
    el('switch').onclick = () =>
      fbSignOut(auth).catch(() => {
        err.textContent = 'Could not sign out. Retry.';
      });
    el('form').onsubmit = async (event) => {
      event.preventDefault();
      if (btn.hidden || btn.disabled) return;
      btn.disabled = true;
      err.textContent = '';
      const password = el('pass');
      try {
        await setPersistence(auth, browserLocalPersistence).catch(() => {});
        await signInWithEmailAndPassword(auth, el('email').value.trim(), password.value);
        password.value = '';
        // The SDK observer runs the same server probe as a restored session.
      } catch (e) {
        const hints = {
          'auth/invalid-email': 'Please enter a valid email address.',
          'auth/too-many-requests': 'Too many attempts. Wait a few minutes.',
          'auth/network-request-failed': 'Check your connection, then retry.',
          'auth/user-disabled': 'This staff account has been disabled.',
        };
        err.textContent = hints[e?.code] || 'Could not sign in. Check the studio email and password.';
      } finally {
        btn.disabled = false;
      }
    };
    onAuthStateChanged(
      auth,
      (user) => check(user),
      (e) => {
        err.textContent = 'Cannot load Firebase sign-in. Refresh and try again.';
        reject(e);
      },
    );
  });
}

export function requireAuth() {
  if (!_authPromise)
    _authPromise = enterStudio().catch((e) => {
      _authPromise = null;
      throw e;
    });
  return _authPromise;
}
export function signOut() {
  return fbSignOut(firebaseAuth());
}
