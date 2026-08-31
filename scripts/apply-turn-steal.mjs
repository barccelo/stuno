import { readFile, writeFile } from "node:fs/promises";

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`No se encontró el bloque esperado para: ${label}`);
  return source.replace(from, to);
}

function insertBeforeRequired(source, anchor, addition, marker, label) {
  if (source.includes(marker)) return source;
  if (!source.includes(anchor)) throw new Error(`No se encontró el punto esperado para: ${label}`);
  return source.replace(anchor, addition + anchor);
}

// ---------- Shared state ----------
let game = await readFile("lib/game.ts", "utf8");

if (!game.includes("turnStealEnabled?: boolean;")) {
  game = replaceRequired(
    game,
    '    allowVoiceChat?: boolean;\n    difficulty: "easy" | "medium" | "expert" | "mixed";',
    '    allowVoiceChat?: boolean;\n    turnStealEnabled?: boolean;\n    difficulty: "easy" | "medium" | "expert" | "mixed";',
    "ajuste de robar turno",
  );
}

if (!game.includes("export type ArmedTurnPlay =")) {
  game = insertBeforeRequired(
    game,
    "export type GameState = {",
    [
      "export type ArmedTurnPlay = {",
      "  playerId: string;",
      "  cardId: string;",
      "  key: string;",
      "  label: string;",
      "  kind: CardKind;",
      "  penalty?: number;",
      "  at: number;",
      "  committed?: boolean;",
      "  stolenFromId?: string;",
      "};",
      "",
    ].join("\n"),
    "export type ArmedTurnPlay =",
    "tipo de carta preparada para robar turno",
  );
}

if (!game.includes("armedTurnPlay?: ArmedTurnPlay | null;")) {
  game = replaceRequired(
    game,
    "  pendingSteal?: PendingSteal | null;\n",
    "  pendingSteal?: PendingSteal | null;\n  armedTurnPlay?: ArmedTurnPlay | null;\n",
    "estado de robar turno",
  );
}

if (!game.includes("state.armedTurnPlay = null;\n  const length = state.players.length;")) {
  game = replaceRequired(
    game,
    "export function nextIndex(state: GameState, extra = 1) {\n  const length = state.players.length;",
    "export function nextIndex(state: GameState, extra = 1) {\n  state.armedTurnPlay = null;\n  const length = state.players.length;",
    "cerrar robo de turno al avanzar",
  );
}

if (!game.includes("export function chooseCategory(state: GameState) {\n  state.armedTurnPlay = null;")) {
  game = replaceRequired(
    game,
    "export function chooseCategory(state: GameState) {\n  const current = normalized(state.currentCategory?.text ?? \"\");",
    "export function chooseCategory(state: GameState) {\n  state.armedTurnPlay = null;\n  const current = normalized(state.currentCategory?.text ?? \"\");",
    "cerrar robo de turno al cambiar categoría",
  );
}

await writeFile("lib/game.ts", game, "utf8");

// ---------- Server ----------
let route = await readFile("app/api/rooms/route.ts", "utf8");

const drizzleImport = route.match(/import \{([^}]+)\} from "drizzle-orm";/);
if (!drizzleImport) throw new Error("No se encontró el import de drizzle.");
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

