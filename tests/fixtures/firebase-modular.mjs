// Offline SDK surface used only by the browser journey. Rules run in a separate emulator suite.
let app;
export const initializeApp = (options) => (app = { options, name: '[DEFAULT]' });
export const getApp = () => app;
export const getApps = () => (app ? [app] : []);
const user = { uid: 'demo-staff', email: 'studio@example.test' };
export const getAuth = () => ({ currentUser: user });
export const onAuthStateChanged = (a, cb) => {
  setTimeout(() => cb(user), 0);
  return () => {};
};
export const signOut = async () => {};
export const signInWithEmailAndPassword = async () => ({ user });
export const setPersistence = async () => {};
export const browserLocalPersistence = {};
export const getFirestore = (app) => ({ app });
export const collection = (db, col) => ({ col });
export const doc = (db, col, id) => ({ col, id });
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
  getCountFromServer = async () => ({ data: () => ({ count: 1 }) }),
  runTransaction = async () => 1;
