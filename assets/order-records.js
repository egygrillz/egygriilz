/* Loaded on demand: unavailable Firebase must never prevent a local consultation. */
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  collection,
  doc,
  query,
  orderBy,
  limit,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { firebaseAuth } from './firebase-auth-gate.js?v=2';
import { db } from './studio-db.js';
export const watchUser = (cb) => onAuthStateChanged(firebaseAuth(), cb);
const list = async (col, ...constraints) =>
  (await getDocs(query(collection(db, col), ...constraints))).docs.map((d) => ({ ...d.data(), id: d.id }));
const phoneKey = (p) =>
  String(p || '')
    .replace(/\D/g, '')
    .replace(/^(?:0020|20)(?=1\d{9}$)/, '0');
export async function directory() {
  const [visits, clients] = await Promise.all([
    list('appointments', orderBy('date', 'desc'), limit(500)),
    list('clients', limit(300)),
  ]);
  const rows = new Map();
  for (const a of visits) {
    const k = phoneKey(a.phone) || `visit:${a.id}`;
    if (!rows.has(k))
      rows.set(k, {
        name: a.name,
        phone: a.phone,
        email: a.email,
        appointmentDate: a.date,
        appointmentTime: a.time,
      });
  }
  for (const c of clients) {
    const k = phoneKey(c.phone) || `client:${c.id}`,
      prev = rows.get(k) || {};
    rows.set(k, {
      ...prev,
      id: c.id,
      name: c.name || prev.name,
      phone: c.phone || prev.phone,
      email: c.email || prev.email,
    });
  }
  return [...rows.values()];
}
export async function client(id) {
  const snap = await getDoc(doc(db, 'clients', id));
  return snap.exists() ? { ...snap.data(), id: snap.id } : null;
}
export const templates = () => list('design_templates', orderBy('updatedAt', 'desc'), limit(100));
export const saveTemplate = (data) => addDoc(collection(db, 'design_templates'), data);
export async function saveQuote(data, id) {
  if (!id) return (await addDoc(collection(db, 'quotes'), data)).id;
  await updateDoc(doc(db, 'quotes', id), data);
  return id;
}
