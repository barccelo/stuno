import { and, eq, lt } from "drizzle-orm";
import { ensureSchema, getDb } from "../../../../db";
import { rooms, voiceSignals } from "../../../../db/schema";

type VoiceRoomState = {
  settings?: { allowVoiceChat?: boolean };
  players?: { id: string }[];
};

type SignalType = "join" | "leave" | "offer" | "answer" | "candidate";

const SIGNAL_TYPES = new Set<SignalType>([
  "join",
  "leave",
  "offer",
  "answer",
  "candidate",
]);

export async function POST(request: Request) {
  await ensureSchema();
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const roomCode = String(body?.code ?? "").trim().toUpperCase();
  const playerId = String(body?.playerId ?? "").trim();
  const to = String(body?.to ?? "*").trim();
  const type = String(body?.type ?? "") as SignalType;
  const sdp = typeof body?.sdp === "string" ? body.sdp : null;

  if (!roomCode || !playerId || !SIGNAL_TYPES.has(type))
    return Response.json({ error: "Señal de voz inválida." }, { status: 400 });
  if ((type === "offer" || type === "answer") && (!sdp || sdp.length > 40000))
    return Response.json({ error: "Descripción WebRTC inválida." }, { status: 400 });
  if (type === "candidate" && (!sdp || sdp.length > 8000))
    return Response.json({ error: "Candidato ICE inválido." }, { status: 400 });

  const db = getDb();
  const [row] = await db.select().from(rooms).where(eq(rooms.code, roomCode)).limit(1);
  if (!row) return Response.json({ error: "Sala no encontrada." }, { status: 404 });

  const state = JSON.parse(row.state) as VoiceRoomState;
  if (!state.settings?.allowVoiceChat)
    return Response.json({ error: "El chat de voz no está habilitado." }, { status: 403 });
  if (!state.players?.some((player) => player.id === playerId))
    return Response.json({ error: "Jugador no válido." }, { status: 403 });
  if (to !== "*" && !state.players.some((player) => player.id === to))
    return Response.json({ error: "Destino no válido." }, { status: 404 });

  const createdAt = Date.now();
  const signal = {
    id: crypto.randomUUID(),
    roomCode,
    fromPlayerId: playerId,
    toPlayerId: to,
    type,
    sdp,
    createdAt,
  };
  await db.insert(voiceSignals).values(signal);

  if (type === "join") {
    await db
      .delete(voiceSignals)
      .where(
        and(
          eq(voiceSignals.roomCode, roomCode),
          lt(voiceSignals.createdAt, createdAt - 10 * 60 * 1000),
        ),
      );
  }

  return Response.json({ ok: true, id: signal.id, at: createdAt }, { status: 201 });
}
