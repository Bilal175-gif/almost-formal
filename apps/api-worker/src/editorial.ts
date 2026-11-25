import { z } from "zod";
import { all, ApiError, first, id, json, run, type D1Database } from "./db";

const postInput = z.object({
  title: z.string().trim().min(3).max(160),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160),
  summary: z.string().trim().min(20).max(400),
  body: z.string().trim().min(80).max(30000),
  coverUrl: z.union([z.url().startsWith("https://res.cloudinary.com/"), z.literal("")]).default(""),
  published: z.boolean().default(false),
});
export const posts = async (db: D1Database, admin = false) => json(await all(db, `SELECT * FROM "BlogPost" ${admin ? "" : 'WHERE "published" = 1'} ORDER BY "createdAt" DESC`));
export async function post(db: D1Database, slug: string) {
  const row = await first(db, 'SELECT * FROM "BlogPost" WHERE "slug" = ? AND "published" = 1', slug);
  if (!row) throw new ApiError(404, "Article not found.");
  return json(row);
}
export async function savePost(db: D1Database, input: unknown, postId?: string) {
  const data = postInput.parse(input);
  const now = new Date().toISOString();
  const key = postId || id();
  if (postId && !(await first(db, 'SELECT "id" FROM "BlogPost" WHERE "id" = ?', postId))) throw new ApiError(404, "Article not found.");
  await run(db, 'INSERT INTO "BlogPost" ("id","slug","title","summary","body","coverUrl","published","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT("id") DO UPDATE SET "slug"=excluded."slug","title"=excluded."title","summary"=excluded."summary","body"=excluded."body","coverUrl"=excluded."coverUrl","published"=excluded."published","updatedAt"=excluded."updatedAt"', key, data.slug, data.title, data.summary, data.body, data.coverUrl, Number(data.published), now, now);
  return json(await first(db, 'SELECT * FROM "BlogPost" WHERE "id" = ?', key), postId ? 200 : 201);
}
