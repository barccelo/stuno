import { readFile, writeFile } from "node:fs/promises";

const files = ["app/page.tsx", "app/api/rooms/route.ts"];
const from = '["Ñ", "Y", "Q", "Z"]';
const to = '["Ñ", "W", "Y", "Q", "Z"]';

for (const path of files) {
  let source = await readFile(path, "utf8");
  if (source.includes(to)) continue;
  if (!source.includes(from)) {
    throw new Error(`No se encontró la lista de letras de Contiene en ${path}.`);
  }
  source = source.split(from).join(to);
  await writeFile(path, source, "utf8");
}

console.log("W habilitada para Contiene en interfaz y validación del servidor.");
