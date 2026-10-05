import { useState } from "react";

type Side = "heads" | "tails";

function flip(): Side {
  const [byte = 0] = crypto.getRandomValues(new Uint8Array(1));
  return byte & 1 ? "heads" : "tails";
}

export function App() {
  const [last, setLast] = useState<Side | null>(null);
  const [counts, setCounts] = useState<Record<Side, number>>({ heads: 0, tails: 0 });

  const onFlip = () => {
    const side = flip();
    setLast(side);
    setCounts((c) => ({ ...c, [side]: c[side] + 1 }));
  };

  return (
    <>
      <p style={{ fontSize: "3rem", margin: "1rem 0" }} aria-live="polite">
        {last ?? "–"}
      </p>
      <button type="button" onClick={onFlip}>
        Flip
      </button>
      <p style={{ color: "var(--muted)" }}>
        heads {counts.heads} · tails {counts.tails}
      </p>
    </>
  );
}
