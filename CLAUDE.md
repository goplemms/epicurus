# Notes for Claude

- Toys live in `toys/<slug>/` and start from `toys/_template/`. Don't edit other toys' folders.
- Frontend: React + strict TypeScript + Vite. Run `pnpm check` and `pnpm build` before pushing.
  Don't loosen `tsconfig.json` strictness to get a build through.
- A toy is listed on the home page via its `meta.ts`; there is no hand-maintained list.
- Optional backend: Python in `toys/<slug>/api/` (uv, FastAPI, stdlib sqlite3).
  Run `uv run ruff check . && uv run ruff format --check . && uv run pyright && uv run pytest` there.
- SQLite only. Postgres, user accounts, or ongoing work mean the toy graduates to its own repo.
- The repo is public: no secrets, keys go in host environment variables.
- The rules (README "The rules" and this file) are meant to be revised. When a rule blocks or
  bends during a toy, don't quietly work around it: tell the user and propose the change.
  When a toy ships, briefly ask whether any rule needs updating, then update README, this
  file, and project memory together.
