import { CompatLayerId } from "./compat-layers";

export enum EngineOriginKind {
  Core = "core",
  Store = "store",
  Compat = "compat",
}

export const ORIGIN_ICON_DIR = "/public/images/origins";

export const CORE_ORIGIN_ICON = "/public/images/degoog-logo.svg";
export const STORE_ORIGIN_GLYPH = "fa-store";

export const COMPAT_ORIGIN_ICONS: Readonly<Record<CompatLayerId, string>> =
  Object.freeze({
    [CompatLayerId.Searx]: `${ORIGIN_ICON_DIR}/searx.png`,
    [CompatLayerId.FourGet]: `${ORIGIN_ICON_DIR}/4get.png`,
  });

export const CORE_ORIGIN_LABEL = "Degoog";

export interface EngineOrigin {
  kind: EngineOriginKind;
  label: string;
  icon?: string;
  glyph?: string;
}
