/* EGYGRILLZ – secure admin (drop-in override for editx.html) */
(function () {
  // ── Email field on the login screen ──
  var pw = document.getElementById('pw-input');
  if (pw && !document.getElementById('email-input')) {
    var pwGroup = pw.closest('.form-group');
    var g = document.createElement('div');
    g.className = 'form-group';
    g.innerHTML = '<label class="form-label">Email</label>' +
      '<input type="email" class="form-input" id="email-input" autocomplete="username" placeholder="admin email">';
    pwGroup.parentNode.insertBefore(g, pwGroup);
    document.getElementById('email-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') window.doLogin();
    });
  }

  try { firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION); } catch (e) {}

  // ── Login / logout with Firebase Auth ──
  window.doLogin = async function () {
    var until = isLockedOut();
    if (until) {
      document.getElementById('pw-err').textContent = 'Locked out. Try again in ' + Math.ceil((until - Date.now()) / 60000) + ' minute(s).';
      return;
    }
    var email = document.getElementById('email-input').value.trim();
    var pass = document.getElementById('pw-input').value;
    if (!email || !pass) { document.getElementById('pw-err').textContent = 'Enter email and password.'; return; }
    try {
      await firebase.auth().signInWithEmailAndPassword(email, pass);
      setLockout({ attempts: 0, until: 0 });
      document.getElementById('pw-err').textContent = '';
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('app').style.display = 'block';
      initApp();
      syncSlots();
    } catch (e) {
      var d = getLockout();
      d.attempts = (d.attempts || 0) + 1;
      var left = MAX_ATTEMPTS - d.attempts;
      if (d.attempts >= MAX_ATTEMPTS) {
        d.until = Date.now() + LOCKOUT_MS;
        document.getElementById('lockout-msg').style.display = 'block';
        document.getElementById('lockout-msg').textContent = 'Too many failed attempts. Locked out for 15 minutes.';
        document.getElementById('login-btn').disabled = true;
      }
      setLockout(d);
      document.getElementById('pw-err').textContent = left > 0 ? 'Incorrect email or password. ' + left + ' attempt(s) remaining.' : 'Account locked.';
      document.getElementById('pw-input').value = '';
    }
  };

  window.logout = function () {
    try { firebase.auth().signOut(); } catch (e) {}
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    document.getElementById('pw-input').value = '';
    document.getElementById('pw-err').textContent = '';
  };

  // ── Keep public "slots" in sync with appointments ──
  function slotId(d, t) { return d + '_' + String(t).replace(/[ :]/g, ''); }
  var syncing = false;
  window.syncSlots = async function () {
    if (syncing || !firebase.auth().currentUser) return;
    syncing = true;
    try {
      var a = await db.collection('appointments').get();
      var s = await db.collection('slots').get();
      var want = {}, have = {}, ops = [];
      a.forEach(function (doc) {
        var d = doc.data();
        if (d.date && d.time && d.status !== 'cancelled') want[slotId(d.date, d.time)] = { date: d.date, time: d.time };
      });
      s.forEach(function (doc) { have[doc.id] = 1; });
      Object.keys(want).forEach(function (id) { if (!have[id]) ops.push({ id: id, set: want[id] }); });
      Object.keys(have).forEach(function (id) { if (!want[id]) ops.push({ id: id }); });
      for (var i = 0; i < ops.length; i += 400) {
        var b = db.batch();
        ops.slice(i, i + 400).forEach(function (o) {
          var ref = db.collection('slots').doc(o.id);
          if (o.set) b.set(ref, o.set); else b.delete(ref);
        });
        await b.commit();
      }
    } catch (e) { console.warn('syncSlots failed:', e); }
    syncing = false;
  };

  ['loadAppointments', 'loadOverview'].forEach(function (n) {
    var f = window[n];
    if (typeof f !== 'function') return;
    window[n] = function () {
      var r = f.apply(this, arguments);
      Promise.resolve(r).then(window.syncSlots);
      return r;
    };
  });
})();
