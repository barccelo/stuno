import { readFile, writeFile } from "node:fs/promises";

async function patch(path, transform) {
  const before = await readFile(path, "utf8");
  const after = transform(before);
  if (after !== before) await writeFile(path, after, "utf8");
}

const marker = "TURN STEAL event notification v1";

await patch("lib/game.ts", (source) => {
  if (source.includes('"turn-steal"')) return source;
  const pattern = /(lastEvent\?: \{[\s\S]*?kind: )([^;]+)(;[\s\S]*?label\?: string;)/m;
  const match = source.match(pattern);
  if (!match) throw new Error("No se encontró el tipo lastEvent en lib/game.ts.");
  const kinds = match[2].trim();
  return source.replace(pattern, `$1${kinds} | "turn-steal"$3`.replace("$1", match[1]).replace("$3", match[3]));
});

await patch("app/api/rooms/route.ts", (source) => {
  if (source.includes(`// ${marker}`)) return source;
  const anchor = '      state.message = actor.name + " robó el turno con " + card.label + ".";';
  if (!source.includes(anchor))
    throw new Error("No se encontró el punto de confirmación de Robar turno en el servidor.");
  const addition = `${anchor}\n      // ${marker}\n      const stolenFrom = state.players.find((item) => item.id === previousId);\n      state.lastEvent = {\n        kind: "turn-steal",\n        actorId: actor.id,\n        actorName: actor.name,\n        targets: stolenFrom ? [{ id: stolenFrom.id, name: stolenFrom.name }] : [],\n        label: card.label,\n        global: true,\n        at: Date.now(),\n      };`;
  return source.replace(anchor, addition);
});

await patch("app/page.tsx", (source) => {
  if (!source.includes('kind: "turn-steal"') && !source.includes('| "turn-steal";')) {
    const typePattern = /(lastEvent\?: \{[\s\S]*?kind: )([^;]+)(;[\s\S]*?label\?: string;)/m;
    const match = source.match(typePattern);
    if (!match) throw new Error("No se encontró el tipo lastEvent en app/page.tsx.");
    source = source.replace(
      typePattern,
      match[1] + match[2].trim() + ' | "turn-steal"' + match[3],
    );
  }

  if (!source.includes(`// ${marker}`)) {
    const anchor = '    if (event.kind === "block")';
    if (!source.includes(anchor)) throw new Error("No se encontró eventCopy para Robar turno.");
    const block = [
      `    // ${marker}`,
      '    if (event.kind === "turn-steal") {',
      '      const victim = event.targets.find((target) => target.id === playerId);',
      '      const label = event.label ?? "la misma carta";',
      '      const victimName = event.targets[0]?.name ?? "otro jugador";',
      '      if (event.actorId === playerId)',
      '        return { title: "Robaste el turno", detail: `Te adelantaste con otra ${label}.` };',
      '      if (victim)',
      '        return { title: "Te robaron el turno", detail: `${event.actorName} se adelantó con otra ${label}.` };',
      '      return {',
      '        title: `${event.actorName} robó el turno`,',
      '        detail: `Se adelantó con otra ${label} antes que ${victimName}.`,',
      '      };',
      '    }',
    ].join("\n") + "\n";
    source = source.replace(anchor, block + anchor);
  }

  const symbolAnchor = '                        {room.lastEvent!.kind === "block" ? (';
  if (!source.includes('room.lastEvent!.kind === "turn-steal" ? (')) {
    if (!source.includes(symbolAnchor))
      throw new Error("No se encontró el símbolo del popup de eventos.");
    const replacement = [
      '                        {room.lastEvent!.kind === "turn-steal" ? (',
      '                          <span className={`turn-steal-event-card mini-play-card ${room.centerPile?.[room.centerPile.length - 1]?.kind ?? ""}`}>',
      '                            {centerCardLabel(',
      '                              room.centerPile?.[room.centerPile.length - 1]?.kind ?? "letter",',
      '                              room.lastEvent!.label ?? "?",',
      '                            )}',
      '                          </span>',
      '                        ) : room.lastEvent!.kind === "block" ? (',
    ].join("\n");
    source = source.replace(symbolAnchor, replacement);
  }

  return source;
});

await patch("app/ui-fixes.css", (source) => {
  if (source.includes("/* Turn steal event notification. */")) return source;
  return source + `\n\n/* Turn steal event notification. */\n/* Keep the standard event-popup layout. Only replace its left symbol with a mini card. */\n.game-event-popup.turn-steal .game-event-symbol {\n  background: transparent !important;\n  box-shadow: none !important;\n  overflow: visible !important;\n}\n.game-event-popup.turn-steal .turn-steal-event-card {\n  position: static !important;\n  inset: auto !important;\n  transform: none !important;\n  width: 44px !important;\n  height: 54px !important;\n  min-width: 44px !important;\n  margin: 0 auto !important;\n  padding: 4px !important;\n  font-size: 14px !important;\n  line-height: 1 !important;\n  display: grid !important;\n  place-items: center !important;\n  text-align: center !important;\n  white-space: normal !important;\n  overflow: hidden !important;\n}\n.game-event-popup.turn-steal > strong,\n.game-event-popup.turn-steal > small {\n  min-width: 0 !important;\n  text-align: center !important;\n}\n.game-event-popup.turn-steal > small {\n  white-space: normal !important;\n  overflow-wrap: anywhere !important;\n}\n@media (max-width: 520px) {\n  .game-event-popup.turn-steal .turn-steal-event-card {\n    width: 42px !important;\n    min-width: 42px !important;\n    height: 52px !important;\n    font-size: 13px !important;\n  }\n}\n`;
});

console.log("Turn steal event notification applied.");
