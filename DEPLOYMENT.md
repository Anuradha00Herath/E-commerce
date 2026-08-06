# Deploying to staging

Backend (Medusa v2 + Mercur) → **Railway** or **Render**, managed PostgreSQL + Redis.
Storefront (Next.js) → **Vercel**.

This doc is the checklist and step-by-step for standing up a staging environment.
No real secret values live in this file or anywhere in the repo — every value
below is a placeholder you fill in directly in the hosting dashboard.

---

## 1. What changes for production vs local

| Concern | Local | Production/staging |
|---|---|---|
| Database/Redis | Docker Compose containers on custom ports (5433/6380) | Managed Postgres/Redis add-ons from Railway or Render |
| Backend build | `medusa develop` (in-memory watcher, no build step) | `npm run build` from the **workspace root** (`backend/`) → `medusa build` + dashboard bundling, then `medusa start` |
| Backend port | Fixed `9000` | Platform-assigned via `$PORT` — Medusa's CLI already reads this automatically, no code change needed |
| Admin/vendor dashboards | Served from source via Vite dev middleware | Pre-built static bundles baked with the production backend URL at **build time** (`MERCUR_BACKEND_URL`) |
| CORS | `localhost:3000` / `localhost:9000` | Real Vercel and Railway/Render domains |
| Secrets (`JWT_SECRET`, `COOKIE_SECRET`, etc.) | Dev-generated, low-stakes | Freshly generated, never reused from local `.env` |
| Storefront build | `next dev --turbopack` | Vercel's native Next.js build (`next build`) — no Dockerfile needed, Vercel builds it directly |
| File uploads | Local disk | ⚠️ **Known limitation**: still using the local file storage provider. Railway/Render containers are ephemeral — uploaded files (not seeded external URLs) are lost on redeploy. Fine to ship staging with this; swap in S3-compatible storage before relying on real uploads. Out of scope for this pass. |

---

## 2. Files added for this

| File | Purpose |
|---|---|
| `backend/Dockerfile` | Multi-stage production image for the backend. **Build context must be `backend/`**, not `backend/packages/api` — see the comment at the top of the file for why. |
| `backend/.dockerignore` | Keeps secrets/node_modules/build junk out of the image |
| `backend/railway.json` | Tells Railway to build via this Dockerfile and where the healthcheck is |
| `backend/render.yaml` | Render Blueprint declaring the same, if you go with Render instead |
| `backend/packages/api/.env.production.example` | Every backend env var, placeholder values, committed for reference |
| `storefront/.env.production.example` | Every storefront env var, placeholder values, committed for reference |

Also removed `storefront/yarn.lock` — the repo had both a yarn lockfile and an
npm one, which is ambiguous for Vercel's package-manager auto-detection.
npm is what the rest of the project uses, so that's what stays.

---

## 3. Environment variable checklist

### Railway (or Render) — backend service

| Variable | Description |
|---|---|
| `NODE_ENV` | Set to `production` |
| `DATABASE_URL` | Connection string from your Railway/Render managed PostgreSQL — paste exactly as given |
| `REDIS_URL` | Connection string from your Railway/Render managed Redis — paste exactly as given |
| `MEDUSA_BACKEND_URL` | This backend's own public URL (e.g. `https://marketplace-backend.up.railway.app`) |
| `MERCUR_BACKEND_URL` | Same value as `MEDUSA_BACKEND_URL`. **Must be set before the first build** — it's compiled into the admin/vendor dashboard bundles |
| `STORE_CORS` | Your Vercel storefront's URL — who's allowed to call `/store/*` from a browser |
| `ADMIN_CORS` | This backend's own URL (the admin dashboard is served same-origin, but Medusa still checks this) |
| `VENDOR_CORS` | This backend's own URL (same reasoning, for the vendor panel) |
| `AUTH_CORS` | Your Vercel storefront's URL **and** this backend's own URL, comma-separated — auth endpoints are called from both |
| `JWT_SECRET` | Freshly generated random string — signs session JWTs. Never reuse the local dev value |
| `COOKIE_SECRET` | Freshly generated random string — signs cookies. Never reuse the local dev value |
| `MERCUR_VENDOR_URL` | This backend's URL + `/seller` — used in vendor team-invite email links |
| `STOREFRONT_REVALIDATE_URL` | Your deployed Vercel storefront URL — where the backend pings to invalidate its cache when products change |
| `STOREFRONT_REVALIDATE_SECRET` | Freshly generated random string — **must exactly match** the storefront's `REVALIDATE_SECRET` (different name, same value, on purpose) |
| `FILE_BACKEND_URL` | This backend's URL + `/static` (see the file-upload limitation noted above) |

Generate any "freshly generated random string" value with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Vercel — storefront project

| Variable | Description |
|---|---|
| `MEDUSA_BACKEND_URL` | Your deployed backend's URL (Railway/Render) |
| `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` | Generate fresh in the **deployed** admin dashboard (Settings → API Key Management → Publishable Keys) — do not reuse the local one |
| `NEXT_PUBLIC_BASE_URL` | This storefront's own Vercel URL |
| `NEXT_PUBLIC_DEFAULT_REGION` | `lk` (matches the region seeded by `seed-demo-vendor.ts`) — change if staging seeds a different region |
| `NEXT_PUBLIC_VENDOR_URL` | Backend URL + `/seller` (link-out only, not required for core browsing/checkout) |
| `NEXT_PUBLIC_STRIPE_KEY` | Inert placeholder — payments are out of scope this sprint. Don't leave it blank (the app expects a string), just don't wire real payments to it yet |
| `REVALIDATE_SECRET` | **Must exactly match** the backend's `STOREFRONT_REVALIDATE_SECRET` |
| `NEXT_PUBLIC_SITE_NAME` / `NEXT_PUBLIC_SITE_DESCRIPTION` | Site metadata, cosmetic |

