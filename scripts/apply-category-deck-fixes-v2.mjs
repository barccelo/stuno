import { readFile, writeFile } from "node:fs/promises";

async function read(path) {
  return readFile(path, "utf8");
}

async function writeIfChanged(path, before, after) {
  if (after !== before) await writeFile(path, after, "utf8");
}

function replaceRequired(source, pattern, replacement, label, already) {
  if (already && source.includes(already)) return source;
  if (typeof pattern === "string") {
    if (!source.includes(pattern))
      throw new Error("No se encontró el bloque esperado para: " + label);
    return source.replace(pattern, replacement);
  }
  pattern.lastIndex = 0;
  if (!pattern.test(source))
    throw new Error("No se encontró el bloque esperado para: " + label);
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

// Modelo de juego, mazo configurable y prioridad de tarjetas de categorías.
{
  const path = "lib/game.ts";
  const before = await read(path);
  let source = before;

  if (!source.includes("categoryChangeCards?: number;")) {
    source = replaceRequired(
      source,
      /(\s+startDelaySeconds: number;\n)/,
      "$1    categoryChangeCards?: number;\n",
      "tipar cantidad de cartas de nueva categoría",
    );
  }

  if (!source.includes("currentCategoryCardKey?: string | null;")) {
    source = replaceRequired(
      source,
      "  categoryOwnerId?: string | null;\n",
      "  categoryOwnerId?: string | null;\n  currentCategoryCardKey?: string | null;\n  categoryOptionsCardKey?: string | null;\n  selectedCategoryCardKey?: string | null;\n",
      "guardar identidad de tarjetas de categoría",
    );
  } else if (!source.includes("categoryOptionsCardKey?: string | null;")) {
    source = replaceRequired(
      source,
      "  currentCategoryCardKey?: string | null;\n",
      "  currentCategoryCardKey?: string | null;\n  categoryOptionsCardKey?: string | null;\n",
      "guardar identidad de opciones de categoría",
    );
  }

  source = replaceRequired(
    source,
    /export function makeDeck\(idPrefix = ""(?:,\s*categoryChangeCards = \d+)?\): GameCard\[\] \{/,
    'export function makeDeck(idPrefix = "", categoryChangeCards = 10): GameCard[] {',
    "hacer configurable el mazo",
    'export function makeDeck(idPrefix = "", categoryChangeCards = 10): GameCard[] {'
  );

  if (!source.includes("const requestedCategoryCards = Number(categoryChangeCards);")) {
    source = replaceRequired(
      source,
      /\s*(?:\/\/[^\n]*\n\s*)?for \(let i = 0; i < 20; i\+\+\) add\("NUEVA CATEGORÍA", "category"\);/,
      '\n  const requestedCategoryCards = Number(categoryChangeCards);\n  const categoryCards = Number.isFinite(requestedCategoryCards)\n    ? Math.max(0, Math.min(20, Math.floor(requestedCategoryCards)))\n    : 10;\n  for (let i = 0; i < categoryCards; i++) add("NUEVA CATEGORÍA", "category");',
      "usar diez cartas por defecto",
    );
  }

  source = replaceRequired(
    source,
    "      state.deck = makeDeck(refillId);\n",
    "      state.deck = makeDeck(refillId, state.settings.categoryChangeCards ?? 10);\n",
    "respetar cantidad al regenerar el mazo",
    "state.settings.categoryChangeCards ?? 10"
  );

  if (!source.includes("export function categoryCardKey(")) {
    const marker = "export function chooseCategory(state: GameState) {";
    source = replaceRequired(
      source,
      marker,
      'export function categoryCardKey(card?: CategoryCard | null) {\n  if (!card) return "";\n  return [card.title ?? "", card.easy, card.medium, card.expert]\n    .map((value) => normalized(value ?? ""))\n    .join("|");\n}\n\n' + marker,
      "crear identificador estable de tarjeta de categoría",
    );
  }

  const chooseStart = source.indexOf("export function chooseCategory(state: GameState) {");
  const normalizedStart = source.indexOf("export function normalized(value: string)", chooseStart);
  if (chooseStart < 0 || normalizedStart < 0)
    throw new Error("No se pudo localizar chooseCategory.");

  const chooseImpl = [
    "export function chooseCategory(state: GameState) {",
    '  const current = normalized(state.currentCategory?.text ?? "");',
    '  const levels = ["easy", "medium", "expert"] as const;',
    "  const inferredCurrentCard = current",
    "    ? state.categories.find((card) =>",
    '        levels.some((level) => normalized(card[level] ?? "") === current),',
    "      )",
    "    : null;",
    "  const currentCardKey =",
    "    state.currentCategoryCardKey || categoryCardKey(inferredCurrentCard);",
    "  let nextOptions: CategoryCard | null = null;",
    '  let nextOptionsKey = "";',
    "  let deferredCurrentCard: CategoryCard | null = null;",
    '  let deferredCurrentKey = "";',
    "",
    "  for (let attempt = 0; attempt < state.categories.length; attempt++) {",
    "    const source = state.categories[state.categoryIndex % state.categories.length];",
    "    state.categoryIndex++;",
    "    if (!source) continue;",
    "    const candidate: CategoryCard = {",
    "      ...source,",
    '      easy: current && normalized(source.easy) === current ? "" : source.easy,',
    '      medium: current && normalized(source.medium) === current ? "" : source.medium,',
    '      expert: current && normalized(source.expert) === current ? "" : source.expert,',
    "    };",
    "    if (!levels.some((level) => candidate[level]?.trim())) continue;",
    "",
    "    const sourceKey = categoryCardKey(source);",
    "    if (currentCardKey && sourceKey === currentCardKey) {",
    "      deferredCurrentCard ??= candidate;",
    "      deferredCurrentKey ||= sourceKey;",
    "      continue;",
    "    }",
    "",
    "    nextOptions = candidate;",
    "    nextOptionsKey = sourceKey;",
    "    break;",
    "  }",
    "",
    "  // La tarjeta que estaba en juego queda al final de la prioridad.",
    "  if (!nextOptions && deferredCurrentCard) {",
    "    nextOptions = deferredCurrentCard;",
    "    nextOptionsKey = deferredCurrentKey;",
    "  }",
    "",
    "  if (!nextOptions) {",
    "    const fallback = state.categories[state.categoryIndex % state.categories.length] ?? null;",
    "    if (fallback) {",
    "      state.categoryIndex++;",
    "      nextOptions = {",
    "        ...fallback,",
    '        easy: current && normalized(fallback.easy) === current ? "" : fallback.easy,',
    '        medium: current && normalized(fallback.medium) === current ? "" : fallback.medium,',
    '        expert: current && normalized(fallback.expert) === current ? "" : fallback.expert,',
    "      };",
    "      nextOptionsKey = categoryCardKey(fallback);",
    "    }",
    "  }",
    "",
    "  state.categoryOptions = nextOptions;",
    "  state.categoryOptionsCardKey = nextOptionsKey || null;",
    "  state.currentCategory = null;",
    "  state.turnStartedAt = 0;",
    "}",
    "",
  ].join("\n");

  source = source.slice(0, chooseStart) + chooseImpl + source.slice(normalizedStart);
  await writeIfChanged(path, before, source);
}

// Servidor: crear el mazo con la cantidad elegida y conservar la identidad de la tarjeta.
{
  const path = "app/api/rooms/route.ts";
  const before = await read(path);
  let source = before;

  if (!source.includes("  categoryCardKey,\n")) {
    source = replaceRequired(
      source,
      "  categories,\n",
      "  categories,\n  categoryCardKey,\n",
      "importar categoryCardKey",
    );
  }

  if (!source.includes("const requestedCategoryChangeCards = Number(body.categoryChangeCards);")) {
    source = replaceRequired(
      source,
      /\s+const deck = makeDeck\([^;]*\);/,
      '\n      const requestedCategoryChangeCards = Number(body.categoryChangeCards);\n      const categoryChangeCards = Number.isFinite(requestedCategoryChangeCards)\n        ? Math.max(0, Math.min(20, Math.floor(requestedCategoryChangeCards)))\n        : 10;\n      const deck = makeDeck("", categoryChangeCards);',
      "crear mazo con cantidad configurable",
    );
  }

  if (!source.includes("          categoryChangeCards,\n")) {
    source = replaceRequired(
      source,
      '          difficulty: "mixed",',
      '          categoryChangeCards,\n          difficulty: "mixed",',
      "guardar cantidad de cartas en ajustes",
    );
  }

  if (!source.includes("        currentCategoryCardKey: null,")) {
    source = replaceRequired(
      source,
      "        categoryOwnerId: null,\n",
      "        categoryOwnerId: null,\n        currentCategoryCardKey: null,\n        categoryOptionsCardKey: null,\n        selectedCategoryCardKey: null,\n",
      "inicializar identidad de tarjetas",
    );
  } else if (!source.includes("        categoryOptionsCardKey: null,")) {
    source = replaceRequired(
      source,
      "        currentCategoryCardKey: null,\n",
      "        currentCategoryCardKey: null,\n        categoryOptionsCardKey: null,\n",
      "inicializar identidad de opciones",
    );
  }

  if (!source.includes("state.selectedCategoryCardKey = categoryCardKey(selectedSource);")) {
    source = replaceRequired(
      source,
      "      await getDb()\n        .insert(rooms)",
      '      if (state.selectedCategory) {\n        const selectedSource = roomCategories.find((card) =>\n          normalized(card[state.selectedCategory!.level] ?? "") ===\n          normalized(state.selectedCategory!.text),\n        );\n        state.selectedCategoryCardKey = categoryCardKey(selectedSource);\n      }\n      await getDb()\n        .insert(rooms)',
      "recordar tarjeta inicial seleccionada",
    );
  }

  if (!source.includes("state.selectedCategoryCardKey = categoryCardKey(randomCard);")) {
    source = replaceRequired(
      source,
      /(state\.selectedCategory\s*=\s*\{\s*level:\s*randomLevel,\s*text:\s*randomCard\[randomLevel\],\s*\};)/m,
      "$1\n      state.selectedCategoryCardKey = categoryCardKey(randomCard);",
      "guardar tarjeta al mezclar categorías",
    );
  }

  if (!source.includes("state.selectedCategoryCardKey = categoryCardKey(selectedCard);")) {
    source = replaceRequired(
      source,
      /if \(selectedCard\)\s*state\.selectedCategory\s*=\s*\{ level, text: selectedCard\[level\] \};/m,
      'if (selectedCard) {\n        state.selectedCategory = { level, text: selectedCard[level] };\n        state.selectedCategoryCardKey = categoryCardKey(selectedCard);\n      }',
      "guardar tarjeta al seleccionar categoría inicial",
    );
  }

  if (!source.includes("state.currentCategoryCardKey = state.selectedCategoryCardKey ?? null;")) {
    source = replaceRequired(
      source,
      "        state.currentCategory = state.selectedCategory;\n",
      "        state.currentCategory = state.selectedCategory;\n        state.currentCategoryCardKey = state.selectedCategoryCardKey ?? null;\n        state.categoryOptionsCardKey = null;\n",
      "trasladar identidad de la categoría inicial",
    );
  }

  if (!source.includes("state.currentCategoryCardKey = state.categoryOptionsCardKey ?? categoryCardKey(options);")) {
    source = replaceRequired(
      source,
      "      state.currentCategory = { level, text: options[level] };\n",
      "      state.currentCategory = { level, text: options[level] };\n      state.currentCategoryCardKey = state.categoryOptionsCardKey ?? categoryCardKey(options);\n      state.categoryOptionsCardKey = null;\n",
      "guardar identidad de tarjeta elegida durante la partida",
    );
  }

  await writeIfChanged(path, before, source);
}

// Cliente: selector 0–20, diez por defecto y envío de la configuración.
{
  const path = "app/page.tsx";
  const before = await read(path);
  let source = before;

  if (!source.includes("    categoryChangeCards?: number;")) {
    source = replaceRequired(
      source,
      /(\s+startDelaySeconds: number;\n)/,
      "$1    categoryChangeCards?: number;\n",
      "tipar categoryChangeCards en Room",
    );
  }

  if (!source.includes("const [categoryChangeCards, setCategoryChangeCards]")) {
    source = replaceRequired(
      source,
      "  const [startDelay, setStartDelay] = useState(5);\n",
      "  const [startDelay, setStartDelay] = useState(5);\n  const [categoryChangeCards, setCategoryChangeCards] = useState(10);\n",
      "guardar cantidad en formulario",
    );
  }

  if (!source.includes("      categoryChangeCards,\n")) {
    source = replaceRequired(
      source,
      "      startDelaySeconds: startDelay,\n",
      "      startDelaySeconds: startDelay,\n      categoryChangeCards,\n",
      "enviar cantidad al crear sala",
    );
  }

  if (!source.includes('className="category-change-count-setting"')) {
    const control = [
      '                <label className="category-change-count-setting">',
      "                  <span>",
      "                    <b>Cartas de nueva categoría</b>",
      "                    <small>Elige cuántas entran en el mazo (0–20).</small>",
      "                  </span>",
      '                  <span className="category-change-stepper">',
      "                    <button",
      '                      type="button"',
      '                      aria-label="Quitar una carta de nueva categoría"',
      "                      onClick={() => setCategoryChangeCards((value) => Math.max(0, value - 1))}",
      "                    >",
      "                      −",
      "                    </button>",
      "                    <input",
      '                      aria-label="Cantidad de cartas de nueva categoría"',
      '                      type="number"',
      '                      inputMode="numeric"',
      "                      min={0}",
      "                      max={20}",
      "                      value={categoryChangeCards}",
      "                      onChange={(event) => {",
      "                        const value = Number(event.target.value);",
      "                        if (Number.isFinite(value))",
      "                          setCategoryChangeCards(Math.max(0, Math.min(20, Math.floor(value))));",
      "                      }}",
      "                    />",
      "                    <button",
      '                      type="button"',
      '                      aria-label="Agregar una carta de nueva categoría"',
      "                      onClick={() => setCategoryChangeCards((value) => Math.min(20, value + 1))}",
      "                    >",
      "                      +",
      "                    </button>",
      "                  </span>",
      "                </label>",
      "",
    ].join("\n");
    source = replaceRequired(
      source,
      '                <div className="summary">',
      control + '                <div className="summary">',
      "mostrar selector de cartas de nueva categoría",
    );
  }

  if (!source.includes("<span>Nueva categoría</span>")) {
    source = replaceRequired(
      source,
      '                <div className="summary">\n',
      '                <div className="summary">\n                  <p>\n                    <span>Nueva categoría</span>\n                    <b>{categoryChangeCards} cartas</b>\n                  </p>\n',
      "mostrar cantidad en resumen",
    );
  }

  await writeIfChanged(path, before, source);
}

console.log("Category deck fixes v2 applied.");
