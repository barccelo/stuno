import { readFile, writeFile } from "node:fs/promises";

const path = "app/page.tsx";
const before = await readFile(path, "utf8");

const oldBlock = [
  "                    <br />",
  "                    {renderRoomMessage(room.message)}",
].join("\n");

const newBlock = [
  "                    {room.message.trim().replace(/\\.$/, \"\") !==",
  "                      `Turno de ${current?.name ?? \"\"}` && (",
  "                      <>",
  "                        <br />",
  "                        {renderRoomMessage(room.message)}",
  "                      </>",
  "                    )}",
].join("\n");

if (before.includes(newBlock)) {
  console.log("Turn message dedupe already applied.");
  process.exit(0);
}

if (!before.includes(oldBlock)) {
  throw new Error("No se encontró el bloque del mensaje de turno esperado.");
}

const after = before.replace(oldBlock, newBlock);
await writeFile(path, after, "utf8");
console.log("Duplicate turn message hidden.");