---

## 4. Step-by-step: Railway (backend)

1. **Create the Postgres and Redis add-ons first**, in an empty Railway project: "+ New" → Database → PostgreSQL, then again → Redis. Railway provisions both and shows connection strings under each service's "Variables" tab (`DATABASE_URL` / connection string fields) — keep this tab open, you'll copy from here.
2. **Create the backend service**: "+ New" → "GitHub Repo" → select this repo. When prompted for root/config, Railway should detect `backend/railway.json`; if it asks for a root directory explicitly, set it to `backend`.
3. Railway assigns a public domain immediately (Settings → Networking → "Generate Domain" if not already done) — **copy this URL now**, you need it for `MEDUSA_BACKEND_URL`/`MERCUR_BACKEND_URL` before the first successful build.
4. Go to the backend service's **Variables** tab and paste in every variable from the checklist above:
   - For `DATABASE_URL` and `REDIS_URL`, either paste the values shown on the Postgres/Redis services directly, or use Railway's variable-reference syntax (`${{Postgres.DATABASE_URL}}`) if offered — either works.
   - For `MEDUSA_BACKEND_URL` / `MERCUR_BACKEND_URL`, paste the domain from step 3 (with `https://`).
   - For `STORE_CORS`/`AUTH_CORS`, you won't have the Vercel URL yet on a first pass — use a placeholder like `https://placeholder.vercel.app` for now, deploy, then come back and update it once Vercel gives you the real URL (redeploy after changing).
5. Trigger the deploy (Railway does this automatically on save, or hit "Deploy").
6. Once live, run migrations and create your admin user. Railway's dashboard has a "Shell"/CLI-attach option for the running service (`railway run` locally, or the web-based shell) — from there, inside `packages/api`:
   ```bash
   npx medusa db:migrate
   npx medusa user -e you@example.com -p <a-real-password>
   ```
   Optionally also `npm run seed:demo-vendor` if you want the same demo data as local.
7. Verify: visit `https://<your-backend-domain>/health` (should return `OK`), then `/dashboard` and log in.

## 4b. Step-by-step: Render (backend), if you go this route instead

1. Create the PostgreSQL and Redis instances first: Dashboard → "New +" → "PostgreSQL", then again → "Redis" (or "Key Value" if that's the current name in your dashboard). Copy their internal/external connection strings once provisioned.
2. "New +" → "Web Service" → connect this repo. Render should offer to use `backend/render.yaml`; if configuring manually instead, set **Root Directory** to `backend`, **Environment** to `Docker`, and confirm it finds `Dockerfile` there.
3. Render assigns a `.onrender.com` domain on creation — copy it for `MEDUSA_BACKEND_URL`/`MERCUR_BACKEND_URL`.
4. Environment tab → add every variable from the checklist, same as the Railway steps above.
   - ⚠️ If the build fails complaining `MERCUR_BACKEND_URL` is missing, your env vars may not be forwarded into the Docker build step by default on your Render plan — check Render's current docs for "build-time environment variables" / build args, since platform behavior here does change over time.
5. Deploy, then open the Shell tab (or `render ssh`) for the running service, `cd packages/api` if not already there, and run the same `medusa db:migrate` / `medusa user` commands as step 6 above.

---

## 5. Step-by-step: Vercel (storefront)

1. "Add New" → "Project" → import this repo.
2. **Root Directory**: set to `storefront` (Vercel asks this during import — it won't find a Next.js app at the repo root otherwise).
3. Framework preset should auto-detect "Next.js" — leave build/output commands default.
4. **Override the Install Command** to `npm install --legacy-peer-deps`. This is required: the storefront has a peer-dependency conflict (`@medusajs/ui` wants React 18, the app uses React 19) that plain `npm install` will fail on — we hit this locally too and needed the same flag.
5. Settings → Environment Variables → add every variable from the storefront checklist above. Add them to at least the "Production" environment; add to "Preview" too if you want preview deploys to work against the same backend.
   - You won't have `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` yet until the backend is deployed and you've logged into its admin — deploy once with a placeholder, then update and redeploy.
6. Deploy.
7. Once deployed, go back to your backend's env vars (Railway/Render) and update `STORE_CORS`/`AUTH_CORS`/`STOREFRONT_REVALIDATE_URL` with the real Vercel URL, then redeploy the backend so CORS actually allows it.
8. Generate a production publishable key: log into `https://<backend-domain>/dashboard` → Settings → API Key Management → Publishable Keys → create one → paste into Vercel's `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` → redeploy the storefront.

---

## 6. Final sanity check

- `https://<backend-domain>/health` → `OK`
- `https://<backend-domain>/dashboard` → admin login works
- `https://<backend-domain>/seller` → vendor login works (if you seeded the demo vendor)
- `https://<storefront-domain>/lk` → homepage loads, product listing shows real data
- Register a test buyer on the deployed storefront, confirm the customer shows up in `https://<backend-domain>/dashboard` → Customers

If any of the CORS-dependent calls fail with a browser console CORS error, it's almost always a mismatched or stale `STORE_CORS`/`AUTH_CORS` value on the backend — double check it exactly matches the storefront's live URL (including `https://`, no trailing slash) and that you redeployed the backend after changing it.
