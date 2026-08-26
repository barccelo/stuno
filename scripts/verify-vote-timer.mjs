import { readFile } from "node:fs/promises";

const [game, route, page, css] = await Promise.all([
  readFile("lib/game.ts", "utf8"),
  readFile("app/api/rooms/route.ts", "utf8"),
  readFile("app/page.tsx", "utf8"),
  readFile("app/ui-fixes.css", "utf8"),
]);

const checks = [
  [game.includes("expiresAt?: number"), "PendingVote no tiene vencimiento tipado"],
  [route.includes("const VOTE_DURATION_MS = 10000"), "Falta la duración de 10 s"],
  [route.includes("function finalizeExpiredVote"), "Falta resolver votación vencida"],
  [route.includes("changed = finalizeExpiredVote(state) || changed"), "El polling no revisa el vencimiento"],
  [route.includes('state.settings.playStyle === "live"') && route.includes("El grupo decide si la respuesta es válida"), "En vivo no entra directamente a votación"],
  [page.includes('className="vote-countdown"'), "Falta el contador visible en la tarjeta"],
  [page.includes("room.pendingVote.expiresAt - now"), "El contador visible no usa el vencimiento"],
  [css.includes(".vote-countdown"), "Faltan estilos del contador"],
  [css.includes("width:min(500px,92vw)"), "La tarjeta de votación no fue ampliada"],
];

const unexpiredVoteConstructors = route.match(/votes:\s*\{\}(?!,\s*expiresAt:\s*Date\.now\(\)\s*\+\s*VOTE_DURATION_MS)/g) ?? [];
checks.push([
  unexpiredVoteConstructors.length === 0,
  `Hay ${unexpiredVoteConstructors.length} creación(es) de votación sin los 10 segundos`,
]);

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  throw new Error(`Verificación de votación falló:\n- ${failures.join("\n- ")}`);
}

console.log("Vote timer verificado: 10 s y contador visible en todas las votaciones.");
