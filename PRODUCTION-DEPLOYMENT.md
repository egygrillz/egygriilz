# EGYGRILLZ — Production deployment

**This package contains the actual application and backend, not a demo. It has not been deployed to your accounts.** External configuration, existing-data review and real-device/provider acceptance tests are still release gates. No credentials or customer data were accessed here.

## Scope and important changes

- Hosting stays **GitHub Pages**. Firebase is used for authentication, database, App Check, Functions and push; there is no Firebase Hosting migration.
- **The support panel and its Firebase project/Cloudflare Worker are not changed.** The release overlay excludes `staff-panel-x7k2.html`; the Pages build copies your existing file unchanged.
- Existing studio tools are retained. `admin.html` is the operational mobile board; `editx.html` remains the complete editor; `invoice.html` now saves to the backend.
- Public booking creates **pending** requests and reserves a time interval. It does not pretend a deposit was paid. An admin confirms the appointment.
- Duplicate request retries do not create duplicate bookings. Occupied time intervals remain occupied if the schedule's slot size changes.
- New invoices are stored centrally, have server-assigned unique numbers, server-calculated totals and version checks. Old device invoices are imported only after an explicit backup/confirmation.
- EmailJS and CallMeBot are retained **server-side**, with durable delivery jobs, throttling, retry/backoff and a failed-delivery screen. Push runs independently.
- The old `MTC.html` migration utility is excluded from the public Pages artifact. Do not enter a new PAT into that old browser tool. Its source remains in your repository; it is not deleted.
- JavaScript was extracted to `secure/pages/` so HTML can use a tighter script-element CSP. Edit the corresponding JS source files when changing behavior. Content editing through the dashboard remains supported.

## 1. Contain the existing exposure

The rules you supplied allowed public read/write/delete of private studio collections. If those are still deployed, close them urgently, even if it means a short booking maintenance window.

1. Export/backup Firestore from your account. Keep backups private, outside GitHub.
2. Rotate the old exposed invoice password everywhere it was reused, the exposed CallMeBot key and any PAT previously used in the browser. Git history still contains old versions; deleting a current file does not invalidate a credential.
3. Review Auth users, IAM, available audit logs, data changes and billing. The code review does **not** establish whether unauthorized access occurred.
4. Keep private-data rules closed during a failed rollout. Never restore `allow read, write: if true` as a rollback.

## 2. Merge the source correctly

The ZIP is an **overlay**, not a complete media archive. Copy `site/` into a fresh checkout on a new branch. Keep your existing images, CNAME, manifests and other unchanged assets. Review `git diff` before merging.

The original review baseline was `5dfac58ff366beb9ae116d56f2fb600ed4e6d986`. Merge carefully if the repository has changed since then.

**Do not use the first package's deployment guide**: this revision introduces an admin registry, invoice backend, additional secrets and a controlled Pages build.

Requirements on your machine:
- Node.js **22**.
- Java **21** for the current Firebase emulators.
- Firebase CLI installed by `npm ci` and Google Cloud CLI installed separately.

```bash
npm ci
npm --prefix functions ci
npx firebase login
gcloud auth login
gcloud auth application-default login
gcloud auth application-default set-quota-project egygrillz-studio
```

Enable Blaze billing for the Functions/Firestore features that require it. Set budgets and usage alerts. Alerts and `maxInstances` are **not hard spending caps**.

## 3. Enable Firebase Auth and create the owner

In **egygrillz-studio**:

1. Authentication → Sign-in method → Email/Password.
2. Create the owner account with a long, unique password. Copy its UID, not its password.
3. Add your actual website domains under Authorized domains, including the domain used by the installed app. Configure a strong password policy and email-enumeration protection where available.
4. Grant access locally:

```bash
node scripts/set-admin.cjs egygrillz-studio YOUR_OWNER_UID grant
```

The script writes **both** the server-issued `admin` claim and the private `_admins/UID` registry. Having a claim alone is insufficient in this revision. Sign out and back in after granting.

Sessions are limited to 12 hours by default. Revocation checks the registry on each privileged callable and each Firestore request:

```bash
node scripts/set-admin.cjs egygrillz-studio YOUR_OWNER_UID revoke
```

