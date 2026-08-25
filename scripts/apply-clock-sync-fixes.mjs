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

await patchFile("app/api/rooms/route.ts", [
  {
    label: "incluir reloj del servidor en cada estado público",
    from: '  return {\n    ...publicRoom,\n    deck: { count: state.deck.length },',
    to: '  return {\n    ...publicRoom,\n    serverNow: Date.now(),\n    deck: { count: state.deck.length },',
  },
]);

await patchFile("app/page.tsx", [
  {
    label: "tipar hora del servidor",
    from: 'type Room = {\n  code: string;\n  revision?: number;\n  hostId: string;',
    to: 'type Room = {\n  code: string;\n  revision?: number;\n  serverNow?: number;\n  hostId: string;',
  },
  {
    label: "guardar desfase del reloj del servidor",
    from: '  const latestRoomRevision = useRef(0);\n  const [playerId, setPlayerId] = useState("");',
    to: '  const latestRoomRevision = useRef(0);\n  const serverClockOffset = useRef(0);\n  const serverClockReady = useRef(false);\n  const [playerId, setPlayerId] = useState("");',
  },
  {
    label: "calibrar reloj al aplicar estado de sala",
    from: '  function applyRoom(nextRoom: Room | null) {\n    if (!nextRoom) {\n      latestRoomRevision.current = 0;\n      setRoom(null);\n      return true;\n    }\n    const revision = Number(nextRoom.revision ?? 0);\n    if (latestRoomRevision.current > 0 && revision < latestRoomRevision.current)\n      return false;\n    if (revision > latestRoomRevision.current)\n      latestRoomRevision.current = revision;\n    setRoom(nextRoom);\n    return true;\n  }',
    to: '  function applyRoom(nextRoom: Room | null) {\n    if (!nextRoom) {\n      latestRoomRevision.current = 0;\n      serverClockOffset.current = 0;\n      serverClockReady.current = false;\n      setRoom(null);\n      return true;\n    }\n    const revision = Number(nextRoom.revision ?? 0);\n    if (latestRoomRevision.current > 0 && revision < latestRoomRevision.current)\n      return false;\n    if (revision > latestRoomRevision.current)\n      latestRoomRevision.current = revision;\n\n    const receivedAt = Date.now();\n    const serverNow = Number(nextRoom.serverNow ?? NaN);\n    if (Number.isFinite(serverNow)) {\n      const measuredOffset = serverNow - receivedAt;\n      if (!serverClockReady.current) {\n        serverClockOffset.current = measuredOffset;\n        serverClockReady.current = true;\n      } else {\n        const drift = measuredOffset - serverClockOffset.current;\n        serverClockOffset.current =\n          Math.abs(drift) > 1500\n            ? measuredOffset\n            : serverClockOffset.current + drift * 0.2;\n      }\n      setNow(receivedAt + serverClockOffset.current);\n    }\n    setRoom(nextRoom);\n    return true;\n  }',
  },
  {
    label: "separar ticker visual del polling",
    from: '  useEffect(() => {\n    if (screen !== "game" || !room?.code) return;\n    const timer = window.setInterval(async () => {\n      setNow(Date.now());\n      try {',
    to: '  useEffect(() => {\n    const tick = () => setNow(Date.now() + serverClockOffset.current);\n    tick();\n    if (screen !== "game") return;\n    const timer = window.setInterval(tick, 200);\n    return () => window.clearInterval(timer);\n  }, [screen]);\n  useEffect(() => {\n    if (screen !== "game" || !room?.code) return;\n    const timer = window.setInterval(async () => {\n      try {',
  },
  {
    label: "usar reloj sincronizado para antigüedad de animación de robo",
    from: '    if (Date.now() - event.at > 5000) return;',
    to: '    if (Date.now() + serverClockOffset.current - event.at > 5000) return;',
  },
  {
    label: "hacer al host autoridad única del timeout",
    from: '    if (\n      !room ||\n      room.pausedAt ||',
    to: '    if (\n      !room ||\n      playerId !== room.hostId ||\n      room.pausedAt ||',
  },
]);
