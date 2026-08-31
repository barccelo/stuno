import { readFile, writeFile } from "node:fs/promises";

function replaceOnce(source, pattern, replacement, label) {
  if (typeof pattern === "string") {
    if (!source.includes(pattern)) throw new Error(`No se encontró el bloque esperado para: ${label}`);
    return source.replace(pattern, replacement);
  }
  if (!pattern.test(source)) throw new Error(`No se encontró el bloque esperado para: ${label}`);
  return source.replace(pattern, replacement);
}

// Keep the victim of a confirmed turn steal attached to the actual play.
let game = await readFile("lib/game.ts", "utf8");
if (!game.includes("turnStealVictimId?: string;")) {
  const submissionPattern = /(export type Submission = \{[\s\S]*?)(\n\};)/m;
  const match = game.match(submissionPattern);
  if (!match) throw new Error("No se encontró export type Submission en lib/game.ts.");
  game = game.replace(
    submissionPattern,
    `$1\n  turnStealVictimId?: string;$2`,
  );
  await writeFile("lib/game.ts", game, "utf8");
}

let route = await readFile("app/api/rooms/route.ts", "utf8");

if (!route.includes("let confirmedTurnStealVictimId: string | null = null;")) {
  route = replaceOnce(
    route,
    /(\s+const actor = player\(state, playerId\);)/,
    `$1\n    let confirmedTurnStealVictimId: string | null = null;\n    let confirmedTurnStealLabel: string | null = null;`,
    "preparar evento confirmado de Robar turno",
  );
}

