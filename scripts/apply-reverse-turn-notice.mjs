import { readFile, writeFile } from "node:fs/promises";

const path = "app/TurnNoticeWatcher.tsx";
let source = await readFile(path, "utf8");

const marker = "// REVERSE repeat turn notice v1";
if (!source.includes(marker)) {
  const stateAnchor = "  state?: {\n    lastEvent?: {";
  if (!source.includes(stateAnchor))
    throw new Error("No se encontró RoomPayload.state para el aviso de INVERSA.");
  source = source.replace(
    stateAnchor,
    "  state?: {\n    turnIndex?: number;\n    lastEvent?: {",
  );

  const guardAnchor = "      if (!localPlayerId || !before) return;";
  if (source.includes(guardAnchor)) {
    source = source.replace(guardAnchor, "      if (!localPlayerId) return;");
  }

  const stateLine = "        const state = payload.state;";
  if (!source.includes(stateLine))
    throw new Error("No se encontró el estado parseado para detectar INVERSA.");
  source = source.replace(
    stateLine,
    [
      stateLine,
      "        // REVERSE repeat turn notice v1",
      "        const reverseEvent = state?.lastEvent;",
      "        if (",
      "          state &&",
      '          reverseEvent?.kind === "reverse" &&',
      "          reverseEvent.at &&",
      "          reverseEvent.actorId === localPlayerId &&",
      "          state.players?.length === 2 &&",
      "          state.players?.[state.turnIndex ?? -1]?.id === localPlayerId &&",
      "          Date.now() - reverseEvent.at < 7000",
      "        ) {",
      '          const reverseNoticeKey = `stuno-reverse-turn-notice:${localPlayerId}`;',
      "          let seenAt = 0;",
      "          try {",
      "            seenAt = Number(sessionStorage.getItem(reverseNoticeKey) ?? 0) || 0;",
      "          } catch {}",
      "          if (reverseEvent.at > seenAt) {",
      "            try {",
      "              sessionStorage.setItem(reverseNoticeKey, String(reverseEvent.at));",
      "            } catch {}",
      '            window.dispatchEvent(new CustomEvent("stuno-repeat-turn-notice"));',
      "          }",
      "        }",
    ].join("\n"),
  );

  const addListenerAnchor = '    window.addEventListener("resize", positionOverPile);';
  if (!source.includes(addListenerAnchor))
    throw new Error("No se encontró el listener resize para enlazar el aviso repetido.");
  source = source.replace(
    addListenerAnchor,
    [
      '    const repeatTurnNotice = () => show();',
      addListenerAnchor,
      '    window.addEventListener("stuno-repeat-turn-notice", repeatTurnNotice);',
    ].join("\n"),
  );

  const removeListenerAnchor = '      window.removeEventListener("resize", positionOverPile);';
  if (!source.includes(removeListenerAnchor))
    throw new Error("No se encontró la limpieza resize para el aviso repetido.");
  source = source.replace(
    removeListenerAnchor,
    [
      removeListenerAnchor,
      '      window.removeEventListener("stuno-repeat-turn-notice", repeatTurnNotice);',
    ].join("\n"),
  );

  await writeFile(path, source, "utf8");
}

console.log("Two-player REVERSE now repeats the turn notice.");
