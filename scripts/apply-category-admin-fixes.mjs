import { readFile, writeFile } from "node:fs/promises";

async function patchFile(path, replacements) {
  let source = await readFile(path, "utf8");
  let changed = false;
  for (const { from, to, label, all = false } of replacements) {
    if (source.includes(to)) continue;
    if (!source.includes(from)) throw new Error(`No se encontró el bloque esperado para: ${label}`);
    source = all ? source.split(from).join(to) : source.replace(from, to);
    changed = true;
  }
  if (changed) await writeFile(path, source, "utf8");
}

await patchFile("app/page.tsx", [
  {
    label: "guardar títulos iniciales de categorías",
    from: 'const starterCategories = DEFAULT_CATEGORY_CARDS.map(\n  ({ easy, medium, expert }) => [easy, medium, expert],\n);',
    to: 'const starterCategories = DEFAULT_CATEGORY_CARDS.map(\n  ({ easy, medium, expert }) => [easy, medium, expert],\n);\nconst starterCategoryTitles = DEFAULT_CATEGORY_CARDS.map(\n  (card) => card.title?.trim() || card.easy || card.medium || card.expert || "Categoría",\n);',
  },
  {
    label: "estado de títulos de categorías",
    from: '  const [categories, setCategories] = useState(starterCategories);\n  const [room, setRoom] = useState<Room | null>(null);',
    to: '  const [categories, setCategories] = useState(starterCategories);\n  const [categoryTitles, setCategoryTitles] = useState(starterCategoryTitles);\n  const [room, setRoom] = useState<Room | null>(null);',
  },
  {
    label: "buscador del administrador de categorías",
    from: '  const [categorySearch, setCategorySearch] = useState("");\n  const [categoryAdminKey, setCategoryAdminKey] = useState("");',
    to: '  const [categorySearch, setCategorySearch] = useState("");\n  const [categoryEditorSearch, setCategoryEditorSearch] = useState("");\n  const [categoryAdminKey, setCategoryAdminKey] = useState("");',
  },
  {
    label: "cargar títulos desde el catálogo global",
    from: '        const data = (await response.json()) as {\n          categories?: { easy: string; medium: string; expert: string }[];\n        };\n        if (active && data.categories?.length)\n          setCategories(\n            data.categories.map(({ easy, medium, expert }) => [\n              easy,\n              medium,\n              expert,\n            ]),\n          );',
    to: '        const data = (await response.json()) as {\n          categories?: { title?: string; easy: string; medium: string; expert: string }[];\n        };\n        if (active && data.categories?.length) {\n          setCategories(\n            data.categories.map(({ easy, medium, expert }) => [\n              easy,\n              medium,\n              expert,\n            ]),\n          );\n          setCategoryTitles(\n            data.categories.map((card) =>\n              card.title?.trim() || card.easy || card.medium || card.expert || "Categoría",\n            ),\n          );\n        }',
  },
  {
    label: "crear títulos de respaldo desde almacenamiento local",
    from: '          if (Array.isArray(parsed)) setCategories(parsed as string[][]);',
    to: '          if (Array.isArray(parsed)) {\n            const savedCategories = parsed as string[][];\n            setCategories(savedCategories);\n            setCategoryTitles(\n              savedCategories.map((card, index) =>\n                starterCategoryTitles[index] ?? card.find((value) => value?.trim()) ?? `Tarjeta ${index + 1}`,\n              ),\n            );\n          }',
  },
  {
    label: "guardar títulos con las categorías globales",
    from: '          categories: categories.map(([easy, medium, expert]) => ({\n            easy,\n            medium,\n            expert,\n          })),',
    to: '          categories: categories.map(([easy, medium, expert], index) => ({\n            title: categoryTitles[index]?.trim() || easy || medium || expert || `Tarjeta ${index + 1}`,\n            easy,\n            medium,\n            expert,\n          })),',
  },
  {
    label: "tipar títulos devueltos al guardar categorías",
    from: '        categories?: { easy: string; medium: string; expert: string }[];\n      };',
    to: '        categories?: { title?: string; easy: string; medium: string; expert: string }[];\n      };',
  },
  {
    label: "actualizar títulos tras guardar categorías",
    from: '      if (data.categories)\n        setCategories(\n          data.categories.map(({ easy, medium, expert }) => [\n            easy,\n            medium,\n            expert,\n          ]),\n        );',
    to: '      if (data.categories) {\n        setCategories(\n          data.categories.map(({ easy, medium, expert }) => [\n            easy,\n            medium,\n            expert,\n          ]),\n        );\n        setCategoryTitles(\n          data.categories.map((card) =>\n            card.title?.trim() || card.easy || card.medium || card.expert || "Categoría",\n          ),\n        );\n      }',
  },
  {
    label: "compartir enlace con menú nativo",
    from: '  function show(message: string) {\n    setToast(message);\n    window.setTimeout(() => setToast(""), 2000);\n  }',
    to: '  function show(message: string) {\n    setToast(message);\n    window.setTimeout(() => setToast(""), 2000);\n  }\n  async function shareRoomLink(code: string) {\n    const url = `${location.origin}${location.pathname}?join=1&room=${code}&new=1`;\n    if (navigator.share) {\n      try {\n        await navigator.share({\n          title: "STUNO",\n          text: `Únete a mi partida de STUNO · Sala ${code}`,\n          url,\n        });\n        return;\n      } catch (error) {\n        if (error instanceof DOMException && error.name === "AbortError") return;\n      }\n    }\n    try {\n      await navigator.clipboard.writeText(url);\n      show(`Enlace de jugadores copiado · ${code}`);\n    } catch {\n      show("No se pudo abrir el menú para compartir.");\n    }\n  }',
  },
  {
    label: "usar menú nativo en botones de compartir",
    from: '              onClick={() =>\n                navigator.clipboard\n                  ?.writeText(\n                    `${location.origin}${location.pathname}?join=1&room=${room.code}&new=1`,\n                  )\n                  .then(() =>\n                    show(`Enlace de jugadores copiado · ${room.code}`),\n                  )\n              }',
    to: '              onClick={() => void shareRoomLink(room.code)}',
    all: true,
  },
  {
    label: "describir botones de compartir",
    from: 'aria-label="Copiar enlace para jugadores"\n              title="Copiar enlace para jugadores"',
    to: 'aria-label="Compartir enlace para jugadores"\n              title="Compartir enlace para jugadores"',
    all: true,
  },
  {
    label: "enviar títulos a la sala",
    from: '    const allCategories = categories.map(([easy, medium, expert]) => ({\n      easy,\n      medium,\n      expert,\n    }));',
    to: '    const allCategories = categories.map(([easy, medium, expert], index) => ({\n      title: categoryTitles[index]?.trim() || easy || medium || expert || `Tarjeta ${index + 1}`,\n      easy,\n      medium,\n      expert,\n    }));',
  },
  {
    label: "pasar títulos al selector de sets",
    from: 'fallbackCategories={categories.map(([easy, medium, expert]) => ({ easy, medium, expert }))}',
    to: 'fallbackCategories={categories.map(([easy, medium, expert], index) => ({ title: categoryTitles[index], easy, medium, expert }))}',
  },
  {
    label: "contar sólo opciones de categoría no vacías",
    from: '<b>{(selectedGameCategories === null ? (normalGameCategories?.length ?? categories.length) : selectedGameCategories.length) * 3} incluidas</b>',
    to: '<b>{selectedGameCategories === null\n                      ? (normalGameCategories?.reduce((sum, card) => sum + [card.easy, card.medium, card.expert].filter((value) => value.trim()).length, 0) ?? categories.flat().filter((value) => value.trim()).length)\n                      : selectedGameCategories.reduce((sum, card) => sum + [card.easy, card.medium, card.expert].filter((value) => value.trim()).length, 0)} incluidas</b>',
  },
  {
    label: "agregar nuevas tarjetas al inicio",
    from: '                  onClick={() =>\n                    setCategories([\n                      ...categories,\n                      ["Nueva categoría", "Nivel medio", "Nivel experto"],\n                    ])\n                  }',
    to: '                  onClick={() => {\n                    setCategories([["", "", ""], ...categories]);\n                    setCategoryTitles(["Nueva tarjeta", ...categoryTitles]);\n                    setCategoryEditorSearch("");\n                    window.scrollTo({ top: 0, behavior: "smooth" });\n                    window.setTimeout(() =>\n                      document.querySelector<HTMLInputElement>(".category-title-field input")?.focus(),\n                    80);\n                  }}',
  },
  {
    label: "buscador y títulos en administrador",
    from: '              <p className="panel-intro">\n                Cada tarjeta reúne una opción fácil, una media y una experta.\n                Al guardar, los cambios estarán disponibles en todos los\n                dispositivos.\n              </p>\n              <div className="category-list">\n            {categories.map((category, index) => (\n              <article className="category-row" key={index}>\n                <span className="row-number">\n                  {String(index + 1).padStart(2, "0")}\n                </span>',
    to: '              <p className="panel-intro">\n                Cada tarjeta tiene un título y puede incluir una, dos o tres opciones.\n                Al guardar, los cambios estarán disponibles en todos los dispositivos.\n              </p>\n              <label className="category-admin-search">\n                <Icon name="search" size={18} />\n                <input\n                  value={categoryEditorSearch}\n                  onChange={(event) => setCategoryEditorSearch(event.target.value)}\n                  placeholder="Buscar por título o categoría…"\n                />\n              </label>\n              <div className="category-list">\n            {categories\n              .map((category, index) => ({ category, index }))\n              .filter(({ category, index }) => {\n                const query = categoryEditorSearch.trim().toLocaleLowerCase("es");\n                if (!query) return true;\n                return [categoryTitles[index] ?? "", ...category]\n                  .some((value) => value.toLocaleLowerCase("es").includes(query));\n              })\n              .map(({ category, index }) => (\n              <article className="category-row" key={index}>\n                <span className="row-number">\n                  {String(index + 1).padStart(2, "0")}\n                </span>\n                <div className="category-card-fields">\n                  <label className="category-title-field">\n                    <small>TÍTULO</small>\n                    <input\n                      value={categoryTitles[index] ?? ""}\n                      onChange={(event) =>\n                        setCategoryTitles(\n                          categoryTitles.map((value, titleIndex) =>\n                            titleIndex === index ? event.target.value : value,\n                          ),\n                        )\n                      }\n                      placeholder="Nombre de la tarjeta"\n                    />\n                  </label>\n                  <div className="category-option-grid">',
  },
  {
    label: "cerrar rejilla interna de opciones",
    from: '                    />\n                  </label>\n                ))}\n                <button\n                  className="delete-button"',
    to: '                    />\n                  </label>\n                ))}\n                  </div>\n                </div>\n                <button\n                  className="delete-button"',
  },
  {
    label: "eliminar también título de la tarjeta",
    from: '                  onClick={() =>\n                    setCategories(\n                      categories.filter((_, itemIndex) => itemIndex !== index),\n                    )\n                  }',
    to: '                  onClick={() => {\n                    setCategories(\n                      categories.filter((_, itemIndex) => itemIndex !== index),\n                    );\n                    setCategoryTitles(\n                      categoryTitles.filter((_, itemIndex) => itemIndex !== index),\n                    );\n                  }}',
  },
  {
    label: "botón flotante para subir al inicio",
    from: '              </div>\n            </>\n          )}\n        </section>\n      ) : (',
    to: '              </div>\n              <button\n                type="button"\n                className="category-scroll-top"\n                aria-label="Ir al inicio"\n                title="Ir al inicio"\n                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}\n              >\n                <span aria-hidden="true">↑</span>\n              </button>\n            </>\n          )}\n        </section>\n      ) : (',
  },
  {
    label: "ocultar niveles vacíos al elegir categoría",
    from: '{(["easy", "medium", "expert"] as const).map((level) => (',
    to: '{(["easy", "medium", "expert"] as const)\n                .filter((level) => Boolean(room.categoryOptions?.[level]?.trim()))\n                .map((level) => (',
  },
  {
    label: "permitir K en modo Contiene en interfaz",
    from: '["Ñ", "Y", "Q", "Z", "X"].includes(hand.find((card) => card.id === selected)?.label ?? "")',
    to: '["Ñ", "Y", "Q", "Z", "X", "K"].includes(hand.find((card) => card.id === selected)?.label ?? "")',
  },
]);

