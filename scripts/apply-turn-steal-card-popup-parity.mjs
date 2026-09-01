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

// ---------- Client: render the exact card, not the current top card ----------
const pagePath = "app/page.tsx";
let page = await readFile(pagePath, "utf8");
page = patchNoticeType(page, 'GameCard["kind"]', "Room UI");

const noticeAnchor = "                  const notice = room.lastTurnStealNotice!;\n                  const title = notice.actorId === playerId";
if (!page.includes("const turnStealCardDescription =")) {
  if (!page.includes(noticeAnchor))
    throw new Error("No se encontró el aviso prioritario de Robar turno.");
  const description = [
    "                  const notice = room.lastTurnStealNotice!;",
    "                  const turnStealCardDescription =",
    '                    notice.kind === "joker"',
    '                      ? "un comodín"',
    '                      : notice.kind === "stop"',
    '                        ? "una carta Bloquear turno"',
    '                        : notice.kind === "reverse"',
    '                          ? "una Inversa"',
    '                          : notice.kind === "swap"',
    '                            ? "un SWAP"',
    '                            : notice.kind === "category"',
    '                              ? "una Nueva categoría"',
    '                              : notice.kind === "combo"',
    '                                ? "un COMBO"',
    '                                : notice.kind === "steal"',
    '                                  ? "una carta ROBO"',
    '                                  : `otra ${notice.label}`;',
    "                  const title = notice.actorId === playerId",
  ].join("\n");
  page = page.replace(noticeAnchor, description);
}

page = replaceRequired(
  page,
  [
    "                  const detail = notice.actorId === playerId",
    '                    ? `Te adelantaste con otra ${notice.label}.`',
    "                    : notice.victimId === playerId",
    '                      ? `${notice.actorName} se adelantó con otra ${notice.label}.`',
    '                      : `Se adelantó con otra ${notice.label} antes que ${notice.victimName}.`;',
  ].join("\n"),
  [
    "                  const detail = notice.actorId === playerId",
    '                    ? `Te adelantaste con ${turnStealCardDescription}.`',
    "                    : notice.victimId === playerId",
    '                      ? `${notice.actorName} se adelantó con ${turnStealCardDescription}.`',
    '                      : `Se adelantó con ${turnStealCardDescription} antes que ${notice.victimName}.`;',
  ].join("\n"),
  "texto natural del aviso de Robar turno",
);

page = replaceRequired(
  page,
  'className={`turn-steal-event-card mini-play-card ${room.centerPile?.[room.centerPile.length - 1]?.kind ?? "letter"}`}',
  'className={`turn-steal-event-card mini-play-card ${notice.kind ?? "letter"}`}',
  "clase visual de la carta real en Robar turno",
);

page = replaceRequired(
  page,
  [
    "                          {centerCardLabel(",
    '                            room.centerPile?.[room.centerPile.length - 1]?.kind ?? "letter",',
    "                            notice.label,",
  ].join("\n"),
  [
    "                          {centerCardLabel(",
    '                            notice.kind ?? "letter",',
    "                            notice.label,",
  ].join("\n"),
  "contenido de la carta real en Robar turno",
);
await writeFile(pagePath, page, "utf8");

// ---------- Visual parity ----------
const cssPath = "app/ui-fixes.css";
let css = await readFile(cssPath, "utf8");
const cssMarker = "/* TURN STEAL real card identity v1 */";
if (!css.includes(cssMarker)) {
  css += `\n\n${cssMarker}
/* Center the joker star by geometry, not by the glyph's inline baseline. */
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

/* Robar turno shows the actual played card. These rules only guarantee the
   miniature identity; the standard popup dimensions remain unchanged. */
.game-event-popup.turn-steal.turn-steal-priority-notice .turn-steal-event-card.joker {
  background: var(--gold, #f4bd3b) !important;
  color: var(--ink, #14213d) !important;
  -webkit-text-fill-color: var(--ink, #14213d) !important;
  font-size: 20px !important;
}
.game-event-popup.turn-steal.turn-steal-priority-notice .turn-steal-event-card.stop {
  background: var(--red, #ef5a4c) !important;
  color: #fff !important;
}
.game-event-popup.turn-steal.turn-steal-priority-notice .turn-steal-event-card.reverse {
  background: var(--violet, #7556c9) !important;
  color: #fff !important;
}
.game-event-popup.turn-steal.turn-steal-priority-notice .turn-steal-event-card.swap {
  background: #159c95 !important;
  color: #fff !important;
}
.game-event-popup.turn-steal.turn-steal-priority-notice .turn-steal-event-card.category {
  background: #df7a32 !important;
  color: #fff !important;
  white-space: normal !important;
  overflow-wrap: anywhere !important;
  font-size: 6px !important;
  line-height: 1.05 !important;
}
.game-event-popup.turn-steal.turn-steal-priority-notice .turn-steal-event-card.combo {
  background: linear-gradient(145deg, #20b9c8, #0f98aa) !important;
  color: #fff !important;
  font: 950 7px/1 Arial, sans-serif !important;
  white-space: nowrap !important;
}
.game-event-popup.turn-steal.turn-steal-priority-notice .turn-steal-event-card.steal {
  background: #0c0d12 !important;
  color: #fff !important;
  border-color: #d5a92f !important;
}
`;
  await writeFile(cssPath, css, "utf8");
}

// ---------- Build-time verification ----------
const checks = [
  [await readFile("lib/game.ts", "utf8"), "turnStealCardKind?: CardKind;"],
  [await readFile("app/api/rooms/route.ts", "utf8"), "confirmedTurnStealKind = armed.kind;"],
  [await readFile("app/api/rooms/route.ts", "utf8"), 'kind: submission.turnStealCardKind ?? "letter"'],
  [await readFile(pagePath, "utf8"), "const turnStealCardDescription ="],
  [await readFile(pagePath, "utf8"), '${notice.kind ?? "letter"}'],
  [await readFile(cssPath, "utf8"), cssMarker],
];
const missing = checks
  .filter(([source, token]) => !source.includes(token))
  .map(([, token]) => token);
if (missing.length)
  throw new Error(`Turn-steal card popup parity incompleto: ${missing.join(", ")}`);

console.log("Turn steal popup now keeps the exact card identity; joker star is geometrically centered.");
