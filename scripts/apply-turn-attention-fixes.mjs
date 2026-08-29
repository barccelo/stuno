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
    "  const [visible, setVisible] = useState(false);",
    [
      "  const [visible, setVisible] = useState(false);",
      "  const [noticeText, setNoticeText] = useState(\"¡Te toca!\");",
    ].join("\n"),
    "estado del texto aleatorio de turno",
  );

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
      "      const turnMessages = [",
      "        \"¡Dale, mijx!\",",
      "        \"¡Te tooca!\",",
      "        \"¡Jugáá!\",",
      "        \"¡Daaaale!\",",
      "        \"¡Vais voss!\",",
      "        \"¡Turno tuyoo!\",",
      "        \"¡Dale guaya!\",",
      "        \"¡Te toca!\",",
      "      ];",
      "      setNoticeText(turnMessages[Math.floor(Math.random() * turnMessages.length)]);",
      "      positionOverPile();",
      "      setVisible(true);",
      "      try {",
      "        const vibrate = (navigator as Navigator & {",
      "          vibrate?: (pattern: number | number[]) => boolean;",
      "        }).vibrate;",
      "        vibrate?.call(navigator, 220);",
      "      } catch {}",
      "      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);",
      "      hideTimer.current = window.setTimeout(() => {",
      "        hideTimer.current = null;",
      "        setVisible(false);",
      "        window.dispatchEvent(new CustomEvent(\"stuno-turn-ready\"));",
      "      }, 1250);",
      "    };",
    ].join("\n"),
    "vibración, duración y liberación del contador de turno",
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
      "          onPointerDown={() => {",
      "            if (hideTimer.current !== null) {",
      "              window.clearTimeout(hideTimer.current);",
      "              hideTimer.current = null;",
      "            }",
      "            setVisible(false);",
      "            window.dispatchEvent(new CustomEvent(\"stuno-turn-ready\"));",
      "          }}",
      "        >",
      "          <strong>{noticeText}</strong>",
      "        </div>",
    ].join("\n"),
    "aviso de turno a pantalla completa y clic para iniciar",
  );

  return source;
});

await patchFile("lib/game.ts", (source) =>
  replaceRequired(
    source,
    "  state.turnStartedAt = Date.now();\n  state.turnsInRound = (state.turnsInRound ?? 0) + extra;",
    "  state.turnStartedAt =\n    state.settings.mode === \"classic\" ? Date.now() + 3500 : Date.now();\n  state.turnsInRound = (state.turnsInRound ?? 0) + extra;",
    "dar margen al aviso antes de iniciar el siguiente turno",
  ),
);

await patchFile("app/api/rooms/route.ts", (source) => {
  source = replaceRequired(
    source,
    "  state.turnStartedAt = Date.now();\n  state.message = state.currentCategory",
    "  state.turnStartedAt =\n    state.settings.mode === \"classic\" && state.currentCategory\n      ? Date.now() + 3500\n      : Date.now();\n  state.message = state.currentCategory",
    "retrasar inicio del primer turno hasta después del aviso",
  );

  source = replaceRequired(
    source,
    "      if (chosenAfterSpecial && state.settings.mode === \"classic\")\n        nextIndex(state);\n      else state.turnStartedAt = Date.now();",
    "      if (chosenAfterSpecial && state.settings.mode === \"classic\")\n        nextIndex(state);\n      else\n        state.turnStartedAt =\n          state.settings.mode === \"classic\" ? Date.now() + 3500 : Date.now();",
    "retrasar contador después de elegir categoría",
  );

  source = replaceRequired(
    source,
    "    } else if (action === \"togglePause\") {",
    [
      "    } else if (action === \"readyTurn\") {",
      "      if (",
      "        state.status !== \"playing\" ||",
      "        state.pausedAt ||",
      "        state.settings.mode !== \"classic\" ||",
      "        state.players[state.turnIndex]?.id !== playerId",
      "      )",
      "        return Response.json({ state: publicState(state, playerId) });",
      "      if (state.turnStartedAt > Date.now()) state.turnStartedAt = Date.now();",
      "    } else if (action === \"togglePause\") {",
    ].join("\n"),
    "acción para iniciar el contador al cerrar el aviso",
  );

  return source;
});

