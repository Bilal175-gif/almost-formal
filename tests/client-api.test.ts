import { test } from "node:test";
import assert from "node:assert/strict";
import {
  api,
  ApiError,
  shouldRetryApiQuery,
  apiRetryDelay,
} from "../apps/web/lib/api.js";

test("store API handles gateway HTML and malformed JSON without exposing parser errors", async () => {
  const original = globalThis.fetch;
  try {
    for (const response of [
      new Response("<!DOCTYPE html><title>502</title>", {
        status: 502,
        headers: { "Content-Type": "text/html" },
      }),
      new Response("<!DOCTYPE html>Waking up", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
      new Response("broken-json", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ]) {
      globalThis.fetch = async () => response;
      await assert.rejects(
        () => api("/products"),
        (error: unknown) => {
          assert.ok(error instanceof ApiError);
          assert.equal(error.status, 502);
          assert.match(error.message, /temporarily unavailable/);
          assert.ok(!error.message.includes("DOCTYPE"));
          return true;
        },
      );
    }
  } finally {
    globalThis.fetch = original;
  }
});

test("store API preserves valid data, auth errors and multipart uploads", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ products: [], total: 0 });
    assert.deepEqual(await api("/products"), { products: [], total: 0 });
    let requests = 0;
    globalThis.fetch = async (_url, options) => {
      requests++;
      assert.equal(options?.method, "POST");
      return Response.json(
        { error: "Password is incorrect." },
        { status: 401 },
      );
    };
    await assert.rejects(
      () => api("/auth/login", { method: "POST", body: "{}" }),
      /Password is incorrect/,
    );
    assert.equal(requests, 1);
    globalThis.fetch = async (_url, options) => {
      assert.equal(new Headers(options?.headers).get("Content-Type"), null);
      return Response.json({ url: "https://example.test/image.webp" });
    };
    await api("/admin/uploads", { method: "POST", body: new FormData() });
  } finally {
    globalThis.fetch = original;
  }
});

test("temporary read failures allow cold starts; authentication and rate limits do not retry", () => {
  const temporary = new ApiError("Unavailable", 503);
  assert.equal(shouldRetryApiQuery(0, temporary), true);
  assert.equal(shouldRetryApiQuery(4, temporary), true);
  assert.equal(shouldRetryApiQuery(5, temporary), false);
  assert.equal(
    shouldRetryApiQuery(0, new ApiError("Unauthorized", 401)),
    false,
  );
  assert.equal(
    shouldRetryApiQuery(0, new ApiError("Rate limited", 429)),
    false,
  );
  assert.equal(apiRetryDelay(0, temporary), 3000);
  assert.equal(apiRetryDelay(4, temporary), 12000);
});
