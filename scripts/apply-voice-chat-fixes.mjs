import { readFile, writeFile } from "node:fs/promises";

async function patchFile(path, replacements) {
  let source = await readFile(path, "utf8");
  let changed = false;
  for (const { from, to, label, optional = false } of replacements) {
    if (source.includes(to)) continue;
    if (!source.includes(from)) {
      if (optional) continue;
      throw new Error(`No se encontró el bloque esperado para: ${label}`);
    }
    source = source.replace(from, to);
    changed = true;
  }
  if (changed) await writeFile(path, source, "utf8");
}

await patchFile("lib/game.ts", [
  {
    label: "habilitar voz en los ajustes de sala",
    from: '    startDelaySeconds: number;\n    difficulty: "easy" | "medium" | "expert" | "mixed";',
    to: '    startDelaySeconds: number;\n    allowVoiceChat?: boolean;\n    difficulty: "easy" | "medium" | "expert" | "mixed";',
  },
]);

await patchFile("app/api/rooms/route.ts", [
  {
    label: "importar operadores para señales de voz",
    from: 'import { desc, eq } from "drizzle-orm";',
    to: 'import { and, desc, eq, gt, ne, or } from "drizzle-orm";',
  },
  {
    label: "importar tabla de señales de voz",
    from: 'import { rooms } from "../../../db/schema";',
    to: 'import { rooms, voiceSignals } from "../../../db/schema";',
  },
  {
    label: "exponer sólo señales nuevas destinadas al jugador",
    from: '  if (changed) await save(state);\n  return Response.json({ state: publicState(state, playerId) });\n}',
    to: '  if (changed) await save(state);\n  const responseState = publicState(state, playerId) as ReturnType<typeof publicState> & {\n    voiceSignals?: { id: string; from: string; to: string; type: "join" | "leave" | "offer" | "answer" | "candidate"; sdp?: string | null; at: number }[];\n  };\n  if (state.settings.allowVoiceChat && playerId && url.searchParams.get("voice") === "1") {\n    const requestedSince = Number(url.searchParams.get("voiceSince") ?? 0);\n    const voiceSince = Math.max(\n      Number.isFinite(requestedSince) ? requestedSince : 0,\n      Date.now() - 45000,\n    );\n    const recent = await getDb()\n      .select()\n      .from(voiceSignals)\n      .where(\n        and(\n          eq(voiceSignals.roomCode, roomCode),\n          gt(voiceSignals.createdAt, voiceSince),\n          ne(voiceSignals.fromPlayerId, playerId),\n          or(\n            eq(voiceSignals.toPlayerId, "*"),\n            eq(voiceSignals.toPlayerId, playerId),\n          ),\n        ),\n      )\n      .orderBy(desc(voiceSignals.createdAt))\n      .limit(120);\n    responseState.voiceSignals = recent\n      .reverse()\n      .map((signal) => ({\n        id: signal.id,\n        from: signal.fromPlayerId,\n        to: signal.toPlayerId,\n        type: signal.type as "join" | "leave" | "offer" | "answer" | "candidate",\n        sdp: signal.sdp,\n        at: signal.createdAt,\n      }));\n  }\n  return Response.json({ state: responseState });\n}',
  },
  {
    label: "guardar preferencia de voz al crear sala",
    from: '          startDelaySeconds: Math.max(\n            3,\n            Math.min(10, Number(body.startDelaySeconds) || 5),\n          ),\n          difficulty: "mixed",',
    to: '          startDelaySeconds: Math.max(\n            3,\n            Math.min(10, Number(body.startDelaySeconds) || 5),\n          ),\n          allowVoiceChat: Boolean(body.allowVoiceChat),\n          difficulty: "mixed",',
  },
]);

