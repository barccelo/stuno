import { readFile, writeFile } from "node:fs/promises";

const files = ["app/page.tsx", "app/api/rooms/route.ts"];
const oldList = /\[\s*"Ñ"\s*,\s*"Y"\s*,\s*"Q"\s*,\s*"Z"\s*\]/g;
const newList = '["Ñ", "W", "Y", "Q", "Z"]';

for (const path of files) {
  const before = await readFile(path, "utf8");
  const after = before.replace(oldList, newList);
  if (after !== before) await writeFile(path, after, "utf8");
}

const page = await readFile("app/page.tsx", "utf8");
const route = await readFile("app/api/rooms/route.ts", "utf8");

if (!page.includes('["Ñ", "W", "Y", "Q", "Z"].includes')) {
  throw new Error("W no quedó habilitada en el selector Contiene del cliente.");
}
if (!route.includes('["Ñ", "W", "Y", "Q", "Z"].includes(card.label.toUpperCase())')) {
  throw new Error("W no quedó habilitada en la validación Contiene del servidor.");
}

console.log("W habilitada para Contiene en interfaz y validación del servidor.");
