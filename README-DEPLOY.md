# `public/` — the cleaned, fixed site (drop-in replacement)

Everything here is the **current live site with the fixes applied and tested locally**.
Copy this folder over your repo root and deploy.

---

## What changed (all verified locally)

| Area | Before | After |
|---|---|---|
| URLs | `egygrillz.com/booking.html` | **`egygrillz.com/booking`** (307 links rewritten, old URLs 301-redirect) |
| Hero image | 7.9 MB JPEG, preloaded twice | 81 / 174 / 380 KB WebP via `<picture>` + 294 KB JPEG fallback |
| Social preview | 4212×5617 photo declared as 1200×630 | dedicated `og-image.jpg` **1200×630, 139 KB** |
| Logos | 3807 px PNGs, 128–145 KB | 600 px PNGs, 18–25 KB |
| Gallery images (in repo) | 24 originals, 3.34 MB | same images as WebP: **0.61 MB** + optimised JPEG fallback |
| Images below the fold | 0 lazy-loaded on galleries | all lazy + `decoding="async"` + intrinsic width/height |
| Font Awesome | downloaded twice (preload + blocking link) | one reference |
| Right-click / F12 / drag blockers | on 12 pages | **removed** (they broke accessibility and hid your own console errors) |
| Security headers | none | `_headers`: CSP, HSTS, noindex on internal tools, immutable caching |
| Clean-URL hosting rules | none | `_headers` (content-type) + `_redirects` (301 map) |
| Internal tools | public, indexable | Firebase Auth gate on 5 pages, `robots.txt` disallow, `noindex` header |
| Invoice password | `Mmahdy712005` in source | **deleted** — real Firebase Auth (`assets/firebase-auth-gate.js`) |
| CallMeBot | public key + your phone number | removed; `assets/egygz-notify.js` → your own Worker |
| SEO | placeholder GSC tag, stale sitemap, tools in sitemap | real sitemap (12 clean URLs), internal pages excluded |
| 404 | GitHub's generic page | branded `404.html` |
| Extras | — | `.well-known/security.txt`, `humans.txt` updated, `rel="noopener"` everywhere, dead mailto fixed |

Local test results: every nav link resolves (0 broken), 0 HTML nesting errors, 0 JS syntax errors, no secret strings left in `public/`.

---

## Mould kit orders — how the new pieces fit together

| Piece | Where | What it does |
|---|---|---|
| `moulds.html` | `/moulds` | Teeth-chart order page. Posts the order to the Worker (`/api/moulds/order`), which saves it to Firestore **`mould_orders`** and alerts Telegram. If the Worker is unreachable the page falls back to writing straight to Firestore. Prices (`settings/site` → `mouldPerArch`, `mouldDeliveryFee`) are applied to every total. |
| `editx` → **Moulds** | `/editx` | Lists orders (`Pending` / `Approved` / `Delivered`), edits the kit prices, pastes the payment link. **Approve & open Gmail** saves the link + `approved`, then opens Gmail with the client's address, subject and your template filled in — **you press Send**. |
| `editx` → **Home Banners** | `/editx` | Uploads or picks the wide image for the Golds / Silvers / Diamonds home sections (`settings/banners`). |
| Telegram bot | Worker | `/moulds`, `/mould`, `/pay`, `/deliver`, `/sets`, `/setvis`, `/status`, `/calc`, `/invoice` + inline buttons. `/pay <ref> <link>` marks the order approved and replies with a **tap-to-open Gmail draft** (subject + body already written) so you can send it from your phone. |
| `assets/set-visibility.js` | public pages | Hides sets switched off from `/setvis` (`settings/visibility`). |

### No mail secrets — everything is sent by hand from Gmail

The Worker **does not send email**. There is no Gmail API integration, no Resend key and no EmailJS
template for moulds, so there is nothing to configure in Google Cloud:

* `/api/moulds/approve` only writes `paymentLink`, `status: "approved"` and `approvedAt`.
* The response includes a Gmail compose URL (`view=cm&fs=1&to=…&su=…&body=…`) built from the
  template in `settings/moulds_email`. `/editx` opens it in a new tab; Telegram replies with the same
  link as a button.
* `/api/health` no longer lists any email channel — if an `email_*` flag still shows up there, the
  old Worker is still deployed.

**Optional:** `MOULDS_KEY` — when set, `/api/moulds/status` and `/api/moulds/approve` also require the
`X-Moulds-Key` header (the pages call them from the studio domain, which is always allowed).

Verify: `curl -s https://<worker>/api/health | grep -E "moulds_|email"`

### Worker secrets the mould flow relies on

| Secret | Why |
|---|---|
| `FIREBASE_API_KEY` | Reads/writes Firestore over REST. |
| `STAFF_EMAIL` + `STAFF_PASSWORD` | The Worker signs in as the studio account, so it can create a `mould_orders` document even though visitors are anonymous. **Without these two the public order can only be saved by the browser.** |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | The new-order alert with the order's buttons. |

