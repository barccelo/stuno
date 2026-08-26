import { readFile, writeFile } from "node:fs/promises";

const block = (...lines) => lines.join("\n");

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
    from: block(
      "      if (!spectator && state.players.length >= 8)",
      "        return Response.json(",
      "          { error: \"La sala ya tiene 8 jugadores\" },",
    ),
    to: block(
      "      if (!spectator && state.players.length >= 12)",
      "        return Response.json(",
      "          { error: \"La sala ya tiene 12 jugadores\" },",
    ),
  },
  {
    label: "permitir al host retirar jugadores en la sala de espera",
    from: "    } else if (action === \"shuffleCategories\") {",
    to: block(
      "    } else if (action === \"kickPlayer\") {",
      "      if (playerId !== state.hostId || state.status !== \"lobby\")",
      "        return Response.json(",
      "          { error: \"Solo el anfitrión puede retirar jugadores antes de comenzar\" },",
      "          { status: 403 },",
      "        );",
      "      const targetId = String(body.targetId ?? \"\");",
      "      if (!targetId || targetId === state.hostId)",
      "        return Response.json(",
      "          { error: \"No puedes retirar al anfitrión\" },",
      "          { status: 400 },",
      "        );",
      "      const targetIndex = state.players.findIndex((item) => item.id === targetId);",
      "      if (targetIndex < 0)",
      "        return Response.json({ error: \"Jugador no encontrado\" }, { status: 404 });",
      "      const [removed] = state.players.splice(targetIndex, 1);",
      "      if (targetIndex < state.turnIndex) state.turnIndex--;",
      "      state.turnIndex = Math.max(0, Math.min(state.turnIndex, state.players.length - 1));",
      "      state.message = removed.name + \" fue retirado de la sala por el anfitrión.\";",
      "    } else if (action === \"shuffleCategories\") {",
    ),
  },
  {
    label: "votar directamente en vivo por turnos sin impugnación",
    from: block(
      "        } else if (state.settings.playStyle === \"live\") {",
      "          state.pendingLive = {",
      "            ...submission,",
      "            expiresAt: Date.now() + 4500,",
      "            passes: [],",
      "          };",
      "          state.message = `${actor!.name} jugó la ${card.label}. Se puede impugnar durante 4 segundos.`;",
      "        } else {",
    ),
    to: block(
      "        } else if (state.settings.playStyle === \"live\") {",
      "          state.pendingVote = { ...submission, votes: {} };",
      "          state.pendingLive = null;",
      "          state.message = actor!.name + \" jugó la \" + card.label + \". El grupo decide si la respuesta es válida.\";",
      "        } else {",
    ),
  },
]);

await patchFile("app/page.tsx", [
  {
    label: "detectar si el host retiró al jugador de la sala",
    from: block(
      "  useEffect(() => {",
      "    if (screen !== \"home\" && screen !== \"join\") return;",
    ),
    to: block(
      "  useEffect(() => {",
      "    if (screen !== \"game\" || room?.status !== \"lobby\" || !playerId) return;",
      "    const stillPresent =",
      "      room.players.some((item) => item.id === playerId) ||",
      "      room.spectators.some((item) => item.id === playerId);",
      "    if (stillPresent) return;",
      "    sessionStorage.removeItem(\"letrario-player-session\");",
      "    setRoom(null);",
      "    setPlayerId(\"\");",
      "    setRoomCode(\"\");",
      "    history.replaceState(null, \"\", location.pathname + \"?join=1\");",
      "    setParticipantPortal(true);",
      "    setScreen(\"join\");",
      "    show(\"El anfitrión te retiró de la sala.\");",
      "  }, [screen, room?.status, room?.players, room?.spectators, playerId]);",
      "  useEffect(() => {",
      "    if (screen !== \"home\" && screen !== \"join\") return;",
    ),
  },
  {
    label: "botón de retirar jugador en sala de espera",
    from: block(
      "                  {item.name}",
      "                  {item.id === room.hostId && <small>ANFITRIÓN</small>}",
      "                </span>",
    ),
    to: block(
      "                  <strong className=\"waiting-player-name\">{item.name}</strong>",
      "                  {item.id === room.hostId && <small>ANFITRIÓN</small>}",
      "                  {playerId === room.hostId && item.id !== room.hostId && (",
      "                    <button",
      "                      type=\"button\"",
      "                      className=\"kick-player-button\"",
      "                      aria-label={\"Retirar a \" + item.name}",
      "                      title={\"Retirar a \" + item.name}",
      "                      onClick={() => void act(\"kickPlayer\", { targetId: item.id })}",
      "                      disabled={busy}",
      "                    >",
      "                      <Icon name=\"close\" size={16} />",
      "                    </button>",
      "                  )}",
      "                </span>",
    ),
  },
  {
    label: "texto de votación oral en vivo",
    from: block(
      "            <p>",
      "              <b>{voteOwner?.name}</b> respondió",
      "            </p>",
      "            <div className={`vote-word ${room.pendingVote.matchMode === \"contains\" ? \"contains\" : \"starts\"}`}>",
      "              <span",
      "                className=\"vote-letter\"",
      "                title={room.pendingVote.matchMode === \"contains\" ? \"La respuesta contiene esta letra\" : \"La respuesta comienza con esta letra\"}",
      "              >",
      "                {room.pendingVote.cardLabel ?? room.lastPlay?.label}",
      "              </span>",
      "              <h2>",
      "                “{room.pendingVote.matchMode === \"contains\"",
      "                  ? highlightedAnswer(room.pendingVote.answer, room.pendingVote.cardLabel ?? room.lastPlay?.label)",
      "                  : room.pendingVote.answer}”",
      "              </h2>",
      "            </div>",
    ),
    to: block(
      "            <p>",
      "              <b>{voteOwner?.name}</b>{\" \"}",
      "              {room.settings.playStyle === \"live\" ? \"jugó\" : \"respondió\"}",
      "            </p>",
      "            <div className={`vote-word ${room.pendingVote.matchMode === \"contains\" ? \"contains\" : \"starts\"}`}>",
      "              <span",
      "                className=\"vote-letter\"",
      "                title={room.pendingVote.matchMode === \"contains\" ? \"La respuesta contiene esta letra\" : \"La respuesta comienza con esta letra\"}",
      "              >",
      "                {room.pendingVote.cardLabel ?? room.lastPlay?.label}",
      "              </span>",
      "              <h2>",
      "                {room.settings.playStyle === \"live\"",
      "                  ? \"¿Respuesta válida?\"",
      "                  : <>“{room.pendingVote.matchMode === \"contains\"",
      "                      ? highlightedAnswer(room.pendingVote.answer, room.pendingVote.cardLabel ?? room.lastPlay?.label)",
      "                      : room.pendingVote.answer}”</>}",
      "              </h2>",
      "            </div>",
    ),
  },
]);
