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
    

    async function sendMessage() {
      var name = (document.getElementById('c-name').value || '').trim();
      var email = (document.getElementById('c-email').value || '').trim();
      var message = (document.getElementById('c-message').value || '').trim();
      if (!name || !email || !message) { return; }

      var btn = document.getElementById('submit-btn');
      var errEl = document.getElementById('c-error');
      btn.disabled = true;
      btn.textContent = 'Sending…';
      errEl.style.display = 'none';

      try {
        var requestId=sessionStorage.getItem('egy_contact_request')||egyRequestId();sessionStorage.setItem('egy_contact_request',requestId);
        await egyCall('contactMessage',{requestId:requestId,name:name,email:email,message:message});
        sessionStorage.removeItem('egy_contact_request');

        // Success
        document.getElementById('form-wrapper').style.display = 'none';
        document.getElementById('success-message').style.display = 'block';

      } catch(err) {
        if(['functions/already-exists','functions/invalid-argument'].includes(err.code))sessionStorage.removeItem('egy_contact_request');
        errEl.textContent=err.message||'Message could not be sent. Try again.';
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Send Message';
      }
    }
