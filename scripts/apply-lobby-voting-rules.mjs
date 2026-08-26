import { readFile, writeFile } from "node:fs/promises";

async function patchFile(path, replacements) {
  let source = await readFile(path, "utf8");
  let changed = false;
  for (const { from, to, label, all = false } of replacements) {
    if (source.includes(to)) continue;
    if (!source.includes(from)) {
      throw new Error(`No se encontró el bloque esperado para: ${label}`);
    }
    source = all ? source.split(from).join(to) : source.replace(from, to);
    changed = true;
  }
  if (changed) await writeFile(path, source, "utf8");
}

await patchFile("app/api/rooms/route.ts", [
  {
    label: "subir límite visible de salas a doce jugadores",
    from: "          state.players.length >= 8 ||",
    to: "          state.players.length >= 12 ||",
  },
  {
    label: "mostrar capacidad de doce jugadores",
    from: "            maxPlayers: 8,",
    to: "            maxPlayers: 12,",
  },
  {
    label: "permitir hasta doce jugadores al entrar",
    from: "      if (!spectator && state.players.length >= 8)\n        return Response.json(\n          { error: \"La sala ya tiene 8 jugadores\" },",
    to: "      if (!spectator && state.players.length >= 12)\n        return Response.json(\n          { error: \"La sala ya tiene 12 jugadores\" },",
  },
  {
    label: "permitir al host retirar jugadores en la sala de espera",
    from: "    } else if (action === \"shuffleCategories\") {",
    to: `    } else if (action === "kickPlayer") {
      if (playerId !== state.hostId || state.status !== "lobby")
        return Response.json(
          { error: "Solo el anfitrión puede retirar jugadores antes de comenzar" },
          { status: 403 },
        );
      const targetId = String(body.targetId ?? "");
      if (!targetId || targetId === state.hostId)
        return Response.json(
          { error: "No puedes retirar al anfitrión" },
          { status: 400 },
        );
      const targetIndex = state.players.findIndex((item) => item.id === targetId);
      if (targetIndex < 0)
        return Response.json({ error: "Jugador no encontrado" }, { status: 404 });
      const [removed] = state.players.splice(targetIndex, 1);
      if (targetIndex < state.turnIndex) state.turnIndex--;
      state.turnIndex = Math.max(0, Math.min(state.turnIndex, state.players.length - 1));
      state.message = \`\${removed.name} fue retirado de la sala por el anfitrión.\`;
    } else if (action === "shuffleCategories") {`,
  },
  {
    label: "duración independiente de la votación",
    from: `function cardFrom(hand: GameCard[], cardId: string) {
  return hand.find((item) => item.id === cardId);
}`,
    to: `function cardFrom(hand: GameCard[], cardId: string) {
  return hand.find((item) => item.id === cardId);
}
const VOTE_DURATION_MS = 10000;`,
  },
  {
    label: "votar directamente en vivo por turnos sin impugnación",
    from: `        } else if (state.settings.playStyle === "live") {
          state.pendingLive = {
            ...submission,
            expiresAt: Date.now() + 4500,
            passes: [],
          };
          state.message = \`\${actor!.name} jugó la \${card.label}. Se puede impugnar durante 4 segundos.\`;
        } else {`,
    to: `        } else if (state.settings.playStyle === "live") {
          state.pendingVote = { ...submission, votes: {} };
          state.pendingLive = null;
          state.message = \`\${actor!.name} jugó la \${card.label}. El grupo decide si la respuesta es válida.\`;
        } else {`,
  },
  {
    label: "dar diez segundos a toda votación",
    from: "votes: {}",
    to: "votes: {}, expiresAt: Date.now() + VOTE_DURATION_MS",
    all: true,
  },
  {
    label: "resolver automáticamente votación vencida",
    from: `function acceptPendingLive(state: GameState) {`,
    to: `function finalizeExpiredVote(state: GameState) {
  const pending = state.pendingVote;
  if (!pending) return false;
  if (!pending.expiresAt) {
    pending.expiresAt = Date.now() + VOTE_DURATION_MS;
    return true;
  }
  if (Date.now() < pending.expiresAt) return false;
  const votes = Object.values(pending.votes);
  const yes = votes.filter(Boolean).length;
  resolveVote(state, votes.length > 0 && yes > votes.length / 2);
  return true;
}
function acceptPendingLive(state: GameState) {`,
  },
  {
    label: "revisar expiración de votación en polling",
    from: `  changed = finalizeExpiredLive(state) || changed;
  if (`,
    to: `  changed = finalizeExpiredLive(state) || changed;
  changed = finalizeExpiredVote(state) || changed;
  if (`,
  },
  {
    label: "rechazar voto que llegó después del tiempo",
    from: `      if (state.pendingVote.playerId === playerId)
        return Response.json(`,
    to: `      if (state.pendingVote.expiresAt && Date.now() >= state.pendingVote.expiresAt) {
        finalizeExpiredVote(state);
        await save(state);
        return Response.json({ state: publicState(state, playerId) });
      }
      if (state.pendingVote.playerId === playerId)
        return Response.json(`,
  },
]);