Use this revocation path rather than relying only on disabling an Auth account: existing ID tokens can otherwise remain valid until expiry.

### Authenticator MFA

The production login supports TOTP challenges and enrollment. Enable Firebase Authentication with Identity Platform and TOTP support first; review its billing implications.

1. Grant the owner normally and sign in.
2. Account security → Set up authenticator. Reauthenticate; add the displayed secret to your authenticator and verify the code. Never share this secret.
3. Enforce MFA for that account:

```bash
node scripts/set-admin.cjs egygrillz-studio YOUR_OWNER_UID require-mfa
```

The script checks that enrollment exists. The backend and Rules enforce MFA, not just the UI. Establish a trusted project-owner recovery process before enforcing it on your only owner. There is no public MFA-bypass endpoint.

## 4. Provision a restricted runtime service account

The Functions default to `studio-runtime@egygrillz-studio.iam.gserviceaccount.com`, not a broad Editor account. Create it before deployment:

```bash
PROJECT=egygrillz-studio
gcloud iam service-accounts create studio-runtime --project "$PROJECT"
SA="studio-runtime@$PROJECT.iam.gserviceaccount.com"
for ROLE in roles/datastore.user roles/firebaseauth.viewer roles/firebasecloudmessaging.admin roles/eventarc.eventReceiver roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:$SA" --role="$ROLE" --condition=None
done
```

The deploying account also needs the appropriate deploy/service-account-use permissions. Firebase/Eventarc/Cloud Scheduler service agents need their documented invocation permissions. If deployment reports a missing permission, resolve the specific service binding; do not grant broad Editor access just to suppress the error.

`STUDIO_RUNTIME_SERVICE_ACCOUNT` is a deploy-time parameter. Set a different account for a staging project.

## 5. App Check and Web Push — public configuration

1. Register the existing studio web app in Firebase App Check with **reCAPTCHA v3**. Allow only your real production/staging domains as appropriate.
2. Obtain the public reCAPTCHA site key. The reCAPTCHA private key belongs in its provider configuration, never the website.
3. Project settings → Cloud Messaging → Web Push certificates → obtain/generate the **public VAPID key**.
4. In GitHub → repository Settings → Secrets and variables → Actions → **Variables**, set:
   - `EGY_APP_CHECK_SITE_KEY`
   - `EGY_VAPID_PUBLIC_KEY`

These are public browser identifiers, not passwords. The build injects them into `dist/secure/config.js` and refuses to publish if they are missing. The Firebase browser configuration already identifies the existing studio project.

Callable Functions enforce App Check. Do not disable enforcement to work around a missing key. Review App Check metrics and authorized domains instead.

Do **not** enable Firestore App Check enforcement globally until every Firestore consumer you intend to keep has been verified. The studio Rules already enforce identity and registry permissions. The separate support project is outside this change.

For local production-source testing, you can set the public values in `secure/config.js` or set the same environment variables when building. Never put backend secrets there.

## 6. Keep provider credentials on the server

Run each command and enter the value at the CLI prompt; do not save secret values in shell scripts or commit them:

```bash
npx firebase functions:secrets:set GITHUB_TOKEN --project egygrillz-studio
npx firebase functions:secrets:set RATE_SALT --project egygrillz-studio
npx firebase functions:secrets:set EMAILJS_PUBLIC_KEY --project egygrillz-studio
npx firebase functions:secrets:set EMAILJS_PRIVATE_KEY --project egygrillz-studio
npx firebase functions:secrets:set CALLMEBOT_API_KEY --project egygrillz-studio
npx firebase functions:secrets:set CALLMEBOT_PHONE --project egygrillz-studio
```

