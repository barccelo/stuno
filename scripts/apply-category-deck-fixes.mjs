import { readFile, writeFile } from "node:fs/promises";

async function read(path) {
  return await readFile(path, "utf8");
}

async function writeIfChanged(path, before, after) {
  if (after !== before) await writeFile(path, after, "utf8");
}

function requiredReplace(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) {
    throw new Error(`No se encontró el bloque esperado para: ${label}`);
  }
  return source.replace(from, to);
}

function requiredRegex(source, pattern, replacement, label, already) {
  if (already && source.includes(already)) return source;
  if (!pattern.test(source)) {
    throw new Error(`No se encontró el bloque esperado para: ${label}`);
  }
  return source.replace(pattern, replacement);
}

// Game model and deck generation.
{
  const path = "lib/game.ts";
  const before = await read(path);
  let source = before;

  if (!source.includes("categoryChangeCards?: number;")) {
    source = requiredRegex(
      source,
      /(\s+startDelaySeconds: number;\n)(\s+(?:allowVoiceChat\?: boolean;\n)?\s*difficulty:)/,
      `$1    categoryChangeCards?: number;\n$2`,
      "tipar cantidad de cartas de nueva categoría",
    );
  }

  if (!source.includes("currentCategoryCardKey?: string | null;")) {
    source = requiredReplace(
      source,
      "  categoryOwnerId?: string | null;\n",
      "  categoryOwnerId?: string | null;\n  currentCategoryCardKey?: string | null;\n  selectedCategoryCardKey?: string | null;\n",
      "guardar identidad de tarjeta de categoría",
    );
  }

  source = requiredReplace(
    source,
    'export function makeDeck(idPrefix = ""): GameCard[] {',
    'export function makeDeck(idPrefix = "", categoryChangeCards = 10): GameCard[] {',
    "hacer configurable la cantidad de cartas de nueva categoría",
  );

  source = requiredRegex(
    source,
    /  \/\/ Keep the original two cards and add eighteen more: twenty total\.\n  for \(let i = 0; i < 20; i\+\+\) add\("NUEVA CATEGORÍA", "category"\);/,
    `  const requestedCategoryCards = Number(categoryChangeCards);\n  const categoryCards = Number.isFinite(requestedCategoryCards)\n    ? Math.max(0, Math.min(20, Math.floor(requestedCategoryCards)))\n    : 10;\n  for (let i = 0; i < categoryCards; i++) add("NUEVA CATEGORÍA", "category");`,
    "usar diez cartas por defecto y permitir de cero a veinte",
    "const requestedCategoryCards = Number(categoryChangeCards);",
  );

  source = requiredReplace(
    source,
    "      state.deck = makeDeck(refillId);\n",
    "      state.deck = makeDeck(refillId, state.settings.categoryChangeCards ?? 10);\n",
    "respetar la configuración al regenerar el mazo",
  );

  const chooseStart = source.indexOf("export function chooseCategory(state: GameState) {");
  const normalizedStart = source.indexOf("export function normalized(value: string)", chooseStart);
  if (chooseStart < 0 || normalizedStart < 0) {
    throw new Error("No se pudo localizar chooseCategory.");
  }
  if (!source.includes("export function categoryCardKey(")) {
    const replacement = `export function categoryCardKey(card?: CategoryCard | null) {\n  if (!card) return "";\n  return [card.title ?? "", card.easy, card.medium, card.expert]\n    .map((value) => normalized(value ?? ""))\n    .join("|");\n}\n\nexport function chooseCategory(state: GameState) {\n  const current = normalized(state.currentCategory?.text ?? "");\n  const levels = ["easy", "medium", "expert"] as const;\n  const inferredCurrentCard = current\n    ? state.categories.find((card) =>\n        levels.some((level) => normalized(card[level] ?? "") === current),\n      )\n    : null;\n  const currentCardKey =\n    state.currentCategoryCardKey || categoryCardKey(inferredCurrentCard);\n  let nextOptions: CategoryCard | null = null;\n  let deferredCurrentCard: CategoryCard | null = null;\n\n  for (let attempt = 0; attempt < state.categories.length; attempt++) {\n    const source = state.categories[state.categoryIndex % state.categories.length];\n    state.categoryIndex++;\n    if (!source) continue;\n    const candidate: CategoryCard = {\n      ...source,\n      easy: current && normalized(source.easy) === current ? "" : source.easy,\n      medium: current && normalized(source.medium) === current ? "" : source.medium,\n      expert: current && normalized(source.expert) === current ? "" : source.expert,\n    };\n    if (!levels.some((level) => candidate[level]?.trim())) continue;\n\n    if (currentCardKey && categoryCardKey(source) === currentCardKey) {\n      deferredCurrentCard ??= candidate;\n      continue;\n    }\n\n    nextOptions = candidate;\n    break;\n  }\n\n  // The card currently in play is a last resort. It is only offered when\n  // there is no other eligible category card available in this pass.\n  if (!nextOptions && deferredCurrentCard) nextOptions = deferredCurrentCard;\n\n  if (!nextOptions) {\n    const fallback = state.categories[state.categoryIndex % state.categories.length] ?? null;\n    if (fallback) {\n      state.categoryIndex++;\n      nextOptions = {\n        ...fallback,\n        easy: current && normalized(fallback.easy) === current ? "" : fallback.easy,\n        medium: current && normalized(fallback.medium) === current ? "" : fallback.medium,\n        expert: current && normalized(fallback.expert) === current ? "" : fallback.expert,\n      };\n    }\n  }\n\n  state.categoryOptions = nextOptions;\n  state.currentCategory = null;\n  state.turnStartedAt = 0;\n}\n`;
    source = source.slice(0, chooseStart) + replacement + source.slice(normalizedStart);
  }

  await writeIfChanged(path, before, source);
}

