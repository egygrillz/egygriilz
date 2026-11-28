# Studio orders and quotations

Start at **`/order-sheet`**, or open a client in **EditX → Clients → Open order sheet**. For a local static server without clean URLs, use `/order-sheet.html`. The [Marten sample quotation](examples/EGYGRILLZ-Quotation-Marten.pdf) is a generated example, not a database export.

## From fitting to invoice

1. **Client:** choose a record or type the details. The authenticated directory combines up to 500 recent appointments and 300 client records by phone number. If the client is outside that list, open their record in EditX. EditX passes the record ID in session storage; no name or phone goes in the URL. Manual entry and drawing work in memory if Firebase is unavailable. Sign in and save before closing the tab. The Client step shows file controls, not an order summary. A client name is optional: an unnamed file is labelled by date and its unique order reference.
2. **Design:** choose a mode and material; the working name is optional. Select the outlined teeth (Mix lets you choose the material per tooth) and press **Start drawing**. Draw with a mouse, pen or one finger. Two fingers zoom. Enamel fill asks for a palette, then fills the tooth you tap; Undo restores the previous fill. **Finish drawing → Design details** also works for a plain, unmarked tooth. Review complexity and plating, gold purity if applicable, and only the laser, enamel and stones actually used. Press **Apply details to estimate**. To work on another piece, use **Select teeth for new design**; layer chips take you back. The added design, estimate and PDFs use its name once, with FDI tooth subheadings for different details. Use the studio design library to reuse its specifications, not its drawing (below).
3. **Pricing:** add services, including **Mold — Normal per arch** (set quantity for the arches) or **Mold — Digital full mouth**. They use the mold rates in EditX; there is no second order-level mold charge. Set the timeline and review the price breakdown. Agreed totals, deposits and service unit overrides can be zero. Resolve pending designs or missing rates before issuing.
4. **Review:** review the production instructions and capture approval. **Save order & quotation** saves both together. **Download order PDF** includes the layer illustrations, specifications, notes and signature; **Download quotation PDF** is the priced document. Both filenames include the client (or date) and unique order reference. **Print order sheet** is still available. **Prepare invoice** imports that saved quote by ID, without storing the order on the device.

**Naming a new drawing:** after the tooth details are filled in, focus **Design name** or press **Apply details to estimate**. If they match a saved library design, a translucent prompt asks, for example, **“Is this Scorpion?”** Use its name, keep yours, or go back and edit. If multiple names match, choose one. Matching compares the complete tooth specifications, not just the complexity or the original FDI positions. Accepting only names this drawing: no artwork is loaded, no template is overwritten and no extra item is charged.

### Reuse a design without copying a client’s drawing

- **Save design details** in the Studio design library after applying a named design. The library stores the name and ordered tooth slots: material, named complexity, finishes, enamel palette, stone specifications and relevant setting rates. The display names are **Bars, Solid, Open face, Mid detail, Complex, Scorpion, Ultimate**. Existing numeric pricing keys still work. It does not store original FDI numbers, drawing coordinates, photos, signature or the client’s order reference. Earlier artwork-based templates are read as specifications; opening one does not modify that database record.
- **Load for redrawing** opens a blank layer. Draw on any teeth, on either arch: the first new tooth receives slot one, the next receives slot two, etc. A two-tooth design can be 31 and 32 instead of the original 11 and 12. The checklist tells you what remains. The tools reuse each slot’s metal, palette and stone brush, even when one stroke crosses two teeth. When the drawing matches, its saved details apply automatically; there is no second details form. Until then it is an unpriced draft.
- A third tooth, an extra counted diamond, a different setting or an effect outside that tooth’s specification requires a decision. **No, leave it out** (or Escape) discards the entire proposed gesture. To accept, name the new design and choose **Yes, create design**. This keeps the drawing you just made under the new name, without changing the library original or charging for a duplicate layer. **Change saved details…** offers the same choice before editing finishes or metals. Review the new design before issuing it.
- **Save to studio** still saves the *actual order* with its artwork, slot bindings and approval, so reopening the order is different from loading a library design.

