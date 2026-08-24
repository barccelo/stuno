import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { rooms } from "../../../db/schema";
import {
  categories,
  chooseCategory,
  draw,
  GameCard,
  GameState,
  makeDeck,
  nextIndex,
  normalized,
  Player,
  shuffle,
  Submission,
} from "../../../lib/game";

function id() {
  return crypto.randomUUID();
}
function code() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(
    { length: 4 },
    () => alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join("");
}
function publicState(state: GameState, playerId: string) {
  return {
    ...state,
    deck: { count: state.deck.length },
    players: state.players.map((player) => ({
      ...player,
      hand: player.id === playerId ? player.hand : undefined,
      cardCount: player.hand.length,
    })),
  };
}
async function load(roomCode: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(rooms)
    .where(eq(rooms.code, roomCode))
    .limit(1);
  return row ? (JSON.parse(row.state) as GameState) : null;
}
async function save(state: GameState) {
  state.message = state.message.slice(0, 160);
  await getDb()
    .update(rooms)
    .set({ state: JSON.stringify(state), updatedAt: new Date().toISOString() })
    .where(eq(rooms.code, state.code));
}
function player(state: GameState, playerId: string) {
  return state.players.find((item) => item.id === playerId);
}
function cardFrom(hand: GameCard[], cardId: string) {
  return hand.find((item) => item.id === cardId);
}
function startsWith(answer: string, card: GameCard) {
  return (
    card.kind === "joker" ||
    normalized(answer).startsWith(normalized(card.label))
  );
}
function drawWithEvent(state: GameState, target: Player, count = 1) {
  draw(state, target, count);
  const event = { playerId: target.id, count, at: Date.now() };
  state.lastDraw = event;
  state.drawEvents = [event];
}
function recordCenterPlay(state: GameState, owner: Player, card: GameCard) {
  state.centerPile ??= [];
  state.centerPile.push({
    playerId: owner.id,
    playerName: owner.name,
    label: card.label,
    kind: card.kind,
    at: Date.now(),
    round: state.roundNumber ?? 0,
  });
  state.centerPile = state.centerPile.slice(-24);
}
function declareWinner(state: GameState, owner: Player) {
  state.status = "finished";
  state.winnerId = owner.id;
  owner.wins++;
  state.message = `${owner.name} ganó la partida.`;
}
function applyAccepted(state: GameState, submission: Submission) {
  const owner = player(state, submission.playerId);
  if (!owner) return false;
  const card = cardFrom(owner.hand, submission.cardId);
  if (!card) return false;
  owner.hand = owner.hand.filter((item) => item.id !== card.id);
  state.discard.push(card);
  recordCenterPlay(state, owner, card);
  state.acceptedWords.push(normalized(submission.answer));
  const finishAfter = owner.hand.length === 0 && card.kind !== "category";
  if (card.penalty) {
    state.pendingPenalty = {
      playerId: owner.id,
      total: card.penalty,
      cardLabel: card.label,
      continuation: state.settings.mode,
      finishAfter,
    };
    state.message = `${owner.name} debe repartir +${card.penalty} entre sus rivales.`;
    return true;
  }
  if (finishAfter) declareWinner(state, owner);
  return false;
}
function beginSimultaneousReview(state: GameState) {
  const submissions = Object.values(state.submissions);
  state.simultaneousRoundAccepted = false;
  state.reviewQueue = submissions;
  state.submissions = {};
  const first = state.reviewQueue.shift();
  state.pendingVote = first ? { ...first, votes: {} } : null;
  if (!first) finishSimultaneousRound(state, true);
}
function finishSimultaneousRound(
  state: GameState,
  changeCategory = !state.simultaneousRoundAccepted,
) {
  state.pendingVote = null;
  state.reviewQueue = [];
  if (changeCategory) {
    chooseCategory(state);
    state.categoryChooserId = state.categoryOwnerId ?? state.hostId;
    const chooser = player(state, state.categoryChooserId);
    state.message = `${chooser?.name ?? "El jugador"} elige una nueva categoría porque todos fallaron.`;
  } else {
    state.turnStartedAt = Date.now();
    state.message = "Nueva ronda con la misma categoría: todos contra el reloj.";
  }
  state.simultaneousRoundAccepted = false;
  state.roundNumber = (state.roundNumber ?? 0) + 1;
  state.turnsInRound = 0;
  state.pileSettledAt = Date.now();
}
function resolveVote(state: GameState, approved: boolean) {
  const pending = state.pendingVote;
  if (!pending) return;
  const owner = player(state, pending.playerId);
  let waitingForPenalty = false;
  if (approved) {
    if (state.settings.mode === "simultaneous")
      state.simultaneousRoundAccepted = true;
    waitingForPenalty = applyAccepted(state, pending);
  }
  else if (owner) {
    drawWithEvent(state, owner, 1);
    state.lastEvent = {
      kind: "draw",
      actorId: "system",
      actorName: "Respuesta rechazada",
      targets: [{ id: owner.id, name: owner.name, count: 1 }],
      amount: 1,
      reason: "rejected",
      at: Date.now(),
    };
    state.message = `La respuesta de ${owner.name} no fue aceptada.`;
  }
  state.pendingVote = null;
  if (waitingForPenalty) return;
  if (state.status === "finished") return;
  if (state.settings.mode === "classic") {
    nextIndex(state);
  } else {
    const next = state.reviewQueue.shift();
    state.pendingVote = next ? { ...next, votes: {} } : null;
    if (!next) finishSimultaneousRound(state);
  }
}
function acceptPendingLive(state: GameState) {
  if (!state.pendingLive) return false;
  const pending = state.pendingLive;
  const owner = player(state, pending.playerId);
  state.pendingLive = null;
  const waitingForPenalty = applyAccepted(state, pending);
  if (waitingForPenalty) return true;
  if (state.status !== "finished") {
    nextIndex(state);
    state.message = `${owner?.name ?? "La persona"} jugó correctamente. Turno de ${state.players[state.turnIndex]?.name}.`;
  }
  return true;
}
function finalizeExpiredLive(state: GameState) {
  if (!state.pendingLive || Date.now() < state.pendingLive.expiresAt)
    return false;
  return acceptPendingLive(state);
}
function finalizeStartCountdown(state: GameState) {
  if (!state.startCountdownEndsAt || Date.now() < state.startCountdownEndsAt)
    return false;
  state.startCountdownEndsAt = null;
  state.pausedAt = null;
  state.turnStartedAt = Date.now();
  state.message = state.currentCategory
    ? `Turno de ${state.players[state.turnIndex]?.name}.`
    : "Elige la categoría para comenzar.";
  return true;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const roomCode = (url.searchParams.get("code") ?? "").toUpperCase();
  const playerId = url.searchParams.get("playerId") ?? "";
  if (!roomCode) {
    const rows = await getDb()
      .select()
      .from(rooms)
      .orderBy(desc(rooms.updatedAt))
      .limit(30);
    const available = rows.flatMap((row) => {
      try {
        const state = JSON.parse(row.state) as GameState;
        const hostIsPresent = Boolean(
          state.hostLastSeenAt && Date.now() - state.hostLastSeenAt < 35000,
        );
        if (
          state.status !== "lobby" ||
          state.players.length >= 8 ||
          !hostIsPresent
        )
          return [];
        return [
          {
            code: state.code,
            hostName:
              state.players.find((item) => item.id === state.hostId)?.name ??
              "Anfitrión",
            playerCount: state.players.length,
            maxPlayers: 8,
            mode: state.settings.mode,
            playStyle: state.settings.playStyle,
            turnSeconds: state.settings.turnSeconds,
            updatedAt: row.updatedAt,
          },
        ];
      } catch {
        return [];
      }
    });
    return Response.json({ rooms: available });
  }
  const state = await load(roomCode);
  if (!state)
    return Response.json({ error: "Sala no encontrada" }, { status: 404 });
  let changed = finalizeStartCountdown(state);
  changed = finalizeExpiredLive(state) || changed;
  if (
    playerId === state.hostId &&
    (!state.hostLastSeenAt || Date.now() - state.hostLastSeenAt > 10000)
  ) {
    state.hostLastSeenAt = Date.now();
    changed = true;
  }
  if (changed) await save(state);
  return Response.json({ state: publicState(state, playerId) });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    if (action === "create") {
      const roomCode = code();
      const playerId = id();
      const deck = makeDeck();
      const host: Player = {
        id: playerId,
        name: String(body.name ?? "Anfitrión")
          .trim()
          .slice(0, 24),
        hand: [],
        wins: 0,
      };
      const custom = Array.isArray(body.categories)
        ? (body.categories as {
            easy: string;
            medium: string;
            expert: string;
          }[])
        : undefined;
      const roomCategories = shuffle(categories(custom));
      const state: GameState = {
        code: roomCode,
        hostId: playerId,
        hostLastSeenAt: Date.now(),
        status: "lobby",
        settings: {
          mode: body.mode === "simultaneous" ? "simultaneous" : "classic",
          playStyle: body.playStyle === "live" ? "live" : "online",
          turnSeconds: Math.max(
            5,
            Math.min(120, Number(body.turnSeconds) || 20),
          ),
          startDelaySeconds: Math.max(
            3,
            Math.min(10, Number(body.startDelaySeconds) || 5),
          ),
          difficulty: "mixed",
        },
        players: [host],
        spectators: [],
        deck,
        discard: [],
        categories: roomCategories,
        categoryIndex: 0,
        categoryOptions: null,
        currentCategory: null,
        categoryChooserId: null,
        categoryOwnerId: null,
        selectedCategory: {
          level: "easy",
          text: roomCategories[0]?.easy ?? "Categoría",
        },
        turnIndex: 0,
        direction: 1,
        turnStartedAt: 0,
        pendingVote: null,
        pendingLive: null,
        pendingPenalty: null,
        lastPlay: null,
        centerPile: [],
        roundNumber: 0,
        turnsInRound: 0,
        pileSettledAt: null,
        drawEvents: [],
        lastEvent: null,
        submissions: {},
        reviewQueue: [],
        simultaneousRoundAccepted: false,
        acceptedWords: [],
        message: "Sala creada. Comparte el código.",
        winnerId: null,
        pausedAt: null,
        startCountdownEndsAt: null,
      };
      await getDb()
        .insert(rooms)
        .values({
          code: roomCode,
          state: JSON.stringify(state),
          updatedAt: new Date().toISOString(),
        });
      return Response.json(
        { code: roomCode, playerId, state: publicState(state, playerId) },
        { status: 201 },
      );
    }
    const roomCode = String(body.code ?? "").toUpperCase();
    const state = await load(roomCode);
    if (!state)
      return Response.json({ error: "Sala no encontrada" }, { status: 404 });
    if (action === "join") {
      const spectator = Boolean(body.spectator);
      const newId = id();
      const name = String(body.name ?? (spectator ? "Mesa" : "Jugador"))
        .trim()
        .slice(0, 24);
      if (state.status === "closed" || state.status === "finished")
        return Response.json(
          { error: "Esta partida ya terminó. Crea o elige una sala nueva." },
          { status: 410 },
        );
      if (!spectator && state.players.length >= 8)
        return Response.json(
          { error: "La sala ya tiene 8 jugadores" },
          { status: 409 },
        );
      if (state.status !== "lobby" && !spectator)
        return Response.json(
          { error: "La partida ya comenzó" },
          { status: 409 },
        );
      if (spectator) state.spectators.push({ id: newId, name });
      else state.players.push({ id: newId, name, hand: [], wins: 0 });
      await save(state);
      return Response.json({
        code: roomCode,
        playerId: newId,
        state: publicState(state, newId),
      });
    }
    const playerId = String(body.playerId ?? "");
    const actor = player(state, playerId);
    if (!actor && action !== "timeout")
      return Response.json({ error: "Jugador no reconocido" }, { status: 403 });
    if (action === "leave") {
      const leavingIndex = state.players.findIndex(
        (item) => item.id === playerId,
      );
      if (leavingIndex < 0)
        return Response.json(
          { error: "Jugador no reconocido" },
          { status: 403 },
        );
      const leaving = state.players[leavingIndex];
      state.players.splice(leavingIndex, 1);
      state.spectators = state.spectators.filter(
        (item) => item.id !== playerId,
      );
      if (state.pendingLive?.playerId === playerId) state.pendingLive = null;
      if (state.pendingVote?.playerId === playerId) state.pendingVote = null;
      else if (state.pendingVote) delete state.pendingVote.votes[playerId];
      if (state.pendingPenalty?.playerId === playerId)
        state.pendingPenalty = null;
      delete state.submissions[playerId];
      if (state.players.length) {
        if (leavingIndex < state.turnIndex) state.turnIndex--;
        state.turnIndex = Math.min(state.turnIndex, state.players.length - 1);
        state.turnStartedAt = Date.now();
        state.message = `${leaving.name} salió de la sala. Turno de ${state.players[state.turnIndex].name}.`;
      } else {
        state.status = "closed";
        state.message = "La sala quedó vacía.";
      }
    } else if (action === "shuffleCategories") {
      if (playerId !== state.hostId || state.status !== "lobby")
        return Response.json(
          { error: "Solo el anfitrión puede mezclar antes de comenzar" },
          { status: 403 },
        );
      state.categories = shuffle(state.categories);
      state.categoryIndex = 0;
      const randomCard =
        state.categories[Math.floor(Math.random() * state.categories.length)];
      const levels = ["easy", "medium", "expert"] as const;
      const randomLevel = levels[Math.floor(Math.random() * levels.length)];
      state.selectedCategory = {
        level: randomLevel,
        text: randomCard[randomLevel],
      };
      state.message = `Categoría seleccionada: ${randomCard[randomLevel]}.`;
    } else if (action === "selectCategory") {
      if (playerId !== state.hostId || state.status !== "lobby")
        return Response.json(
          {
            error:
              "Solo el anfitrión puede seleccionar categorías antes de comenzar",
          },
          { status: 403 },
        );
      const selectedIndex = Math.max(
        0,
        Math.min(state.categories.length - 1, Number(body.index) || 0),
      );
      const level = ["easy", "medium", "expert"].includes(String(body.level))
        ? (String(body.level) as "easy" | "medium" | "expert")
        : "easy";
      const selectedCard = state.categories[selectedIndex];
      if (selectedCard)
        state.selectedCategory = { level, text: selectedCard[level] };
      state.categoryIndex = 0;
      state.message = `Categoría seleccionada: ${selectedCard?.[level] ?? "categoría"}.`;
    } else if (action === "shuffleStarter") {
      if (playerId !== state.hostId || state.status !== "lobby")
        return Response.json(
          { error: "Solo el anfitrión puede elegir quién inicia" },
          { status: 403 },
        );
      state.turnIndex = Math.floor(Math.random() * state.players.length);
      state.message = `${state.players[state.turnIndex].name} iniciará la partida.`;
    } else if (action === "close") {
      if (playerId !== state.hostId)
        return Response.json(
          { error: "Solo el anfitrión puede cerrar la sala" },
          { status: 403 },
        );
      state.status = "closed";
      state.pausedAt = null;
      state.startCountdownEndsAt = null;
      state.message = "El anfitrión cerró la partida.";
    } else if (action === "togglePause") {
      if (playerId !== state.hostId)
        return Response.json(
          { error: "Solo el anfitrión puede pausar" },
          { status: 403 },
        );
      if (state.status !== "playing")
        return Response.json(
          { error: "La partida todavía no comenzó" },
          { status: 409 },
        );
      if (state.startCountdownEndsAt)
        return Response.json(
          { error: "La preparación inicial todavía está en curso" },
          { status: 409 },
        );
      if (state.pausedAt) {
        if (state.turnStartedAt)
          state.turnStartedAt += Date.now() - state.pausedAt;
        state.pausedAt = null;
        state.message = "La partida continúa.";
      } else {
        state.pausedAt = Date.now();
        state.message = "Partida en pausa.";
      }
    } else if (action === "setPlayStyle") {
      if (playerId !== state.hostId)
        return Response.json(
          { error: "Solo el anfitrión puede cambiar el formato" },
          { status: 403 },
        );
      if (state.status !== "playing" || !state.pausedAt)
        return Response.json(
          { error: "Pausa la partida antes de cambiar el formato" },
          { status: 409 },
        );
      const hasPendingAction = Boolean(
        state.pendingVote ||
          state.pendingLive ||
          state.pendingPenalty ||
          state.categoryOptions ||
          Object.keys(state.submissions).length ||
          state.reviewQueue.length,
      );
      if (hasPendingAction)
        return Response.json(
          { error: "Resuelve la jugada pendiente antes de cambiar el formato" },
          { status: 409 },
        );
      const nextPlayStyle = String(body.playStyle);
      if (nextPlayStyle !== "online" && nextPlayStyle !== "live")
        return Response.json(
          { error: "Formato de partida no válido" },
          { status: 400 },
        );
      state.settings.playStyle = nextPlayStyle;
      state.message = `El anfitrión cambió la partida a ${nextPlayStyle === "online" ? "En línea" : "En vivo"}.`;
    } else if (action === "setMode") {
      if (playerId !== state.hostId)
        return Response.json(
          { error: "Solo el anfitrión puede cambiar el ritmo" },
          { status: 403 },
        );
      if (state.status !== "playing" || !state.pausedAt)
        return Response.json(
          { error: "Pausa la partida antes de cambiar el ritmo" },
          { status: 409 },
        );
      const hasPendingAction = Boolean(
        state.pendingVote ||
          state.pendingLive ||
          state.pendingPenalty ||
          state.categoryOptions ||
          Object.keys(state.submissions).length ||
          state.reviewQueue.length,
      );
      if (hasPendingAction)
        return Response.json(
          { error: "Resuelve la jugada pendiente antes de cambiar el ritmo" },
          { status: 409 },
        );
      const nextMode = String(body.mode);
      if (nextMode !== "classic" && nextMode !== "simultaneous")
        return Response.json(
          { error: "Ritmo de juego no válido" },
          { status: 400 },
        );
      state.settings.mode = nextMode;
      state.submissions = {};
      state.reviewQueue = [];
      state.simultaneousRoundAccepted = false;
      state.message = `El anfitrión cambió la partida a ${nextMode === "classic" ? "Por turnos" : "Simultáneo"}.`;
    } else if (action === "start") {
      if (playerId !== state.hostId)
        return Response.json(
          { error: "Solo el anfitrión puede iniciar" },
          { status: 403 },
        );
      if (state.players.length < 2)
        return Response.json(
          { error: "Se necesitan al menos 2 jugadores" },
          { status: 409 },
        );
      for (const item of state.players) draw(state, item, 8);
      state.status = "playing";
      const startedAt = Date.now();
      state.pausedAt = startedAt;
      state.startCountdownEndsAt =
        startedAt + (state.settings.startDelaySeconds || 5) * 1000;
      if (state.selectedCategory) {
        state.currentCategory = state.selectedCategory;
        state.categoryOwnerId = state.hostId;
        state.categoryOptions = null;
        state.turnStartedAt = startedAt;
        state.message = "Preparando las manos…";
      } else {
        chooseCategory(state);
        state.message = `${state.players[state.turnIndex].name} elige una de las tres categorías.`;
      }
    } else if (action === "chooseCategory") {
      const chooser =
        state.categoryChooserId ??
        (state.settings.mode === "classic"
          ? state.players[state.turnIndex]?.id
          : state.categoryOwnerId ?? state.hostId);
      if (state.pausedAt)
        return Response.json(
          { error: "La partida está en pausa" },
          { status: 409 },
        );
      if (playerId !== chooser)
        return Response.json(
          { error: "Otro jugador debe elegir la categoría" },
          { status: 403 },
        );
      const level = ["easy", "medium", "expert"].includes(String(body.level))
        ? (String(body.level) as "easy" | "medium" | "expert")
        : "easy";
      const options = state.categoryOptions;
      if (!options)
        return Response.json(
          { error: "No hay categorías por elegir" },
          { status: 409 },
        );
      state.currentCategory = { level, text: options[level] };
      state.categoryOptions = null;
      state.categoryOwnerId = playerId;
      const chosenAfterSpecial = Boolean(state.categoryChooserId);
      if (chosenAfterSpecial) {
        const categoryActor = player(state, playerId);
        state.lastEvent = {
          kind: "category",
          actorId: playerId,
          actorName: categoryActor?.name ?? "Un jugador",
          targets: [],
          label: options[level],
          global: true,
          at: Date.now(),
        };
      }
      state.categoryChooserId = null;
      if (chosenAfterSpecial && state.settings.mode === "classic")
        nextIndex(state);
      else state.turnStartedAt = Date.now();
      state.message =
        state.settings.mode === "classic"
          ? `Turno de ${state.players[state.turnIndex].name}.`
          : "Todos pueden responder.";
    } else if (action === "play") {
      if (state.status !== "playing")
        return Response.json(
          { error: "La partida no está activa" },
          { status: 409 },
        );
      if (state.pausedAt)
        return Response.json(
          { error: "La partida está en pausa" },
          { status: 409 },
        );
      if (state.pendingLive || state.pendingVote || state.pendingPenalty)
        return Response.json(
          { error: "Primero hay que resolver la jugada anterior" },
          { status: 409 },
        );
      if (!state.currentCategory)
        return Response.json(
          { error: "Primero deben elegir una categoría" },
          { status: 409 },
        );
      const cardId = String(body.cardId ?? "");
      const card = cardFrom(actor!.hand, cardId);
      if (!card)
        return Response.json({ error: "Carta no disponible" }, { status: 409 });
      if (
        state.settings.mode === "classic" &&
        state.players[state.turnIndex]?.id !== playerId
      )
        return Response.json({ error: "No es tu turno" }, { status: 409 });
      state.lastPlay = {
        playerId,
        playerName: actor!.name,
        label: card.label,
        kind: card.kind,
        at: Date.now(),
      };
      if (["letter", "joker"].includes(card.kind)) {
        const answer = String(body.answer ?? "").trim();
        const oralResponse =
          state.settings.playStyle === "live" &&
          (!answer || answer === "Respuesta oral");
        if (state.settings.playStyle === "online" && !answer)
          return Response.json(
            { error: "Escribe una respuesta" },
            { status: 400 },
          );
        if (
          answer &&
          !oralResponse &&
          (!startsWith(answer, card) ||
            state.acceptedWords.includes(normalized(answer)))
        )
          return Response.json(
            { error: "La respuesta no coincide con la letra o ya fue usada" },
            { status: 409 },
          );
        const submission = {
          playerId,
          cardId,
          answer: answer || "Respuesta oral",
        };
        if (state.settings.mode === "simultaneous") {
          state.submissions[playerId] = submission;
          if (Object.keys(state.submissions).length === state.players.length)
            beginSimultaneousReview(state);
          else
            state.message = `${Object.keys(state.submissions).length} de ${state.players.length} respuestas listas.`;
        } else if (state.settings.playStyle === "live") {
          state.pendingLive = {
            ...submission,
            expiresAt: Date.now() + 4500,
            passes: [],
          };
          state.message = `${actor!.name} jugó la ${card.label}. Se puede impugnar durante 4 segundos.`;
        } else {
          state.pendingVote = { ...submission, votes: {} };
          state.message = `Respuesta de ${actor!.name}: “${answer}”`;
        }
      } else {
        actor!.hand = actor!.hand.filter((item) => item.id !== card.id);
        state.discard.push(card);
        recordCenterPlay(state, actor!, card);
        if (card.kind === "stop") {
          const blockedIndex =
            (state.turnIndex + state.direction + state.players.length) %
            state.players.length;
          const blocked = state.players[blockedIndex];
          nextIndex(state, 2);
          state.lastEvent = {
            kind: "block",
            actorId: actor!.id,
            actorName: actor!.name,
            targets: blocked ? [{ id: blocked.id, name: blocked.name }] : [],
            at: Date.now(),
          };
          state.message = `[BLOCK] ${actor!.name} bloqueó el turno de ${blocked?.name ?? "otro jugador"}.`;
        } else if (card.kind === "reverse") {
          state.direction = state.direction === 1 ? -1 : 1;
          nextIndex(state);
          state.lastEvent = {
            kind: "reverse",
            actorId: actor!.id,
            actorName: actor!.name,
            targets: [],
            global: true,
            at: Date.now(),
          };
          state.message = `${actor!.name} cambió el sentido de juego.`;
        } else if (card.kind === "category") {
          if (actor!.hand.length === 0) {
            draw(state, actor!, 1);
            state.message = "No se puede terminar con cambio de categoría.";
          }
          chooseCategory(state);
          state.categoryChooserId = actor!.id;
          if (state.settings.mode === "simultaneous") {
            state.submissions = {};
            state.reviewQueue = [];
            state.simultaneousRoundAccepted = false;
          }
          state.message = `${actor!.name} elige la nueva categoría.`;
        } else if (card.kind === "swap") {
          const target =
            state.players.find((item) => item.id === String(body.targetId)) ??
            state.players.find((item) => item.id !== playerId);
          if (target) {
            const whole = body.swapType !== "one";
            if (whole) {
              [actor!.hand, target.hand] = [target.hand, actor!.hand];
            } else {
              const own = actor!.hand[0],
                other = target.hand[0];
              if (own && other) {
                actor!.hand[0] = other;
                target.hand[0] = own;
              }
            }
            state.message = `${actor!.name} intercambió ${whole ? "su mano" : "una carta"} con ${target.name}.`;
            state.lastEvent = {
              kind: "swap",
              actorId: actor!.id,
              actorName: actor!.name,
              targets: [{ id: target.id, name: target.name }],
              label: whole ? "su mano" : "una carta",
              at: Date.now(),
            };
          }
          nextIndex(state);
        }
      }
    } else if (action === "allocatePenalty") {
      const pending = state.pendingPenalty;
      if (!pending)
        return Response.json(
          { error: "No hay una sanción por repartir" },
          { status: 409 },
        );
      if (pending.playerId !== playerId)
        return Response.json(
          { error: "Otro jugador debe repartir la sanción" },
          { status: 403 },
        );
      const raw =
        body.allocations && typeof body.allocations === "object"
          ? (body.allocations as Record<string, unknown>)
          : {};
      const allocations = Object.entries(raw).flatMap(([targetId, count]) => {
        const amount = Number(count);
        const target = state.players.find(
          (item) => item.id === targetId && item.id !== playerId,
        );
        return target && Number.isInteger(amount) && amount > 0
          ? [{ target, amount }]
          : [];
      });
      const total = allocations.reduce((sum, item) => sum + item.amount, 0);
      if (total !== pending.total)
        return Response.json(
          { error: `Debes repartir exactamente ${pending.total} ${pending.total === 1 ? "carta" : "cartas"}` },
          { status: 400 },
        );
      const at = Date.now();
      const events = allocations.map(({ target, amount }, index) => {
        draw(state, target, amount);
        return { playerId: target.id, count: amount, at: at + index };
      });
      state.drawEvents = events;
      state.lastDraw = events[events.length - 1] ?? null;
      const owner = player(state, pending.playerId);
      const summary = allocations
        .map(({ target, amount }) => `${target.name} +${amount}`)
        .join(" · ");
      state.lastEvent = {
        kind: "penalty",
        actorId: owner?.id ?? playerId,
        actorName: owner?.name ?? "Un jugador",
        targets: allocations.map(({ target, amount }) => ({
          id: target.id,
          name: target.name,
          count: amount,
        })),
        amount: pending.total,
        at,
      };
      state.pendingPenalty = null;
      if (pending.finishAfter && owner) {
        declareWinner(state, owner);
      } else if (pending.continuation === "classic") {
        nextIndex(state);
        state.message = `${summary}. Turno de ${state.players[state.turnIndex]?.name}.`;
      } else {
        const next = state.reviewQueue.shift();
        state.pendingVote = next ? { ...next, votes: {} } : null;
        if (!next) finishSimultaneousRound(state);
        else state.message = `${summary}. Continúa la revisión.`;
      }
    } else if (action === "challengeLive") {
      if (!state.pendingLive)
        return Response.json(
          { error: "Ya terminó el tiempo para impugnar" },
          { status: 409 },
        );
      if (state.pendingLive.playerId === playerId)
        return Response.json(
          { error: "No puedes impugnar tu propia respuesta" },
          { status: 403 },
        );
      if (state.pendingLive.passes?.includes(playerId))
        return Response.json(
          { error: "Ya aceptaste esta respuesta" },
          { status: 409 },
        );
      state.pendingVote = { ...state.pendingLive, votes: {} };
      state.pendingLive = null;
      state.message = "Respuesta impugnada: el grupo debe votar.";
    } else if (action === "passChallenge") {
      if (!state.pendingLive)
        return Response.json(
          { error: "Ya terminó el tiempo para decidir" },
          { status: 409 },
        );
      if (state.pendingLive.playerId === playerId)
        return Response.json(
          { error: "No aplica a tu propia respuesta" },
          { status: 403 },
        );
      state.pendingLive.passes ??= [];
      if (!state.pendingLive.passes.includes(playerId))
        state.pendingLive.passes.push(playerId);
      if (state.pendingLive.passes.length >= state.players.length - 1)
        acceptPendingLive(state);
      else
        state.message = `${actor?.name ?? "Un jugador"} aceptó la respuesta.`;
    } else if (action === "finalizeLive") {
      finalizeExpiredLive(state);
    } else if (action === "vote") {
      if (!state.pendingVote)
        return Response.json(
          { error: "No hay una votación activa" },
          { status: 409 },
        );
      if (state.pendingVote.playerId === playerId)
        return Response.json(
          { error: "No puedes votar tu propia respuesta" },
          { status: 403 },
        );
      state.pendingVote.votes[playerId] = Boolean(body.approve);
      const eligible = state.players.length - 1;
      const votes = Object.values(state.pendingVote.votes);
      const yes = votes.filter(Boolean).length;
      const no = votes.length - yes;
      if (votes.length >= eligible) resolveVote(state, yes > no);
    } else if (action === "passAndDraw") {
      if (state.settings.mode !== "classic")
        return Response.json(
          { error: "Paso y robo solo está disponible por turnos" },
          { status: 409 },
        );
      if (
        state.status !== "playing" ||
        state.pausedAt ||
        state.pendingLive ||
        state.pendingVote ||
        state.pendingPenalty ||
        !state.currentCategory
      )
        return Response.json(
          { error: "No se puede pasar en este momento" },
          { status: 409 },
        );
      if (state.players[state.turnIndex]?.id !== playerId)
        return Response.json({ error: "No es tu turno" }, { status: 403 });
      drawWithEvent(state, actor!, 1);
      const passingName = actor!.name;
      state.lastEvent = {
        kind: "draw",
        actorId: actor!.id,
        actorName: actor!.name,
        targets: [{ id: actor!.id, name: actor!.name, count: 1 }],
        amount: 1,
        reason: "pass",
        at: Date.now(),
      };
      nextIndex(state);
      state.message = `${passingName} pasó y robó una carta. Turno de ${state.players[state.turnIndex]?.name}.`;
    } else if (action === "timeout") {
      if (
        state.pausedAt ||
        state.pendingLive ||
        state.pendingPenalty ||
        !state.currentCategory ||
        !state.turnStartedAt ||
        Date.now() - state.turnStartedAt < state.settings.turnSeconds * 1000
      )
        return Response.json({ state: publicState(state, playerId) });
      if (state.settings.mode === "classic" && !state.pendingVote) {
        const current = state.players[state.turnIndex];
        drawWithEvent(state, current, 1);
        state.lastEvent = {
          kind: "draw",
          actorId: "system",
          actorName: "Tiempo agotado",
          targets: [{ id: current.id, name: current.name, count: 1 }],
          amount: 1,
          reason: "timeout",
          at: Date.now(),
        };
        state.message = `Se acabó el tiempo. ${current.name} roba una carta.`;
        nextIndex(state);
      } else if (state.settings.mode === "simultaneous" && !state.pendingVote) {
        const at = Date.now();
        const events = state.players.flatMap((item, index) => {
          if (state.submissions[item.id]) return [];
          draw(state, item, 1);
          return [{ playerId: item.id, count: 1, at: at + index }];
        });
        state.drawEvents = events;
        state.lastDraw = events[events.length - 1] ?? null;
        if (events.length) {
          state.lastEvent = {
            kind: "draw",
            actorId: "system",
            actorName: "Tiempo agotado",
            targets: events.map((event) => ({
              id: event.playerId,
              name: state.players.find((item) => item.id === event.playerId)?.name ?? "Jugador",
              count: event.count,
            })),
            amount: 1,
            reason: "timeout",
            at,
          };
        }
        beginSimultaneousReview(state);
      }
    } else
      return Response.json({ error: "Acción desconocida" }, { status: 400 });
    await save(state);
    return Response.json({ state: publicState(state, playerId) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 500 },
    );
  }
}
