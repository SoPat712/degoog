import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { makeExtID } from "../../src/server/utils/extension-id";
import {
  getSlotPluginById,
  getSlotPlugins,
  initSlotPlugins,
} from "../../src/server/extensions/slots/registry";
import {
  SlotPanelPosition,
  type ScoredResult,
  type SlotPluginContext,
} from "../../src/server/types";

const AT_A_GLANCE_ID = makeExtID("at-a-glance", "slot");
const WIKIPEDIA_ID = makeExtID("wikipedia", "slot");

describe("slots registry", () => {
  const origFetch = globalThis.fetch;

  beforeAll(async () => {
    globalThis.fetch = Object.assign(async () => new Response("", { status: 404 }), {
      preconnect: origFetch.preconnect,
    });

    const orig = process.env.DEGOOG_PLUGINS_DIR;
    process.env.DEGOOG_PLUGINS_DIR = "/nonexistent-slots-dir";
    await initSlotPlugins();
    if (orig !== undefined) process.env.DEGOOG_PLUGINS_DIR = orig;
    else delete process.env.DEGOOG_PLUGINS_DIR;
  });

  afterAll(() => {
    globalThis.fetch = origFetch;
  });

  test("getSlotPlugins returns array", () => {
    const plugins = getSlotPlugins();
    expect(Array.isArray(plugins)).toBe(true);
  });

  test("getSlotPluginById returns null for unknown id", () => {
    expect(getSlotPluginById("unknown-slot")).toBeNull();
  });

  test("built-in at-a-glance slot has position at-a-glance and waitForResults", () => {
    const slot = getSlotPluginById(AT_A_GLANCE_ID);
    expect(slot).not.toBeNull();
    expect(slot!.position).toBe(SlotPanelPosition.AtAGlance);
    expect(slot!.waitForResults).toBe(true);
  });

  test("built-in wikipedia slot has position knowledge-panel", () => {
    const slot = getSlotPluginById(WIKIPEDIA_ID);
    expect(slot).not.toBeNull();
    expect(slot!.position).toBe(SlotPanelPosition.KnowledgePanel);
  });

  test("built-in wikipedia slot trigger returns false for very short queries", async () => {
    const slot = getSlotPluginById(WIKIPEDIA_ID);
    expect(slot).not.toBeNull();
    const result = await slot!.trigger("x");
    expect(result).toBe(false);
  });

  test("built-in wikipedia slot execute returns empty html when no page cached", async () => {
    const slot = getSlotPluginById(WIKIPEDIA_ID);
    expect(slot).not.toBeNull();
    const result = await slot!.execute("__nonexistent_query_xyz__");
    expect(result.html).toBe("");
  });

  test("built-in at-a-glance slot translates its strings with the request locale", async () => {
    const slot = getSlotPluginById(AT_A_GLANCE_ID);
    expect(slot).not.toBeNull();
    const results = [
      {
        title: "Example Domain",
        url: "https://example.com/",
        snippet:
          "This domain is for use in illustrative examples in documents and can be used without permission.",
        score: 1,
        sources: ["Google CSE"],
      },
    ] as unknown as ScoredResult[];
    const withLocale = (locale: string) =>
      ({ results, locale }) as unknown as SlotPluginContext;

    const de = await slot!.execute("example domain", withLocale("de-DE"));
    expect(de.html).toContain("Gefunden auf: Google CSE");
    expect(de.html).not.toContain("Found on");

    const en = await slot!.execute("example domain", withLocale("en-US"));
    expect(en.html).toContain("Found on: Google CSE");
  });
});
