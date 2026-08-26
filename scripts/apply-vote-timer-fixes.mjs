import { readFile, writeFile } from "node:fs/promises";

function replaceEvery(source, from, to) {
  return source.includes(from) ? source.split(from).join(to) : source;
}

let game = await readFile("lib/game.ts", "utf8");
const pendingVoteOptional =
  'export type PendingVote = Submission & { votes: Record<string, boolean>; expiresAt?: number };';
const pendingVoteRequired = `export type PendingVote = Submission & {
  votes: Record<string, boolean>;
  expiresAt: number;
};`;
const pendingVoteLegacy =
  'export type PendingVote = Submission & { votes: Record<string, boolean> };';

if (!game.includes(pendingVoteOptional) && !game.includes(pendingVoteRequired)) {
  game = game.replace(pendingVoteLegacy, pendingVoteOptional);
}
if (!game.includes(pendingVoteOptional) && !game.includes(pendingVoteRequired)) {
  throw new Error("No se pudo verificar expiresAt en PendingVote.");
}
await writeFile("lib/game.ts", game, "utf8");

let route = await readFile("app/api/rooms/route.ts", "utf8");

if (!route.includes("const VOTE_DURATION_MS = 10000;")) {
  const anchor = "function drawWithEvent(state: GameState, target: Player, count = 1) {";
  if (!route.includes(anchor)) {
    throw new Error("No se encontró el punto para crear el temporizador de votación.");
  }
  route = route.replace(
    anchor,
    `const VOTE_DURATION_MS = 10000;
function makePendingVote(submission: Submission) {
  return {
    ...submission,
    votes: {},
    expiresAt: Date.now() + VOTE_DURATION_MS,
  };
}
${anchor}`,
  );
}

// Every route that opens a validity vote goes through the same constructor.
route = replaceEvery(
  route,
  "state.pendingVote = first ? { ...first, votes: {} } : null;",
  "state.pendingVote = first ? makePendingVote(first) : null;",
);
route = replaceEvery(
  route,
  "state.pendingVote = next ? { ...next, votes: {} } : null;",
  "state.pendingVote = next ? makePendingVote(next) : null;",
);
route = replaceEvery(
  route,
  "state.pendingVote = { ...submission, votes: {} };",
  "state.pendingVote = makePendingVote(submission);",
);
route = replaceEvery(
  route,
  "state.pendingVote = { ...state.pendingLive, votes: {} };",
  "state.pendingVote = makePendingVote(state.pendingLive);",
);

if (!route.includes("function finalizeExpiredVote(state: GameState)")) {
  const anchor = "function acceptPendingLive(state: GameState) {";
  if (!route.includes(anchor)) {
    throw new Error("No se encontró el punto para cerrar votaciones vencidas.");
  }
  route = route.replace(
    anchor,
    `function finalizeExpiredVote(state: GameState) {
  const pending = state.pendingVote;
  if (!pending) return false;
  if (!pending.expiresAt) {
    pending.expiresAt = Date.now() + VOTE_DURATION_MS;
    return true;
  }
  if (Date.now() < pending.expiresAt) return false;
  const votes = Object.values(pending.votes);
  const yes = votes.filter(Boolean).length;
  const approved = votes.length === 0 || yes > votes.length / 2;
  resolveVote(state, approved);
  return true;
}
${anchor}`,
  );
}

if (!route.includes("changed = finalizeExpiredVote(state) || changed;")) {
  const anchor = "  changed = finalizeExpiredLive(state) || changed;";
  if (!route.includes(anchor)) {
    throw new Error("No se encontró el polling de la sala para revisar la votación.");
  }
  route = route.replace(
    anchor,
    `${anchor}\n  changed = finalizeExpiredVote(state) || changed;`,
  );
}

if (!route.includes("Date.now() >= state.pendingVote.expiresAt")) {
  const anchor = `      if (state.pendingVote.playerId === playerId)
        return Response.json(`;
  if (!route.includes(anchor)) {
    throw new Error("No se encontró la acción vote para proteger votos tardíos.");
  }
  route = route.replace(
    anchor,
    `      if (
        state.pendingVote.expiresAt &&
        Date.now() >= state.pendingVote.expiresAt
      ) {
        finalizeExpiredVote(state);
        await save(state);
        return Response.json({ state: publicState(state, playerId) });
      }
${anchor}`,
  );
}

// The normal turn timer must not resolve anything while the decision card is open.
const timeoutWithoutVote = `        state.pendingLive ||
        state.pendingPenalty ||`;
const timeoutWithVote = `        state.pendingLive ||
        state.pendingVote ||
        state.pendingPenalty ||`;
if (!route.includes(timeoutWithVote) && route.includes(timeoutWithoutVote)) {
  route = route.replace(timeoutWithoutVote, timeoutWithVote);
}

const required = [
  [route.includes("const VOTE_DURATION_MS = 10000;"), "duración de 10 segundos"],
  [route.includes("function makePendingVote"), "constructor de votaciones"],
  [route.includes("function finalizeExpiredVote"), "cierre de votaciones vencidas"],
  [route.includes("const approved = votes.length === 0 || yes > votes.length / 2;"), "aceptación cuando nadie vota"],
  [route.includes("changed = finalizeExpiredVote(state) || changed;"), "revisión durante polling"],
  [!route.includes("state.pendingVote = { ...submission, votes: {} };"), "jugadas sin temporizar"],
  [!route.includes("state.pendingVote = first ? { ...first, votes: {} } : null;"), "primera revisión simultánea sin temporizar"],
  [!route.includes("state.pendingVote = next ? { ...next, votes: {} } : null;"), "revisión simultánea posterior sin temporizar"],
  [!route.includes("state.pendingVote = { ...state.pendingLive, votes: {} };"), "impugnación heredada sin temporizar"],
];
const failures = required.filter(([ok]) => !ok).map(([, label]) => label);
if (failures.length) {
  throw new Error(`Vote timer incompleto: ${failures.join(", ")}`);
}

await writeFile("app/api/rooms/route.ts", route, "utf8");
console.log("Vote timer aplicado: 10 s independientes en todas las votaciones.");