await patchFile("app/page.tsx", [
  {
    label: "tipar vencimiento de votación",
    from: `    votes: Record<string, boolean>;
    cardLabel?: string;`,
    to: `    votes: Record<string, boolean>;
    expiresAt: number;
    cardLabel?: string;`,
  },
  {
    label: "detectar si el host retiró al jugador de la sala",
    from: `  useEffect(() => {
    if (screen !== "home" && screen !== "join") return;`,
    to: `  useEffect(() => {
    if (screen !== "game" || room?.status !== "lobby" || !playerId) return;
    const stillPresent =
      room.players.some((item) => item.id === playerId) ||
      room.spectators.some((item) => item.id === playerId);
    if (stillPresent) return;
    sessionStorage.removeItem("letrario-player-session");
    setRoom(null);
    setPlayerId("");
    setRoomCode("");
    history.replaceState(null, "", \`\${location.pathname}?join=1\`);
    setParticipantPortal(true);
    setScreen("join");
    show("El anfitrión te retiró de la sala.");
  }, [screen, room?.status, room?.players, room?.spectators, playerId]);
  useEffect(() => {
    if (screen !== "home" && screen !== "join") return;`,
  },
  {
    label: "botón de retirar jugador en sala de espera",
    from: `                  {item.name}
                  {item.id === room.hostId && <small>ANFITRIÓN</small>}
                </span>`,
    to: `                  <strong className="waiting-player-name">{item.name}</strong>
                  {item.id === room.hostId && <small>ANFITRIÓN</small>}
                  {playerId === room.hostId && item.id !== room.hostId && (
                    <button
                      type="button"
                      className="kick-player-button"
                      aria-label={\`Retirar a \${item.name}\`}
                      title={\`Retirar a \${item.name}\`}
                      onClick={() => void act("kickPlayer", { targetId: item.id })}
                      disabled={busy}
                    >
                      <Icon name="close" size={16} />
                    </button>
                  )}
                </span>`,
  },
  {
    label: "contador visible en tarjeta de votación",
    from: `            <p>
              <b>{voteOwner?.name}</b> respondió
            </p>
            <div className={\`vote-word \${room.pendingVote.matchMode === "contains" ? "contains" : "starts"}\`}>
              <span
                className="vote-letter"
                title={room.pendingVote.matchMode === "contains" ? "La respuesta contiene esta letra" : "La respuesta comienza con esta letra"}
              >
                {room.pendingVote.cardLabel ?? room.lastPlay?.label}
              </span>
              <h2>
                “{room.pendingVote.matchMode === "contains"
                  ? highlightedAnswer(room.pendingVote.answer, room.pendingVote.cardLabel ?? room.lastPlay?.label)
                  : room.pendingVote.answer}”
              </h2>
            </div>`,
    to: `            <div className="vote-panel-heading">
              <p>
                <b>{voteOwner?.name}</b>{" "}
                {room.settings.playStyle === "live" ? "jugó" : "respondió"}
              </p>
              <div
                className="vote-countdown"
                aria-label={\`\${Math.max(0, Math.ceil((room.pendingVote.expiresAt - now) / 1000))} segundos para votar\`}
                style={
                  {
                    "--vote-progress": \`\${Math.max(
                      0,
                      Math.min(
                        100,
                        ((room.pendingVote.expiresAt - now) / 10000) * 100,
                      ),
                    )}%\`,
                  } as React.CSSProperties
                }
              >
                <strong>
                  {Math.max(
                    0,
                    Math.ceil((room.pendingVote.expiresAt - now) / 1000),
                  )}
                </strong>
                <small>SEG</small>
              </div>
            </div>
            <div className={\`vote-word \${room.pendingVote.matchMode === "contains" ? "contains" : "starts"}\`}>
              <span
                className="vote-letter"
                title={room.pendingVote.matchMode === "contains" ? "La respuesta contiene esta letra" : "La respuesta comienza con esta letra"}
              >
                {room.pendingVote.cardLabel ?? room.lastPlay?.label}
              </span>
              <h2>
                {room.settings.playStyle === "live"
                  ? "¿Respuesta válida?"
                  : <>“{room.pendingVote.matchMode === "contains"
                      ? highlightedAnswer(room.pendingVote.answer, room.pendingVote.cardLabel ?? room.lastPlay?.label)
                      : room.pendingVote.answer}”</>}
              </h2>
            </div>`,
  },
]);
