import { readFile, writeFile } from "node:fs/promises";

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from))
    throw new Error(`No se encontró el bloque esperado para: ${label}`);
  return source.replace(from, to);
}

function patchNoticeType(source, kindType, label) {
  const start = source.indexOf("lastTurnStealNotice?: {");
  if (start < 0) throw new Error(`No se encontró lastTurnStealNotice para: ${label}`);
  const end = source.indexOf("  } | null;", start);
  if (end < 0) throw new Error(`No se pudo aislar lastTurnStealNotice para: ${label}`);
  const block = source.slice(start, end);
  if (block.includes(`kind: ${kindType};`)) return source;
  const anchor = "    label: string;";
  if (!block.includes(anchor))
    throw new Error(`No se encontró label en lastTurnStealNotice para: ${label}`);
  const changed = block.replace(anchor, `${anchor}\n    kind: ${kindType};`);
  return source.slice(0, start) + changed + source.slice(end);
}

function patchEventSlotNotice(source) {
  const marker = "TURN STEAL event-slot v2";
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0)
    throw new Error("No se encontró el aviso de Robar turno dentro del event-slot estándar.");

  const blockStart = source.lastIndexOf("                {/*", markerIndex);
  const endAnchor = "                {room.lastEvent &&";
  const blockEnd = source.indexOf(endAnchor, markerIndex);
  if (blockStart < 0 || blockEnd < 0)
    throw new Error("No se pudo aislar el aviso final de Robar turno en event-slot.");

  let block = source.slice(blockStart, blockEnd);

  if (!block.includes("const turnStealCardDescription =")) {
    const noticeLine = "                    const notice = room.lastTurnStealNotice!;";
    if (!block.includes(noticeLine))
      throw new Error("No se encontró la variable notice del event-slot de Robar turno.");
    const description = [
      noticeLine,
      "                    const turnStealCardDescription =",
      '                      notice.kind === "joker"',
      '                        ? "un comodín"',
      '                        : notice.kind === "stop"',
      '                          ? "una carta Bloquear turno"',
      '                          : notice.kind === "reverse"',
      '                            ? "una Inversa"',
      '                            : notice.kind === "swap"',
      '                              ? "un SWAP"',
      '                              : notice.kind === "category"',
      '                                ? "una Nueva categoría"',
      '                                : notice.kind === "combo"',
      '                                  ? "un COMBO"',
      '                                  : notice.kind === "steal"',
      '                                    ? "una carta ROBO"',
      '                                    : `otra ${notice.label}`;',
    ].join("\n");
    block = block.replace(noticeLine, description);
  }

  const oldDetail = [
    "                    const detail = notice.actorId === playerId",
    '                      ? `Te adelantaste con otra ${notice.label}.`',
    "                      : notice.victimId === playerId",
    '                        ? `${notice.actorName} se adelantó con otra ${notice.label}.`',
    '                        : `Se adelantó con otra ${notice.label} antes que ${notice.victimName}.`;',
  ].join("\n");
  const newDetail = [
    "                    const detail = notice.actorId === playerId",
    '                      ? `Te adelantaste con ${turnStealCardDescription}.`',
    "                      : notice.victimId === playerId",
    '                        ? `${notice.actorName} se adelantó con ${turnStealCardDescription}.`',
    '                        : `Se adelantó con ${turnStealCardDescription} antes que ${notice.victimName}.`;',
  ].join("\n");
  if (!block.includes(newDetail)) {
    if (!block.includes(oldDetail))
      throw new Error("No se encontró el texto actual del aviso de Robar turno en event-slot.");
    block = block.replace(oldDetail, newDetail);
  }

  const oldSymbolStart = "                    const symbol = notice.label.length <= 2";
  const symbolEnd = "                            : notice.label.slice(0, 2);";
  const oldSymbolIndex = block.indexOf(oldSymbolStart);
  const oldSymbolEnd = oldSymbolIndex >= 0 ? block.indexOf(symbolEnd, oldSymbolIndex) : -1;
  if (!block.includes("const symbol = notice.kind === \"joker\"")) {
    if (oldSymbolIndex < 0 || oldSymbolEnd < 0)
      throw new Error("No se encontró el cálculo del símbolo de Robar turno.");
    const replacement = [
      '                    const symbol = notice.kind === "joker"',
      '                      ? "★"',
      '                      : notice.kind === "stop"',
      '                        ? "⊘"',
      '                        : notice.kind === "reverse"',
      '                          ? "↔"',
      '                          : notice.kind === "swap"',
      '                            ? "⇄"',
      '                            : notice.kind === "category"',
      '                              ? "C"',
      '                              : notice.kind === "combo"',
      '                                ? "COMBO"',
      '                                : notice.kind === "steal"',
      '                                  ? "☠"',
      '                                  : notice.label;',
    ].join("\n");
    block =
      block.slice(0, oldSymbolIndex) +
      replacement +
      block.slice(oldSymbolEnd + symbolEnd.length);
  }

  const oldCard = '<span className="turn-steal-slot-card">{symbol}</span>';
  const newCard = '<span className={`turn-steal-slot-card ${notice.kind ?? "letter"}`}>{symbol}</span>';
  if (!block.includes(newCard)) {
    if (!block.includes(oldCard))
      throw new Error("No se encontró la mini carta del event-slot de Robar turno.");
    block = block.replace(oldCard, newCard);
  }

  return source.slice(0, blockStart) + block + source.slice(blockEnd);
}

