import { readFile, writeFile } from "node:fs/promises";

function removeCssBlock(source, marker) {
  let nextSource = source;
  while (nextSource.includes(marker)) {
    const start = nextSource.indexOf(marker);
    const next = nextSource.indexOf("\n/* ", start + marker.length);
    if (next < 0) return nextSource.slice(0, start).trimEnd() + "\n";
    nextSource = nextSource.slice(0, start) + nextSource.slice(next);
  }
  return nextSource;
}

const pagePath = "app/page.tsx";
let page = await readFile(pagePath, "utf8");
const marker = "TURN STEAL event-slot v1";

if (!page.includes(marker)) {
  // Remove the separate fixed copy added by the earlier compatibility patch.
  for (const oldMarker of ["TURN STEAL priority notice v2", "TURN STEAL priority notice v1"]) {
    const markerStart = page.indexOf(`              {/* ${oldMarker} */}`);
    if (markerStart < 0) continue;
    const dropAnchor = `              <div\n                ref={dropRef}`;
    const markerEnd = page.indexOf(dropAnchor, markerStart);
    if (markerEnd < 0)
      throw new Error(`No se encontró el final del aviso anterior: ${oldMarker}`);
    page = page.slice(0, markerStart) + page.slice(markerEnd);
  }

  const eventSlotAnchor = `              <div className="event-slot" aria-live="polite">`;
  const lastEventAnchor = `                {room.lastEvent && now - room.lastEvent.at < 2400 && (() => {`;
  if (!page.includes(eventSlotAnchor) || !page.includes(lastEventAnchor))
    throw new Error("No se encontró el event-slot estándar para Robar turno.");

  const turnStealBlock = `                {/* ${marker} */}\n                {room.lastTurnStealNotice &&\n                  now - room.lastTurnStealNotice.at >= 1300 &&\n                  now - room.lastTurnStealNotice.at < 3700 &&\n                  (() => {\n                    const notice = room.lastTurnStealNotice!;\n                    const title = notice.actorId === playerId\n                      ? "Robaste el turno"\n                      : notice.victimId === playerId\n                        ? "Te robaron el turno"\n                        : \`${"${notice.actorName}"} robó el turno\`;\n                    const detail = notice.actorId === playerId\n                      ? \`Te adelantaste con otra ${"${notice.label}"}.\`\n                      : notice.victimId === playerId\n                        ? \`${"${notice.actorName}"} se adelantó con otra ${"${notice.label}"}.\`\n                        : \`Se adelantó con otra ${"${notice.label}"} antes que ${"${notice.victimName}"}.\`;\n                    const symbol = notice.label.length <= 2\n                      ? notice.label\n                      : notice.label === "SWITCH"\n                        ? "↔"\n                        : notice.label === "NUEVA CATEGORÍA"\n                          ? "C"\n                          : notice.label === "BLOQUEAR TURNO"\n                            ? "⊘"\n                            : notice.label.slice(0, 2);\n                    return (\n                      <div className="game-event-popup turn-steal">\n                        <span className="game-event-symbol">\n                          <span className="turn-steal-slot-card">{symbol}</span>\n                        </span>\n                        <strong>{title}</strong>\n                        <small>{detail}</small>\n                      </div>\n                    );\n                  })()}\n`;

  const normalEventGuard = `                {(!room.lastTurnStealNotice ||\n                  now - room.lastTurnStealNotice.at < 1300 ||\n                  now - room.lastTurnStealNotice.at >= 3700) &&\n                  room.lastEvent &&\n                  room.lastEvent.kind !== "turn-steal" &&\n                  now - room.lastEvent.at < 2400 &&\n                  (() => {`;

  page = page.replace(lastEventAnchor, turnStealBlock + normalEventGuard);
  await writeFile(pagePath, page, "utf8");
}

const cssPath = "app/ui-fixes.css";
let css = await readFile(cssPath, "utf8");
css = removeCssBlock(css, "/* Turn steal priority notice. */");
css = removeCssBlock(css, "/* Turn steal popup parity v1. */");

const cssMarker = "/* Turn steal in standard event slot v1. */";
if (!css.includes(cssMarker)) {
  css += `\n\n${cssMarker}\n/* Robar turno is now the same popup, in the same event-slot, as every other\n   table event. Only its symbol and centered copy are event-specific. */\n.event-slot .game-event-popup.turn-steal {\n  visibility: visible !important;\n}\n.event-slot .game-event-popup.turn-steal .game-event-symbol {\n  display: grid !important;\n  place-items: center !important;\n  overflow: hidden !important;\n  background: transparent !important;\n  box-shadow: none !important;\n}\n.event-slot .game-event-popup.turn-steal .turn-steal-slot-card {\n  width: 72%;\n  height: 86%;\n  margin: 0;\n  box-sizing: border-box;\n  display: grid;\n  place-items: center;\n  border: 2px solid rgba(255,255,255,.88);\n  border-radius: 6px;\n  background: linear-gradient(145deg,#2455d6,#173b9a);\n  color: #fff;\n  box-shadow: 0 2px 5px rgba(0,0,0,.24);\n  font: 700 13px/1 Georgia,serif;\n  text-align: center;\n  overflow: hidden;\n}\n.event-slot .game-event-popup.turn-steal > strong,\n.event-slot .game-event-popup.turn-steal > small {\n  width: 100%;\n  min-width: 0;\n  text-align: center !important;\n}\n.event-slot .game-event-popup.turn-steal > small {\n  white-space: normal;\n  overflow-wrap: anywhere;\n}\n@media (orientation: portrait) {\n  .event-slot .game-event-popup.turn-steal .turn-steal-slot-card {\n    border-radius: 5px;\n    font-size: 11px;\n  }\n}\n@media (orientation: landscape) and (max-height:650px) {\n  .event-slot .game-event-popup.turn-steal .turn-steal-slot-card {\n    font-size: 11px;\n  }\n}\n`;
}
await writeFile(cssPath, css, "utf8");

const pageCheck = await readFile(pagePath, "utf8");
const cssCheck = await readFile(cssPath, "utf8");
if (
  !pageCheck.includes(marker) ||
  pageCheck.includes("turn-steal-priority-notice") ||
  !pageCheck.includes('room.lastEvent.kind !== "turn-steal"') ||
  !pageCheck.includes("now - room.lastTurnStealNotice.at >= 3700") ||
  !cssCheck.includes(cssMarker) ||
  cssCheck.includes("/* Turn steal priority notice. */") ||
  cssCheck.includes("/* Turn steal popup parity v1. */")
) {
  throw new Error("Robar turno no quedó integrado limpiamente en el event-slot estándar.");
}

console.log("Turn steal now renders inside the standard event slot with the standard popup geometry.");