- **GITHUB_TOKEN:** fine-grained PAT restricted to `egygrillz/egygriilz`, Contents read/write, with an expiry. Do not grant broader organization or workflow permissions. Repository/branch are constrained server-side.
- **RATE_SALT:** a long random value from a password manager, used to hash IP-based rate-limit keys. Raw IP addresses are not saved by this application's rate limiter.
- **EmailJS:** retain your existing service/template. Default parameters are `EMAILJS_SERVICE=service_r8fhuah` and `EMAILJS_TEMPLATE=template_d2twd6h`. Confirm these in your account. Enable the account security setting requiring the private key and permit the appropriate server-side API use. Retiring the old browser integration alone does not stop someone abusing a previously exposed public key if the provider still allows unauthenticated sends.
- EmailJS template variables: `to_name`, `to_email`, `service`, `date`, `time`, `notes`, `booking_reference`. Test your actual template; names/notes are HTML-escaped defensively. The email must say **request received/pending confirmation**, not paid or deposit-confirmed.
- **CallMeBot:** use a newly activated key and its associated owner number in international format. The integration sends limited owner alerts, not customer messages. Its website states the free API is for **personal use only**. Obtain confirmation that your intended business use is permitted, or use an approved provider/alternative; do not assume a production SLA.

Grant the runtime account access to the specific secrets:

```bash
for SECRET in GITHUB_TOKEN RATE_SALT EMAILJS_PUBLIC_KEY EMAILJS_PRIVATE_KEY CALLMEBOT_API_KEY CALLMEBOT_PHONE; do
  gcloud secrets add-iam-policy-binding "$SECRET" --project "$PROJECT" \
    --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor
done
```

Provider references reviewed:
- https://www.emailjs.com/docs/rest-api/send/ — REST payload and one-request-per-second limit.
- https://www.emailjs.com/docs/sdk/options/ — private-key account security setting.
- https://www.callmebot.com/blog/free-api-whatsapp-messages/ — setup and personal-use restriction.

## 7. Review existing data before changing behavior

```bash
node scripts/audit-data.cjs egygrillz-studio
```

This is **read-only**. It writes a private report to `.private/data-audit.json` and exits with code 2 if issues exist. Do not upload that report; document IDs can include phone numbers.

Review malformed dates/times, unexpected IDs, duplicate client profiles, existing overlaps and appointment durations. Legacy records without a duration are conservatively treated as **60 minutes**; the old schema cannot establish their actual duration. Correct those records using a reviewed migration/Console operation before relying on new availability. Do not blindly rewrite historical durations or merge client records.

The old client profile counters are retained for compatibility; they are not a certified financial/attendance ledger. Use appointment records and cloud invoices as the source of truth and reconcile imported/historical client summaries.

Existing `settings/schedule` must contain valid hours, day numbers, slot duration and holidays. Corrupt settings fail closed rather than loop indefinitely or expose customer records.

## 8. Run checks and test a staging project

```bash
npm run check
npm test
npm run test:rules
npm run test:backend
npx playwright install --with-deps chromium
npm run test:browser
npm run test:build
npm audit --audit-level=moderate
npm --prefix functions audit --omit=dev --audit-level=moderate
```

The checked-in tests use local emulators and test-only credentials. No demo fixtures or authorization bypasses are included in the published app.

For a real staging project, change the public Firebase config and App Check/VAPID values, the runtime service account, and the publishing repository/branch parameters. Set `EGY_STAGING_PROJECT` explicitly when running the local owner/audit scripts. Do not point a staging CMS at the production publishing branch or use real customer recipients for notification tests. Keep `secure/config.js` repository settings aligned with the server's GITHUB_OWNER/GITHUB_REPO/GITHUB_BRANCH parameters.

## 9. Deploy in a maintenance window

1. Backup the database and old device invoices; finish the configuration above.
2. Pause booking intake briefly while migrating. Configure the owner registry before locking the new Rules.
3. Deploy the studio backend, Rules and indexes:

```bash
npx firebase deploy --only functions:studio,firestore --project egygrillz-studio
```

Review any removal prompt for obsolete studio Functions. In particular, remove the first package's old `bookingNotification` trigger if it was ever deployed; otherwise it can duplicate push notifications. Do not delete support-panel resources.

4. Wait for all indexes and TTL configuration to finish. Verify the new runtime account and trigger/scheduler invocation permissions.
5. GitHub repository → Settings → Pages → Source: **GitHub Actions**, not direct branch-root publishing. Preserve the custom domain and enable HTTPS.
6. Merge the source. `Publish production website` runs the checks, builds `dist/`, then deploys that artifact. It also runs on later pushes to main so approved CMS commits continue publishing. Use repository branch protection and the `github-pages` environment approval controls appropriate for your team.
7. Verify production with a clearly labelled test booking and your own email/device, then remove that test record through the dashboard.

