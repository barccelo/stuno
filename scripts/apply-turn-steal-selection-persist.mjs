import { readFile, writeFile } from "node:fs/promises";

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`No se encontró el bloque esperado para: ${label}`);
  return source.replace(from, to);
}

// Runs after apply-turn-steal-on-submit.mjs.
// A provisional turn-steal selection must survive while the player is still
// technically out of turn. The legacy cleanup effect used !canPlay as a reason
// to clear every selection, which made the answer field flash and disappear.
let page = await readFile("app/page.tsx", "utf8");

page = replaceRequired(
  page,
  `  useEffect(() => {
    if (!selected || canPlay) return;
    setSelected(null);
    setAnswer("");
    setSwapCard(null);
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
  }, [canPlay, selected]);`,
  `  useEffect(() => {
    if (!selected || canPlay) return;
    const selectedCard = hand.find((card) => card.id === selected);
    const provisionalTurnSteal = Boolean(
      selectedCard && isTurnStealReady(selectedCard),
    );
    if (provisionalTurnSteal) return;
    setSelected(null);
    setAnswer("");
    setSwapCard(null);
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
  }, [canPlay, selected, room?.turnIndex, room?.centerPile, room?.lastPlay?.at]);`,
  "conservar selección provisional de Robar turno",
);

await writeFile("app/page.tsx", page, "utf8");

const check = await readFile("app/page.tsx", "utf8");
if (!check.includes("const provisionalTurnSteal = Boolean("))
  throw new Error("No se aplicó la persistencia de selección para Robar turno.");

console.log("Turn steal fixed: provisional selection persists until submit or invalidation.");