await patchFile("app/page.tsx", [
  {
    label: "importar chat de voz",
    from: 'import CategorySetPicker from "./CategorySetPicker";',
    to: 'import CategorySetPicker from "./CategorySetPicker";\nimport VoiceChat, { type VoiceSignal } from "./VoiceChat";',
  },
  {
    label: "tipar preferencia de voz",
    from: '    startDelaySeconds: number;\n  };',
    to: '    startDelaySeconds: number;\n    allowVoiceChat?: boolean;\n  };',
  },
  {
    label: "tipar señales de voz",
    from: '  categories: CategoryCard[];\n};',
    to: '  categories: CategoryCard[];\n  voiceSignals?: VoiceSignal[];\n};',
  },
  {
    label: "guardar opción local de voz",
    from: '  const [startDelay, setStartDelay] = useState(5);\n  const [name, setName] = useState("");',
    to: '  const [startDelay, setStartDelay] = useState(5);\n  const [allowVoiceChat, setAllowVoiceChat] = useState(false);\n  const [voiceListening, setVoiceListening] = useState(false);\n  const voiceSignalSince = useRef(0);\n  const [name, setName] = useState("");',
  },
  {
    label: "pedir sólo señales de voz nuevas",
    from: '`/api/rooms?code=${room.code}&playerId=${playerId}`,',
    to: '`/api/rooms?code=${room.code}&playerId=${playerId}&voice=${voiceListening ? "1" : "0"}&voiceSince=${voiceSignalSince.current}`,',
  },
  {
    label: "actualizar polling al entrar o salir de voz",
    from: '  }, [screen, room?.code, playerId]);',
    to: '  }, [screen, room?.code, playerId, voiceListening]);',
  },
  {
    label: "enviar opción de voz al servidor",
    from: '      turnSeconds: seconds,\n      startDelaySeconds: startDelay,\n      categories: custom,',
    to: '      turnSeconds: seconds,\n      startDelaySeconds: startDelay,\n      allowVoiceChat,\n      categories: custom,',
  },
  {
    label: "mostrar opción de voz al crear la sala",
    from: '                  <p className="hint">\n                    {playStyle === "online"\n                      ? "Cada persona escribe desde su dispositivo."\n                      : "Las respuestas se dicen en voz alta."}\n                  </p>\n                </fieldset>',
    to: '                  <p className="hint">\n                    {playStyle === "online"\n                      ? "Cada persona escribe desde su dispositivo."\n                      : "Las respuestas se dicen en voz alta."}\n                  </p>\n                  <label className="voice-option">\n                    <span>\n                      <b>Permitir chat de voz</b>\n                      <small>WebRTC directo; sólo usa relay de Cloudflare si la red lo necesita.</small>\n                    </span>\n                    <input\n                      type="checkbox"\n                      checked={allowVoiceChat}\n                      onChange={(event) => setAllowVoiceChat(event.target.checked)}\n                    />\n                  </label>\n                </fieldset>',
  },
  {
    label: "mostrar voz en el resumen",
    from: '                  <p>\n                    <span>Formato</span>\n                    <b>{playStyle === "online" ? "En línea" : "En vivo"}</b>\n                  </p>\n                  <CategorySetPicker',
    to: '                  <p>\n                    <span>Formato</span>\n                    <b>{playStyle === "online" ? "En línea" : "En vivo"}</b>\n                  </p>\n                  <p>\n                    <span>Voz</span>\n                    <b>{allowVoiceChat ? "Permitida" : "Desactivada"}</b>\n                  </p>\n                  <CategorySetPicker',
  },
  {
    label: "quitar inserción antigua de voz en espera",
    optional: true,
    from: '          </section>\n          {room.settings.allowVoiceChat && (\n            <VoiceChat\n              roomCode={room.code}\n              playerId={playerId}\n              players={room.players}\n              signals={room.voiceSignals}\n              onActiveChange={setVoiceListening}\n            />\n          )}\n          {exitDialog()}\n          {toast && <div className="toast">{toast}</div>}',
    to: '          </section>\n          {exitDialog()}\n          {toast && <div className="toast">{toast}</div>}',
  },
  {
    label: "quitar inserción antigua de voz en partida",
    optional: true,
    from: '        </header>\n        {room.settings.allowVoiceChat && (\n          <VoiceChat\n            roomCode={room.code}\n            playerId={playerId}\n            players={room.players}\n            signals={room.voiceSignals}\n            onActiveChange={setVoiceListening}\n          />\n        )}\n        <section\n          className={`turn-board ${room.players.length > 4 ? "two-rows" : "one-row"}`}',
    to: '        </header>\n        <section\n          className={`turn-board ${room.players.length > 4 ? "two-rows" : "one-row"}`}',
  },
  {
    label: "mantener voz estable desde sala de espera",
    from: '        <main className="waiting-shell">\n          <header className="game-topbar lobby-topbar">',
    to: '        <main className="waiting-shell">\n          {room.settings.allowVoiceChat && (\n            <VoiceChat\n              key={`voice-${room.code}-${playerId}`}\n              roomCode={room.code}\n              playerId={playerId}\n              players={room.players}\n              signals={room.voiceSignals}\n              onActiveChange={setVoiceListening}\n              onSignalCursorChange={(since) => { voiceSignalSince.current = since; }}\n            />\n          )}\n          <header className="game-topbar lobby-topbar">',
  },
  {
    label: "mantener voz estable durante la partida",
    from: '      <main className="game-shell" onPointerDown={dismissSelectionFromBackground}>\n        <header className="game-topbar">',
    to: '      <main className="game-shell" onPointerDown={dismissSelectionFromBackground}>\n        {room.settings.allowVoiceChat && (\n          <VoiceChat\n            key={`voice-${room.code}-${playerId}`}\n            roomCode={room.code}\n            playerId={playerId}\n            players={room.players}\n            signals={room.voiceSignals}\n            onActiveChange={setVoiceListening}\n            onSignalCursorChange={(since) => { voiceSignalSince.current = since; }}\n          />\n        )}\n        <header className="game-topbar">',
  },
]);
