import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import backupRouter from "../../src/server/routes/settings-backup";
import {
  clearServerSettingsCache,
  updateInstanceSettings,
} from "../../src/server/utils/server-settings";
import { readDomainLists } from "../../src/server/utils/domain-lists";

type ExportBody = {
  kind: string;
  version: number;
  settings: Record<string, string>;
};

// Import writes every list field, so isolate the shared indexer paths too.
const ISOLATED_ENV = [
  "DEGOOG_DATA_DIR",
  "DEGOOG_SERVER_SETTINGS_FILE",
  "DEGOOG_INDEXER_DIR",
  "DEGOOG_INDEXER_CONFIG_FILE",
  "DEGOOG_SEARCH_LISTS_FILE",
  "DEGOOG_PUBLIC_INSTANCE",
  "DEGOOG_SETTINGS_PASSWORDS",
  "DEGOOG_DANGEROUSLY_NO_PASSWORD",
] as const;

let tempDir: string;
let savedEnv: Record<string, string | undefined>;

const exportSettings = async (): Promise<ExportBody> => {
  const res = await backupRouter.request("http://localhost/api/settings/export");
  expect(res.status).toBe(200);
  return (await res.json()) as ExportBody;
};

const importBackup = async (body: unknown): Promise<Response> =>
  backupRouter.request(
    new Request("http://localhost/api/settings/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  savedEnv = Object.fromEntries(
    ISOLATED_ENV.map((name) => [name, process.env[name]]),
  );
  for (const name of ISOLATED_ENV) delete process.env[name];

  tempDir = mkdtempSync(join(tmpdir(), "degoog-settings-backup-"));
  Object.assign(process.env, {
    DEGOOG_DATA_DIR: tempDir,
    DEGOOG_SERVER_SETTINGS_FILE: join(tempDir, "server-settings.json"),
    DEGOOG_INDEXER_DIR: join(tempDir, "indexer"),
    DEGOOG_INDEXER_CONFIG_FILE: join(tempDir, "indexer-config.json"),
    DEGOOG_SEARCH_LISTS_FILE: join(tempDir, "search-lists.json"),
    DEGOOG_DANGEROUSLY_NO_PASSWORD: "true",
  });
  clearServerSettingsCache();
});

afterEach(() => {
  clearServerSettingsCache();
  rmSync(tempDir, { recursive: true, force: true });
  for (const name of ISOLATED_ENV) {
    const value = savedEnv[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("routes/settings-backup", () => {
  test("export only carries keys the settings schema knows", async () => {
    await updateInstanceSettings({
      acDebounceMs: "450",
      apiSecretKey: "do-not-leak",
    });

    const body = await exportSettings();

    expect(body.kind).toBe("degoog-settings");
    expect(body.settings.acDebounceMs).toBe("450");
    expect(body.settings).not.toHaveProperty("apiSecretKey");
    expect(body.settings).not.toHaveProperty("instanceId");
  });

  test("a round trip restores values and list fields", async () => {
    await updateInstanceSettings({ acDebounceMs: "450" });
    const backup = await exportSettings();
    backup.settings.acDebounceMs = "777";
    backup.settings.domainBlockList = "example.invalid\nspam.invalid";

    const res = await importBackup(backup);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });

    const restored = await exportSettings();
    expect(restored.settings.acDebounceMs).toBe("777");
    expect((await readDomainLists()).domainBlockList).toBe(
      "example.invalid\nspam.invalid",
    );
  });

  test("import drops unknown keys rather than storing them", async () => {
    const res = await importBackup({
      kind: "degoog-settings",
      version: 1,
      settings: { acDebounceMs: "120", somethingElse: "nope" },
    });
    expect(await res.json()).toMatchObject({ applied: 1 });

    const body = await exportSettings();
    expect(body.settings).not.toHaveProperty("somethingElse");
  });

  test("import rejects anything that is not a known backup", async () => {
    const cases: unknown[] = [
      {},
      { kind: "something-else", version: 1, settings: {} },
      { kind: "degoog-settings", version: 99, settings: { acDebounceMs: "1" } },
      { kind: "degoog-settings", version: 1, settings: [] },
    ];
    for (const payload of cases) {
      expect((await importBackup(payload)).status).toBe(400);
    }
  });

  test("a backup with no recognised settings changes nothing", async () => {
    const res = await importBackup({
      kind: "degoog-settings",
      version: 1,
      settings: { onlyJunk: "1" },
    });
    expect(res.status).toBe(400);
  });
});