if (!route.includes("/* TURN STEAL v1 */")) {
  const anchor = "export async function POST(request: Request) {";
  const helper = `/* TURN STEAL v1 */
function turnStealCardKey(card: GameCard) {
  return [card.kind, card.label.toLocaleUpperCase("es"), card.penalty ?? 0].join("|");
}
function turnStealResponse(
  state: GameState,
  playerId: string,
  flag: "armed" | "cleared" | "committed" | "stolen",
  value: boolean,
) {
  return Response.json({ state: publicState(state, playerId), [flag]: value });
}
async function applyTurnStealAtomically(
  roomCode: string,
  playerId: string,
  action: "armTurnPlay" | "clearTurnPlay" | "commitTurnPlay" | "stealTurn",
  cardId: string,
) {
  const flag = action === "armTurnPlay"
    ? "armed"
    : action === "clearTurnPlay"
      ? "cleared"
      : action === "commitTurnPlay"
        ? "committed"
        : "stolen";

  for (let attempt = 0; attempt < 7; attempt++) {
    const [row] = await getDb()
      .select({ state: rooms.state })
      .from(rooms)
      .where(eq(rooms.code, roomCode))
      .limit(1);
    if (!row) return Response.json({ error: "Sala no encontrada" }, { status: 404 });

    const state = JSON.parse(row.state) as GameState;
    const actor = player(state, playerId);
    const enabled =
      state.settings.mode === "classic" &&
      state.settings.turnStealEnabled !== false;
    const current = state.players[state.turnIndex];
    const blocked = Boolean(
      state.pausedAt ||
      state.startCountdownEndsAt ||
      state.pendingVote ||
      state.pendingLive ||
      state.pendingPenalty ||
      state.pendingSteal ||
      state.pendingVarCheck ||
      !state.currentCategory,
    );

    if (!enabled || state.status !== "playing" || !actor)
      return turnStealResponse(state, playerId, flag, false);

    let changed = false;
    let success = false;

    if (action === "armTurnPlay") {
      if (blocked || current?.id !== playerId)
        return turnStealResponse(state, playerId, flag, false);
      const card = cardFrom(actor.hand, cardId);
      if (!card) return turnStealResponse(state, playerId, flag, false);
      const existing = state.armedTurnPlay;
      if (
        existing?.playerId === playerId &&
        existing.cardId === card.id &&
        !existing.committed
      )
        return turnStealResponse(state, playerId, flag, true);
      state.armedTurnPlay = {
        playerId,
        cardId: card.id,
        key: turnStealCardKey(card),
        label: card.label,
        kind: card.kind,
        penalty: card.penalty,
        at: Date.now(),
        committed: false,
      };
      changed = true;
      success = true;
    } else if (action === "clearTurnPlay") {
      const existing = state.armedTurnPlay;
      if (!existing || existing.playerId !== playerId || (cardId && existing.cardId !== cardId))
        return turnStealResponse(state, playerId, flag, false);
      state.armedTurnPlay = null;
      changed = true;
      success = true;
    } else if (action === "commitTurnPlay") {
      if (blocked || current?.id !== playerId)
        return turnStealResponse(state, playerId, flag, false);
      const card = cardFrom(actor.hand, cardId);
      if (!card) return turnStealResponse(state, playerId, flag, false);
      const existing = state.armedTurnPlay;
      if (existing?.playerId !== undefined && existing.playerId !== playerId)
        return turnStealResponse(state, playerId, flag, false);
      if (existing?.playerId === playerId && existing.cardId === card.id && existing.committed)
        return turnStealResponse(state, playerId, flag, true);
      state.armedTurnPlay = {
        playerId,
        cardId: card.id,
        key: turnStealCardKey(card),
        label: card.label,
        kind: card.kind,
        penalty: card.penalty,
        at: existing?.at ?? Date.now(),
        committed: true,
        stolenFromId: existing?.stolenFromId,
      };
      changed = true;
      success = true;
    } else {
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

    if (!changed) return turnStealResponse(state, playerId, flag, success);

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
    if (confirmed?.state === nextState)
      return turnStealResponse(state, playerId, flag, success);
  }

  const latest = await load(roomCode);
  if (!latest) return Response.json({ error: "Sala no encontrada" }, { status: 404 });
  return turnStealResponse(latest, playerId, flag, false);
}

`;
  route = insertBeforeRequired(route, anchor, helper, "/* TURN STEAL v1 */", "protección atómica de robar turno");
}

