import { readFile, writeFile } from "node:fs/promises";

// The current build chain inserts several room settings between voice and
// difficulty. Add the turn-steal setting using the stable difficulty anchor,
// then let the main patch install the rest of the feature.
const routePath = "app/api/rooms/route.ts";
let route = await readFile(routePath, "utf8");
if (!route.includes("turnStealEnabled: body.turnStealEnabled !== false,")) {
  const anchor = '          difficulty: "mixed",';
  if (!route.includes(anchor)) {
    throw new Error("No se encontró el ajuste difficulty para instalar Robar turno.");
  }
  route = route.replace(
    anchor,
    '          turnStealEnabled: body.turnStealEnabled !== false,\n' + anchor,
  );
  await writeFile(routePath, route, "utf8");
}

// Pending ROBO is expanded by an earlier patch and its exact formatting has
// changed over time. Install the public armed-card shape at a stable Room
// boundary so the main patch can remain idempotent.
const pagePath = "app/page.tsx";
let page = await readFile(pagePath, "utf8");
if (!page.includes("armedTurnPlay?: {")) {
  const anchor = "  lastPlay?: {";
  if (!page.includes(anchor)) {
    throw new Error("No se encontró lastPlay para tipar Robar turno.");
  }
  const block = [
    "  armedTurnPlay?: {",
    "    playerId: string;",
    "    cardId: string;",
    "    key: string;",
    "    label: string;",
    '    kind: GameCard["kind"];',
    "    penalty?: number;",
    "    at: number;",
    "    committed?: boolean;",
    "    stolenFromId?: string;",
    "  } | null;",
    "",
  ].join("\n");
  page = page.replace(anchor, block + anchor);
  await writeFile(pagePath, page, "utf8");
}

await import("./apply-turn-steal.mjs");
