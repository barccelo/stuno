import { readFile, writeFile } from "node:fs/promises";

async function patchFile(path, replacements) {
  let source = await readFile(path, "utf8");
  let changed = false;

  for (const { from, to, label } of replacements) {
    if (source.includes(to)) continue;
    if (!source.includes(from)) {
      throw new Error(`No se encontró el bloque esperado para: ${label}`);
    }
    source = source.replace(from, to);
    changed = true;
  }

  if (changed) await writeFile(path, source, "utf8");
}

await patchFile("lib/game.ts", [
  {
    label: "guardar el último SWAP independientemente del último evento general",
    from: '  lastDraw?: LastDraw | null;\n  drawEvents?: LastDraw[];\n  lastEvent?: {',
    to: '  lastDraw?: LastDraw | null;\n  drawEvents?: LastDraw[];\n  lastSwapEvent?: {\n    kind: "swap";\n    actorId: string;\n    actorName: string;\n    targets: { id: string; name: string; count?: number }[];\n    label?: string;\n    at: number;\n  } | null;\n  lastEvent?: {',
  },
]);

await patchFile("app/api/rooms/route.ts", [
  {
    label: "permitir X en modo Contiene",
    from: '["Ñ", "Y", "Q", "Z"].includes(card.label.toUpperCase())',
    to: '["Ñ", "Y", "Q", "Z", "X"].includes(card.label.toUpperCase())',
  },
  {
    label: "resolver SWAP cuando es la última carta",
    from: 'const whole = body.swapType !== "one";',
    to: 'const whole = body.swapType !== "one" || actor!.hand.length === 0;',
  },
  {
    label: "inicializar historial persistente de SWAP",
    from: '        drawEvents: [],\n        lastEvent: null,',
    to: '        drawEvents: [],\n        lastSwapEvent: null,\n        lastEvent: null,',
  },
  {
    label: "persistir el último SWAP para todos los dispositivos",
    from: '              label: whole ? "su mano" : "una carta",\n              at: Date.now(),\n            };\n          }\n          nextIndex(state);',
    to: '              label: whole ? "su mano" : "una carta",\n              at: Date.now(),\n            };\n            state.lastSwapEvent = {\n              kind: "swap",\n              actorId: state.lastEvent.actorId,\n              actorName: state.lastEvent.actorName,\n              targets: state.lastEvent.targets,\n              label: state.lastEvent.label,\n              at: state.lastEvent.at,\n            };\n          }\n          nextIndex(state);',
  },
]);

await patchFile("app/page.tsx", [
  {
    label: "mostrar Contiene también para X",
    from: '["Ñ", "Y", "Q", "Z"].includes(hand.find((card) => card.id === selected)?.label ?? "")',
    to: '["Ñ", "Y", "Q", "Z", "X"].includes(hand.find((card) => card.id === selected)?.label ?? "")',
  },
  {
    label: "reiniciar SWAP en intercambio de mano",
    from: 'if (card.kind === "swap") {\n      setSwapCard(card.id);',
    to: 'if (card.kind === "swap") {\n      setSwapType("whole");\n      setSwapCard(card.id);',
  },
  {
    label: "texto de cartas robadas por sanción",
    from: 'detail: `${event.actorName} te ${count === 1 ? "entregó una carta" : `entregó ${count} cartas`}.`,',
    to: 'detail: `${event.actorName} te ha hecho robar ${count} ${count === 1 ? "carta" : "cartas"}.`,',
  },
  {
    label: "evitar repetir la animación de robo con estados antiguos",
    from: '  useEffect(() => {\n    const event = myLatestDraw;\n    if (!event || event.at <= lastDrawAt.current)\n      return;\n    lastDrawAt.current = event.at;\n    setIncomingCards(Math.max(1, Math.min(3, event.count)));\n    const timer = window.setTimeout(() => setIncomingCards(0), 1200);\n    return () => window.clearTimeout(timer);\n  }, [myLatestDraw?.at, playerId]);',
    to: '  useEffect(() => {\n    const event = myLatestDraw;\n    if (!event || !room?.code || !playerId) return;\n    const storageKey = `stuno-last-draw-animation:${room.code}:${playerId}`;\n    let persistedAt = 0;\n    try {\n      persistedAt = Number(sessionStorage.getItem(storageKey) ?? 0) || 0;\n    } catch {}\n    const seenAt = Math.max(lastDrawAt.current, persistedAt);\n    if (event.at <= seenAt) {\n      lastDrawAt.current = seenAt;\n      return;\n    }\n    lastDrawAt.current = event.at;\n    try {\n      sessionStorage.setItem(storageKey, String(event.at));\n    } catch {}\n    if (Date.now() - event.at > 5000) return;\n    setIncomingCards(Math.max(1, Math.min(3, event.count)));\n    const timer = window.setTimeout(() => setIncomingCards(0), 1200);\n    return () => window.clearTimeout(timer);\n  }, [myLatestDraw?.at, playerId, room?.code]);',
  },
]);