if (!route.includes('if (["armTurnPlay", "clearTurnPlay", "commitTurnPlay", "stealTurn"].includes(action))')) {
  const anchor = '    if (action === "create") {';
  const addition = [
    '    if (["armTurnPlay", "clearTurnPlay", "commitTurnPlay", "stealTurn"].includes(action)) {',
    '      return applyTurnStealAtomically(',
    '        String(body.code ?? "").toUpperCase(),',
    '        String(body.playerId ?? ""),',
    '        action as "armTurnPlay" | "clearTurnPlay" | "commitTurnPlay" | "stealTurn",',
    '        String(body.cardId ?? ""),',
    '      );',
    '    }',
    '',
  ].join("\n");
  route = insertBeforeRequired(route, anchor, addition, 'if (["armTurnPlay", "clearTurnPlay", "commitTurnPlay", "stealTurn"].includes(action))', "despacho de robar turno");
}

if (!route.includes("turnStealEnabled: body.turnStealEnabled !== false,")) {
  route = replaceRequired(
    route,
    '          allowVoiceChat: Boolean(body.allowVoiceChat),\n          difficulty: "mixed",',
    '          allowVoiceChat: Boolean(body.allowVoiceChat),\n          turnStealEnabled: body.turnStealEnabled !== false,\n          difficulty: "mixed",',
    "guardar opción de robar turno",
  );
}

if (!route.includes("armedTurnPlay: null,")) {
  route = replaceRequired(
    route,
    "        pendingSteal: null,\n",
    "        pendingSteal: null,\n        armedTurnPlay: null,\n",
    "inicializar robar turno",
  );
}

if (!route.includes("state.pendingSteal = null;\n      state.armedTurnPlay = null;\n      state.status = \"playing\";")) {
  route = replaceRequired(
    route,
    '      state.pendingSteal = null;\n      state.status = "playing";',
    '      state.pendingSteal = null;\n      state.armedTurnPlay = null;\n      state.status = "playing";',
    "limpiar robar turno al iniciar",
  );
}

const playTurnGuard = [
  '      if (state.settings.mode === "classic" && state.settings.turnStealEnabled !== false) {',
  '        const armed = state.armedTurnPlay;',
  '        if (!armed || armed.playerId !== playerId || armed.cardId !== cardId || !armed.committed)',
  '          return Response.json({ error: "La jugada cambió antes de confirmarse" }, { status: 409 });',
  '        state.armedTurnPlay = null;',
  '      }',
].join("\n");
if (!route.includes(playTurnGuard)) {
  route = replaceRequired(
    route,
    '      if (\n        state.settings.mode === "classic" &&\n        state.players[state.turnIndex]?.id !== playerId\n      )\n        return Response.json({ error: "No es tu turno" }, { status: 409 });\n      state.consecutivePasses = 0;',
    '      if (\n        state.settings.mode === "classic" &&\n        state.players[state.turnIndex]?.id !== playerId\n      )\n        return Response.json({ error: "No es tu turno" }, { status: 409 });\n' + playTurnGuard + '\n      state.consecutivePasses = 0;',
    "confirmar carta preparada antes de jugar",
  );
}

const stealCardGuard = [
  '      if (state.settings.mode === "classic" && state.settings.turnStealEnabled !== false) {',
  '        const armed = state.armedTurnPlay;',
  '        if (!armed || armed.playerId !== playerId || armed.cardId !== stealCard.id || !armed.committed)',
  '          return Response.json({ error: "La jugada cambió antes de confirmar ROBO" }, { status: 409 });',
  '        state.armedTurnPlay = null;',
  '      }',
].join("\n");
if (!route.includes(stealCardGuard)) {
  route = replaceRequired(
    route,
    '      if (!stealTarget.hand.length)\n        return Response.json({ error: "Ese jugador no tiene cartas para robar" }, { status: 409 });\n      actor!.hand = actor!.hand.filter((item) => item.id !== stealCard.id);',
    '      if (!stealTarget.hand.length)\n        return Response.json({ error: "Ese jugador no tiene cartas para robar" }, { status: 409 });\n' + stealCardGuard + '\n      actor!.hand = actor!.hand.filter((item) => item.id !== stealCard.id);',
    "confirmar ROBO preparado antes de fijar objetivo",
  );
}