### Studio files and receipts

- **Save to studio** saves progress from any step. An incomplete file is a draft, not a new issued quote. A valid order saves its quotation in the same transaction. Re-saving edits the same file; **New sheet** allocates a different reference, even for the same client. Closing with unsaved work can lose it, particularly on mobile. There is no background save per stroke or offline device fallback.
- Open **Studio order files** on any signed-in device. The picker pages through small headers; artwork is fetched only for the file opened. Firestore `order_sheets/{ref}` holds the header, `order_sheets/{ref}/data/current` holds the compact editable instructions, and `quotes/{ref}` holds the priced snapshot and receipts. Drawings and approval use pen coordinates; repeated stones share a brush description. No PNG, SVG screenshot, PDF, or email attachment is stored. The `sheetJson` field doesn't need indexing. Another device's newer edit will not be silently overwritten.
- **Earlier device drafts:** if v1 records exist, authorised staff can open **Import an earlier device draft**. Review the copy, re-sign (the old signature was a raster image), then save. Reopening an already-imported draft opens its studio copy. Original device data is not erased or silently uploaded; any earlier quotation stays separate. Remove the old browser data only after checking the migrated files.
- **Payments → Record payment** posts money actually received, with amount, method, staff UID and timestamp. An agreed deposit by itself contributes **zero** to the amount paid. Multiple instalments are supported; zero, negative, fractional and over-balance receipts are rejected. A quote cannot be reduced below money already received. Example: **5,000 EGP** quoted, **1,200** deposit requested, **850** received means **4,150** outstanding, including **350** still needed toward the deposit.
- **Quotes → Outstanding orders** shows paid and outstanding on order-linked records. Open one to download its issued quotation or return to its order and receipts. A linked record is revised through Order Sheet, not independently overwritten/deleted in Quotes. New estimates follow EditX changes. Reopening an issued quote or posting a receipt does **not** reprice it; use **Recalculate this saved quotation at current rates** (or edit its pricing inputs), then explicitly save. Invoice import copies posted receipts at that moment, not the requested deposit. It doesn't charge anyone or continuously sync later invoice edits back into the order ledger.

### Open Gmail with both PDFs attached (you press Send)

1. In **Review → Order documents** check the recipient and press **Prepare email with both PDFs**. The sheet first saves the order and quote, then builds the same two named PDFs as the download buttons, including the current artwork and receipts. No upload happens at this step. Editing the file, recipient or payments invalidates the prepared files.
2. Press **Choose Gmail account & open attached draft**, choose the **studio's sending mailbox** in Google's popup and authorize it. The browser creates one unsent draft containing both PDF files in that mailbox, then opens Gmail. If Gmail opens the folder instead of the editor, find the draft by the unique order reference in its subject. Embedded previews also offer **Open the attached Gmail draft** and **Gmail Drafts folder**. Check the recipient, attachments and message before **you** press Send. No client email is sent or marked sent by the site, Worker or Telegram bot.
3. **Without web OAuth:** on devices with file sharing, use **Share both PDFs**, select Gmail and check/fill the To address in that app. Otherwise download both PDFs and use the explicitly labelled **text-only** compose link with the paperclip. A web compose URL cannot carry attachments. If Gmail didn't confirm creation after a network error, check Drafts before retrying to avoid creating a second copy.

**One-time web Gmail setup:** in Google Cloud for the studio, **enable the Gmail API**. In Google Auth Platform configure the consent screen/audience and add the intended studio mailbox as a test user if in Testing. Create an OAuth client of type **Web application**, add the site's exact **Authorized JavaScript origin** (e.g. `https://egygrillz.com`, also `https://www.egygrillz.com` only if used). Copy the **public client ID** ending `.apps.googleusercontent.com` into **EditX → Site settings → Quotations → Gmail drafts**, save and refresh Order Sheet. Never put a client secret, password, access token or refresh token in site settings. Workspace policy or external-app verification can affect the Gmail scope; check with the mailbox administrator if consent is blocked. Arena integrations are not the studio app's Google authorization.

