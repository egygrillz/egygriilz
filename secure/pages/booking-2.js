// ── FIREBASE INIT ──
    var db = firebase.firestore();
    // ── HEADER SCROLL ──
    (function(){
      var header = document.getElementById('site-header');
      var floatLogo = document.getElementById('floating-logo');
      var lastY = window.scrollY;
      window.addEventListener('scroll', function() {
        var y = window.scrollY;
        var hiding = y > lastY && y > 80;
        header.classList.toggle('hidden', hiding);
        floatLogo.classList.toggle('visible', hiding);
        lastY = y;
      }, { passive: true });
    })();

    
    document.addEventListener('dragstart', function(e) { e.preventDefault(); });
    

    // ── LOAD SETTINGS ──
    function showAvailabilityError(e){document.getElementById('time-grid').textContent='Unable to load times. Please reconnect and select the date again.';document.getElementById('step2-next').disabled=true;}
    async function loadSettings(){
      var epoch=++availabilityEpoch;
      var start=calYear+'-'+pad(calMonth+1)+'-01';
      var end=calYear+'-'+pad(calMonth+1)+'-'+pad(new Date(calYear,calMonth+1,0).getDate());
      var data=await egyCall('availability',{start:start,end:end});
      if(epoch!==availabilityEpoch)return;
      Object.assign(scheduleSettings,data.schedule);takenSlots=data.taken;
    }
    async function loadTakenSlots(){await loadSettings();}
    function cairoWallClock(){var n=egyCairoNow();return new Date(n.date+'T'+String(Math.floor(n.minute/60)).padStart(2,'0')+':'+String(n.minute%60).padStart(2,'0')+':00');}

    // ── CALENDAR ──
    var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    function initCal() {
      var now = cairoWallClock();
      calYear = now.getFullYear();
      calMonth = now.getMonth();
      renderCalendar();
    }

    function renderCalendar() {
      document.getElementById('cal-month-label').textContent = MONTHS[calMonth] + ' ' + calYear;
      var grid = document.getElementById('cal-grid');
      var now = cairoWallClock();

      // Today as YYYY-MM-DD using local time (no UTC shift)
      var todayStr = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());

      // Allow booking up to 60 days ahead
      var maxDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 60);

      var firstDay = new Date(calYear, calMonth, 1).getDay();
      var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
      var html = '';

      for (var i = 0; i < firstDay; i++) html += '<div class="cal-cell empty"></div>';

      for (var d = 1; d <= daysInMonth; d++) {
        var dateStr = calYear + '-' + pad(calMonth + 1) + '-' + pad(d);

        // Use local midnight comparison — avoids UTC timezone shift bug
        var cellDate = new Date(calYear, calMonth, d);
        var todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        var dow = cellDate.getDay();
        var isPast = cellDate < todayMidnight;
        var isTooFar = cellDate > maxDate;
        var isClosedDay = scheduleSettings.openDays.map(Number).indexOf(dow) === -1;
        var isHoliday = scheduleSettings.holidays.indexOf(dateStr) > -1;
        var isDisabled = isPast || isTooFar || isClosedDay || isHoliday;

        var cls = 'cal-cell';
        if (dateStr === todayStr) cls += ' today';
        if (dateStr === selectedDate) cls += ' selected';
        if (isDisabled) cls += ' disabled';

        var onclick = isDisabled ? '' : 'onclick="pickDate(\'' + dateStr + '\')"';
        html += '<button type="button" class="' + cls + '" aria-label="'+dateStr+'" '+(isDisabled?'disabled ':'')+onclick+'>'+d+'</button>';
      }
      grid.innerHTML = html;
    }

    // ── TIME SLOTS ──
    // Respects slotDuration from admin (30/60/90/120 min).
    // Uses local-time date construction to avoid UTC timezone bugs.
    function renderTimeSlots(dateStr) {
      var wrap = document.getElementById('slots-wrap');
      var grid = document.getElementById('time-grid');
      var countEl = document.getElementById('slots-count');
      wrap.style.display = 'block';

      var now = cairoWallClock();
      var todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      var selectedMidnight = parseLocalDate(dateStr);
      var isToday = selectedMidnight.getTime() === todayMidnight.getTime();

      var taken = takenSlots[dateStr] || [];
      var slots = [];
      var stepMins = scheduleSettings.slotDuration || 60;
      var openMins  = parseInt(scheduleSettings.openHour) * 60;
      var closeHourFixed = parseInt(scheduleSettings.closeHour);
      if (closeHourFixed === 0) closeHourFixed = 24; // midnight = end of day
      var closeMins = closeHourFixed * 60;

      for (var m = openMins; m < closeMins; m += stepMins) {
        var slotH = Math.floor(m / 60);
        var slotM = m % 60;

        // For today: require at least 1 hour notice
        if (isToday) {
          var parts = dateStr.split('-');
          var slotDate = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]), slotH, slotM, 0, 0);
          if (slotDate.getTime() <= now.getTime() + 3600000) continue;
        }

        var timeStr = formatTimeHM(slotH, slotM);
        if (taken.indexOf(timeStr) > -1) continue;
        slots.push(timeStr);
      }

      if (!slots.length) {
        var msg = isToday
          ? 'No more slots available today. Please select a different date.'
          : 'No available slots for this date.';
        grid.innerHTML = '<div class="no-slots">' + msg + '</div>';
        countEl.textContent = '0 SLOTS AVAILABLE';
        document.getElementById('step2-next').disabled = true;
        return;
      }

      countEl.textContent = slots.length + ' SLOT' + (slots.length !== 1 ? 'S' : '') + ' AVAILABLE';
      grid.innerHTML = slots.map(function(t) {
        return '<button type="button" class="time-slot' + (t === selectedTime ? ' active' : '') + '" data-time="' + t + '" onclick="pickTime(\'' + t + '\')">' + t + '</button>';
      }).join('');
    }

    // ── STEP 3 VALIDATION ──
    function checkStep3() {
      var name = (document.getElementById('f-name').value || '').trim();
      var phone = (document.getElementById('f-phone').value || '').trim();
      var email = (document.getElementById('f-email').value || '').trim();
      var terms = document.getElementById('termsBox').checked;
      document.getElementById('step3-next').disabled = !(name && phone && email && terms);
    }

    // ── REVIEW ──
    function renderReview() {
      var card = document.getElementById('review-card');
      var name = document.getElementById('f-name').value.trim();
      var phone = document.getElementById('f-phone').value.trim();
      var email = document.getElementById('f-email').value.trim();
      var notes = document.getElementById('f-notes').value.trim();
      card.innerHTML =
        '<h3>Appointment Summary</h3>' +
        row('Service', selectedServices.join(', ')) +
        row('Date', selectedDate) +
        row('Time', selectedTime) +
        row('Name', name) +
        row('Phone', phone) +
        row('Email', email) +
        (notes ? row('Notes', notes) : '');
    }

    function row(k, v) {
      return '<div class="review-row"><span class="review-key">' + k + '</span><span class="review-val">' + String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) + '</span></div>';
    }

    // ── SUBMIT ──
    async function submitBooking() {
      if (!db) { alert('System error. Please try again.'); return; }
      var btn = document.getElementById('confirm-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>Confirming…';

      var name = document.getElementById('f-name').value.trim();
      var phone = document.getElementById('f-phone').value.trim();
      var email = document.getElementById('f-email').value.trim();
      var notes = document.getElementById('f-notes').value.trim();
      var phoneId = phone.replace(/\D/g, '');

      try {
        if(!bookingRequestId){bookingRequestId=sessionStorage.getItem('egy_booking_request')||egyRequestId();sessionStorage.setItem('egy_booking_request',bookingRequestId);}
        var receipt=await egyCall('createBooking', {
          requestId:bookingRequestId,consent:document.getElementById('termsBox').checked,
          service:selectedServices.join(', '), date:selectedDate, time:selectedTime,
          name:name, phone:phone, email:email, notes:notes
        });

        sessionStorage.removeItem('egy_booking_request');bookingRequestId=null;
        document.querySelectorAll('.step-panel').forEach(function(p) { p.classList.remove('active'); });
        document.getElementById('step5').classList.add('active');
        document.querySelectorAll('.step-label-item').forEach(function(l) { l.classList.add('done'); });
        window.scrollTo({ top: 0, behavior: 'smooth' });

      } catch(err) {
        if(['functions/already-exists','functions/invalid-argument'].includes(err.code)){bookingRequestId=null;sessionStorage.removeItem('egy_booking_request');}
        alert(err.message || 'Booking failed. Please try again.');
        loadTakenSlots().then(function(){if(selectedDate)renderTimeSlots(selectedDate);}).catch(console.error);
        btn.disabled = false;
        btn.textContent = 'Confirm Appointment';
      }
    }

    // ── INIT ──
    initCal();
    loadSettings().then(function() {
      renderCalendar();

    }).catch(function(e){document.getElementById('cal-grid').textContent='Booking is temporarily unavailable. Please contact the studio.';console.error(e);});
