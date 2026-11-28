// Offline SDK surface used only by the browser journey. Rules run in a separate emulator suite.
let app;
export const initializeApp = (options) => (app = { options, name: '[DEFAULT]' });
export const getApp = () => app;
export const getApps = () => (app ? [app] : []);
// UI state only; the rules suite independently checks this UID with the real SDK.
const owner = {
  uid: 'zOmlCC3Z0qTDlciJMeCDcSDauwy2',
  email: 'admin@egygrillz.com',
  emailVerified: false,
  getIdToken: async () => 'fake',
};
const other = { ...owner, uid: 'unrelated', email: 'other@example.test' };
const auth = {
  currentUser:
    sessionStorage.__fixtureOther === '1'
      ? other
      : sessionStorage.__fixtureSignedOut === '1'
        ? null
        : owner,
};
const listeners = new Set();
export const getAuth = () => auth;
export const onAuthStateChanged = (a, cb) => {
  listeners.add(cb);
  setTimeout(() => cb(a.currentUser), 0);
  return () => listeners.delete(cb);
};
export const signOut = async (a) => {
  delete sessionStorage.__fixtureOther;
  sessionStorage.__fixtureSignedOut = '1';
  a.currentUser = null;
  for (const cb of listeners) cb(null);
};
export const signInWithEmailAndPassword = async (a, email, password) => {
  if (email !== owner.email || password !== 'fixture-password')
    throw Object.assign(Error('denied'), { code: 'auth/invalid-credential' });
  delete sessionStorage.__fixtureSignedOut;
  a.currentUser = owner;
  for (const cb of listeners) cb(owner);
  return { user: owner };
};
export const setPersistence = async () => {};
export const browserLocalPersistence = {};
export const getFirestore = (app) => ({ app });
export const collection = (db, col) => ({ col });
export const doc = (db, ...parts) => ({ col: parts.slice(0, -1).join('/'), id: parts.at(-1) });
export const query = (r) => r;
export const limit = () => 0,
  orderBy = () => 0,
  startAfter = () => 0;
const table = (k) => JSON.parse(localStorage.__fixture)[k] || {};
const put = (r, data, merge) => {
  const db = JSON.parse(localStorage.__fixture);
  db[r.col] ||= {};
  db[r.col][r.id] = merge ? { ...db[r.col][r.id], ...data } : data;
  localStorage.__fixture = JSON.stringify(db);
};
const snap = (id, v) => ({ id, data: () => v, exists: () => !!v });
export const getDoc = async (r) => snap(r.id, table(r.col)[r.id]);
export const getDocs = async (r) => {
  const docs = Object.entries(table(r.col)).map(([k, v]) => snap(k, v));
  return { docs, size: docs.length, empty: !docs.length, forEach: (cb) => docs.forEach(cb) };
};
export const addDoc = async (r, v) => {
  const id = crypto.randomUUID();
  put({ ...r, id }, v);
  return { id };
};
export const updateDoc = async (r, v) => put(r, v, true),
  setDoc = async (r, v, o) => put(r, v, o?.merge),
  deleteDoc = async () => {};
export const serverTimestamp = () => 0,
  increment = () => 0,
  getCountFromServer = async () => ({ data: () => ({ count: 1 }) });
export const getDocFromServer = async (r) => {
  if (r.col === 'clients' && r.id === 'editx-access-probe-v1' && sessionStorage.__fixtureOther === '1')
    throw Object.assign(Error('Private read denied'), { code: 'permission-denied' });
  return getDoc(r);
};
export const getDocsFromServer = getDocs;
export async function runTransaction(db, fn) {
  const writes = [];
  const result = await fn({
    get: getDoc,
    set: (r, v) => writes.push([r, v, false]),
    update: (r, v) => writes.push([r, v, true]),
  });
  for (const args of writes) put(...args);
  return result;
}
export function onSnapshot(ref, opts, cb) {
  const emit = () =>
    getDoc(ref).then((s) => cb({ ...s, metadata: { fromCache: false, hasPendingWrites: false } }));
  const timer = setTimeout(emit, 0);
  window.addEventListener('fixture-settings', emit);
  return () => {
    clearTimeout(timer);
    window.removeEventListener('fixture-settings', emit);
  };
}