The browser requests `gmail.compose` and mailbox identity (`email`), not full-mailbox access. It calls only user info and `users/me/drafts.create`, never `messages.send` or `drafts.send`. Google may describe the granted scope as compose/send. Access tokens and PDF bytes are not persisted by the site or sent through the Worker; the draft itself **is** stored in the chosen Gmail mailbox. The old server-side email endpoint remains retired. No Resend configuration or new Firebase rule is required.

### Edit a diamond on the drawing table

On a gold or sterling silver tooth, **Place diamond** stamps the chosen cut, colour and size. Changing the brush does not repaint the last stone. Choose **Select / edit diamond**, then tap the stone or press **Next diamond** to cycle through this layer. Drag to move, use **Smaller / Larger** or the millimetre slider to resize, **−15° / +15°** or the rotation slider to turn, and **Delete diamond** to remove just that stone. Tapping an empty spot in Edit never adds a diamond. With the canvas focused, `[` / `]` rotate and Delete removes the selection.

**Pavé line** places stones with the selected edge-to-edge gap, including on tight turns and when crossing or retracing a line. In design review choose **Bars** for an iced-out bar: the studio’s `barsStonesPerTooth` rate is charged once for that tooth, not once per stone or per stroke. With any other complexity, only the diamonds actually placed along the line are counted. An independent accent is still charged as an accent, and a full iced fill is still one setting per tooth.

On an iced tooth, these controls retouch one stone’s appearance. The fill still has one priced setting per tooth, not an accent charge per visible stone. Deleting the last iced stone removes that coverage; apply any changed pricing details before issuing. The chart and print map use the same clear facets and contrasting edges as the white cut tiles. Selection rings are not printed.

## Which price is used?

| Input | Source / behavior |
| --- | --- |
| Material, level, finish, stones, timeline, mold, rounding, default production deposit | EditX / studio **`settings/pricing`** in `egygrillz-studio`. `assets/calc-engine.js` applies the same pricing model to design groups and services. Built-in defaults include rounding **up** to 50 EGP and a 50% deposit; these are not hard-coded Order screen prices. |
| Consultation, impression and toothgem service defaults | `settings/site` (`consultPrice`, `impressionPrice`, `gemFromPrice`), unless `settings/pricing.servicePrices` explicitly sets that service. An explicit per-order service unit price, including zero, takes precedence. |
| Gold | `assets/rates.js` gets the live pair from the Worker, with a direct-feed fallback. 24K EGP/g = USD per troy ounce ÷ 31.1034768 × USD/EGP. Order refuses a gold quote without a rate. A stale usable rate is distinguished from a fresh rate. |
| Design details → pricing | `assets/order-design.js` describes the artwork for review. `assets/order-pricing.js` reads **applied groups only**, not raw strokes or stones. A changed billable detail blocks issue until reapplied; it does not silently change the last applied price. No stale options for effects that were undone. Partial ice is per covered tooth, hand-set stones by quantity and setting. Hand-set charges appear below the matching tooth and design in the quote and invoice; they do not gain a timeline surcharge or become additional services a second time. Previously issued orders keep their frozen amounts. Explicitly reviewing an imported order layer replaces its old breakdown; templates load only their specifications. |
| Enamel | Count distinct colours visible in the fill, not brush taps: 1 Single, 2 Multi, **3 or more Master**, no palette length cap. Exactly 3 was the unspecified boundary; this implementation includes it in Master. Shared mode counts the design palette on enamelled teeth only; Mix counts each tooth separately. A plain tooth has no enamel charge. |
| Shared code vs issued document | An `EGZ-…` code is a transferable **specification**, not proof of an agreed total, payment or signature. Codes can include client information: share intentionally. Use the saved quotation or invoice handoff for an agreed price. History and Telegram `/pdf` use the stored priced snapshot; the Worker does not substitute today’s gold rate. An old record without priced items cannot reproduce an issued PDF. |
| Payment terms | The public Calculator retains its existing **100% production payment** for new estimates; an imported code uses its own percentage. The booking page’s **50% appointment deposit** is a separate term. Order uses the studio production default; Quotes/staff can quote different terms. **Deposit due is never deposit paid.** Invoice imports start pending with zero collected unless the saved order actually has posted receipts; the requested deposit travels in the notes. |