await patchFile("app/page.tsx", (source) => {
  source = replaceRequired(
    source,
    [
      "  const remaining =",
      "    room?.status === \"playing\"",
      "      ? Math.max(",
      "          0,",
      "          Math.ceil(",
      "            (room.settings.turnSeconds * 1000 -",
      "              ((room.pausedAt ?? now) - room.turnStartedAt)) /",
      "              1000,",
      "          ),",
      "        )",
      "      : (room?.settings.turnSeconds ?? seconds);",
    ].join("\n"),
    [
      "  const remaining =",
      "    room?.status === \"playing\"",
      "      ? Math.min(",
      "          room.settings.turnSeconds,",
      "          Math.max(",
      "            0,",
      "            Math.ceil(",
      "              (room.settings.turnSeconds * 1000 -",
      "                ((room.pausedAt ?? now) - room.turnStartedAt)) /",
      "                1000,",
      "            ),",
      "          ),",
      "        )",
      "      : (room?.settings.turnSeconds ?? seconds);",
    ].join("\n"),
    "mantener el contador lleno mientras está visible el aviso",
  );

  source = replaceRequired(
    source,
    [
      "  useEffect(() => {",
      "    if (room?.pendingLive && now >= room.pendingLive.expiresAt)",
      "      void act(\"finalizeLive\");",
      "  }, [now, room?.pendingLive?.expiresAt]);",
    ].join("\n"),
    [
      "  useEffect(() => {",
      "    const ready = () => {",
      "      const currentTurnId = room?.players[room.turnIndex]?.id;",
      "      if (",
      "        room?.status !== \"playing\" ||",
      "        room.pausedAt ||",
      "        room.settings.mode !== \"classic\" ||",
      "        currentTurnId !== playerId",
      "      )",
      "        return;",
      "      void act(\"readyTurn\");",
      "    };",
      "    window.addEventListener(\"stuno-turn-ready\", ready);",
      "    return () => window.removeEventListener(\"stuno-turn-ready\", ready);",
      "  }, [",
      "    room?.status,",
      "    room?.pausedAt,",
      "    room?.settings.mode,",
      "    room?.turnIndex,",
      "    room?.turnStartedAt,",
      "    playerId,",
      "  ]);",
      "  useEffect(() => {",
      "    if (room?.pendingLive && now >= room.pendingLive.expiresAt)",
      "      void act(\"finalizeLive\");",
      "  }, [now, room?.pendingLive?.expiresAt]);",
    ].join("\n"),
    "iniciar turno al cerrar el aviso",
  );

  source = replaceRequired(
    source,
    [
      "      const currentTurnId = room.players[room.turnIndex]?.id ?? \"\";",
      "      return currentTurnId === playerId ? 2600 : 1900;",
    ].join("\n"),
    [
      "      const currentTurnId = room.players[room.turnIndex]?.id ?? \"\";",
      "      const playerCount = room.players.length;",
      "      const nextTurnIndex = playerCount",
      "        ? (room.turnIndex + room.direction + playerCount) % playerCount",
      "        : -1;",
      "      const nextTurnId = nextTurnIndex >= 0 ? room.players[nextTurnIndex]?.id ?? \"\" : \"\";",
      "      if (nextTurnId === playerId) return 900;",
      "      return currentTurnId === playerId ? 2600 : 1400;",
    ].join("\n"),
    "acelerar polling del próximo jugador",
  );

  source = replaceRequired(
    source,
    "    room?.turnIndex,\n    room?.settings.mode,",
    "    room?.turnIndex,\n    room?.direction,\n    room?.settings.mode,",
    "actualizar polling al cambiar dirección",
  );

  return source;
});

