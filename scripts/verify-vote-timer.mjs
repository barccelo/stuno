import { readFile } from "node:fs/promises";

const [game, route, page, css] = await Promise.all([
  readFile("lib/game.ts", "utf8"),
  readFile("app/api/rooms/route.ts", "utf8"),
  readFile("app/page.tsx", "utf8"),
  readFile("app/ui-fixes.css", "utf8"),
]);

const pendingVoteCalls = route.match(/makePendingVote\(/g) ?? [];
const checks = [
  [game.includes("expiresAt?: number"), "PendingVote no tiene vencimiento tipado"],
  [route.includes("const VOTE_DURATION_MS = 10000"), "Falta la duración de 10 s"],
  [route.includes("function makePendingVote"), "Falta el constructor único de votaciones"],
  [pendingVoteCalls.length >= 7, `No todas las modalidades crean votaciones temporizadas (${pendingVoteCalls.length} usos)`],
  [route.includes("function finalizeExpiredVote"), "Falta resolver votación vencida"],
  [route.includes("changed = finalizeExpiredVote(state) || changed"), "El polling no revisa el vencimiento"],
  [route.includes('state.settings.playStyle === "live"') && route.includes("El grupo decide si la respuesta es válida"), "En vivo no entra directamente a votación"],
  [page.includes('className="vote-countdown"'), "Falta el contador visible en la tarjeta"],
  [page.includes('className="vote-panel-heading"'), "Falta espacio reservado para el contador"],
  [page.includes("room.pendingVote.expiresAt - now"), "El contador visible no usa el vencimiento"],
  [page.includes("voteProgress"), "Falta el progreso visual del contador"],
  [css.includes(".vote-countdown"), "Faltan estilos del contador"],
  [/width:\s*min\(500px,\s*92vw\)/.test(css), "La tarjeta de votación no fue ampliada"],
];

const rawVoteAssignments = route.match(/state\.pendingVote\s*=\s*(?:first|next)?\s*\?\s*\{[^\n]*votes:\s*\{\}|state\.pendingVote\s*=\s*\{[^\n]*votes:\s*\{\}/g) ?? [];
checks.push([
  rawVoteAssignments.length === 0,
  `Hay ${rawVoteAssignments.length} creación(es) de votación que evitan el temporizador`,
]);

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  throw new Error(`Verificación de votación falló:\n- ${failures.join("\n- ")}`);
}

console.log("Vote timer verificado: 10 s, visible y aplicado a todas las votaciones.");
