import { readFile, writeFile } from "node:fs/promises";

const pagePath = "app/page.tsx";
let page = await readFile(pagePath, "utf8");
const marker = "TURN STEAL priority notice v1";

if (!page.includes(marker)) {
  const anchor = `              <div\n                ref={dropRef}`;
  if (!page.includes(anchor))
    throw new Error("No se encontró el punto estable antes de la zona de arrastre para el aviso prioritario de Robar turno.");

  const block = `              {/* ${marker} */}\n              {room.lastEvent?.kind === "turn-steal" &&\n                now - room.lastEvent.at >= 1600 &&\n                now - room.lastEvent.at < 5600 &&\n                (() => {\n                  const copy = eventCopy(room.lastEvent!);\n                  if (!copy) return null;\n                  return (\n                    <div\n                      className="game-event-popup turn-steal turn-steal-priority-notice"\n                      aria-live="assertive"\n                    >\n                      <span className="game-event-symbol">\n                        <span\n                          className={\`turn-steal-event-card mini-play-card \${room.centerPile?.[room.centerPile.length - 1]?.kind ?? "letter"}\`}\n                        >\n                          {centerCardLabel(\n                            room.centerPile?.[room.centerPile.length - 1]?.kind ?? "letter",\n                            room.lastEvent!.label ?? "?",\n                          )}\n                        </span>\n                      </span>\n                      <strong>{copy.title}</strong>\n                      <small>{copy.detail}</small>\n                    </div>\n                  );\n                })()}\n`;

  page = page.replace(anchor, block + anchor);
  await writeFile(pagePath, page, "utf8");
}

const cssPath = "app/ui-fixes.css";
let css = await readFile(cssPath, "utf8");
const cssMarker = "/* Turn steal priority notice. */";
const cssBlock = `${cssMarker}\n/* The table event can be hidden by vote/turn-attention layers. Keep only the\n   dedicated fixed copy visible so the room always sees the steal. The popup\n   keeps the exact base dimensions of .game-event-popup. */\n.event-slot .game-event-popup.turn-steal {\n  visibility: hidden !important;\n}\n.turn-steal-priority-notice {\n  position: fixed !important;\n  left: 50% !important;\n  top: 47% !important;\n  transform: translate(-50%, -50%) !important;\n  z-index: 1250 !important;\n  pointer-events: none !important;\n  visibility: visible !important;\n}\n.turn-steal-priority-notice .game-event-symbol {\n  display: grid !important;\n  place-items: center !important;\n  align-self: center !important;\n  overflow: visible !important;\n}\n.turn-steal-priority-notice .turn-steal-event-card {\n  width: 40px !important;\n  min-width: 40px !important;\n  height: 48px !important;\n  max-height: 48px !important;\n  margin: 0 !important;\n  padding: 3px !important;\n  box-sizing: border-box !important;\n  justify-self: center !important;\n  align-self: center !important;\n  transform: none !important;\n}\n@media (max-width: 520px) {\n  .turn-steal-priority-notice {\n    top: 46% !important;\n  }\n  .turn-steal-priority-notice .turn-steal-event-card {\n    width: 38px !important;\n    min-width: 38px !important;\n    height: 46px !important;\n    max-height: 46px !important;\n  }\n}\n`;

if (css.includes(cssMarker)) {
  const start = css.indexOf(cssMarker);
  const next = css.indexOf("\n/* ", start + cssMarker.length);
  css = next >= 0
    ? css.slice(0, start) + cssBlock + css.slice(next)
    : css.slice(0, start) + cssBlock + "\n";
} else {
  css += `\n\n${cssBlock}`;
}
await writeFile(cssPath, css, "utf8");

const check = await readFile(cssPath, "utf8");
if (
  !check.includes(cssMarker) ||
  check.includes(".turn-steal-priority-notice {\n  position: fixed !important;\n  left: 50% !important;\n  top: 47% !important;\n  transform: translate(-50%, -50%) !important;\n  z-index: 1250 !important;\n  width:") ||
  !check.includes("place-items: center !important;") ||
  !check.includes("height: 48px !important;")
) {
  throw new Error("El aviso prioritario de Robar turno no ajustó correctamente la mini carta.");
}

console.log("Turn steal priority notice now keeps its mini card fully inside the standard event popup.");
