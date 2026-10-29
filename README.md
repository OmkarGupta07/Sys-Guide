# SysGuide

Offline system design + LLD practice. Plain HTML/CSS/JS, no build step, no dependencies.

## Run locally

```bash
python -m http.server 5173
```

Open http://localhost:5173.

## Put it on your phone (offline)

1. `node tools/check.js && node tools/dist.js` builds `dist/` (only the site files, ~330 KB).
2. Sign in at https://app.netlify.com/drop (free) and drag the `dist` folder onto the page. You get an https URL.
3. Open the URL once in Chrome on Android → menu → **Add to Home screen** (or **Install app**).
4. After that it works with no internet. Progress is stored on the phone.

To update: rebuild `dist/` (bump `VERSION` in `sw.js` first), then in Netlify open the site → Deploys → drag `dist` again. The phone picks it up the next time it opens the app online.

## Add a topic

1. Copy a file in `js/content/` (format is described at the top of `js/app.js`).
2. Add its `<script>` to `index.html` and its path to `FILES` in `sw.js`, then bump `VERSION` in `sw.js`.
3. Run `node tools/check.js` — it runs every scenario 50 times and fails on any broken content.

## Later

- Wrap as an APK with Capacitor.
- On-device AI (v2): small quantized model grounded on these cards.