await patchFile("app/VoteTimerWatcher.tsx", (source) => {
  source = replaceRequired(
    source,
    "  useEffect(() => {\n    const renderTimer = () => {",
    [
      "  useEffect(() => {",
      "    let voteBuzzTimer: number | null = null;",
      "    let voteBuzzing = false;",
      "",
      "    const buzzOnce = () => {",
      "      try {",
      "        const vibrate = (navigator as Navigator & {",
      "          vibrate?: (pattern: number | number[]) => boolean;",
      "        }).vibrate;",
      "        vibrate?.call(navigator, [105, 75, 105]);",
      "      } catch {}",
      "    };",
      "",
      "    const stopVoteBuzz = () => {",
      "      if (voteBuzzTimer !== null) {",
      "        window.clearInterval(voteBuzzTimer);",
      "        voteBuzzTimer = null;",
      "      }",
      "      if (!voteBuzzing) return;",
      "      voteBuzzing = false;",
      "      try {",
      "        const vibrate = (navigator as Navigator & {",
      "          vibrate?: (pattern: number | number[]) => boolean;",
      "        }).vibrate;",
      "        vibrate?.call(navigator, 0);",
      "      } catch {}",
      "    };",
      "",
      "    const syncVoteBuzz = (shouldBuzz: boolean) => {",
      "      if (!shouldBuzz) {",
      "        stopVoteBuzz();",
      "        return;",
      "      }",
      "      if (voteBuzzing) return;",
      "      voteBuzzing = true;",
      "      buzzOnce();",
      "      voteBuzzTimer = window.setInterval(buzzOnce, 620);",
      "    };",
      "",
      "    const onVotePointerDown = (event: PointerEvent) => {",
      "      const target = event.target;",
      "      if (!(target instanceof Element)) return;",
      "      if (target.closest(\".vote-panel button\")) stopVoteBuzz();",
      "    };",
      "",
      "    const renderTimer = () => {",
    ].join("\n"),
    "preparar patrón háptico repetido para votación",
  );

  source = replaceRequired(
    source,
    [
      "      if (!panel) {",
      "        existing?.remove();",
      "        fallbackKey.current = \"\";",
      "        fallbackExpiresAt.current = 0;",
      "        return;",
      "      }",
    ].join("\n"),
    [
      "      if (!panel) {",
      "        existing?.remove();",
      "        fallbackKey.current = \"\";",
      "        fallbackExpiresAt.current = 0;",
      "        stopVoteBuzz();",
      "        return;",
      "      }",
      "",
      "      const awaitingLocalVote = Boolean(",
      "        panel.querySelector(\"button.reject, button.approve\"),",
      "      );",
      "      panel.classList.toggle(\"vote-awaiting-local\", awaitingLocalVote);",
      "      syncVoteBuzz(awaitingLocalVote);",
    ].join("\n"),
    "vibrar sólo mientras el jugador todavía debe votar",
  );

  source = replaceRequired(
    source,
    [
      "    renderTimer();",
      "    const timer = window.setInterval(renderTimer, 250);",
      "    return () => {",
      "      window.clearInterval(timer);",
      "      document.querySelector(\".vote-countdown-watcher\")?.remove();",
      "    };",
    ].join("\n"),
    [
      "    document.addEventListener(\"pointerdown\", onVotePointerDown, true);",
      "    renderTimer();",
      "    const timer = window.setInterval(renderTimer, 250);",
      "    return () => {",
      "      window.clearInterval(timer);",
      "      document.removeEventListener(\"pointerdown\", onVotePointerDown, true);",
      "      stopVoteBuzz();",
      "      document.querySelector(\".vote-countdown-watcher\")?.remove();",
      "    };",
    ].join("\n"),
    "detener vibración inmediatamente al votar",
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

await patchFile("app/ui-fixes.css", (source) => {
  const marker = "/* Full-screen vote attention feedback. */";
  if (source.includes(marker)) return source;

  return (
    source +
    `

${marker}
.vote-panel {
  position: fixed !important;
  inset: 0 !important;
  left: 0 !important;
  top: 0 !important;
  z-index: 2350 !important;
  width: 100vw !important;
  height: 100dvh !important;
  max-width: none !important;
  min-height: 100dvh !important;
  transform: none !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: #fff !important;
  color: var(--ink, #14213d) !important;
  padding: max(28px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(28px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left)) !important;
  box-shadow: none !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  overflow-y: auto !important;
}
.vote-panel > p,
.vote-panel > .vote-panel-heading,
.vote-panel > .vote-word,
.vote-panel > div,
.vote-panel > small {
  width: min(520px, calc(100vw - 40px)) !important;
  max-width: 520px !important;
}
.vote-panel > p {
  margin-top: 0 !important;
  font-size: 13px !important;
  font-weight: 800 !important;
  letter-spacing: .02em;
}
.vote-panel .vote-word {
  margin-top: 8px !important;
  margin-bottom: 24px !important;
}
.vote-panel > div:last-of-type button,
.vote-panel button.reject,
.vote-panel button.approve {
  min-height: 56px !important;
  font-size: 15px !important;
}
.vote-panel.vote-awaiting-local::before {
  content: "VOTA";
  display: block;
  margin-bottom: 14px;
  color: var(--red, #ef5a4c);
  font-size: 11px;
  line-height: 1;
  font-weight: 950;
  letter-spacing: .24em;
}
@media (max-height: 520px) {
  .vote-panel {
    justify-content: flex-start !important;
    padding-top: max(18px, env(safe-area-inset-top)) !important;
    padding-bottom: max(18px, env(safe-area-inset-bottom)) !important;
  }
  .vote-panel.vote-awaiting-local::before {
    margin-bottom: 8px;
  }
  .vote-panel .vote-word {
    margin-bottom: 12px !important;
  }
}
`
  );
});

console.log("Turn and vote attention feedback applied.");
