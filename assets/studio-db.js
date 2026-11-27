// One modular SDK/app for staff Auth, records and settings (same session as EditX).
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { firebaseApp } from './firebase-auth-gate.js?v=2';

export const db = getFirestore(firebaseApp());
export const settingsDb = {
  _egygzProjectId: db.app.options.projectId,
  async _egygzGet(collection, id) {
    const snap = await getDoc(doc(db, collection, id));
    return { exists: snap.exists(), data: snap.exists() ? snap.data() : null };
  },
  _egygzSet: (collection, id, data, merge = true) => setDoc(doc(db, collection, id), data, { merge }),
};
