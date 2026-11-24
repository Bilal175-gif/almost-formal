import { getCloudflareContext } from "@opennextjs/cloudflare";

type ApiBinding = { fetch(input: Request): Promise<Response> };
export async function serverApi(path: string, init: RequestInit & { next?: { revalidate: number } } = {}) {
  const origin = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4100";
  const url = `${origin}/api${path}`;
  if (process.env.CF_WORKERS === "1") {
    try {
      const context = await getCloudflareContext({ async: true });
      const binding = (context.env as unknown as { API_WORKER?: ApiBinding }).API_WORKER;
      if (binding) return binding.fetch(new Request(url, init));
    } catch { /* Local build and preview can use the origin URL. */ }
  }
  return fetch(url, init);
}
