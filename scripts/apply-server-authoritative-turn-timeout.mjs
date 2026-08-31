import { readFile, writeFile } from "node:fs/promises";

const routePath = "app/api/rooms/route.ts";
let route = await readFile(routePath, "utf8");

// The timer CAS helper needs `and` even if another optional feature stops adding it.
const drizzleImport = route.match(/import \{([^}]+)\} from "drizzle-orm";/);
if (!drizzleImport) throw new Error("No se encontró el import de drizzle para el timeout del servidor.");
const drizzleNames = drizzleImport[1]
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
if (!drizzleNames.includes("and")) {
  route = route.replace(
    drizzleImport[0],
    `import { and, ${drizzleNames.join(", ")} } from "drizzle-orm";`,
  );
}

const helperMarker = "// SERVER AUTHORITATIVE TURN TIMEOUT v1";
if (!route.includes(helperMarker)) {
  const getAnchor = "export async function GET(request: Request) {";
  if (!route.includes(getAnchor))
    throw new Error("No se encontró GET para instalar el timeout autoritativo.");

  const helper = `${helperMarker}
const TURN_NOTICE_GRACE_MS = 3500;

function turnClockIsBlocked(state: GameState) {
  const extended = state as GameState & { pendingVarCheck?: unknown };
  return Boolean(
    state.status !== "playing" ||
      state.pausedAt ||
      state.startCountdownEndsAt ||
      state.pendingVote ||
      state.pendingLive ||
      state.pendingPenalty ||
      extended.pendingVarCheck ||
      state.categoryOptions ||
      !state.currentCategory ||
      !state.turnStartedAt,
  );
}

function finalizeExpiredGameTurns(state: GameState, now = Date.now()) {
  if (turnClockIsBlocked(state)) return false;
  const turnMs = Math.max(1000, state.settings.turnSeconds * 1000);

  if (state.settings.mode === "simultaneous") {
    if (now < state.turnStartedAt + turnMs) return false;
    const at = now;
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
    return true;
  }

  let changed = false;
  // A room may not receive a request for several complete turns while every tab
  // is backgrounded. Preserve the original server timeline and catch up safely.
  for (let guard = 0; guard < 48; guard++) {
    if (turnClockIsBlocked(state) || state.settings.mode !== "classic") break;
    const deadline = state.turnStartedAt + turnMs;
    if (now < deadline) break;
    const current = state.players[state.turnIndex];
    if (!current) break;

    state.consecutivePasses = 0;
    drawWithEvent(state, current, 1);
    state.lastEvent = {
      kind: "draw",
      actorId: "system",
      actorName: "Tiempo agotado",
      targets: [{ id: current.id, name: current.name, count: 1 }],
      amount: 1,
      reason: "timeout",
      at: now,
    };
    const expiredName = current.name;
    nextIndex(state);
    // nextIndex normally starts a fresh notification grace period from Date.now().
    // During catch-up use the actual expired deadline so elapsed unattended turns
    // are not artificially restarted from the moment somebody returns.
    state.turnStartedAt = deadline + TURN_NOTICE_GRACE_MS;
    state.message = `Se acabó el tiempo. ${expiredName} roba una carta. Turno de ${state.players[state.turnIndex]?.name}.`;
    changed = true;
  }
  return changed;
}

async function loadRoomWithServerTimers(roomCode: string) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const [row] = await getDb()
      .select({ state: rooms.state })
      .from(rooms)
      .where(eq(rooms.code, roomCode))
      .limit(1);
    if (!row) return null;

    const state = JSON.parse(row.state) as GameState;
    let changed = finalizeStartCountdown(state);
    changed = finalizeExpiredLive(state) || changed;
    changed = finalizeExpiredVote(state) || changed;
    changed = finalizeExpiredGameTurns(state, Date.now()) || changed;
    if (!changed) return state;

    state.revision = (state.revision ?? 0) + 1;
    state.message = state.message.slice(0, 160);
    const nextState = JSON.stringify(state);
    await getDb()
      .update(rooms)
      .set({ state: nextState, updatedAt: new Date().toISOString() })
      .where(and(eq(rooms.code, roomCode), eq(rooms.state, row.state)));

    const [confirmed] = await getDb()
      .select({ state: rooms.state })
      .from(rooms)
      .where(eq(rooms.code, roomCode))
      .limit(1);
    if (confirmed?.state === nextState) return state;
  }
  return load(roomCode);
}

`;
  route = route.replace(getAnchor, helper + getAnchor);
}

// GET is now the normal server clock authority. Any player's poll can advance an
// expired turn; it no longer depends on the host/current player's active tab.
{
  const getStart = route.indexOf("export async function GET(request: Request) {");
  const postStart = route.indexOf("export async function POST(request: Request) {", getStart);
  if (getStart < 0 || postStart < 0) throw new Error("No se pudo aislar GET para el timeout.");
  const getSection = route.slice(getStart, postStart);
  if (!getSection.includes("const state = await loadRoomWithServerTimers(roomCode);")) {
    const loadPattern = /const state = await load\(roomCode\);/;
    if (!loadPattern.test(getSection))
      throw new Error("No se encontró la carga de sala dentro de GET.");
    const changed = getSection.replace(
      loadPattern,
      "const state = await loadRoomWithServerTimers(roomCode);",
    );
    route = route.slice(0, getStart) + changed + route.slice(postStart);
  }
}

