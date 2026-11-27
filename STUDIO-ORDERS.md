# Studio orders and quotations

Start at **`/order-sheet`**, or open a client in **EditX → Clients → Open order sheet**. For a local static server without clean URLs, use `/order-sheet.html`. The [Marten sample quotation](examples/EGYGRILLZ-Quotation-Marten.pdf) is a generated example, not a database export.

## From fitting to invoice

1. **Client:** choose a record or type the details. The authenticated directory combines up to 500 recent appointments and 300 client records by phone number. If the client is outside that list, open their record in EditX. EditX passes the record ID in session storage; no name or phone goes in the URL. If Firebase is unavailable, manual entry and local drafts still work.
2. **Design:** enter the name, mode and material. Select the outlined teeth (Mix lets you choose the material per tooth) and press **Start drawing**. Draw with a mouse, pen or one finger. Two fingers zoom. Enamel fill asks for a palette, then fills the tooth you tap; Undo restores the previous fill. **Finish drawing → Design details** also works for a plain, unmarked tooth. Review level/plating, gold purity if applicable, and only the laser, enamel and stones actually used. Press **Apply details to estimate**. To work on another piece, use **Select teeth for new design**; layer chips take you back. Saving an applied **studio template** includes that layer’s artwork; loading it creates a new layer.
3. **Pricing:** add services, set the timeline/mold and check **Price breakdown**. Enter an agreed total or deposit if needed; zero is valid. **Use calculator** and **Use studio %** restore automatic calculation. Apply unfinished designs and resolve missing gold/stone rates before issuing the quote. If the studio settings or a gold rate are last-known only, refresh or explicitly confirm the estimate; the caveat travels with the quotation.
4. **Review:** check the production instructions and capture approval. **Print order sheet** produces the production document with an illustration for each layer and the signature. **Download quotation PDF** produces the client’s priced quotation, not a copy of the signed sheet. **Save to Quotes** writes a priced snapshot; **Open saved quotation** opens the same record. In Quotes, downloading from **history** uses issued amounts; opening the editor is for revising a quote. **Prepare invoice** creates a new pending invoice draft. Check it and save it separately.

**Storage:** local drafts include client details, drawings and signatures. Use a trusted studio browser, not a shared/public device; clearing browser data removes local drafts. A shared template contains artwork but not the client or signature. A saved quotation contains client details, notes, the specs and the priced order, not signature or canvas images. Keep a printed/saved copy of the final signed sheet; a local draft is editable, not an immutable approval log. Ask the client to review and sign again after changing their design.

## Which price is used?

| Input | Source / behavior |
| --- | --- |
| Material, level, finish, stones, timeline, mold, rounding, default production deposit | EditX / studio **`settings/pricing`** in `egygrillz-studio`. `assets/calc-engine.js` applies the same pricing model to design groups and services. Built-in defaults include rounding **up** to 50 EGP and a 50% deposit; these are not hard-coded Order screen prices. |
| Consultation, impression and toothgem service defaults | `settings/site` (`consultPrice`, `impressionPrice`, `gemFromPrice`), unless `settings/pricing.servicePrices` explicitly sets that service. An explicit per-order service unit price, including zero, takes precedence. |
| Gold | `assets/rates.js` gets the live pair from the Worker, with a direct-feed fallback. 24K EGP/g = USD per troy ounce ÷ 31.1034768 × USD/EGP. Order refuses a gold quote without a rate. A stale usable rate is distinguished from a fresh rate. |
| Design details → pricing | `assets/order-design.js` describes the artwork for review. `assets/order-pricing.js` reads **applied groups only**, not raw strokes or stones. A changed billable detail blocks issue until reapplied; it does not silently change the last applied price. No stale options for effects that were undone. Partial ice is per covered tooth, hand-set stones by quantity and setting. V1 drafts/templates freeze their old breakdown (including preset accents); explicitly reviewing an imported layer replaces that breakdown. |
| Enamel | Count distinct colours visible in the fill, not brush taps: 1 Single, 2 Multi, **3 or more Master**, no palette length cap. Exactly 3 was the unspecified boundary; this implementation includes it in Master. Shared mode counts the design palette on enamelled teeth only; Mix counts each tooth separately. A plain tooth has no enamel charge. |
| Shared code vs issued document | An `EGZ-…` code is a transferable **specification**, not proof of an agreed total, payment or signature. Codes can include client information: share intentionally. Use the saved quotation or invoice handoff for an agreed price. History and Telegram `/pdf` use the stored priced snapshot; the Worker does not substitute today’s gold rate. An old record without priced items cannot reproduce an issued PDF. |
| Payment terms | The public Calculator retains its existing **100% production payment** for new estimates; an imported code uses its own percentage. The booking page’s **50% appointment deposit** is a separate term. Order uses the studio production default; Quotes/staff can quote different terms. **Deposit due is never deposit paid.** Both invoice builders start imports pending, with zero collected; the amount due travels in the notes. |

