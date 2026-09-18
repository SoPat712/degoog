import { escapeHtml } from "../../utils/dom";
import { typeLabel } from "./type-label";
import type {
  CompatCatalogGroup,
  CompatCatalogItem,
} from "../../types/compat-catalog";

const t = window.scopedT("core");

const WEB_TYPE = "web";

const KEY = "settings-page.extensions.";

export const compatFilter = (
  items: CompatCatalogItem[],
  query: string,
): CompatCatalogItem[] => {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter(
    (item) =>
      item.name.toLowerCase().includes(needle) ||
      item.code.toLowerCase().includes(needle),
  );
};

export const compatGroups = (items: CompatCatalogItem[]): CompatCatalogGroup[] => {
  const map = new Map<string, CompatCatalogItem[]>();
  for (const item of items) {
    const key = (item.types[0] ?? WEB_TYPE).toLowerCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return [...map.keys()]
    .sort((a, b) => {
      if (a === WEB_TYPE) return -1;
      if (b === WEB_TYPE) return 1;
      return a.localeCompare(b);
    })
    .map((key) => ({
      key,
      label: typeLabel(key),
      items: (map.get(key) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    }));
};

export const compatPackages = (item: CompatCatalogItem): string[] =>
  item.runtime.filter((need) => need.missing).map((need) => need.package);

const _host = (site: string | undefined): string => {
  if (!site) return "";
  try {
    return new URL(site).hostname;
  } catch {
    return "";
  }
};

const _icon = (item: CompatCatalogItem): string => {
  const letter = escapeHtml((item.name[0] ?? "?").toUpperCase());
  const host = _host(item.site);
  if (!host) {
    return `<span class="degoog-result--favicon result-favicon-fallback" aria-hidden="true">${letter}</span>`;
  }
  return `<img class="degoog-result--favicon compat-favicon" alt="" loading="lazy" data-favicon-host="${escapeHtml(host)}" data-favicon-letter="${letter}">`;
};

const _missingDot = (): string =>
  `<span class="ext-needs-config-badge" data-tooltip="${escapeHtml(t(`${KEY}compat-missing`))}" data-tooltip-below data-tooltip-end></span>`;

const _metaRow = (
  label: string,
  value: string,
  hint: string,
  missing = false,
): string => `
  <span class="ext-card-desc"><strong class="compat-meta-key" data-tooltip="${escapeHtml(hint)}" data-tooltip-below data-tooltip-start>${escapeHtml(label)}</strong>: ${escapeHtml(value)}${missing ? _missingDot() : ""}</span>`;

const _typesRow = (item: CompatCatalogItem): string => {
  const primary = (item.types[0] ?? WEB_TYPE).toLowerCase();
  const extras = item.types.filter((type) => type.toLowerCase() !== primary);
  if (!extras.length) return "";
  const labels = extras.map((type) => typeLabel(type.toLowerCase()));
  return _metaRow(
    t(`${KEY}compat-types-label`),
    labels.join(", "),
    t(`${KEY}compat-types-hint`),
  );
};

const _runtimeRow = (item: CompatCatalogItem): string => {
  if (!item.runtime.length) return "";
  return _metaRow(
    t(`${KEY}compat-runtime-label`),
    item.runtime.map((need) => need.module).join(", "),
    t(`${KEY}compat-runtime-hint`),
    compatPackages(item).length > 0,
  );
};

const _sharedRow = (item: CompatCatalogItem): string => {
  const deps = item.deps ?? [];
  if (!deps.length) return "";
  return _metaRow(
    t(`${KEY}compat-shared-label`),
    deps.join(", "),
    t(`${KEY}compat-shared-hint`),
  );
};

const _notesRow = (item: CompatCatalogItem): string => {
  const notes = item.notes ?? [];
  if (!notes.length) return "";
  return _metaRow(
    t(`${KEY}compat-notes-label`),
    notes.map((note) => t(`${KEY}compat-note-${note}`)).join(", "),
    t(`${KEY}compat-notes-hint`),
  );
};

const _updateBtn = (item: CompatCatalogItem): string => {
  if (!item.installed) return "";
  const label = t(`${KEY}compat-update`);
  return `<button class="degoog-icon-btn degoog-icon-btn--padded compat-btn-update" type="button" data-code="${escapeHtml(item.code)}" data-tooltip="${escapeHtml(label)}" data-tooltip-below data-tooltip-end aria-label="${escapeHtml(label)}"><i class="fa-solid fa-arrows-rotate"></i></button>`;
};

const _card = (item: CompatCatalogItem): string => {
  const action = item.installed
    ? `<button class="btn btn--secondary degoog-btn degoog-btn--secondary degoog-btn--block compat-btn-uninstall" type="button" data-code="${escapeHtml(item.code)}">${escapeHtml(t(`${KEY}compat-uninstall`))}</button>`
    : `<button class="btn btn--primary degoog-btn degoog-btn--primary degoog-btn--block compat-btn-install" type="button" data-code="${escapeHtml(item.code)}">${escapeHtml(t(`${KEY}compat-install`))}</button>`;
  const installed = item.installed
    ? `<span class="ext-configured-badge" data-tooltip="${escapeHtml(t(`${KEY}compat-installed`))}" data-tooltip-below data-tooltip-end></span>`
    : "";
  const meta = `${_typesRow(item)}${_runtimeRow(item)}${_sharedRow(item)}${_notesRow(item)}`;
  return `
    <div class="col-12 col-sm-6 col-md-4 ext-card degoog-panel degoog-panel--ext-card degoog-panel--in-modal degoog-vstack degoog-vstack--lg degoog-vstack--fill" data-code="${escapeHtml(item.code)}">
      <div class="ext-card-main">
        <div class="ext-card-info">
          <div class="ext-card-name-row">
            ${_icon(item)}
            <span class="ext-card-name ext-card-name--lg">${escapeHtml(item.name)}</span>
          </div>
        </div>
        <div class="ext-card-actions">${installed}${_updateBtn(item)}</div>
      </div>
      ${meta ? `<div class="degoog-vstack degoog-vstack--sm degoog-vstack--meta">${meta}</div>` : ""}
      ${action}
    </div>`;
};

export const compatListHtml = (items: CompatCatalogItem[]): string => {
  if (!items.length) {
    return `<p class="ext-field-desc">${escapeHtml(t(`${KEY}compat-empty`))}</p>`;
  }
  return compatGroups(items)
    .map(
      (group) => `
      <section class="ext-group">
        <h3 class="ext-group-label">${escapeHtml(group.label)}</h3>
        <div class="degoog-grid">${group.items.map(_card).join("")}</div>
      </section>`,
    )
    .join("");
};

export const compatShellHtml = (): string => `
  <input type="text" class="store-search-input degoog-search-bar degoog-search-bar--square-advanced" id="compat-search-input" placeholder="${escapeHtml(t(`${KEY}compat-search`))}" autocomplete="off">
  <div class="ext-modal-status compat-status" id="compat-status" role="status"></div>
  <div id="compat-list"></div>`;
