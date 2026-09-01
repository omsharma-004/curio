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
