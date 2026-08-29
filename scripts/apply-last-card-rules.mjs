import { readFile, writeFile } from "node:fs/promises";

const path = "app/api/rooms/route.ts";
let source = await readFile(path, "utf8");
let changed = false;

function replaceRequired(from, to, label) {
  if (source.includes(to)) return;
  if (!source.includes(from)) {
    throw new Error(`No se encontró el bloque esperado para: ${label}`);
  }
  source = source.replace(from, to);
  changed = true;
}

replaceRequired(
  '  state.acceptedWords.push(normalized(submission.answer));\n  const finishAfter = owner.hand.length === 0 && card.kind !== "category";\n  if (card.penalty) {',
  '  state.acceptedWords.push(normalized(submission.answer));\n  const finishAfter = owner.hand.length === 0 && card.kind === "letter";\n  if (finishAfter) {\n    declareWinner(state, owner);\n    return false;\n  }\n  // El comodín no puede cerrar la partida. Si era la última carta,\n  // se repone inmediatamente sin generar una animación de sanción/robo.\n  if (owner.hand.length === 0) draw(state, owner, 1);\n  if (card.penalty) {',
  "hacer que sólo una letra pueda ganar y omitir la penitencia al cerrar",
);

replaceRequired(
  '        actor!.hand = actor!.hand.filter((item) => item.id !== card.id);\n        state.discard.push(card);\n        recordCenterPlay(state, actor!, card);\n        if (card.kind === "stop") {',
  '        actor!.hand = actor!.hand.filter((item) => item.id !== card.id);\n        state.discard.push(card);\n        recordCenterPlay(state, actor!, card);\n        // Ninguna carta de acción puede cerrar la partida. La carta de\n        // reemplazo entra antes de resolver el efecto para que SWAP tenga\n        // una mano válida incluso cuando era la última carta. Usamos draw()\n        // a propósito para no disparar la animación de robo por sanción.\n        if (actor!.hand.length === 0) draw(state, actor!, 1);\n        if (card.kind === "stop") {',
  "reponer inmediatamente la última carta especial",
);

if (changed) await writeFile(path, source, "utf8");
console.log("Last-card rules applied.");