if (!route.includes("if (state.armedTurnPlay?.playerId === playerId)\n        state.armedTurnPlay = null;")) {
  const anchor = '      if (state.pendingSteal?.actorId === playerId || state.pendingSteal?.targetId === playerId)\n        state.pendingSteal = null;\n';
  if (route.includes(anchor)) {
    route = route.replace(
      anchor,
      anchor + '      if (state.armedTurnPlay?.playerId === playerId)\n        state.armedTurnPlay = null;\n',
    );
  }
}

await writeFile("app/api/rooms/route.ts", route, "utf8");

// ---------- Client ----------
let page = await readFile("app/page.tsx", "utf8");

if (!page.includes("turnStealEnabled?: boolean;")) {
  page = replaceRequired(
    page,
    '    allowVoiceChat?: boolean;\n  };',
    '    allowVoiceChat?: boolean;\n    turnStealEnabled?: boolean;\n  };',
    "tipar opción de robar turno",
  );
}

if (!page.includes("armedTurnPlay?: {")) {
  page = replaceRequired(
    page,
    '  pendingSteal?: { actorId: string; targetId: string; cardId: string; at: number } | null;\n',
    '  pendingSteal?: { actorId: string; targetId: string; cardId: string; at: number } | null;\n  armedTurnPlay?: {\n    playerId: string;\n    cardId: string;\n    key: string;\n    label: string;\n    kind: GameCard["kind"];\n    penalty?: number;\n    at: number;\n    committed?: boolean;\n    stolenFromId?: string;\n  } | null;\n',
    "tipar carta preparada para robar turno",
  );
}

if (!page.includes("const [turnStealEnabled, setTurnStealEnabled] = useState(true);")) {
  page = replaceRequired(
    page,
    '  const [allowVoiceChat, setAllowVoiceChat] = useState(false);\n',
    '  const [allowVoiceChat, setAllowVoiceChat] = useState(false);\n  const [turnStealEnabled, setTurnStealEnabled] = useState(true);\n',
    "estado local de robar turno",
  );
}

if (!page.includes("function turnStealCardKeyClient(card: GameCard)")) {
  const anchor = '  const canPassAndDraw = Boolean(\n    room?.settings.mode === "classic" && canPlay && current?.id === playerId,\n  );\n';
  const addition = [
    anchor.trimEnd(),
    '  function turnStealCardKeyClient(card: GameCard) {',
    '    return [card.kind, card.label.toLocaleUpperCase("es"), card.penalty ?? 0].join("|");',
    '  }',
    '  function isTurnStealReady(card: GameCard) {',
    '    const armed = room?.armedTurnPlay;',
    '    return Boolean(',
    '      room?.settings.mode === "classic" &&',
    '      room.settings.turnStealEnabled !== false &&',
    '      room.status === "playing" &&',
    '      !room.pausedAt &&',
    '      armed &&',
    '      !armed.committed &&',
    '      armed.playerId !== playerId &&',
    '      room.players[room.turnIndex]?.id === armed.playerId &&',
    '      turnStealCardKeyClient(card) === armed.key,',
    '    );',
    '  }',
    '',
  ].join("\n");
  if (!page.includes(anchor)) throw new Error("No se encontró canPassAndDraw para robar turno.");
  page = page.replace(anchor, addition);
}

if (!page.includes("turnStealEnabled,\n      categories: custom,")) {
  page = replaceRequired(
    page,
    '      allowVoiceChat,\n      categories: custom,',
    '      allowVoiceChat,\n      turnStealEnabled,\n      categories: custom,',
    "enviar opción de robar turno",
  );
}

