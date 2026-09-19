import { ExtensionStoreType, type RepoInfo } from "../../types";
import {
  COMPAT_LAYER_LABELS,
  type CompatLayerId,
} from "../../../shared/compat-layers";
import {
  COMPAT_ORIGIN_ICONS,
  CORE_ORIGIN_ICON,
  CORE_ORIGIN_LABEL,
  EngineOriginKind,
  STORE_ORIGIN_GLYPH,
  type EngineOrigin,
} from "../../../shared/engine-origins";
import { normalizeRepoUrl, readReposData } from "../store/persistence";
import { folderFromExtID } from "../../utils/extension-id";
import { getBasePath } from "../../utils/base-url";
import { buildSignedProxyUrl } from "../../utils/proxy-sign";
import { logger } from "../../utils/logger";

const NS = "engine-origins";

export type OriginMap = ReadonlyMap<string, EngineOrigin>;

const _asset = (path: string): string => `${getBasePath()}${path}`;

const _coreOrigin = (): EngineOrigin => ({
  kind: EngineOriginKind.Core,
  label: CORE_ORIGIN_LABEL,
  icon: _asset(CORE_ORIGIN_ICON),
});

const _storeOrigin = (repo: RepoInfo): EngineOrigin => {
  const base = { kind: EngineOriginKind.Store, label: repo.name };
  const image = repo.repoImage ?? "";
  if (/^https?:\/\//i.test(image)) {
    return { ...base, icon: buildSignedProxyUrl(image) };
  }
  return { ...base, glyph: STORE_ORIGIN_GLYPH };
};

export const storeOrigins = async (): Promise<OriginMap> => {
  const origins = new Map<string, EngineOrigin>();
  try {
    const data = await readReposData();
    const repos = new Map(
      data.repos.map((repo) => [normalizeRepoUrl(repo.url), repo]),
    );
    for (const item of data.installed) {
      if (item.type !== ExtensionStoreType.Engine) continue;
      const repo = repos.get(normalizeRepoUrl(item.repoUrl));
      if (!repo) continue;
      origins.set(item.installedAs, _storeOrigin(repo));
    }
  } catch (err) {
    logger.warn(NS, "could not read store origins from repos.json", err);
  }
  return origins;
};

export const engineOrigin = (
  entry: { id: string; compatibilityLayer?: string },
  origins: OriginMap,
): EngineOrigin => {
  const layer = entry.compatibilityLayer as CompatLayerId | undefined;
  if (layer && COMPAT_ORIGIN_ICONS[layer]) {
    return {
      kind: EngineOriginKind.Compat,
      label: COMPAT_LAYER_LABELS[layer],
      icon: _asset(COMPAT_ORIGIN_ICONS[layer]),
    };
  }
  const folder = folderFromExtID(entry.id, "engine");
  return origins.get(folder) ?? origins.get(entry.id) ?? _coreOrigin();
};