// Server room creation and category-card identity.
{
  const path = "app/api/rooms/route.ts";
  const before = await read(path);
  let source = before;

  if (!source.includes("  categoryCardKey,\n")) {
    source = requiredReplace(
      source,
      "  categories,\n",
      "  categories,\n  categoryCardKey,\n",
      "importar categoryCardKey",
    );
  }

  source = requiredReplace(
    source,
    "      const deck = makeDeck();\n",
    `      const requestedCategoryChangeCards = Number(body.categoryChangeCards);\n      const categoryChangeCards = Number.isFinite(requestedCategoryChangeCards)\n        ? Math.max(0, Math.min(20, Math.floor(requestedCategoryChangeCards)))\n        : 10;\n      const deck = makeDeck("", categoryChangeCards);\n`,
    "crear el mazo con la cantidad elegida",
  );

  if (!source.includes("          categoryChangeCards,\n")) {
    const marker = "          allowVoiceChat: Boolean(body.allowVoiceChat),\n";
    source = requiredReplace(
      source,
      marker,
      marker + "          categoryChangeCards,\n",
      "guardar cantidad de cartas en ajustes",
    );
  }

  if (!source.includes("        currentCategoryCardKey: null,\n")) {
    source = requiredReplace(
      source,
      "        categoryOwnerId: null,\n",
      "        categoryOwnerId: null,\n        currentCategoryCardKey: null,\n        selectedCategoryCardKey: categoryCardKey(roomCategories[0]),\n",
      "inicializar identidad de tarjeta",
    );
  }

  if (!source.includes("      state.selectedCategoryCardKey = categoryCardKey(randomCard);")) {
    source = requiredReplace(
      source,
      `      state.selectedCategory = {\n        level: randomLevel,\n        text: randomCard[randomLevel],\n      };\n`,
      `      state.selectedCategory = {\n        level: randomLevel,\n        text: randomCard[randomLevel],\n      };\n      state.selectedCategoryCardKey = categoryCardKey(randomCard);\n`,
      "guardar tarjeta al mezclar categorías",
    );
  }

  if (!source.includes("        state.selectedCategoryCardKey = categoryCardKey(selectedCard);")) {
    source = requiredReplace(
      source,
      `      if (selectedCard)\n        state.selectedCategory = { level, text: selectedCard[level] };\n`,
      `      if (selectedCard) {\n        state.selectedCategory = { level, text: selectedCard[level] };\n        state.selectedCategoryCardKey = categoryCardKey(selectedCard);\n      }\n`,
      "guardar tarjeta al seleccionar categoría inicial",
    );
  }

  if (!source.includes("        state.currentCategoryCardKey = state.selectedCategoryCardKey")) {
    source = requiredReplace(
      source,
      "        state.currentCategory = state.selectedCategory;\n",
      `        state.currentCategory = state.selectedCategory;\n        state.currentCategoryCardKey = state.selectedCategoryCardKey ?? null;\n`,
      "trasladar identidad de la categoría inicial",
    );
  }

  if (!source.includes("      state.currentCategoryCardKey = categoryCardKey(options);")) {
    source = requiredReplace(
      source,
      "      state.currentCategory = { level, text: options[level] };\n",
      `      state.currentCategory = { level, text: options[level] };\n      state.currentCategoryCardKey = categoryCardKey(options);\n`,
      "guardar identidad de la tarjeta elegida durante la partida",
    );
  }

  await writeIfChanged(path, before, source);
}

