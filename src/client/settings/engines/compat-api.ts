import { authHeaders, jsonHeaders } from "../../utils/request";
import { getBase } from "../../utils/base-url";
import { getStoredToken } from "../../utils/settings-token";
import type { CompatCatalogItem } from "../../types/compat-catalog";
import {
  CompatAction,
  CompatLayerId,
  compatApiUrl,
} from "../../../shared/compat-layers";

export { CompatAction, CompatLayerId };

export interface CompatLayerView {
  id: CompatLayerId;
  label: string;
  settingKey: string;
  noteKeys: readonly string[];
}

export const COMPAT_LAYER_VIEWS: readonly CompatLayerView[] = Object.freeze([
  {
    id: CompatLayerId.Searx,
    label: "SearX",
    settingKey: "searxCompatEnabled",
    noteKeys: Object.freeze([
      "searx-note-native",
      "searx-note-upstream",
      "searx-note-filters",
      "searx-note-shared",
    ]),
  },
  {
    id: CompatLayerId.FourGet,
    label: "4get",
    settingKey: "fourgetCompatEnabled",
    noteKeys: Object.freeze([
      "4get-note-native",
      "4get-note-upstream",
      "4get-note-php",
      "4get-note-shared",
    ]),
  },
]);

export const enabledLayers = async (): Promise<CompatLayerView[]> => {
  try {
    const res = await fetch(`${getBase()}/api/settings/general`, {
      headers: authHeaders(getStoredToken),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Record<string, boolean | string>;
    return COMPAT_LAYER_VIEWS.filter((layer) => {
      const value = data[layer.settingKey];
      return value === true || value === "true";
    });
  } catch (err) {
    console.warn("[settings] compatibility layer flags load failed", err);
    return [];
  }
};

export const fetchCompat = async (
  layer: CompatLayerId,
): Promise<CompatCatalogItem[]> => {
  const res = await fetch(`${getBase()}${compatApiUrl(layer, "engines")}`, {
    headers: authHeaders(getStoredToken),
  });
  if (!res.ok) throw new Error(`Failed to load the ${layer} catalogue`);
  const data = (await res.json()) as { engines?: CompatCatalogItem[] };
  return data.engines ?? [];
};

export const sendCompat = async (
  layer: CompatLayerId,
  action: CompatAction,
  code: string,
): Promise<void> => {
  const res = await fetch(`${getBase()}${compatApiUrl(layer, action)}`, {
    method: "POST",
    headers: jsonHeaders(getStoredToken),
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `${layer} ${action} failed`);
  }
};