`buildQuotePdfBytes` in `assets/calc-engine.js` is the quotation layout for Order, Calculator, both staff routes, Quotes and the Worker. The signed production sheet, accounting invoice and bot reports are different documents. The quotation uses standard PDF Helvetica and transliterates Arabic text; it does not provide native RTL typography.

**Reference check:** the four single-tooth designs in the Marten fixture are 1,650 + 1,000 + 1,100 + 1,250 = **5,000 EGP**. Its two A4 pages reproduce the supplied reference’s text, font sizes and vertical positions. This is a layout match, not a claim that the PDFs are byte-for-byte identical. The regression test separately checks that Telegram and the browser engine produce identical bytes from the same snapshot and metadata.

## Firestore access — studio project only

The complete proposed rules are in **[`firestore.rules`](firestore.rules)**; `firebase.json` points to that file. Do **not** publish these to the separate staff chat/assistant project. Notes on the access boundary:

- Public: get the listed settings documents (pricing, site, schedule, catalog, banners, crops and visibility); read availability slots, catalog, banners and stats. No listing the settings collection. Never put secrets in a public settings document.
- Public booking: create **both** the appointment and slot in one transaction. Their ID is `YYYY-MM-DD_hhmmAM` or `…PM`, with a **zero-padded** hour (`01:00 PM` → `0100PM`). Neither a lone claim nor a public overwrite is allowed. Only slots are publicly readable. A well-formed first client record can be created; a returning visitor cannot read/update an existing client. The client profile write is best effort and does not undo a successful booking. Staff can reconcile profiles with appointments in EditX.
- Public mould orders and contact messages remain create-only. Quotes, invoices, templates, client records and appointments are not a public directory. No public quotation write is needed to download a local estimate. Unlisted collection paths are denied.
- A staff member must sign in **to `egygrillz-studio`** and satisfy **one** of: boolean `staff`/`admin` custom claim set by a trusted admin; an explicit UID in `staffUids()` (initially empty); or the verified email **`admin@egygrillz.com`**. No other email alone grants access. Sign out and back in after changing claims. A chat-project login, an API key or a client-side UI label is not studio authorization.
- The Worker account needs the same studio authorization for private reads. Configure `FIREBASE_API_KEY`, `STAFF_EMAIL`, `STAFF_PASSWORD`, `TELEGRAM_BOT_TOKEN` and the intended `TELEGRAM_CHAT_ID` in Worker settings, not in this repository. Keep the existing endpoint/webhook controls and secrets configured. Browser privacy also depends on securing the studio device: rules do not erase previously saved local data.

### If EditX signs in but shows no records

1. Open **EditX** and sign in to the existing **`admin@egygrillz.com`** account. EditX tests private reads against the **server** before opening the dashboard; a public pricing read or a local “signed in” flag is not proof of access.
2. If the prompt says **Verify**, use **Send verification email**, open the Firebase link for that account, then press **Retry access**. This reloads the user and refreshes the ID token. **No second account is needed.**
3. If the mailbox is unavailable, the project owner can confirm the **existing** account in Firebase Console → Authentication → Users and add **that exact UID** to `staffUids()` in `firestore.rules`, then publish to `egygrillz-studio`. A trusted admin-set boolean claim is another option. Do **not** grant all signed-in users access, turn off verification for email, or enter a password in source code.
4. If a verified user still sees **Private reads denied**, compare the published studio rules and check App Check enforcement for the web app. If the error is quota/network, check usage/connectivity instead of changing rules. Once authorized, the Clients panel includes older profiles without `lastVisit`. EditX no longer substitutes a saved private list after a denied read.

### Telegram: three different actions

| Action | Recipient and requirement |
| --- | --- |
| New website booking | The existing public notifier sends an **instant studio alert** after the Firestore transaction. If `TURNSTILE_SECRET` is enabled, configure its matching **public** `TURNSTILE_SITE_KEY` and allowed site hosts; the booking review shows the widget. A missing alert is **not** a failed booking: do not submit again. |
| **EditX → Appointments → Tomorrow → Studio Telegram** | Sends tomorrow’s active appointments (Cairo calendar date) to the **configured studio chat**, not to clients. The Worker checks Firestore with the caller’s Firebase ID token and returns a delivery result, not the client list. No browser bot token or cron secret. **Open client Gmail reminders** is a separate action. |
| Daily digest | Set **one** Cloudflare Cron Trigger `* * * * *` on `egygillz-api` (also in `wrangler.jsonc`). At **12:00 Africa/Cairo**, using the event’s scheduled time, it sends tomorrow’s schedule including an explicit empty day. Do not also configure a fixed 10:00 UTC trigger. This does not mark client emails as sent. |