The build excludes backend code, tests, local scripts, private reports, dotenv files, node_modules and MTC. It cache-busts first-party JS/CSS while preserving the support panel bytes.

## 10. Acceptance checks that still require your accounts/device

- [ ] Anonymous users and a signed-in non-admin cannot read private collections or call privileged Functions.
- [ ] Removing `_admins/UID.active` blocks an existing signed-in session.
- [ ] Missing/invalid App Check tokens are rejected by the **deployed callable endpoints**.
- [ ] Real EmailJS confirmation reaches your inbox with correct formatting; bad provider credentials create a visible failed job after retries.
- [ ] Real CallMeBot owner alert works only after credentials and use eligibility have been checked.
- [ ] CMS edits publish to the intended repository/branch, the Actions workflow passes and the change appears on Pages.
- [ ] Create, reschedule, cancel and confirm bookings; test two browsers selecting overlapping intervals.
- [ ] Save/reopen a cloud invoice from another device; test conflict handling, PDF generation and the existing mail-client action.
- [ ] Import local invoices: the app downloads a private backup first, assigns cloud invoice numbers, records the old number, and removes the browser copy only after successful import and your confirmation. No automatic deletion occurs on migration failure.
- [ ] iPhone iOS 16.4+: Safari → `/admin.html` → Share → Add to Home Screen → open the installed app → sign in → Enable notifications. Test with the app closed and with notification permission denied/revoked.
- [ ] Offline navigation shows the generic offline document, not client data. No offline edits are allowed.
- [ ] Verify fonts, media, galleries and Spline embed against the complete deployed repository. Review the privacy text and your actual retention/incident-response practices.

## Operations and limits

- Notifications use at-least-once delivery with leases, backoff and up to eight attempts. External providers cannot guarantee exactly-once delivery. Push tags and per-device receipts reduce duplicates; do not use push as the only booking record.
- The scheduler checks pending jobs every minute. Failed jobs can be retried in Account security & delivery status. Monitor Cloud Logging/errors and Firebase billing as well; a dashboard alone is not a full incident-monitoring service.
- Outbox/request/push receipt records expire after 30 days. Push registration expiry is 90 days and refreshes on app use. Application audit records expire after 30 days. Firestore TTL deletion is asynchronous and billable; verify it is enabled.
- Main booking, client and invoice retention is **not automatically purged** by this package. Your existing policy's retention promises need an approved operational process; do not automatically delete financial/customer history without reviewing the business/legal requirements.
- Public bookings: up to 12 submissions/hour/IP; contact: 6/hour/IP; availability: 240/hour/IP. Shared networks share limits. App Check and rate limiting are not a guarantee against distributed abuse or cost spikes.
- New bookings use the existing 60-day public calendar horizon. Admins can import historical records or schedule outside public opening hours, but overlap and version checks still apply.
- The mobile board uses live 50-record pages; search is explicitly scoped to the visible page. Previous/Next navigates the history; summary totals are server queries, not just visible-row counts.
- GitHub API uploads are capped at approximately 8 MiB per file. Larger existing assets remain served unchanged; publish larger new files via a reviewed repository commit rather than the browser gateway.
- GitHub Pages cannot set custom CSP `frame-ancestors`, Cache-Control or other arbitrary security response headers. Meta CSP and a best-effort private-page frame guard are implemented, but are not equivalent to complete server-header control. The legacy UI still needs inline event attributes, while the new mobile board does not. Isolating admin onto a separate origin and adding a header-capable proxy are further hardening options, not things this package silently claims to have done.
- Public `x.html` still has an inherited direct AI call without a configured authenticated backend. Its message rendering is now text-safe, but the AI integration is **not production-verified** and its call fails closed under the new CSP. Do not advertise that AI feature as working until it receives a separately approved backend. Your separate support panel was explicitly left untouched.

## Rollback

Keep Rules private. Retain backups and the last reviewed static artifact. If the new frontend or a provider fails, pause intake and use your static contact details while restoring a compatible reviewed release. Do not re-enable the old public database rules or restore exposed credentials.
