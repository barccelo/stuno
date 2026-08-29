import { readFile, writeFile } from "node:fs/promises";

const path = "app/page.tsx";
const before = await readFile(path, "utf8");

const from = [
  "      if (",
  "        room.pendingVote ||",
  "        room.pendingLive ||",
  "        room.pendingPenalty ||",
  "        room.categoryOptions ||",
  "        room.startCountdownEndsAt",
  "      )",
  "        return 900;",
].join("\n");

const to = [
  "      if (room.startCountdownEndsAt) return 250;",
  "      if (",
  "        room.pendingVote ||",
  "        room.pendingLive ||",
  "        room.pendingPenalty ||",
  "        room.categoryOptions",
  "      )",
  "        return 900;",
].join("\n");

if (before.includes(to)) {
  console.log("Fast start transition already applied.");
  process.exit(0);
}
if (!before.includes(from)) {
  throw new Error("No se encontró el polling especial del conteo inicial.");
}

await writeFile(path, before.replace(from, to), "utf8");
console.log("Fast start transition applied.");