await patchFile("app/api/rooms/route.ts", [
  {
    label: "permitir K en modo Contiene en servidor",
    from: '["Ñ", "Y", "Q", "Z", "X"].includes(card.label.toUpperCase())',
    to: '["Ñ", "Y", "Q", "Z", "X", "K"].includes(card.label.toUpperCase())',
  },
  {
    label: "seleccionar categoría inicial no vacía",
    from: '      const roomCategories = shuffle(categories(custom));\n      const state: GameState = {',
    to: '      const roomCategories = shuffle(categories(custom));\n      const firstCategoryOption = roomCategories\n        .flatMap((card) => (["easy", "medium", "expert"] as const)\n          .filter((level) => card[level]?.trim())\n          .map((level) => ({ level, text: card[level] })))\n        [0] ?? null;\n      const state: GameState = {',
  },
  {
    label: "usar categoría inicial válida",
    from: '        selectedCategory: {\n          level: "easy",\n          text: roomCategories[0]?.easy ?? "Categoría",\n        },',
    to: '        selectedCategory: firstCategoryOption,',
  },
  {
    label: "mezclar sólo categorías no vacías",
    from: '      state.categories = shuffle(state.categories);\n      state.categoryIndex = 0;\n      const randomCard =\n        state.categories[Math.floor(Math.random() * state.categories.length)];\n      const levels = ["easy", "medium", "expert"] as const;\n      const randomLevel = levels[Math.floor(Math.random() * levels.length)];\n      state.selectedCategory = {\n        level: randomLevel,\n        text: randomCard[randomLevel],\n      };\n      state.message = `Categoría seleccionada: ${randomCard[randomLevel]}.`;',
    to: '      state.categories = shuffle(state.categories);\n      state.categoryIndex = 0;\n      const options = state.categories.flatMap((card) =>\n        (["easy", "medium", "expert"] as const)\n          .filter((level) => card[level]?.trim())\n          .map((level) => ({ level, text: card[level] })),\n      );\n      const selected = options[Math.floor(Math.random() * options.length)];\n      if (!selected)\n        return Response.json({ error: "No hay categorías disponibles" }, { status: 409 });\n      state.selectedCategory = selected;\n      state.message = `Categoría seleccionada: ${selected.text}.`;',
  },
  {
    label: "rechazar nivel vacío antes de comenzar",
    from: '      const selectedCard = state.categories[selectedIndex];\n      if (selectedCard)\n        state.selectedCategory = { level, text: selectedCard[level] };\n      state.categoryIndex = 0;',
    to: '      const selectedCard = state.categories[selectedIndex];\n      const selectedText = selectedCard?.[level]?.trim();\n      if (!selectedCard || !selectedText)\n        return Response.json({ error: "Esa opción de categoría está vacía" }, { status: 400 });\n      state.selectedCategory = { level, text: selectedText };\n      state.categoryIndex = 0;',
  },
  {
    label: "rechazar nivel vacío durante la partida",
    from: '      if (!options)\n        return Response.json(\n          { error: "No hay categorías por elegir" },\n          { status: 409 },\n        );\n      state.currentCategory = { level, text: options[level] };',
    to: '      if (!options)\n        return Response.json(\n          { error: "No hay categorías por elegir" },\n          { status: 409 },\n        );\n      const optionText = options[level]?.trim();\n      if (!optionText)\n        return Response.json({ error: "Esa opción de categoría está vacía" }, { status: 400 });\n      state.currentCategory = { level, text: optionText };',
  },
  {
    label: "usar texto validado en evento de categoría",
    from: '          label: options[level],',
    to: '          label: optionText,',
  },
]);

await patchFile("app/TurnNoticeWatcher.tsx", [
  {
    label: "fallback de Contiene para X y K",
    from: '      if (letter !== "X") {',
    to: '      if (!letter || !["X", "K"].includes(letter)) {',
  },
]);
