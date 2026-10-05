import { type ReactNode, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { ToyMeta } from "./toy";
import "./site.css";

/** Mounts a toy inside the shared page chrome. Call once from toys/<slug>/main.tsx. */
export function mountToy(meta: ToyMeta, app: ReactNode): void {
  const root = document.getElementById("root");
  if (!root) throw new Error("missing #root");
  document.title = `${meta.title} · epicurus`;
  createRoot(root).render(
    <StrictMode>
      <main>
        <nav className="back">
          <a href="/">← epicurus</a>
        </nav>
        <h1>{meta.title}</h1>
        <p className="lede">{meta.blurb}</p>
        {app}
      </main>
    </StrictMode>,
  );
}
