import { Hono } from "hono";
import { guardSettingsRoute } from "./settings-auth";
import { getInstanceSettings } from "../utils/server-settings";
import { readDomainLists } from "../utils/domain-lists";
import { readIndexerLists } from "../indexer/config/lists";
import { SETTINGS_SCHEMA } from "../utils/settings-schema";
import { applySettingsBatch } from "../utils/settings-write";
import { logger } from "../utils/logger";
import {
  collectExtensions,
  readExtensionsBackup,
  restoreExtensions,
  type ExtensionsBackup,
} from "../utils/settings-backup-extensions";
import { MAX_SETTINGS_BACKUP_BYTES } from "../../shared/settings-backup";

const router = new Hono();

const BACKUP_KIND = "degoog-settings";
const BACKUP_VERSION = 2;

type SettingsBackup = {
  kind: typeof BACKUP_KIND;
  version: number;
  exportedAt: string;
  settings: Record<string, string>;
  extensions: ExtensionsBackup;
};

const _isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const _asText = (value: unknown): string | null => {
  if (typeof value === "string") return value;
  if (typeof value === "boolean" || typeof value === "number")
    return String(value);
  return null;
};

// Schema filter keeps apiSecretKey and instanceId out of the file.
const _collectSettings = async (): Promise<Record<string, string>> => {
  const merged: Record<string, unknown> = {
    ...(await getInstanceSettings()),
    ...(await readIndexerLists()),
    ...(await readDomainLists()),
  };
  const out: Record<string, string> = {};
  for (const key of Object.keys(SETTINGS_SCHEMA)) {
    const value = _asText(merged[key]);
    if (value !== null) out[key] = value;
  }
  return out;
};

const _readBackup = (
  body: Record<string, unknown>,
): { settings: Record<string, string>; extensions: ExtensionsBackup } | null => {
  if (body.kind !== BACKUP_KIND) return null;
  // A newer file could hold keys this build would mangle.
  if (typeof body.version !== "number" || body.version > BACKUP_VERSION)
    return null;
  if (!_isRecord(body.settings)) return null;
  const settings: Record<string, string> = {};
  for (const [key, value] of Object.entries(body.settings)) {
    if (!(key in SETTINGS_SCHEMA)) continue;
    const text = _asText(value);
    if (text !== null) settings[key] = text;
  }
  return { settings, extensions: readExtensionsBackup(body.extensions) };
};

const _filename = (): string =>
  `degoog-settings-${new Date().toISOString().slice(0, 10)}.json`;

router.get("/api/settings/export", async (c) => {
  const denied = await guardSettingsRoute(c, "GET /api/settings/export");
  if (denied) return denied;
  const backup: SettingsBackup = {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: await _collectSettings(),
    extensions: await collectExtensions(),
  };
  const body = JSON.stringify(backup, null, 2);
  const name = _filename();
  return c.body(body, 200, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    // Byte length, not string length: lists and CSS can be non-ASCII.
    "Content-Length": String(new TextEncoder().encode(body).byteLength),
    "Cache-Control": "no-store",
  });
});

router.post("/api/settings/import", async (c) => {
  const denied = await guardSettingsRoute(c, "POST /api/settings/import");
  if (denied) return denied;

  const raw = await c.req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_SETTINGS_BACKUP_BYTES)
    return c.json({ error: "Backup too large" }, 413);

  let body: Record<string, unknown> | null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    body =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
  } catch {
    body = null;
  }
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  const backup = _readBackup(body);
  if (!backup) return c.json({ error: "Not a Degoog settings backup" }, 400);

  const { settings, extensions } = backup;
  const applied = Object.keys(settings).length;
  const hasExtensions =
    extensions.repos.length > 0 ||
    extensions.installed.length > 0 ||
    Object.keys(extensions.settings).length > 0 ||
    extensions.defaultEngines !== null;
  if (applied === 0 && !hasExtensions)
    return c.json({ error: "Backup has no settings this build knows" }, 400);

  const result = await applySettingsBatch(settings);
  const restored = await restoreExtensions(extensions);
  logger.info(
    "settings-backup",
    `restored ${applied} settings, ${restored.reposAdded} repos and ${restored.extensionsInstalled} extensions from a backup`,
  );
  return c.json({ ...result, ...restored, applied });
});

export default router;
