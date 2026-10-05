# epicurus

A personal site for small toy apps: a break from the long-running projects.

## The rules

- A toy ships within a weekend or gets cut.
- No backend, no database, no login. Anything that needs one gets its own repo.
- No build step. Every file in this repo is served as-is.

## Layout

```
index.html          list of toys (edit by hand when a toy ships)
404.html
_headers            Cloudflare Pages response headers
assets/site.css     shared look; toys may use it or ignore it
toys/_template/     copy this to start a toy
toys/<slug>/        one folder per toy, self-contained
```

## Starting a toy

```sh
cp -r toys/_template toys/my-toy
```

Edit `toys/my-toy/index.html`, then add a line to the list in `index.html`.
A toy owns its folder: its own HTML, CSS, JS and assets. Need a library?
Import it as an ES module from a CDN (for example `https://esm.sh/<pkg>`)
rather than adding a bundler. If a toy truly needs a build, it is probably
not a toy.

## Running locally

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Hosting

Cloudflare Pages, connected to this repo:

- Framework preset: None
- Build command: (empty)
- Build output directory: `/`

Every push to `main` deploys; every branch gets a preview URL.
Netlify also works with the same settings (publish directory `.`); it reads `_headers` in the same format.
