import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import backupRouter from "../../src/server/routes/settings-backup";
import {
  clearServerSettingsCache,
  getInstanceSettings,
  updateInstanceSettings,
} from "../../src/server/utils/server-settings";
import { readDomainLists } from "../../src/server/utils/domain-lists";
import { clearPluginSettingsCache } from "../../src/server/utils/plugin-settings";

type ExportBody = {
  kind: string;
  version: number;
  settings: Record<string, string>;
  extensions: {
    repos: string[];
    installed: { repoUrl: string; type: string; itemPath: string }[];
    settings: Record<string, Record<string, unknown>>;
    defaultEngines: Record<string, boolean>;
  };
};

// Import writes every list field, so isolate the shared indexer paths too.
const ISOLATED_ENV = [
  "DEGOOG_DATA_DIR",
  "DEGOOG_SERVER_SETTINGS_FILE",
  "DEGOOG_INDEXER_DIR",
  "DEGOOG_INDEXER_CONFIG_FILE",
  "DEGOOG_SEARCH_LISTS_FILE",
  "DEGOOG_PLUGIN_SETTINGS_FILE",
  "DEGOOG_DEFAULT_ENGINES_FILE",
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

const REPO_URL = "https://example.invalid/degoog/extensions.git";

const seedInstance = (): void => {
  writeFileSync(
    join(tempDir, "repos.json"),
    JSON.stringify({
      repos: [{ url: REPO_URL, localPath: "example-extensions" }],
      installed: [
        {
          repoUrl: REPO_URL,
          type: "plugin",
          itemPath: "plugins/define",
          installedAs: "example-extensions-define",
          installedAt: "2026-01-01T00:00:00.000Z",
          version: "1.0.0",
        },
      ],
    }),
  );
  writeFileSync(
    join(tempDir, "plugin-settings.json"),
    JSON.stringify({ "example-slot": { priority: "3" }, __schemaVersion: 1 }),
  );
  writeFileSync(
    join(tempDir, "default-engines.json"),
    JSON.stringify({ "example-engine": false }),
  );
  clearPluginSettingsCache();
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
    DEGOOG_PLUGIN_SETTINGS_FILE: join(tempDir, "plugin-settings.json"),
    DEGOOG_DEFAULT_ENGINES_FILE: join(tempDir, "default-engines.json"),
    DEGOOG_DANGEROUSLY_NO_PASSWORD: "true",
  });
  clearServerSettingsCache();
  clearPluginSettingsCache();
});

afterEach(() => {
  clearServerSettingsCache();
  clearPluginSettingsCache();
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

    // Check the store directly; exportSettings() would filter the key too.
    const stored = await getInstanceSettings();
    expect(stored).not.toHaveProperty("somethingElse");
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

  test("export carries repos, installed items, extension settings and engine toggles", async () => {
    seedInstance();

    const { extensions } = await exportSettings();

    expect(extensions.repos).toEqual([REPO_URL]);
    expect(extensions.installed).toEqual([
      { repoUrl: REPO_URL, type: "plugin", itemPath: "plugins/define" },
    ]);
    expect(extensions.settings["example-slot"]).toEqual({ priority: "3" });
    expect(extensions.settings).not.toHaveProperty("__schemaVersion");
    expect(extensions.defaultEngines).toEqual({ "example-engine": false });
  });

  test("import restores extension settings and engine toggles", async () => {
    seedInstance();

    const res = await importBackup({
      kind: "degoog-settings",
      version: 2,
      settings: {},
      extensions: {
        repos: [REPO_URL],
        installed: [
          { repoUrl: REPO_URL, type: "plugin", itemPath: "plugins/missing" },
        ],
        settings: { "example-slot": { priority: "9" }, __schemaVersion: {} },
        defaultEngines: { "example-engine": true, bogus: "yes" },
      },
    });

    expect(res.status).toBe(200);
    // The repo is already listed, so nothing is cloned; the item is not on disk, so it fails.
    expect(await res.json()).toMatchObject({
      reposAdded: 0,
      extensionsInstalled: 0,
      extensionsFailed: ["plugins/missing"],
    });

    const { extensions } = await exportSettings();
    expect(extensions.settings["example-slot"]).toEqual({ priority: "9" });
    expect(extensions.settings).not.toHaveProperty("__schemaVersion");
    expect(extensions.defaultEngines).toEqual({ "example-engine": true });
  });

  test("an empty engine map clears the overrides, an absent one leaves them", async () => {
    seedInstance();
    const withExtensions = (defaultEngines: unknown): unknown => ({
      kind: "degoog-settings",
      version: 2,
      settings: { acDebounceMs: "120" },
      extensions: { repos: [], installed: [], settings: {}, defaultEngines },
    });

    expect((await importBackup(withExtensions(undefined))).status).toBe(200);
    expect((await exportSettings()).extensions.defaultEngines).toEqual({
      "example-engine": false,
    });

    expect((await importBackup(withExtensions({}))).status).toBe(200);
    expect((await exportSettings()).extensions.defaultEngines).toEqual({});
  });

  test("import drops extension entries with an unknown type", async () => {
    seedInstance();

    const res = await importBackup({
      kind: "degoog-settings",
      version: 2,
      settings: { acDebounceMs: "120" },
      extensions: {
        repos: [REPO_URL],
        installed: [
          { repoUrl: REPO_URL, type: "malware", itemPath: "plugins/nope" },
        ],
        settings: {},
        defaultEngines: {},
      },
    });

    expect(await res.json()).toMatchObject({ extensionsFailed: [] });
  });

  test("a version 1 backup with no extensions block still imports", async () => {
    const res = await importBackup({
      kind: "degoog-settings",
      version: 1,
      settings: { acDebounceMs: "300" },
    });

    expect(res.status).toBe(200);
    expect((await exportSettings()).settings.acDebounceMs).toBe("300");
  });
});
