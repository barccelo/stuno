import { readFile } from "node:fs/promises";

const [game, route, watcher, layout, css] = await Promise.all([
  readFile("lib/game.ts", "utf8"),
  readFile("app/api/rooms/route.ts", "utf8"),
  readFile("app/VoteTimerWatcher.tsx", "utf8"),
  readFile("app/layout.tsx", "utf8"),
  readFile("app/vote-timer.css", "utf8"),
]);

const pendingVoteCalls = route.match(/makePendingVote\(/g) ?? [];
const checks = [
  [game.includes("expiresAt?: number"), "PendingVote no tiene vencimiento tipado"],
  [route.includes("const VOTE_DURATION_MS = 10000"), "Falta la duración de 10 s"],
  [route.includes("function makePendingVote"), "Falta el constructor único de votaciones"],
  [pendingVoteCalls.length >= 5, `No todas las rutas de votación usan el temporizador (${pendingVoteCalls.length} usos)`],
  [route.includes("function finalizeExpiredVote"), "Falta resolver votación vencida"],
  [route.includes("changed = finalizeExpiredVote(state) || changed"), "El polling no revisa el vencimiento"],
  [route.includes('state.settings.playStyle === "live"') && route.includes("El grupo decide si la respuesta es válida"), "En vivo por turnos no entra directamente a votación"],
  [watcher.includes("vote-countdown-watcher"), "Falta el contador directo de respaldo"],
  [watcher.includes("pendingVote") && watcher.includes("expiresAt"), "El contador no se sincroniza con la votación del servidor"],
  [layout.includes("<VoteTimerWatcher />"), "El contador directo no está montado en el layout"],
  [css.includes(".vote-countdown-watcher"), "Faltan estilos del contador de respaldo"],
  [css.includes("width: min(500px"), "La tarjeta de votación no fue ampliada"],
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

console.log("Vote timer verificado: 10 s de servidor y contador directo visible en todas las votaciones.");
