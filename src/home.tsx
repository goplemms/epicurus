import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { ToyMeta } from "./toy";
import "./site.css";

const modules = import.meta.glob<{ meta: ToyMeta }>("../toys/*/meta.ts", { eager: true });

const toys = Object.entries(modules)
  .map(([path, mod]) => ({ slug: path.split("/")[2] ?? "", ...mod.meta }))
  .filter((t) => t.slug && !t.slug.startsWith("_"))
  .sort((a, b) => b.shipped.localeCompare(a.shipped));

function Home() {
  return (
    <main>
      <h1>epicurus</h1>
      <p className="lede">Small toys, each made in a weekend.</p>
      <ul className="toys">
        {toys.map((t) => (
          <li key={t.slug}>
            <a href={`/toys/${t.slug}/`}>{t.title}</a>
            <span>{t.blurb}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");
createRoot(root).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);
