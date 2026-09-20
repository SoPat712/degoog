import { Hono } from "hono";
import { guardSettingsRoute } from "./settings-auth";
import { readObjectBody } from "../utils/hono";
import { getInstanceSettings } from "../utils/server-settings";
import { readDomainLists } from "../utils/domain-lists";
import { readIndexerLists } from "../indexer/config/lists";
import { SETTINGS_SCHEMA } from "../utils/settings-schema";
import { applySettingsBatch } from "../utils/settings-write";
import { logger } from "../utils/logger";

const router = new Hono();

const BACKUP_KIND = "degoog-settings";
const BACKUP_VERSION = 1;
const MAX_IMPORT_CHARS = 2_000_000;

type SettingsBackup = {
  kind: typeof BACKUP_KIND;
  version: number;
  exportedAt: string;
  settings: Record<string, string>;
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
): Record<string, string> | null => {
  if (body.kind !== BACKUP_KIND) return null;
  // A newer file could hold keys this build would mangle.
  if (typeof body.version !== "number" || body.version > BACKUP_VERSION)
    return null;
  if (!_isRecord(body.settings)) return null;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(body.settings)) {
    if (!(key in SETTINGS_SCHEMA)) continue;
    const text = _asText(value);
    if (text !== null) out[key] = text;
  }
  return out;
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
  const body = await readObjectBody<Record<string, unknown>>(c);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);
  if (JSON.stringify(body).length > MAX_IMPORT_CHARS)
    return c.json({ error: "Backup too large" }, 413);

  const settings = _readBackup(body);
  if (!settings) return c.json({ error: "Not a Degoog settings backup" }, 400);

  const applied = Object.keys(settings).length;
  if (applied === 0)
    return c.json({ error: "Backup has no settings this build knows" }, 400);

  const result = await applySettingsBatch(settings);
  logger.info("settings-backup", `restored ${applied} settings from a backup`);
  return c.json({ ...result, applied });
});

export default router;
