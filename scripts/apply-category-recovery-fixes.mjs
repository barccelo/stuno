import { readFile, writeFile } from "node:fs/promises";

async function patchFile(path, replacements) {
  let source = await readFile(path, "utf8");
  let changed = false;
  for (const { from, to, label } of replacements) {
    if (source.includes(to)) continue;
    if (!source.includes(from)) {
      throw new Error(`No se encontró el bloque esperado para: ${label}`);
    }
    source = source.replace(from, to);
    changed = true;
  }
  if (changed) await writeFile(path, source, "utf8");
}

await patchFile("app/api/categories/route.ts", [
  {
    label: "recuperar categorías huérfanas conservadas por los sets",
    from: `async function readCatalog() {
  const db = getDb();
  const categories = await readOrSeedCategories();
  const memberships = await db.select().from(categorySetMemberships);
  const setsByFingerprint = new Map<string, string[]>();`,
    to: `async function readCatalog() {
  const db = getDb();
  let categories = await readOrSeedCategories();
  const memberships = await db.select().from(categorySetMemberships);

  // The set membership fingerprint contains the three category texts. Older
  // admin saves could delete a set-only card while leaving its membership.
  // Recreate those orphaned cards automatically so the set content is not lost.
  const existingFingerprints = new Set(categories.map(categoryFingerprint));
  const orphanFingerprints = Array.from(
    new Set(memberships.map((item) => item.fingerprint)),
  ).filter((fingerprint) => !existingFingerprints.has(fingerprint));

  if (orphanFingerprints.length) {
    const humanize = (text: string) => {
      const clean = text.trim();
      return clean
        ? clean.slice(0, 1).toLocaleUpperCase("es") + clean.slice(1)
        : "";
    };
    const recovered = orphanFingerprints.flatMap((fingerprint) => {
      const parts = fingerprint.split("\\u0000");
      if (parts.length !== 3) return [];
      const easy = humanize(parts[0] ?? "");
      const medium = humanize(parts[1] ?? "");
      const expert = humanize(parts[2] ?? "");
      const title = easy || medium || expert;
      return title ? [{ title, easy, medium, expert }] : [];
    });

    const updatedAt = new Date().toISOString();
    const baseOrder = -Date.now();
    for (let offset = 0; offset < recovered.length; offset += INSERT_BATCH_SIZE) {
      await db.insert(categoryCards).values(
        recovered.slice(offset, offset + INSERT_BATCH_SIZE).map((card, index) => ({
          ...card,
          normalEnabled: 0,
          sortOrder: baseOrder + offset + index,
          updatedAt,
        })),
      );
    }
    if (recovered.length) categories = await readOrSeedCategories();
  }

  const setsByFingerprint = new Map<string, string[]>();`,
  },
  {
    label: "preservar categorías ligadas a sets durante guardado global",
    from: `  const db = getDb();
  const previous = await readOrSeedCategories();
  const visibility = new Map(
    previous.map((card) => [categoryFingerprint(card), card.normalEnabled] as const),
  );
  const nextCategories = clean.map((card) => ({
    ...card,
    normalEnabled: visibility.get(categoryFingerprint(card)) ?? true,
  }));`,
    to: `  const db = getDb();
  // Trigger orphan recovery before replacing the catalog.
  await readCatalog();
  const previous = await readOrSeedCategories();
  const memberships = await db.select().from(categorySetMemberships);
  const protectedFingerprints = new Set(
    memberships.map((item) => item.fingerprint),
  );
  const incomingFingerprints = new Set(clean.map(categoryFingerprint));
  const visibility = new Map(
    previous.map((card) => [categoryFingerprint(card), card.normalEnabled] as const),
  );
  const preservedSetCategories = previous.filter((card) => {
    const fingerprint = categoryFingerprint(card);
    return protectedFingerprints.has(fingerprint) && !incomingFingerprints.has(fingerprint);
  });
  const nextCategories = [
    ...clean.map((card) => ({
      ...card,
      normalEnabled: visibility.get(categoryFingerprint(card)) ?? true,
    })),
    ...preservedSetCategories.map((card) => ({
      title: card.title,
      easy: card.easy,
      medium: card.medium,
      expert: card.expert,
      normalEnabled: card.normalEnabled,
    })),
  ];`,
  },
]);
