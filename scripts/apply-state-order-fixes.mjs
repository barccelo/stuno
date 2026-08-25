import { readFile, writeFile } from "node:fs/promises";

async function patchFile(path, replacements) {
  let source = await readFile(path, "utf8");
  let changed = false;

  for (const { from, to, label, all = false } of replacements) {
    if (all) {
      if (!source.includes(from)) {
        if (source.includes(to)) continue;
        throw new Error(`No se encontró el bloque esperado para: ${label}`);
      }
      source = source.split(from).join(to);
      changed = true;
      continue;
    }
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
    label: "añadir revisión monotónica al estado",
    from: 'export type GameState = {\n  code: string;\n  hostId: string;',
    to: 'export type GameState = {\n  code: string;\n  revision?: number;\n  hostId: string;',
  },
]);

await patchFile("app/api/rooms/route.ts", [
  {
    label: "incrementar revisión en cada guardado",
    from: 'async function save(state: GameState) {\n  state.message = state.message.slice(0, 160);',
    to: 'async function save(state: GameState) {\n  state.revision = (state.revision ?? 0) + 1;\n  state.message = state.message.slice(0, 160);',
  },
  {
    label: "inicializar revisión al crear sala",
    from: '      const state: GameState = {\n        code: roomCode,\n        hostId: playerId,',
    to: '      const state: GameState = {\n        code: roomCode,\n        revision: 1,\n        hostId: playerId,',
  },
]);

await patchFile("app/page.tsx", [
  {
    label: "tipar revisión del room público",
    from: 'type Room = {\n  code: string;\n  hostId: string;',
    to: 'type Room = {\n  code: string;\n  revision?: number;\n  hostId: string;',
  },
  {
    label: "guardar la revisión más reciente en cliente",
    from: '  const [room, setRoom] = useState<Room | null>(null);\n  const [playerId, setPlayerId] = useState("");',
    to: '  const [room, setRoom] = useState<Room | null>(null);\n  const latestRoomRevision = useRef(0);\n  const [playerId, setPlayerId] = useState("");',
  },
  {
    label: "separar identidad visual del robo del estado remoto",
    from: '  const [incomingCards, setIncomingCards] = useState(0);\n  const [sortMode, setSortMode] = useState<',
    to: '  const [incomingCards, setIncomingCards] = useState(0);\n  const [incomingAnimationToken, setIncomingAnimationToken] = useState(0);\n  const incomingAnimationTimer = useRef<number | null>(null);\n  const [sortMode, setSortMode] = useState<',
  },
  {
    label: "rechazar respuestas de sala fuera de orden",
    from: '  const wheelResetting = useRef(false);\n  const title = useMemo(',
    to: '  const wheelResetting = useRef(false);\n  function applyRoom(nextRoom: Room | null) {\n    if (!nextRoom) {\n      latestRoomRevision.current = 0;\n      setRoom(null);\n      return true;\n    }\n    const revision = Number(nextRoom.revision ?? 0);\n    if (latestRoomRevision.current > 0 && revision < latestRoomRevision.current)\n      return false;\n    if (revision > latestRoomRevision.current)\n      latestRoomRevision.current = revision;\n    setRoom(nextRoom);\n    return true;\n  }\n  const title = useMemo(',
  },
  {
    label: "aplicar guardia de revisión a respuestas de sala",
    from: 'setRoom(data.state);',
    to: 'applyRoom(data.state);',
    all: true,
  },
  {
    label: "reiniciar revisión al abandonar sala",
    from: '    setRoom(null);\n    setPlayerId("");',
    to: '    applyRoom(null);\n    setPlayerId("");',
  },
  {
    label: "hacer la animación de robo inmune a rebotes del polling",
    from: '  useEffect(() => {\n    const event = myLatestDraw;\n    if (!event || !room?.code || !playerId) return;\n    const storageKey = `stuno-last-draw-animation:${room.code}:${playerId}`;\n    let persistedAt = 0;\n    try {\n      persistedAt = Number(sessionStorage.getItem(storageKey) ?? 0) || 0;\n    } catch {}\n    const seenAt = Math.max(lastDrawAt.current, persistedAt);\n    if (event.at <= seenAt) {\n      lastDrawAt.current = seenAt;\n      return;\n    }\n    lastDrawAt.current = event.at;\n    try {\n      sessionStorage.setItem(storageKey, String(event.at));\n    } catch {}\n    if (Date.now() - event.at > 5000) return;\n    setIncomingCards(Math.max(1, Math.min(3, event.count)));\n    const timer = window.setTimeout(() => setIncomingCards(0), 1200);\n    return () => window.clearTimeout(timer);\n  }, [myLatestDraw?.at, playerId, room?.code]);',
    to: '  useEffect(() => {\n    const event = myLatestDraw;\n    if (!event || !room?.code || !playerId) return;\n    const storageKey = `stuno-last-draw-animation:${room.code}:${playerId}`;\n    let persistedAt = 0;\n    try {\n      persistedAt = Number(sessionStorage.getItem(storageKey) ?? 0) || 0;\n    } catch {}\n    const seenAt = Math.max(lastDrawAt.current, persistedAt);\n    if (event.at <= seenAt) {\n      lastDrawAt.current = seenAt;\n      return;\n    }\n    lastDrawAt.current = event.at;\n    try {\n      sessionStorage.setItem(storageKey, String(event.at));\n    } catch {}\n    if (Date.now() - event.at > 5000) return;\n    setIncomingAnimationToken(event.at);\n    setIncomingCards(Math.max(1, Math.min(3, event.count)));\n    if (incomingAnimationTimer.current !== null)\n      window.clearTimeout(incomingAnimationTimer.current);\n    incomingAnimationTimer.current = window.setTimeout(() => {\n      setIncomingCards(0);\n      incomingAnimationTimer.current = null;\n    }, 1200);\n  }, [myLatestDraw?.at, playerId, room?.code]);',
  },
  {
    label: "usar token inmutable en cartas recibidas",
    from: 'key={`${myLatestDraw?.at}-${index}`}',
    to: 'key={`${incomingAnimationToken}-${index}`}',
  },
]);

await patchFile("app/TurnNoticeWatcher.tsx", [
  {
    label: "no cachear estados de partidas activas",
    from: '        const ttl = document.hidden\n          ? 12000\n          : hasRoomCode\n            ? 1700\n            : 7000;',
    to: '        const ttl = hasRoomCode\n          ? 0\n          : document.hidden\n            ? 12000\n            : 7000;',
  },
]);