`buildQuotePdfBytes` in `assets/calc-engine.js` is the quotation layout for Order, Calculator, both staff routes, Quotes and the Worker. The signed production sheet, accounting invoice and bot reports are different documents. The quotation uses standard PDF Helvetica and transliterates Arabic text; it does not provide native RTL typography.

**Reference check:** the four single-tooth designs in the Marten fixture are 1,650 + 1,000 + 1,100 + 1,250 = **5,000 EGP**. The fixture keeps the two-page A4 layout and total while using the current complexity names and tooth headings. Its generated bytes are checked against the versioned sample. The regression test separately checks that Telegram and the browser engine produce identical bytes from the same snapshot and metadata.

## Firestore access — studio project only

The studio rules are in **[`firestore.rules`](firestore.rules)**; `firebase.json` points to that file. Do **not** publish these to the separate staff chat/assistant project. Notes on the access boundary:

- Public: get the listed settings documents (pricing, site, schedule, catalog, banners, crops and visibility); read availability slots, catalog, banners and stats. No listing the settings collection. Never put secrets in a public settings document.
- Public booking: create **both** the appointment and slot in one transaction. Their ID is `YYYY-MM-DD_hhmmAM` or `…PM`, with a **zero-padded** hour (`01:00 PM` → `0100PM`). Neither a lone claim nor a public overwrite is allowed. Only slots are publicly readable. A well-formed first client record can be created; a returning visitor cannot read/update an existing client. The client profile write is best effort and does not undo a successful booking. Staff can reconcile profiles with appointments in EditX.
- Public mould orders and contact messages remain create-only. Order files (including their editable body), quotes, invoices, templates, client records and appointments are not a public directory. No public quotation write is needed to download a local estimate. Unlisted collection paths are denied.
- The registered owner UID **`zOmlCC3Z0qTDlciJMeCDcSDauwy2`** is in `staffUids()`. After publishing these rules to **`egygrillz-studio`**, sign in with that account’s existing email and password. It can read and manage **every studio collection above**, including the order body and invoice counters, without email verification, custom claims or a second account. The UID is an identifier, not a secret or a Worker variable.
- Authentication alone does not make someone staff. To add another staff login, take its exact UID from **Firebase → Authentication → Users**, add it to `staffUids()` and publish. Existing boolean `staff`/`admin` claims and the verified `admin@egygrillz.com` fallback keep working. Do not grant private access to every signed-in user. The separate assistant/chat project has its own accounts and rules.

### If sign-in succeeds but the desk stays locked

EditX checks private `appointments` and `clients` reads against the server. Quotes, Invoice and links to a saved sheet also require a private server read before opening. A cached invoice, a browser flag or a public pricing read cannot unlock these desks. Secure the studio device: Firestore rules do not erase data already on disk.

1. Compare the signed-in UID to **Authentication → Users** in **`egygrillz-studio`**. Under **Firestore Database → Rules**, make sure the **published**, not just local, file contains that UID. Press **Retry access**. The registered owner does **not** need the verification-email button; that option is for the email-only fallback.
2. If a private read is still denied with the right UID and rules, check the project, Firestore/App Check logs and API key restrictions for the actual caller (web app or Worker). Check connectivity and quota for network/quota errors. Do not relax the rules to troubleshoot.

### Worker setup: reuse the existing bindings

In **Cloudflare → Workers & Pages → `egygillz-api` → Settings → Variables and Secrets** check the following. Store passwords, bot tokens and provider keys as secrets. No UID variable, Firebase Admin key, storage bucket or new bot is needed.

