# Curio

Capture. Organize. Discover. — a local-first research library (V0 prototype).

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview   # sanity-check the build locally on http://localhost:4173
```

Output goes to `dist/`.

## Deployment

This is a client-side-routed single-page app (`/` = landing, `/app` = the
Curio application, using the browser History API — no router library). Any
static host works, but **the host must be configured to serve `index.html`
for unknown paths** (a "SPA fallback" / rewrite rule), or a direct visit or
refresh of `/app` will 404.

### Vercel (recommended)

1. Push this repo to GitHub/GitLab/Bitbucket.
2. Import it in Vercel. Framework preset: **Vite**. Build command:
   `npm run build`. Output directory: `dist`.
3. `vercel.json` (already included) rewrites all paths to `/index.html`, so
   `/app` works on direct load and refresh out of the box.

### Netlify

1. Push the repo, then "Import an existing project" in Netlify.
2. Build command `npm run build`, publish directory `dist`
   (already set in `netlify.toml`).
3. `public/_redirects` is copied into `dist/` on build and handles the SPA
   fallback.

### Cloudflare Pages

1. Build command `npm run build`, output directory `dist`.
2. Cloudflare Pages reads the same `_redirects` syntax as Netlify, so the
   existing `public/_redirects` file covers it — no extra config needed.

### Plain static hosting (S3, nginx, etc.)

You must add your own rewrite so every path serves `dist/index.html` with a
200 status (not a redirect to `/`, and not a 404). For nginx:

```
location / {
  try_files $uri $uri/ /index.html;
}
```

GitHub Pages does **not** support this without an extra 404.html workaround
and is not recommended for this project as-is.

## Troubleshooting: "my changes/added resources don't show up after refresh"

Resources are persisted to the browser via `localStorage` under the key
`curio.resources.v1`. If a saved resource seems to disappear on refresh:

1. **Hard-refresh** (Cmd+Shift+R / Ctrl+Shift+R) instead of a normal refresh.
   Some hosts/CDNs cache `index.html`, and a normal refresh can reuse a
   cached page pointing at an older JS bundle. `vercel.json` / `netlify.toml`
   already set `index.html` to `no-cache, no-store, must-revalidate` and the
   hashed `/assets/*` files to long-term immutable caching, which prevents
   this on a fresh deploy — but browser-side caching from *before* that
   config was deployed can still linger until you hard-refresh once.
2. Open DevTools → **Application** (Chrome/Edge) or **Storage** (Firefox) →
   **Local Storage** → your site's origin, and inspect the
   `curio.resources.v1` key directly. It should update immediately after
   adding/editing/deleting a resource.
3. Open DevTools → **Network** tab, reload, and confirm `index.html` returns
   a fresh response (not `(disk cache)` / `304` pointing at stale content)
   and that it references the current hashed `assets/index-*.js` file.
4. If you're testing via `npm run dev` rather than a deployed build, that's
   also expected to persist correctly — the persistence logic doesn't
   differentiate between dev and production.
