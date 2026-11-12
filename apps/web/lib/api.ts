export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const unavailable =
  "The store is temporarily unavailable. Please try again in a minute.";

// React Query retries reads only. Never automatically replay order/login writes.
export function shouldRetryApiQuery(failureCount: number, error: Error) {
  if (error instanceof ApiError) {
    if (error.status === 429) return false;
    return error.status >= 500 && failureCount < 2;
  }
  return failureCount < 1;
}

export function apiRetryDelay(attempt: number, error: Error) {
  return error instanceof ApiError && error.status >= 500
    ? Math.min(5000 * (attempt + 1), 10000)
    : 1000;
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  // Hosting gateways can return an HTML error/cold-start page, including 200s.
  // Do not expose a JSON parser error (or gateway HTML) in the storefront.
  if (!/\bjson\b/i.test(response.headers.get("content-type") || ""))
    throw new ApiError(
      unavailable,
      response.status >= 500 ? response.status : 502,
    );
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(unavailable, 502);
  }
  if (!response.ok)
    throw new ApiError(
      data &&
        typeof data === "object" &&
        "error" in data &&
        typeof data.error === "string"
        ? data.error
        : response.status >= 500
          ? unavailable
          : "Something went wrong. Please try again.",
      response.status,
    );
  return data as T;
}
export type Settings = {
  name: string;
  email: string;
  phone: string;
  instagram: string;
  shipping: number;
  codEnabled: boolean;
  announcement: string;
};
