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

await import("./apply-turn-steal.mjs");
