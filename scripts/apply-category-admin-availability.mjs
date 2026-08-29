import { readFile, writeFile } from "node:fs/promises";

async function patchFile(path, transform) {
  const before = await readFile(path, "utf8");
  const after = transform(before);
  if (after !== before) await writeFile(path, after, "utf8");
}

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`No se encontró el bloque esperado para: ${label}`);
  return source.replace(from, to);
}

await patchFile("app/api/categories/route.ts", (source) => {
  if (source.includes("Metadata-aware admin catalog save.")) return source;

  const anchor = `  if (!clean)\n    return Response.json(\n      { error: "Cada tarjeta necesita un título y al menos una categoría." },\n      { status: 400 },\n    );\n\n  const db = getDb();`;

  const replacement = `  if (!clean)\n    return Response.json(\n      { error: "Cada tarjeta necesita un título y al menos una categoría." },\n      { status: 400 },\n    );\n\n  // Metadata-aware admin catalog save. The category manager can now persist\n  // normal-game visibility and set memberships together with the card text.\n  // Older clients that do not send these fields continue through the legacy\n  // preservation path below.\n  const rawAvailabilityRows = Array.isArray(body?.categories) ? body.categories : [];\n  const availabilityByFingerprint = new Map<\n    string,\n    { normalEnabled: boolean; sets: string[] }\n  >();\n  for (const raw of rawAvailabilityRows) {\n    if (!raw || typeof raw !== "object") continue;\n    const card = cleanCategory(raw);\n    if (!card) continue;\n    const row = raw as Record<string, unknown>;\n    if (!("normalEnabled" in row) && !("sets" in row)) continue;\n    const sets = Array.isArray(row.sets)\n      ? Array.from(\n          new Set(\n            row.sets\n              .map((value) => cleanSetName(value))\n              .filter((value) => Boolean(value)),\n          ),\n        )\n      : [];\n    availabilityByFingerprint.set(categoryFingerprint(card), {\n      normalEnabled: row.normalEnabled !== false,\n      sets,\n    });\n  }\n\n  if (availabilityByFingerprint.size) {\n    const availabilityDb = getDb();\n    // Run recovery first so a failed save can restore the complete catalog.\n    await readCatalog();\n    const previousCategories = await readOrSeedCategories();\n    const previousMemberships = await availabilityDb\n      .select()\n      .from(categorySetMemberships);\n    const nextCategories = clean.map((card) => ({\n      ...card,\n      normalEnabled:\n        availabilityByFingerprint.get(categoryFingerprint(card))?.normalEnabled ?? true,\n    }));\n\n    try {\n      await availabilityDb.delete(categorySetMemberships);\n      await availabilityDb.delete(categoryCards);\n      await insertCategories(nextCategories);\n\n      const membershipRows = clean.flatMap((card) => {\n        const fingerprint = categoryFingerprint(card);\n        const meta = availabilityByFingerprint.get(fingerprint);\n        return (meta?.sets ?? []).map((setName) => ({ setName, fingerprint }));\n      });\n      const updatedAt = new Date().toISOString();\n      // Three bound values per membership; batches of 25 stay below D1's\n      // conservative 100-bound-parameter limit.\n      for (let offset = 0; offset < membershipRows.length; offset += 25) {\n        await availabilityDb.insert(categorySetMemberships).values(\n          membershipRows.slice(offset, offset + 25).map((item) => ({\n            ...item,\n            updatedAt,\n          })),\n        );\n      }\n      return Response.json(await readCatalog());\n    } catch (error) {\n      try {\n        await availabilityDb.delete(categorySetMemberships);\n        await availabilityDb.delete(categoryCards);\n        await insertCategories(\n          previousCategories.map(({ title, easy, medium, expert, normalEnabled }) => ({\n            title,\n            easy,\n            medium,\n            expert,\n            normalEnabled,\n          })),\n        );\n        for (let offset = 0; offset < previousMemberships.length; offset += 25) {\n          await availabilityDb.insert(categorySetMemberships).values(\n            previousMemberships.slice(offset, offset + 25).map((item) => ({\n              setName: item.setName,\n              fingerprint: item.fingerprint,\n              updatedAt: item.updatedAt,\n            })),\n          );\n        }\n      } catch {}\n      console.error("Failed to save category availability metadata", error);\n      return Response.json(\n        { error: "No se pudo guardar la disponibilidad de las categorías." },\n        { status: 500 },\n      );\n    }\n  }\n\n  const db = getDb();`;

  return replaceRequired(source, anchor, replacement, "guardado de disponibilidad en API de categorías");
});

