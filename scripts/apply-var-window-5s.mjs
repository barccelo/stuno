import { readFile, writeFile } from "node:fs/promises";

const path = "app/api/rooms/route.ts";
let source = await readFile(path, "utf8");

const from = "expiresAt: Date.now() + 2500,";
const to = "expiresAt: Date.now() + 5000,";

if (!source.includes(to)) {
  if (!source.includes(from)) {
    throw new Error("No se encontró la duración actual de la ventana VAR.");
  }
  source = source.replace(from, to);
  await writeFile(path, source, "utf8");
}
