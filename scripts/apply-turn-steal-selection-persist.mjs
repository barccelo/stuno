import { readFile, writeFile } from "node:fs/promises";

// Runs after apply-turn-steal-on-submit.mjs.
// A provisional turn-steal selection must survive while the player is still
// technically out of turn. Match the legacy cleanup effect by behavior rather
// than by one exact source string because earlier build patches can alter its
// dependency list or formatting.
let page = await readFile("app/page.tsx", "utf8");

const marker = "// TURN STEAL provisional-selection persistence v4";
if (!page.includes(marker)) {
  const effectPattern = /  useEffect\(\(\) => \{\s*if \(!selected \|\| canPlay\) return;\s*setSelected\(null\);\s*setAnswer\(""\);\s*setSwapCard\(null\);\s*if \(document\.activeElement instanceof HTMLElement\)\s*document\.activeElement\.blur\(\);\s*\}, \[[^\]]*canPlay[^\]]*selected[^\]]*\]\);/m;

  const replacement = `  useEffect(() => {
    ${marker}
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
  }, [
    canPlay,
    selected,
    hand,
    room?.turnIndex,
    room?.centerPile,
    room?.lastPlay?.at,
  ]);`;

  if (!effectPattern.test(page)) {
    const diagnostic = page.match(/useEffect\(\(\) => \{[\s\S]{0,500}?setSelected\(null\);[\s\S]{0,500}?\}\s*,\s*\[[^\]]*\]\);/m)?.[0];
    throw new Error(
      "No se encontró el efecto de limpieza de selección para Robar turno." +
        (diagnostic ? ` Bloque cercano: ${diagnostic.slice(0, 700)}` : ""),
    );
  }

  page = page.replace(effectPattern, replacement);
  await writeFile("app/page.tsx", page, "utf8");
}

const check = await readFile("app/page.tsx", "utf8");
if (!check.includes(marker) || !check.includes("const provisionalTurnSteal = Boolean("))
  throw new Error("No se aplicó la persistencia de selección para Robar turno.");

console.log("Turn steal fixed: provisional selection persists until submit or invalidation.");
