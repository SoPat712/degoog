import { getBase } from "../../utils/base-url";
import { authHeaders, jsonHeaders } from "../../utils/request";
import { confirmModal } from "../../modules/modals/confirm-modal/confirm";
import { initFileUpload } from "../../utils/file-upload";
import { flashError, flashSuccess } from "../shared/flash-msg";
import { MAX_SETTINGS_BACKUP_BYTES } from "../../../shared/settings-backup";

const t = window.scopedT("core");

const MAX_BACKUP_BYTES = MAX_SETTINGS_BACKUP_BYTES;
const REVOKE_DELAY_MS = 60_000;
const RELOAD_DELAY_MS = 900;
const JSON_TYPE = "application/json";

type BackupKind = "export" | "import";
type ImportResponse = {
  applied?: number;
  reposAdded?: number;
  extensionsInstalled?: number;
  error?: string;
};

const _status = (kind: BackupKind, text: string): void => {
  const el = document.getElementById(`settings-backup-${kind}-status`);
  if (el) el.textContent = text;
};

const _fail = (kind: BackupKind, messageKey: string, statusText?: string): void => {
  _status(kind, statusText ?? t(messageKey));
  flashError(t(messageKey));
};

const _fallbackFilename = (): string =>
  `degoog-settings-${new Date().toISOString().slice(0, 10)}.json`;

// RFC 5987 filename* wins; quoted filename is the ASCII fallback.
const _filenameFrom = (disposition: string | null, fallback: string): string => {
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      /* fall through to the plain filename */
    }
  }
  return disposition?.match(/filename="([^"]+)"/i)?.[1] ?? fallback;
};

// Revoking straight away cancels the download.
const _saveBlob = (blob: Blob, filename: string): void => {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(href);
  }, REVOKE_DELAY_MS);
};

const _bindExport = (getToken: () => string | null): void => {
  const btn = document.getElementById(
    "settings-backup-export",
  ) as HTMLButtonElement | null;
  if (!btn) return;

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    _status("export", t("settings-page.server.backup.exporting"));
    try {
      const res = await fetch(`${getBase()}/api/settings/export`, {
        headers: authHeaders(getToken),
      });
      if (!res.ok) throw new Error(`export failed: ${res.status}`);
      const blob = await res.blob();
      const filename = _filenameFrom(
        res.headers.get("Content-Disposition"),
        _fallbackFilename(),
      );
      _saveBlob(
        blob.type ? blob : new Blob([blob], { type: JSON_TYPE }),
        filename,
      );
      _status("export", t("settings-page.server.backup.exported"));
      flashSuccess(t("settings-page.server.backup.exported"));
    } catch (err) {
      console.warn("[settings] settings export failed", err);
      _fail("export", "settings-page.server.backup.export-failed");
    } finally {
      btn.disabled = false;
    }
  });
};

const _parseBackup = async (file: File): Promise<object | null> => {
  if (file.size > MAX_BACKUP_BYTES) return null;
  try {
    const parsed: unknown = JSON.parse(await file.text());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    return parsed;
  } catch (err) {
    console.debug("[settings] backup file is not JSON", err);
    return null;
  }
};

const _importedText = (data: ImportResponse): string => {
  const count = String(data.applied ?? 0);
  const repos = data.reposAdded ?? 0;
  const extensions = data.extensionsInstalled ?? 0;
  if (!repos && !extensions)
    return t("settings-page.server.backup.imported", { count });
  return t("settings-page.server.backup.imported-extensions", {
    count,
    repos: String(repos),
    extensions: String(extensions),
  });
};

const _bindImport = (getToken: () => string | null): void => {
  const panel = document.getElementById("settings-server-backup");
  const btn = document.getElementById(
    "settings-backup-import",
  ) as HTMLButtonElement | null;
  if (!panel || !btn) return;

  const upload = initFileUpload(panel, (file) => {
    btn.disabled = !file;
    _status("import", "");
  });
  if (!upload) return;

  btn.addEventListener("click", async () => {
    const file = upload.file();
    if (!file) return;

    const backup = await _parseBackup(file);
    if (!backup) {
      _fail("import", "settings-page.server.backup.import-invalid");
      return;
    }

    const confirmed = await confirmModal({
      title: t("settings-page.server.backup.import-button"),
      message: t("settings-page.server.backup.import-confirm"),
    });
    if (!confirmed) return;

    btn.disabled = true;
    _status("import", t("settings-page.server.backup.importing"));
    try {
      const res = await fetch(`${getBase()}/api/settings/import`, {
        method: "POST",
        headers: jsonHeaders(getToken),
        body: JSON.stringify(backup),
      });
      const data = (await res.json().catch(() => ({}))) as ImportResponse;
      if (!res.ok) {
        _fail("import", "settings-page.server.backup.import-failed", data.error);
        return;
      }
      upload.reset();
      _status("import", _importedText(data));
      flashSuccess(t("settings-page.server.backup.imported-reloading"));
      // Server is live this page still has its old CSS, theme and fields.
      setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
    } catch (err) {
      console.warn("[settings] settings import failed", err);
      _fail("import", "settings-page.server.backup.import-failed");
    } finally {
      // Success resets the picker, so the button re-disables.
      btn.disabled = !upload.file();
    }
  });
};

export const initBackupControls = (getToken: () => string | null): void => {
  _bindExport(getToken);
  _bindImport(getToken);
};