Set `FIREBASE_API_KEY`, `STAFF_EMAIL` (the same studio admin), `STAFF_PASSWORD`, `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in **Cloudflare → Worker → Settings**. Start the bot in that chat / give it permission to post. `GET /api/health` reports configured channels, **not delivery**; `GET /api/telegram/check` checks the bot’s Firestore sign-in/read, **not Telegram delivery**. Test with a disposable staging appointment and private staging chat; verify the actual message and the scheduled invocation log (`[cron] appointment digest`). A 401/403 from Telegram points to the bot token/chat or posting rights; `permission-denied` from Firestore points to the studio identity/rules. Long digests split into parts; check the chat before retrying a partial or unconfirmed send.

The dashboard sends `POST /api/remind` with a Firebase **Bearer** token. A server operator can instead use a configured `X-Cron-Key` over HTTPS. Anonymous calls and GETs are refused. Telegram **polling** uses the minute trigger; if using a **webhook**, set `TELEGRAM_WEBHOOK_SECRET`, set `CRON_SECRET`, and re-register with `POST /api/telegram/setup` using `X-Cron-Key` (not a secret in the URL). Setup/polling is separate from outgoing reminders. Do not set up both polling and a webhook for incoming commands; polling automatically skips an active webhook.

## Reproduce the checks

Run from the repository root. No production credentials are required.

```sh
# Pricing, PDF/pagination, code round trips, invoice reconciliation, mocked Worker
npm --prefix tests run unit

# Pinned test SDKs and browser controller (Node 22)
npm ci --prefix tests

# Terminal 1: static site. Use .html URLs with this server.
python3 -m http.server 8000 --bind 127.0.0.1
# Terminal 2: point to a local Chromium compatible with the pinned Playwright,
# or install its managed Chromium with tests/node_modules/.bin/playwright-core install chromium.
CHROMIUM_EXECUTABLE=/path/to/chromium npm --prefix tests run browser

# Official Firebase CLI + Java, isolated demo project, local emulator only
firebase emulators:exec --only firestore --project demo-egygrillz \
  'node --test tests/firestore-rules.test.mjs'
```

The two browser journeys use synthetic records and intercept external services. They exercise desktop mouse and mobile touch strokes, actual canvas pixels and viewport width, undo/review/pricing, template/draft round trips, verification/retry and Telegram UI states, booking alerts, PDFs and invoices. They do **not** verify real sign-in, delivery or production permissions. The rules suite uses the real Firebase test SDK with fixture identities; it refuses non-loopback emulator addresses. During development it passed locally with **Fireemu 0.69.0** (strict profile), an independent, **unofficial** emulator. The official emulator and staging project still need to be checked.

## Publishing checklist (not performed by this change)

1. Run the tests, including the official emulator. Back up the currently published rules/Worker. Check the intended studio staff and Worker identities; verify anonymous booking, denied private reads, saved-quote history and invoice transfer with disposable **staging** records. Also verify the existing mould/contact and staff-admin paths.
2. Publish the HTML and versioned assets together; `/assets/*` is cached immutable. The staff assistant can keep its own chat database, but its pricing editor must target studio settings. A site-only publish does **not** update Firestore rules or the deployed Worker.
3. When authorized, publish **only** studio rules with `firebase deploy --only firestore:rules --project egygrillz-studio`, or paste the entire `firestore.rules` into that project’s Firestore Rules editor. No index/data migration is part of this change.
4. **Module/bundled Worker:** use `cloudflare-worker.js` as the existing Worker’s entry point with `assets/calc-engine.js` resolvable at build time. **Dashboard single-file editor:** generate the ES module below and use its entire output instead of pasting the unbundled entry. Keep bindings, secrets, routes and cron settings on the intended Worker. Do not check generated bundles into the site.

   ```sh
   node scripts/build-worker.mjs > /tmp/egygrillz-studio-worker.mjs
   node --check /tmp/egygrillz-studio-worker.mjs
   ```

5. On staging, download a known quotation from history and request the same one via `/pdf` in the authorized chat. Compare both documents; check a refreshed Order estimate against EditX settings and confirm that neither invoice import marks a deposit as collected. Only then promote the verified configuration.
