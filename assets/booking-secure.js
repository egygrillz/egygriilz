/* EGYGRILLZ – secure booking (drop-in override for booking.html) */
(function () {
  'use strict';

  var slotsInFlight = null;
  var submitting = false;

  function slotDocId(date, time) {
    return String(date || '').trim() + '_' + String(time || '').trim().replace(/[ :]/g, '');
  }

  function todayISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function isQuotaError(err) {
    var code = String((err && err.code) || '').toLowerCase();
    var msg = String((err && err.message) || '').toLowerCase();
    return code === 'resource-exhausted' || msg.indexOf('quota') !== -1 || msg.indexOf('429') !== -1;
  }

  var SLOT_TTL_MS = 3 * 60 * 1000;

  // Public visitors read ONLY upcoming "slots" (date >= today, bounded, cached 3 min)
  window.loadTakenSlots = async function (force) {
    if (!db) return;
    if (!force) {
      if (typeof readSlotCache === 'function') {
        var cached = readSlotCache();
        if (cached) { takenSlots = cached; return; }
      } else {
        try {
          var saved = JSON.parse(localStorage.getItem('egygz_taken_v1_last') || 'null');
          if (saved && saved.map && saved.at && (Date.now() - saved.at) < SLOT_TTL_MS) {
            takenSlots = saved.map;
            return;
          }
        } catch (_) {}
      }
    }
    if (!force && slotsInFlight) return slotsInFlight;

    slotsInFlight = (async function () {
      try {
        var snap = await db.collection('slots')
          .where('date', '>=', todayISO())
          .limit(300)
          .get();
        var map = {};
        snap.forEach(function (doc) {
          var d = doc.data() || {};
          if (d.date && d.time) {
            if (!map[d.date]) map[d.date] = [];
            if (map[d.date].indexOf(d.time) === -1) map[d.date].push(d.time);
          }
        });
        takenSlots = map;
        if (typeof writeSlotCache === 'function') writeSlotCache(map);
        else { try { localStorage.setItem('egygz_taken_v1_last', JSON.stringify({ map: map, at: Date.now() })); } catch (_) {} }
      } catch (e) {
        console.warn('Could not load taken slots:', e);
        if (isQuotaError(e)) {
          try { localStorage.setItem('egygz_fs_quota_until_v1', String(Date.now() + 15 * 60 * 1000)); } catch (_) {}
        }
        try {
          var raw = localStorage.getItem('egygz_taken_v1_last');
          if (raw) takenSlots = JSON.parse(raw).map || {};
        } catch (_) {}
      } finally {
        slotsInFlight = null;
      }
    })();
    return slotsInFlight;
  };

  function resetConfirmBtn(btn) {
    submitting = false;
    if (!btn) return;
    btn.disabled = false;
    btn.textContent = 'Confirm Appointment';
  }

  window.submitBooking = async function () {
    if (submitting) return;
    if (!db) { alert('Booking service is temporarily unavailable. Please message us on WhatsApp.'); return; }
    if (!selectedServices || !selectedServices.length || !selectedDate || !selectedTime) {
      alert('Please select a service, date, and time before confirming.');
      return;
    }

    var name = (document.getElementById('f-name').value || '').trim();
    var phone = (document.getElementById('f-phone').value || '').trim();
    var email = (document.getElementById('f-email').value || '').trim();
    var notes = (document.getElementById('f-notes').value || '').trim();
    var phoneId = phone.replace(/\D/g, '');
    if (!name || phoneId.length < 8 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alert('Please check your name, phone number, and email address.');
      return;
    }

    submitting = true;
    var btn = document.getElementById('confirm-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>Confirming…';
    }

    var FV = firebase.firestore.FieldValue;
    var bookingId = slotDocId(selectedDate, selectedTime);
    var slotRef = db.collection('slots').doc(bookingId);
    // Use the same deterministic ID in both collections. Firestore rules use
    // this link to allow public claims only when the slot and appointment are
    // created together in this transaction.
    var apptRef = db.collection('appointments').doc(bookingId);
    var apptPayload = {
      service: selectedServices.join(', '),
      date: selectedDate,
      time: selectedTime,
      name: name,
      phone: phone,
      email: email,
      notes: notes,
      status: 'confirmed',
      showedUp: null,
      createdAt: FV.serverTimestamp()
    };

    // 1) Atomically check & claim the slot + create the appointment in one transaction
    var booked = false;
    try {
      await db.runTransaction(function (tx) {
        return tx.get(slotRef).then(function (slotSnap) {
          if (slotSnap.exists) {
            var err = new Error('SLOT_TAKEN');
            err.code = 'already-exists';
            throw err;
          }
          tx.set(slotRef, { date: selectedDate, time: selectedTime });
          tx.set(apptRef, apptPayload);
        });
      });
      booked = true;
    } catch (txErr) {
      var code = String((txErr && txErr.code) || '');
      if (txErr && (txErr.message === 'SLOT_TAKEN' || code === 'already-exists')) {
        alert('Sorry, this time was just taken. Please pick another slot.');
        selectedTime = null;
        try { localStorage.removeItem('egygz_taken_v1'); } catch (_) {}
        await window.loadTakenSlots(true);
        resetConfirmBtn(btn);
        goStep(2);
        renderTimeSlots(selectedDate);
        var next2 = document.getElementById('step2-next');
        if (next2) next2.disabled = true;
        return;
      }
      if (isQuotaError(txErr)) {
        alert('Our booking calendar is receiving high traffic right now. Please try again in a few minutes or confirm directly on WhatsApp.');
        resetConfirmBtn(btn);
        return;
      }
      // Do not split the slot claim and appointment write into separate
      // requests. The rules intentionally require both writes in one atomic
      // transaction; a permission error therefore indicates a deployment or
      // configuration issue, not a slot conflict.
      console.error('Booking transaction failed:', txErr);
      alert(code === 'permission-denied'
        ? 'The booking service is temporarily unavailable. Please contact us on WhatsApp.'
        : 'Network error while confirming your appointment. Please check your connection and try again.');
      resetConfirmBtn(btn);
      return;
    }

    if (!booked) { resetConfirmBtn(btn); return; }

    // Update local slot cache immediately so back/revisit reflects this booking with 0 extra reads
    try {
      if (!takenSlots[selectedDate]) takenSlots[selectedDate] = [];
      if (takenSlots[selectedDate].indexOf(selectedTime) === -1) takenSlots[selectedDate].push(selectedTime);
      if (typeof writeSlotCache === 'function') writeSlotCache(takenSlots);
    } catch (_) {}

    // 2) Client record (best effort, never resets existing counters on transient network errors)
    if (phoneId.length >= 8) {
      try {
        var clientRef = db.collection('clients').doc(phoneId);
        try {
          await clientRef.update({
            name: name,
            email: email,
            lastVisit: selectedDate,
            totalAppointments: FV.increment(1),
            services: FV.arrayUnion.apply(FV, selectedServices)
          });
        } catch (e) {
          var errCode = String((e && e.code) || '');
          // Only create a brand-new client record when the doc genuinely doesn't exist
          // (or update is denied on non-existent docs). Never overwrite totalAppointments on network blips.
          if (errCode === 'not-found' || errCode === 'permission-denied') {
            await clientRef.set({
              name: name, phone: phone, email: email,
              totalAppointments: 1, totalNoShows: 0,
              firstVisit: selectedDate, lastVisit: selectedDate,
              services: selectedServices.slice(), notes: '',
              createdAt: FV.serverTimestamp()
            });
          } else {
            console.warn('Client update deferred (transient error):', errCode || e);
          }
        }
      } catch (clientErr) { console.warn('Client record skipped:', clientErr); }
    }

    // 3) Notifications in parallel (EmailJS + Worker Telegram alert) — never stall confirmation
    var serviceText = selectedServices.join(', ');
    var notifications=await Promise.allSettled([
      (window.emailjs && typeof emailjs.send === 'function')
        ? Promise.race([
            emailjs.send('service_r8fhuah', 'template_d2twd6h', {
              to_name: name, to_email: email,
              service: serviceText,
              date: selectedDate, time: selectedTime,
              notes: notes || 'None'
            }),
            new Promise(function (r) { setTimeout(r, 8000); })
          ])
        : Promise.resolve(),
      (window.EGYGZ && EGYGZ.notify && typeof EGYGZ.notify.booking === 'function')
        ? EGYGZ.notify.booking({
            name: name, phone: phone, email: email,
            service: serviceText,
            date: selectedDate, time: selectedTime,
            notes: notes || '',
            ref: apptRef.id
          })
        : Promise.resolve()
    ]);

    // The transaction, not delivery of an alert, is the booking. Never ask
    // the client to submit again if the studio bot is offline.
    var outcome=notifications[1], result=outcome.status==='fulfilled' && outcome.value;
    var alerted=result && Array.isArray(result.channels) && result.channels.some(function(c){return c.c==='telegram' && c.ok;});
    var alertStatus=document.getElementById('booking-alert-result');
    if(alertStatus && !alerted)alertStatus.textContent='Your booking is saved. Instant studio notification was not confirmed; there is no need to book again.';

    // 4) Success screen
    resetConfirmBtn(btn);
    document.querySelectorAll('.step-panel').forEach(function (p) { p.classList.remove('active'); });
    var step5 = document.getElementById('step5');
    if (step5) step5.classList.add('active');
    document.querySelectorAll('.step-label-item').forEach(function (l) { l.classList.add('done'); });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Real phone / email validation
  window.checkStep3 = function () {
    var name = (document.getElementById('f-name').value || '').trim();
    var phone = (document.getElementById('f-phone').value || '').trim();
    var email = (document.getElementById('f-email').value || '').trim();
    var terms = document.getElementById('termsBox').checked;
    var phoneOk = phone.replace(/\D/g, '').length >= 8;
    var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    document.getElementById('step3-next').disabled = !(name && phoneOk && emailOk && terms);
  };

  // Escape user text in the review screen
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  window.renderReview = function () {
    var notes = (document.getElementById('f-notes').value || '').trim();
    function r(k, v) {
      return '<div class="review-row"><span class="review-key">' + esc(k) + '</span><span class="review-val">' + esc(v) + '</span></div>';
    }
    document.getElementById('review-card').innerHTML =
      '<h3>Appointment Summary</h3>' +
      r('Service', (selectedServices || []).join(', ')) +
      r('Date', selectedDate) +
      r('Time', selectedTime) +
      r('Name', (document.getElementById('f-name').value || '').trim()) +
      r('Phone', (document.getElementById('f-phone').value || '').trim()) +
      r('Email', (document.getElementById('f-email').value || '').trim()) +
      (notes ? r('Notes', notes) : '');
  };
})();
