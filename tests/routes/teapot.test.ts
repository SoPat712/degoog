import { describe, test, expect, beforeAll } from "bun:test";
import { initServerKey } from "../../src/server/utils/server-key";

let pot: {
  request: (
    req: Request | string,
    options?: RequestInit,
  ) => Response | Promise<Response>;
};

beforeAll(async () => {
  await initServerKey();
  pot = (await import("../../src/server/routes/teapot")).default;
});

const pour = (path = "/teapot", init?: RequestInit) =>
  pot.request(new Request(`http://localhost${path}`, init));

describe("HTCPCP", () => {
  test("I'm a teapot", async () => {
    const res = await pour();
    expect(res.status).toBe(418);
    expect(await res.text()).toBe("I'm a teapot");
  });

  test("coffee will not come out of this", async () => {
    const res = await pour("/teapot", {
      method: "POST",
      headers: { "Content-Type": "message/coffeepot" },
      body: "start",
    });
    expect(res.status).toBe(418);
  });

  test("neither will darjeeling", async () => {
    const res = await pour("/teapot/darjeeling", {
      method: "POST",
      headers: { "Content-Type": "message/teapot" },
      body: "start",
    });
    expect(res.status).toBe(418);
  });

  test("browsers get a page, still a teapot", async () => {
    const res = await pour("/teapot", { headers: { Accept: "text/html" } });
    expect(res.status).toBe(418);
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });
});
