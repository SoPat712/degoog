import { describe, test, expect } from "bun:test";
import {
  isPublishDate,
  snippetDate,
  stripSnippetPrefix,
} from "../../src/server/utils/text";
import { scoreResults } from "../../src/server/search";
import type { SearchResult } from "../../src/server/types";

const BODY = "A perfectly ordinary snippet about nothing in particular.";

const result = (snippet: string, source = "E1"): SearchResult => ({
  title: "t",
  url: "https://example.com/a",
  snippet,
  source,
});

describe("snippetDate", () => {
  test("reads an ISO prefix", () => {
    expect(snippetDate(`2024-01-12 - ${BODY}`)).toEqual({
      iso: "2024-01-12",
      rest: BODY,
    });
  });

  test("reads a month-first prefix", () => {
    expect(snippetDate(`Jan 12, 2024 - ${BODY}`)?.iso).toBe("2024-01-12");
    expect(snippetDate(`January 12, 2024 · ${BODY}`)?.iso).toBe("2024-01-12");
  });

  test("reads a day-first prefix", () => {
    expect(snippetDate(`12 January 2024 - ${BODY}`)?.iso).toBe("2024-01-12");
    expect(snippetDate(`3 Feb. 2020 – ${BODY}`)?.iso).toBe("2020-02-03");
  });

  test("resolves a relative prefix against now", () => {
    const expected = new Date(Date.now() - 3 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(snippetDate(`3 days ago - ${BODY}`)?.iso).toBe(expected);
  });

  test("rejects an impossible day", () => {
    expect(snippetDate(`2024-02-31 - ${BODY}`)).toBeNull();
    expect(snippetDate(`Feb 30, 2024 - ${BODY}`)).toBeNull();
  });

  test("needs a separator and a body", () => {
    expect(snippetDate(`2024-01-12 ${BODY}`)).toBeNull();
    expect(snippetDate("2024-01-12 - ")).toBeNull();
  });

  test("leaves an ambiguous slash date alone", () => {
    expect(snippetDate(`01/12/2024 - ${BODY}`)).toBeNull();
  });

  test("ignores a date that is not at the start", () => {
    expect(snippetDate(`Filmed on 2024-01-12 - ${BODY}`)).toBeNull();
  });

  test("stripSnippetPrefix still drops the whole prefix", () => {
    expect(stripSnippetPrefix(`2024-01-12 - ${BODY}`)).toBe(BODY);
  });
});

describe("isPublishDate", () => {
  test("rejects the epoch sentinel and anything near it", () => {
    expect(isPublishDate("1970-01-01")).toBe(false);
    expect(isPublishDate("1970-01-02")).toBe(false);
    expect(isPublishDate("1989-12-31")).toBe(false);
  });

  test("rejects dates comfortably in the future", () => {
    const next = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    expect(isPublishDate(next)).toBe(false);
  });

  test("accepts a plausible date", () => {
    expect(isPublishDate("2024-01-12")).toBe(true);
    expect(isPublishDate(new Date().toISOString().slice(0, 10))).toBe(true);
  });

  test("rejects anything that is not a plain ISO day", () => {
    expect(isPublishDate("")).toBe(false);
    expect(isPublishDate("2024-1-2")).toBe(false);
    expect(isPublishDate("2024-01-12T00:00:00Z")).toBe(false);
    expect(isPublishDate("2024-02-31")).toBe(false);
  });
});

describe("scoreResults publication dates", () => {
  test("lifts the date out of the snippet", () => {
    const [merged] = scoreResults([
      { results: [result(`2024-01-12 - ${BODY}`)] },
    ]);
    expect(merged.publishedAt).toBe("2024-01-12");
    expect(merged.snippet).toBe(BODY);
  });

  test("keeps a date the engine supplied itself", () => {
    const [merged] = scoreResults([
      {
        results: [{ ...result(`2024-01-12 - ${BODY}`), publishedAt: "2019-07-01" }],
      },
    ]);
    expect(merged.publishedAt).toBe("2019-07-01");
    expect(merged.snippet).toBe(`2024-01-12 - ${BODY}`);
  });

  test("drops an epoch date an engine handed over", () => {
    const [merged] = scoreResults([
      { results: [{ ...result(BODY), publishedAt: "1970-01-01" }] },
    ]);
    expect(merged.publishedAt).toBeUndefined();
    expect(merged.snippet).toBe(BODY);
  });

  test("falls back to the snippet when the engine date is junk", () => {
    const [merged] = scoreResults([
      {
        results: [
          { ...result(`2024-01-12 - ${BODY}`), publishedAt: "1970-01-01" },
        ],
      },
    ]);
    expect(merged.publishedAt).toBe("2024-01-12");
    expect(merged.snippet).toBe(BODY);
  });

  test("leaves an undated snippet untouched", () => {
    const [merged] = scoreResults([{ results: [result(BODY)] }]);
    expect(merged.publishedAt).toBeUndefined();
    expect(merged.snippet).toBe(BODY);
  });

  test("takes a date from a duplicate when the first engine had none", () => {
    const [merged] = scoreResults([
      { results: [result(BODY, "E1")] },
      { results: [result(`2024-01-12 - ${BODY} And then some more.`, "E2")] },
    ]);
    expect(merged.publishedAt).toBe("2024-01-12");
    expect(merged.sources).toEqual(["E1", "E2"]);
  });
});