// ---------- Shared state: remember the exact card used to steal the turn ----------
let game = await readFile("lib/game.ts", "utf8");
if (!game.includes("turnStealCardKind?: CardKind;")) {
  game = replaceRequired(
    game,
    "  turnStealVictimId?: string;",
    "  turnStealVictimId?: string;\n  turnStealCardKind?: CardKind;",
    "tipo de carta usada para Robar turno en Submission",
  );
}
game = patchNoticeType(game, "CardKind", "GameState");
await writeFile("lib/game.ts", game, "utf8");

// ---------- Server: carry the card kind through validation ----------
let route = await readFile("app/api/rooms/route.ts", "utf8");
route = replaceRequired(
  route,
  [
    "    let confirmedTurnStealVictimId: string | null = null;",
    "    let confirmedTurnStealLabel: string | null = null;",
  ].join("\n"),
  [
    "    let confirmedTurnStealVictimId: string | null = null;",
    "    let confirmedTurnStealLabel: string | null = null;",
    '    let confirmedTurnStealKind: GameCard["kind"] | null = null;',
  ].join("\n"),
  "variable del tipo de carta que roba el turno",
);

route = replaceRequired(
  route,
  [
    "        confirmedTurnStealVictimId = armed.stolenFromId ?? null;",
    "        confirmedTurnStealLabel = armed.label;",
  ].join("\n"),
  [
    "        confirmedTurnStealVictimId = armed.stolenFromId ?? null;",
    "        confirmedTurnStealLabel = armed.label;",
    "        confirmedTurnStealKind = armed.kind;",
  ].join("\n"),
  "capturar la carta real de Robar turno",
);

route = replaceRequired(
  route,
  "          turnStealVictimId: confirmedTurnStealVictimId ?? undefined,",
  [
    "          turnStealVictimId: confirmedTurnStealVictimId ?? undefined,",
    "          turnStealCardKind: confirmedTurnStealKind ?? undefined,",
  ].join("\n"),
  "guardar el tipo de carta en la jugada",
);

route = replaceRequired(
  route,
  '    label: submission.cardLabel ?? state.lastPlay?.label ?? "?",',
  [
    '    label: submission.cardLabel ?? state.lastPlay?.label ?? "?",',
    '    kind: submission.turnStealCardKind ?? "letter",',
  ].join("\n"),
  "publicar la carta real en el aviso validado",
);
await writeFile("app/api/rooms/route.ts", route, "utf8");

