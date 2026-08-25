import { and, asc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { ensureSchema, getDb } from "../../../db";
import { categoryCards, categorySetMemberships } from "../../../db/schema";
import { DEFAULT_CATEGORY_CARDS } from "../../../lib/categories";

type CategoryInput = { title: string; easy: string; medium: string; expert: string };
type StoredCategory = CategoryInput & { id: number; normalEnabled: boolean };
type CatalogCategory = CategoryInput & { sets: string[]; normalEnabled: boolean };

// category_cards currently writes 7 bound values per row. D1 allows at most
// 100 bound parameters per query, so keep each multi-row INSERT comfortably
// below that ceiling.
const INSERT_BATCH_SIZE = 12;

function configuredAdminKey() {
  return env.CATEGORY_ADMIN_KEY;
}

function authorized(request: Request) {
  const expected = configuredAdminKey();
  const supplied = request.headers.get("x-stuno-admin-key");
  return Boolean(expected && supplied && supplied === expected);
}

function categoryFingerprint(card: Pick<CategoryInput, "easy" | "medium" | "expert">) {
  return [card.easy, card.medium, card.expert]
    .map((text) => text.trim().toLocaleLowerCase("es").replace(/\s+/g, " "))
    .join("\u0000");
}

const DEFAULT_TITLE_BY_FINGERPRINT = new Map(
  DEFAULT_CATEGORY_CARDS.map((card) => [
    categoryFingerprint(card),
    card.title?.trim() || card.easy.trim() || card.medium.trim() || card.expert.trim() || "Categoría",
  ] as const),
);

function cleanSetName(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, 60);
}

function cleanCategory(value: unknown): CategoryInput | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const easy = typeof row.easy === "string" ? row.easy.trim() : "";
  const medium = typeof row.medium === "string" ? row.medium.trim() : "";
  const expert = typeof row.expert === "string" ? row.expert.trim() : "";
  const fallbackTitle = easy || medium || expert;
  const title =
    (typeof row.title === "string" ? row.title.trim() : "") || fallbackTitle;
  if (
    !title ||
    !fallbackTitle ||
    title.length > 80 ||
    [easy, medium, expert].some((text) => text.length > 100)
  )
    return null;
  return { title, easy, medium, expert };
}

function cleanCategories(value: unknown): CategoryInput[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 500)
    return null;
  const result: CategoryInput[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const card = cleanCategory(item);
    if (!card) return null;
    const fingerprint = categoryFingerprint(card);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    result.push(card);
  }
  return result.length ? result : null;
}

async function insertCategories(cards: (CategoryInput & { normalEnabled?: boolean })[]) {
  const db = getDb();
  const updatedAt = new Date().toISOString();
  for (let offset = 0; offset < cards.length; offset += INSERT_BATCH_SIZE) {
    await db.insert(categoryCards).values(
      cards.slice(offset, offset + INSERT_BATCH_SIZE).map((card, index) => ({
        title: card.title,
        easy: card.easy,
        medium: card.medium,
        expert: card.expert,
        normalEnabled: card.normalEnabled === false ? 0 : 1,
        sortOrder: offset + index,
        updatedAt,
      })),
    );
  }
}

async function readOrSeedCategories(): Promise<StoredCategory[]> {
  const db = getDb();
  let rows = await db.select().from(categoryCards).orderBy(asc(categoryCards.sortOrder));
  if (!rows.length) {
    await insertCategories(
      DEFAULT_CATEGORY_CARDS.map((card) => ({
        title: card.title?.trim() || card.easy,
        easy: card.easy,
        medium: card.medium,
        expert: card.expert,
        normalEnabled: true,
      })),
    );
    rows = await db.select().from(categoryCards).orderBy(asc(categoryCards.sortOrder));
  }
  return rows.map(({ id, title, easy, medium, expert, normalEnabled }) => {
    const fingerprint = categoryFingerprint({ easy, medium, expert });
    return {
      id,
      title:
        title.trim() ||
        DEFAULT_TITLE_BY_FINGERPRINT.get(fingerprint) ||
        easy.trim() ||
        medium.trim() ||
        expert.trim() ||
        "Categoría",
      easy,
      medium,
      expert,
      normalEnabled: normalEnabled !== 0,
    };
  });
}

async function readCatalog() {
  const db = getDb();
  const categories = await readOrSeedCategories();
  const memberships = await db.select().from(categorySetMemberships);
  const setsByFingerprint = new Map<string, string[]>();
  for (const membership of memberships) {
    const list = setsByFingerprint.get(membership.fingerprint) ?? [];
    if (!list.includes(membership.setName)) list.push(membership.setName);
    setsByFingerprint.set(membership.fingerprint, list);
  }
  const catalog: CatalogCategory[] = categories.map((card) => ({
    title: card.title,
    easy: card.easy,
    medium: card.medium,
    expert: card.expert,
    normalEnabled: card.normalEnabled,
    sets: (setsByFingerprint.get(categoryFingerprint(card)) ?? []).sort((a, b) =>
      a.localeCompare(b, "es", { sensitivity: "base" }),
    ),
  }));
  const sets = Array.from(new Set(memberships.map((item) => item.setName))).sort((a, b) =>
    a.localeCompare(b, "es", { sensitivity: "base" }),
  );
  return { categories: catalog, sets };
}

