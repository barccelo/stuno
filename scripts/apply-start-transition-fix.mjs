import { readFile, writeFile } from "node:fs/promises";

const pagePath = "app/page.tsx";
let page = await readFile(pagePath, "utf8");

const originalPolling = [
  "      if (room.pausedAt) return 3200;",
  "      if (",
  "        room.pendingVote ||",
  "        room.pendingLive ||",
  "        room.pendingPenalty ||",
  "        room.categoryOptions ||",
  "        room.startCountdownEndsAt",
  "      )",
  "        return 900;",
].join("\n");

const previousFastPolling = [
  "      if (room.pausedAt) return 3200;",
  "      if (room.startCountdownEndsAt) return 250;",
  "      if (",
  "        room.pendingVote ||",
  "        room.pendingLive ||",
  "        room.pendingPenalty ||",
  "        room.categoryOptions",
  "      )",
  "        return 900;",
].join("\n");

const desiredPolling = [
  "      // The preparation countdown is technically paused on the server.",
  "      // Check it before the generic pause branch so zero transitions immediately.",
  "      if (room.startCountdownEndsAt) return 200;",
  "      if (room.pausedAt) return 3200;",
  "      if (",
  "        room.pendingVote ||",
  "        room.pendingLive ||",
  "        room.pendingPenalty ||",
  "        room.categoryOptions",
  "      )",
  "        return 900;",
].join("\n");

if (!page.includes(desiredPolling)) {
  if (page.includes(originalPolling)) {
    page = page.replace(originalPolling, desiredPolling);
  } else if (page.includes(previousFastPolling)) {
    page = page.replace(previousFastPolling, desiredPolling);
  } else {
    throw new Error("No se encontró el polling del conteo inicial para eliminar la espera.");
  }
  await writeFile(pagePath, page, "utf8");
}

const cssPath = "app/ui-fixes.css";
let css = await readFile(cssPath, "utf8");
const voteMarker = "/* Vote full-bleed viewport correction. */";
if (!css.includes(voteMarker)) {
  css += `

${voteMarker}
/* Match the turn-intro overlay exactly: viewport edges, no card gutters. */
.vote-panel {
  position: fixed !important;
  inset: 0 !important;
  left: 0 !important;
  right: 0 !important;
  top: 0 !important;
  bottom: 0 !important;
  width: auto !important;
  height: auto !important;
  min-width: 0 !important;
  max-width: none !important;
  min-height: 0 !important;
  max-height: none !important;
  margin: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  box-sizing: border-box !important;
  overflow-x: hidden !important;
}
`;
  await writeFile(cssPath, css, "utf8");
}

console.log("Immediate start transition and full-bleed vote overlay applied.");
