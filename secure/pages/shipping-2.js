// ── Security: block right-click, F12, Ctrl+Shift+I, Ctrl+U, etc. ──
    
    document.addEventListener('dragstart',   e => e.preventDefault());
    document.addEventListener('selectstart', e => { if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') e.preventDefault(); });
    
    // Disable print screen
    document.addEventListener('keyup', e => {
      if (e.key === 'PrintScreen') { navigator.clipboard?.writeText('').catch(()=>{}); }
    });
