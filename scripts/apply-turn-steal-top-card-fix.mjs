import { readFile, writeFile } from "node:fs/promises";

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`No se encontró el bloque esperado para: ${label}`);
  return source.replace(from, to);
}

// This patch runs after apply-turn-steal-v2.mjs. The original implementation
// armed the current player's selected card, which meant an out-of-turn player
// could only jump in if the current player had first selected the same card.
// Robar turno must instead compare against the last card actually played.

let route = await readFile("app/api/rooms/route.ts", "utf8");

const oldServerSteal = `    } else {
      const armed = state.armedTurnPlay;
      if (
        blocked ||
        !armed ||
        armed.committed ||
        !current ||
        armed.playerId !== current.id ||
        armed.playerId === playerId
      )
        return turnStealResponse(state, playerId, flag, false);
      const card = cardFrom(actor.hand, cardId);
      if (!card || turnStealCardKey(card) !== armed.key)
        return turnStealResponse(state, playerId, flag, false);
      const actorIndex = state.players.findIndex((item) => item.id === playerId);
      if (actorIndex < 0) return turnStealResponse(state, playerId, flag, false);
      const previousId = armed.playerId;
      state.turnIndex = actorIndex;
      state.turnStartedAt = Date.now();
      state.consecutivePasses = 0;
      state.armedTurnPlay = {
        playerId,
        cardId: card.id,
        key: turnStealCardKey(card),
        label: card.label,
        kind: card.kind,
        penalty: card.penalty,
        at: Date.now(),
        committed: false,
        stolenFromId: previousId,
      };
      state.message = actor.name + " robó el turno.";
      changed = true;
      success = true;
    }
`;

const newServerSteal = `    } else {
      // TURN STEAL top-card fix v2: compare with the last card actually played.
      const top = state.centerPile?.[state.centerPile.length - 1];
      if (blocked || !current || current.id === playerId || !top)
        return turnStealResponse(state, playerId, flag, false);
      const card = cardFrom(actor.hand, cardId);
      const exactTopMatch = Boolean(
        card &&
        card.kind === top.kind &&
        card.label.toLocaleUpperCase("es") === top.label.toLocaleUpperCase("es")
      );
      if (!card || !exactTopMatch)
        return turnStealResponse(state, playerId, flag, false);
      const actorIndex = state.players.findIndex((item) => item.id === playerId);
      if (actorIndex < 0) return turnStealResponse(state, playerId, flag, false);
      const previousId = current.id;
      state.turnIndex = actorIndex;
      state.turnStartedAt = Date.now();
      state.consecutivePasses = 0;
      state.armedTurnPlay = {
        playerId,
        cardId: card.id,
        key: turnStealCardKey(card),
        label: card.label,
        kind: card.kind,
        penalty: card.penalty,
        at: Date.now(),
        committed: false,
        stolenFromId: previousId,
      };
      state.message = actor.name + " robó el turno con " + card.label + ".";
      changed = true;
      success = true;
    }
`;

route = replaceRequired(route, oldServerSteal, newServerSteal, "robo de turno contra carta superior");
await writeFile("app/api/rooms/route.ts", route, "utf8");

let page = await readFile("app/page.tsx", "utf8");

const oldClientReady = `  function isTurnStealReady(card: GameCard) {
    const armed = room?.armedTurnPlay;
    return Boolean(
      room?.settings.mode === "classic" &&
      room.settings.turnStealEnabled !== false &&
      room.status === "playing" &&
      !room.pausedAt &&
      armed &&
      !armed.committed &&
      armed.playerId !== playerId &&
      room.players[room.turnIndex]?.id === armed.playerId &&
      turnStealCardKeyClient(card) === armed.key,
    );
  }
`;

const newClientReady = `  function isTurnStealReady(card: GameCard) {
    const top = room?.centerPile?.[room.centerPile.length - 1];
    const currentTurnId = room?.players[room.turnIndex]?.id;
    return Boolean(
      room?.settings.mode === "classic" &&
      room.settings.turnStealEnabled !== false &&
      room.status === "playing" &&
      !room.pausedAt &&
      !room.pendingVote &&
      !room.pendingLive &&
      !room.pendingPenalty &&
      !room.pendingSteal &&
      !room.pendingVarCheck &&
      room.currentCategory &&
      currentTurnId &&
      currentTurnId !== playerId &&
      top &&
      card.kind === top.kind &&
      card.label.toLocaleUpperCase("es") === top.label.toLocaleUpperCase("es"),
    );
  }
`;

page = replaceRequired(page, oldClientReady, newClientReady, "detección visual de carta apta para robar turno");
await writeFile("app/page.tsx", page, "utf8");

const routeCheck = await readFile("app/api/rooms/route.ts", "utf8");
const pageCheck = await readFile("app/page.tsx", "utf8");
if (!routeCheck.includes("TURN STEAL top-card fix v2"))
  throw new Error("No se aplicó la corrección de servidor de Robar turno.");
if (!pageCheck.includes("const top = room?.centerPile?.[room.centerPile.length - 1];"))
  throw new Error("No se aplicó la corrección de cliente de Robar turno.");

console.log("Turn steal fixed: exact match now uses the top played card.");
