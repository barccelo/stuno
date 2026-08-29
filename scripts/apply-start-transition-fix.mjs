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
}

const exactStartMarker = "  /* Exact start-countdown handoff. */";
if (!page.includes(exactStartMarker)) {
  const timeoutEffectAnchor = [
    "  useEffect(() => {",
    "    if (",
    "      !room ||",
    "      playerId !== room.hostId ||",
    "      room.pausedAt ||",
  ].join("\n");
  if (!page.includes(timeoutEffectAnchor)) {
    throw new Error("No se encontró el efecto de timeout para insertar la transición exacta de inicio.");
  }

  const exactStartEffect = [
    exactStartMarker,
    "  useEffect(() => {",
    "    const endsAt = room?.startCountdownEndsAt;",
    "    if (screen !== \"game\" || !room?.code || !endsAt) return;",
    "    const roomCode = room.code;",
    "    let cancelled = false;",
    "    let startTimer: number | null = null;",
    "    let retryTimer: number | null = null;",
    "",
    "    const finishStart = async () => {",
    "      if (cancelled) return;",
    "      try {",
    "        const response = await fetch(",
    "          `/api/rooms?code=${encodeURIComponent(roomCode)}&playerId=${encodeURIComponent(playerId)}` ,",
    "          { cache: \"no-store\" },",
    "        );",
    "        if (response.ok) {",
    "          const data = await response.json();",
    "          applyRoom(data.state);",
    "          if (!data.state?.startCountdownEndsAt) return;",
    "        }",
    "      } catch {}",
    "      if (!cancelled)",
    "        retryTimer = window.setTimeout(() => void finishStart(), 100);",
    "    };",
    "",
    "    const serverNow = Date.now() + serverClockOffset.current;",
    "    const delay = Math.max(0, endsAt - serverNow);",
    "    startTimer = window.setTimeout(() => void finishStart(), delay);",
    "",
    "    return () => {",
    "      cancelled = true;",
    "      if (startTimer !== null) window.clearTimeout(startTimer);",
    "      if (retryTimer !== null) window.clearTimeout(retryTimer);",
    "    };",
    "  }, [screen, room?.code, room?.startCountdownEndsAt, playerId]);",
    "",
  ].join("\n");

  page = page.replace(timeoutEffectAnchor, exactStartEffect + timeoutEffectAnchor);
}

await writeFile(pagePath, page, "utf8");

const cssPath = "app/ui-fixes.css";
let css = await readFile(cssPath, "utf8");
const voteMarker = "/* Vote full-bleed viewport correction. */";
const voteCss = `${voteMarker}
/* Match the turn-intro overlay exactly: viewport edges, no card gutters. */
.vote-panel {
  position: fixed !important;
  inset: 0 !important;
  left: 0 !important;
  right: 0 !important;
  top: 0 !important;
  bottom: 0 !important;
  width: 100vw !important;
  height: 100dvh !important;
  min-width: 100vw !important;
  max-width: 100vw !important;
  min-height: 100dvh !important;
  max-height: 100dvh !important;
  margin: 0 !important;
  transform: none !important;
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  box-sizing: border-box !important;
  overflow-x: hidden !important;
}`;

if (css.includes(voteMarker)) {
  const start = css.indexOf(voteMarker);
  const nextBlock = css.indexOf("\n/*", start + voteMarker.length);
  if (nextBlock >= 0) {
    css = css.slice(0, start) + voteCss + css.slice(nextBlock);
  } else {
    css = css.slice(0, start) + voteCss + "\n";
  }
} else {
  css += `\n\n${voteCss}\n`;
}
await writeFile(cssPath, css, "utf8");

console.log("Immediate start transition and full-bleed vote overlay applied.");
