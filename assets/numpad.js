/* ═══════════════════════════════════════════════════════════════════════════
 *  EGYGRILLZ — ON-SCREEN NUMERIC KEYPAD  (one pad, every calculator)
 *  ---------------------------------------------------------------------------
 *  Teeth counts, stone counts and gold rates are typed on a phone at the
 *  counter. A full letter keyboard for them is friction, and the OS number
 *  pad covers half the screen and fights the page layout.
 *
 *  This module renders one big keypad and binds it to numeric fields:
 *
 *      Numpad.attach(container)     // wire every numeric field inside
 *      Numpad.attach(container, {soft:true})   // keep the OS keyboard too
 *
 *  Fields carry `data-pad-mode="decimal"` when a decimal point is expected;
 *  everything else is a whole number and the dot key stays hidden. A field
 *  with `data-numpad="off"` is skipped (used for rate inputs that staff
 *  prefer to type with the OS keyboard).
 *
 *  Nothing here calculates anything — it only writes values into fields and
 *  fires input/change, so both calculators keep their own maths.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var pad = (function () {
    let root = null, target = null, buf = '', allowDecimal = false, initial = '';

    function build() {
      if (root) return root;
      root = document.createElement('div');
      root.className = 'sc-pad';
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-label', 'Number pad');
      root.innerHTML =
        '<div class="sc-pad-head">' +
          '<span class="sc-pad-title">Enter number</span>' +
          '<button type="button" class="sc-pad-close" data-k="close" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="sc-pad-val" data-pad-val>0</div>' +
        '<div class="sc-pad-grid">' +
          [1,2,3,4,5,6,7,8,9].map(n => '<button type="button" class="sc-pad-key" data-k="' + n + '">' + n + '</button>').join('') +
          '<button type="button" class="sc-pad-key sc-pad-dot" data-k=".">.</button>' +
          '<button type="button" class="sc-pad-key" data-k="0">0</button>' +
          '<button type="button" class="sc-pad-key" data-k="del" aria-label="Delete">&larr;</button>' +
          '<button type="button" class="sc-pad-key" data-k="clr">Clear</button>' +
          '<button type="button" class="sc-pad-key wide" data-k="ok">Done</button>' +
        '</div>';
      root.addEventListener('click', onKey);
      document.body.appendChild(root);
      return root;
    }

    function paint() {
      const box = root && root.querySelector('[data-pad-val]');
      if (!box) return;
      /* before the first key the field's own value is shown, dimmed, so the
         staff member can see what they are about to replace */
      box.textContent = buf || initial || '0';
      box.style.color = (buf || initial) ? '' : '#949494';
    }

    function commit() {
      if (!target) return;
      /* nothing typed = leave the existing value exactly as it was */
      if (buf === '') return;
      target.value = buf;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function onKey(ev) {
      const btn = ev.target.closest('.sc-pad-key, .sc-pad-close');
      if (!btn) return;
      const k = btn.dataset.k;
      if (k === 'close' || k === 'ok') { commit(); return close(); }
      if (k === 'del') { buf = buf.slice(0, -1); return paint(); }
      if (k === 'clr') { buf = ''; return paint(); }
      if (k === '.') { if (allowDecimal && buf.indexOf('.') === -1) buf = (buf || '0') + '.'; return paint(); }
      if (/^\d$/.test(k)) {
        if (buf === '0') buf = k; else buf += k;
        if (buf.length > 6) buf = buf.slice(0, 6);
        return paint();
      }
    }

    function open(input) {
      build();
      target = input;
      allowDecimal = String(input.dataset.padMode || input.getAttribute('inputmode') || '') === 'decimal';
      const cur = String(input.value || '').trim();
      initial = /^\d+(\.\d+)?$/.test(cur) ? cur : '';
      buf = '';
      root.querySelector('.sc-pad-title').textContent =
        (input.getAttribute('data-pad-title') || input.getAttribute('aria-label') || input.name || 'Enter number');
      const dot = root.querySelector('.sc-pad-dot');
      if (dot) dot.style.visibility = allowDecimal ? 'visible' : 'hidden';
      paint();
      root.classList.add('open');
      /* keep the field visible above the pad on small screens */
      try { input.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
    }

    function close() {
      if (root) root.classList.remove('open');
      target = null; buf = ''; initial = '';
    }

    function isOpen() { return !!(root && root.classList.contains('open')); }
    function currentTarget() { return target; }
    function sync(v) { buf = String(v == null ? '' : v); paint(); }

    return { open, close, isOpen, target: currentTarget, sync };
  })();


  /* ── pad styles: identical on every page that uses the keypad ── */
  var CSS = `/* on-screen numpad — opened by tapping any numeric field */
.sc-pad{position:fixed;z-index:9999;right:18px;bottom:18px;width:236px;background:#fff;
  border:1px solid #e5e7eb;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.18);
  padding:12px;display:none;font-family:inherit;}
.sc-pad.open{display:block;}
.sc-pad-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}
.sc-pad-title{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#949494;}
.sc-pad-close{border:0;background:none;font-size:16px;line-height:1;color:#949494;cursor:pointer;padding:0 2px;}
.sc-pad-close:hover{color:#1d1d1d;}
.sc-pad-val{font-size:20px;font-weight:600;text-align:right;padding:6px 10px;margin-bottom:8px;
  border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;min-height:38px;
  font-variant-numeric:tabular-nums;overflow:hidden;white-space:nowrap;}
.sc-pad-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;}
.sc-pad-key{font-family:inherit;font-size:16px;font-weight:500;padding:11px 0;border-radius:8px;
  border:1px solid #e5e7eb;background:#fff;color:#1d1d1d;cursor:pointer;transition:background .12s;}
.sc-pad-key:hover{background:#f2f3f4;}
.sc-pad-key:active{background:#e6e8ea;}
.sc-pad-key[data-k="del"],.sc-pad-key[data-k="clr"]{font-size:11px;text-transform:uppercase;letter-spacing:.05em;}
.sc-pad-key[data-k="ok"]{background:#000;color:#fff;border-color:#000;font-size:11px;
  text-transform:uppercase;letter-spacing:.05em;}
.sc-pad-key[data-k="ok"]:hover{background:#232323;}
.sc-pad-key.wide{grid-column:span 2;}`;
  function ensureStyles() {
    if (document.getElementById('numpad-styles')) return;
    var st = document.createElement('style');
    st.id = 'numpad-styles';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }
  ensureStyles();

  /* Wire every numeric field inside `scope`. Re-entrant: fields re-render
     constantly and a field must never be wired twice. */
  function attach(scope, options) {
    if (!scope) return pad;
    ensureStyles();
    const opts = options || {};
    scope.querySelectorAll('input').forEach(function (inp) {
      if (inp.dataset.padWired === '1') return;
      if (inp.dataset.numpad === 'off') return;
      const mode = String(inp.dataset.padMode || inp.getAttribute('inputmode') || '');
      const isNum = mode === 'numeric' || mode === 'decimal' ||
                    inp.type === 'number' || inp.dataset.numpad === '1';
      if (!isNum) return;
      inp.dataset.padWired = '1';
      inp.dataset.padMode = mode === 'decimal' ? 'decimal' : 'numeric';
      /* inputmode="none" stops the OS keyboard covering the screen on a phone;
         the pad supplies the digits. Physical keyboards still type normally. */
      if (!opts.soft) inp.setAttribute('inputmode', 'none');
      inp.addEventListener('focus', function () { pad.open(inp); });
      inp.addEventListener('click', function () { if (!pad.isOpen()) pad.open(inp); });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { pad.close(); inp.blur(); }
      });
      /* someone typing on a real keyboard: mirror the field into the pad */
      inp.addEventListener('input', function () {
        if (!pad.isOpen() || pad.target() !== inp) return;
        pad.sync(inp.value);
      });
    });
    return pad;
  }

  /* Clicking anywhere outside the pad (and not on a number field) closes it. */
  function bindGlobalClose() {
    if (bindGlobalClose.done) return;
    bindGlobalClose.done = true;
    document.addEventListener('pointerdown', function (ev) {
      if (!pad.isOpen()) return;
      if (ev.target.closest('.sc-pad')) return;
      if (ev.target.closest('input[inputmode]')) return;
      pad.close();
    }, true);
  }

  global.Numpad = { attach: attach, pad: pad, bindGlobalClose: bindGlobalClose };
})(window);
