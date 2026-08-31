import { readFile, writeFile } from "node:fs/promises";

const path = "app/page.tsx";
let source = await readFile(path, "utf8");

const label = '<span className="discard-label">Descartar</span>';
source = source.replaceAll(label, "");

await writeFile(path, source, "utf8");

if ((await readFile(path, "utf8")).includes(label))
  throw new Error("No se pudo eliminar la palabra Descartar del control de papelera.");

console.log("Discard control simplified: icon and +2 only.");