await patchFile("app/TurnNoticeWatcher.tsx", [
  {
    label: "usar el evento SWAP persistente",
    from: '        const event = state?.lastEvent;',
    to: '        const event =\n          (state as typeof state & { lastSwapEvent?: typeof state.lastEvent }).lastSwapEvent ??\n          state?.lastEvent;',
  },
  {
    label: "deduplicar SWAP entre refrescos y remontajes",
    from: '        if (!state || event?.kind !== "swap" || !event.at) return;\n        if (event.at <= seenSwapAt.current) return;\n\n        const involved =\n          event.actorId === localPlayerId ||\n          Boolean(event.targets?.some((target) => target.id === localPlayerId));\n        if (!involved) return;\n\n        seenSwapAt.current = event.at;\n        if (Date.now() - event.at > 5500) return;',
    to: '        if (!state || event?.kind !== "swap" || !event.at) return;\n        const stateCode = (state as typeof state & { code?: string }).code ?? "room";\n        const storageKey = `stuno-last-swap-animation:${stateCode}:${localPlayerId}`;\n        let persistedAt = 0;\n        try {\n          persistedAt = Number(sessionStorage.getItem(storageKey) ?? 0) || 0;\n        } catch {}\n        const seenAt = Math.max(seenSwapAt.current, persistedAt);\n        if (event.at <= seenAt) {\n          seenSwapAt.current = seenAt;\n          return;\n        }\n\n        const involved =\n          event.actorId === localPlayerId ||\n          Boolean(event.targets?.some((target) => target.id === localPlayerId));\n        if (!involved) return;\n\n        seenSwapAt.current = event.at;\n        try {\n          sessionStorage.setItem(storageKey, String(event.at));\n        } catch {}\n        if (Date.now() - event.at > 12000) return;',
  },
  {
    label: "revisar SWAP incluso cuando la respuesta viene del cache local",
    from: '        if (cached && Date.now() - cached.at < ttl) {\n          return new Response(cached.body, {',
    to: '        if (cached && Date.now() - cached.at < ttl) {\n          if (hasRoomCode) inspectRoomBody(cached.body, localPlayerId, before);\n          return new Response(cached.body, {',
  },
  {
    label: "agrupar las cartas salientes del SWAP",
    from: '        delay: index * 22,',
    to: '        delay: index * 8,',
  },
  {
    label: "agrupar las cartas entrantes del SWAP",
    from: '        delay: index * 24,',
    to: '        delay: index * 10,',
  },
  {
    label: "mantener la capa SWAP hasta completar la ida y vuelta",
    from: '      }, mode === "whole" ? 1120 : 920);',
    to: '      }, mode === "whole" ? 1650 : 1450);',
  },
]);

