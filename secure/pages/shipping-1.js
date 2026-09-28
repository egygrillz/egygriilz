// ── Header hide/show on scroll + floating logo ──
    (function(){
      const header = document.querySelector('header');
      const floatLogo = document.getElementById('floating-logo');
      let lastY = window.scrollY;
      window.addEventListener('scroll', () => {
        const y = window.scrollY;
        const hiding = y > lastY && y > 80;
        header.classList.toggle('hidden', hiding);
        if (floatLogo) floatLogo.classList.toggle('visible', hiding);
        lastY = y;
      }, { passive: true });
    })();
    document.querySelector('.menu-toggle').addEventListener('click', () => {
      document.querySelector('.main-nav').classList.toggle('active');
      document.body.classList.toggle('menu-open');
    });
