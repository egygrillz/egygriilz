// Run with `firebase emulators:exec --only firestore --project demo-egygrillz ...`.
// Never accepts production hosts or credentials. Both auth and data are fixtures.
import { test, before, after, beforeEach } from 'node:test';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';

let env;
const projectId = 'demo-egygrillz';
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST || '';
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(address))
    throw new Error('Start a local Firestore emulator first (see STUDIO-ORDERS.md).');
  const [host, port] = address.split(':');
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
    },
  });
});
after(async () => {
  await env?.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
});
const guest = () => env.unauthenticatedContext().firestore();
const signed = (claims = {}) => env.authenticatedContext('test-studio-user', claims).firestore();
const slot = { date: '2027-01-18', time: '01:00 PM' },
  id = '2027-01-18_0100PM';
const appointment = (extra = {}) => ({
  ...slot,
  name: 'Test Client',
  phone: '01000000000',
  email: 'client@example.test',
  service: 'Consultation',
  notes: '',
  status: 'confirmed',
  showedUp: null,
  createdAt: serverTimestamp(),
  ...extra,
});
function pair(db, key = id, extra = {}) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'slots', key), slot);
  batch.set(doc(db, 'appointments', key), appointment(extra));
  return batch.commit();
}

test('public booking claims one slot & appointment atomically; only availability is public', async () => {
  const db = guest(),
    slotRef = doc(db, 'slots', id),
    apptRef = doc(db, 'appointments', id);
  // Same read-before-write transaction as assets/booking-secure.js, not a staff SDK write.
  await assertSucceeds(
    runTransaction(db, async (tx) => {
      if ((await tx.get(slotRef)).exists()) throw Error('Slot taken');
      tx.set(slotRef, slot);
      tx.set(apptRef, appointment());
    }),
  );
  await assertSucceeds(getDoc(doc(db, 'slots', id)));
  await assertFails(getDoc(doc(db, 'appointments', id)));
  await assertFails(pair(db));
  await assertFails(deleteDoc(doc(db, 'slots', id)));
  await assertFails(updateDoc(doc(db, 'appointments', id), { status: 'cancelled' }));
});
test('reject incomplete, mismatched, duplicate-ID and malformed public bookings', async () => {
  const db = guest();
  await assertFails(setDoc(doc(db, 'slots', id), slot));
  await assertFails(setDoc(doc(db, 'appointments', id), appointment()));
  const alias = writeBatch(db),
    key = '2027-01-18_100PM';
  alias.set(doc(db, 'slots', key), { ...slot, time: '1:00 PM' });
  alias.set(doc(db, 'appointments', key), appointment({ time: '1:00 PM' }));
  await assertFails(alias.commit());
  await assertFails(pair(db, 'other'));
  await assertFails(pair(db, id, { time: '02:00 PM' }));
  await assertFails(pair(db, id, { showedUp: true }));
  await assertFails(pair(db, id, { createdAt: 'yesterday' }));
});
test('initial client record can be created, never read, listed or overwritten by the booking form', async () => {
  const db = guest(),
    ref = doc(db, 'clients', '01000000000');
  const data = {
    name: 'Test Client',
    phone: '01000000000',
    email: 'client@example.test',
    totalAppointments: 1,
    totalNoShows: 0,
    firstVisit: slot.date,
    lastVisit: slot.date,
    services: ['Consultation'],
    notes: '',
    createdAt: serverTimestamp(),
  };
  await assertFails(setDoc(ref, { ...data, totalAppointments: 12 }));
  await assertSucceeds(setDoc(ref, data));
  await assertFails(getDoc(ref));
  await assertFails(getDocs(collection(db, 'clients')));
  await assertFails(setDoc(ref, data));
});
test('public site settings are readable but not editable; internal settings and quotes are private', async () => {
  const db = guest(),
    staff = signed({ staff: true });
  for (const name of ['pricing', 'site', 'schedule', 'catalog', 'banners', 'crops', 'visibility']) {
    const ref = doc(db, 'settings', name);
    await assertSucceeds(getDoc(ref));
    await assertFails(setDoc(ref, {}));
  }
  await assertSucceeds(setDoc(doc(staff, 'quotes', 'q'), { total: 5000 }));
  for (const outsider of [
    db,
    signed(),
    signed({ email: 'admin@egygrillz.com', email_verified: false }),
    signed({ email: 'studio@egygrillz.com', email_verified: true }),
  ]) {
    await assertFails(getDoc(doc(outsider, 'settings', 'counters')));
    await assertFails(getDocs(collection(outsider, 'settings')));
    for (const name of ['quotes', 'clients', 'appointments', 'invoices', 'design_templates', 'mould_orders'])
      await assertFails(getDocs(collection(outsider, name)));
    for (const name of ['quotes', 'invoices', 'design_templates'])
      await assertFails(setDoc(doc(outsider, name, 'q'), { total: 5000 }));
  }
});
test('trusted EditX & Worker identities can use the studio resources (including legacy staff edits)', async () => {
  for (const db of [
    signed({ staff: true }),
    signed({ admin: true }),
    signed({ email: 'admin@egygrillz.com', email_verified: true }),
  ]) {
    for (const col of [
      'appointments',
      'slots',
      'clients',
      'design_templates',
      'quotes',
      'invoices',
      'mould_orders',
      'settings',
    ]) {
      const ref = doc(db, col, 'demo');
      await assertSucceeds(setDoc(ref, { fixture: true }));
      await assertSucceeds(getDocs(collection(db, col)));
      await assertSucceeds(deleteDoc(ref));
    }
    await assertFails(setDoc(doc(db, 'unlisted', 'x'), {}));
  }
});

test('public content and enquiries retain their existing access without opening private reads', async () => {
  const db = guest();
  for (const col of ['stats', 'catalog', 'banners']) {
    await assertSucceeds(getDocs(collection(db, col)));
    await assertFails(setDoc(doc(db, col, 'test'), { fixture: true }));
  }
  for (const col of ['mould_orders', 'messages']) {
    const ref = doc(db, col, 'test');
    await assertSucceeds(setDoc(ref, { fixture: true }));
    await assertFails(getDoc(ref));
    await assertFails(getDocs(collection(db, col)));
    await assertFails(updateDoc(ref, { fixture: false }));
  }
});
