# beBook

Convert novels from **WordPress** sites and **TruyenFull** (any domain: `.vn`, `.live`, `.vision`, ...) to EPUB.

- Image-only chapters: images are downloaded and embedded (WebP → JPEG for e-reader compatibility).
- Password-protected WordPress chapters: enter passwords in the UI; passwords written on the novel page are tried automatically.
- EPUBs are generated as background jobs with real progress (chapters done / total).

## Run locally

```bash
cd server && npm install && npm run dev      # API on http://localhost:4000
cd frontend && npm install && npm run dev    # UI (Vite prints the URL, proxies /api → :4000)
```

Port 4000 taken? `PORT=4001 npm run dev` (server) and `BEBOOK_API_PORT=4001 npm run dev` (frontend).

## Production build (single service: API + UI)

```bash
npm run build   # installs & builds frontend and server
npm start       # serves UI + API on $PORT (default 4000)
```

## Deploy to Render

1. Push this repo to GitHub.
2. Render dashboard → **New → Blueprint** → pick the repo (uses `render.yaml`).
3. Set `BASIC_AUTH` to `user:password` to lock the site (recommended), or remove it to make it public.

Any Node host that runs a long-lived process works too (Railway, Fly.io, a VPS): build command `npm run build`, start command `npm start`.
Serverless platforms (Vercel/Netlify functions) are **not** suitable – generating a long novel takes minutes.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | HTTP port |
| `BASIC_AUTH` | – | `user:password` to require a login for the whole site |
| `DOWNLOAD_LIMIT_PER_HOUR` | `10` | EPUB jobs per IP per hour (`0` = unlimited) |
| `INFO_LIMIT_PER_10MIN` | `40` | Novel lookups per IP per 10 minutes (`0` = unlimited) |
| `MAX_CONCURRENT_JOBS` | `2` | EPUBs generated at the same time (others wait in a queue) |
| `TRUST_PROXY` | `1` | Proxy hops to trust for client IPs (Render/Railway need `1`) |
| `ALLOW_PRIVATE_URLS` | `false` | Allow fetching localhost/private IPs (local testing only) |

Jobs and finished EPUBs are kept in memory for 30 minutes and lost on restart, so run a single instance.
