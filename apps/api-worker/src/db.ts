export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

export interface D1Database {
  prepare(query: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown[]>;
}

export interface Env {
  DB: D1Database;
  CLOUDINARY_CLOUD_NAME?: string;
  CLOUDINARY_API_KEY?: string;
  CLOUDINARY_API_SECRET?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  STORE_NOTIFICATION_EMAIL?: string;
  ALLOWED_ORIGINS?: string;
  APP_ORIGIN?: string;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const statement = (db: D1Database, sql: string, ...values: unknown[]) =>
  db.prepare(sql).bind(...values);

export async function first<T>(db: D1Database, sql: string, ...values: unknown[]) {
  return statement(db, sql, ...values).first<T>();
}

export async function all<T>(db: D1Database, sql: string, ...values: unknown[]) {
  return (await statement(db, sql, ...values).all<T>()).results;
}

export async function run(db: D1Database, sql: string, ...values: unknown[]) {
  return statement(db, sql, ...values).run();
}

export const id = () => crypto.randomUUID();
export const sha256 = async (value: string) => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export function json(data: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store", ...headers },
  });
}

export function parseJson(request: Request) {
  const size = Number(request.headers.get("content-length") || 0);
  if (size > 100_000) throw new ApiError(413, "Request is too large.");
  return request.json();
}

export function bools<T extends Record<string, unknown>>(row: T, keys: string[]): T {
  for (const key of keys) if (key in row) row[key as keyof T] = Boolean(row[key]) as T[keyof T];
  return row;
}
