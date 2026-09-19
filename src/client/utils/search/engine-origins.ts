import type { EngineOrigin } from "../../../shared/engine-origins";
import { escapeAttribute } from "../dom";
import { getRegistry } from "../engines";
import { onWindowEvent } from "../window-event";

const t = window.scopedT("themes/degoog");

const PAINTED_FLAG = "true";

let _origins: Map<string, EngineOrigin> | null = null;
let _inflight: Promise<Map<string, EngineOrigin>> | null = null;

onWindowEvent("extensions-saved", () => {
  _origins = null;
  _inflight = null;
});

const _byName = async (): Promise<Map<string, EngineOrigin>> => {
  if (_origins) return _origins;
  if (!_inflight) {
    _inflight = getRegistry()
      .then((registry) => {
        const map = new Map<string, EngineOrigin>();
        registry.engines.forEach((engine) => {
          if (engine.origin) map.set(engine.displayName.toLowerCase(), engine.origin);
        });
        _origins = map;
        _inflight = null;
        return map;
      })
      .catch((err) => {
        console.warn("[origins] engine registry lookup failed", err);
        _inflight = null;
        return new Map<string, EngineOrigin>();
      });
  }
  return _inflight;
};

export const originSlot = (engineName: string): string =>
  `<span class="engine-origin" data-engine="${escapeAttribute(engineName)}"></span>`;

const _glyph = (origin: EngineOrigin): HTMLElement => {
  const glyph = document.createElement("i");
  glyph.className = `fa-solid ${origin.glyph} engine-origin-glyph`;
  return glyph;
};

const _image = (slot: HTMLElement, origin: EngineOrigin): HTMLElement => {
  const icon = document.createElement("img");
  icon.className = "engine-origin-icon";
  icon.src = origin.icon ?? "";
  icon.alt = "";
  icon.loading = "lazy";
  icon.addEventListener("error", () => slot.remove());
  return icon;
};

const _paintOne = (slot: HTMLElement, origin: EngineOrigin): void => {
  const label = t("search-templates.sidebar.engine-origin", {
    source: origin.label,
  });
  slot.title = label;
  slot.setAttribute("aria-label", label);
  slot.replaceChildren(origin.icon ? _image(slot, origin) : _glyph(origin));
};

export const paintOrigins = async (root: HTMLElement): Promise<void> => {
  const slots = Array.from(
    root.querySelectorAll<HTMLElement>(".engine-origin:not([data-painted])"),
  );
  if (slots.length === 0) return;
  const origins = await _byName();
  slots.forEach((slot) => {
    const origin = origins.get((slot.dataset.engine ?? "").toLowerCase());
    if (!origin || (!origin.icon && !origin.glyph)) return;
    slot.dataset.painted = PAINTED_FLAG;
    _paintOne(slot, origin);
  });
};
