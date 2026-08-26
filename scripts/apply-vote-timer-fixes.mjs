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

await patchFile("lib/game.ts", [
  {
    label: "guardar vencimiento de la votación",
    from: 'export type PendingVote = Submission & { votes: Record<string, boolean> };',
    to: 'export type PendingVote = Submission & { votes: Record<string, boolean>; expiresAt?: number };',
  },
]);

await patchFile("app/api/rooms/route.ts", [
  {
    label: "crear votaciones con diez segundos independientes",
    from: 'function drawWithEvent(state: GameState, target: Player, count = 1) {',
    to: `const VOTE_DURATION_MS = 10000;\nfunction makePendingVote(submission: Submission) {\n  return {\n    ...submission,\n    votes: {},\n    expiresAt: Date.now() + VOTE_DURATION_MS,\n  };\n}\nfunction drawWithEvent(state: GameState, target: Player, count = 1) {`,
  },
  {
    label: "temporizar primera revisión simultánea",
    from: '  state.pendingVote = first ? { ...first, votes: {} } : null;',
    to: '  state.pendingVote = first ? makePendingVote(first) : null;',
  },
  {
    label: "temporizar revisiones siguientes",
    from: '    state.pendingVote = next ? { ...next, votes: {} } : null;',
    to: '    state.pendingVote = next ? makePendingVote(next) : null;',
    all: true,
  },
  {
    label: "temporizar votaciones de jugadas",
    from: '          state.pendingVote = { ...submission, votes: {} };',
    to: '          state.pendingVote = makePendingVote(submission);',
    all: true,
  },
  {
    label: "temporizar votación heredada de impugnación",
    from: '      state.pendingVote = { ...state.pendingLive, votes: {} };',
    to: '      state.pendingVote = makePendingVote(state.pendingLive);',
  },
  {
    label: "resolver vencimiento de votación por mayoría emitida",
    from: 'function acceptPendingLive(state: GameState) {',
    to: `function finalizeExpiredVote(state: GameState) {\n  const pending = state.pendingVote;\n  if (!pending) return false;\n  if (!pending.expiresAt) {\n    pending.expiresAt = Date.now() + VOTE_DURATION_MS;\n    return true;\n  }\n  if (Date.now() < pending.expiresAt) return false;\n  const votes = Object.values(pending.votes);\n  const yes = votes.filter(Boolean).length;\n  const approved = votes.length > 0 && yes > votes.length / 2;\n  resolveVote(state, approved);\n  return true;\n}\nfunction acceptPendingLive(state: GameState) {`,
  },
  {
    label: "cerrar votaciones vencidas desde el polling de sala",
    from: '  let changed = finalizeStartCountdown(state);\n  changed = finalizeExpiredLive(state) || changed;',
    to: '  let changed = finalizeStartCountdown(state);\n  changed = finalizeExpiredLive(state) || changed;\n  changed = finalizeExpiredVote(state) || changed;',
  },
  {
    label: "rechazar votos que llegan después del cierre",
    from: `      if (!state.pendingVote)\n        return Response.json(\n          { error: "No hay una votación activa" },\n          { status: 409 },\n        );\n      if (state.pendingVote.playerId === playerId)`,
    to: `      if (!state.pendingVote)\n        return Response.json(\n          { error: "No hay una votación activa" },\n          { status: 409 },\n        );\n      if (\n        state.pendingVote.expiresAt &&\n        Date.now() >= state.pendingVote.expiresAt\n      ) {\n        finalizeExpiredVote(state);\n        await save(state);\n        return Response.json({ state: publicState(state, playerId) });\n      }\n      if (state.pendingVote.playerId === playerId)`,
  },
  {
    label: "separar timeout de turno del tiempo de votación",
    from: '        state.pendingLive ||\n        state.pendingPenalty ||',
    to: '        state.pendingLive ||\n        state.pendingVote ||\n        state.pendingPenalty ||',
  },
]);

await patchFile("app/page.tsx", [
  {
    label: "tipar vencimiento de votación en cliente",
    from: '    votes: Record<string, boolean>;\n    cardLabel?: string;',
    to: '    votes: Record<string, boolean>;\n    expiresAt?: number;\n    cardLabel?: string;',
  },
  {
    label: "calcular contador visual de votación",
    from: `    const voteOwner =\n      room.pendingVote &&\n      room.players.find((item) => item.id === room.pendingVote?.playerId);\n    const winner = room.players.find((item) => item.id === room.winnerId);`,
    to: `    const voteOwner =\n      room.pendingVote &&\n      room.players.find((item) => item.id === room.pendingVote?.playerId);\n    const voteRemaining = room.pendingVote?.expiresAt\n      ? Math.max(0, Math.ceil((room.pendingVote.expiresAt - now) / 1000))\n      : 10;\n    const winner = room.players.find((item) => item.id === room.winnerId);`,
  },
  {
    label: "integrar contador en cabecera de tarjeta de votación",
    from: `            <p>\n              <b>{voteOwner?.name}</b>{" "}\n              {room.settings.playStyle === "live" ? "jugó" : "respondió"}\n            </p>`,
    to: `            <div className="vote-panel-head">\n              <p>\n                <b>{voteOwner?.name}</b>{" "}\n                {room.settings.playStyle === "live" ? "jugó" : "respondió"}\n              </p>\n              <div\n                className={\`vote-countdown ${voteRemaining <= 3 ? "ending" : ""}\`}\n                aria-label={\`${voteRemaining} segundos para votar\`}\n                aria-live="polite"\n              >\n                <strong>{voteRemaining}</strong>\n                <small>SEG</small>\n              </div>\n            </div>`,
  },
]);
