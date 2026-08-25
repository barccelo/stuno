import { readFile } from "node:fs/promises";

const checks = [
  {
    path: "app/page.tsx",
    markers: [
      "starterCategoryTitles",
      "categoryEditorSearch",
      "async function shareRoomLink",
      "navigator.share",
      "category-admin-search",
      "category-scroll-top",
      "Nueva tarjeta",
      '["Ñ", "Y", "Q", "Z", "X", "K"]',
    ],
  },
  {
    path: "app/api/rooms/route.ts",
    markers: [
      '["Ñ", "Y", "Q", "Z", "X", "K"]',
      "firstCategoryOption",
      "Esa opción de categoría está vacía",
    ],
  },
  {
    path: "app/TurnNoticeWatcher.tsx",
    markers: ['["X", "K"].includes(letter)'],
  },
];

for (const check of checks) {
  const source = await readFile(check.path, "utf8");
  for (const marker of check.markers) {
    if (!source.includes(marker)) {
      throw new Error(`Verificación de build falló: ${check.path} no contiene ${marker}`);
    }
  }
}

console.log("Category admin fixes verified.");
