import { asBoolean } from "./plugin-settings";
import {
  getInstanceSettings,
  setInstanceSettings,
  type ServerSettingValue,
} from "./server-settings";
import { SETTINGS_SCHEMA, coerceSetting } from "./settings-schema";
import { isDomainListKey, writeDomainList } from "./domain-lists";
import { isIndexerListKey, writeIndexerList } from "../indexer/config/lists";
import { syncBlocklist } from "./bot-trap";
import { startQueue, stopQueue } from "../indexer/queue";
import { ReloadMode, reloadSync } from "../extensions/store/reload-sync";
import { COMPAT_SETTING_KEYS } from "../extensions/compatibility-layer/registry";
import { ExtensionStoreType } from "../types";
import { OVERSIZED_TEXT_FIELDS } from "../../shared/indexer";
import { SEARCH_LIST_FIELDS } from "../../shared/settings-lists";
import { logger } from "./logger";

export type SettingsSaveResult = {
  ok: true;
  searxReloadFailed?: true;
  indexerStartFailed?: true;
};

export const LIST_FIELDS = [
  ...OVERSIZED_TEXT_FIELDS,
  ...SEARCH_LIST_FIELDS,
] as const;

export const isListField = (key: string): boolean =>
  isIndexerListKey(key) || isDomainListKey(key);

export const writeListField = async (
  key: string,
  value: string,
): Promise<void> => {
  if (isIndexerListKey(key)) await writeIndexerList(key, value);
  else if (isDomainListKey(key)) await writeDomainList(key, value);
};

export const savedBody = (
  reloaded: boolean,
  indexerUp = true,
): SettingsSaveResult => {
  const body: SettingsSaveResult = { ok: true };
  if (!reloaded) body.searxReloadFailed = true;
  if (!indexerUp) body.indexerStartFailed = true;
  return body;
};

export const reloadCompat = async (): Promise<boolean> => {
  try {
    await reloadSync(ExtensionStoreType.Engine, ReloadMode.Bust);
    return true;
  } catch (err) {
    logger.warn(
      "settings",
      "engine reload after a compatibility layer toggle failed",
      err,
    );
    return false;
  }
};

export const reconcileIndexerQueue = async (): Promise<boolean> => {
  const settings = await getInstanceSettings();
  if (!asBoolean(settings.degoogIndexerEnabled)) {
    await stopQueue();
    return true;
  }
  try {
    await startQueue();
    return true;
  } catch (err) {
    logger.error("indexer", "queue start failed", err);
    return false;
  }
};

const _schemaUpdates = (
  body: Record<string, string>,
): Record<string, string | boolean> => {
  const updates: Record<string, string | boolean> = {};
  for (const [key, def] of Object.entries(SETTINGS_SCHEMA)) {
    const raw = body[key];
    if (typeof raw !== "string") continue;
    // List fields go to their own stores via _persistListFields.
    if (isListField(key)) continue;
    updates[key] = coerceSetting(def, raw);
  }
  return updates;
};

const _persistListFields = async (
  body: Record<string, string>,
): Promise<void> => {
  for (const key of LIST_FIELDS) {
    const raw = body[key];
    if (typeof raw === "string") await writeListField(key, raw);
  }
};

// Only a flag that actually flipped earns an engine reload.
const _compatToggled = (
  updates: Record<string, string | boolean>,
  existing: Record<string, ServerSettingValue>,
): boolean =>
  COMPAT_SETTING_KEYS.some(
    (key) =>
      key in updates && asBoolean(updates[key]) !== asBoolean(existing[key]),
  );

// Shared with the settings form; merges, so a partial body is safe.
export const applySettingsBatch = async (
  body: Record<string, string>,
): Promise<SettingsSaveResult> => {
  const existing = await getInstanceSettings();
  const updates = _schemaUpdates(body);
  await setInstanceSettings({ ...existing, ...updates });
  await _persistListFields(body);
  await syncBlocklist();
  const indexerUp = await reconcileIndexerQueue();
  const toggled = _compatToggled(updates, existing);
  return savedBody(toggled ? await reloadCompat() : true, indexerUp);
};
