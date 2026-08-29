import { readFile, writeFile } from "node:fs/promises";

async function patchFile(path, transform) {
  const before = await readFile(path, "utf8");
  const after = transform(before);
  if (after !== before) await writeFile(path, after, "utf8");
}

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) {
    throw new Error(`No se encontró el bloque esperado para: ${label}`);
  }
  return source.replace(from, to);
}

await patchFile("app/TurnNoticeWatcher.tsx", (source) => {
  source = replaceRequired(
    source,
    [
      "    const show = () => {",
      "      positionOverPile();",
      "      setVisible(true);",
      "      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);",
      "      hideTimer.current = window.setTimeout(() => setVisible(false), 1550);",
      "    };",
    ].join("\n"),
    [
      "    const show = () => {",
      "      positionOverPile();",
      "      setVisible(true);",
      "      try {",
      "        const vibrate = (navigator as Navigator & {",
      "          vibrate?: (pattern: number | number[]) => boolean;",
      "        }).vibrate;",
      "        vibrate?.call(navigator, 110);",
      "      } catch {}",
      "      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);",
      "      hideTimer.current = window.setTimeout(() => setVisible(false), 1250);",
      "    };",
    ].join("\n"),
    "vibración y duración del aviso de turno",
  );

  source = replaceRequired(
    source,
    [
      "        <div",
      "          className=\"turn-notice-fallback\"",
      "          role=\"status\"",
      "          aria-live=\"assertive\"",
      "          style={{ left: position.x, top: position.y }}",
      "        >",
      "          <strong>¡Te toca!</strong>",
      "        </div>",
    ].join("\n"),
    [
      "        <div",
      "          className=\"turn-notice-fallback turn-attention-overlay\"",
      "          role=\"alert\"",
      "          aria-live=\"assertive\"",
      "          onPointerDown={() => setVisible(false)}",
      "        >",
      "          <strong>¡Te toca!</strong>",
      "        </div>",
    ].join("\n"),
    "aviso de turno a pantalla completa",
  );

  return source;
});

await patchFile("app/ui-fixes.css", (source) => {
  const marker = "/* Full-screen turn attention feedback. */";
  if (source.includes(marker)) return source;

  const css = `

${marker}
.turn-notice-fallback.turn-attention-overlay {
  position: fixed !important;
  inset: 0 !important;
  z-index: 2400 !important;
  display: grid !important;
  place-items: center !important;
  width: auto !important;
  height: auto !important;
  min-width: 0 !important;
  max-width: none !important;
  transform: none !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: #fff !important;
  color: var(--ink, #14213d) !important;
  padding: max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left)) !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  cursor: pointer;
  touch-action: manipulation;
}
.turn-notice-fallback.turn-attention-overlay::before {
  display: none !important;
}
.turn-notice-fallback.turn-attention-overlay strong {
  margin: 0 !important;
  font-family: Arial, Helvetica, sans-serif;
  font-size: clamp(52px, 12vw, 104px) !important;
  line-height: .95 !important;
  font-weight: 950 !important;
  letter-spacing: -.055em !important;
  text-align: center;
}

/* The active player is emphasized with a strong pulsing border for the whole turn. */
.turn-board-player.active {
  animation: currentTurnBorderPulse .82s ease-in-out infinite !important;
  will-change: box-shadow, border-color, filter;
}
.turn-board-player.active > span {
  opacity: 1 !important;
  filter: none !important;
  animation: none !important;
}
@keyframes currentTurnBorderPulse {
  0%, 100% {
    border-color: rgba(244, 189, 59, .62);
    box-shadow:
      0 0 0 1px rgba(244, 189, 59, .2),
      0 0 7px rgba(244, 189, 59, .18),
      inset 0 0 0 1px rgba(255,255,255,.04);
    filter: brightness(1);
  }
  50% {
    border-color: #ffd45e;
    box-shadow:
      0 0 0 3px rgba(255, 212, 94, .7),
      0 0 19px rgba(255, 199, 61, .72),
      inset 0 0 12px rgba(255, 211, 92, .16);
    filter: brightness(1.16);
  }
}
@keyframes turnAttentionOverlay {
  0% { opacity: 0; }
  10%, 82% { opacity: 1; }
  100% { opacity: 0; }
}
@media (prefers-reduced-motion: no-preference) {
  .turn-notice-fallback.turn-attention-overlay {
    animation: turnAttentionOverlay 1.25s ease both !important;
  }
}
@media (prefers-reduced-motion: reduce) {
  .turn-notice-fallback.turn-attention-overlay {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
  .turn-board-player.active {
    animation: none !important;
    border-color: #ffd45e !important;
    box-shadow:
      0 0 0 3px rgba(255, 212, 94, .72),
      0 0 15px rgba(255, 199, 61, .58) !important;
    filter: brightness(1.1);
  }
  .turn-board-player.active > span {
    animation: none !important;
    opacity: 1 !important;
    text-decoration: none;
  }
}
`;

  return source + css;
});

console.log("Turn attention feedback applied.");