if (!route.includes("confirmedTurnStealVictimId = armed.stolenFromId ?? null;")) {
  const guardPattern = /(if \(state\.settings\.mode === "classic" && state\.settings\.turnStealEnabled !== false\) \{\s*const armed = state\.armedTurnPlay;\s*if \(!armed \|\| armed\.playerId !== playerId \|\| armed\.cardId !== cardId \|\| !armed\.committed\)\s*return Response\.json\(\{ error: "La jugada cambió antes de confirmarse" \}, \{ status: 409 \}\);\s*)(state\.armedTurnPlay = null;)/m;
  const match = route.match(guardPattern);
  if (!match) throw new Error("No se encontró el guard de confirmación de Robar turno.");
  route = route.replace(
    guardPattern,
    `$1confirmedTurnStealVictimId = armed.stolenFromId ?? null;\n        confirmedTurnStealLabel = armed.label;\n        $2`,
  );
}

if (!route.includes("turnStealVictimId: confirmedTurnStealVictimId ?? undefined,")) {
  const submissionObject = /(const submission = \{[\s\S]*?matchMode:\s*body\.matchMode === "contains"[\s\S]*?)(\n\s*\};)/m;
  if (!submissionObject.test(route))
    throw new Error("No se encontró el objeto submission para guardar la víctima del robo.");
  route = route.replace(
    submissionObject,
    `$1\n          turnStealVictimId: confirmedTurnStealVictimId ?? undefined,$2`,
  );
}

// The robbed player is not an eligible voter.
if (!route.includes('if (pending.turnStealVictimId === playerId)')) {
  const ownVoteGuard = /(\s+if \(pending\.playerId === playerId\)\s+return Response\.json\([\s\S]*?\{ status: 403 \},\s*\);)/m;
  if (!ownVoteGuard.test(route))
    throw new Error("No se encontró el guard que impide votar la propia respuesta.");
  route = route.replace(
    ownVoteGuard,
    `$1\n\n    if (pending.turnStealVictimId === playerId)\n      return Response.json(\n        { error: "No votas esta respuesta porque te robaron el turno" },\n        { status: 403 },\n      );`,
  );
}

if (!route.includes("state.players.length - 1 - (pending.turnStealVictimId ? 1 : 0)")) {
  route = replaceOnce(
    route,
    /const eligible = Math\.max\(0, state\.players\.length - 1\);/,
    `const eligible = Math.max(\n        0,\n        state.players.length - 1 - (pending.turnStealVictimId ? 1 : 0),\n      );`,
    "ajustar cantidad de votantes elegibles",
  );
}

// With two players, actor + victim leaves no impartial voter. Approve directly.
if (!route.includes("const impartialVoters = state.players.filter(")) {
  const pendingVoteAssignment = /(\s+state\.pendingVote = \{ \.\.\.submission, votes: \{\} \};)(\s+state\.message = `Respuesta de \$\{actor!\.name\}: “\$\{answer\}”`;)/m;
  if (!pendingVoteAssignment.test(route))
    throw new Error("No se encontró la creación de pendingVote para resolver sin votantes imparciales.");
  route = route.replace(
    pendingVoteAssignment,
    `$1\n          const impartialVoters = state.players.filter(\n            (item) =>\n              item.id !== playerId &&\n              item.id !== submission.turnStealVictimId,\n          );\n          if (submission.turnStealVictimId && impartialVoters.length === 0)\n            resolveVote(state, true);\n          else$2`,
  );
}

// Re-create the event at the end of the confirmed play, immediately before save.
const finalSave = route.lastIndexOf("    await save(state);");
const confirmedMarker = "// TURN STEAL confirmed event v2";
if (!route.includes(confirmedMarker)) {
  if (finalSave < 0) throw new Error("No se encontró el guardado final de la sala.");
  const eventBlock = `    ${confirmedMarker}\n    if (action === "play" && confirmedTurnStealVictimId && actor) {\n      const stolenFrom = state.players.find((item) => item.id === confirmedTurnStealVictimId);\n      state.lastEvent = {\n        kind: "turn-steal",\n        actorId: actor.id,\n        actorName: actor.name,\n        targets: stolenFrom ? [{ id: stolenFrom.id, name: stolenFrom.name }] : [],\n        label: confirmedTurnStealLabel ?? state.lastPlay?.label ?? "?",\n        global: true,\n        at: Date.now(),\n      };\n    }\n`;
  route = route.slice(0, finalSave) + eventBlock + route.slice(finalSave);
}

await writeFile("app/api/rooms/route.ts", route, "utf8");

let page = await readFile("app/page.tsx", "utf8");

if (!page.includes("turnStealVictimId?: string;")) {
  const pendingVoteType = /(pendingVote:\s*\{[\s\S]*?matchMode\?:\s*"starts"\s*\|\s*"contains";)([\s\S]*?\}\s*\|\s*null;)/m;
  if (!pendingVoteType.test(page))
    throw new Error("No se encontró el tipo pendingVote en app/page.tsx.");
  page = page.replace(
    pendingVoteType,
    `$1\n    turnStealVictimId?: string;$2`,
  );
}

if (!page.includes("No votas en esta ronda: te robaron el turno.")) {
  const voteOwnerBranch = /(\{room\.pendingVote\.playerId === playerId \? \(\s*<small>Los demás jugadores están votando…<\/small>\s*\) : )(room\.pendingVote\.votes\[playerId\] === undefined \? \()/m;
  if (!voteOwnerBranch.test(page))
    throw new Error("No se encontró la rama de interfaz de votación para la víctima.");
  page = page.replace(
    voteOwnerBranch,
    `$1room.pendingVote.turnStealVictimId === playerId ? (\n              <small>No votas en esta ronda: te robaron el turno.</small>\n            ) : $2`,
  );
}

// Give the global notification enough time to survive normal polling intervals.
page = page.replace(
  /room\.lastEvent && now - room\.lastEvent\.at < \d+/,
  "room.lastEvent && now - room.lastEvent.at < 4200",
);

await writeFile("app/page.tsx", page, "utf8");

const routeCheck = await readFile("app/api/rooms/route.ts", "utf8");
const pageCheck = await readFile("app/page.tsx", "utf8");
const gameCheck = await readFile("lib/game.ts", "utf8");
const required = [
  [gameCheck, "turnStealVictimId?: string;"],
  [routeCheck, confirmedMarker],
  [routeCheck, "pending.turnStealVictimId === playerId"],
  [routeCheck, "turnStealVictimId: confirmedTurnStealVictimId ?? undefined"],
  [pageCheck, "No votas en esta ronda: te robaron el turno."],
  [pageCheck, "now - room.lastEvent.at < 4200"],
];
const missing = required.filter(([source, token]) => !source.includes(token)).map(([, token]) => token);
if (missing.length) throw new Error(`Turn-steal notice/vote fix incompleto: ${missing.join(", ")}`);

console.log("Turn steal fixed: confirmed global notice and victim excluded from voting.");
