# Deploying the public site to Vercel

The deployed site is the public half of `apps/web`: verdict pages, `/scan`, `/audit` and `/api/verify`. It is read-only
and holds no secret key. The manager (`/manager`) stays off in production, because it signs with keys kept on disk
and a serverless host has none. Use the manager locally, against the same devnet.

## 1. Create the project

1. Vercel dashboard, **Add New, Project**, import `ysrael12/certapharm`.
2. **Root Directory:** `apps/web`. Leave **Include source files outside of the Root Directory** on (it is the default).
3. Framework: Next.js (detected). Install and build commands come from `apps/web/vercel.json`, which installs the whole
   workspace and builds the packages `apps/web` depends on before `next build`.

## 2. Environment variables

| Name | Value | Secret |
|---|---|---|
| `RPC_URL` | your Helius devnet URL, with the API key | yes |
| `CLUSTER` | `devnet` | no |
| `PLATFORM_AUTHORITY` | `9BTQXrLRmBRdq4VZV9NeZiUQPa7xXiEfDUBjbFevuG5L` (public key) | no |
| `SEALS_ENABLED` | `true` | no |
| `SEAL_TREES` | the contents of `config/seal-trees.json` on one line | no |
| `PUBLIC_BASE_URL` | the deployed address, for example `https://certapharm.vercel.app` | no |

Do **not** set `PLATFORM_SECRET` or `MANAGER_TOKEN` on Vercel.

`PUBLIC_BASE_URL` is only known after the first deploy. Deploy once, set it, then redeploy.

## 3. Check the deployment

```sh
BASE=https://<your-project>.vercel.app
curl "$BASE/api/verify?link=/01/02001234567893/10/L2026D"            # AUTHENTIC
curl "$BASE/api/verify?link=/01/02001234567893/10/L2026E"            # AUTHENTIC_WITH_ALERT
curl "$BASE/api/verify?link=/01/02001234567893/10/L2026X"            # NOT_RECOGNIZED
curl "$BASE/api/verify?link=/01/02001234567893/10/L2026D/21/0003"    # AUTHENTIC, seal SEALED
curl "$BASE/api/verify?link=/01/02001234567893/10/L2026D/21/9999"    # NOT_RECOGNIZED, UNIT_NOT_SEALED
```

Then open `$BASE/01/02001234567893/10/L2026E` on a phone.

## 4. Print the QR codes

With `PUBLIC_BASE_URL` set to the deployed address in your local `.env`:

```sh
pnpm --filter @certapharm/cli cph demo:qr
```

This writes `demo/qr-L2026D.png`, `qr-L2026E.png`, `qr-L2026X.png` and two unit codes (`0001` sealed, `9999` never sealed).
Point the phone's own camera at one: it opens the verdict page directly.

## Notes

- `/api/verify` limits each IP to 30 requests a minute, counted per server instance.
- The first request after a cold start is slower (a few seconds) while the RPC connection warms up.
- The `RPC_URL` key stays on the server. No variable starts with `NEXT_PUBLIC_`.
