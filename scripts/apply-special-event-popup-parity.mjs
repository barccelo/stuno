import { readFile, writeFile } from "node:fs/promises";

function insertBeforeRequired(source, anchor, addition, marker, label) {
  if (source.includes(marker)) return source;
  if (!source.includes(anchor))
    throw new Error(`No se encontró el punto esperado para: ${label}`);
  return source.replace(anchor, addition + anchor);
}

function ensureLastEventKind(source, kind, label) {
  const pattern = /(lastEvent\?:\s*\{[\s\S]*?kind:\s*)([^;]+)(;)/m;
  const match = source.match(pattern);
  if (!match)
    throw new Error(`No se encontró el tipo lastEvent para: ${label}`);
  if (match[2].includes(`"${kind}"`)) return source;
  return source.replace(
    pattern,
    match[1] + match[2].trim() + ` | "${kind}"` + match[3],
  );
}

function insertJokerAcceptedEvent(source) {
  const marker = "// Joker accepted: publish the same event popup as the other special cards.";
  if (source.includes(marker)) return source;

  const start = source.indexOf("function applyAccepted(state: GameState, submission: Submission) {");
  const end = source.indexOf("function beginSimultaneousReview", start);
  if (start < 0 || end < 0)
    throw new Error("No se pudo aislar applyAccepted para instalar el evento de comodín.");

  let block = source.slice(start, end);
  const anchor = "  state.acceptedWords.push(normalized(submission.answer));";
  // COMBO también registra acceptedWords dentro de su rama especial. Usamos la
  // última aparición dentro de applyAccepted, que corresponde al flujo normal
  // de letras/comodín y no depende de lo que hayan insertado parches anteriores.
  const anchorIndex = block.lastIndexOf(anchor);
  if (anchorIndex < 0)
    throw new Error("No se encontró el registro de palabra aceptada del flujo normal.");

  const addition = [
    anchor,
    `  ${marker}`,
    '  if (card.kind === "joker") {',
    '    state.lastEvent = {',
    '      kind: "joker",',
    '      actorId: owner.id,',
    '      actorName: owner.name,',
    '      targets: [],',
    '      label: submission.answer,',
    '      global: true,',
    '      at: Date.now(),',
    '    };',
    '  }',
  ].join("\n");

  block =
    block.slice(0, anchorIndex) +
    addition +
    block.slice(anchorIndex + anchor.length);
  return source.slice(0, start) + block + source.slice(end);
}

function insertJokerSymbol(source) {
  if (source.includes('room.lastEvent!.kind === "joker"')) return source;

  const popupStart = source.indexOf('<div className={`game-event-popup ${room.lastEvent!.kind}`}>');
  if (popupStart < 0)
    throw new Error("No se encontró el popup estándar de eventos para el símbolo del comodín.");
  const symbolEnd = source.indexOf("                      </span>", popupStart);
  if (symbolEnd < 0)
    throw new Error("No se pudo aislar el símbolo del popup estándar.");

  let block = source.slice(popupStart, symbolEnd);
  const defaultAnchor = [
    '                        ) : (',
    '                          "C"',
    '                        )}',
  ].join("\n");
  const anchorIndex = block.lastIndexOf(defaultAnchor);
  if (anchorIndex < 0)
    throw new Error("No se encontró el símbolo por defecto del popup estándar.");

  const replacement = [
    '                        ) : room.lastEvent!.kind === "joker" ? (',
    '                          "★"',
    '                        ) : (',
    '                          "C"',
    '                        )}',
  ].join("\n");
  block =
    block.slice(0, anchorIndex) +
    replacement +
    block.slice(anchorIndex + defaultAnchor.length);
  return source.slice(0, popupStart) + block + source.slice(symbolEnd);
}

let game = await readFile("lib/game.ts", "utf8");
game = ensureLastEventKind(game, "joker", "tipo de evento de comodín en GameState");
await writeFile("lib/game.ts", game, "utf8");

let route = await readFile("app/api/rooms/route.ts", "utf8");
route = insertJokerAcceptedEvent(route);
await writeFile("app/api/rooms/route.ts", route, "utf8");

let page = await readFile("app/page.tsx", "utf8");
page = ensureLastEventKind(page, "joker", "tipo de evento de comodín en la UI");

page = insertBeforeRequired(
  page,
  '    if (event.kind === "steal")',
  [
    '    if (event.kind === "joker")',
    '      return {',
    '        title: "Comodín",',
    '        detail: event.actorName + " jugó “" + (event.label ?? "") + "” con un comodín.",',
    '      };',
    '',
  ].join("\n"),
  'if (event.kind === "joker")',
  "texto del popup de comodín",
);

page = insertJokerSymbol(page);
await writeFile("app/page.tsx", page, "utf8");

let css = await readFile("app/ui-fixes.css", "utf8");
if (!css.includes("/* Special-card event popup parity v1. */")) {
  css += `

/* Special-card event popup parity v1. */
/* COMBO keeps its cyan identity, but uses exactly the same popup footprint as
   the rest of the special cards. */
.game-event-popup.combo {
  grid-template-columns: 44px minmax(0, 1fr) !important;
}
.game-event-popup.combo .game-event-symbol,
.game-event-symbol.combo {
  width: 42px !important;
  min-width: 42px !important;
  height: 42px !important;
  padding: 0 !important;
  border-radius: 11px !important;
  font: 950 9px/1 Arial, sans-serif !important;
  letter-spacing: 0 !important;
}

/* The joker now uses the standard event card as well. */
.game-event-popup.joker .game-event-symbol,
.game-event-symbol.joker {
  background: var(--gold, #f4bd3b) !important;
  color: var(--ink, #14213d) !important;
  -webkit-text-fill-color: var(--ink, #14213d) !important;
}

@media (orientation: portrait) {
  .event-slot .game-event-popup.combo {
    grid-template-columns: 36px minmax(0, 1fr) !important;
  }
  .event-slot .game-event-popup.combo .game-event-symbol,
  .event-slot .game-event-symbol.combo {
    width: 34px !important;
    min-width: 34px !important;
    height: 34px !important;
    border-radius: 9px !important;
    font-size: 7px !important;
  }
}

@media (orientation: landscape) and (max-height: 650px) {
  .event-slot .game-event-popup.combo {
    grid-template-columns: 40px minmax(0, 1fr) !important;
  }
  .event-slot .game-event-popup.combo .game-event-symbol,
  .event-slot .game-event-symbol.combo {
    width: 38px !important;
    min-width: 38px !important;
    height: 38px !important;
    border-radius: 10px !important;
    font-size: 8px !important;
  }
}
`;
  await writeFile("app/ui-fixes.css", css, "utf8");
}

console.log("Special-card popup parity applied: COMBO standardized and joker event enabled.");
