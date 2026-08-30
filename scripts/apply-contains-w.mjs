import { readFile, writeFile } from "node:fs/promises";

const files = ["app/page.tsx", "app/api/rooms/route.ts"];
const oldLists = [
  /\[\s*"Ñ"\s*,\s*"Y"\s*,\s*"Q"\s*,\s*"Z"\s*,\s*"X"\s*\]/g,
  /\[\s*"Ñ"\s*,\s*"Y"\s*,\s*"Q"\s*,\s*"Z"\s*\]/g,
];
const newList = '["Ñ", "W", "Y", "Q", "Z", "X"]';

for (const path of files) {
  const before = await readFile(path, "utf8");
  let after = before;
  for (const pattern of oldLists) after = after.replace(pattern, newList);
  if (after !== before) await writeFile(path, after, "utf8");
}

const page = await readFile("app/page.tsx", "utf8");
const route = await readFile("app/api/rooms/route.ts", "utf8");

if (!page.includes('["Ñ", "W", "Y", "Q", "Z", "X"].includes')) {
  throw new Error("W no quedó habilitada en el selector Contiene del cliente.");
}
if (!route.includes('["Ñ", "W", "Y", "Q", "Z", "X"].includes(card.label.toUpperCase())')) {
  throw new Error("W no quedó habilitada en la validación Contiene del servidor.");
}

console.log("W habilitada para Contiene en interfaz y validación del servidor; X se conserva.");
