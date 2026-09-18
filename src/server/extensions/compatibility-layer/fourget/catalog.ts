import type { FourGetCatalogEntry } from "./catalog-types";

export const FOURGET_SOURCE_BASE_URL =
  "https://git.lolcat.ca/lolcat/4get/raw/branch/master";

export const FOURGET_SHARED_FILES: readonly string[] = Object.freeze([
  "backend",
  "fuckhtml",
  "anubis",
  "proxy_pool",
  "nextpage",
]);

export const FOURGET_CATALOG: readonly FourGetCatalogEntry[] = Object.freeze([
  {
    code: "ddg",
    name: "DuckDuckGo",
    types: ["web", "images", "videos", "news"],
    site: "https://duckduckgo.com",
    deps: ["backend", "fuckhtml"],
  },
  {
    code: "brave",
    name: "Brave",
    types: ["web", "news", "images", "videos"],
    site: "https://search.brave.com",
    deps: ["backend", "fuckhtml"],
    wantsImpersonation: true,
  },
  {
    code: "startpage",
    name: "Startpage",
    types: ["web", "images", "videos", "news"],
    site: "https://www.startpage.com",
    deps: ["backend", "fuckhtml", "anubis"],
  },
  {
    code: "yandex",
    name: "Yandex",
    types: ["web", "images", "videos"],
    site: "https://yandex.com",
    deps: ["backend", "fuckhtml"],
    wantsImpersonation: true,
  },
  {
    code: "marginalia",
    name: "Marginalia",
    types: ["web"],
    site: "https://search.marginalia.nu",
    deps: ["backend", "anubis"],
  },
  {
    code: "mwmbl",
    name: "Mwmbl",
    types: ["web"],
    site: "https://mwmbl.org",
    deps: ["backend", "fuckhtml"],
  },
  {
    code: "wiby",
    name: "Wiby",
    types: ["web"],
    site: "https://wiby.me",
    deps: ["backend"],
  },
  {
    code: "yep",
    name: "Yep",
    types: ["web"],
    site: "https://yep.com",
    deps: ["backend", "fuckhtml"],
    wantsImpersonation: true,
  },
  {
    code: "mojeek",
    name: "Mojeek",
    types: ["web", "news"],
    site: "https://www.mojeek.com",
    deps: ["backend", "fuckhtml"],
    needsApiKey: true,
  },
]);

const _extraCodes = (): string[] =>
  (process.env.DEGOOG_FOURGET_EXTRA_SCRAPERS ?? "")
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);

export const catalogEntry = (code: string): FourGetCatalogEntry | undefined =>
  FOURGET_CATALOG.find((entry) => entry.code === code);

export const isSharedFile = (code: string): boolean =>
  FOURGET_SHARED_FILES.includes(code);

export const isKnownScraper = (code: string): boolean =>
  catalogEntry(code) !== undefined || _extraCodes().includes(code);

export const catalogDeps = (code: string): string[] => [
  ...(catalogEntry(code)?.deps ?? ["backend", "fuckhtml"]),
];

export const scraperUrl = (code: string): string =>
  `${FOURGET_SOURCE_BASE_URL}/scraper/${encodeURIComponent(code)}.php`;

export const sharedUrl = (code: string): string =>
  `${FOURGET_SOURCE_BASE_URL}/lib/${encodeURIComponent(code)}.php`;
