/**
 * EGYGRILLZ — drop-in replacement for the CallMeBot call.
 * Add to booking.html / contact.html (before </body>):
 *
 *   <script src="/assets/egygz-notify.js" defer></script>
 *
 * Then replace the old fetch(...callmebot...) line with:
 *
 *   await EGYGZ.notify.booking({ name, phone, email, service, date, time, notes, ref });
 *   await EGYGZ.notify.message({ name, phone, email, message, ref });
 *   await EGYGZ.notify.mould({ name, phone, email, arches, archCount, total, address, mapLink, ref });
 *
 * Nothing secret is exposed here — the Worker holds all keys.
 */
(function () {
  var ENDPOINT = 'https://egygillz-api.egygrillz.workers.dev/api/notify';

  function turnstileToken() {
    try {
      return (window.turnstile && window.turnstile.getResponse && window.turnstile.getResponse()) || '';
    } catch (e) { return ''; }
  }

  function send(type, data) {
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: type, data: data || {}, turnstile: turnstileToken() })
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .catch(function (e) { console.warn('[EGYGZ] notify failed (non-blocking):', e); return { ok: false }; });
  }

  window.EGYGZ = window.EGYGZ || {};
  window.EGYGZ.notify = {
    booking: function (d) { return send('booking', d); },
    message: function (d) { return send('message', d); },
    /* At-home mould kit order → Telegram alert with the map pin */
    mould: function (d) { return send('mould', d); }
  };
})();
