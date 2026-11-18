import type { RequestHandler } from "express";

// Cache only public catalogue JSON, with bounded memory and no timers/polling.
// Checkout always reads current stock/prices directly from the database.
export function publicCache(ttlSeconds: number): RequestHandler {
  const entries = new Map<string, { body: string; until: number }>();
  let bytes = 0;
  let generation = 0;
  const clear = () => {
    entries.clear();
    bytes = 0;
    generation++;
  };
  return (req, res, next) => {
    if (!ttlSeconds) return next();
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      // Clear immediately and after completion, including failed writes that may
      // have committed before returning an error. Never cache an in-flight read.
      clear();
      res.once("finish", clear);
      return next();
    }
    if (
      req.method !== "GET" ||
      !/^\/api\/(products(?:\/[^/]+)?|product-filters|categories|settings)$/.test(
        req.path,
      )
    )
      return next();
    const key = req.originalUrl;
    const cached = entries.get(key);
    if (cached && cached.until > Date.now())
      return res.type("json").send(cached.body);
    if (cached) {
      bytes -= Buffer.byteLength(cached.body);
      entries.delete(key);
    }
    const version = generation;
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
      if (res.statusCode === 200 && version === generation) {
        const serialized = JSON.stringify(body);
        const size = Buffer.byteLength(serialized);
        if (size <= 256 * 1024) {
          if (entries.size >= 100 || bytes + size > 4 * 1024 * 1024) clear();
          // Another request may have populated this key in the meantime.
          const previous = entries.get(key);
          if (previous) bytes -= Buffer.byteLength(previous.body);
          entries.set(key, {
            body: serialized,
            until: Date.now() + ttlSeconds * 1000,
          });
          bytes += size;
        }
      }
      return json(body);
    };
    next();
  };
}
