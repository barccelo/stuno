import { readFile, writeFile } from "node:fs/promises";

function functionSection(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`No se encontró ${signature}`);
  const next = source.indexOf("\nfunction ", start + signature.length);
  return {
    start,
    end: next >= 0 ? next : source.length,
    text: source.slice(start, next >= 0 ? next : source.length),
  };
}

// ---------- Shared validated turn-steal notice ----------
let game = await readFile("lib/game.ts", "utf8");

if (!game.includes("turnStealVictimId?: string;")) {
  const submission = /(export type Submission = \{[\s\S]*?)(\n\};)/m;
  if (!submission.test(game))
    throw new Error("No se encontró Submission para conservar la víctima de Robar turno.");
  game = game.replace(submission, `$1\n  turnStealVictimId?: string;$2`);
}

if (!game.includes("lastTurnStealNotice?:")) {
  const anchor = "  submissions: Record<string, Submission>;";
  if (!game.includes(anchor))
    throw new Error("No se encontró submissions para tipar el aviso validado de Robar turno.");
  const type = [
    "  lastTurnStealNotice?: {",
    "    actorId: string;",
    "    actorName: string;",
    "    victimId: string;",
    "    victimName: string;",
    "    label: string;",
    "    at: number;",
    "  } | null;",
  ].join("\n");
  game = game.replace(anchor, type + "\n" + anchor);
}

await writeFile("lib/game.ts", game, "utf8");

// ---------- Server: publish only after the answer has a final decision ----------
let route = await readFile("app/api/rooms/route.ts", "utf8");
const validatedMarker = "// TURN STEAL validated notice v2";

if (!route.includes(validatedMarker)) {
  const anchor = "function finishVarDecision(state: GameState, submission: Submission, approved: boolean) {";
  if (!route.includes(anchor))
    throw new Error("No se encontró finishVarDecision para retrasar el aviso hasta la validación.");

  const helper = [
    validatedMarker,
    "function publishValidatedTurnStealNotice(state: GameState, submission: Submission) {",
    "  const victimId = submission.turnStealVictimId;",
    "  if (!victimId) return;",
    "  const actor = player(state, submission.playerId);",
    "  const victim = player(state, victimId);",
    "  state.lastTurnStealNotice = {",
    "    actorId: submission.playerId,",
    "    actorName: actor?.name ?? \"Un jugador\",",
    "    victimId,",
    "    victimName: victim?.name ?? \"otro jugador\",",
    "    label: submission.cardLabel ?? state.lastPlay?.label ?? \"?\",",
    "    at: Date.now(),",
    "  };",
    "}",
    "",
  ].join("\n");
  route = route.replace(anchor, helper + anchor);
}

{
  const section = functionSection(
    route,
    "function finishVarDecision(state: GameState, submission: Submission, approved: boolean) {",
  );
  if (!section.text.includes("publishValidatedTurnStealNotice(state, submission);")) {
    const anchor = '  if (waitingForPenalty || state.status === "finished") return;';
    if (!section.text.includes(anchor))
      throw new Error("No se encontró el cierre de finishVarDecision para publicar Robar turno.");
    const changed = section.text.replace(
      anchor,
      `  publishValidatedTurnStealNotice(state, submission);\n${anchor}`,
    );
    route = route.slice(0, section.start) + changed + route.slice(section.end);
  }
}

// En vivo: the response becomes valid only when the challenge window closes.
{
  const section = functionSection(route, "function acceptPendingLive(state: GameState) {");
  if (!section.text.includes("publishValidatedTurnStealNotice(state, pending);")) {
    const anchor = "  const waitingForPenalty = applyAccepted(state, pending);";
    if (!section.text.includes(anchor))
      throw new Error("No se encontró applyAccepted de pendingLive para Robar turno.");
    const changed = section.text.replace(
      anchor,
      `${anchor}\n  publishValidatedTurnStealNotice(state, pending);`,
    );
    route = route.slice(0, section.start) + changed + route.slice(section.end);
  }
}

await writeFile("app/api/rooms/route.ts", route, "utf8");

// ---------- Client: use the validated timestamp, not the initial claim ----------
const pagePath = "app/page.tsx";
let page = await readFile(pagePath, "utf8");

if (!page.includes("lastTurnStealNotice?:")) {
  const anchor = "  submissions: Record<";
  if (!page.includes(anchor))
    throw new Error("No se encontró submissions en Room para tipar el aviso de Robar turno.");
  const type = [
    "  lastTurnStealNotice?: {",
    "    actorId: string;",
    "    actorName: string;",
    "    victimId: string;",
    "    victimName: string;",
    "    label: string;",
    "    at: number;",
    "  } | null;",
    "",
  ].join("\n");
  page = page.replace(anchor, type + anchor);
}