await patchFile("app/page.tsx", (source) => {
  if (!source.includes("const [categoryAdminMeta, setCategoryAdminMeta]")) {
    source = replaceRequired(
      source,
      '  const [categoryEditorSearch, setCategoryEditorSearch] = useState("");\n  const [categoryAdminKey, setCategoryAdminKey] = useState("");',
      [
        '  const [categoryEditorSearch, setCategoryEditorSearch] = useState("");',
        '  const [categoryAdminMeta, setCategoryAdminMeta] = useState<{ sets: string[]; normalEnabled: boolean }[]>([]);',
        '  const [categoryAdminSets, setCategoryAdminSets] = useState<string[]>([]);',
        '  const [categoryAdminFilter, setCategoryAdminFilter] = useState("all");',
        '  const [categoryAdminSelected, setCategoryAdminSelected] = useState<Set<number>>(new Set());',
        '  const [categoryAdminBulkSet, setCategoryAdminBulkSet] = useState("");',
        '  const [categoryAdminNewSet, setCategoryAdminNewSet] = useState("");',
        '  const [categoryAdminKey, setCategoryAdminKey] = useState("");',
      ].join("\n"),
      "estado de disponibilidad del administrador",
    );
  }

  const firstDataType = '          categories?: { title?: string; easy: string; medium: string; expert: string }[];';
  if (source.includes(firstDataType)) {
    source = source.replace(
      firstDataType,
      '          categories?: { title?: string; easy: string; medium: string; expert: string; sets?: string[]; normalEnabled?: boolean }[];\n          sets?: string[];',
    );
  }

  if (!source.includes("setCategoryAdminMeta(\n            data.categories.map")) {
    const loadStart = source.indexOf('        if (active && data.categories?.length) {');
    if (loadStart < 0) throw new Error("No se encontró la carga inicial del catálogo.");
    const loadEnd = source.indexOf('        }\n      })', loadStart);
    if (loadEnd < 0) throw new Error("No se encontró el cierre de la carga inicial del catálogo.");
    const addition = [
      '          setCategoryAdminMeta(',
      '            data.categories.map((card) => ({',
      '              sets: [...(card.sets ?? [])],',
      '              normalEnabled: card.normalEnabled !== false,',
      '            })),',
      '          );',
      '          const loadedSets = data.sets ?? Array.from(',
      '            new Set(data.categories.flatMap((card) => card.sets ?? [])),',
      '          ).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));',
      '          setCategoryAdminSets(loadedSets);',
      '          setCategoryAdminBulkSet((current) => current || loadedSets[0] || "");',
    ].join("\n") + "\n";
    source = source.slice(0, loadEnd) + addition + source.slice(loadEnd);
  }

  if (!source.includes("setCategoryAdminMeta(savedCategories.map")) {
    const fallbackAnchor = [
      '            setCategoryTitles(',
      '              savedCategories.map((card, index) =>',
      '                starterCategoryTitles[index] ?? card.find((value) => value?.trim()) ?? `Tarjeta ${index + 1}`,',
      '              ),',
      '            );',
    ].join("\n");
    if (source.includes(fallbackAnchor)) {
      source = source.replace(
        fallbackAnchor,
        fallbackAnchor + '\n            setCategoryAdminMeta(savedCategories.map(() => ({ sets: [], normalEnabled: true })));\n            setCategoryAdminSets([]);',
      );
    }
  }

  if (!source.includes('show("Espera a que se cargue la disponibilidad de las categorías.")')) {
    source = replaceRequired(
      source,
      '  async function saveGlobalCategories() {\n    setCategorySaving(true);',
      '  async function saveGlobalCategories() {\n    if (categoryAdminMeta.length !== categories.length) {\n      show("Espera a que se cargue la disponibilidad de las categorías.");\n      return;\n    }\n    setCategorySaving(true);',
      "protección antes de guardar metadata",
    );
  }

  if (!source.includes('normalEnabled: categoryAdminMeta[index]?.normalEnabled !== false')) {
    const savePayload = [
      '          categories: categories.map(([easy, medium, expert], index) => ({',
      '            title: categoryTitles[index]?.trim() || easy || medium || expert || `Tarjeta ${index + 1}`,',
      '            easy,',
      '            medium,',
      '            expert,',
      '          })),',
    ].join("\n");
    const nextPayload = [
      '          categories: categories.map(([easy, medium, expert], index) => ({',
      '            title: categoryTitles[index]?.trim() || easy || medium || expert || `Tarjeta ${index + 1}`,',
      '            easy,',
      '            medium,',
      '            expert,',
      '            normalEnabled: categoryAdminMeta[index]?.normalEnabled !== false,',
      '            sets: categoryAdminMeta[index]?.sets ?? [],',
      '          })),',
    ].join("\n");
    source = replaceRequired(source, savePayload, nextPayload, "enviar disponibilidad al guardar catálogo");
  }

  const saveStart = source.indexOf('  async function saveGlobalCategories() {');
  const saveEnd = saveStart >= 0 ? source.indexOf('  function clearCardSelection()', saveStart) : -1;
  if (saveStart < 0 || saveEnd < 0) throw new Error("No se encontró saveGlobalCategories.");
  let saveBlock = source.slice(saveStart, saveEnd);
  const saveType = '        categories?: { title?: string; easy: string; medium: string; expert: string }[];';
  if (saveBlock.includes(saveType)) {
    saveBlock = saveBlock.replace(
      saveType,
      '        categories?: { title?: string; easy: string; medium: string; expert: string; sets?: string[]; normalEnabled?: boolean }[];\n        sets?: string[];',
    );
  }
  if (!saveBlock.includes("setCategoryAdminMeta(data.categories.map")) {
    const responseClose = saveBlock.lastIndexOf('      }\n      show("Categorías guardadas para todos los dispositivos.");');
    if (responseClose < 0) throw new Error("No se encontró la actualización tras guardar categorías.");
    const addition = [
      '        setCategoryAdminMeta(data.categories.map((card) => ({',
      '          sets: [...(card.sets ?? [])],',
      '          normalEnabled: card.normalEnabled !== false,',
      '        })));',
      '        const savedSets = data.sets ?? Array.from(',
      '          new Set(data.categories.flatMap((card) => card.sets ?? [])),',
      '        ).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));',
      '        setCategoryAdminSets(savedSets);',
      '        setCategoryAdminBulkSet((current) => savedSets.includes(current) ? current : (savedSets[0] ?? ""));',
      '        setCategoryAdminSelected(new Set());',
    ].join("\n") + "\n";
    saveBlock = saveBlock.slice(0, responseClose) + addition + saveBlock.slice(responseClose);
  }
  source = source.slice(0, saveStart) + saveBlock + source.slice(saveEnd);

  if (!source.includes("function categoryVisibleInAdmin(")) {
    const helpers = `  function categoryVisibleInAdmin(category: string[], index: number) {
    const query = categoryEditorSearch.trim().toLocaleLowerCase("es");
    const matchesSearch =
      !query ||
      [categoryTitles[index] ?? "", ...category].some((value) =>
        value.toLocaleLowerCase("es").includes(query),
      );
    if (!matchesSearch) return false;
    const meta = categoryAdminMeta[index] ?? { sets: [], normalEnabled: true };
    if (categoryAdminFilter === "normal") return meta.normalEnabled !== false;
    if (categoryAdminFilter === "sets-only") return meta.normalEnabled === false;
    if (categoryAdminFilter.startsWith("set:"))
      return meta.sets.includes(categoryAdminFilter.slice(4));
    return true;
  }
  function updateCategoryAdminMeta(
    index: number,
    update: (current: { sets: string[]; normalEnabled: boolean }) => { sets: string[]; normalEnabled: boolean },
  ) {
    setCategoryAdminMeta((current) => {
      const next = Array.from({ length: categories.length }, (_, itemIndex) =>
        current[itemIndex] ?? { sets: [], normalEnabled: true },
      );
      next[index] = update(next[index]);
      return next;
    });
  }
  function toggleCategoryAdminSet(index: number, setName: string) {
    updateCategoryAdminMeta(index, (current) => ({
      ...current,
      sets: current.sets.includes(setName)
        ? current.sets.filter((name) => name !== setName)
        : [...current.sets, setName].sort((a, b) =>
            a.localeCompare(b, "es", { sensitivity: "base" }),
          ),
    }));
  }
  function applyCategoryAdminBulk(kind: "normal" | "sets-only" | "add-set" | "remove-set") {
    if (!categoryAdminSelected.size) return show("Selecciona al menos una tarjeta.");
    if ((kind === "add-set" || kind === "remove-set") && !categoryAdminBulkSet)
      return show("Selecciona un set.");
    setCategoryAdminMeta((current) =>
      Array.from({ length: categories.length }, (_, index) => {
        const meta = current[index] ?? { sets: [], normalEnabled: true };
        if (!categoryAdminSelected.has(index)) return meta;
        if (kind === "normal") return { ...meta, normalEnabled: true };
        if (kind === "sets-only") return { ...meta, normalEnabled: false };
        if (kind === "add-set")
          return {
            ...meta,
            sets: meta.sets.includes(categoryAdminBulkSet)
              ? meta.sets
              : [...meta.sets, categoryAdminBulkSet].sort((a, b) =>
                  a.localeCompare(b, "es", { sensitivity: "base" }),
                ),
          };
        return { ...meta, sets: meta.sets.filter((name) => name !== categoryAdminBulkSet) };
      }),
    );
  }
  function addCategoryAdminSet() {
    const name = categoryAdminNewSet.trim().replace(/\s+/g, " ").slice(0, 60);
    if (!name) return;
    if (!categoryAdminSelected.size)
      return show("Selecciona las tarjetas que quieres añadir al nuevo set.");
    setCategoryAdminSets((current) =>
      current.includes(name)
        ? current
        : [...current, name].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })),
    );
    setCategoryAdminBulkSet(name);
    setCategoryAdminMeta((current) =>
      Array.from({ length: categories.length }, (_, index) => {
        const meta = current[index] ?? { sets: [], normalEnabled: true };
        if (!categoryAdminSelected.has(index) || meta.sets.includes(name)) return meta;
        return { ...meta, sets: [...meta.sets, name] };
      }),
    );
    setCategoryAdminNewSet("");
    show(`Set «${name}» preparado. Guarda las categorías para hacerlo permanente.`);
  }

`;
    source = source.slice(0, saveEnd) + helpers + source.slice(saveEnd);
  }

  const oldFilter = `              .filter(({ category, index }) => {
                const query = categoryEditorSearch.trim().toLocaleLowerCase("es");
                if (!query) return true;
                return [categoryTitles[index] ?? "", ...category]
                  .some((value) => value.toLocaleLowerCase("es").includes(query));
              })`;
  if (source.includes(oldFilter)) {
    source = source.replace(
      oldFilter,
      '              .filter(({ category, index }) => categoryVisibleInAdmin(category, index))',
    );
  }

  if (!source.includes('className="category-admin-availability-toolbar"')) {
    const searchClose = `              </label>\n              <div className="category-list">`;
    const toolbar = `              </label>
              <div className="category-admin-availability-toolbar">
                <label>
                  <span>Mostrar</span>
                  <select value={categoryAdminFilter} onChange={(event) => setCategoryAdminFilter(event.target.value)}>
                    <option value="all">Todas</option>
                    <option value="normal">Juego normal</option>
                    <option value="sets-only">Solo sets</option>
                    {categoryAdminSets.map((setName) => (
                      <option key={setName} value={\`set:\${setName}\`}>{setName}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setCategoryAdminSelected(
                      new Set(
                        categories
                          .map((category, index) => ({ category, index }))
                          .filter(({ category, index }) => categoryVisibleInAdmin(category, index))
                          .map(({ index }) => index),
                      ),
                    )
                  }
                >
                  Seleccionar visibles
                </button>
                <button type="button" onClick={() => setCategoryAdminSelected(new Set())}>Limpiar selección</button>
              </div>
              <div className="category-admin-bulk-tools">
                <strong>{categoryAdminSelected.size} seleccionadas</strong>
                <button type="button" disabled={!categoryAdminSelected.size} onClick={() => applyCategoryAdminBulk("normal")}>Juego normal</button>
                <button type="button" disabled={!categoryAdminSelected.size} onClick={() => applyCategoryAdminBulk("sets-only")}>Solo sets</button>
                <select value={categoryAdminBulkSet} onChange={(event) => setCategoryAdminBulkSet(event.target.value)}>
                  <option value="">Selecciona un set…</option>
                  {categoryAdminSets.map((setName) => <option key={setName} value={setName}>{setName}</option>)}
                </select>
                <button type="button" disabled={!categoryAdminSelected.size || !categoryAdminBulkSet} onClick={() => applyCategoryAdminBulk("add-set")}>Añadir al set</button>
                <button type="button" disabled={!categoryAdminSelected.size || !categoryAdminBulkSet} onClick={() => applyCategoryAdminBulk("remove-set")}>Quitar del set</button>
                <div className="category-admin-new-set">
                  <input value={categoryAdminNewSet} onChange={(event) => setCategoryAdminNewSet(event.target.value)} placeholder="Nuevo set" />
                  <button type="button" disabled={!categoryAdminNewSet.trim() || !categoryAdminSelected.size} onClick={addCategoryAdminSet}>Crear y asignar</button>
                </div>
              </div>
              <div className="category-list">`;
    source = replaceRequired(source, searchClose, toolbar, "herramientas de disponibilidad del administrador");
  }

  if (!source.includes('className="category-row-index"')) {
    const rowIndex = `                <span className="row-number">\n                  {String(index + 1).padStart(2, "0")}\n                </span>\n                <div className="category-card-fields">`;
    const rowIndexNext = `                <div className="category-row-index">
                  <input
                    type="checkbox"
                    aria-label={\`Seleccionar tarjeta \${index + 1}\`}
                    checked={categoryAdminSelected.has(index)}
                    onChange={(event) =>
                      setCategoryAdminSelected((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(index);
                        else next.delete(index);
                        return next;
                      })
                    }
                  />
                  <span className="row-number">{String(index + 1).padStart(2, "0")}</span>
                </div>
                <div className="category-card-fields">`;
    source = replaceRequired(source, rowIndex, rowIndexNext, "selector individual de tarjeta");
  }

  if (!source.includes('className="category-card-availability"')) {
    const cardClose = `                  </div>\n                </div>\n                <button\n                  className="delete-button"`;
    const availability = `                  </div>
                  <div className="category-card-availability">
                    <div className="category-card-availability-head">
                      <strong>Disponibilidad</strong>
                      <label className="category-normal-switch">
                        <input
                          type="checkbox"
                          checked={categoryAdminMeta[index]?.normalEnabled !== false}
                          onChange={(event) =>
                            updateCategoryAdminMeta(index, (current) => ({
                              ...current,
                              normalEnabled: event.target.checked,
                            }))
                          }
                        />
                        <span>Juego normal</span>
                      </label>
                    </div>
                    <div className="category-card-set-list">
                      {categoryAdminSets.length ? categoryAdminSets.map((setName) => {
                        const active = (categoryAdminMeta[index]?.sets ?? []).includes(setName);
                        return (
                          <label key={setName} className={active ? "active" : ""}>
                            <input type="checkbox" checked={active} onChange={() => toggleCategoryAdminSet(index, setName)} />
                            <span>{setName}</span>
                          </label>
                        );
                      }) : <small>Aún no hay sets creados.</small>}
                    </div>
                    <small className="category-availability-status">
                      {categoryAdminMeta[index]?.normalEnabled !== false
                        ? "Disponible en el juego normal"
                        : (categoryAdminMeta[index]?.sets?.length ?? 0) > 0
                          ? "Solo sets"
                          : "No aparecerá hasta asignarla a un set"}
                    </small>
                  </div>
                </div>
                <button
                  className="delete-button"`;
    source = replaceRequired(source, cardClose, availability, "disponibilidad por tarjeta");
  }

  if (!source.includes('setCategoryAdminMeta([{ sets: [], normalEnabled: true }, ...categoryAdminMeta]);')) {
    source = replaceRequired(
      source,
      '                    setCategories([["", "", ""], ...categories]);\n                    setCategoryTitles(["Nueva tarjeta", ...categoryTitles]);\n                    setCategoryEditorSearch("");',
      '                    setCategories([["", "", ""], ...categories]);\n                    setCategoryTitles(["Nueva tarjeta", ...categoryTitles]);\n                    setCategoryAdminMeta([{ sets: [], normalEnabled: true }, ...categoryAdminMeta]);\n                    setCategoryAdminSelected(new Set());\n                    setCategoryEditorSearch("");',
      "metadata al crear tarjeta",
    );
  }

  if (!source.includes('setCategoryAdminMeta(categoryAdminMeta.filter((_, itemIndex) => itemIndex !== index));')) {
    const deleteTitles = `                    setCategoryTitles(\n                      categoryTitles.filter((_, itemIndex) => itemIndex !== index),\n                    );`;
    source = replaceRequired(
      source,
      deleteTitles,
      deleteTitles + '\n                    setCategoryAdminMeta(categoryAdminMeta.filter((_, itemIndex) => itemIndex !== index));\n                    setCategoryAdminSelected(new Set());',
      "metadata al eliminar tarjeta",
    );
  }

  return source;
});

