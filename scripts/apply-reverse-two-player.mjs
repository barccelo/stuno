import { readFile, writeFile } from "node:fs/promises";

const path = "app/api/rooms/route.ts";
let source = await readFile(path, "utf8");

const marker = "// REVERSE two-player rule v1";
if (!source.includes(marker)) {
  const from = `        } else if (card.kind === "reverse") {
          state.direction = state.direction === 1 ? -1 : 1;
          nextIndex(state);
          state.lastEvent = {
            kind: "reverse",
            actorId: actor!.id,
            actorName: actor!.name,
            targets: [],
            global: true,
            at: Date.now(),
          };
          state.message = \`${"${actor!.name}"} cambió el sentido de juego.\`;
`;

  const to = `        } else if (card.kind === "reverse") {
          // REVERSE two-player rule v1
          state.direction = state.direction === 1 ? -1 : 1;
          const keepsTurn =
            state.settings.mode === "classic" && state.players.length === 2;
          if (!keepsTurn) nextIndex(state);
          else state.turnStartedAt = Date.now();
          state.lastEvent = {
            kind: "reverse",
            actorId: actor!.id,
            actorName: actor!.name,
            targets: [],
            global: true,
            at: Date.now(),
          };
          state.message = keepsTurn
            ? \`${"${actor!.name}"} jugó INVERSA y vuelve a jugar.\`
            : \`${"${actor!.name}"} cambió el sentido de juego.\`;
`;

  if (!source.includes(from)) {
    throw new Error("No se encontró el bloque actual de la carta INVERSA.");
  }
  source = source.replace(from, to);
  await writeFile(path, source, "utf8");
}
