/* Loaded on demand: unavailable Firebase must never prevent a local consultation. */
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  collection,
  doc,
  query,
  orderBy,
  startAfter,
  limit,
  getDocsFromServer as getDocs,
  getDocFromServer as getDoc,
  runTransaction,
  onSnapshot,
  addDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { firebaseAuth } from './firebase-auth-gate.js?v=3';
import { db } from './studio-db.js?v=2';
export { requireAuth as signInToStudio } from './firebase-auth-gate.js?v=3';
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

// Read lightweight headers for the picker, never an entire collection of drawings.
export async function sheets(cursor) {
  const snap = await getDocs(
    query(
      collection(db, 'order_sheets'),
      orderBy('updatedAt', 'desc'),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(40),
    ),
  );
  return {
    rows: snap.docs.map((d) => ({ ...d.data(), id: d.id })),
    more: snap.size === 40 ? snap.docs.at(-1) : null,
  };
}
const refs = (id) => [
  doc(db, 'order_sheets', id),
  doc(db, 'order_sheets', id, 'data', 'current'),
  doc(db, 'quotes', id),
];
const fail = (message) => {
  throw Object.assign(new Error(message), { code: 'order/conflict' });
};
export const hasSheet = async (id) => (await getDoc(doc(db, 'order_sheets', id))).exists();
export function openSheet(id) {
  const [header, body, quote] = refs(id);
  return runTransaction(db, async (tx) => {
    const h = (await tx.get(header)).data();
    if (!h) fail('This order was not found.');
    const b = (await tx.get(body)).data();
    if (!b?.sheetJson) fail('The saved sheet is incomplete.');
    const q = h.quoteId ? (await tx.get(quote)).data() : null;
    if (h.quoteId && (!q || q.sheetId !== id || !CalcEngine.savedQuoteOrder(q)))
      fail('The linked quotation is missing or incomplete. Check Quotes before modifying this file.');
    return { ...h, ...b, quote: q };
  });
}
// Explicit save, not one database write per brush movement. The quote, sheet and
// reference commit atomically. Never overwrite a receipt or a newer device's edit.
export function saveSheet({ id, expected, label, sheetJson, step, quote, unchanged, locked, uid }) {
  if (/data:(?:image\/|application\/pdf)/i.test(sheetJson))
    fail('Use written notes or a reference link instead of embedded images or PDFs.');
  if (new TextEncoder().encode(sheetJson).length > 850000)
    fail('Sheet too large to save. Split the designs into two orders. Nothing was overwritten.');
  const [head, body, ref] = refs(id),
    now = new Date().toISOString(),
    revision = crypto.randomUUID();
  return runTransaction(db, async (tx) => {
    const h = (await tx.get(head)).data();
    if ((h?.revision || '') !== expected)
      fail('This sheet changed on another device. Reopen the saved order before editing it.');
    const prev = (await tx.get(ref)).data();
    if (h?.quoteId && !prev)
      fail('The linked quotation was removed. Check the studio records before saving.');
    if (prev && prev.sheetId !== id) fail('This reference is already in use. Start a new sheet.');
    if (unchanged && h && (!quote || prev)) return { ...h, quote: prev || null };
    if (quote && CalcEngine.paymentSummary(prev).paid > quote.total)
      fail('The new total is below the money already received. The saved quotation was not changed.');
    const next = { label, revision, updatedAt: now, quoteId: quote || prev ? id : '' };
    tx.set(head, next);
    tx.set(body, { schema: 1, sheetJson, step, locked: !!quote || locked });
    let issued = prev;
    if (quote) {
      issued = {
        ...prev,
        ...quote,
        sheetId: id,
        deliveryVersion: revision,
        createdAt: prev?.createdAt || now,
        issuedAt: locked && prev ? prev.issuedAt || prev.createdAt : now,
        createdBy: prev?.createdBy || uid,
        updatedAt: now,
        status: prev?.status || 'draft',
      };
      tx.set(ref, issued);
    }
    return { ...next, quote: issued || null };
  });
}
export function postPayment(id, expectedVersion, entry) {
  const ref = doc(db, 'quotes', id);
  return runTransaction(db, async (tx) => {
    const q = (await tx.get(ref)).data();
    if (!q || q.sheetId !== id) fail('Save the order and its quotation first.');
    if (q.payments?.some((p) => p.id === entry.id)) return q; // safe retry of the same receipt
    if (q.deliveryVersion !== expectedVersion)
      fail('The quotation or payments changed. Reopen the order to check the balance.');
    if (
      !Number.isSafeInteger(entry.amount) ||
      entry.amount < 1 ||
      entry.amount > CalcEngine.paymentSummary(q).outstanding
    )
      fail('Enter an amount between 1 EGP and the outstanding balance.');
    const change = {
      payments: [...(q.payments || []), entry],
      deliveryVersion: entry.id,
      updatedAt: entry.at,
    };
    tx.update(ref, change);
    return { ...q, ...change };
  });
}
// Reconcile both settings documents together so site service defaults cannot
// overwrite an explicit EditX pricing override. Ignore offline SDK snapshots.
export function watchPrices(onData, onStale) {
  const current = {};
  const stops = ['site', 'pricing'].map((k) =>
    onSnapshot(
      doc(db, 'settings', k),
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.metadata.fromCache || snap.metadata.hasPendingWrites) {
          onStale();
          return;
        }
        current[k] = snap.exists() ? snap.data() : null;
        if ('site' in current && 'pricing' in current) onData(current.pricing, current.site);
      },
      onStale,
    ),
  );
  return () => stops.forEach((stop) => stop());
}