// Tell TurnNoticeWatcher that this local player is about to claim a stolen turn.
// The event is emitted before the atomic request so the DOM cannot race ahead and
// show a second "¡Te toca!". A failed claim immediately cancels the suppression.
if (!page.includes('window.dispatchEvent(new Event("stuno-turn-steal-claim-start"));')) {
  const claimAnchor = [
    '    if (confirmingTurnSteal && directCard) {',
    '      const stolen = await turnStealRequest("stealTurn", directCard.id);',
  ].join("\n");
  if (!page.includes(claimAnchor))
    throw new Error("No se encontró la confirmación cliente de Robar turno para suprimir ¡Te toca!.");
  page = page.replace(
    claimAnchor,
    [
      '    if (confirmingTurnSteal && directCard) {',
      '      window.dispatchEvent(new Event("stuno-turn-steal-claim-start"));',
      '      const stolen = await turnStealRequest("stealTurn", directCard.id);',
    ].join("\n"),
  );

  const failAnchor = [
    '      if (!stolen?.stolen) {',
    '        show("Ese turno ya no se puede robar.");',
  ].join("\n");
  if (!page.includes(failAnchor))
    throw new Error("No se encontró el fallo de Robar turno para cancelar la supresión.");
  page = page.replace(
    failAnchor,
    [
      '      if (!stolen?.stolen) {',
      '        window.dispatchEvent(new Event("stuno-turn-steal-claim-cancel"));',
      '        show("Ese turno ya no se puede robar.");',
    ].join("\n"),
  );
}

const marker = "TURN STEAL priority notice v2";
const oldMarker = "TURN STEAL priority notice v1";

// This script runs last on fresh source during every build. If an older marker
// is somehow present (local repeated execution), remove its block before adding v2.
if (!page.includes(marker)) {
  if (page.includes(oldMarker)) {
    const start = page.indexOf(`              {/* ${oldMarker} */}`);
    const anchor = `              <div\n                ref={dropRef}`;
    const end = page.indexOf(anchor, start);
    if (start >= 0 && end > start) page = page.slice(0, start) + page.slice(end);
  }

  const anchor = `              <div\n                ref={dropRef}`;
  if (!page.includes(anchor))
    throw new Error("No se encontró la zona de arrastre para el aviso validado de Robar turno.");

  const block = `              {/* ${marker} */}\n              {room.lastTurnStealNotice &&\n                now - room.lastTurnStealNotice.at >= 1500 &&\n                now - room.lastTurnStealNotice.at < 5600 &&\n                (() => {\n                  const notice = room.lastTurnStealNotice!;\n                  const title = notice.actorId === playerId\n                    ? "Robaste el turno"\n                    : notice.victimId === playerId\n                      ? "Te robaron el turno"\n                      : \`${"${notice.actorName}"} robó el turno\`;\n                  const detail = notice.actorId === playerId\n                    ? \`Te adelantaste con otra ${"${notice.label}"}.\`\n                    : notice.victimId === playerId\n                      ? \`${"${notice.actorName}"} se adelantó con otra ${"${notice.label}"}.\`\n                      : \`Se adelantó con otra ${"${notice.label}"} antes que ${"${notice.victimName}"}.\`;\n                  return (\n                    <div\n                      className="game-event-popup turn-steal turn-steal-priority-notice"\n                      aria-live="assertive"\n                    >\n                      <span className="game-event-symbol">\n                        <span\n                          className={\`turn-steal-event-card mini-play-card ${"${room.centerPile?.[room.centerPile.length - 1]?.kind ?? \"letter\"}"}\`}\n                        >\n                          {centerCardLabel(\n                            room.centerPile?.[room.centerPile.length - 1]?.kind ?? "letter",\n                            notice.label,\n                          )}\n                        </span>\n                      </span>\n                      <strong>{title}</strong>\n                      <small>{detail}</small>\n                    </div>\n                  );\n                })()}\n`;

  page = page.replace(anchor, block + anchor);
}

await writeFile(pagePath, page, "utf8");

// ---------- Suppress the thief's duplicate normal turn notice ----------
const watcherPath = "app/TurnNoticeWatcher.tsx";
let watcher = await readFile(watcherPath, "utf8");

