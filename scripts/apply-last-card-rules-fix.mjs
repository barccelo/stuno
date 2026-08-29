import { readFile, writeFile } from "node:fs/promises";

async function patchFile(path, transform) {
  const before = await readFile(path, "utf8");
  const after = transform(before);
  if (after !== before) await writeFile(path, after, "utf8");
}

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) {
    throw new Error(`No se encontró el bloque esperado para: ${label}`);
  }
  return source.replace(from, to);
}

await patchFile("app/api/rooms/route.ts", (source) => {
  const oldFinishRule =
    '  const finishAfter = owner.hand.length === 0 && card.kind !== "category";';
  const newFinishRule = [
    '  // Sólo una carta de letra puede cerrar la partida. El comodín y las',
    '  // cartas de acción nunca pueden dejar la mano en cero.',
    '  if (owner.hand.length === 0 && card.kind === "letter") {',
    '    declareWinner(state, owner);',
    '    return false;',
    '  }',
    '  if (owner.hand.length === 0 && card.kind === "joker") {',
    '    // Reposición silenciosa: no es una sanción y no debe disparar la',
    '    // animación de robo por penalización.',
    '    draw(state, owner, 1);',
    '  }',
    '  const finishAfter = false;',
  ].join("\n");
  source = replaceRequired(
    source,
    oldFinishRule,
    newFinishRule,
    "regla única de victoria con última carta",
  );

  const oldSpecialStart = [
    '      } else {',
    '        actor!.hand = actor!.hand.filter((item) => item.id !== card.id);',
    '        state.discard.push(card);',
    '        recordCenterPlay(state, actor!, card);',
    '        if (card.kind === "stop") {',
  ].join("\n");
  const newSpecialStart = [
    '      } else {',
    '        actor!.hand = actor!.hand.filter((item) => item.id !== card.id);',
    '        state.discard.push(card);',
    '        recordCenterPlay(state, actor!, card);',
    '        if (actor!.hand.length === 0) {',
    '          // Las cartas de acción se juegan normalmente, pero no pueden',
    '          // ganar. Reponemos antes de resolver el efecto para que SWAP',
    '          // siempre tenga una mano válida que intercambiar.',
    '          draw(state, actor!, 1);',
    '        }',
    '        if (card.kind === "stop") {',
  ].join("\n");
  source = replaceRequired(
    source,
    oldSpecialStart,
    newSpecialStart,
    "reponer inmediatamente la última carta especial",
  );

  return source;
});

console.log("Last-card rules applied.");
