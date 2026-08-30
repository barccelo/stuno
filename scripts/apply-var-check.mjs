import { readFile, writeFile } from "node:fs/promises";

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`No se encontró el bloque esperado para: ${label}`);
  return source.replace(from, to);
}

function replaceSection(source, startMarker, endMarker, replacement, label) {
  if (source.includes("/* VAR CHECK v1 */") && replacement.includes("/* VAR CHECK v1 */")) return source;
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`No se encontró la sección esperada para: ${label}`);
  return source.slice(0, start) + replacement + source.slice(end);
}

// ---------- Shared game types ----------
let game = await readFile("lib/game.ts", "utf8");
if (!game.includes("export type PendingVarCheck =")) {
  const anchor = "export type GameState = {";
  if (!game.includes(anchor)) throw new Error("No se encontró GameState para VAR CHECK.");
  game = game.replace(
    anchor,
    [
      "export type PendingVarCheck = {",
      "  submission: Submission;",
      "  playerId: string;",
      "  expiresAt: number;",
      "  requested: boolean;",
      "  hostInitiated?: boolean;",
      "};",
      "",
      anchor,
    ].join("\n"),
  );
}
if (!game.includes("pendingVarCheck?: PendingVarCheck | null;")) {
  game = replaceRequired(
    game,
    "  pendingPenalty?: PendingPenalty | null;\n",
    "  pendingPenalty?: PendingPenalty | null;\n  pendingVarCheck?: PendingVarCheck | null;\n  varChecks?: Record<string, number>;\n",
    "estado VAR CHECK",
  );
}
await writeFile("lib/game.ts", game, "utf8");

// ---------- Server game flow ----------
let route = await readFile("app/api/rooms/route.ts", "utf8");

const varVoteFlow = [
  "/* VAR CHECK v1 */",
  "function advanceAfterReviewedSubmission(state: GameState) {",
  "  if (state.status === \"finished\") return;",
  "  if (state.settings.mode === \"classic\") {",
  "    nextIndex(state);",
  "  } else {",
  "    const next = state.reviewQueue.shift();",
  "    state.pendingVote = next ? { ...next, votes: {} } : null;",
  "    if (!next) finishSimultaneousRound(state);",
  "  }",
  "}",
  "function applyRejectedSubmission(state: GameState, pending: Submission) {",
  "  const owner = player(state, pending.playerId);",
  "  if (!owner) return;",
  "  // A rejected COMBO loses the COMBO card but keeps its letters.",
  "  const rejectedCard = cardFrom(owner.hand, pending.cardId);",
  "  if (rejectedCard?.kind === \"combo\") {",
  "    owner.hand = owner.hand.filter((item) => item.id !== rejectedCard.id);",
  "    state.deck = shuffle([...state.deck, rejectedCard]);",
  "    state.lastEvent = {",
  "      kind: \"combo\",",
  "      actorId: owner.id,",
  "      actorName: owner.name,",
  "      targets: [],",
  "      label: \"rechazado\",",
  "      global: true,",
  "      at: Date.now(),",
  "    };",
  "    state.message = \"El COMBO de \" + owner.name + \" fue rechazado y volvió al mazo.\";",
  "    return;",
  "  }",
  "  drawWithEvent(state, owner, 1);",
  "  state.lastEvent = {",
  "    kind: \"draw\",",
  "    actorId: \"system\",",
  "    actorName: \"Respuesta rechazada\",",
  "    targets: [{ id: owner.id, name: owner.name, count: 1 }],",
  "    amount: 1,",
  "    reason: \"rejected\",",
  "    at: Date.now(),",
  "  };",
  "  state.message = \"La respuesta de \" + owner.name + \" no fue aceptada.\";",
  "}",
  "function finishVarDecision(state: GameState, submission: Submission, approved: boolean) {",
  "  let waitingForPenalty = false;",
  "  state.pendingVarCheck = null;",
  "  state.pendingVote = null;",
  "  if (approved) {",
  "    if (state.settings.mode === \"simultaneous\") state.simultaneousRoundAccepted = true;",
  "    waitingForPenalty = applyAccepted(state, submission);",
  "  } else {",
  "    applyRejectedSubmission(state, submission);",
  "  }",
  "  if (waitingForPenalty || state.status === \"finished\") return;",
  "  advanceAfterReviewedSubmission(state);",
  "}",
  "function resolveVote(state: GameState, approved: boolean) {",
  "  const pending = state.pendingVote;",
  "  if (!pending) return;",
  "  if (approved) {",
  "    finishVarDecision(state, pending, true);",
  "    return;",
  "  }",
  "  const owner = player(state, pending.playerId);",
  "  state.pendingVote = null;",
  "  if (!owner) {",
  "    advanceAfterReviewedSubmission(state);",
  "    return;",
  "  }",
  "  state.varChecks ??= {};",
  "  const remaining = state.varChecks[owner.id] ?? 2;",
  "  if (remaining <= 0) {",
  "    finishVarDecision(state, pending, false);",
  "    return;",
  "  }",
  "  state.pendingVarCheck = {",
  "    submission: pending,",
  "    playerId: owner.id,",
  "    expiresAt: Date.now() + 2500,",
  "    requested: false,",
  "  };",
  "  state.message = owner.name + \" puede pedir VAR antes de confirmar la invalidación.\";",
  "}",
  "function finalizeExpiredVarCheck(state: GameState) {",
  "  const pending = state.pendingVarCheck;",
  "  if (!pending || pending.requested || Date.now() < pending.expiresAt) return false;",
  "  finishVarDecision(state, pending.submission, false);",
  "  return true;",
  "}",
  "",
].join("\n");

