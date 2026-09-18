import { describe, test, expect, beforeAll } from "bun:test";
import type { CompatCatalogItem } from "../../src/shared/compat-layers";

let compatGroups: (items: CompatCatalogItem[]) => { key: string; items: CompatCatalogItem[] }[];
let compatPackages: (item: CompatCatalogItem) => string[];

const makeItem = (over: Partial<CompatCatalogItem> = {}): CompatCatalogItem => ({
  code: "mojeek",
  name: "Mojeek",
  types: ["web"],
  installed: false,
  missingDeps: [],
  runtime: [],
  ...over,
});

beforeAll(async () => {
  const stub = { scopedT: (): ((key: string) => string) => (key: string) => key };
  Object.assign(globalThis, { window: stub });
  const render = await import("../../src/client/settings/engines/compat-render");
  compatGroups = render.compatGroups;
  compatPackages = render.compatPackages;
});

describe("compatibility layer catalogue rendering", () => {
  test("groups by primary type and keeps web first", () => {
    const groups = compatGroups([
      makeItem({ code: "artic", name: "Artic", types: ["images"] }),
      makeItem(),
      makeItem({ code: "ansa", name: "Ansa", types: ["news"] }),
    ]);
    expect(groups.map((group) => group.key)).toEqual(["web", "images", "news"]);
  });

  test("only the missing runtime bits turn into an install hint", () => {
    const item = makeItem({
      runtime: [
        { module: "babel", package: "Babel", missing: true },
        { module: "lxml", package: "lxml", missing: false },
      ],
    });
    expect(compatPackages(item)).toEqual(["Babel"]);
    expect(compatPackages(makeItem())).toEqual([]);
  });
});
