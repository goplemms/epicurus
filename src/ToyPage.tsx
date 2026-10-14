import { type ReactNode, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { ToyMeta } from "./toy";
import "./site.css";

/**
 * Mounts a toy inside the shared page chrome. Call once from toys/<slug>/main.tsx.
 * `layout: "full"` gives the toy the whole window under a slim header, for games and canvases.
 */
export function mountToy(
  meta: ToyMeta,
  app: ReactNode,
  opts: { layout?: "column" | "full" } = {},
): void {
  const root = document.getElementById("root");
  if (!root) throw new Error("missing #root");
  document.title = `${meta.title} · epicurus`;
  createRoot(root).render(
    <StrictMode>
      {opts.layout === "full" ? (
        <div className="toy-full">
          <header className="toy-full-bar">
            <a href="/">← epicurus</a>
            <h1>{meta.title}</h1>
          </header>
          {app}
        </div>
      ) : (
        <main>
          <nav className="back">
            <a href="/">← epicurus</a>
          </nav>
          <h1>{meta.title}</h1>
          <p className="lede">{meta.blurb}</p>
          {app}
        </main>
      )}
    </StrictMode>,
  );
}
