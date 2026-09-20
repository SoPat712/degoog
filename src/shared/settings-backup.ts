export const BACKUP_KIND = "degoog-settings";
export const BACKUP_VERSION = 1;
export const MIN_BACKUP_VERSION = 1;

export const MAX_SETTINGS_BACKUP_BYTES = 8_000_000;
export const MAX_SHORTCUT_SOURCE_BYTES = 64_000;

export enum BackupError {
  TooLarge = "too-large",
  InvalidJson = "invalid-json",
  Unrecognised = "unrecognised",
  Empty = "empty",
  WriteFailed = "write-failed",
}

export enum BackupStage {
  Settings = "settings",
  Extensions = "extensions",
  Aliases = "aliases",
  Shortcuts = "shortcuts",
}

export const weigh = (text: string): number =>
  new TextEncoder().encode(text).byteLength;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