export async function GET(request: Request) {
  await ensureSchema();
  const url = new URL(request.url);
  if (url.searchParams.get("verify") === "1") {
    return authorized(request)
      ? new Response(null, { status: 204 })
      : Response.json({ error: "Clave administrativa incorrecta." }, { status: 401 });
  }
  return Response.json(await readCatalog());
}

export async function PUT(request: Request) {
  await ensureSchema();
  if (!authorized(request))
    return Response.json({ error: "Clave administrativa incorrecta." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { categories?: unknown } | null;
  const clean = cleanCategories(body?.categories);
  if (!clean)
    return Response.json(
      { error: "Cada tarjeta necesita un título y al menos una categoría." },
      { status: 400 },
    );

  const db = getDb();
  const previous = await readOrSeedCategories();
  const visibility = new Map(
    previous.map((card) => [categoryFingerprint(card), card.normalEnabled] as const),
  );
  const nextCategories = clean.map((card) => ({
    ...card,
    normalEnabled: visibility.get(categoryFingerprint(card)) ?? true,
  }));

  try {
    await db.delete(categoryCards);
    await insertCategories(nextCategories);
    return Response.json(await readCatalog());
  } catch (error) {
    // Best-effort restoration keeps a failed save from leaving the catalog empty.
    try {
      await db.delete(categoryCards);
      await insertCategories(previous);
    } catch {}
    console.error("Failed to save category catalog", error);
    return Response.json(
      { error: "No se pudieron guardar las categorías. Intenta de nuevo." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  await ensureSchema();
  if (!authorized(request))
    return Response.json({ error: "Clave administrativa incorrecta." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = String(body?.action ?? "");
  const db = getDb();

  if (action === "quickAdd") {
    const setName = cleanSetName(body?.setName);
    const category = cleanCategory(body?.category);
    if (!setName)
      return Response.json({ error: "Indica el nombre del set." }, { status: 400 });
    if (!category)
      return Response.json(
        { error: "Escribe un título y al menos una categoría." },
        { status: 400 },
      );

    const existing = await readOrSeedCategories();
    const fingerprint = categoryFingerprint(category);
    if (!existing.some((item) => categoryFingerprint(item) === fingerprint)) {
      await db.insert(categoryCards).values({
        ...category,
        normalEnabled: body?.normalEnabled === true ? 1 : 0,
        sortOrder: -Date.now(),
        updatedAt: new Date().toISOString(),
      });
    }

    const [membership] = await db
      .select()
      .from(categorySetMemberships)
      .where(
        and(
          eq(categorySetMemberships.setName, setName),
          eq(categorySetMemberships.fingerprint, fingerprint),
        ),
      )
      .limit(1);
    if (!membership) {
      await db.insert(categorySetMemberships).values({
        setName,
        fingerprint,
        updatedAt: new Date().toISOString(),
      });
    }
    return Response.json(await readCatalog());
  }

  if (action === "saveSet") {
    const setName = cleanSetName(body?.setName);
    const requestedKeys = Array.isArray(body?.categoryKeys)
      ? body.categoryKeys.filter((value): value is string => typeof value === "string")
      : [];
    if (!setName)
      return Response.json({ error: "Indica el nombre del set." }, { status: 400 });
    if (!requestedKeys.length)
      return Response.json({ error: "Selecciona al menos una categoría para el set." }, { status: 400 });

    const available = new Set((await readOrSeedCategories()).map(categoryFingerprint));
    const keys = Array.from(new Set(requestedKeys)).filter((key) => available.has(key));
    if (!keys.length)
      return Response.json({ error: "No hay categorías válidas para guardar." }, { status: 400 });

    await db
      .delete(categorySetMemberships)
      .where(eq(categorySetMemberships.setName, setName));
    const updatedAt = new Date().toISOString();
    for (let offset = 0; offset < keys.length; offset += 50) {
      await db.insert(categorySetMemberships).values(
        keys.slice(offset, offset + 50).map((fingerprint) => ({
          setName,
          fingerprint,
          updatedAt,
        })),
      );
    }
    return Response.json(await readCatalog());
  }

  if (action === "setNormalVisibility") {
    const requestedKeys = Array.isArray(body?.categoryKeys)
      ? body.categoryKeys.filter((value): value is string => typeof value === "string")
      : [];
    const normalEnabled = body?.normalEnabled === true;
    if (!requestedKeys.length)
      return Response.json({ error: "Selecciona al menos una categoría." }, { status: 400 });
    const requested = new Set(requestedKeys);
    const matching = (await readOrSeedCategories()).filter((card) =>
      requested.has(categoryFingerprint(card)),
    );
    if (!matching.length)
      return Response.json({ error: "No se encontraron categorías válidas." }, { status: 400 });
    const updatedAt = new Date().toISOString();
    for (const card of matching) {
      await db
        .update(categoryCards)
        .set({ normalEnabled: normalEnabled ? 1 : 0, updatedAt })
        .where(eq(categoryCards.id, card.id));
    }
    return Response.json(await readCatalog());
  }

  return Response.json({ error: "Acción desconocida." }, { status: 400 });
}