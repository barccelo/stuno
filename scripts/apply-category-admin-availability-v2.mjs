import { readFile, writeFile } from "node:fs/promises";

const patchPath = "scripts/apply-category-admin-availability.mjs";
let source = await readFile(patchPath, "utf8");
const bad = '    source = source.slice(0, saveEnd) + helpers + source.slice(saveEnd);';
const fixed = [
  '    const helperInsertIndex = source.indexOf(\'  function clearCardSelection()\', saveStart);',
  '    if (helperInsertIndex < 0) throw new Error("No se encontró el punto final para insertar helpers del administrador.");',
  '    source = source.slice(0, helperInsertIndex) + helpers + source.slice(helperInsertIndex);',
].join("\n");

if (source.includes(bad)) {
  source = source.replace(bad, fixed);
  await writeFile(patchPath, source, "utf8");
} else if (!source.includes("const helperInsertIndex = source.indexOf")) {
  throw new Error("No se encontró la versión esperada del parche de disponibilidad.");
}

await import("./apply-category-admin-availability.mjs");
