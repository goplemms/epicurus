const result = document.getElementById("result");
const tally = document.getElementById("tally");
const counts = { heads: 0, tails: 0 };

document.getElementById("flip").addEventListener("click", () => {
  const side = crypto.getRandomValues(new Uint8Array(1))[0] & 1 ? "heads" : "tails";
  counts[side]++;
  result.textContent = side;
  tally.textContent = `heads ${counts.heads} · tails ${counts.tails}`;
});
