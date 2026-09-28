# Production revision — verification and remaining gates

Review date: 28 September 2026. Repository baseline: `5dfac58ff366beb9ae116d56f2fb600ed4e6d986`.

## What was changed

- Private database access now requires Firebase Auth, an admin claim and an active private registry record; session-age and optional MFA enforcement are mirrored in Rules and privileged callables.
- Public bookings/contact go through validated, App Check-protected server endpoints with limits. Public availability contains no client details.
- Booking changes use transactions, interval collision checks and optimistic versions. Creation request receipts prevent duplicate retry creation.
- Invoices have backend authorization, server numbering/totals, version checks and independent creation receipts, including protection against delete/replay within their retention period.
- Provider credentials and GitHub write access moved out of the browser. The GitHub gateway constrains repository, branch, paths and payload sizes. Legacy migration tools are excluded from publication.
- EmailJS, CallMeBot and push have a durable outbox, leases, pacing, retries and operator-visible failures. Customer notes/PII are not included in lock-screen push or WhatsApp owner alerts.
- Private data is not service-worker cached. Offline private-page navigation receives a generic document, not a cached dashboard.
- Unsafe message rendering was repaired, first-party scripts extracted, critical dependencies locally vendored and CSP added where in scope. Private pages also have a best-effort client-side frame guard.
- The Pages workflow publishes an allowlisted build, not the repository root. Public configuration is checked and first-party JS/CSS URLs are content-versioned.
- Added read-only existing-data audit, explicit access-management scripts, dedicated runtime service-account configuration and operational deployment guidance.

## Verified locally

The final regression run passes:

| Check | Result |
|---|---|
| First-party JavaScript parsing | 35 programs |
| Validation tests | 7 passed |
| Firestore Rules tests | 5 passed |
| Backend emulator tests | 16 passed |
| Publication builder test | 1 passed |
| Actual application browser/emulator integration | Passed |
| Tooling dependency audit | 0 reported vulnerabilities |
| Backend production dependency audit | 0 reported vulnerabilities |

The browser suite uses the actual HTML/JS and Firebase SDK with local emulator configuration and a test-only token-verifying adapter. It covers login, mobile layout, public booking/contact, admin booking actions, legacy editor access, invoice save/edit/reopen and an actual PDF download, text-safe rendering, revocation clearing the private UI, private-page frame blocking and generic offline navigation.

A complete fresh repository checkout at the stated baseline was merged with the overlay and the publication builder succeeded using explicitly dummy public keys for this **structural build test only**. No build containing those values is shipped or deployed. The support panel was compared against the supplied original and against the merged build output: identical bytes.

Tests are not proof that every possible bug is absent. Dependency audits cover known advisory databases, not all supply-chain risks.

## Not verified live — release gates

- Firebase deployment, runtime IAM, Eventarc and Scheduler invocation.
- Deployed callable middleware/App Check enforcement. Direct emulator handler tests do **not** validate production attestation middleware.
- Real TOTP enrollment/recovery, EmailJS template/account settings, CallMeBot activation and business-use permission.
- Real Web Push delivery to an installed iPhone PWA and user permission/revocation behavior.
- GitHub token scope, protected-branch behavior and actual Pages Actions deployment.
- Existing production database quality, legacy invoice import from the owner's devices, historical client counter reconciliation and backup restore.
- Business/legal assertions in inherited terms/privacy text and actual retention/incident procedures.

These require the owner's accounts, data or device. No owner credentials were requested, no customer data was read, and nothing was deployed.

## Explicit boundaries and residual risks

**Support is unchanged.** `staff-panel-x7k2.html`, its separate project and its Worker remain outside the revision. Its existing same-origin scripts mean this is not an end-to-end certification of every component on the website.

GitHub Pages cannot enforce arbitrary response security headers through this repository. Meta CSP and a JavaScript frame guard are not equivalents to server `frame-ancestors`/X-Frame-Options. The legacy pages still use inline event handlers. A separate admin origin/header-capable hosting layer would permit stronger isolation, but was not substituted for the requested hosting.

The inherited `x.html` AI integration lacks a configured authenticated backend; its rendering was made text-safe, but AI delivery is not certified and fails closed under CSP. It is distinct from the untouched support panel.

Old plaintext browser credentials must be rotated, even after new code is deployed. Old local invoice copies must be backed up/imported and removed deliberately. Historical data must not be silently overwritten to make tests pass.

Notification delivery is at-least-once, not exactly-once. Provider outages, quota exhaustion, expired tokens and browser/OS restrictions can prevent delivery. Monitor the canonical dashboard and provider queues.

CallMeBot advertises personal use only for its free API. Retaining the integration is not a claim that commercial use is permitted or reliable. No provider switch was made without approval.

Application TTL cleanup is asynchronous; main customer/financial records are not automatically purged. Budgets are alerts, not hard cost caps. App Check and IP limits reduce abuse but do not eliminate it.

## Release decision

**Source implementation and local verification complete; live release approval pending owner configuration and acceptance checks.** Follow `PRODUCTION-DEPLOYMENT.md`. Do not describe this package as a deployed, independently audited or vulnerability-free system.
