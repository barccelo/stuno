import { asc } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { ensureSchema, getDb } from "../../../db";
import { categoryCards } from "../../../db/schema";
import { DEFAULT_CATEGORY_CARDS } from "../../../lib/categories";

type CategoryInput = { easy: string; medium: string; expert: string };

const INSERT_BATCH_SIZE = 15;

function configuredAdminKey() {
  return env.CATEGORY_ADMIN_KEY;
}

function authorized(request: Request) {
  const expected = configuredAdminKey();
  const supplied = request.headers.get("x-stuno-admin-key");
  return Boolean(expected && supplied && supplied === expected);
}

function cleanCategories(value: unknown): CategoryInput[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 500)
    return null;
  const result: CategoryInput[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const easy = typeof row.easy === "string" ? row.easy.trim() : "";
    const medium = typeof row.medium === "string" ? row.medium.trim() : "";
    const expert = typeof row.expert === "string" ? row.expert.trim() : "";
    if (!easy || !medium || !expert || [easy, medium, expert].some((text) => text.length > 100))
      return null;
    result.push({ easy, medium, expert });
  }
  return result;
}

async function readOrSeedCategories() {
  const db = getDb();
  let rows = await db.select().from(categoryCards).orderBy(asc(categoryCards.sortOrder));
  if (!rows.length) {
    await insertCategories(DEFAULT_CATEGORY_CARDS);
    rows = await db.select().from(categoryCards).orderBy(asc(categoryCards.sortOrder));
  }
  return rows.map(({ easy, medium, expert }) => ({ easy, medium, expert }));
}

async function insertCategories(cards: CategoryInput[]) {
  const db = getDb();
  const updatedAt = new Date().toISOString();
  for (let offset = 0; offset < cards.length; offset += INSERT_BATCH_SIZE) {
    await db.insert(categoryCards).values(
      cards.slice(offset, offset + INSERT_BATCH_SIZE).map((card, index) => ({
        ...card,
        sortOrder: offset + index,
        updatedAt,
      })),
    );
  }
}

export async function GET(request: Request) {
  await ensureSchema();
  const url = new URL(request.url);
  if (url.searchParams.get("verify") === "1") {
    return authorized(request)
      ? new Response(null, { status: 204 })
      : Response.json({ error: "Clave administrativa incorrecta." }, { status: 401 });
  }
  return Response.json({ categories: await readOrSeedCategories() });
}

export async function PUT(request: Request) {
  await ensureSchema();
  if (!authorized(request))
    return Response.json({ error: "Clave administrativa incorrecta." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { categories?: unknown } | null;
  const clean = cleanCategories(body?.categories);
  if (!clean)
    return Response.json({ error: "Revisa que cada tarjeta tenga sus tres categorías." }, { status: 400 });

  const db = getDb();
  await db.delete(categoryCards);
  await insertCategories(clean);
  return Response.json({ categories: clean });
}