if (!page.includes("async function turnStealRequest(")) {
  const oldAct = [
    '  async function act(action: string, extra: Record<string, unknown> = {}) {',
    '    if (!room) return;',
    '    return request({ action, code: room.code, playerId, ...extra });',
    '  }',
  ].join("\n");
  const replacement = [
    '  async function turnStealRequest(action: string, cardId = "") {',
    '    if (!room) return null;',
    '    try {',
    '      const response = await fetch("/api/rooms", {',
    '        method: "POST",',
    '        headers: { "content-type": "application/json" },',
    '        body: JSON.stringify({ action, code: room.code, playerId, cardId }),',
    '      });',
    '      const data = await response.json();',
    '      if (data.state) applyRoom(data.state);',
    '      return response.ok ? data : null;',
    '    } catch {',
    '      return null;',
    '    }',
    '  }',
    '  async function act(action: string, extra: Record<string, unknown> = {}) {',
    '    if (!room) return;',
    '    const enabled =',
    '      room.settings.mode === "classic" && room.settings.turnStealEnabled !== false;',
    '    const directCardId = typeof extra.cardId === "string" ? extra.cardId : "";',
    '    const ownArmed = room.armedTurnPlay?.playerId === playerId ? room.armedTurnPlay : null;',
    '    const resolvesCard = action === "play" || action === "lockStealTarget";',
    '    const resolvesTurn = action === "passAndDraw" || action === "discardCard" || action === "timeout";',
    '    const claimCardId = enabled',
    '      ? resolvesCard',
    '        ? directCardId',
    '        : resolvesTurn',
    '          ? (directCardId || ownArmed?.cardId || "")',
    '          : ""',
    '      : "";',
    '    if (claimCardId) {',
    '      const claim = await turnStealRequest("commitTurnPlay", claimCardId);',
    '      if (!claim?.committed) return null;',
    '      const result = await request({ action, code: room.code, playerId, ...extra });',
    '      if (!result) await turnStealRequest("clearTurnPlay", claimCardId);',
    '      return result;',
    '    }',
    '    return request({ action, code: room.code, playerId, ...extra });',
    '  }',
    '  async function attemptTurnSteal(card: GameCard) {',
    '    const data = await turnStealRequest("stealTurn", card.id);',
    '    if (!data?.stolen) return;',
    '    setSelected(card.id);',
    '    setAnswer("");',
    '    setMatchMode("starts");',
    '    setSwapCard(null);',
    '    setComboCard(null);',
    '    setComboLetters([]);',
    '    setComboAnswer("");',
    '    setStealCard(null);',
    '    setStealTarget("");',
    '  }',
  ].join("\n");
  page = replaceRequired(page, oldAct, replacement, "solicitudes silenciosas y reclamo atómico");
}

if (!page.includes("if (isTurnStealReady(card)) {")) {
  page = replaceRequired(
    page,
    '    if (suppressClick.current) {\n      event?.preventDefault();\n      return;\n    }\n    if (!canPlay)',
    '    if (suppressClick.current) {\n      event?.preventDefault();\n      return;\n    }\n    if (isTurnStealReady(card)) {\n      void attemptTurnSteal(card);\n      return;\n    }\n    if (!canPlay)',
    "tocar directamente una carta coincidente",
  );
}

if (!page.includes('void turnStealRequest("armTurnPlay", card.id);')) {
  page = replaceRequired(
    page,
    '    setSelected(card.id);\n    event?.currentTarget.scrollIntoView({',
    '    setSelected(card.id);\n    if (\n      room?.settings.mode === "classic" &&\n      room.settings.turnStealEnabled !== false &&\n      current?.id === playerId\n    )\n      void turnStealRequest("armTurnPlay", card.id);\n    event?.currentTarget.scrollIntoView({',
    "preparar silenciosamente la carta seleccionada",
  );
}

