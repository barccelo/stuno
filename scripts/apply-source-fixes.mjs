import { readFile, writeFile } from "node:fs/promises";

async function patchFile(path, replacements) {
  let source = await readFile(path, "utf8");
  let changed = false;

  for (const { from, to, label } of replacements) {
    if (source.includes(to)) continue;
    if (!source.includes(from)) {
      throw new Error(`No se encontró el bloque esperado para: ${label}`);
    }
    source = source.replace(from, to);
    changed = true;
  }

  if (changed) await writeFile(path, source, "utf8");
}

await patchFile("app/api/rooms/route.ts", [
  {
    label: "permitir X en modo Contiene",
    from: '["Ñ", "Y", "Q", "Z"].includes(card.label.toUpperCase())',
    to: '["Ñ", "Y", "Q", "Z", "X"].includes(card.label.toUpperCase())',
  },
  {
    label: "resolver SWAP cuando es la última carta",
    from: 'const whole = body.swapType !== "one";',
    to: 'const whole = body.swapType !== "one" || actor!.hand.length === 0;',
  },
]);

await patchFile("app/page.tsx", [
  {
    label: "mostrar Contiene también para X",
    from: '["Ñ", "Y", "Q", "Z"].includes(hand.find((card) => card.id === selected)?.label ?? "")',
    to: '["Ñ", "Y", "Q", "Z", "X"].includes(hand.find((card) => card.id === selected)?.label ?? "")',
  },
  {
    label: "reiniciar SWAP en intercambio de mano",
    from: 'if (card.kind === "swap") {\n      setSwapCard(card.id);',
    to: 'if (card.kind === "swap") {\n      setSwapType("whole");\n      setSwapCard(card.id);',
  },
  {
    label: "texto de cartas robadas por sanción",
    from: 'detail: `${event.actorName} te ${count === 1 ? "entregó una carta" : `entregó ${count} cartas`}.`,',
    to: 'detail: `${event.actorName} te ha hecho robar ${count} ${count === 1 ? "carta" : "cartas"}.`,',
  },
]);
