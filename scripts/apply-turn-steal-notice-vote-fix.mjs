import { readFile, writeFile } from "node:fs/promises";

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`No se encontró el bloque esperado para: ${label}`);
  return source.replace(from, to);
}

// Keep the victim of a confirmed turn steal attached to the actual play.
let game = await readFile("lib/game.ts", "utf8");
if (!game.includes("turnStealVictimId?: string;")) {
  game = replaceRequired(
    game,
    '  matchMode?: "starts" | "contains";\n};',
    '  matchMode?: "starts" | "contains";\n  turnStealVictimId?: string;\n};',
    "tipar víctima del robo de turno en Submission",
  );
  await writeFile("lib/game.ts", game, "utf8");
}

let route = await readFile("app/api/rooms/route.ts", "utf8");

if (!route.includes("let confirmedTurnStealVictimId: string | null = null;")) {
  route = replaceRequired(
    route,
    '    const actor = player(state, playerId);\n',
    '    const actor = player(state, playerId);\n    let confirmedTurnStealVictimId: string | null = null;\n    let confirmedTurnStealLabel: string | null = null;\n',
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
  route = replaceRequired(
    route,
    '          matchMode: body.matchMode === "contains" ? "contains" as const : "starts" as const,\n        };',
    '          matchMode: body.matchMode === "contains" ? "contains" as const : "starts" as const,\n          turnStealVictimId: confirmedTurnStealVictimId ?? undefined,\n        };',
    "guardar víctima en la respuesta sometida a votación",
  );
}

// The robbed player is not an eligible voter.
if (!route.includes('if (pending.turnStealVictimId === playerId)')) {
  route = replaceRequired(
    route,
    '    if (pending.playerId === playerId)\n      return Response.json(\n        { error: "No puedes votar tu propia respuesta" },\n        { status: 403 },\n      );\n',
    '    if (pending.playerId === playerId)\n      return Response.json(\n        { error: "No puedes votar tu propia respuesta" },\n        { status: 403 },\n      );\n\n    if (pending.turnStealVictimId === playerId)\n      return Response.json(\n        { error: "No votas esta respuesta porque te robaron el turno" },\n        { status: 403 },\n      );\n',
    "excluir a la víctima de la votación",
  );
}

route = route.replace(
  '      const eligible = Math.max(0, state.players.length - 1);',
  '      const eligible = Math.max(\n        0,\n        state.players.length - 1 - (pending.turnStealVictimId ? 1 : 0),\n      );',
);

// With two players, actor + victim leaves no impartial voter. Approve directly.
if (!route.includes("const impartialVoters = state.players.filter(")) {
  route = replaceRequired(
    route,
    '          state.pendingVote = { ...submission, votes: {} };\n          state.message = `Respuesta de ${actor!.name}: “${answer}”`;',
    '          state.pendingVote = { ...submission, votes: {} };\n          const impartialVoters = state.players.filter(\n            (item) =>\n              item.id !== playerId &&\n              item.id !== submission.turnStealVictimId,\n          );\n          if (submission.turnStealVictimId && impartialVoters.length === 0)\n            resolveVote(state, true);\n          else\n            state.message = `Respuesta de ${actor!.name}: “${answer}”`;',
    "resolver robo sin votantes imparciales",
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
  page = replaceRequired(
    page,
    '    matchMode?: "starts" | "contains";\n  } | null;',
    '    matchMode?: "starts" | "contains";\n    turnStealVictimId?: string;\n  } | null;',
    "tipar víctima de Robar turno en pendingVote",
  );
}

if (!page.includes("No votas en esta ronda: te robaron el turno.")) {
  const voteBranch = `            {room.pendingVote.playerId === playerId ? (
              <small>Los demás jugadores están votando…</small>
            ) : room.pendingVote.votes[playerId] === undefined ? (`;
  const replacement = `            {room.pendingVote.playerId === playerId ? (
              <small>Los demás jugadores están votando…</small>
            ) : room.pendingVote.turnStealVictimId === playerId ? (
              <small>No votas en esta ronda: te robaron el turno.</small>
            ) : room.pendingVote.votes[playerId] === undefined ? (`;
  page = replaceRequired(page, voteBranch, replacement, "mensaje de no-voto para la víctima");
}

// Give the global notification enough time to survive normal polling intervals.
page = page.replace(
  'room.lastEvent && now - room.lastEvent.at < 2400',
  'room.lastEvent && now - room.lastEvent.at < 4200',
);

await writeFile("app/page.tsx", page, "utf8");

const routeCheck = await readFile("app/api/rooms/route.ts", "utf8");
const pageCheck = await readFile("app/page.tsx", "utf8");
const required = [
  [routeCheck, confirmedMarker],
  [routeCheck, "pending.turnStealVictimId === playerId"],
  [routeCheck, "turnStealVictimId: confirmedTurnStealVictimId ?? undefined"],
  [pageCheck, "No votas en esta ronda: te robaron el turno."],
  [pageCheck, "now - room.lastEvent.at < 4200"],
];
const missing = required.filter(([source, token]) => !source.includes(token)).map(([, token]) => token);
if (missing.length) throw new Error(`Turn-steal notice/vote fix incompleto: ${missing.join(", ")}`);

console.log("Turn steal fixed: confirmed global notice and victim excluded from voting.");
