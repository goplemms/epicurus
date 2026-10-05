import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Every toys/<slug>/index.html is its own page. Folders starting with "_" are skipped.
const toys = readdirSync(resolve(import.meta.dirname, "toys"), { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
  .map((d) => d.name)
  .filter((slug) => existsSync(resolve(import.meta.dirname, "toys", slug, "index.html")));

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        home: resolve(import.meta.dirname, "index.html"),
        ...Object.fromEntries(
          toys.map((slug) => [slug, resolve(import.meta.dirname, "toys", slug, "index.html")]),
        ),
      },
    },
  },
  server: {
    // A toy with an api/ folder runs it on :8000; the dev server forwards /api/<slug>/* to it.
    proxy: {
      "/api": { target: "http://localhost:8000", rewrite: (p) => p.replace(/^\/api\/[^/]+/, "") },
    },
  },
});