route = replaceSection(
  route,
  "function resolveVote(state: GameState, approved: boolean) {",
  "function finalizeExpiredVote",
  varVoteFlow,
  "flujo de votación con VAR",
);

if (!route.includes("pendingVarCheck: null,")) {
  route = replaceRequired(
    route,
    "        pendingPenalty: null,\n",
    "        pendingPenalty: null,\n        pendingVarCheck: null,\n        varChecks: {},\n",
    "inicialización de VAR",
  );
}

if (!route.includes("changed = finalizeExpiredVarCheck(state) || changed;")) {
  route = replaceRequired(
    route,
    "  changed = finalizeExpiredLive(state) || changed;\n",
    "  changed = finalizeExpiredLive(state) || changed;\n  changed = finalizeExpiredVarCheck(state) || changed;\n",
    "expiración automática de VAR",
  );
}

if (!route.includes('action === "requestVarCheck"')) {
  const anchor = '    } else if (action === "play") {';
  if (!route.includes(anchor)) throw new Error("No se encontró la acción play para insertar VAR.");
  const actions = [
    '    } else if (action === "requestVarCheck") {',
    '      const pendingVar = state.pendingVarCheck;',
    '      if (!pendingVar || pendingVar.requested || Date.now() >= pendingVar.expiresAt)',
    '        return Response.json({ error: "La ventana de VAR ya terminó" }, { status: 409 });',
    '      if (pendingVar.playerId !== playerId)',
    '        return Response.json({ error: "Sólo puedes impugnar tu propia respuesta" }, { status: 403 });',
    '      state.varChecks ??= {};',
    '      const remaining = state.varChecks[playerId] ?? 2;',
    '      if (remaining <= 0)',
    '        return Response.json({ error: "Ya no te quedan VAR CHECK" }, { status: 409 });',
    '      pendingVar.requested = true;',
    '      pendingVar.hostInitiated = false;',
    '      state.message = (player(state, playerId)?.name ?? "El jugador") + " pidió VAR CHECK.";',
    '    } else if (action === "openVarCheck") {',
    '      const pendingVar = state.pendingVarCheck;',
    '      if (playerId !== state.hostId)',
    '        return Response.json({ error: "Sólo el anfitrión puede abrir esta revisión" }, { status: 403 });',
    '      if (!pendingVar || pendingVar.requested || Date.now() >= pendingVar.expiresAt)',
    '        return Response.json({ error: "La ventana de VAR ya terminó" }, { status: 409 });',
    '      pendingVar.requested = true;',
    '      pendingVar.hostInitiated = true;',
    '      state.message = "El anfitrión abrió una revisión VAR.";',
    '    } else if (action === "resolveVarCheck") {',
    '      const pendingVar = state.pendingVarCheck;',
    '      if (playerId !== state.hostId)',
    '        return Response.json({ error: "Sólo el anfitrión puede resolver el VAR" }, { status: 403 });',
    '      if (!pendingVar?.requested)',
    '        return Response.json({ error: "No hay un VAR en revisión" }, { status: 409 });',
    '      const overturn = Boolean(body.overturn);',
    '      if (!overturn && !pendingVar.hostInitiated) {',
    '        state.varChecks ??= {};',
    '        const remaining = state.varChecks[pendingVar.playerId] ?? 2;',
    '        state.varChecks[pendingVar.playerId] = Math.max(0, remaining - 1);',
    '      }',
    '      const reviewedPlayer = player(state, pendingVar.playerId);',
    '      const reviewedSubmission = pendingVar.submission;',
    '      finishVarDecision(state, reviewedSubmission, overturn);',
    '      if (overturn)',
    '        state.message = "VAR: la respuesta de " + (reviewedPlayer?.name ?? "el jugador") + " era válida.";',
    '      else',
    '        state.message = "VAR: se mantiene la invalidación de " + (reviewedPlayer?.name ?? "la respuesta") + ".";',
    anchor,
  ].join("\n");
  route = route.replace(anchor, actions);
}

