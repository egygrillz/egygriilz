// Compose links, not delivery. Only client-facing fields from the issued quote belong in this draft.
(function (root) {
  const validRecipient = (s) =>
    typeof s === 'string' && s.length <= 254 && /^[^\s<>,;@]+@[^\s<>,;@]+\.[^\s<>,;@]+$/u.test(s);
  function compose(q) {
    const to = String(q.clientEmail || '').trim();
    if (!validRecipient(to)) throw new Error('Enter one valid client email address.');
    const name = String(q.clientName || '')
      .replace(/\s+/g, ' ')
      .trim();
    const subject = `Your EGYGRILLZ order and quotation · ${q.orderNo}`;
    const body = `Hello${name ? ' ' + name : ''},\n\nHere are your order sheet and quotation for ${q.orderNo}. Please review both documents and reply if anything needs changing.\n\nThank you,\nEGYGRILLZ`;
    const enc = encodeURIComponent;
    return {
      gmail: `https://mail.google.com/mail/?view=cm&fs=1&tf=1&to=${enc(to)}&su=${enc(subject)}&body=${enc(body)}`,
      mailto: `mailto:${enc(to)}?subject=${enc(subject)}&body=${enc(body.replaceAll('\n', '\r\n'))}`,
    };
  }
  root.OrderEmail = { validRecipient, compose };
})(globalThis);