### Firestore rules — `mould_orders`

The order page writes as a visitor. If your rules only let signed-in staff write to `mould_orders`,
the Worker's staff sign-in covers it (see above). If you would rather allow the public create, add
this inside `match /databases/{database}/documents { … }` and publish it:

```
match /mould_orders/{id} {
  allow read: if request.auth != null;
  allow create: if request.resource.data.status == 'pending'
                && request.resource.data.name is string
                && request.resource.data.name.size() < 100
                && request.resource.data.phone is string
                && request.resource.data.total is number;
  allow update, delete: if request.auth != null;
}
```

`settings/site` and `settings/banners` must stay readable without signing in (`allow read: if true`),
otherwise `/moulds` falls back to the default prices and the home page cannot show a saved banner.

`settings/site` may have been created before the mould fields existed. A **missing** `mouldPerArch` /
`mouldDeliveryFee` now means "use the published rate" (450 / 100) on both the page and the Worker —
only an explicit `0` is a real zero, so the delivery fee can no longer silently vanish. Press
**Save prices** in /editx → Moulds once to store your own numbers.

---

## Image crops — one crop per placement, never destructive

Every photo keeps its original file. A crop is just a framing stored next to it and applied at
render time, so it can be changed or thrown away whenever you like — and the same photo can be
framed one way as a hero, another as a home banner and a third as a design card.

| Placement | Key | Where to edit |
|---|---|---|
| Page hero (home, golds, silvers, diamonds, latest designs, gallery) | `hero:<page>` | /editx → Inventory → **Page Heroes** → *Adjust crop* |
| Home section banner (golds / silvers / diamonds) | `banner:<tier>` | /editx → **Home Banners** → *Adjust crop* |
| Design card | `card:<category>/<folder>` for the whole design, `card:<category>/<folder>::<file>` for one photo | /editx → Inventory → card → *Crop* |

* Stored in Firestore **`settings/crops`** → `{ items: [ { slot, path, x, y, zoom } ] }` (public read).
* `assets/crops.js` draws them with `object-position` (pan) plus a scaled box (zoom) — deliberately
  **no CSS transform**, so the card/hero hover animations keep working.
* The editor and the pages share `Crops.applyStyles()`, so the preview is exactly what visitors get.
* An element can claim a placement with `data-crop="hero:index"`, and opt out with `data-crop="off"`.
* The crop editor also previews the frame in the real aspect ratio (banner 16:7, hero 16:9,
  card 4:5) with wide/phone/square presets.

---

## Deploy — 3 paths, pick one

### A. Cloudflare Pages (recommended — required for `_headers`, `_redirects`, 301s and the CSP)
1. Push this folder's contents to the root of the `egygrillz/egygriilz` repo.
   ```bash
   # from your local clone
   rsync -a --delete public/ /path/to/egygriilz/ \
     --exclude .git --exclude assets/images/golds \
     --exclude assets/images/silvers --exclude assets/images/latest-designs
   git add -A && git commit -m "clean URLs, security headers, optimised images, auth gating" && git push
   ```
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → repo, framework *None*,
   build command empty, output directory **`/`**.
3. Add custom domain `egygrillz.com` (and `www`), keep the record **Proxied**.
4. Verify:
   ```bash
   curl -sI https://egygrillz.com | grep -iE "strict-transport|content-security|x-frame"
   curl -sI https://egygrillz.com/booking.html | head -1     # → 301
   curl -s  https://egygrillz.com/booking | head -1          # → 200, no .html
   ```

### B. GitHub Pages only (works, but no headers/301s)
Clean URLs **do** work on GitHub Pages (`/booking` serves `booking.html`). You lose `_headers`, `_redirects`,
HSTS and the CSP — so old `…/booking.html` links keep working (no 301) and the security headers must wait until
you move. If you take this path, still ship the pages + images now, then move to Pages later.

### C. Netlify
Keep `_headers`; `_redirects` works identically. Clean URLs are on by default (pretty URLs).

---

## GitHub-first media workflow

Catalog media lives in `assets/images/` and is indexed in `assets/images/catalog.json`
(managed via `/editx`, compressed client-side by `assets/media-pipeline.js`).
Use `/MTC` (Catalog &amp; Media Diagnostics) to audit asset references in `catalog.json`.

---

## Small manual edits left for you (2 minutes)

1. `index.html` → replace the comment `<!-- Google Search Console: paste your real verification meta here -->`
   with your real `<meta name="google-site-verification" content="…">`.
2. `assets/egygz-notify.js` → set `ENDPOINT` to your deployed Worker URL.
3. Firebase Console → create the staff user, then paste the `mould_orders` rules from the section above.

## Verify the clean-URL behaviour locally
```bash
python3 serve.py     # http://localhost:8000   — /booking resolves, /nope shows the branded 404
```
