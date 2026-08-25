import { readFile, writeFile } from "node:fs/promises";

async function patchFile(path, replacements) {
  let source = await readFile(path, "utf8");
  let changed = false;
  for (const { from, to, label } of replacements) {
    if (source.includes(to)) continue;
    if (!source.includes(from)) throw new Error(`No se encontró el bloque esperado para: ${label}`);
    source = source.replace(from, to);
    changed = true;
  }
  if (changed) await writeFile(path, source, "utf8");
}

await patchFile("app/page.tsx", [
  {
    label: "importar selector de sets de categorías",
    from: 'import { DEFAULT_CATEGORY_CARDS } from "../lib/categories";',
    to: 'import { DEFAULT_CATEGORY_CARDS } from "../lib/categories";\nimport CategorySetPicker from "./CategorySetPicker";',
  },
  {
    label: "guardar categorías elegidas para la partida",
    from: '  const [categorySaving, setCategorySaving] = useState(false);\n  const [shuffleStep, setShuffleStep] = useState<number | null>(null);',
    to: '  const [categorySaving, setCategorySaving] = useState(false);\n  const [selectedGameCategories, setSelectedGameCategories] = useState<CategoryCard[] | null>(null);\n  const [shuffleStep, setShuffleStep] = useState<number | null>(null);',
  },
  {
    label: "guardar catálogo permitido en juego normal",
    from: '  const [selectedGameCategories, setSelectedGameCategories] = useState<CategoryCard[] | null>(null);\n  const [shuffleStep, setShuffleStep] = useState<number | null>(null);',
    to: '  const [selectedGameCategories, setSelectedGameCategories] = useState<CategoryCard[] | null>(null);\n  const [normalGameCategories, setNormalGameCategories] = useState<CategoryCard[] | null>(null);\n  const [shuffleStep, setShuffleStep] = useState<number | null>(null);',
  },
  {
    label: "crear la sala sólo con el set seleccionado",
    from: '  async function createRoom() {\n    const custom = categories.map(([easy, medium, expert]) => ({\n      easy,\n      medium,\n      expert,\n    }));\n    const data = await request({',
    to: '  async function createRoom() {\n    const allCategories = categories.map(([easy, medium, expert]) => ({\n      easy,\n      medium,\n      expert,\n    }));\n    if (selectedGameCategories !== null && selectedGameCategories.length < 2) {\n      show("Selecciona al menos 2 categorías del set para iniciar.");\n      return;\n    }\n    const custom = selectedGameCategories ?? allCategories;\n    const data = await request({',
  },
  {
    label: "usar sólo categorías normales cuando no hay set activo",
    from: '    const custom = selectedGameCategories ?? allCategories;\n    const data = await request({',
    to: '    if (selectedGameCategories === null && normalGameCategories === null) {\n      show("Espera un momento mientras se cargan las categorías.");\n      return;\n    }\n    const custom = selectedGameCategories ?? normalGameCategories ?? allCategories;\n    const data = await request({',
  },
  {
    label: "mostrar selector de sets al crear la sala",
    from: '                  <p>\n                    <span>Categorías</span>\n                    <b>{categories.length * 3} incluidas</b>\n                  </p>',
    to: '                  <CategorySetPicker\n                    fallbackCategories={categories.map(([easy, medium, expert]) => ({ easy, medium, expert }))}\n                    initialAdminKey={categoryAdminKey}\n                    onChange={setSelectedGameCategories}\n                  />\n                  <p>\n                    <span>Categorías</span>\n                    <b>{(selectedGameCategories === null ? categories.length : selectedGameCategories.length) * 3} incluidas</b>\n                  </p>',
  },
  {
    label: "conectar catálogo normal al selector de sets",
    from: '                  <CategorySetPicker\n                    fallbackCategories={categories.map(([easy, medium, expert]) => ({ easy, medium, expert }))}\n                    initialAdminKey={categoryAdminKey}\n                    onChange={setSelectedGameCategories}\n                  />\n                  <p>\n                    <span>Categorías</span>\n                    <b>{(selectedGameCategories === null ? categories.length : selectedGameCategories.length) * 3} incluidas</b>\n                  </p>',
    to: '                  <CategorySetPicker\n                    fallbackCategories={categories.map(([easy, medium, expert]) => ({ easy, medium, expert }))}\n                    initialAdminKey={categoryAdminKey}\n                    onChange={setSelectedGameCategories}\n                    onNormalCatalog={setNormalGameCategories}\n                  />\n                  <p>\n                    <span>Categorías</span>\n                    <b>{(selectedGameCategories === null ? (normalGameCategories?.length ?? categories.length) : selectedGameCategories.length) * 3} incluidas</b>\n                  </p>',
  },
]);
