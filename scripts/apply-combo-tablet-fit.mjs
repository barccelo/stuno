import { readFile, writeFile } from "node:fs/promises";

const cssPath = "app/ui-fixes.css";
let css = await readFile(cssPath, "utf8");

const marker = "/* COMBO responsive label fit v1. */";
if (!css.includes(marker)) {
  css += `

${marker}
/* COMBO used viewport-sized typography, so tablet viewports enlarged the word
   while the physical card stayed roughly the same width. Cap the label by the
   card footprint instead of the viewport so it remains fully inside every card. */
.play-card.action.combo > strong {
  max-width: 100% !important;
  box-sizing: border-box !important;
  padding: 8px !important;
  font: 950 clamp(18px, 2.8vw, 22px)/1 Arial, sans-serif !important;
  letter-spacing: 0 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-align: center !important;
}

/* Compact copies in the center pile / mini-card surfaces need a separate cap. */
.center-pile-card.combo,
.mini-play-card.combo {
  max-width: 100% !important;
  box-sizing: border-box !important;
  padding: 3px !important;
  font: 950 9px/1 Arial, sans-serif !important;
  letter-spacing: 0 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-align: center !important;
}

/* Keep the temporary moving/dragged COMBO card consistent as well. */
.card-flight.combo > strong,
.drag-ghost.cyan > strong {
  max-width: 100% !important;
  box-sizing: border-box !important;
  padding-inline: 4px !important;
  font: 950 clamp(14px, 2.2vw, 18px)/1 Arial, sans-serif !important;
  letter-spacing: 0 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-align: center !important;
}
`;
  await writeFile(cssPath, css, "utf8");
}

console.log("COMBO responsive label fit applied for hand, pile and motion cards.");