| Binding | What to use |
| --- | --- |
| `FIREBASE_API_KEY` | Firebase **`egygrillz-studio` → Project settings → General → Your apps → Web app → SDK config → `apiKey`**. A web API key selects the project; it does not grant private access. |
| `STAFF_EMAIL`, `STAFF_PASSWORD` | The existing email/password of the authorized studio account. Firebase Authentication lists the email/UID, not the password. If you reset the password, update the Worker secret too. Used by Telegram/cron, **not** as a fallback for a dashboard request. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Existing bot token from **@BotFather** and the ID of your **private studio chat**. Start the bot, use `/id` for initial setup and set that ID in Cloudflare. Until it is set the bot exposes no studio commands. Anyone in a configured group can use the bot; use a private conversation. |

### Telegram: studio order desk

| In the configured chat | Result |
| --- | --- |
| `/sheets` or `/sheets <client>` | Recent draft/issued files with unique references. Search checks the latest 80 headers. Artwork/signatures are not downloaded. |
| `/sheet <ref or client>` | Issued service prices, quoted total, deposit requested and actual paid/outstanding. The button opens the private order; sign in **in that browser** to post a receipt, download both PDFs or prepare the attached client draft. The bot cannot see whether you pressed Send. No client data or credentials are in the URL. |
| `/receipts <ref or client>` | The last 20 receipts for one order, with date, method and amount. Use the order for the complete history. |
| `/outstanding` | A page of 20 issued order quotations. Only posted receipts reduce the debt. The total is **for this page**; follow the printed next command if present. Standalone quotes, unpriced drafts and copies in the invoice ledger are not added. |
| `/pdf <full ref>` | The issued quotation PDF, sent to the studio chat, not the client. An exact reference also works for older files. |
| `/unpaid` and `/rates` | Separate invoice balances net of collected deposits; calculator rates include EditX mold services. Do not add the order and invoice reports together. `/orders` and `/order` still mean **mould-kit** orders. |

### Telegram: studio alerts and reminders

| Action | Recipient and requirement |
| --- | --- |
| New website booking | The existing public notifier sends an **instant studio alert** after the Firestore transaction. If `TURNSTILE_SECRET` is enabled, configure its matching **public** `TURNSTILE_SITE_KEY` and allowed site hosts; the booking review shows the widget. A missing alert is **not** a failed booking: do not submit again. |
| **EditX → Appointments → Tomorrow → Studio Telegram** | Sends tomorrow’s active appointments (Cairo calendar date) to the **configured studio chat**, not to clients. The Worker checks Firestore with the caller’s Firebase ID token and returns a delivery result, not the client list. No browser bot token or cron secret. **Open client Gmail reminders** is a separate action. |
| Upcoming appointment | The minute cron also scans every five minutes (at :01, :06, …). It notifies the **configured studio chat**, normally 55–60 minutes before the appointment, or on the next scan for a late booking already inside that window. Optional Worker variable **`APPOINTMENT_LEAD_MINUTES`**: 5–180, default 60. Includes Cairo date, time, name and service, not the client's email or notes. Past, cancelled, already attended/no-show and invalid times are skipped. |
| Daily digest | Set **one** Cloudflare Cron Trigger `* * * * *` on `egygillz-api` (also in `wrangler.jsonc`). At **12:00 Africa/Cairo**, using the event’s scheduled time, it sends tomorrow’s schedule including an explicit empty day. Do not also configure a fixed 10:00 UTC trigger. This does not mark client emails as sent. |

The advance alert claims a slot on the private appointment document using its Firestore update time. Repeated cron runs skip sent slots; moving the appointment gives it a new eligible slot. A rejected Telegram delivery can retry on a later scan. After an ambiguous timeout/crash a 10-minute lease prevents an immediate replay (Telegram cannot guarantee exactly-once delivery). The marker `studioTelegramNotice` is separate from the client-email reminder and does not change the booking status. Check the Worker log **`[cron] upcoming appointments`**; successful sends must also be visible in the intended chat. A test: on staging set the lead to 15, book an appointment 10 minutes ahead and confirm one upcoming message over two scans. The daily digest and on-demand reminders remain separate.