// Keep POST timeout as a fast fallback, but route it through the same atomic
// server-timer path instead of mutating a stale room snapshot.
if (!route.includes("// SERVER TIMEOUT POST FAST PATH v1")) {
  const postStart = route.indexOf("export async function POST(request: Request) {");
  const actionIndex = route.indexOf(
    '    const action = String(body.action ?? "");',
    postStart,
  );
  if (postStart < 0 || actionIndex < 0)
    throw new Error("No se encontró action dentro de POST para el timeout.");
  const insertionPoint = route.indexOf("\n", actionIndex) + 1;
  const fastPath = `    // SERVER TIMEOUT POST FAST PATH v1
    if (action === "timeout") {
      const timedRoomCode = String(body.code ?? "").toUpperCase();
      const timedPlayerId = String(body.playerId ?? "");
      const timedState = await loadRoomWithServerTimers(timedRoomCode);
      if (!timedState)
        return Response.json({ error: "Sala no encontrada" }, { status: 404 });
      return Response.json({ state: publicState(timedState, timedPlayerId) });
    }
`;
  route = route.slice(0, insertionPoint) + fastPath + route.slice(insertionPoint);
}

// Every ordinary POST action also starts from the server-timer-resolved snapshot.
// This prevents a late play/save from restoring a turn that expired concurrently.
{
  const postStart = route.indexOf("export async function POST(request: Request) {");
  if (postStart < 0) throw new Error("No se encontró POST para proteger acciones tardías.");
  const postSection = route.slice(postStart);
  if (!postSection.includes("const state = await loadRoomWithServerTimers(roomCode);")) {
    const loadPattern = /const state = await load\(roomCode\);/;
    if (!loadPattern.test(postSection))
      throw new Error("No se encontró la carga principal de sala dentro de POST.");
    const changed = postSection.replace(
      loadPattern,
      "const state = await loadRoomWithServerTimers(roomCode);",
    );
    route = route.slice(0, postStart) + changed;
  }
}

await writeFile(routePath, route, "utf8");

// Any visible player may provide the immediate timeout request. The server-side
// GET path remains authoritative, so this is only a latency optimization.
const pagePath = "app/page.tsx";
let page = await readFile(pagePath, "utf8");
const timeoutCall = '    void act("timeout");';
const timeoutCallIndex = page.indexOf(timeoutCall);
if (timeoutCallIndex < 0) throw new Error("No se encontró el efecto cliente de timeout.");
const timeoutEffectStart = page.lastIndexOf("  useEffect(() => {", timeoutCallIndex);
const timeoutEffectEnd = page.indexOf("  ]);", timeoutCallIndex);
if (timeoutEffectStart < 0 || timeoutEffectEnd < 0)
  throw new Error("No se pudo aislar el efecto cliente de timeout.");
let timeoutEffect = page.slice(timeoutEffectStart, timeoutEffectEnd + 5);
timeoutEffect = timeoutEffect.replace(/\s*playerId !== room\.hostId \|\|\n/, "\n");
page = page.slice(0, timeoutEffectStart) + timeoutEffect + page.slice(timeoutEffectEnd + 5);
await writeFile(pagePath, page, "utf8");

const routeCheck = await readFile(routePath, "utf8");
const pageCheck = await readFile(pagePath, "utf8");
const checkCall = pageCheck.indexOf(timeoutCall);
const checkStart = pageCheck.lastIndexOf("  useEffect(() => {", checkCall);
const checkEnd = pageCheck.indexOf("  ]);", checkCall);
const checkEffect = pageCheck.slice(checkStart, checkEnd + 5);
const timerLoads = routeCheck.match(/const state = await loadRoomWithServerTimers\(roomCode\);/g) ?? [];
const required = [
  helperMarker,
  "async function loadRoomWithServerTimers(roomCode: string)",
  "finalizeExpiredGameTurns(state, Date.now())",
  "eq(rooms.state, row.state)",
  "// SERVER TIMEOUT POST FAST PATH v1",
];
const missing = required.filter((token) => !routeCheck.includes(token));
if (missing.length)
  throw new Error(`Timeout autoritativo incompleto: ${missing.join(", ")}`);
if (timerLoads.length < 2)
  throw new Error("GET y POST no están cargando la sala mediante el reloj del servidor.");
if (checkEffect.includes("playerId !== room.hostId"))
  throw new Error("El timeout cliente todavía depende exclusivamente del host.");

console.log("Server-authoritative turn timeout applied: any room sync advances expired turns, POST actions see resolved timers, and unattended games catch up safely.");
