import { readFile, writeFile } from "node:fs/promises";

const patchPath = "scripts/apply-power-cards.mjs";
let source = await readFile(patchPath, "utf8");

const fixes = [
  {
    from: `'      : card.kind === "category"\\n        ? ""\\n        : card.kind === "stop"'`,
    to: `'        : card.kind === "category"\\n          ? ""\\n          : card.kind === "stop"'`,
    label: "ancla de cardFace",
  },
  {
    from: `'      : card.kind === "category"\\n        ? ""\\n        : card.kind === "combo"\\n          ? "4–6"\\n          : card.kind === "steal"\\n            ? "☠"\\n            : card.kind === "stop"'`,
    to: `'        : card.kind === "category"\\n          ? ""\\n          : card.kind === "combo"\\n            ? "4–6"\\n            : card.kind === "steal"\\n              ? "☠"\\n              : card.kind === "stop"'`,
    label: "reemplazo de cardFace",
  },
  {
    from: `'      : kind === "joker"\\n          ? "★"\\n          : label;'`,
    to: `'        : kind === "joker"\\n          ? "★"\\n          : label;'`,
    label: "ancla de centerCardLabel",
  },
  {
    from: `'      : kind === "joker"\\n          ? "★"\\n          : kind === "combo"\\n            ? "COMBO"\\n            : kind === "steal"\\n              ? "☠"\\n              : label;'`,
    to: `'        : kind === "joker"\\n          ? "★"\\n          : kind === "combo"\\n            ? "COMBO"\\n            : kind === "steal"\\n              ? "☠"\\n              : label;'`,
    label: "reemplazo de centerCardLabel",
  },
];

for (const fix of fixes) {
  if (source.includes(fix.to)) continue;
  if (!source.includes(fix.from))
    throw new Error(`No se encontró ${fix.label} en el parche base.`);
  source = source.replace(fix.from, fix.to);
}

await writeFile(patchPath, source, "utf8");
await import("./apply-power-cards.mjs");
