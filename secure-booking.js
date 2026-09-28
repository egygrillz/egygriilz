/* EGYGRILLZ – secure booking (drop-in override for booking.html) */
(function () {
  function slotDocId(date, time) { return date + '_' + String(time).replace(/[ :]/g, ''); }

  // Public visitors now read only the "slots" collection (date + time, no personal data)
  window.loadTakenSlots = async function () {
    if (!db) return;
    try {
      var snap = await db.collection('slots').get();
      takenSlots = {};
      snap.forEach(function (doc) {
        var d = doc.data();
        if (d.date && d.time) {
          if (!takenSlots[d.date]) takenSlots[d.date] = [];
          takenSlots[d.date].push(d.time);
        }
      });
    } catch (e) { console.warn('Could not load taken slots:', e); }
  };

  window.submitBooking = async function () {
    if (!db) { alert('System error. Please try again.'); return; }

    var btn = document.getElementById('confirm-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Confirming…';

    var name = document.getElementById('f-name').value.trim();
    var phone = document.getElementById('f-phone').value.trim();
    var email = document.getElementById('f-email').value.trim();
    var notes = document.getElementById('f-notes').value.trim();
    var phoneId = phone.replace(/\D/g, '');
    var FV = firebase.firestore.FieldValue;

    // 1) Claim the slot (fails if someone else already took it)
    try {
      await db.collection('slots').doc(slotDocId(selectedDate, selectedTime)).set({ date: selectedDate, time: selectedTime });
    } catch (slotErr) {
      console.warn('Slot claim failed:', slotErr);
      alert('Sorry, this time was just taken. Please pick another slot.');
      selectedTime = null;
      await loadTakenSlots();
      btn.disabled = false;
      btn.textContent = 'Confirm Appointment';
      goStep(2);
      renderTimeSlots(selectedDate);
      document.getElementById('step2-next').disabled = true;
      return;
    }

    // 2) Create the appointment
    try {
      await db.collection('appointments').add({
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
      });
    } catch (err) {
      console.error('Booking error:', err);
      alert('Oops! There was a problem. Please try again.');
      btn.disabled = false;
      btn.textContent = 'Confirm Appointment';
      return;
    }

    // 3) Client record (best effort, never blocks the booking)
    try {
      var clientRef = db.collection('clients').doc(phoneId);
      try {
        await clientRef.update({
          lastVisit: selectedDate,
          totalAppointments: FV.increment(1),
          services: FV.arrayUnion.apply(FV, selectedServices)
        });
      } catch (e) {
        await clientRef.set({
          name: name, phone: phone, email: email,
          totalAppointments: 1, totalNoShows: 0,
          firstVisit: selectedDate, lastVisit: selectedDate,
          services: selectedServices, notes: '',
          createdAt: FV.serverTimestamp()
        });
      }
    } catch (clientErr) { console.warn('Client record skipped:', clientErr); }

    // 4) Notifications
    try {
      await emailjs.send('service_r8fhuah', 'template_d2twd6h', {
        to_name: name, to_email: email,
        service: selectedServices.join(', '),
        date: selectedDate, time: selectedTime,
        notes: notes || 'None'
      });
    } catch (emailErr) { console.warn('EmailJS error:', emailErr); }

    try {
      var msg = encodeURIComponent(
        '📅 New Appointment — EGYGRILLZ\n' +
        '👤 ' + name + '\n' +
        '📞 ' + phone + '\n' +
        '✉️ ' + email + '\n' +
        '💎 ' + selectedServices.join(', ') + '\n' +
        '📆 ' + selectedDate + ' at ' + selectedTime +
        (notes ? '\n📝 ' + notes : '')
      );
      await fetch('https://api.callmebot.com/whatsapp.php?phone=+201000353839&text=' + msg + '&apikey=5240719');
    } catch (waErr) { console.warn('WhatsApp error:', waErr); }

    // 5) Success screen
    document.querySelectorAll('.step-panel').forEach(function (p) { p.classList.remove('active'); });
    document.getElementById('step5').classList.add('active');
    document.querySelectorAll('.step-label-item').forEach(function (l) { l.classList.add('done'); });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
})();
