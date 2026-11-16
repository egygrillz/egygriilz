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
3. Firebase Console → create the staff user, then deploy `deploy/firestore.rules`.

## Verify the clean-URL behaviour locally
```bash
python3 serve.py     # http://localhost:8000   — /booking resolves, /nope shows the branded 404
```
