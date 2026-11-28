/* Create an UNSENT draft in the mailbox the operator chooses. Tokens, MIME and
   PDFs never pass through the Worker, Firestore or device storage. No send API. */
(function (root) {
  'use strict';
  const scope = 'https://www.googleapis.com/auth/gmail.compose';
  const clientIdOK = (id) => typeof id === 'string' && /^[\w-]+\.apps\.googleusercontent\.com$/.test(id);
  let loading;
  function loadIdentity() {
    if (root.google?.accounts?.oauth2) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const fail = () => {
        clearTimeout(timer);
        script.remove();
        loading = null;
        reject(Error('Google sign-in did not load. Check your connection or use the file-sharing option.'));
      };
      const timer = setTimeout(fail, 12000);
      script.onload = () => {
        clearTimeout(timer);
        root.google?.accounts?.oauth2 ? resolve() : fail();
      };
      script.onerror = fail;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      document.head.append(script);
    });
    return loading;
  }
  // Called directly from a click, while a popup can still be opened.
  function authorize(id) {
    return new Promise((resolve, reject) => {
      if (!clientIdOK(id))
        return reject(Error('Set the Google web client ID in EditX → Site settings → Quotations.'));
      const fail = () =>
        reject(Error('Gmail was not authorized. Allow the Google popup and draft permission to continue.'));
      const client = root.google.accounts.oauth2.initTokenClient({
        client_id: id,
        scope: scope + ' email',
        include_granted_scopes: false,
        callback: (r) =>
          r.access_token && !r.error && String(r.scope).split(' ').includes(scope)
            ? resolve(r.access_token)
            : fail(),
        error_callback: fail,
      });
      client.requestAccessToken({ prompt: 'select_account' });
    });
  }
  const utf8 = (s) => new TextEncoder().encode(s);
  function b64(bytes) {
    const parts = [];
    for (let i = 0; i < bytes.length; i += 0x6000)
      parts.push(btoa(String.fromCharCode(...bytes.subarray(i, i + 0x6000))));
    return parts.join(''); // chunk size is divisible by three
  }
  const lines = (s) => s.match(/.{1,76}/g)?.join('\r\n') || '';
  async function rawMessage(fields, files, sender) {
    if (![sender, fields.to].every(OrderEmail.validRecipient)) throw Error('Check the sender and recipient.');
    if (
      files.length !== 2 ||
      files.some((f) => !f.size || f.type !== 'application/pdf' || !/^[\w.-]+\.pdf$/i.test(f.name)) ||
      files.reduce((n, f) => n + f.size, 0) > 12 * 1024 * 1024
    )
      throw Error('Two valid PDF attachments are required (12 MB combined maximum).');
    const bound = 'egz-' + crypto.randomUUID();
    const parts = [
      'MIME-Version: 1.0',
      'From: ' + sender,
      'To: ' + fields.to,
      'Subject: =?UTF-8?B?' + b64(utf8(fields.subject)) + '?=',
      'Content-Type: multipart/mixed; boundary="' + bound + '"',
      '',
      '--' + bound,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      lines(b64(utf8(fields.body))),
    ];
    for (const f of files)
      parts.push(
        '--' + bound,
        'Content-Type: application/pdf',
        'Content-Disposition: attachment; filename="' + f.name + '"',
        'Content-Transfer-Encoding: base64',
        '',
        lines(b64(new Uint8Array(await f.arrayBuffer()))),
      );
    parts.push('--' + bound + '--', '');
    return b64(utf8(parts.join('\r\n')))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '');
  }
  async function create(token, fields, files, stillCurrent, request = fetch) {
    const options = {
      headers: { Authorization: 'Bearer ' + token },
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    };
    const identity = await request('https://www.googleapis.com/oauth2/v3/userinfo', options);
    const mailbox = identity.ok && (await identity.json()).email;
    if (!OrderEmail.validRecipient(mailbox))
      throw Error('Could not confirm the chosen Gmail account. No draft was uploaded.');
    const raw = await rawMessage(fields, files, mailbox);
    if (!stillCurrent()) throw Error('The order changed. Prepare both PDFs again.');
    let response, draft;
    try {
      response = await request('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
        ...options,
        method: 'POST',
        headers: { ...options.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { raw } }),
      });
      if (response.ok) draft = await response.json();
    } catch {
      throw Error('Creation was not confirmed. Check Gmail Drafts before trying again.');
    }
    if (!response.ok)
      throw Error(
        'Gmail did not confirm the draft (' +
          response.status +
          '). Check the Gmail API, account permission and Drafts before retrying.',
      );
    const inbox = 'https://mail.google.com/mail/?authuser=' + encodeURIComponent(mailbox) + '#drafts';
    if (!draft?.id) throw Error('Check Gmail Drafts before retrying; no draft ID was returned.');
    return {
      inbox,
      url: inbox + (/^[a-z0-9_-]+$/i.test(draft.message?.threadId || '') ? '/' + draft.message.threadId : ''),
    };
  }
  root.OrderGmail = { clientIdOK, loadIdentity, authorize, rawMessage, create };
})(globalThis);
