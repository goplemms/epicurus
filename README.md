# epicurus

A personal site for small toy apps: a break from the long-running projects.

## The rules

- **A toy ships within a weekend or gets cut.** That's the whole point.
- **One repo for every toy.** Each toy lives in `toys/<slug>/` and doesn't
  touch other toys' folders.
- **Frontend first.** Most toys are static pages. A toy may have a small
  Python API in `toys/<slug>/api/` when it really needs one.
- **SQLite only.** A toy that needs Postgres, user accounts, or keeps
  needing work after its weekend has outgrown this repo and graduates
  to its own.
- **No secrets in the repo.** It's public. Keys go in the host's
  environment variables.

## Stack

| Part      | Choice                                             |
| --------- | -------------------------------------------------- |
| Frontend  | React 19, TypeScript (strict), Vite                |
| Lint/fmt  | Biome                                              |
| Packages  | pnpm                                               |
| API       | Python, FastAPI, uv, Ruff, pyright (strict), pytest |
| Database  | SQLite (stdlib `sqlite3`)                          |
| Hosting   | Cloudflare Pages (frontend), Fly.io or similar (APIs) |

## Layout

```
index.html, src/home.tsx   home page; lists every toy automatically
src/ToyPage.tsx            shared page chrome (mountToy)
src/site.css               shared look
public/                    copied as-is (_headers, 404.html)
toys/_template/            copy this to start a toy
toys/<slug>/
  index.html, main.tsx     entry; picked up by vite.config.ts
  meta.ts                  title, blurb, ship date for the home list
  App.tsx                  the toy
  api/                     optional Python API (delete if unused)
```

## Starting a toy

```sh
cp -r toys/_template toys/my-toy
rm -r toys/my-toy/api   # unless it needs a backend
```

Edit `meta.ts` and `App.tsx`. The home page and the build pick the toy
up on their own. Folders starting with `_` are skipped.

## Running locally

```sh
pnpm install
pnpm dev          # http://localhost:5173
pnpm check        # Biome + tsc
pnpm build        # outputs dist/
```

For a toy with an API, in another terminal:

```sh
cd toys/my-toy/api
uv sync
uv run uvicorn app.main:app --reload --port 8000
uv run ruff check . && uv run pyright && uv run pytest
```

During `pnpm dev`, requests to `/api/<slug>/...` are forwarded to
`localhost:8000/...`. In production, call the API's own URL:

```ts
const API = import.meta.env.DEV ? "/api/my-toy" : "https://epicurus-my-toy.fly.dev";
```

Set `ALLOWED_ORIGINS` on the API host to the site's URL so CORS allows it.

## Hosting

Frontend on Cloudflare Pages, connected to this repo:

- Framework preset: Vite (or None)
- Build command: `pnpm build`
- Build output directory: `dist`

Every push to `main` deploys; every branch gets a preview URL.

An API deploys separately from its folder using its `Dockerfile`, to a
host that sleeps when idle (Fly.io, Railway). Give it a volume at `/data`
so the SQLite file survives restarts.