if (!watcher.includes("suppressTurnStealTurnNoticeUntil")) {
  const refAnchor = "  const wasMyTurn = useRef(false);";
  if (!watcher.includes(refAnchor))
    throw new Error("No se encontró wasMyTurn en TurnNoticeWatcher.");
  watcher = watcher.replace(
    refAnchor,
    `${refAnchor}\n  const suppressTurnStealTurnNoticeUntil = useRef(0);`,
  );

  const transitionAnchor = "      if (isMyTurn && !wasMyTurn.current) show();";
  if (!watcher.includes(transitionAnchor))
    throw new Error("No se encontró la transición normal de ¡Te toca!.");
  watcher = watcher.replace(
    transitionAnchor,
    [
      "      if (isMyTurn && !wasMyTurn.current) {",
      "        const suppress = Date.now() < suppressTurnStealTurnNoticeUntil.current;",
      "        suppressTurnStealTurnNoticeUntil.current = 0;",
      "        if (!suppress) show();",
      "      }",
    ].join("\n"),
  );

  const evaluateAnchor = "    evaluate();";
  if (!watcher.includes(evaluateAnchor))
    throw new Error("No se encontró evaluate() para registrar la supresión de Robar turno.");
  const listeners = [
    "    const suppressTurnStealNotice = () => {",
    "      suppressTurnStealTurnNoticeUntil.current = Date.now() + 3000;",
    "    };",
    "    const clearTurnStealNoticeSuppression = () => {",
    "      suppressTurnStealTurnNoticeUntil.current = 0;",
    "    };",
    '    window.addEventListener("stuno-turn-steal-claim-start", suppressTurnStealNotice);',
    '    window.addEventListener("stuno-turn-steal-claim-cancel", clearTurnStealNoticeSuppression);',
    "",
  ].join("\n");
  watcher = watcher.replace(evaluateAnchor, listeners + evaluateAnchor);

  const cleanupAnchor = '      window.removeEventListener("resize", positionOverPile);';
  if (!watcher.includes(cleanupAnchor))
    throw new Error("No se encontró cleanup de TurnNoticeWatcher.");
  watcher = watcher.replace(
    cleanupAnchor,
    [
      cleanupAnchor,
      '      window.removeEventListener("stuno-turn-steal-claim-start", suppressTurnStealNotice);',
      '      window.removeEventListener("stuno-turn-steal-claim-cancel", clearTurnStealNoticeSuppression);',
    ].join("\n"),
  );
}

await writeFile(watcherPath, watcher, "utf8");

// ---------- Visual alignment ----------
const cssPath = "app/ui-fixes.css";
let css = await readFile(cssPath, "utf8");
const cssMarker = "/* Turn steal priority notice. */";
const cssBlock = `${cssMarker}\n/* Use the standard popup dimensions. The higher-specificity selectors below\n   intentionally beat the older !important mini-card rules. */\n.event-slot .game-event-popup.turn-steal {\n  visibility: hidden !important;\n}\n.turn-steal-priority-notice {\n  position: fixed !important;\n  left: 50% !important;\n  top: 47% !important;\n  transform: translate(-50%, -50%) !important;\n  z-index: 1250 !important;\n  pointer-events: none !important;\n  visibility: visible !important;\n}\n.game-event-popup.turn-steal.turn-steal-priority-notice .game-event-symbol {\n  position: relative !important;\n  align-self: center !important;\n  overflow: visible !important;\n}\n.game-event-popup.turn-steal.turn-steal-priority-notice .turn-steal-event-card {\n  position: absolute !important;\n  inset: auto !important;\n  left: 50% !important;\n  top: 50% !important;\n  right: auto !important;\n  bottom: auto !important;\n  width: 40px !important;\n  min-width: 40px !important;\n  height: 48px !important;\n  max-height: 48px !important;\n  margin: 0 !important;\n  padding: 3px !important;\n  box-sizing: border-box !important;\n  transform: translate(-50%, -50%) !important;\n}\n@media (max-width: 520px) {\n  .turn-steal-priority-notice {\n    top: 46% !important;\n  }\n  .game-event-popup.turn-steal.turn-steal-priority-notice .turn-steal-event-card {\n    width: 38px !important;\n    min-width: 38px !important;\n    height: 46px !important;\n    max-height: 46px !important;\n  }\n}\n`;

if (css.includes(cssMarker)) {
  const start = css.indexOf(cssMarker);
  const next = css.indexOf("\n/* ", start + cssMarker.length);
  css = next >= 0
    ? css.slice(0, start) + cssBlock + css.slice(next)
    : css.slice(0, start) + cssBlock + "\n";
} else {
  css += `\n\n${cssBlock}`;
}
await writeFile(cssPath, css, "utf8");

// ---------- Build-time verification ----------
const routeCheck = await readFile("app/api/rooms/route.ts", "utf8");
const pageCheck = await readFile(pagePath, "utf8");
const watcherCheck = await readFile(watcherPath, "utf8");
const cssCheck = await readFile(cssPath, "utf8");
const gameCheck = await readFile("lib/game.ts", "utf8");

const required = [
  [gameCheck, "lastTurnStealNotice?:"],
  [routeCheck, validatedMarker],
  [routeCheck, "publishValidatedTurnStealNotice(state, submission);"],
  [pageCheck, marker],
  [pageCheck, "room.lastTurnStealNotice.at >= 1500"],
  [pageCheck, "stuno-turn-steal-claim-start"],
  [watcherCheck, "suppressTurnStealTurnNoticeUntil"],
  [cssCheck, ".game-event-popup.turn-steal.turn-steal-priority-notice .turn-steal-event-card"],
  [cssCheck, "transform: translate(-50%, -50%) !important;"],
];
const missing = required
  .filter(([source, token]) => !source.includes(token))
  .map(([, token]) => token);
if (missing.length)
  throw new Error(`Turn-steal post-validation fix incompleto: ${missing.join(", ")}`);

console.log("Turn steal notice now appears after final validation, suppresses the thief's duplicate turn prompt, and centers the mini card geometrically.");