if (!route.includes('if (state.pendingVarCheck)\n        return Response.json({ error: "Hay un VAR pendiente" }, { status: 409 });')) {
  route = route.replace(
    '    } else if (action === "play") {\n',
    '    } else if (action === "play") {\n      if (state.pendingVarCheck)\n        return Response.json({ error: "Hay un VAR pendiente" }, { status: 409 });\n',
  );
}

await writeFile("app/api/rooms/route.ts", route, "utf8");

// ---------- Client ----------
let page = await readFile("app/page.tsx", "utf8");
if (!page.includes("pendingVarCheck?:")) {
  page = replaceRequired(
    page,
    "  pendingPenalty?: {\n    playerId: string;\n    total: number;\n    cardLabel: string;\n    continuation: \"classic\" | \"simultaneous\";\n    finishAfter: boolean;\n  } | null;\n",
    "  pendingPenalty?: {\n    playerId: string;\n    total: number;\n    cardLabel: string;\n    continuation: \"classic\" | \"simultaneous\";\n    finishAfter: boolean;\n  } | null;\n  pendingVarCheck?: {\n    submission: { playerId: string; cardId: string; answer: string; matchMode?: \"starts\" | \"contains\"; comboLetterIds?: string[] };\n    playerId: string;\n    expiresAt: number;\n    requested: boolean;\n    hostInitiated?: boolean;\n  } | null;\n  varChecks?: Record<string, number>;\n",
    "tipos de VAR en cliente",
  );
}

if (!page.includes("room.pendingVarCheck ||")) {
  page = replaceRequired(
    page,
    "      room.pendingPenalty ||\n        room.categoryOptions ||",
    "      room.pendingPenalty ||\n        room.pendingVarCheck ||\n        room.categoryOptions ||",
    "bloqueo de cambios durante VAR",
  );
}

if (!page.includes('className={`var-check-shell')) {
  const anchor = "        {room.pendingLive && (";
  if (!page.includes(anchor)) throw new Error("No se encontró pendingLive para insertar interfaz VAR.");
  const ui = [
    '        {room.pendingVarCheck && (() => {',
    '          const varState = room.pendingVarCheck!;',
    '          const varOwner = room.players.find((item) => item.id === varState.playerId);',
    '          const remainingVar = room.varChecks?.[varState.playerId] ?? 2;',
    '          const secondsLeft = Math.max(0, Math.ceil((varState.expiresAt - now) / 1000));',
    '          const isMine = varState.playerId === playerId;',
    '          const isHost = room.hostId === playerId;',
    '          return (',
    '            <section className={`var-check-shell ${varState.requested ? "reviewing" : "window"}`}>',
    '              {!varState.requested ? (',
    '                isMine ? (',
    '                  <div className="var-check-window">',
    '                    <div>',
    '                      <small>RESPUESTA INVALIDADA</small>',
    '                      <strong>VAR CHECK · {remainingVar} disponibles</strong>',
    '                    </div>',
    '                    <span className="var-check-seconds">{secondsLeft}</span>',
    '                    <button onClick={() => act("requestVarCheck")} disabled={busy || remainingVar <= 0}>Impugnar</button>',
    '                  </div>',
    '                ) : isHost ? (',
    '                  <div className="var-check-window host-option">',
    '                    <div><small>RESPUESTA INVALIDADA</small><strong>{varOwner?.name ?? "Jugador"} puede pedir VAR</strong></div>',
    '                    <span className="var-check-seconds">{secondsLeft}</span>',
    '                    <button onClick={() => act("openVarCheck")} disabled={busy}>Revisar</button>',
    '                  </div>',
    '                ) : null',
    '              ) : isHost ? (',
    '                <div className="var-review-panel">',
    '                  <p>VAR CHECK</p>',
    '                  <h2>{varOwner?.name ?? "Jugador"} impugna la decisión</h2>',
    '                  <div className="var-review-facts">',
    '                    <span><small>CATEGORÍA</small><b>{room.currentCategory?.text ?? "—"}</b></span>',
    '                    <span><small>RESPUESTA</small><b>“{varState.submission.answer}”</b></span>',
    '                    <span><small>CARTA</small><b>{room.lastPlay?.kind === "combo" ? "COMBO" : (room.lastPlay?.label ?? "—")}</b></span>',
    '                  </div>',
    '                  <div className="var-review-actions">',
    '                    <button className="reject" onClick={() => act("resolveVarCheck", { overturn: false })} disabled={busy}>Mantener invalidación</button>',
    '                    <button className="approve" onClick={() => act("resolveVarCheck", { overturn: true })} disabled={busy}>Era válida</button>',
    '                  </div>',
    '                  {!varState.hostInitiated && <small>Si mantienes la invalidación, {varOwner?.name ?? "el jugador"} pierde 1 VAR.</small>}',
    '                </div>',
    '              ) : (',
    '                <div className="var-review-waiting"><strong>VAR en revisión</strong><span>El anfitrión está revisando la respuesta de {varOwner?.name ?? "un jugador"}.</span></div>',
    '              )}',
    '            </section>',
    '          );',
    '        })()}',
    anchor,
  ].join("\n");
  page = page.replace(anchor, ui);
}
await writeFile("app/page.tsx", page, "utf8");

