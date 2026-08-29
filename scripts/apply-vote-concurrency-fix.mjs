import { readFile, writeFile } from "node:fs/promises";

const path = "app/api/rooms/route.ts";
let source = await readFile(path, "utf8");

// Earlier build patches may already expand the drizzle import for voice signals.
// Only add `and` when it is genuinely absent; do not assume an exact import list.
const drizzleImport = source.match(/import \{([^}]+)\} from "drizzle-orm";/);
if (!drizzleImport) {
  throw new Error("No se encontró el import de drizzle esperado.");
}
const drizzleNames = drizzleImport[1]
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
if (!drizzleNames.includes("and")) {
  source = source.replace(
    drizzleImport[0],
    `import { and, ${drizzleNames.join(", ")} } from "drizzle-orm";`,
  );
}

const handlerMarker = "async function applyVoteAtomically(";
if (!source.includes(handlerMarker)) {
  const anchor = "export async function POST(request: Request) {";
  if (!source.includes(anchor)) {
    throw new Error("No se encontró el inicio de POST para instalar la votación atómica.");
  }

  const handler = `async function applyVoteAtomically(
  roomCode: string,
  playerId: string,
  approve: boolean,
) {
  // Several players can vote at almost exactly the same time. Each attempt
  // compares the exact room snapshot it read before writing, so a slower
  // request can never overwrite a vote resolution that already won the race.
  for (let attempt = 0; attempt < 6; attempt++) {
    const [row] = await getDb()
      .select({ state: rooms.state })
      .from(rooms)
      .where(eq(rooms.code, roomCode))
      .limit(1);

    if (!row)
      return Response.json({ error: "Sala no encontrada" }, { status: 404 });

    const state = JSON.parse(row.state) as GameState;
    const pending = state.pendingVote;

    // A concurrent voter may already have resolved this card. Treat that as
    // success and return the newest state instead of reviving the old vote.
    if (!pending)
      return Response.json({ state: publicState(state, playerId) });

    if (pending.playerId === playerId)
      return Response.json(
        { error: "No puedes votar tu propia respuesta" },
        { status: 403 },
      );

    // Retried/double taps are idempotent.
    if (Object.prototype.hasOwnProperty.call(pending.votes, playerId))
      return Response.json({ state: publicState(state, playerId) });

    if (pending.expiresAt && Date.now() >= pending.expiresAt) {
      finalizeExpiredVote(state);
    } else {
      pending.votes[playerId] = approve;
      const eligible = Math.max(0, state.players.length - 1);
      const votes = Object.values(pending.votes);
      const yes = votes.filter(Boolean).length;
      const no = votes.length - yes;
      if (votes.length >= eligible) resolveVote(state, yes > no);
    }

    state.revision = (state.revision ?? 0) + 1;
    state.message = state.message.slice(0, 160);
    const nextState = JSON.stringify(state);

    await getDb()
      .update(rooms)
      .set({ state: nextState, updatedAt: new Date().toISOString() })
      .where(and(eq(rooms.code, roomCode), eq(rooms.state, row.state)));

    // Drizzle/D1's normal UPDATE path is already used throughout this route.
    // Confirm the compare-and-swap by reading the row back instead of relying
    // on RETURNING support in the deployment adapter.
    const [confirmed] = await getDb()
      .select({ state: rooms.state })
      .from(rooms)
      .where(eq(rooms.code, roomCode))
      .limit(1);

    if (confirmed?.state === nextState)
      return Response.json({ state: publicState(state, playerId) });

    // Someone else wrote first (or immediately after us). Reload and merge
    // this player's vote into the newest state instead of restoring old data.
  }

  const latest = await load(roomCode);
  if (!latest)
    return Response.json({ error: "Sala no encontrada" }, { status: 404 });
  return Response.json({ state: publicState(latest, playerId) });
}

`;

  source = source.replace(anchor, handler + anchor);
}

const postAnchor = [
  "    const body = (await request.json()) as Record<string, unknown>;",
  "    const action = String(body.action ?? \"\");",
].join("\n");
const postReplacement = [
  "    const body = (await request.json()) as Record<string, unknown>;",
  "    const action = String(body.action ?? \"\");",
  "    if (action === \"vote\") {",
  "      return applyVoteAtomically(",
  "        String(body.code ?? \"\").toUpperCase(),",
  "        String(body.playerId ?? \"\"),",
  "        Boolean(body.approve),",
  "      );",
  "    }",
].join("\n");

if (!source.includes(postReplacement)) {
  if (!source.includes(postAnchor)) {
    throw new Error("No se encontró el despacho de acciones para interceptar vote.");
  }
  source = source.replace(postAnchor, postReplacement);
}

const required = [
  "async function applyVoteAtomically(",
  "eq(rooms.state, row.state)",
  "confirmed?.state === nextState",
  'if (action === "vote") {',
  "return applyVoteAtomically(",
];
const missing = required.filter((item) => !source.includes(item));
if (missing.length) {
  throw new Error(`Vote concurrency fix incompleto: ${missing.join(", ")}`);
}

await writeFile(path, source, "utf8");
console.log("Atomic vote concurrency protection applied.");