// Creation UI and client types.
{
  const path = "app/page.tsx";
  const before = await read(path);
  let source = before;

  if (!source.includes("    categoryChangeCards?: number;")) {
    source = requiredRegex(
      source,
      /(\s+startDelaySeconds: number;\n)(\s+allowVoiceChat\?: boolean;\n)/,
      `$1    categoryChangeCards?: number;\n$2`,
      "tipar categoryChangeCards en Room",
    );
  }

  if (!source.includes("const [categoryChangeCards, setCategoryChangeCards]")) {
    source = requiredReplace(
      source,
      "  const [startDelay, setStartDelay] = useState(5);\n",
      `  const [startDelay, setStartDelay] = useState(5);\n  const [categoryChangeCards, setCategoryChangeCards] = useState(10);\n`,
      "guardar cantidad de cartas en el formulario",
    );
  }

  if (!source.includes("      categoryChangeCards,\n")) {
    source = requiredReplace(
      source,
      "      startDelaySeconds: startDelay,\n      allowVoiceChat,\n",
      "      startDelaySeconds: startDelay,\n      categoryChangeCards,\n      allowVoiceChat,\n",
      "enviar cantidad de cartas al crear sala",
    );
  }

  if (!source.includes('className="category-change-count-setting"')) {
    const timingBlock = `                  <TimeWheel\n                    label="Tiempo para ordenar la mano"\n                    value={startDelay}\n                    min={3}\n                    max={10}\n                    onChange={setStartDelay}\n                  />\n                </div>\n`;
    const timingReplacement = `                  <TimeWheel\n                    label="Tiempo para ordenar la mano"\n                    value={startDelay}\n                    min={3}\n                    max={10}\n                    onChange={setStartDelay}\n                  />\n                </div>\n                <label className="category-change-count-setting">\n                  <span>\n                    <b>Cartas de nueva categoría</b>\n                    <small>Elige cuántas entran en el mazo (0–20).</small>\n                  </span>\n                  <span className="category-change-stepper">\n                    <button\n                      type="button"\n                      aria-label="Quitar una carta de nueva categoría"\n                      onClick={() => setCategoryChangeCards((value) => Math.max(0, value - 1))}\n                    >\n                      −\n                    </button>\n                    <input\n                      aria-label="Cantidad de cartas de nueva categoría"\n                      type="number"\n                      inputMode="numeric"\n                      min={0}\n                      max={20}\n                      value={categoryChangeCards}\n                      onChange={(event) => {\n                        const value = Number(event.target.value);\n                        if (Number.isFinite(value))\n                          setCategoryChangeCards(Math.max(0, Math.min(20, Math.floor(value))));\n                      }}\n                    />\n                    <button\n                      type="button"\n                      aria-label="Agregar una carta de nueva categoría"\n                      onClick={() => setCategoryChangeCards((value) => Math.min(20, value + 1))}\n                    >\n                      +\n                    </button>\n                  </span>\n                </label>\n`;
    source = requiredReplace(
      source,
      timingBlock,
      timingReplacement,
      "mostrar selector de cartas de nueva categoría",
    );
  }

  if (!source.includes("<span>Nueva categoría</span>")) {
    source = requiredReplace(
      source,
      `                  <p>\n                    <span>Categorías</span>\n`,
      `                  <p>\n                    <span>Nueva categoría</span>\n                    <b>{categoryChangeCards} cartas</b>\n                  </p>\n                  <p>\n                    <span>Categorías</span>\n`,
      "mostrar cantidad en el resumen",
    );
  }

  await writeIfChanged(path, before, source);
}

console.log("Category deck fixes applied.");
