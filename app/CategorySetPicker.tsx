"use client";

import { useEffect, useMemo, useState } from "react";
import type { CategoryCard } from "../lib/game";

type CatalogCategory = CategoryCard & { sets?: string[] };
type CatalogResponse = { categories?: CatalogCategory[]; sets?: string[]; error?: string };

type Props = {
  fallbackCategories: CategoryCard[];
  initialAdminKey?: string;
  onChange: (categories: CategoryCard[] | null) => void;
};

function keyOf(card: CategoryCard) {
  return [card.easy, card.medium, card.expert]
    .map((text) => text.trim().toLocaleLowerCase("es").replace(/\s+/g, " "))
    .join("\u0000");
}

function labelOf(card: CategoryCard) {
  return `${card.easy} · ${card.medium} · ${card.expert}`;
}

export default function CategorySetPicker({ fallbackCategories, initialAdminKey = "", onChange }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [catalog, setCatalog] = useState<CatalogCategory[]>(
    fallbackCategories.map((card) => ({ ...card, sets: [] })),
  );
  const [setNames, setSetNames] = useState<string[]>([]);
  const [selectedSet, setSelectedSet] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [memberKeys, setMemberKeys] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [manageMode, setManageMode] = useState(false);
  const [newSetName, setNewSetName] = useState("");
  const [adminKey, setAdminKey] = useState(initialAdminKey);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);
  const [quick, setQuick] = useState({ easy: "", medium: "", expert: "" });

  const loadCatalog = async () => {
    const response = await fetch("/api/categories", { cache: "no-store" });
    const data = (await response.json()) as CatalogResponse;
    if (!response.ok) throw new Error(data.error || "No se pudieron cargar las categorías.");
    const nextCatalog = data.categories?.length
      ? data.categories
      : fallbackCategories.map((card) => ({ ...card, sets: [] }));
    const nextSets = data.sets ?? Array.from(
      new Set(nextCatalog.flatMap((card) => card.sets ?? [])),
    ).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
    setCatalog(nextCatalog);
    setSetNames(nextSets);
    setSelectedSet((current) =>
      current || nextSets.find((name) => name.toLocaleLowerCase("es") === "categorías locas") || nextSets[0] || "",
    );
  };

  useEffect(() => {
    void loadCatalog().catch((error) =>
      setMessage(error instanceof Error ? error.message : "No se pudieron cargar las categorías."),
    );
    try {
      if (!initialAdminKey) {
        setAdminKey(sessionStorage.getItem("stuno-category-admin-key") ?? "");
      }
    } catch {}
  }, []);

  const setMembers = useMemo(
    () => catalog.filter((card) => (card.sets ?? []).includes(selectedSet)),
    [catalog, selectedSet],
  );

  useEffect(() => {
    if (!selectedSet) {
      setSelectedKeys(new Set());
      setMemberKeys(new Set());
      if (enabled) onChange([]);
      return;
    }
    const keys = new Set(setMembers.map(keyOf));
    setMemberKeys(keys);
    setSelectedKeys(keys);
    if (enabled) onChange(setMembers);
  }, [selectedSet, catalog]);

  useEffect(() => {
    if (!enabled) onChange(null);
    else {
      const selected = catalog.filter((card) => selectedKeys.has(keyOf(card)));
      onChange(selected);
    }
  }, [enabled, selectedKeys]);

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    const source = manageMode ? catalog : setMembers;
    return source.filter((card) => !query || labelOf(card).toLocaleLowerCase("es").includes(query));
  }, [catalog, setMembers, search, manageMode]);

  const selectedCount = selectedKeys.size;

  const mutationKey = () => {
    const key = adminKey.trim();
    if (!key) {
      setMessage("Introduce la clave administrativa para guardar cambios permanentes.");
      return "";
    }
    try {
      sessionStorage.setItem("stuno-category-admin-key", key);
    } catch {}
    return key;
  };

  const applyCatalogResponse = (data: CatalogResponse) => {
    if (data.categories) setCatalog(data.categories);
    if (data.sets) setSetNames(data.sets);
  };

  async function saveSet() {
    if (!selectedSet.trim()) {
      setMessage("Escribe primero el nombre del set.");
      return;
    }
    if (!memberKeys.size) {
      setMessage("Selecciona al menos una categoría para el set.");
      return;
    }
    const key = mutationKey();
    if (!key) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-stuno-admin-key": key,
        },
        body: JSON.stringify({
          action: "saveSet",
          setName: selectedSet,
          categoryKeys: Array.from(memberKeys),
        }),
      });
      const data = (await response.json()) as CatalogResponse;
      if (!response.ok) throw new Error(data.error || "No se pudo guardar el set.");
      applyCatalogResponse(data);
      setManageMode(false);
      setMessage(`Set “${selectedSet}” guardado.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar el set.");
    } finally {
      setSaving(false);
    }
  }

  async function quickAdd() {
    if (!selectedSet.trim()) {
      setMessage("Selecciona o crea un set antes de añadir una categoría.");
      return;
    }
    if (![quick.easy, quick.medium, quick.expert].every((text) => text.trim())) {
      setMessage("Completa Fácil, Media y Experta.");
      return;
    }
    const key = mutationKey();
    if (!key) return;
    setSaving(true);
    setMessage("");
    try {
      const category = {
        easy: quick.easy.trim(),
        medium: quick.medium.trim(),
        expert: quick.expert.trim(),
      };
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-stuno-admin-key": key,
        },
        body: JSON.stringify({ action: "quickAdd", setName: selectedSet, category }),
      });
      const data = (await response.json()) as CatalogResponse;
      if (!response.ok) throw new Error(data.error || "No se pudo añadir la categoría.");
      applyCatalogResponse(data);
      const newKey = keyOf(category);
      setSelectedKeys((current) => new Set([...current, newKey]));
      setMemberKeys((current) => new Set([...current, newKey]));
      setQuick({ easy: "", medium: "", expert: "" });
      setQuickOpen(false);
      setMessage("Categoría añadida, guardada y seleccionada para esta partida.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo añadir la categoría.");
    } finally {
      setSaving(false);
    }
  }

  function startNewSet() {
    const name = newSetName.trim().replace(/\s+/g, " ");
    if (!name) return;
    setSelectedSet(name);
    setMemberKeys(new Set());
    setSelectedKeys(new Set());
    setManageMode(true);
    setNewSetName("");
    setMessage("Selecciona las categorías que formarán el nuevo set y pulsa Guardar set.");
  }

  return (
    <section className={`category-set-picker ${enabled ? "enabled" : ""}`}>
      <div className="category-set-head">
        <div>
          <strong>Sets de categorías</strong>
          <small>Activa un set para limitar toda la partida a esas categorías.</small>
        </div>
        <label className="category-set-switch">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          <span>{enabled ? "Activo" : "Normal"}</span>
        </label>
      </div>

      {enabled && (
        <div className="category-set-body">
          <div className="category-set-topline">
            <label>
              <span>Set</span>
              <select
                value={selectedSet}
                onChange={(event) => {
                  setSelectedSet(event.target.value);
                  setManageMode(false);
                }}
              >
                <option value="">Selecciona un set…</option>
                {setNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
                {selectedSet && !setNames.includes(selectedSet) && (
                  <option value={selectedSet}>{selectedSet}</option>
                )}
              </select>
            </label>
            <button type="button" className="category-set-small" onClick={() => setManageMode((value) => !value)}>
              {manageMode ? "Volver a selección" : "Editar set"}
            </button>
          </div>

          <div className="category-set-new">
            <input
              value={newSetName}
              onChange={(event) => setNewSetName(event.target.value)}
              placeholder="Nuevo set, por ejemplo Categorías locas"
            />
            <button type="button" onClick={startNewSet} disabled={!newSetName.trim()}>Crear set</button>
          </div>

          {selectedSet && (
            <>
              <div className="category-set-tools">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={manageMode ? "Buscar en todo el catálogo…" : "Buscar dentro del set…"}
                />
                {!manageMode && (
                  <>
                    <button type="button" onClick={() => setSelectedKeys(new Set(setMembers.map(keyOf)))}>Todas</button>
                    <button type="button" onClick={() => setSelectedKeys(new Set())}>Limpiar</button>
                  </>
                )}
              </div>

              <div className="category-set-meta">
                <span>{manageMode ? `${memberKeys.size} en el set` : `${selectedCount} seleccionadas para jugar`}</span>
                {!manageMode && <button type="button" onClick={() => setQuickOpen((value) => !value)}>+ Añadir categoría</button>}
              </div>

              {quickOpen && !manageMode && (
                <div className="category-quick-add">
                  <strong>Agregar rápido a “{selectedSet}”</strong>
                  <div className="category-quick-grid">
                    <input value={quick.easy} onChange={(event) => setQuick({ ...quick, easy: event.target.value })} placeholder="Fácil" />
                    <input value={quick.medium} onChange={(event) => setQuick({ ...quick, medium: event.target.value })} placeholder="Media" />
                    <input value={quick.expert} onChange={(event) => setQuick({ ...quick, expert: event.target.value })} placeholder="Experta" />
                  </div>
                  {!adminKey.trim() && (
                    <input
                      type="password"
                      value={adminKey}
                      onChange={(event) => setAdminKey(event.target.value)}
                      placeholder="Clave administrativa para guardar"
                    />
                  )}
                  <button type="button" onClick={quickAdd} disabled={saving}>{saving ? "Guardando…" : "Guardar y seleccionar"}</button>
                </div>
              )}

              {manageMode && !adminKey.trim() && (
                <input
                  className="category-set-admin-key"
                  type="password"
                  value={adminKey}
                  onChange={(event) => setAdminKey(event.target.value)}
                  placeholder="Clave administrativa para guardar el set"
                />
              )}

              <div className="category-set-list">
                {visible.length ? visible.map((card) => {
                  const key = keyOf(card);
                  const checked = manageMode ? memberKeys.has(key) : selectedKeys.has(key);
                  return (
                    <label className="category-set-item" key={key}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const setter = manageMode ? setMemberKeys : setSelectedKeys;
                          setter((current) => {
                            const next = new Set(current);
                            if (next.has(key)) next.delete(key);
                            else next.add(key);
                            return next;
                          });
                        }}
                      />
                      <span>
                        <b>{card.easy}</b>
                        <small>{card.medium} · {card.expert}</small>
                      </span>
                    </label>
                  );
                }) : (
                  <p className="category-set-empty">
                    {manageMode ? "No hay coincidencias en el catálogo." : "Este set todavía no tiene categorías."}
                  </p>
                )}
              </div>

              {manageMode && (
                <button type="button" className="category-set-save" onClick={saveSet} disabled={saving || !memberKeys.size}>
                  {saving ? "Guardando…" : `Guardar set “${selectedSet}”`}
                </button>
              )}
            </>
          )}

          {message && <p className="category-set-message">{message}</p>}
          {!manageMode && selectedSet && selectedCount < 2 && (
            <p className="category-set-warning">Selecciona al menos 2 categorías para jugar con este set.</p>
          )}
        </div>
      )}
    </section>
  );
}
