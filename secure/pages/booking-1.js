var selectedServices = [];
    var selectedDate = null;
    var selectedTime = null;
    var calYear = new Date().getFullYear();
    var calMonth = new Date().getMonth();
    var takenSlots = {};
    var availabilityEpoch=0;
    var bookingRequestId=null;
    var scheduleSettings = {
      openDays: [0,1,2,3,4,6],
      openHour: 16,
      closeHour: 22,
      slotDuration: 60,
      holidays: []
    };
    var currentStep = 1;

    function toggleService(el, val) {
      var idx = selectedServices.indexOf(val);
      if (idx > -1) {
        selectedServices.splice(idx, 1);
        el.classList.remove('active');
      } else {
        selectedServices.push(val);
        el.classList.add('active');
      }
      var btn = document.getElementById('step1-next');
      if (btn) btn.disabled = selectedServices.length === 0;
    }

    function goStep(n) {
      if (n === 2 && selectedServices.length === 0) return;
      if (n === 3 && !selectedDate) return;
      if (n === 4 && !selectedTime) return;
      currentStep = n;
      document.querySelectorAll('.step-panel').forEach(function(p) { p.classList.remove('active'); });
      var panel = document.getElementById('step' + n);
      if (panel) panel.classList.add('active');
      updateStepIndicators(n);
      if (n === 2) renderCalendar();
      if (n === 4) renderReview();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      var heading=document.querySelector('.step-panel.active h1,.step-panel.active h2');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
    }

    function calPrev() {
      calMonth--;
      if (calMonth < 0) { calMonth = 11; calYear--; }
      renderCalendar();
      loadTakenSlots().catch(showAvailabilityError);
    }
    function calNext() {
      calMonth++;
      if (calMonth > 11) { calMonth = 0; calYear++; }
      renderCalendar();
      loadTakenSlots().catch(showAvailabilityError);
    }

    async function pickDate(dateStr) {
      selectedDate = dateStr;
      selectedTime = null;
      renderCalendar();
      document.getElementById('step2-next').disabled=true;
      document.getElementById('time-grid').textContent='Loading available times…';
      try{await loadTakenSlots();if(selectedDate===dateStr)renderTimeSlots(dateStr);}catch(e){showAvailabilityError(e);}
    }

    function pickTime(t) {
      selectedTime = t;
      document.querySelectorAll('.time-slot').forEach(function(s) { s.classList.remove('active'); });
      var all = document.querySelectorAll('.time-slot');
      for (var i = 0; i < all.length; i++) {
        if (all[i].dataset.time === t) all[i].classList.add('active');
      }
      document.getElementById('step2-next').disabled = false;
    }

    function updateStepIndicators(n) {
      document.querySelectorAll('.step-dot').forEach(function(d, i) {
        d.classList.toggle('active', i + 1 === n);
        d.classList.toggle('done', i + 1 < n);
      });
      document.querySelectorAll('.step-label-item').forEach(function(l, i) {
        l.classList.toggle('active', i + 1 === n);
        l.classList.toggle('done', i + 1 < n);
      });
    }

    function toggleMenu() {
      document.querySelector('.main-nav').classList.toggle('active');
      document.body.classList.toggle('menu-open');
    }

    // ── HELPERS ──
    function pad(n) { return n < 10 ? '0' + n : '' + n; }

    // Parse "YYYY-MM-DD" safely into a local Date (midnight local time)
    // Avoids the UTC-shift bug from new Date("YYYY-MM-DD") which gives midnight UTC
    function parseLocalDate(dateStr) {
      var parts = dateStr.split('-');
      return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }

    // Build a local Date for a specific date + hour
    function makeSlotDate(dateStr, hour) {
      var parts = dateStr.split('-');
      return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), hour, 0, 0, 0);
    }

    function formatTime(h) {
      var ampm = h >= 12 ? 'PM' : 'AM';
      var h12 = h % 12 || 12;
      return pad(h12) + ':00 ' + ampm;
    }

    // formatTimeHM: supports 30-min slots (e.g. "04:30 PM")
    function formatTimeHM(h, min) {
      var ampm = h >= 12 ? 'PM' : 'AM';
      var h12 = h % 12 || 12;
      return pad(h12) + ':' + pad(min) + ' ' + ampm;
    }
