// Run with `firebase emulators:exec --only firestore --project demo-egygrillz ...`.
// Never accepts production hosts or credentials. Both auth and data are fixtures.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare-worker.js';
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
const ownerUid = 'zOmlCC3Z0qTDlciJMeCDcSDauwy2';
const owner = () =>
  env.authenticatedContext(ownerUid, { email: 'admin@egygrillz.com', email_verified: false }).firestore();
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
    for (const name of [
      'quotes',
      'clients',
      'appointments',
      'invoices',
      'design_templates',
      'mould_orders',
      'order_sheets',
    ])
      await assertFails(getDocs(collection(outsider, name)));
    for (const name of ['quotes', 'invoices', 'design_templates', 'order_sheets'])
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
      'order_sheets',
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

test('registered owner UID: password sign-in needs neither a verified email nor a custom claim', async () => {
  const db = owner();
  // All studio desks, including settings that are not readable by visitors.
  for (const col of [
    'clients',
    'appointments',
    'slots',
    'order_sheets',
    'design_templates',
    'quotes',
    'invoices',
    'mould_orders',
    'messages',
    'settings',
    'catalog',
    'banners',
    'stats',
  ]) {
    const ref = doc(db, col, 'owner-test');
    await assertSucceeds(setDoc(ref, { fixture: true }));
    await assertSucceeds(getDocs(collection(db, col)));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(updateDoc(ref, { fixture: false }));
    await assertSucceeds(deleteDoc(ref));
  }
  // A UID string in application data is not a trusted identity.
  await assertFails(setDoc(doc(signed(), 'quotes', 'q'), { createdBy: ownerUid }));
  await assertFails(setDoc(doc(db, 'unlisted', 'x'), {}));
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

test('both cloud sheet documents are private and can be saved atomically with their quotation', async () => {
  const staff = owner(),
    batch = writeBatch(staff);
  const paths = ['order_sheets/demo', 'order_sheets/demo/data/current', 'quotes/demo'];
  for (const path of paths) batch.set(doc(staff, path), { fixture: true });
  await assertSucceeds(batch.commit());
  await assertSucceeds(
    runTransaction(staff, async (tx) => {
      const quote = doc(staff, 'quotes/demo');
      await tx.get(quote);
      tx.update(quote, { payments: [{ amount: 850, staffUid: ownerUid }] });
    }),
  );
  for (const path of paths) {
    await assertSucceeds(getDoc(doc(staff, path)));
    for (const db of [guest(), signed(), signed({ email: 'admin@egygrillz.com', email_verified: false })]) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(updateDoc(doc(db, path), { fixture: false }));
    }
  }
});

test(
  'Auth + Firestore emulators: real password sign-in, private Worker reads and the retired client email route',
  { skip: !process.env.FIREBASE_AUTH_EMULATOR_HOST },
  async () => {
    const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
    assert.match(authHost, /^(127\.0\.0\.1|localhost):\d+$/);
    const authBase = `http://${authHost}/identitytoolkit.googleapis.com`;
    // Scoped to the loopback demo project. Never provision a real studio user.
    const password = 'local-fixture-password';
    const accounts = [
      [ownerUid, 'owner@example.test'],
      ['other-studio-test', 'outsider@example.test'],
    ];
    for (const [localId, email] of accounts) {
      const r = await fetch(`${authBase}/v1/projects/${projectId}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({ localId, email, password, emailVerified: false }),
      });
      assert.equal(r.status, 200, 'create isolated fixture account');
    }
    const id = 'EGZ-261127-ABCDEF012345',
      version = '0184b69b-665d-4689-90c9-3e8408565032';
    const E = globalThis.CalcEngine,
      db = owner();
    const order = E.calculateOrder([], {
      services: [{ type: 'custom', name: 'Mold — Normal per arch', unitPrice: 5000 }],
      manualTotal: 5000,
      depositAmount: 1200,
    });
    const header = doc(db, 'order_sheets', id),
      quote = doc(db, 'quotes', id);
    const save = writeBatch(db);
    save.set(header, { label: 'Fixture client · ' + id, quoteId: id, updatedAt: '2026-11-27T10:00:00Z' });
    save.set(doc(db, 'order_sheets', id, 'data', 'current'), { sheetJson: 'never-read-in-telegram' });
    save.set(quote, {
      orderNo: id,
      sheetId: id,
      order,
      deliveryVersion: version,
      clientEmail: 'recipient@example.test',
      createdAt: '2026-11-27',
      payments: [{ method: 'Cash', amount: 850, at: '2026-11-27' }],
    });
    await save.commit();
    const messages = [],
      tokens = new Map();
    const env = {
      FIREBASE_API_KEY: 'demo',
      STAFF_EMAIL: accounts[0][1],
      STAFF_PASSWORD: password,
      TELEGRAM_CHAT_ID: '42',
      TELEGRAM_WEBHOOK_SECRET: 'fixture',
      TELEGRAM_BOT_TOKEN: 'fixture',
      fetchImpl: async (url, init) => {
        const u = new URL(url);
        if (u.hostname === 'identitytoolkit.googleapis.com') {
          const r = await fetch(authBase + u.pathname + u.search, init),
            login = await r.clone().json();
          if (login.idToken) tokens.set(login.localId, login.idToken);
          return r;
        }
        if (u.hostname === 'firestore.googleapis.com') {
          assert.ok(!u.pathname.includes('/data/'), 'Telegram never opens the artwork');
          return fetch(
            `http://${process.env.FIRESTORE_EMULATOR_HOST}` +
              u.pathname.replace('/projects/egygrillz-studio/', `/projects/${projectId}/`) +
              u.search,
            init,
          );
        }
        if (u.hostname === 'api.telegram.org') {
          if (u.pathname.endsWith('/getWebhookInfo'))
            return Response.json({ ok: true, result: { url: 'https://fixture.test/hook' } });
          messages.push(JSON.parse(init.body));
          return Response.json({ ok: true });
        }
        throw Error('Unexpected service in local-only test');
      },
    };
    const check = async (e) =>
      (await worker.fetch(new Request('https://worker.test/api/telegram/check'), e)).json();
    const cmd = async (text) => {
      await worker.fetch(
        new Request('https://worker.test/api/telegram', {
          method: 'POST',
          headers: { 'X-Telegram-Bot-Api-Secret-Token': 'fixture' },
          body: JSON.stringify({ message: { chat: { id: 42 }, text } }),
        }),
        env,
      );
      return messages.at(-1).text;
    };
    const mail = (uid) =>
      worker.fetch(
        new Request(`https://worker.test/api/orders/${id}/email?version=${version}`, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + tokens.get(uid), 'Content-Type': 'application/pdf' },
          body: '%PDF-1.4\nlocal order\n%%EOF',
        }),
        env,
      );
    assert.equal((await check(env)).ok, true);
    assert.equal(tokens.has(ownerUid), true);
    const appointment = doc(db, 'appointments', 'local-upcoming-test');
    await setDoc(appointment, {
      date: '2031-01-04',
      time: '12:30 PM',
      name: 'Staging client',
      status: 'confirmed',
      service: 'Fit',
      notes: 'NOT IN TELEGRAM',
    });
    const tick = () => worker.scheduled({ scheduledTime: Date.parse('2031-01-04T10:01:00Z') }, env);
    assert.equal((await tick()).upcoming.sent, 1);
    assert.equal((await tick()).upcoming.sent, 0);
    const visit = (await getDoc(appointment)).data();
    assert.equal(visit.studioTelegramNotice.state, 'sent');
    assert.equal(visit.time, '12:30 PM');
    assert.equal(visit.reminderSentAt, undefined);
    assert.equal(messages.filter((m) => m.text?.includes('UPCOMING APPOINTMENT')).length, 1);
    assert.ok(!JSON.stringify(messages).includes('NOT IN TELEGRAM'));
    assert.match(await cmd('/sheets'), /Fixture client.*quotation saved/);
    assert.match(await cmd('/sheet ' + id), /Paid: 850 EGP · Outstanding: 4,150 EGP/);
    assert.match(await cmd('/outstanding'), /1 outstanding of 1 checked on this page · 4,150 EGP/);
    assert.match(await cmd('/receipts ' + id), /Cash · 850 EGP/);
    assert.equal((await check({ ...env, STAFF_EMAIL: accounts[1][1] })).error, 'permission-denied');
    assert.equal((await mail(accounts[1][0])).status, 410);
    assert.equal((await mail(ownerUid)).status, 410);
    assert.equal((await getDoc(quote)).data().emailedVersion, undefined);
    assert.match(await cmd('/sheet ' + id), /prepare a draft.*press Send/i);
  },
);