if (!page.includes('void turnStealRequest("clearTurnPlay", room.armedTurnPlay.cardId);')) {
  page = replaceRequired(
    page,
    '  function clearCardSelection() {\n    setSelected(null);',
    '  function clearCardSelection() {\n    if (room?.armedTurnPlay?.playerId === playerId)\n      void turnStealRequest("clearTurnPlay", room.armedTurnPlay.cardId);\n    setSelected(null);',
    "limpiar carta preparada al cancelar selección",
  );
}

if (!page.includes('${isTurnStealReady(card) ? "turn-steal-ready" : ""}')) {
  page = replaceRequired(
    page,
    'className={`play-card ${card.kind === "letter" ? "letter" : "action"} ${card.kind} ${cardClass(card)} ${selected === card.id ? "selected" : ""}`}',
    'className={`play-card ${card.kind === "letter" ? "letter" : "action"} ${card.kind} ${cardClass(card)} ${selected === card.id ? "selected" : ""} ${isTurnStealReady(card) ? "turn-steal-ready" : ""}`}',
    "señal visual discreta en carta coincidente",
  );
}

if (!page.includes("<legend>Robar turno</legend>")) {
  const anchor = [
    '                </fieldset>',
    '                <fieldset>',
    '                  <legend>Aviso de turno</legend>',
  ].join("\n");
  const replacement = [
    '                </fieldset>',
    '                {mode === "classic" && (',
    '                  <fieldset>',
    '                    <legend>Robar turno</legend>',
    '                    <label className="voice-option">',
    '                      <span>',
    '                        <b>Permitir robar turno</b>',
    '                        <small>Si tienes exactamente la misma carta que está en juego, puedes tocarla para quedarte con el turno.</small>',
    '                      </span>',
    '                      <input',
    '                        type="checkbox"',
    '                        checked={turnStealEnabled}',
    '                        onChange={(event) => setTurnStealEnabled(event.target.checked)}',
    '                      />',
    '                    </label>',
    '                  </fieldset>',
    '                )}',
    '                <fieldset>',
    '                  <legend>Aviso de turno</legend>',
  ].join("\n");
  page = replaceRequired(page, anchor, replacement, "opción de robar turno al crear sala");
}

await writeFile("app/page.tsx", page, "utf8");

// ---------- Styling ----------
let css = await readFile("app/ui-fixes.css", "utf8");
if (!css.includes("/* Turn steal v1 */")) {
  css += `\n\n/* Turn steal v1 */\n/* Intentionally subtle: the matching card is the only hint. */\n.play-card.turn-steal-ready {\n  outline: 1px solid rgba(255,255,255,.38);\n  outline-offset: 2px;\n  filter: brightness(1.035);\n}\n`;
  await writeFile("app/ui-fixes.css", css, "utf8");
}

const routeCheck = await readFile("app/api/rooms/route.ts", "utf8");
const pageCheck = await readFile("app/page.tsx", "utf8");
const gameCheck = await readFile("lib/game.ts", "utf8");
const required = [
  [routeCheck, "applyTurnStealAtomically("],
  [routeCheck, 'action as "armTurnPlay" | "clearTurnPlay" | "commitTurnPlay" | "stealTurn"'],
  [routeCheck, "turnStealEnabled: body.turnStealEnabled !== false"],
  [routeCheck, "armed.cardId !== cardId || !armed.committed"],
  [pageCheck, "function isTurnStealReady(card: GameCard)"],
  [pageCheck, 'turnStealRequest("stealTurn", card.id)'],
  [pageCheck, "turn-steal-ready"],
  [pageCheck, "<legend>Robar turno</legend>"],
  [gameCheck, "armedTurnPlay?: ArmedTurnPlay | null;"],
];
const missing = required.filter(([source, token]) => !source.includes(token)).map(([, token]) => token);
if (missing.length) throw new Error(`Turn steal incompleto: ${missing.join(", ")}`);

console.log("Turn steal applied: silent exact-match jump-in with atomic turn claim.");
