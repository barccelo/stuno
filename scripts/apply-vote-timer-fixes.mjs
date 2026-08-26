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
    to: `const VOTE_DURATION_MS = 10000;
function makePendingVote(submission: Submission) {
  return {
    ...submission,
    votes: {},
    expiresAt: Date.now() + VOTE_DURATION_MS,
  };
}
function drawWithEvent(state: GameState, target: Player, count = 1) {`,
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
  const approved = votes.length > 0 && yes > votes.length / 2;
  resolveVote(state, approved);
  return true;
}
function acceptPendingLive(state: GameState) {`,
  },
  {
    label: "cerrar votaciones vencidas desde el polling de sala",
    from: `  let changed = finalizeStartCountdown(state);
  changed = finalizeExpiredLive(state) || changed;`,
    to: `  let changed = finalizeStartCountdown(state);
  changed = finalizeExpiredLive(state) || changed;
  changed = finalizeExpiredVote(state) || changed;`,
  },
  {
    label: "rechazar votos que llegan después del cierre",
    from: `      if (!state.pendingVote)
        return Response.json(
          { error: "No hay una votación activa" },
          { status: 409 },
        );
      if (state.pendingVote.playerId === playerId)`,
    to: `      if (!state.pendingVote)
        return Response.json(
          { error: "No hay una votación activa" },
          { status: 409 },
        );
      if (
        state.pendingVote.expiresAt &&
        Date.now() >= state.pendingVote.expiresAt
      ) {
        finalizeExpiredVote(state);
        await save(state);
        return Response.json({ state: publicState(state, playerId) });
      }
      if (state.pendingVote.playerId === playerId)`,
  },
  {
    label: "separar timeout de turno del tiempo de votación",
    from: `        state.pendingLive ||
        state.pendingPenalty ||`,
    to: `        state.pendingLive ||
        state.pendingVote ||
        state.pendingPenalty ||`,
  },
]);