// ---------- Client: render the exact card in the final standard event slot ----------
const pagePath = "app/page.tsx";
let page = await readFile(pagePath, "utf8");
page = patchNoticeType(page, 'GameCard["kind"]', "Room UI");
page = patchEventSlotNotice(page);
await writeFile(pagePath, page, "utf8");

// ---------- Visual parity ----------
const cssPath = "app/ui-fixes.css";
let css = await readFile(cssPath, "utf8");
const cssMarker = "/* TURN STEAL real card identity v2 */";
if (!css.includes(cssMarker)) {
  css += `\n\n${cssMarker}
/* Center the joker popup star by geometry instead of the glyph baseline. */
.game-event-popup.joker .game-event-symbol,
.game-event-symbol.joker {
  position: relative !important;
  display: grid !important;
  place-items: center !important;
  padding: 0 !important;
}
.game-event-popup.joker .game-event-symbol::before,
.game-event-symbol.joker::before {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  display: grid !important;
  place-items: center !important;
  line-height: 1 !important;
  transform: none !important;
}

/* Robar turno keeps the standard popup geometry, but its miniature now mirrors
   the real card type used to take the turn. */
.event-slot .game-event-popup.turn-steal .turn-steal-slot-card.joker {
  background: var(--gold, #f4bd3b) !important;
  color: var(--ink, #14213d) !important;
  -webkit-text-fill-color: var(--ink, #14213d) !important;
  border-color: rgba(255,255,255,.9) !important;
  font: 950 20px/1 Arial, sans-serif !important;
}
.event-slot .game-event-popup.turn-steal .turn-steal-slot-card.stop {
  background: var(--red, #ef5a4c) !important;
  color: #fff !important;
  font: 950 16px/1 Arial, sans-serif !important;
}
.event-slot .game-event-popup.turn-steal .turn-steal-slot-card.reverse {
  background: var(--violet, #7556c9) !important;
  color: #fff !important;
  font: 950 17px/1 Arial, sans-serif !important;
}
.event-slot .game-event-popup.turn-steal .turn-steal-slot-card.swap {
  background: #159c95 !important;
  color: #fff !important;
  font: 950 16px/1 Arial, sans-serif !important;
}
.event-slot .game-event-popup.turn-steal .turn-steal-slot-card.category {
  background: #df7a32 !important;
  color: #fff !important;
  font: 950 12px/1 Arial, sans-serif !important;
}
.event-slot .game-event-popup.turn-steal .turn-steal-slot-card.combo {
  background: linear-gradient(145deg, #20b9c8, #0f98aa) !important;
  color: #fff !important;
  font: 950 7px/1 Arial, sans-serif !important;
  white-space: nowrap !important;
}
.event-slot .game-event-popup.turn-steal .turn-steal-slot-card.steal {
  background: #0c0d12 !important;
  color: #fff !important;
  border-color: #d5a92f !important;
  font: 950 15px/1 Arial, sans-serif !important;
}
`;
  await writeFile(cssPath, css, "utf8");
}

// ---------- Build-time verification ----------
const checks = [
  [await readFile("lib/game.ts", "utf8"), "turnStealCardKind?: CardKind;"],
  [await readFile("app/api/rooms/route.ts", "utf8"), "confirmedTurnStealKind = armed.kind;"],
  [await readFile("app/api/rooms/route.ts", "utf8"), 'kind: submission.turnStealCardKind ?? "letter"'],
  [await readFile(pagePath, "utf8"), "TURN STEAL event-slot v2"],
  [await readFile(pagePath, "utf8"), "const turnStealCardDescription ="],
  [await readFile(pagePath, "utf8"), 'turn-steal-slot-card ${notice.kind ?? "letter"}'],
  [await readFile(cssPath, "utf8"), cssMarker],
];
const missing = checks
  .filter(([source, token]) => !source.includes(token))
  .map(([, token]) => token);
if (missing.length)
  throw new Error(`Turn-steal card popup parity incompleto: ${missing.join(", ")}`);

console.log("Turn steal popup now keeps the exact card identity in the standard event slot; joker star is geometrically centered.");