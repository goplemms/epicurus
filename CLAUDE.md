# Notes for Claude

- Static site, no build step, no package.json. Do not add a bundler or framework.
- Each toy lives in `toys/<slug>/` and is self-contained. Start from `toys/_template/`.
- When a toy ships, add it to the list in the root `index.html`.
- Libraries come from a CDN as ES modules (esm.sh, jsdelivr), pinned to a version.
- Anything needing a backend, database or login is out of scope for this repo.
- Preview with `python3 -m http.server`.