// ---------- UI styles ----------
let css = await readFile("app/ui-fixes.css", "utf8");
if (!css.includes("/* VAR CHECK UI v1. */")) {
  css += `

/* VAR CHECK UI v1. */
.var-check-shell {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 14px;
  pointer-events: none;
}
.var-check-window,
.var-review-panel,
.var-review-waiting {
  pointer-events: auto;
  width: min(100%, 520px);
  border-radius: 18px;
  background: #fff;
  border: 1px solid rgba(17, 63, 77, .13);
  box-shadow: 0 16px 44px rgba(5, 28, 36, .22);
}
.var-check-window {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 34px auto;
  align-items: center;
  gap: 10px;
  padding: 12px 13px;
}
.var-check-window > div { min-width: 0; }
.var-check-window small,
.var-review-panel > p {
  display: block;
  margin: 0 0 3px;
  color: #687a83;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: .08em;
}
.var-check-window strong {
  display: block;
  color: #173642;
  font-size: 14px;
  line-height: 1.15;
}
.var-check-seconds {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #eef6f8;
  color: #0b7387;
  font-size: 13px;
  font-weight: 950;
}
.var-check-window button {
  min-height: 36px;
  padding: 0 14px;
  border: 0;
  border-radius: 10px;
  background: #0b94a8;
  color: #fff;
  font-weight: 900;
}
.var-check-window.host-option button { background: #23385f; }
.var-check-shell.reviewing {
  align-items: center;
  background: rgba(10, 24, 31, .28);
  backdrop-filter: blur(2px);
  pointer-events: auto;
}
.var-review-panel {
  padding: 18px;
}
.var-review-panel > p { color: #078ba0; }
.var-review-panel h2 {
  margin: 0 0 14px;
  color: #153541;
  font-size: clamp(20px, 5vw, 27px);
  line-height: 1.06;
}
.var-review-facts {
  display: grid;
  gap: 7px;
  margin-bottom: 14px;
}
.var-review-facts span {
  min-width: 0;
  padding: 9px 11px;
  border-radius: 11px;
  background: #f2f7f8;
}
.var-review-facts small {
  display: block;
  margin-bottom: 2px;
  color: #718087;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: .07em;
}
.var-review-facts b {
  display: block;
  color: #153541;
  font-size: 14px;
  overflow-wrap: anywhere;
}
.var-review-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.var-review-actions button {
  min-height: 44px;
  border: 0;
  border-radius: 11px;
  font-weight: 900;
}
.var-review-actions .reject { background: #edf0f1; color: #5e2929; }
.var-review-actions .approve { background: #168b61; color: #fff; }
.var-review-panel > small {
  display: block;
  margin-top: 9px;
  color: #77848a;
  text-align: center;
  font-size: 10px;
}
.var-review-waiting {
  padding: 16px;
  text-align: center;
}
.var-review-waiting strong,
.var-review-waiting span { display: block; }
.var-review-waiting strong { color: #0b8296; font-size: 17px; }
.var-review-waiting span { margin-top: 4px; color: #586c74; font-size: 12px; }
@media (max-width: 560px) {
  .var-check-shell { padding: 9px; }
  .var-check-window { grid-template-columns: minmax(0, 1fr) 30px auto; gap: 7px; padding: 10px; border-radius: 15px; }
  .var-check-window button { padding: 0 11px; }
  .var-review-panel { padding: 14px; border-radius: 16px; }
  .var-review-actions { grid-template-columns: 1fr; }
}
`;
}
await writeFile("app/ui-fixes.css", css, "utf8");
