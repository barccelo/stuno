import { readFile, writeFile } from "node:fs/promises";

const path = "app/page.tsx";
const before = await readFile(path, "utf8");

if (before.includes("const adaptiveRoomPollDelay = () =>")) {
  console.log("Adaptive polling already applied.");
  process.exit(0);
}

const startMarker = [
  '  useEffect(() => {',
  '    if (screen !== "game" || !room?.code) return;',
  '    const timer = window.setInterval(async () => {',
].join("\n");

const start = before.indexOf(startMarker);
if (start < 0) {
  throw new Error("No se encontró el polling de sala esperado.");
}

const endMarker = '  }, [screen, room?.code, playerId]);';
const endStart = before.indexOf(endMarker, start);
if (endStart < 0) {
  throw new Error("No se encontró el cierre del polling de sala.");
}
const end = endStart + endMarker.length;

const replacement = [
  '  useEffect(() => {',
  '    if (screen !== "game" || !room?.code) return;',
  '    const roomCode = room.code;',
  '    let cancelled = false;',
  '    let inFlight = false;',
  '    let timer: number | null = null;',
  '    const controller = new AbortController();',
  '',
  '    const adaptiveRoomPollDelay = () => {',
  '      if (document.hidden) return 12000;',
  '      if (room.status === "lobby") return 3000;',
  '      if (room.status === "finished" || room.status === "closed") return 6000;',
  '      if (room.pausedAt) return 3200;',
  '      if (',
  '        room.pendingVote ||',
  '        room.pendingLive ||',
  '        room.pendingPenalty ||',
  '        room.categoryOptions ||',
  '        room.startCountdownEndsAt',
  '      )',
  '        return 900;',
  '      if (room.settings.mode === "simultaneous") return 1900;',
  '      const currentTurnId = room.players[room.turnIndex]?.id ?? "";',
  '      return currentTurnId === playerId ? 2600 : 1900;',
  '    };',
  '',
  '    const schedule = (delay = adaptiveRoomPollDelay()) => {',
  '      if (cancelled) return;',
  '      if (timer !== null) window.clearTimeout(timer);',
  '      timer = window.setTimeout(() => void refresh(), delay);',
  '    };',
  '',
  '    const refresh = async () => {',
  '      if (cancelled || inFlight) return;',
  '      inFlight = true;',
  '      try {',
  '        const response = await fetch(',
  '          "/api/rooms?code=" + encodeURIComponent(roomCode) + "&playerId=" + encodeURIComponent(playerId),',
  '          { cache: "no-store", signal: controller.signal },',
  '        );',
  '        if (response.ok) {',
  '          const data = await response.json();',
  '          applyRoom(data.state);',
  '        }',
  '      } catch (error) {',
  '        if (!(error instanceof DOMException && error.name === "AbortError")) {',
  '          // A transient network failure should not stop synchronization.',
  '        }',
  '      } finally {',
  '        inFlight = false;',
  '        if (!cancelled) schedule();',
  '      }',
  '    };',
  '',
  '    const syncNow = () => {',
  '      if (document.hidden || cancelled) return;',
  '      if (timer !== null) window.clearTimeout(timer);',
  '      timer = null;',
  '      void refresh();',
  '    };',
  '',
  '    schedule(Math.min(900, adaptiveRoomPollDelay()));',
  '    document.addEventListener("visibilitychange", syncNow);',
  '    window.addEventListener("focus", syncNow);',
  '',
  '    return () => {',
  '      cancelled = true;',
  '      controller.abort();',
  '      if (timer !== null) window.clearTimeout(timer);',
  '      document.removeEventListener("visibilitychange", syncNow);',
  '      window.removeEventListener("focus", syncNow);',
  '    };',
  '  }, [',
  '    screen,',
  '    room?.code,',
  '    room?.status,',
  '    room?.pausedAt,',
  '    room?.startCountdownEndsAt,',
  '    room?.turnIndex,',
  '    room?.settings.mode,',
  '    Boolean(room?.pendingVote),',
  '    Boolean(room?.pendingLive),',
  '    Boolean(room?.pendingPenalty),',
  '    Boolean(room?.categoryOptions),',
  '    playerId,',
  '  ]);',
].join("\n");

const after = before.slice(0, start) + replacement + before.slice(end);
await writeFile(path, after, "utf8");
console.log("Adaptive room polling applied.");
