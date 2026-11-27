// Browser fixture for the two legacy compat panels.
if (!globalThis.firebase) {
  const user = {
    uid: 'demo-staff',
    email: 'admin@egygrillz.com',
    get emailVerified() {
      return localStorage.__testDenied !== '1';
    },
    reload: async () => {},
    sendEmailVerification: async () => {},
    getIdToken: async () => 'fake',
  };
  const auth = () => ({
    currentUser: user,
    onAuthStateChanged(cb) {
      setTimeout(() => cb(user), 0);
      return () => {};
    },
    setPersistence: async () => {},
  });
  auth.Auth = { Persistence: { LOCAL: 'local' } };
  let app;
  const mk = (col, id) => {
    const r = {
      col,
      id,
      collection: (k) => mk(k),
      doc: (i) => mk(col, i),
      where: () => r,
      orderBy: () => r,
      limit: () => r,
      startAfter: () => r,
      get: async (opts) => {
        if (['appointments', 'clients'].includes(col) && localStorage.__testDenied === '1') {
          if (id === 'editx-access-probe-v1' && opts?.source !== 'server')
            throw new Error('Expected a private server probe');
          throw Object.assign(new Error('Fixture denied'), { code: 'permission-denied' });
        }
        const tbl = JSON.parse(localStorage.__fixture)[col] || {};
        if (id) return { id, exists: !!tbl[id], data: () => tbl[id] };
        const docs = Object.entries(tbl).map(([id, d]) => ({ id, exists: true, data: () => d }));
        return { docs, empty: !docs.length, size: docs.length, forEach: (cb) => docs.forEach(cb) };
      },
      onSnapshot: (cb) => {
        r.get().then(cb);
        return () => {};
      },
      set: async (data, o) => {
        const db = JSON.parse(localStorage.__fixture);
        db[col] ||= {};
        db[col][id] = o?.merge ? { ...db[col][id], ...data } : data;
        localStorage.__fixture = JSON.stringify(db);
      },
    };
    return r;
  };
  const firestore = () => ({ app, collection: (k) => mk(k), enablePersistence: async () => {} });
  firestore.FieldValue = { increment: (x) => x, serverTimestamp: () => new Date(), arrayUnion: (...a) => a };
  window.firebase = {
    initializeApp: (options) => (app = { options }),
    firestore,
    auth,
    appCheck: () => ({ activate() {} }),
  };
}
