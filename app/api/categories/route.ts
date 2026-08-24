import { asc } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { ensureSchema, getDb } from "../../../db";
import { categoryCards } from "../../../db/schema";
import { DEFAULT_CATEGORY_CARDS } from "../../../lib/categories";

type CategoryInput = { easy: string; medium: string; expert: string };

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
    const updatedAt = new Date().toISOString();
    await db.insert(categoryCards).values(
      DEFAULT_CATEGORY_CARDS.map((card, sortOrder) => ({
        ...card,
        sortOrder,
        updatedAt,
      })),
    );
    rows = await db.select().from(categoryCards).orderBy(asc(categoryCards.sortOrder));
  }
  return rows.map(({ easy, medium, expert }) => ({ easy, medium, expert }));
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
  const updatedAt = new Date().toISOString();
  await db.delete(categoryCards);
  await db.insert(categoryCards).values(
    clean.map((card, sortOrder) => ({ ...card, sortOrder, updatedAt })),
  );
  return Response.json({ categories: clean });
}
