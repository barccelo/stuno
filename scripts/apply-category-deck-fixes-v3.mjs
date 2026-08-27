import { readFile, writeFile } from "node:fs/promises";

async function patch(path, transform) {
  const before = await readFile(path, "utf8");
  const after = transform(before);
  if (after !== before) await writeFile(path, after, "utf8");
}

function requireReplace(source, pattern, replacement, label, already) {
  if (already && source.includes(already)) return source;
  if (typeof pattern === "string") {
    if (!source.includes(pattern)) throw new Error("No se encontró: " + label);
    return source.replace(pattern, replacement);
  }
  pattern.lastIndex = 0;
  if (!pattern.test(source)) throw new Error("No se encontró: " + label);
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

await patch("lib/game.ts", (source) => {
  if (!source.includes("categoryChangeCards?: number;")) {
    source = requireReplace(
      source,
      /(\s+startDelaySeconds: number;\n)/,
      "$1    categoryChangeCards?: number;\n",
      "settings.categoryChangeCards",
    );
  }

  if (!source.includes("currentCategoryCardKey?: string | null;")) {
    source = requireReplace(
      source,
      "  categoryOwnerId?: string | null;\n",
      "  categoryOwnerId?: string | null;\n  currentCategoryCardKey?: string | null;\n  categoryOptionsCardKey?: string | null;\n",
      "identidad de tarjeta actual",
    );
  } else if (!source.includes("categoryOptionsCardKey?: string | null;")) {
    source = requireReplace(
      source,
      "  currentCategoryCardKey?: string | null;\n",
      "  currentCategoryCardKey?: string | null;\n  categoryOptionsCardKey?: string | null;\n",
      "identidad de tarjeta ofrecida",
    );
  }

  source = requireReplace(
    source,
    /export function makeDeck\(idPrefix = ""(?:,\s*categoryChangeCards = \d+)?\): GameCard\[\] \{/,
    'export function makeDeck(idPrefix = "", categoryChangeCards = 10): GameCard[] {',
    "firma de makeDeck",
    'export function makeDeck(idPrefix = "", categoryChangeCards = 10): GameCard[] {',
  );

  if (!source.includes("const requestedCategoryCards = Number(categoryChangeCards);")) {
    source = requireReplace(
      source,
      /\s*(?:\/\/[^\n]*\n\s*)?for \(let i = 0; i < 20; i\+\+\) add\("NUEVA CATEGORÍA", "category"\);/,
      '\n  const requestedCategoryCards = Number(categoryChangeCards);\n  const categoryCards = Number.isFinite(requestedCategoryCards)\n    ? Math.max(0, Math.min(20, Math.floor(requestedCategoryCards)))\n    : 10;\n  for (let i = 0; i < categoryCards; i++) add("NUEVA CATEGORÍA", "category");',
      "cantidad configurable de cartas",
    );
  }

  source = requireReplace(
    source,
    "      state.deck = makeDeck(refillId);\n",
    "      state.deck = makeDeck(refillId, state.settings.categoryChangeCards ?? 10);\n",
    "regeneración de mazo",
    "state.settings.categoryChangeCards ?? 10",
  );

  if (!source.includes("export function categoryCardKey(")) {
    source = requireReplace(
      source,
      "export function chooseCategory(state: GameState) {",
      'export function categoryCardKey(card?: CategoryCard | null) {\n  if (!card) return "";\n  return [card.title ?? "", card.easy, card.medium, card.expert]\n    .map((value) => normalized(value ?? ""))\n    .join("|");\n}\n\nexport function chooseCategory(state: GameState) {',
      "categoryCardKey",
    );
  }

  const begin = source.indexOf("export function chooseCategory(state: GameState) {");
  const end = source.indexOf("export function normalized(value: string)", begin);
  if (begin < 0 || end < 0) throw new Error("No se pudo localizar chooseCategory");

  const implementation = `export function chooseCategory(state: GameState) {
  const current = normalized(state.currentCategory?.text ?? "");
  const levels = ["easy", "medium", "expert"] as const;
  const inferredCurrentCard = current
    ? state.categories.find((card) =>
        levels.some((level) => normalized(card[level] ?? "") === current),
      )
    : null;
  const currentCardKey =
    state.currentCategoryCardKey || categoryCardKey(inferredCurrentCard);
  let nextOptions: CategoryCard | null = null;
  let nextOptionsKey = "";
  let deferredCurrentCard: CategoryCard | null = null;
  let deferredCurrentKey = "";

  for (let attempt = 0; attempt < state.categories.length; attempt++) {
    const sourceCard = state.categories[state.categoryIndex % state.categories.length];
    state.categoryIndex++;
    if (!sourceCard) continue;
    const candidate: CategoryCard = {
      ...sourceCard,
      easy: current && normalized(sourceCard.easy) === current ? "" : sourceCard.easy,
      medium: current && normalized(sourceCard.medium) === current ? "" : sourceCard.medium,
      expert: current && normalized(sourceCard.expert) === current ? "" : sourceCard.expert,
    };
    if (!levels.some((level) => candidate[level]?.trim())) continue;

    const sourceKey = categoryCardKey(sourceCard);
    if (currentCardKey && sourceKey === currentCardKey) {
      deferredCurrentCard ??= candidate;
      deferredCurrentKey ||= sourceKey;
      continue;
    }
    nextOptions = candidate;
    nextOptionsKey = sourceKey;
    break;
  }

  if (!nextOptions && deferredCurrentCard) {
    nextOptions = deferredCurrentCard;
    nextOptionsKey = deferredCurrentKey;
  }

  state.categoryOptions = nextOptions;
  state.categoryOptionsCardKey = nextOptionsKey || null;
  state.currentCategory = null;
  state.turnStartedAt = 0;
}

`;
  return source.slice(0, begin) + implementation + source.slice(end);
});

await patch("app/api/rooms/route.ts", (source) => {
  if (!source.includes("  categoryCardKey,\n")) {
    source = requireReplace(
      source,
      "  categories,\n",
      "  categories,\n  categoryCardKey,\n",
      "import categoryCardKey",
    );
  }

  if (!source.includes("const requestedCategoryChangeCards = Number(body.categoryChangeCards);")) {
    source = requireReplace(
      source,
      /\s+const deck = makeDeck\([^;]*\);/,
      '\n      const requestedCategoryChangeCards = Number(body.categoryChangeCards);\n      const categoryChangeCards = Number.isFinite(requestedCategoryChangeCards)\n        ? Math.max(0, Math.min(20, Math.floor(requestedCategoryChangeCards)))\n        : 10;\n      const deck = makeDeck("", categoryChangeCards);',
      "crear mazo configurable",
    );
  }

  if (!source.includes("          categoryChangeCards,\n")) {
    source = requireReplace(
      source,
      '          difficulty: "mixed",',
      '          categoryChangeCards,\n          difficulty: "mixed",',
      "guardar categoryChangeCards",
    );
  }

  if (!source.includes("        currentCategoryCardKey: null,")) {
    source = requireReplace(
      source,
      "        categoryOwnerId: null,\n",
      "        categoryOwnerId: null,\n        currentCategoryCardKey: null,\n        categoryOptionsCardKey: null,\n",
      "inicializar identidad de categoría",
    );
  } else if (!source.includes("        categoryOptionsCardKey: null,")) {
    source = requireReplace(
      source,
      "        currentCategoryCardKey: null,\n",
      "        currentCategoryCardKey: null,\n        categoryOptionsCardKey: null,\n",
      "inicializar identidad de opciones",
    );
  }

  if (!source.includes("const selectedSourceAtStart = state.categories.find")) {
    source = requireReplace(
      source,
      "        state.currentCategory = state.selectedCategory;\n",
      '        state.currentCategory = state.selectedCategory;\n        const selectedSourceAtStart = state.categories.find((card) =>\n          normalized(card[state.selectedCategory!.level] ?? "") ===\n          normalized(state.selectedCategory!.text),\n        );\n        state.currentCategoryCardKey = categoryCardKey(selectedSourceAtStart);\n        state.categoryOptionsCardKey = null;\n',
      "identificar tarjeta inicial al comenzar",
    );
  }

  if (!source.includes("state.currentCategoryCardKey = state.categoryOptionsCardKey ?? categoryCardKey(options);")) {
    source = requireReplace(
      source,
      "      state.currentCategory = { level, text: options[level] };\n",
      "      state.currentCategory = { level, text: options[level] };\n      state.currentCategoryCardKey = state.categoryOptionsCardKey ?? categoryCardKey(options);\n      state.categoryOptionsCardKey = null;\n",
      "identificar tarjeta elegida en partida",
    );
  }

  return source;
});

await patch("app/page.tsx", (source) => {
  if (!source.includes("    categoryChangeCards?: number;")) {
    source = requireReplace(
      source,
      /(\s+startDelaySeconds: number;\n)/,
      "$1    categoryChangeCards?: number;\n",
      "tipo categoryChangeCards cliente",
    );
  }

  if (!source.includes("const [categoryChangeCards, setCategoryChangeCards]")) {
    source = requireReplace(
      source,
      "  const [startDelay, setStartDelay] = useState(5);\n",
      "  const [startDelay, setStartDelay] = useState(5);\n  const [categoryChangeCards, setCategoryChangeCards] = useState(10);\n",
      "estado del selector",
    );
  }

  if (!source.includes("      categoryChangeCards,\n")) {
    source = requireReplace(
      source,
      "      startDelaySeconds: startDelay,\n",
      "      startDelaySeconds: startDelay,\n      categoryChangeCards,\n",
      "enviar selector al servidor",
    );
  }

  if (!source.includes('className="category-change-count-setting"')) {
    const control = `                <label className="category-change-count-setting">
                  <span>
                    <b>Cartas de nueva categoría</b>
                    <small>Elige cuántas entran en el mazo (0–20).</small>
                  </span>
                  <span className="category-change-stepper">
                    <button type="button" aria-label="Quitar una carta de nueva categoría" onClick={() => setCategoryChangeCards((value) => Math.max(0, value - 1))}>−</button>
                    <input
                      aria-label="Cantidad de cartas de nueva categoría"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={20}
                      value={categoryChangeCards}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (Number.isFinite(value))
                          setCategoryChangeCards(Math.max(0, Math.min(20, Math.floor(value))));
                      }}
                    />
                    <button type="button" aria-label="Agregar una carta de nueva categoría" onClick={() => setCategoryChangeCards((value) => Math.min(20, value + 1))}>+</button>
                  </span>
                </label>
`;
    source = requireReplace(
      source,
      '                <div className="summary">',
      control + '                <div className="summary">',
      "control de cantidad",
    );
  }

  if (!source.includes("<span>Nueva categoría</span>")) {
    source = requireReplace(
      source,
      '                <div className="summary">\n',
      '                <div className="summary">\n                  <p>\n                    <span>Nueva categoría</span>\n                    <b>{categoryChangeCards} cartas</b>\n                  </p>\n',
      "resumen de cantidad",
    );
  }

  return source;
});

console.log("Category deck fixes v3 applied.");