await patchFile("app/ui-fixes.css", (source) => {
  const marker = "/* Category admin availability manager. */";
  if (source.includes(marker)) return source;
  return source + `\n\n${marker}
.category-admin-availability-toolbar,
.category-admin-bulk-tools {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
  width: min(1120px, 100%);
  margin: 0 auto 12px;
  padding: 12px;
  border: 1px solid var(--line, rgba(20,33,61,.14));
  border-radius: 13px;
  background: rgba(255,255,255,.62);
}
.category-admin-availability-toolbar label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-right: auto;
  font-size: 11px;
  font-weight: 850;
}
.category-admin-availability-toolbar select,
.category-admin-bulk-tools select,
.category-admin-new-set input {
  min-height: 38px;
  border: 1px solid var(--line, rgba(20,33,61,.14));
  border-radius: 9px;
  background: #fff;
  padding: 0 10px;
  color: var(--ink, #14213d);
}
.category-admin-availability-toolbar button,
.category-admin-bulk-tools button {
  min-height: 38px;
  border: 1px solid var(--line, rgba(20,33,61,.14));
  border-radius: 9px;
  background: #fff;
  padding: 0 11px;
  font-size: 11px;
  font-weight: 850;
  cursor: pointer;
}
.category-admin-bulk-tools button:disabled {
  opacity: .38;
  cursor: default;
}
.category-admin-bulk-tools > strong {
  margin-right: 2px;
  font-size: 11px;
}
.category-admin-new-set {
  display: flex;
  gap: 6px;
  margin-left: auto;
}
.category-row-index {
  align-self: start;
  display: grid;
  justify-items: center;
  gap: 9px;
  padding-top: 5px;
}
.category-row-index input {
  width: 17px;
  height: 17px;
  accent-color: var(--blue, #2455d6);
}
.category-card-availability {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--line, rgba(20,33,61,.14));
}
.category-card-availability-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
.category-card-availability-head > strong {
  font-size: 10px;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: #68738a;
}
.category-normal-switch {
  display: flex !important;
  align-items: center;
  gap: 7px;
  margin: 0 !important;
  font-size: 11px;
  font-weight: 850;
}
.category-normal-switch input {
  width: 17px !important;
  height: 17px;
  accent-color: var(--blue, #2455d6);
}
.category-card-set-list {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 10px;
}
.category-card-set-list label {
  display: inline-flex !important;
  align-items: center;
  gap: 5px;
  margin: 0 !important;
  border: 1px solid var(--line, rgba(20,33,61,.14));
  border-radius: 999px;
  background: #fff;
  padding: 6px 9px;
  font-size: 10px;
  font-weight: 800;
  cursor: pointer;
}
.category-card-set-list label.active {
  border-color: var(--blue, #2455d6);
  background: #f1f5ff;
  color: var(--blue, #2455d6);
}
.category-card-set-list input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.category-availability-status {
  display: block;
  margin-top: 9px;
  color: #7a8496;
  font-size: 10px;
}
@media (max-width: 720px) {
  .category-admin-availability-toolbar,
  .category-admin-bulk-tools {
    align-items: stretch;
  }
  .category-admin-availability-toolbar label,
  .category-admin-new-set {
    width: 100%;
    margin-left: 0;
  }
  .category-admin-availability-toolbar select,
  .category-admin-bulk-tools select,
  .category-admin-new-set input {
    min-width: 0;
    flex: 1;
  }
  .category-card-availability-head {
    align-items: flex-start;
  }
}
`;
});

console.log("Category admin availability controls applied without changing pre-game category selection.");
