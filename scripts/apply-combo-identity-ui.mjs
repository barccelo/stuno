import { readFile, writeFile } from "node:fs/promises";

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from))
    throw new Error(`No se encontró el bloque esperado para: ${label}`);
  return source.replace(from, to);
}

let page = await readFile("app/page.tsx", "utf8");

page = replaceRequired(
  page,
  '                className="vote-letter"',
  '                className={`vote-letter ${(room.pendingVote.cardLabel ?? room.lastPlay?.label) === "COMBO" ? "combo-mini-card" : ""}`}',
  "mini carta COMBO en votación",
);

page = replaceRequired(
  page,
  '                      <span className="game-event-symbol">',
  '                      <span className={`game-event-symbol ${room.lastEvent!.kind}`}>',
  "tipo visual del símbolo de evento",
);

await writeFile("app/page.tsx", page, "utf8");

let css = await readFile("app/ui-fixes.css", "utf8");
if (!css.includes("/* Unified COMBO identity v1. */")) {
  css += `

/* Unified COMBO identity v1. */
.vote-letter.combo-mini-card {
  width: 82px !important;
  min-width: 82px !important;
  height: 72px !important;
  display: grid !important;
  place-items: center !important;
  padding: 8px !important;
  overflow: hidden !important;
  border-radius: 16px !important;
  background: linear-gradient(145deg, #20b9c8, #0f98aa) !important;
  color: #fff !important;
  -webkit-text-fill-color: #fff !important;
  font: 950 clamp(14px, 4vw, 18px)/1 Arial, sans-serif !important;
  letter-spacing: .01em !important;
  white-space: nowrap !important;
  text-align: center !important;
  box-shadow: inset 0 -2px 0 rgba(0,0,0,.10) !important;
}
.vote-word:has(.vote-letter.combo-mini-card) {
  grid-template-columns: 82px minmax(0, 1fr) auto !important;
  column-gap: 16px !important;
}
.vote-word:has(.vote-letter.combo-mini-card) h2 {
  min-width: 0 !important;
  overflow-wrap: anywhere !important;
}

.game-event-popup.combo .game-event-symbol,
.game-event-symbol.combo {
  width: 58px !important;
  min-width: 58px !important;
  height: 58px !important;
  display: grid !important;
  place-items: center !important;
  padding: 6px !important;
  overflow: hidden !important;
  border-radius: 14px !important;
  background: linear-gradient(145deg, #20b9c8, #0f98aa) !important;
  color: #fff !important;
  -webkit-text-fill-color: #fff !important;
  font: 950 clamp(11px, 3vw, 15px)/1 Arial, sans-serif !important;
  letter-spacing: .01em !important;
  white-space: nowrap !important;
  text-align: center !important;
}
.game-event-popup.combo {
  grid-template-columns: 58px minmax(0, 1fr) !important;
}
.game-event-popup.combo > strong,
.game-event-popup.combo > small {
  min-width: 0 !important;
  overflow-wrap: anywhere !important;
}

@media (max-width: 520px) {
  .vote-letter.combo-mini-card {
    width: 72px !important;
    min-width: 72px !important;
    height: 64px !important;
    border-radius: 14px !important;
    font-size: 14px !important;
  }
  .vote-word:has(.vote-letter.combo-mini-card) {
    grid-template-columns: 72px minmax(0, 1fr) auto !important;
    column-gap: 12px !important;
  }
  .game-event-popup.combo .game-event-symbol,
  .game-event-symbol.combo {
    width: 54px !important;
    min-width: 54px !important;
    height: 54px !important;
    border-radius: 13px !important;
    font-size: 12px !important;
  }
  .game-event-popup.combo {
    grid-template-columns: 54px minmax(0, 1fr) !important;
  }
}
`;
  await writeFile("app/ui-fixes.css", css, "utf8");
}
