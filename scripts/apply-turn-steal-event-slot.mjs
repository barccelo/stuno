import { readFile, writeFile } from "node:fs/promises";

function removeCssMarker(source, marker) {
  // Older turn-steal CSS may remain from previous build patches, but the final
  // selectors below override the generic rules that can affect the shared slot.
  return source.replaceAll(marker, "");
}

const pagePath = "app/page.tsx";
let page = await readFile(pagePath, "utf8");
const marker = "TURN STEAL event-slot v2";

if (!page.includes(marker)) {
  // Remove the old floating copy by structure: marker -> following drop zone.
  for (const oldMarker of ["TURN STEAL priority notice v2", "TURN STEAL priority notice v1"]) {
    const token = `{/* ${oldMarker} */}`;
    const tokenIndex = page.indexOf(token);
    if (tokenIndex < 0) continue;

    const blockStart = page.lastIndexOf("\n", tokenIndex) + 1;
    const dropRefIndex = page.indexOf("ref={dropRef}", tokenIndex);
    if (dropRefIndex < 0)
      throw new Error(`No se encontró la zona de arrastre después de ${oldMarker}.`);
    const dropDivStart = page.lastIndexOf("<div", dropRefIndex);
    if (dropDivStart < tokenIndex)
      throw new Error(`No se pudo delimitar el aviso anterior: ${oldMarker}.`);

    page = page.slice(0, blockStart) + page.slice(dropDivStart);
  }

  // Find the actual event-slot first. Then find its lastEvent renderer without
  // assuming the duration: an earlier patch legitimately changes 2400 -> 4200.
  const eventSlotOpen = /<div\s+className="event-slot"\s+aria-live="polite"\s*>/m;
  const slotMatch = eventSlotOpen.exec(page);
  if (!slotMatch || slotMatch.index === undefined)
    throw new Error("No se encontró el contenedor event-slot estándar para Robar turno.");

  const slotBodyStart = slotMatch.index + slotMatch[0].length;
  const afterSlot = page.slice(slotBodyStart);
  const lastEventPattern = /\{room\.lastEvent\s*&&\s*now\s*-\s*room\.lastEvent\.at\s*<\s*(\d+)\s*&&\s*\(\(\)\s*=>\s*\{/m;
  const lastEventMatch = lastEventPattern.exec(afterSlot);
  if (!lastEventMatch || lastEventMatch.index === undefined) {
    const nearby = afterSlot.slice(0, 700).replace(/\s+/g, " ");
    throw new Error(`No se encontró el renderer de lastEvent dentro de event-slot. Bloque cercano: ${nearby}`);
  }

  const conditionStart = slotBodyStart + lastEventMatch.index;
  const conditionEnd = conditionStart + lastEventMatch[0].length;
  const standardEventMs = lastEventMatch[1];

  const turnStealBlock = `\n                {/* ${marker} */}\n                {room.lastTurnStealNotice &&\n                  now - room.lastTurnStealNotice.at >= 1300 &&\n                  now - room.lastTurnStealNotice.at < 3700 &&\n                  (() => {\n                    const notice = room.lastTurnStealNotice!;\n                    const title = notice.actorId === playerId\n                      ? "Robaste el turno"\n                      : notice.victimId === playerId\n                        ? "Te robaron el turno"\n                        : \`${"${notice.actorName}"} robó el turno\`;\n                    const detail = notice.actorId === playerId\n                      ? \`Te adelantaste con otra ${"${notice.label}"}.\`\n                      : notice.victimId === playerId\n                        ? \`${"${notice.actorName}"} se adelantó con otra ${"${notice.label}"}.\`\n                        : \`Se adelantó con otra ${"${notice.label}"} antes que ${"${notice.victimName}"}.\`;\n                    const symbol = notice.label.length <= 2\n                      ? notice.label\n                      : notice.label === "SWITCH"\n                        ? "↔"\n                        : notice.label === "NUEVA CATEGORÍA"\n                          ? "C"\n                          : notice.label === "BLOQUEAR TURNO"\n                            ? "⊘"\n                            : notice.label.slice(0, 2);\n                    return (\n                      <div className="game-event-popup turn-steal">\n                        <span className="game-event-symbol">\n                          <span className="turn-steal-slot-card">{symbol}</span>\n                        </span>\n                        <strong>{title}</strong>\n                        <small>{detail}</small>\n                      </div>\n                    );\n                  })()}\n`;

  // The validated Robar turno notice owns the same slot while it is visible.
  // This prevents a +1/+2/+3 or another event from rendering on top of it.
  const normalEventCondition = `{room.lastEvent &&\n                  !(room.lastTurnStealNotice &&\n                    now - room.lastTurnStealNotice.at >= 1300 &&\n                    now - room.lastTurnStealNotice.at < 3700) &&\n                  room.lastEvent.kind !== "turn-steal" &&\n                  now - room.lastEvent.at < ${standardEventMs} && (() => {`;

  page =
    page.slice(0, conditionStart) +
    turnStealBlock +
    normalEventCondition +
    page.slice(conditionEnd);

  await writeFile(pagePath, page, "utf8");
}

const cssPath = "app/ui-fixes.css";
let css = await readFile(cssPath, "utf8");
css = removeCssMarker(css, "/* Turn steal priority notice. */");
css = removeCssMarker(css, "/* Turn steal popup parity v1. */");

const cssMarker = "/* Turn steal in standard event slot v2. */";
if (!css.includes(cssMarker)) {
  css += `\n\n${cssMarker}\n/* This popup intentionally defines no position, width, height, padding or radius.\n   Those come directly from the standard event-slot/game-event-popup rules. */\n.event-slot .game-event-popup.turn-steal {\n  visibility: visible !important;\n}\n.event-slot .game-event-popup.turn-steal .game-event-symbol {\n  display: grid !important;\n  place-items: center !important;\n  overflow: hidden !important;\n  background: transparent !important;\n  box-shadow: none !important;\n}\n.event-slot .game-event-popup.turn-steal .turn-steal-slot-card {\n  width: 72% !important;\n  height: 86% !important;\n  min-width: 0 !important;\n  min-height: 0 !important;\n  margin: 0 !important;\n  padding: 0 !important;\n  box-sizing: border-box !important;\n  display: grid !important;\n  place-items: center !important;\n  position: static !important;\n  inset: auto !important;\n  transform: none !important;\n  border: 2px solid rgba(255,255,255,.88) !important;\n  border-radius: 6px !important;\n  background: linear-gradient(145deg,#2455d6,#173b9a) !important;\n  color: #fff !important;\n  box-shadow: 0 2px 5px rgba(0,0,0,.24) !important;\n  font: 700 13px/1 Georgia,serif !important;\n  text-align: center !important;\n  overflow: hidden !important;\n}\n.event-slot .game-event-popup.turn-steal > strong,\n.event-slot .game-event-popup.turn-steal > small {\n  width: 100% !important;\n  min-width: 0 !important;\n  text-align: center !important;\n}\n.event-slot .game-event-popup.turn-steal > small {\n  white-space: normal !important;\n  overflow-wrap: anywhere !important;\n}\n@media (orientation: portrait) {\n  .event-slot .game-event-popup.turn-steal .turn-steal-slot-card {\n    border-radius: 5px !important;\n    font-size: 11px !important;\n  }\n}\n@media (orientation: landscape) and (max-height:650px) {\n  .event-slot .game-event-popup.turn-steal .turn-steal-slot-card {\n    font-size: 11px !important;\n  }\n}\n`;
}
await writeFile(cssPath, css, "utf8");

const pageCheck = await readFile(pagePath, "utf8");
const cssCheck = await readFile(cssPath, "utf8");
if (
  !pageCheck.includes(marker) ||
  pageCheck.includes("turn-steal-priority-notice") ||
  !pageCheck.includes('room.lastEvent.kind !== "turn-steal"') ||
  !pageCheck.includes("now - room.lastTurnStealNotice.at < 3700") ||
  !cssCheck.includes(cssMarker) ||
  !cssCheck.includes(".event-slot .game-event-popup.turn-steal") ||
  !cssCheck.includes("visibility: visible !important;")
) {
  throw new Error("Robar turno no quedó integrado limpiamente en el event-slot estándar.");
}

console.log("Turn steal now renders inside the standard event slot with the standard popup geometry.");