await patchFile("app/ui-fixes.css", [
  {
    label: "dar una breve titilación antes de enviar la mano al centro",
    from: '.swap-motion-card.outgoing {\n  animation: swapCardOut .48s cubic-bezier(.18,.8,.22,1) var(--swap-delay) both;\n}\n.swap-motion-card.incoming {\n  opacity: 0;\n  animation: swapCardIn .52s cubic-bezier(.18,.82,.22,1) calc(430ms + var(--swap-delay)) both;\n}',
    to: '.swap-motion-card.outgoing {\n  animation: swapCardOut .64s cubic-bezier(.18,.8,.22,1) var(--swap-delay) both;\n}\n.swap-motion-card.incoming {\n  opacity: 0;\n  animation: swapCardIn .56s cubic-bezier(.18,.82,.22,1) calc(820ms + var(--swap-delay)) both;\n}',
  },
  {
    label: "animar titilación y salida conjunta hacia el centro",
    from: '@keyframes swapCardOut {\n  0% {\n    opacity: 1;\n    transform: translate(var(--swap-left),var(--swap-top)) rotate(var(--swap-rotation)) scale(1);\n  }\n  72% {\n    opacity: 1;\n    transform: translate(var(--swap-target-left),var(--swap-target-top)) rotate(var(--swap-target-rotation)) scale(.78);\n  }\n  100% {\n    opacity: 0;\n    transform: translate(var(--swap-target-left),var(--swap-target-top)) rotate(var(--swap-target-rotation)) scale(.72);\n  }\n}',
    to: '@keyframes swapCardOut {\n  0% { opacity:1; filter:brightness(1); transform:translate(var(--swap-left),var(--swap-top)) rotate(var(--swap-rotation)) scale(1); }\n  7% { opacity:.55; filter:brightness(1.16); transform:translate(var(--swap-left),var(--swap-top)) rotate(var(--swap-rotation)) scale(1); }\n  14% { opacity:1; filter:brightness(1); transform:translate(var(--swap-left),var(--swap-top)) rotate(var(--swap-rotation)) scale(1); }\n  21% { opacity:.62; filter:brightness(1.12); transform:translate(var(--swap-left),var(--swap-top)) rotate(var(--swap-rotation)) scale(1); }\n  28% { opacity:1; filter:brightness(1); transform:translate(var(--swap-left),var(--swap-top)) rotate(var(--swap-rotation)) scale(1); }\n  38% { opacity:1; transform:translate(var(--swap-left),var(--swap-top)) rotate(var(--swap-rotation)) scale(.98); }\n  88% { opacity:1; transform:translate(var(--swap-target-left),var(--swap-target-top)) rotate(var(--swap-target-rotation)) scale(.78); }\n  100% { opacity:0; transform:translate(var(--swap-target-left),var(--swap-target-top)) rotate(var(--swap-target-rotation)) scale(.72); }\n}',
  },
  {
    label: "dejar una pausa visible con la mano vacía antes del retorno",
    from: '  animation: swapMark .82s ease 260ms both;',
    to: '  animation: swapMark .92s ease 500ms both;',
  },
  {
    label: "mantener movimiento funcional de SWAP con reduced motion",
    from: '  .swap-motion-card.outgoing {\n    animation-name: swapCardOut !important;\n    animation-duration: .36s !important;\n    animation-timing-function: ease-out !important;\n    animation-delay: var(--swap-delay) !important;\n    animation-fill-mode: both !important;\n  }\n  .swap-motion-card.incoming {\n    animation-name: swapCardIn !important;\n    animation-duration: .38s !important;\n    animation-timing-function: ease-out !important;\n    animation-delay: calc(300ms + var(--swap-delay)) !important;\n    animation-fill-mode: both !important;\n  }\n  .swap-animation-mark {\n    animation-name: swapMark !important;\n    animation-duration: .58s !important;\n    animation-delay: 180ms !important;',
    to: '  .swap-motion-card.outgoing {\n    animation-name: swapCardOut !important;\n    animation-duration: .46s !important;\n    animation-timing-function: ease-out !important;\n    animation-delay: var(--swap-delay) !important;\n    animation-fill-mode: both !important;\n  }\n  .swap-motion-card.incoming {\n    animation-name: swapCardIn !important;\n    animation-duration: .44s !important;\n    animation-timing-function: ease-out !important;\n    animation-delay: calc(590ms + var(--swap-delay)) !important;\n    animation-fill-mode: both !important;\n  }\n  .swap-animation-mark {\n    animation-name: swapMark !important;\n    animation-duration: .72s !important;\n    animation-delay: 360ms !important;',
  },
]);