`GET /api/health` reports the configured lead time (`studioAppointmentLeadMinutes`), binding presence and `orderEmailMode: "manual-draft"`, **not delivery**. `GET /api/telegram/check` signs in as the bot and checks private list access for `appointments`, `order_sheets` and `quotes`. It returns no records and does not send a message or email. Test with a disposable staging appointment and private staging chat; verify the actual message and the scheduled invocation log (`[cron] appointment digest`). A 401/403 from Telegram points to the bot token/chat or posting rights; `permission-denied` from Firestore points to the studio identity/rules. Long digests split into parts; check the chat before retrying a partial or unconfirmed send.

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
firebase emulators:exec --only firestore,auth --project demo-egygrillz \
  'node --test tests/firestore-rules.test.mjs'
```

The five Chromium journeys use synthetic records and intercept external services. They cover desktop/mobile drawing and approvals, pavé spacing and billing, template redraw and consent boundaries, cloud order reopen, receipts, EditX mold pricing, two real PDF downloads, the exact two Gmail MIME attachments (byte-compared to the downloads), denied OAuth, native file sharing, saved-name recognition, individual diamond editing and clear/black contrast on white, direct-link login, denied-account cache protection, and invoice transfer. The rules suite verifies anonymous bookings, outsider denials and owner CRUD. With **both** local emulators running it also creates an unverified email/password fixture with the exact owner UID, signs the Worker in through the Auth emulator, reads orders via Firestore REST, checks that an unrelated login is denied, and verifies that the retired email endpoint cannot send or mark an order as emailed. All database and login traffic for this test is forced to loopback. It was exercised with **Fireemu 0.69.0** (strict profile, independent/unofficial); these are not tests of production sign-in, Telegram delivery or a real inbox.

## Publishing checklist (not performed by this change)

1. Run the tests, including the official emulator. Back up the currently published rules/Worker. Check the intended studio staff and Worker identities; verify anonymous booking, denied private reads, saved-quote history and invoice transfer with disposable **staging** records. Also verify the existing mould/contact and staff-admin paths.
2. Publish the HTML and versioned assets together; `/assets/*` is cached immutable. The staff assistant can keep its own chat database, but its pricing editor must target studio settings. A site-only publish does **not** update Firestore rules or the deployed Worker.
3. When authorized, publish **only** studio rules with `firebase deploy --only firestore:rules --project egygrillz-studio`, or paste the entire `firestore.rules` into that project’s Firestore Rules editor. The optional single-field `data.sheetJson` index exemption is in `firestore.indexes.json`; review existing indexes before applying changes. No bulk data migration is required.
4. **Dashboard single-file editor:** open [**worker.js**](worker.js) on GitHub and use **Copy raw file** (or download the raw file). In Cloudflare → Workers & Pages → **`egygillz-api` → Edit code**, replace the **entire** contents of the `worker.js` module and press **Deploy**. This file includes the pricing engine; do **not** paste `cloudflare-worker.js`, which is Wrangler’s multi-file source entry. Keep the existing bindings, routes and cron. Confirm `/api/health` returns `ok: true` and `orderEmailMode: "manual-draft"`. A GitHub merge / site publish does not deploy this Worker.

   Alternatively, an authorized operator can deploy the same source with `npx wrangler deploy --config wrangler.jsonc`. After editing `cloudflare-worker.js` or `assets/calc-engine.js`, refresh the tracked Dashboard file and run the byte-for-byte freshness test:

   ```sh
   node scripts/build-worker.mjs > worker.js
   node --check worker.js
   npm --prefix tests run unit
   ```

5. On staging, download a known quotation from history and request the same one via `/pdf` in the authorized chat. Compare both documents; check a refreshed Order estimate against EditX settings and confirm that only actual receipts count as collected. Create a draft in a test Gmail mailbox for a disposable staging recipient; open both attachments, check their references and verify nothing was sent. Test a near-term appointment in a private staging chat. Only then promote the verified configuration.
