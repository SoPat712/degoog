import { describe, test, expect } from "bun:test";
import {
  followEngineFetch,
  type EngineFetcher,
} from "../../src/server/extensions/compatibility-layer/fourget/follow";

const cookieOf = (headers: Record<string, string>): string | undefined =>
  Object.entries(headers).find(([key]) => key.toLowerCase() === "cookie")?.[1];

describe("4get followEngineFetch", () => {
  test("strips Cookie on a cross-origin redirect when following", async () => {
    const seen: { url: string; cookie?: string }[] = [];
    const fetcher: EngineFetcher = async (url, init) => {
      seen.push({ url, cookie: cookieOf(init.headers) });
      expect(init.redirect).toBe("manual");
      if (url === "https://start.example/search") {
        return new Response(null, {
          status: 302,
          headers: { Location: "https://other.example/next" },
        });
      }
      return new Response("ok");
    };
    const resp = await followEngineFetch(fetcher, {
      url: "https://start.example/search",
      method: "GET",
      headers: { Cookie: "sid=1" },
      follow: true,
    });
    expect(await resp.text()).toBe("ok");
    expect(seen).toEqual([
      { url: "https://start.example/search", cookie: "sid=1" },
      { url: "https://other.example/next", cookie: undefined },
    ]);
  });

  test("keeps Cookie on a same-origin redirect", async () => {
    const seen: { url: string; cookie?: string }[] = [];
    const fetcher: EngineFetcher = async (url, init) => {
      seen.push({ url, cookie: cookieOf(init.headers) });
      if (url.endsWith("/search")) {
        return new Response(null, {
          status: 302,
          headers: { Location: "https://start.example/sp/search" },
        });
      }
      return new Response("ok");
    };
    await followEngineFetch(fetcher, {
      url: "https://start.example/search",
      method: "GET",
      headers: { Cookie: "sid=1" },
      follow: true,
    });
    expect(seen[1]).toEqual({
      url: "https://start.example/sp/search",
      cookie: "sid=1",
    });
  });

  test("a 302 turns a POST into a GET and drops its body", async () => {
    const seen: { method?: string; body?: string; type?: string }[] = [];
    const fetcher: EngineFetcher = async (url, init) => {
      seen.push({
        method: init.method,
        body: init.body,
        type: init.headers["Content-Type"],
      });
      if (url.endsWith("/search")) {
        return new Response(null, {
          status: 302,
          headers: { Location: "https://start.example/landed" },
        });
      }
      return new Response("ok");
    };
    await followEngineFetch(fetcher, {
      url: "https://start.example/search",
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      data: "q=cats",
      follow: true,
    });
    expect(seen[0]).toEqual({
      method: "POST",
      body: "q=cats",
      type: "application/x-www-form-urlencoded",
    });
    expect(seen[1]).toEqual({
      method: undefined,
      body: undefined,
      type: undefined,
    });
  });

  test("a 303 turns even a PUT into a GET", async () => {
    const seen: (string | undefined)[] = [];
    const fetcher: EngineFetcher = async (url, init) => {
      seen.push(init.method);
      if (url.endsWith("/search")) {
        return new Response(null, {
          status: 303,
          headers: { Location: "https://start.example/landed" },
        });
      }
      return new Response("ok");
    };
    await followEngineFetch(fetcher, {
      url: "https://start.example/search",
      method: "PUT",
      headers: {},
      data: "q=cats",
      follow: true,
    });
    expect(seen).toEqual(["PUT", undefined]);
  });

  test("a 307 keeps the method and the body", async () => {
    const seen: { method?: string; body?: string }[] = [];
    const fetcher: EngineFetcher = async (url, init) => {
      seen.push({ method: init.method, body: init.body });
      if (url.endsWith("/search")) {
        return new Response(null, {
          status: 307,
          headers: { Location: "https://start.example/landed" },
        });
      }
      return new Response("ok");
    };
    await followEngineFetch(fetcher, {
      url: "https://start.example/search",
      method: "POST",
      headers: {},
      data: "q=cats",
      follow: true,
    });
    expect(seen).toEqual([
      { method: "POST", body: "q=cats" },
      { method: "POST", body: "q=cats" },
    ]);
  });

  test("does not follow when the scraper did not ask", async () => {
    let calls = 0;
    const fetcher: EngineFetcher = async () => {
      calls += 1;
      return new Response(null, {
        status: 302,
        headers: { Location: "https://other.example/next" },
      });
    };
    const resp = await followEngineFetch(fetcher, {
      url: "https://start.example/search",
      method: "GET",
      headers: { Cookie: "sid=1" },
      follow: false,
    });
    expect(resp.status).toBe(302);
    expect(calls).toBe(1);
  });
});
